const { test, expect } = require('@playwright/test');

// Opt-in because these checks create and cancel real test reservations.
test.skip(process.env.RUN_OWNER_LIVE !== '1', 'Set RUN_OWNER_LIVE=1 for disposable reservations on the test deployment.');

test('@level3 owner deletion validates membership and the last guest', async ({ page, request }) => {
  test.setTimeout(180000);
  const base = process.env.API_BASE_URL;
  if (!base || !process.env.BASE_URL) throw new Error('BASE_URL and API_BASE_URL are required');
  await page.goto('/login');
  await page.getByRole('button', { name: 'Увійти', exact: true }).click();
  if (process.env.OWNER_EMAIL && process.env.OWNER_PASSWORD) {
    await page.locator('input[name="username"]').fill(process.env.OWNER_EMAIL);
    await page.locator('input[name="password"]').fill(process.env.OWNER_PASSWORD);
    await page.locator('input[name="password"]').press('Enter');
  }
  await page.waitForURL(url => url.origin === process.env.BASE_URL && !url.pathname.startsWith('/auth/'), { timeout: 120000 });
  const token = await page.evaluate(() => JSON.parse(localStorage.getItem('auth') || '{}').idToken);
  if (!token) throw new Error('Owner login did not produce an ID token');
  const auth = { Authorization: `Bearer ${token}` };
  const reservations = [];
  try {
    const tablesResponse = await request.get(`${base}/available-tables?capacity=2`);
    expect(tablesResponse.ok()).toBeTruthy();
    const tables = await tablesResponse.json();
    const table = tables.find(item => item.capacity >= 2);
    expect(table).toBeTruthy();
    // Distinct future slots avoid overlap between the two groups.
    for (let i = 0; i < 2; i++) {
      let booking;
      for (let attempt = 0; attempt < 12; attempt++) {
        const start = new Date(Date.now() + (48 + i * 4 + attempt * 24) * 3600000);
        const end = new Date(start.getTime() + 3600000);
        const response = await request.post(`${base}/reservations`, { headers: auth, data: {
          tableId: table.id, startTime: start.toISOString(), endTime: end.toISOString(), guestCount: 2,
        }});
        if (response.status() === 409) continue;
        expect(response.status()).toBe(201);
        booking = await response.json();
        reservations.push(booking.id);
        break;
      }
      if (!booking) throw new Error('No available test slot found');
    }
    const groups = [];
    for (const id of reservations) {
      const inviteResponse = await request.get(`${base}/reservations/${id}/invite-token`, { headers: auth });
      expect(inviteResponse.status()).toBe(200);
      const { token: inviteToken } = await inviteResponse.json();
      const details = await request.get(`${base}/guest/invites/${inviteToken}`);
      expect(details.status()).toBe(200);
      const group = (await details.json()).GroupReservationId;
      const draft = await request.post(`${base}/guest/orders/`, { data: {
        inviteToken, guestName: `AQA ${crypto.randomUUID()}`, email: 'automation@example.invalid',
      }});
      expect(draft.status()).toBe(201);
      groups.push({ group, guest: (await draft.json()).orderId });
    }
    const route = id => `${base}/guest/groups/${groups[0].group}/sessions/${id}`;
    expect((await request.delete(route(groups[1].guest), { headers: auth })).status()).toBe(400);
    expect((await request.delete(route(`missing-${crypto.randomUUID()}`), { headers: auth })).status()).toBe(404);
    expect([401, 403]).toContain((await request.delete(route(groups[0].guest))).status());
    const deleted = await request.delete(route(groups[0].guest), { headers: auth });
    expect(deleted.status()).toBe(200);
    const snapshot = await deleted.json();
    expect(snapshot.participants.some(person => person.id === groups[0].guest)).toBeFalsy();
    expect(snapshot.participants.filter(person => person.type === 'Guest')).toHaveLength(0);
    expect(snapshot.total).toBe(0);
    const other = await request.get(`${base}/guest/groups/${groups[1].group}/sessions`, { headers: auth });
    expect(other.status()).toBe(200);
    expect((await other.json()).participants.some(person => person.id === groups[1].guest)).toBeTruthy();
  } finally {
    const cleanupFailures = [];
    for (const id of reservations) {
      try {
        const response = await request.delete(`${base}/reservations`, { headers: auth, data: { id } });
        if (!response.ok()) cleanupFailures.push(`${id}: HTTP ${response.status()}`);
      } catch {
        cleanupFailures.push(`${id}: request failed`);
      }
    }
    if (cleanupFailures.length) throw new Error(`Test reservation cleanup failed: ${cleanupFailures.join(', ')}`);
  }
});
