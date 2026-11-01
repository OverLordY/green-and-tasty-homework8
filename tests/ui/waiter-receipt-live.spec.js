const { test, expect } = require('@playwright/test');

test.skip(!process.env.EXISTING_TEST_RESERVATION, 'Set an existing submitted test reservation id.');

test('waiter sees the submitted test receipt', async ({ page, request }) => {
  test.setTimeout(300000);
  const base = process.env.API_BASE_URL, id = process.env.EXISTING_TEST_RESERVATION;
  if (!base || !process.env.BASE_URL) throw new Error('BASE_URL and API_BASE_URL are required');
  await page.goto('/login');
  await page.getByRole('button', { name: 'Увійти', exact: true }).click();
  console.log('WAIT_FOR_WAITER_LOGIN');
  await page.waitForURL(url => url.origin === process.env.BASE_URL && !url.pathname.startsWith('/auth/'), { timeout: 240000 });
  const token = await page.evaluate(() => JSON.parse(localStorage.getItem('auth') || '{}').idToken);
  if (!token) throw new Error('Waiter login did not produce an ID token');
  const receipt = await request.get(`${base}/restaurant/reservations/${id}/pre-order`, { headers: { Authorization: `Bearer ${token}` } });
  expect(receipt.status()).toBe(200);
  const data = await receipt.json();
  expect(data.items).toHaveLength(1);
  expect(data.items[0].quantity).toBe(1);
  await page.goto(`/restaurant/reservations/${id}/pre-order`);
  await expect(page.getByRole('heading', { name: 'Спільне замовлення для ресторану' })).toBeVisible();
  await expect(page.getByText(`${data.items[0].name} × 1`)).toBeVisible();
});
