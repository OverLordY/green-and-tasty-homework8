const { test, expect } = require('@playwright/test');

// These anonymous pages contain no login credentials or confirmation links.
// Keep a screenshot on failure to make CI failures actionable.
test.use({ screenshot: 'only-on-failure' });

test.skip(!process.env.BASE_URL, 'Set BASE_URL to the deployed frontend.');

test('@smoke visitor can open the table-search screen', async ({ page }) => {
  await page.goto('/tables');
  await expect(page.getByRole('heading', { name: 'Book a Table' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Find a Table' })).toBeVisible();
});

test('@smoke an invalid guest invitation cannot expose a group', async ({ page }) => {
  await page.goto('/join/invalid-invitation-for-test');
  await expect(page.getByRole('heading', { name: 'Попереднє замовлення гостя' })).toBeVisible();
  await expect(page.getByText(/запрошення|посилання/i).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Підтвердити через пошту' })).toHaveCount(0);
});
