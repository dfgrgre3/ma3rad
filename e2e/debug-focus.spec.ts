import { expect, test } from '@playwright/test';
import { activate, launchSeededApp, login } from './support/app.fixture';

test('debug focus', async () => {
  test.setTimeout(120_000);
  const { app, page, closeMockServer } = await launchSeededApp();
  try {
    await activate(page);
    await login(page);
    await page.setViewportSize({ width: 768, height: 900 });
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog', { name: 'بحث شامل' });
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(500);
    const info = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"][aria-label="بحث شامل"]') as HTMLElement;
      const els = Array.from(d.querySelectorAll('input:not([disabled]):not([tabindex="-1"]), button:not([disabled]):not([tabindex="-1"]), [href]:not([tabindex="-1"])'));
      return { count: els.length, tags: els.map(e => e.tagName + ':' + (e.getAttribute('aria-label')||e.textContent?.trim().slice(0,20))) };
    });
    console.log('FOCUSABLES', JSON.stringify(info));
    await page.keyboard.press('Shift+Tab');
    const active = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent?.trim().slice(0,30));
    console.log('ACTIVE_AFTER_SHIFTTAB', active);
  } finally {
    await app.close();
    await closeMockServer();
  }
});