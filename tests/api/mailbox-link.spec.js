const { test, expect } = require('@playwright/test');
const { selectConfirmationLink } = require('../helpers/test-mailbox');

test('confirmation links must target the expected site and order', () => {
  const origin = 'https://example.test';
  const good = `${origin}/guest-confirmation#order=order-a&token=synthetic`;
  const body = `https://wrong.test/guest-confirmation#order=order-a&token=fake\n${good}`;
  expect(selectConfirmationLink(body, 'order-a', origin)).toBe(good);
  expect(selectConfirmationLink(body, 'order-b', origin)).toBeNull();
  expect(selectConfirmationLink(`${origin}/guest-confirmation#order=order-a`, 'order-a', origin)).toBeNull();
});
