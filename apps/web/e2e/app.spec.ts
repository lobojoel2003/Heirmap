import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('sample family: shares, chain of title and statute links', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.getByRole('button', { name: 'Explore a sample family' }).click();
  await expect(page.getByRole('heading', { name: 'Guided builder' })).toBeVisible();

  const list = page.locator('.share-list');
  await expect(list.getByText('Gloria Brooks')).toBeVisible();
  await expect(list.locator('.share-row').first()).toContainText('1/4');

  await list.getByText('Lorraine Freeman').click();
  const chain = page.locator('.chain');
  await expect(chain).toContainText('GA-1998');
  const statute = chain.locator('a.cite', { hasText: '53-2-1(c)(1)' }).first();
  await expect(statute).toHaveAttribute('href', /law\.justia\.com\/codes\/georgia/);

  await page.getByRole('img', { name: 'Pie chart of current fractional shares' }).isVisible();
  await expect(page.locator('.pie path')).toHaveCount(12);
  expect(errors).toEqual([]);
});

test('timeline shows who owned the land after each death', async ({ page }) => {
  await page.getByRole('button', { name: 'Explore a sample family' }).click();
  const slider = page.getByRole('slider', { name: /Show ownership as of/ });
  await slider.fill('0');
  await expect(page.getByText(/after the death of Elijah Freeman/)).toBeVisible();
  await expect(page.locator('.share-list')).toContainText('Hattie Freeman');
  await expect(page.locator('.share-list .share-row').first()).toContainText('1/5');
});

test('build a family with the guide and see the statute applied', async ({ page }) => {
  await page.getByRole('button', { name: 'Start a new case' }).click();
  await page.getByLabel('Owner of record (name on the deed)').fill('Rosa Mitchell');
  await page.getByLabel("Owner's date of death").fill('2012-04-02');
  await page.getByLabel('State where the land is').selectOption('NC');
  await page.getByLabel('County').fill('Halifax');
  await page.getByLabel('Parcel / tax ID').fill('0907-12');
  await page.getByRole('button', { name: 'Create case' }).click();

  await page.getByRole('button', { name: 'Add spouse' }).first().click();
  await page.getByLabel('Full name').fill('Walter Mitchell');
  await page.getByLabel('Full name').press('Enter');

  await page
    .getByTestId(/person-p_/)
    .filter({ hasText: 'Rosa Mitchell' })
    .click();
  for (const name of ['Ann Mitchell', 'Ben Mitchell']) {
    await page.getByRole('button', { name: 'Add child' }).first().click();
    await page.getByLabel('Full name').fill(name);
    await page.getByLabel('Full name').press('Enter');
    await page
      .getByTestId(/person-p_/)
      .filter({ hasText: 'Rosa Mitchell' })
      .click();
  }

  await page.getByRole('tab', { name: 'Shares' }).click();
  const list = page.locator('.share-list');
  await expect(list.locator('.share-row').filter({ hasText: 'Walter Mitchell' })).toContainText(
    '1/3',
  );
  await expect(list.locator('.share-row').filter({ hasText: 'Ann Mitchell' })).toContainText('1/3');

  await list.getByText('Walter Mitchell').click();
  await expect(page.locator('.chain')).toContainText('N.C. Gen. Stat. § 29-14(a)(2)');

  // Undo removes the last child; the spouse's share becomes one-half.
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(list.locator('.share-row').filter({ hasText: 'Walter Mitchell' })).toContainText(
    '1/2',
  );
});

test('cases persist on this device and can be exported', async ({ page }) => {
  await page.getByRole('button', { name: 'Explore a sample family' }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Guided builder' })).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export/ }).click();
  await page.getByRole('menuitem', { name: /Shares \(CSV\)/ }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('freeman-home-place-sample-shares.csv');

  await page.getByRole('button', { name: /Export/ }).click();
  await page.getByRole('menuitem', { name: /Family chart for an affidavit/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Family Chart and Heirship Determination' }),
  ).toBeVisible();
  await expect(page.locator('.paper table').first()).toContainText('granddaughter');
  await page.getByRole('button', { name: 'Close report' }).click();

  await page.getByRole('tab', { name: /Documents/ }).click();
  await page.getByLabel(/Status of Death certificate — Hattie Freeman/).selectOption('obtained');
  await expect(page.getByText(/3 of \d+ documents in hand/)).toBeVisible();
});

test('makes no network requests beyond its own files', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://localhost')) external.push(r.url());
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore a sample family' }).click();
  await page.getByRole('tab', { name: /Law/ }).click();
  await page.waitForTimeout(300);
  expect(external).toEqual([]);
});
