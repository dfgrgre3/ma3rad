import { expect, test, type Page } from '@playwright/test';
import { launchAuthenticatedApp } from './support/app.fixture';

async function openPrintWindow(page: Page, action: () => Promise<void>): Promise<Page> {
  const [popup] = await Promise.all([page.waitForEvent('popup'), action()]);
  await expect(popup.locator('body')).toBeVisible();
  return popup;
}

test('production CSP supports customer display, A4, thermal, and shift-close printing', async () => {
  test.setTimeout(300_000);
  const { app, page, closeMockServer } = await launchAuthenticatedApp();
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  try {
    await page.evaluate(() => {
      document.addEventListener('securitypolicyviolation', (event) => {
        document.documentElement.dataset.cspViolation = `${event.violatedDirective}:${event.blockedURI}`;
      });
      const openWindow = window.open.bind(window);
      window.open = (url, target, features) => {
        const popup = openWindow(url, target, features);
        if (popup) {
          popup.addEventListener('securitypolicyviolation', (event) => {
            document.documentElement.dataset.cspViolation = `${event.violatedDirective}:${event.blockedURI}`;
          });
          popup.print = () => {
            const requests = Number(document.documentElement.dataset.printRequests || 0) + 1;
            document.documentElement.dataset.printRequests = String(requests);
          };
        }
        return popup;
      };
    });

    await page.evaluate(() => { window.location.hash = '#/pos'; });
    await page.getByRole('button', { name: /فتح وردية/ }).click();
    await page.getByRole('dialog', { name: 'فتح وردية كاشير' })
      .getByRole('button', { name: 'فتح الوردية', exact: true })
      .click();

    const [customerDisplay] = await Promise.all([
      page.waitForEvent('popup'),
      page.getByRole('button', { name: 'عرض العميل' }).click(),
    ]);
    await expect(customerDisplay).toHaveTitle('عرض العميل');
    await expect(customerDisplay.locator('#root')).toContainText('المجموع الفرعي');
    await expect(customerDisplay.locator('#root')).toContainText('الإجمالي: 0');

    await page.evaluate(() => { window.location.hash = '#/settings?tab=invoice'; });
    const a4Window = await openPrintWindow(page, async () => {
      await page.getByRole('button', { name: 'تجربة طباعة A4' }).click();
    });
    await expect(a4Window.locator('body')).toContainText('INV-2026-0088');
    await expect(a4Window.locator('body')).toContainText('بورسلين إسباني');
    expect(await a4Window.locator('style').first().evaluate((style) => style.textContent ?? ''))
      .toMatch(/@page\s*\{[^}]*size:\s*A4\b/i);
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.printRequests)).toBe('1');

    const thermalWindow = await openPrintWindow(page, async () => {
      await page.getByRole('button', { name: 'تجربة طباعة إيصال حراري' }).click();
    });
    await expect(thermalWindow.locator('body')).toContainText('INV-2026-0088');
    await expect(thermalWindow.locator('body')).toContainText('إيصال');
    expect(await thermalWindow.locator('style').first().evaluate((style) => style.textContent ?? ''))
      .toMatch(/size:\s*(58|80)mm\s+auto/i);
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.printRequests)).toBe('2');

    await page.evaluate(() => { window.location.hash = '#/pos'; });
    await page.getByRole('button', { name: /إغلاق الوردية/ }).click();

    const shiftReport = await openPrintWindow(page, async () => {
      await page.getByRole('button', { name: 'طباعة تقرير Z (ملخص الوردية)' }).click();
    });
    await expect(shiftReport.locator('body')).toContainText('تقرير Z - إقفال الوردية');
    expect(await shiftReport.locator('style').first().evaluate((style) => style.textContent ?? ''))
      .toContain('width:76mm');
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.printRequests)).toBe('3');

    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    const scriptPolicy = csp?.split(';').map((directive) => directive.trim())
      .find((directive) => directive.startsWith('script-src'));
    expect(scriptPolicy).toContain("'self'");
    expect(scriptPolicy).not.toContain("'unsafe-inline'");
    expect(pageErrors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.dataset.cspViolation || '')).toBe('');
  } finally {
    await app.close();
    await closeMockServer();
  }
});
