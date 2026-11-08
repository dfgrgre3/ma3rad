import { expect, test } from '@playwright/test';
import { activate, launchSeededApp, login } from './support/app.fixture';

test('POS customer dialog searches, filters, paginates, and updates the invoice customer', async () => {
  test.setTimeout(300_000);
  const { app, page, closeMockServer } = await launchSeededApp();

  try {
    await activate(page);
    await login(page);
    await page.evaluate(() => { window.location.hash = '#/pos'; });
    await expect(page.getByRole('heading', { name: 'نقطة البيع السريعة' })).toBeVisible();

    await page.getByRole('button', { name: 'عرض قائمة العملاء' }).click();
    const dialog = page.getByRole('dialog', { name: 'اختيار عميل' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('1 / 2')).toBeVisible();
    await expect(dialog.getByRole('row')).toHaveCount(26);

    await dialog.getByRole('button', { name: 'التالي' }).click();
    await expect(dialog.getByText('2 / 2')).toBeVisible();
    await expect(dialog.getByRole('row')).toHaveCount(5);

    const search = dialog.getByRole('textbox', { name: 'البحث عن عميل' });
    await search.fill('عميل اختبار POS 002');
    await expect(dialog.getByRole('row').filter({ hasText: 'E2E-CUST-002' })).toBeVisible();
    await search.fill('0100000002');
    await expect(dialog.getByRole('row').filter({ hasText: 'E2E-CUST-002' })).toBeVisible();
    await search.fill('E2E-CUST-002');
    await expect(dialog.getByRole('row').filter({ hasText: 'E2E-CUST-002' })).toBeVisible();

    await search.fill('');
    await dialog.getByLabel('نوع العميل').selectOption('WHOLESALE');
    await expect(dialog.getByRole('row').filter({ hasText: 'E2E-CUST-001' })).toHaveCount(0);
    await expect(dialog.getByRole('row').filter({ hasText: 'E2E-CUST-002' })).toBeVisible();

    await dialog.getByLabel('حالة العميل').selectOption('INACTIVE');
    const inactiveRow = dialog.getByRole('row').filter({ hasText: 'E2E-CUST-030' });
    await expect(inactiveRow).toBeVisible();
    await expect(inactiveRow.getByRole('button', { name: 'اختيار' })).toBeDisabled();

    await dialog.getByLabel('حالة العميل').selectOption('ACTIVE');
    await dialog.getByLabel('نوع العميل').selectOption('ALL');
    await search.fill('E2E-CUST-001');
    const firstCustomer = dialog.getByRole('row').filter({ hasText: 'E2E-CUST-001' });
    await firstCustomer.getByRole('button', { name: 'اختيار' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByLabel('بحث العميل')).toHaveValue('عميل اختبار POS 001');

    await page.getByRole('button', { name: 'عرض قائمة العملاء' }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox', { name: 'البحث عن عميل' }).fill('E2E-CUST-002');
    await dialog.getByRole('row').filter({ hasText: 'E2E-CUST-002' }).getByRole('button', { name: 'اختيار' }).click();
    await expect(page.getByLabel('بحث العميل')).toHaveValue('عميل اختبار POS 002');

    await page.getByRole('button', { name: 'عرض قائمة العملاء' }).click();
    await expect(dialog).toBeVisible();
    await page.mouse.click(8, 8);
    await expect(dialog).toHaveCount(0);
  } finally {
    await app.close();
    await closeMockServer();
  }
});
