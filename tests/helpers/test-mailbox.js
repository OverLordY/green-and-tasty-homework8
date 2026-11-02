const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

function selectConfirmationLink(text, orderId, expectedOrigin) {
  const candidates = (text || '').match(/https:\/\/[^\s<>]+/g) || [];
  for (const candidate of candidates) {
    let url;
    try { url = new URL(candidate); } catch { continue; }
    const fragment = new URLSearchParams(url.hash.slice(1));
    if (url.origin === expectedOrigin && url.pathname === '/guest-confirmation'
        && fragment.get('order') === orderId && fragment.get('token')) return url.toString();
  }
  return null;
}

// Inspect recent message envelopes first; download only confirmation messages.
// Never log message bodies, links or authentication tokens.
async function waitForConfirmationLink({ orderId, expectedOrigin, since, timeoutMs = 180000 }) {
  if (!process.env.GUEST_EMAIL || !process.env.GMAIL_APP_PASSWORD) throw new Error('Guest mailbox credentials are missing');
  const client = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true,
    auth: { user: process.env.GUEST_EMAIL.trim(), pass: process.env.GMAIL_APP_PASSWORD.replace(/\s/g, '') }, logger: false,
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000 });
  client.on('error', () => {});
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX', { readOnly: true });
    try {
      const end = Date.now() + timeoutMs;
      let maxCandidates = 0;
      let exactSubjects = 0;
      while (Date.now() < end) {
        // Gmail can store MIME-encoded non-ASCII subjects, so server-side SUBJECT
        // searches need not match their decoded appearance in the inbox.
        const ids = await client.search({ all: true }, { uid: true });
        maxCandidates = Math.max(maxCandidates, (ids || []).length);
        for (const uid of (ids || []).slice(-50).reverse()) {
          const header = await client.fetchOne(uid, { envelope: true }, { uid: true });
          if (header?.envelope?.subject !== 'Підтвердження замовлення Green & Tasty') continue;
          exactSubjects++;
          const message = await client.fetchOne(uid, { source: true }, { uid: true });
          if (!message?.source) continue;
          const parsed = await simpleParser(message.source);
          if (parsed.subject !== 'Підтвердження замовлення Green & Tasty') continue;
          const link = selectConfirmationLink(parsed.text, orderId, expectedOrigin);
          if (link) return link;
        }
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      throw new Error(`Confirmation email not matched (candidates: ${maxCandidates}, matching subjects: ${exactSubjects})`);
    } finally { lock.release(); }
  } catch (error) {
    if (error.message.startsWith('Confirmation email not matched')) throw error;
    // Avoid leaking provider responses or message content into public CI logs.
    const code = typeof error.code === 'string' && /^[A-Z0-9_]{1,32}$/.test(error.code) ? error.code : 'UNKNOWN';
    const reason = error.authenticationFailed ? 'AUTHENTICATION' : code;
    throw new Error(`Could not read the test mailbox (${reason}); check Gmail app password and IMAP access`);
  } finally { try { await client.logout(); } catch { client.close(); } }
}

module.exports = { waitForConfirmationLink, selectConfirmationLink };
