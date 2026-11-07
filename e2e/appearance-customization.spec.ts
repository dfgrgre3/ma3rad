import { expect, test } from '@playwright/test';
import { launchAuthenticatedApp } from './support/app.fixture';

test('appearance studio previews responsively and edits colors transactionally', async () => {
  const { app, page, closeMockServer } = await launchAuthenticatedApp();

  try {
    await page.evaluate(() => { window.location.hash = '#/settings?tab=customization'; });
    await expect(page.getByRole('heading', { name: 'استوديو مظهر النظام' })).toBeVisible();
    await expect(page.getByRole('main', { name: 'معاينة لوحة معلومات المعرض' })).toBeVisible();

    await page.setViewportSize({ width: 320, height: 900 });
    const preview = page.locator('.customization-preview');
    const previewBounds = await preview.boundingBox();
    expect(previewBounds).not.toBeNull();
    expect(previewBounds!.x).toBeGreaterThanOrEqual(0);
    expect(previewBounds!.x + previewBounds!.width).toBeLessThanOrEqual(320);

    const density = page.getByLabel('كثافة الواجهة');
    await density.selectOption('compact');
    await expect(preview).toHaveAttribute('data-density', 'compact');
    await expect(preview.locator('td').first()).toHaveCSS('padding-top', '5px');
    await density.selectOption('comfortable');
    await expect(preview.locator('td').first()).toHaveCSS('padding-top', '10px');

    const primaryColor = page.locator('.appearance-color-item').first();
    await primaryColor.click();
    const dialog = page.getByRole('dialog', { name: 'تخصيص اللون الأساسي' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toBeFocused();

    const hexInput = dialog.locator('#appearance-color-hex');
    await hexInput.fill('invalid');
    await expect(dialog.getByRole('alert')).toHaveText('رمز HEX غير صالح');
    await expect(dialog.getByRole('button', { name: 'تطبيق اللون' })).toBeDisabled();

    await hexInput.fill('#1F4E79');
    await dialog.getByRole('button', { name: 'تطبيق اللون' }).click();
    await expect(primaryColor).toContainText('#1F4E79');

    await primaryColor.click();
    await dialog.getByRole('button', { name: 'استعادة الافتراضي' }).click();
    await expect(hexInput).toHaveValue('#34445a');
    await dialog.getByRole('button', { name: 'إلغاء' }).click();
    await expect(primaryColor).toContainText('#1F4E79');

    page.once('dialog', async (confirmation) => { await confirmation.dismiss(); });
    await page.getByRole('button', { name: 'استعادة المظهر الافتراضي' }).click();
    await expect(primaryColor).toContainText('#1F4E79');
  } finally {
    if (!page.isClosed()) await page.close();
    await app.close();
    await closeMockServer();
  }
});

test('custom appearance preview keeps text and primary button states readable', async () => {
  const { app, page, closeMockServer } = await launchAuthenticatedApp();

  try {
    await page.evaluate(() => { window.location.hash = '#/settings?tab=customization'; });
    await expect(page.getByRole('heading', { name: 'استوديو مظهر النظام' })).toBeVisible();

    const setColor = async (index: number, color: string) => {
      await page.locator('.appearance-color-item').nth(index).click();
      const dialog = page.getByRole('dialog').last();
      await expect(dialog).toBeVisible();
      await dialog.locator('#appearance-color-hex').fill(color);
      await dialog.getByRole('button', { name: 'تطبيق اللون' }).click();
    };

    await setColor(0, '#F8E050');
    await setColor(2, '#FFFFFF');
    await setColor(3, '#F8F9FA');
    await setColor(4, '#FFFFFF');

    const preview = page.locator('.customization-preview');
    const primaryButton = preview.locator('.win-btn--primary');

    const buttonContrast = async () => primaryButton.evaluate((element) => {
      const foreground = getComputedStyle(element).color.match(/[\d.]+/g)!.slice(0, 3).map(Number);
      let backgroundElement: HTMLElement | null = element as HTMLElement;
      let backgroundColor = 'rgb(255, 255, 255)';
      while (backgroundElement) {
        const candidate = getComputedStyle(backgroundElement).backgroundColor;
        if (!candidate.includes(', 0)')) {
          backgroundColor = candidate;
          break;
        }
        backgroundElement = backgroundElement.parentElement;
      }
      const background = backgroundColor.match(/[\d.]+/g)!.slice(0, 3).map(Number);
      const luminance = (channels: number[]) => channels.map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
      const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
      return (lighter + 0.05) / (darker + 0.05);
    });

    const buttonStyle = page.getByLabel('نمط الأزرار');
    for (const style of ['solid', 'outline', 'soft']) {
      await buttonStyle.selectOption(style);
      for (const state of ['normal', 'hover', 'pressed']) {
        if (state === 'hover') await primaryButton.hover();
        if (state === 'pressed') await page.mouse.down();
        const ratio = await buttonContrast();
        const colors = await primaryButton.evaluate((element) => ({
          foreground: getComputedStyle(element).color,
          background: getComputedStyle(element).backgroundColor,
          readable: getComputedStyle(element).getPropertyValue('--cerami-primary-readable'),
          style: getComputedStyle(element).getPropertyValue('--cerami-primary'),
        }));
        expect(ratio, `${style} ${state} contrast (${JSON.stringify(colors)})`).toBeGreaterThanOrEqual(4.5);
        if (state === 'pressed') await page.mouse.up();
      }
      await page.mouse.move(0, 0);
    }

    const mode = page.getByLabel('الوضع');
    await mode.selectOption('dark');
    await expect(preview).toHaveAttribute('data-theme-mode', 'dark');
    await page.getByLabel('نمط الأزرار').selectOption('solid');
    await expect.poll(buttonContrast).toBeGreaterThanOrEqual(4.5);
    await primaryButton.hover();
    await expect.poll(buttonContrast).toBeGreaterThanOrEqual(4.5);
    await page.mouse.down();
    await expect.poll(buttonContrast).toBeGreaterThanOrEqual(4.5);
    await page.mouse.up();
  } finally {
    if (!page.isClosed()) await page.close();
    await app.close();
    await closeMockServer();
  }
});
