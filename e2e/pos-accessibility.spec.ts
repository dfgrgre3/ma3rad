import { expect, test } from '@playwright/test';
import { activate, launchSeededApp, login } from './support/app.fixture';

test('POS product cards can be added to the cart using the keyboard', async () => {
  test.setTimeout(300_000);
  const { app, page, closeMockServer } = await launchSeededApp();

  try {
    await activate(page);
    await login(page);
    await page.setViewportSize({ width: 398, height: 844 });
    await page.evaluate(() => { window.location.hash = '#/pos'; });
    await expect(page.getByRole('heading', { name: 'نقطة البيع السريعة' })).toBeVisible();

    await page.getByRole('button', { name: /فلاتر/ }).click();
    const stockFilter = page.getByRole('button', { name: 'المتوفر فقط' });
    await expect(stockFilter).toHaveAttribute('aria-pressed', 'false');
    await stockFilter.click();
    await expect(stockFilter).toHaveAttribute('aria-pressed', 'true');
    await stockFilter.click();
    await expect(stockFilter).toHaveAttribute('aria-pressed', 'false');

    const search = page.getByRole('combobox', { name: 'بحث عن منتج' });
    await search.fill('no-matching-product');
    await page.getByRole('button', { name: 'مسح البحث' }).click();
    await expect(search).toHaveValue('');

    await page.getByRole('button', { name: 'عرض جدول كامل' }).click();
    const productTable = page.getByRole('table', { name: 'جدول أصناف نقطة البيع' });
    await expect(productTable).toBeVisible();
    await expect(productTable.getByRole('columnheader', { name: 'التفاصيل' })).toBeVisible();
    await expect(productTable.getByRole('columnheader', { name: 'السعر' })).toBeVisible();
    await expect(productTable.getByRole('columnheader', { name: 'المخزون' })).toBeVisible();

    const addProductButton = page.getByRole('button', { name: /^إضافة .+ إلى السلة$/ }).first();
    await expect(addProductButton).toBeVisible();
    await addProductButton.focus();
    await addProductButton.press('Enter');

    await expect(page.getByText('سلة البيع', { exact: false }).first()).toContainText('1 أصناف');
    const checkoutButton = page.getByRole('button', { name: /اعتماد وحفظ الفاتورة/ });
    const scrollMetrics = await page.locator('#pos-notes').evaluate((element) => {
      let ancestor = element.parentElement;
      while (ancestor) {
        if (getComputedStyle(ancestor).overflowY === 'auto' && ancestor.scrollHeight > ancestor.clientHeight) {
          ancestor.scrollTop = ancestor.scrollHeight;
          return { scrollTop: ancestor.scrollTop, scrollHeight: ancestor.scrollHeight, clientHeight: ancestor.clientHeight };
        }
        ancestor = ancestor.parentElement;
      }
      return null;
    });
    expect(scrollMetrics).not.toBeNull();
    expect(scrollMetrics?.scrollTop).toBeGreaterThan(0);
    await expect(page.getByText('الإجمالي النهائي', { exact: true })).toBeVisible();
    await expect(checkoutButton).toBeVisible();
  } finally {
    await app.close();
    await closeMockServer();
  }
});
