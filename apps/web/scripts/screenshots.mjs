#!/usr/bin/env node
// Regenerate the README screenshots in docs/images from a production build.
//   pnpm --filter @heirmap/web build && pnpm screenshots
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const root = resolve(import.meta.dirname, '../../..');
const out = resolve(root, 'docs/images');
mkdirSync(out, { recursive: true });
const port = 4199;
const base = `http://localhost:${port}/`;

const server = spawn('pnpm', ['exec', 'vite', 'preview', '--port', String(port), '--strictPort'], {
  cwd: resolve(import.meta.dirname, '..'),
  stdio: 'ignore',
});

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(base);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('preview server did not start');
}

async function openSample(page) {
  await page.goto(base);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'Explore a sample family' }).click();
  await page.waitForTimeout(700);
}

try {
  await waitForServer();
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  await page.goto(base);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.screenshot({ path: `${out}/welcome.png` });

  await openSample(page);
  await page.screenshot({ path: `${out}/workspace.png` });

  // Chain of title with statute citations.
  await page
    .locator('.share-row', { hasText: 'Lorraine Freeman' })
    .locator('button')
    .first()
    .click();
  await page.waitForTimeout(200);
  await page.locator('.share-row', { hasText: 'Lorraine Freeman' }).scrollIntoViewIfNeeded();
  await page.locator('.panel-right').screenshot({ path: `${out}/chain-of-title.png` });

  // Guided builder.
  await page.locator('.panel-left').screenshot({ path: `${out}/guided-builder.png` });

  // Law panel with dated rule versions.
  await page.getByRole('tab', { name: /Law/ }).click();
  await page.waitForTimeout(150);
  await page.locator('.panel-right').screenshot({ path: `${out}/law-versions.png` });

  // Document checklist.
  await page.getByRole('tab', { name: /Documents/ }).click();
  await page.waitForTimeout(150);
  await page.locator('.panel-right').screenshot({ path: `${out}/document-checklist.png` });

  // Timeline: ownership right after the owner's death.
  await page.getByRole('tab', { name: 'Shares' }).click();
  await page.getByRole('slider', { name: /Show ownership as of/ }).fill('0');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/timeline-1958.png` });
  await page.getByRole('slider', { name: /Show ownership as of/ }).fill('9');

  // Person editor.
  await page.getByTestId('person-lucius').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/person-editor.png` });

  // Affidavit family chart.
  await page.getByRole('button', { name: /Export/ }).click();
  await page.getByRole('menuitem', { name: /Family chart for an affidavit/ }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/affidavit-chart.png` });
  await page.getByRole('button', { name: 'Close report' }).click();

  // Dark mode.
  const dark = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
  });
  const dpage = await dark.newPage();
  await openSample(dpage);
  await dpage.screenshot({ path: `${out}/workspace-dark.png` });

  await browser.close();
  console.log(`Screenshots written to ${out}`);
} finally {
  server.kill();
}
