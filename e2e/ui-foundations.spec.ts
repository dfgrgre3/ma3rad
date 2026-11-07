import { expect, test } from '@playwright/test';
import { launchAuthenticatedApp } from './support/app.fixture';

test('global search is keyboard accessible and fits small, tablet, and desktop viewports', async () => {
  const { app, page, closeMockServer } = await launchAuthenticatedApp();

  try {
    const viewports = [
      { width: 320, height: 900 },
      { width: 768, height: 900 },
      { width: 1440, height: 900 },
    ];

    for (const [index, viewport] of viewports.entries()) {
      await page.setViewportSize(viewport);
      const trigger = page.getByRole('button', { name: 'بحث شامل' });
      await expect(trigger).toBeVisible();

      if (index === 2) {
        await trigger.click();
      } else {
        await page.keyboard.press('Control+k');
      }

      const dialog = page.getByRole('dialog', { name: 'بحث شامل' });
      const input = dialog.getByRole('combobox', { name: 'بحث الصفحات والسجلات' });
      await expect(dialog).toBeVisible();
      await expect(input).toBeFocused();
      const dialogBox = await dialog.boundingBox();
      expect(dialogBox?.width).toBeLessThanOrEqual(viewport.width - 16);

      if (index === 0) {
        await input.fill('الأصناف');
        const productOption = dialog.getByRole('option', { name: /الأصناف/ }).first();
        await expect(productOption).toBeVisible();
        await expect(productOption).toHaveAttribute('aria-selected', 'true');
        await input.press('Enter');
        await expect(page).toHaveURL(/#\/products$/);
        await expect(dialog).toHaveCount(0);
      } else if (index === 1) {
        await page.keyboard.press('Shift+Tab');
        await expect(dialog.getByRole('button', { name: 'إغلاق' })).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(input).toBeFocused();
        await page.keyboard.press('ArrowDown');
        const activeId = await input.getAttribute('aria-activedescendant');
        expect(activeId).toBeTruthy();
        await expect(page.locator(`#${activeId}`)).toHaveAttribute('aria-selected', 'true');
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
      } else {
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
      }
    }

    const filters = page.getByRole('button', { name: /فلاتر متقدمة/ });
    await expect(filters).toBeVisible();
    await filters.click();
    await expect(filters).toHaveAttribute('aria-expanded', 'true');
    const stockFilter = page.getByLabel('حالة المخزون');
    await stockFilter.selectOption('out');
    await expect(stockFilter).toHaveValue('out');
    await page.getByRole('button', { name: 'مسح عوامل التصفية' }).click();
    await expect(stockFilter).toHaveValue('all');
  } finally {
    await app.close();
    await closeMockServer();
  }
});
