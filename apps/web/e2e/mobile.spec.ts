import { expect, test } from '@playwright/test';

test('works on a phone-sized screen', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore a sample family' }).click();
  await expect(page.locator('.share-list').getByText('Gloria Brooks')).toBeVisible();
});
