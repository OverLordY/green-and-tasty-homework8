const { test, expect } = require('@playwright/test');

// Submitted reservations cannot be cancelled through the application.
test.skip(process.env.RUN_SUBMIT_LIVE !== '1', 'Opt in to create a persistent, uniquely timed test reservation.');

test('@level3 owner submits and waiter sees only confirmed dishes', async ({ browser, request }) => {
  test.setTimeout(600000);
  const base = process.env.API_BASE_URL;
  if (!base || !process.env.BASE_URL) throw new Error('BASE_URL and API_BASE_URL are required');
  async function login(role) {
    const context = await browser.newContext({ baseURL: process.env.BASE_URL });
    const page = await context.newPage();
    await page.goto('/login');
    await page.getByRole('button', { name: 'Увійти', exact: true }).click();
    const email = process.env[`${role}_EMAIL`], password = process.env[`${role}_PASSWORD`];
    if (email && password) {
      await page.locator('input[name="username"]').fill(email);
      await page.locator('input[name="password"]').fill(password);
      await page.locator('input[name="password"]').press('Enter');
    } else {
      console.log(`WAIT_FOR_${role}_LOGIN`);
    }
    await page.waitForURL(url => url.origin === process.env.BASE_URL && !url.pathname.startsWith('/auth/'), { timeout: 240000 });
    const token = await page.evaluate(() => JSON.parse(localStorage.getItem('auth') || '{}').idToken);
    if (!token) throw new Error(`${role} login did not produce an ID token`);
    return { page, context, auth: { Authorization: `Bearer ${token}` } };
  }
  const owner = await login('OWNER');
  let id, submitted = false;
  try {
    const locations = await (await request.get(`${base}/locations`)).json();
    const location = locations.find(item => item.address === '9 Abashidze Street');
    expect(location).toBeTruthy();
    const tables = await (await request.get(`${base}/available-tables?capacity=2&locationId=${encodeURIComponent(location.id)}`)).json();
    const table = tables.find(item => item.capacity >= 2);
    expect(table).toBeTruthy();
    for (let attempt = 0; attempt < 12; attempt++) {
      const start = new Date(Date.now() + (72 + attempt * 24) * 3600000);
      const response = await request.post(`${base}/reservations`, { headers: owner.auth, data: {
        tableId: table.id, startTime: start.toISOString(), endTime: new Date(start.getTime() + 3600000).toISOString(), guestCount: 2,
      }});
      if (response.status() === 409) continue;
      expect(response.status()).toBe(201);
      id = (await response.json()).id;
      break;
    }
    if (!id) throw new Error('No available test slot found');
    const inviteResponse = await request.get(`${base}/reservations/${id}/invite-token`, { headers: owner.auth });
    expect(inviteResponse.status()).toBe(200);
    const inviteToken = (await inviteResponse.json()).token;
    const invite = await (await request.get(`${base}/guest/invites/${inviteToken}`)).json();
    const group = invite.GroupReservationId;
    const menuResponse = await request.get(`${base}/owner/groups/${group}/menu`, { headers: owner.auth });
    expect(menuResponse.status()).toBe(200);
    const dishes = (await menuResponse.json()).items.filter(item => item.available);
    expect(dishes.length).toBeGreaterThanOrEqual(2);
    const ownerDish = dishes[0], pendingDish = dishes.find(item => item.id !== ownerDish.id);
    expect((await request.post(`${base}/owner/groups/${group}/own-order/dishes`, { headers: owner.auth,
      data: { dishId: ownerDish.id, forWhom: 'AQA owner', quantity: 1 } })).status()).toBe(200);
    const guest = await request.post(`${base}/guest/orders/`, { data: {
      inviteToken, guestName: `AQA pending ${crypto.randomUUID()}`, email: 'automation@example.invalid',
    }});
    expect(guest.status()).toBe(201);
    const draft = await guest.json();
    expect((await request.post(`${base}/guest/orders/${draft.orderId}/dishes`, {
      headers: { Authorization: `Bearer ${draft.draftAccessToken}` },
      data: { dishId: pendingDish.id, forWhom: 'AQA pending', quantity: 1 },
    })).status()).toBe(200);
    await owner.page.goto(`/reservations/${id}/group-order`);
    await expect(owner.page.getByText(`${ownerDish.name} × 1`)).toBeVisible();
    await owner.page.getByRole('button', { name: 'Submit Pre-Order' }).click();
    const submission = owner.page.waitForResponse(r => r.url().endsWith(`/group-reservations/${group}/submit`) && r.request().method() === 'POST');
    await owner.page.getByRole('button', { name: 'Submit', exact: true }).click();
    const sent = await submission;
    expect(sent.status()).toBe(200);
    submitted = true;
    expect(await sent.json()).toEqual([{ dishId: ownerDish.id, quantity: 1 }]);
    await expect(owner.page.getByText('Sent to Restaurant').first()).toBeVisible();
    console.log(`PERSISTENT_TEST_RESERVATION=${id}`);
    const waiter = await login('WAITER');
    try {
      await waiter.page.goto(`/restaurant/reservations/${id}/pre-order`);
      await expect(waiter.page.getByRole('heading', { name: 'Спільне замовлення для ресторану' })).toBeVisible();
      await expect(waiter.page.getByText(`${ownerDish.name} × 1`)).toBeVisible();
      await expect(waiter.page.getByText(pendingDish.name)).toHaveCount(0);
      const receipt = await request.get(`${base}/restaurant/reservations/${id}/pre-order`, { headers: waiter.auth });
      expect(receipt.status()).toBe(200);
      expect((await receipt.json()).items.map(item => item.dishId)).toEqual([ownerDish.id]);
    } finally { await waiter.context.close(); }
  } finally {
    if (id && !submitted) {
      const cleanup = await request.delete(`${base}/reservations`, { headers: owner.auth, data: { id } });
      if (!cleanup.ok()) throw new Error(`Cleanup failed for test reservation ${id}: HTTP ${cleanup.status()}`);
    }
    await owner.context.close();
  }
});
