const { test, expect } = require('@playwright/test');
const { ImapFlow } = require('imapflow');

test.skip(process.env.RUN_MAILBOX_CHECK !== '1', 'Opt in to test mailbox connectivity.');
test('test Gmail mailbox accepts read-only IMAP connection', async () => {
  const client = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true,
    auth: { user: (process.env.GUEST_EMAIL || '').trim(), pass: (process.env.GMAIL_APP_PASSWORD || '').replace(/\s/g, '') }, logger: false,
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 15000 });
  client.on('error', () => {});
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX', { readOnly: true });
    try { expect(client.mailbox.readOnly).toBeTruthy(); } finally { lock.release(); }
  } catch (error) {
    const code = typeof error.code === 'string' && /^[A-Z0-9_]{1,32}$/.test(error.code) ? error.code : 'UNKNOWN';
    throw new Error(`Mailbox connection failed (${error.authenticationFailed ? 'AUTHENTICATION' : code})`);
  } finally { try { await client.logout(); } catch { client.close(); } }
});
