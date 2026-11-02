const { test, expect } = require('@playwright/test');
const { waitForConfirmationLink } = require('../helpers/test-mailbox');

test.skip(process.env.RUN_CONFIRMED_GUESTS !== '1', 'Opt in to email-backed live guest testing.');
test.describe.configure({ retries: 0 });

test('@level3 confirmed guests: remove one, submit, verify waiter receipt', async ({ browser, request }) => {
  test.setTimeout(600000);
  const base = process.env.API_BASE_URL, origin = process.env.BASE_URL;
  for (const key of ['OWNER_EMAIL', 'OWNER_PASSWORD', 'WAITER_EMAIL', 'WAITER_PASSWORD', 'GUEST_EMAIL', 'GMAIL_APP_PASSWORD'])
    if (!process.env[key]) throw new Error(`Missing ${key}`);
  if (!base || !origin) throw new Error('Missing application URLs');
  async function login(role) {
    const context = await browser.newContext({ baseURL: origin });
    const page = await context.newPage();
    await page.goto('/login');
    await page.getByRole('button', { name: 'Увійти', exact: true }).click();
    await page.locator('input[name="username"]:visible').fill(process.env[`${role}_EMAIL`]);
    await page.locator('input[name="password"]:visible').fill(process.env[`${role}_PASSWORD`]);
    await page.locator('button[type="submit"]:visible, input[type="submit"]:visible').click();
    await page.waitForURL(url => url.origin === origin && !url.pathname.startsWith('/auth/'), { timeout: 30000 });
    const token = await page.evaluate(() => JSON.parse(localStorage.getItem('auth') || '{}').idToken);
    if (!token) throw new Error(`Could not sign in as ${role}`);
    return { context, page, auth: { Authorization: `Bearer ${token}` } };
  }
  const owner = await login('OWNER');
  let reservationId, submitted = false;
  try {
    const locationsResponse = await request.get(`${base}/locations`);
    expect(locationsResponse.status()).toBe(200);
    const location = (await locationsResponse.json()).find(item => item.address === '9 Abashidze Street');
    expect(location).toBeTruthy();
    const tablesResponse = await request.get(`${base}/available-tables?capacity=3&locationId=${encodeURIComponent(location.id)}`);
    expect(tablesResponse.status()).toBe(200);
    const table = (await tablesResponse.json()).find(item => item.capacity >= 3);
    expect(table).toBeTruthy();
    for (let attempt = 0; attempt < 12; attempt++) {
      const start = new Date(Date.now() + (72 + attempt * 24) * 3600000);
      const response = await request.post(`${base}/reservations`, { headers: owner.auth, data: {
        tableId: table.id, startTime: start.toISOString(), endTime: new Date(start.getTime() + 3600000).toISOString(), guestCount: 3,
      }});
      if (response.status() === 409) continue;
      expect(response.status()).toBe(201);
      reservationId = (await response.json()).id;
      break;
    }
    if (!reservationId) throw new Error('No available test slot found');
    const inviteResponse = await request.get(`${base}/reservations/${reservationId}/invite-token`, { headers: owner.auth });
    expect(inviteResponse.status()).toBe(200);
    const inviteToken = (await inviteResponse.json()).token;
    const inviteResponse2 = await request.get(`${base}/guest/invites/${inviteToken}`);
    expect(inviteResponse2.status()).toBe(200);
    const group = (await inviteResponse2.json()).GroupReservationId;
    const emptyResponse = await request.get(`${base}/guest/groups/${group}/sessions`, { headers: owner.auth });
    expect(emptyResponse.status()).toBe(200);
    const empty = await emptyResponse.json();
    expect(empty.participants.filter(p => p.type === 'Guest')).toHaveLength(0);
    expect(empty.total).toBe(0);
    const missingGroup = await request.get(`${base}/guest/groups/missing-${crypto.randomUUID()}/sessions`, { headers: owner.auth });
    expect(missingGroup.status()).toBe(404);
    const menuResponse = await request.get(`${base}/owner/groups/${group}/menu`, { headers: owner.auth });
    expect(menuResponse.status()).toBe(200);
    const dishes = (await menuResponse.json()).items.filter(item => item.available);
    expect(dishes.length).toBeGreaterThanOrEqual(2);
    const guests = [];
    for (const dish of dishes.slice(0, 2)) {
      const name = `AQA ${crypto.randomUUID()}`;
      const created = await request.post(`${base}/guest/orders/`, { data: { inviteToken, guestName: name, email: process.env.GUEST_EMAIL } });
      expect(created.status()).toBe(201);
      const draft = await created.json();
      const guestAuth = { Authorization: `Bearer ${draft.draftAccessToken}` };
      const guestGroupAccess = await request.get(`${base}/guest/groups/${group}/sessions`, { headers: guestAuth });
      expect([401, 403]).toContain(guestGroupAccess.status());
      const noDishes = await request.get(`${base}/guest/groups/${group}/sessions`, { headers: owner.auth });
      expect(noDishes.status()).toBe(200);
      expect((await noDishes.json()).participants.some(p => p.id === draft.orderId && !p.isSubmitted && p.items.length === 0)).toBeTruthy();
      expect((await request.post(`${base}/guest/orders/${draft.orderId}/dishes`, { headers: guestAuth,
        data: { dishId: dish.id, forWhom: name, quantity: 1 } })).status()).toBe(200);
      const pending = await request.get(`${base}/guest/groups/${group}/sessions`, { headers: owner.auth });
      expect(pending.status()).toBe(200);
      expect((await pending.json()).participants.some(p => p.id === draft.orderId && !p.isSubmitted)).toBeTruthy();
      const since = new Date(Date.now() - 120000);
      expect((await request.post(`${base}/guest/orders/${draft.orderId}/request-confirmation`, { headers: guestAuth })).status()).toBe(202);
      const link = await waitForConfirmationLink({ orderId: draft.orderId, expectedOrigin: origin, since });
      const context = await browser.newContext({ baseURL: origin });
      const page = await context.newPage();
      try {
        try { await page.goto(link); } catch { throw new Error('Could not open the guest confirmation page'); }
        await expect(page.getByText(`${dish.name} × 1`).first()).toBeVisible();
        await page.getByRole('button', { name: 'Підтвердити замовлення' }).click();
        await expect(page.getByRole('heading', { name: 'Моє замовлення' })).toBeVisible();
      } finally { await context.close(); }
      guests.push({ id: draft.orderId, name, dish });
    }
    await owner.page.goto(`/reservations/${reservationId}/group-order`);
    await expect(owner.page.getByRole('heading', { name: `Guest: ${guests[0].name}` })).toBeVisible();
    await expect(owner.page.getByRole('heading', { name: `Guest: ${guests[1].name}` })).toBeVisible();
    const beforeResponse = await request.get(`${base}/guest/groups/${group}/sessions`, { headers: owner.auth });
    expect(beforeResponse.status()).toBe(200);
    const before = await beforeResponse.json();
    expect(before.participants.filter(p => guests.some(g => g.id === p.id) && p.isSubmitted)).toHaveLength(2);
    expect(before.total).toBeCloseTo(guests[0].dish.price + guests[1].dish.price, 2);
    const money = amount => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
    const total = owner.page.locator('.grand-total strong');
    await expect(total).toHaveText(money(before.total));
    for (const guest of guests) {
      const card = owner.page.locator('article.participant-card').filter({ has: owner.page.getByRole('heading', { name: `Guest: ${guest.name}` }) });
      await expect(card.getByText(guest.dish.name, { exact: true })).toBeVisible();
      await expect(card.locator('.status')).toContainText('Підтверджено');
      await expect(card.locator('.subtotal')).toContainText(money(guest.dish.price));
    }
    await owner.page.getByRole('button', { name: `Remove ${guests[0].name}` }).click();
    const deletion = owner.page.waitForResponse(r => r.url().endsWith(`/guest/groups/${group}/sessions/${guests[0].id}`) && r.request().method() === 'DELETE');
    await owner.page.getByRole('button', { name: 'Remove Guest', exact: true }).last().click();
    const removed = await deletion;
    expect(removed.status()).toBe(200);
    const after = await removed.json();
    expect(after.participants.some(p => p.id === guests[0].id)).toBeFalsy();
    expect(after.participants.some(p => p.id === guests[1].id && p.isSubmitted)).toBeTruthy();
    expect(after.total).toBeCloseTo(guests[1].dish.price, 2);
    await expect(total).toHaveText(money(guests[1].dish.price));
    await expect(owner.page.getByRole('heading', { name: `Guest: ${guests[0].name}` })).toHaveCount(0);
    await expect(owner.page.getByRole('heading', { name: `Guest: ${guests[1].name}` })).toBeVisible();
    await expect(owner.page.getByText(`${guests[1].dish.name} × 1`)).toBeVisible();
    await owner.page.getByRole('button', { name: 'Submit Pre-Order' }).click();
    const submitPromise = owner.page.waitForResponse(r => r.url().endsWith(`/group-reservations/${group}/submit`) && r.request().method() === 'POST');
    await owner.page.getByRole('button', { name: 'Submit', exact: true }).click();
    const sent = await submitPromise;
    expect(sent.status()).toBe(200);
    submitted = true;
    expect(await sent.json()).toEqual([{ dishId: guests[1].dish.id, quantity: 1 }]);
    const snapshotResponse = await request.get(`${base}/guest/groups/${group}/sessions`, { headers: owner.auth });
    expect(snapshotResponse.status()).toBe(200);
    const snapshot = await snapshotResponse.json();
    const again = await request.post(`${base}/group-reservations/${group}/submit`, { headers: owner.auth,
      data: { reservationId, expectedVersion: snapshot.version } });
    expect([400, 409]).toContain(again.status());
    console.log(`PERSISTENT_TEST_RESERVATION=${reservationId}`);
    const waiter = await login('WAITER');
    try {
      await waiter.page.goto(`/restaurant/reservations/${reservationId}/pre-order`);
      await expect(waiter.page.getByText(`${guests[1].dish.name} × 1`)).toBeVisible();
      await expect(waiter.page.getByText(guests[0].dish.name)).toHaveCount(0);
      const receipt = await request.get(`${base}/restaurant/reservations/${reservationId}/pre-order`, { headers: waiter.auth });
      expect(receipt.status()).toBe(200);
      expect((await receipt.json()).items.map(item => item.dishId)).toEqual([guests[1].dish.id]);
      const forbidden = await request.delete(`${base}/guest/groups/${group}/sessions/${guests[1].id}`, { headers: waiter.auth });
      expect(forbidden.status()).toBe(403);
      expect((await request.get(`${base}/guest/groups/${group}/sessions`, { headers: waiter.auth })).status()).toBe(403);
      const waiterSubmit = await request.post(`${base}/group-reservations/${group}/submit`, { headers: waiter.auth,
        data: { reservationId, expectedVersion: snapshot.version } });
      expect(waiterSubmit.status()).toBe(403);
    } finally { await waiter.context.close(); }
  } catch (error) {
    // Capture only the owner group screen: never capture authentication or guest links.
    if (/\/reservations\/[^/]+\/group-order$/.test(new URL(owner.page.url()).pathname)) {
      try { await test.info().attach('owner-group-failure', { body: await owner.page.screenshot({ timeout: 5000 }), contentType: 'image/png' }); } catch { /* preserve original failure */ }
    }
    throw error;
  } finally {
    if (reservationId && !submitted) {
      const cleanup = await request.delete(`${base}/reservations`, { headers: owner.auth, data: { id: reservationId } });
      if (!cleanup.ok()) throw new Error(`Cleanup failed for test reservation ${reservationId}: HTTP ${cleanup.status()}`);
    }
    await owner.context.close();
  }
});
