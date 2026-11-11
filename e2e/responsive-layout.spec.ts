import { expect, test } from '@playwright/test';
import { launchSeededApp, login, waitForLogin } from './support/app.fixture';

/**
 * Responsive layout regression sweep.
 *
 * Every route must stay inside the viewport at phone, tablet, laptop and
 * desktop widths. The check looks at the document and the scrolling content
 * container, because the shell clips horizontal overflow visually — content
 * that still exceeds the box would be unreachable for the user.
 */

const ROUTES = [
  { path: '/dashboard', label: 'dashboard' },
  { path: '/sales', label: 'sales hub' },
  { path: '/partners', label: 'partners' },
  { path: '/reports', label: 'reports hub' },
  { path: '/inventory/ledger', label: 'stock ledger' },
  { path: '/purchases/orders', label: 'purchase orders' },
  { path: '/admin', label: 'admin' },
  { path: '/finance', label: 'finance' },
];

const VIEWPORTS = [360, 390, 768, 1024, 1366, 1440, 1920];

test('pages fit phone, tablet, laptop and desktop viewports without horizontal overflow', async () => {
  test.setTimeout(300_000);
  const { app, page, closeMockServer } = await launchSeededApp();
  await waitForLogin(page);
  await login(page);

  try {
    await expect(page.locator('#sec-pulse')).toBeVisible({ timeout: 90_000 });

    for (const width of VIEWPORTS) {
      await page.setViewportSize({ width, height: 900 });

      for (const route of ROUTES) {
        await page.evaluate((path) => { window.location.hash = `#${path}`; }, route.path);
        await expect
          .poll(
            async () => (await page.locator('main.app-main').innerText()).trim().length,
            { timeout: 15_000, message: `${route.label} did not render content` },
          )
          .toBeGreaterThan(20);

        const metrics = await page.evaluate(() => {
          const main = document.querySelector('main.app-main') as HTMLElement | null;
          const root = document.documentElement;
          return {
            viewport: window.innerWidth,
            documentWidth: root.scrollWidth,
            mainWidth: main?.clientWidth ?? 0,
            mainScrollWidth: main?.scrollWidth ?? 0,
          };
        });

        expect(
          metrics.documentWidth,
          `${route.label} document overflow at ${width}px (document ${metrics.documentWidth}px, viewport ${metrics.viewport}px)`,
        ).toBeLessThanOrEqual(metrics.viewport + 2);

        expect(
          metrics.mainScrollWidth,
          `${route.label} content overflow at ${width}px (content ${metrics.mainScrollWidth}px, container ${metrics.mainWidth}px)`,
        ).toBeLessThanOrEqual(metrics.mainWidth + 2);
      }
    }
  } finally {
    await app.close();
    await closeMockServer();
  }
});
