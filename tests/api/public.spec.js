const { test, expect } = require('@playwright/test');

const api = process.env.API_BASE_URL;
test.skip(!api, 'Set API_BASE_URL to the deployed API.');

test('@smoke health endpoint responds successfully', async ({ request }) => {
  const response = await request.get(`${api}/health`);
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ status: 'ok' });
});

test('@smoke protected reservations reject an anonymous request', async ({ request }) => {
  const response = await request.get(`${api}/reservations`);
  expect([401, 403]).toContain(response.status());
});

test('@smoke public catalog returns usable dishes', async ({ request }) => {
  const response = await request.get(`${api}/dishes`);
  expect(response.status()).toBe(200);
  const dishes = await response.json();
  expect(Array.isArray(dishes)).toBeTruthy();
  expect(dishes.length).toBeGreaterThan(0);
  expect(dishes[0]).toEqual(expect.objectContaining({ id: expect.any(String), name: expect.any(String) }));
});

test('@smoke an anonymous visitor cannot read a group or submit an order', async ({ request }) => {
  const group = 'nonexistent-automation-group';
  const list = await request.get(`${api}/guest/groups/${group}/sessions`);
  const submit = await request.post(`${api}/group-reservations/${group}/submit`, {
    data: { reservationId: 'nonexistent-automation-reservation' },
  });
  expect([401, 403]).toContain(list.status());
  expect([401, 403]).toContain(submit.status());
});

test('@level3 unauthenticated requests cannot delete a participant', async ({ request }) => {
  // Both identifiers are synthetic: no existing reservation or order is changed.
  const response = await request.delete(`${api}/guest/groups/automation-nonexistent-group/sessions/automation-nonexistent-guest`);
  expect([401, 403]).toContain(response.status());
});

test('@smoke recovery does not reveal whether an unknown order exists', async ({ request }) => {
  const response = await request.post(`${api}/guest/orders/nonexistent-automation-order/request-access`, {
    data: { email: 'nobody@example.invalid' },
  });
  expect(response.status()).toBe(202);
  expect((await response.json()).message).toMatch(/Якщо замовлення/);
});
