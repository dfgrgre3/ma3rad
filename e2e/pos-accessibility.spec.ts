import { expect, test } from '@playwright/test';
import { activate, launchSeededApp, login } from './support/app.fixture';

test('POS supports keyboard product addition and responsive checkout', async () => {
  test.setTimeout(300_000);
  const { app, page, closeMockServer } = await launchSeededApp();

  try {
    await activate(page);
    await login(page);
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window.unmaximize();
      window.setBounds({ x: 0, y: 0, width: 480, height: 844 });
    });
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBeLessThanOrEqual(900);
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
    const mobileCheckoutTrigger = page.getByRole('button', { name: /^السلة · 1 أصناف/ });
    await expect(mobileCheckoutTrigger).toBeVisible();
    await mobileCheckoutTrigger.click();
    const mobileCheckoutDialog = page.getByRole('dialog', { name: 'السلة وإتمام البيع' });
    await expect(mobileCheckoutDialog).toBeVisible();
    const invoiceAdjustments = page.getByRole('region', { name: 'تعديلات الفاتورة' });
    const discountInput = invoiceAdjustments.locator('#pos-invoice-discount');
    const discountMode = invoiceAdjustments.getByRole('group', { name: 'نوع الخصم' });
    const discountLabel = invoiceAdjustments.locator('label[for="pos-invoice-discount"]');
    const [discountInputBounds, discountModeBounds, discountLabelBounds, taxInputBounds] = await Promise.all([
      discountInput.boundingBox(),
      discountMode.boundingBox(),
      discountLabel.boundingBox(),
      invoiceAdjustments.locator('#pos-tax-percentage').boundingBox(),
    ]);
    expect(discountInputBounds?.width).toBeGreaterThan(130);
    expect(discountModeBounds?.width).toBeGreaterThan(130);
    expect(taxInputBounds?.width).toBeGreaterThan(130);
    expect(
      discountModeBounds && discountLabelBounds
        && discountModeBounds.y >= discountLabelBounds.y + discountLabelBounds.height
    ).toBe(true);

    const checkoutButton = page.getByRole('button', { name: /اعتماد وحفظ الفاتورة/ });
    const closeMobileCheckout = mobileCheckoutDialog.getByRole('button', { name: 'إغلاق السلة' });
    await expect(closeMobileCheckout).toBeFocused();
    await checkoutButton.focus();
    await page.keyboard.press('Tab');
    await expect(closeMobileCheckout).toBeFocused();

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
    await page.keyboard.press('Escape');
    await expect(mobileCheckoutTrigger).toHaveAttribute('aria-expanded', 'false');
    await expect(mobileCheckoutTrigger).toBeFocused();
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window.setBounds({ x: 0, y: 0, width: 1366, height: 768 });
    });
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBeGreaterThan(900);
  } finally {
    await app.close();
    await closeMockServer();
  }
});
