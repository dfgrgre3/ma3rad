import { expect, test } from '@playwright/test';
import { activate, launchSeededApp, login } from './support/app.fixture';

/**
 * Visual audit screenshots for design-system review.
 * Captures representative hub/list/detail pages at desktop and phone widths.
 */
const ROUTES = [
  { path: '/dashboard', label: 'dashboard' },
  { path: '/partners', label: 'partners' },
  { path: '/reports', label: 'reports' },
  { path: '/settings', label: 'settings' },
];

test('capture representative pages for visual review', async () => {
  test.setTimeout(300_000);
  const { app, page, closeMockServer } = await launchSeededApp();
  try {
    await activate(page);
    await login(page);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ROUTES) {
        await page.evaluate((path) => { window.location.hash = `#${path}`; }, route.path);
        await expect
          .poll(async () => (await page.locator('main.app-main').innerText()).trim().length, { timeout: 20_000 })
          .toBeGreaterThan(20);
        await page.screenshot({
          path: `test-results/visual/${route.label}-${width}.png`,
          fullPage: false,
        });
      }
    }
  } finally {
    await app.close();
    await closeMockServer();
  }
});
