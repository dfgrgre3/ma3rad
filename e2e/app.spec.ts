import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { _electron as electron } from '@playwright/test';
import {
  ROOT,
  tempDataDir,
  seedReturningInstallation,
  launchApp,
  launchSeededApp,
  activate,
  login,
  mockLicenseApi,
} from './support/app.fixture';

/**
 * End-to-end smoke tests for the packaged web bundle running inside Electron.
 * Each test gets a throwaway data directory (CERAMISYS_USER_DATA_DIR) so a run
 * never reads or writes a real installation's database.
 */

test('a fresh installation must activate once before login', async () => {
  test.skip(true, 'disabled while BYPASS_FIRST_RUN_SETUP=true (dev mode); re-enable before release');
  const dataDir = tempDataDir();
  const { app, page } = await launchApp(dataDir);
  try {
    await expect(page).toHaveTitle(/سيراميسيس/);
    await expect(page.getByRole('textbox', { name: 'رمز التفعيل', exact: true })).toBeVisible();
    await page.getByLabel('رابط خادم الترخيص').fill('http://localhost:4000');
    await page.getByRole('textbox', { name: 'رمز التفعيل', exact: true }).fill('INVALID-CODE');
    await page.getByRole('button', { name: 'تحقق وانتقل لتسجيل الدخول' }).click();
    await expect(page.getByRole('alert')).toContainText('رمز التفعيل غير صحيح.');
    await expect(page.locator('#username')).toHaveCount(0);

    await page.getByRole('textbox', { name: 'رمز التفعيل', exact: true }).fill('VALID-CODE');
    await page.getByRole('button', { name: 'تحقق وانتقل لتسجيل الدخول' }).click();
    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();

    await page.reload();
    await expect(page.locator('#username')).toBeVisible();
    await login(page);

    const changePasswordDialog = page.getByRole('dialog', { name: 'تغيير كلمة المرور الافتراضية' });
    if (await changePasswordDialog.isVisible()) {
      await page.getByLabel('كلمة المرور الحالية (الافتراضية: admin123)').fill('admin123');
      await page.getByRole('textbox', { name: 'كلمة المرور الجديدة', exact: true }).fill('Welcome123');
      await page.getByRole('textbox', { name: 'تأكيد كلمة المرور الجديدة', exact: true }).fill('Welcome123');
      await page.getByRole('button', { name: 'حفظ كلمة المرور وتأمين النظام' }).click();
    }

    await expect(page.getByRole('heading', { name: 'لوحة المعلومات والتحليلات الشاملة' })).toBeVisible();

    // The window really rendered the built bundle, not an error page.
    const rootHtml = await page.locator('#root').innerHTML();
    expect(rootHtml.length).toBeGreaterThan(500);
  } finally {
    await app.close();
  }
});

test('an existing installation logs in straight to the dashboard and can navigate', async () => {
  const { app, page } = await launchSeededApp();
  try {
    await activate(page);
    await login(page);

    // Setup is complete, so the dashboard renders instead of the wizard.
    await expect(page.locator('#sec-pulse')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'إعداد نظام ERP' })).toHaveCount(0);

    // Hash routing works under file:// and loads a real screen.
    await page.evaluate(() => { window.location.hash = '#/sales'; });
    await expect(page).toHaveURL(/#\/sales/);
    await expect(page.locator('body')).toContainText('المبيعات', { timeout: 30_000 });
  } finally {
    await app.close();
  }
});

test('the packaged Windows build boots the same bundle from app.asar', async () => {
  const exe = path.join(ROOT, 'release', 'win-unpacked', 'CeramiSys ERP.exe');
  test.skip(!fs.existsSync(exe), 'run `npm run electron:pack` to create release/win-unpacked first');

  const dataDir = tempDataDir();
  seedReturningInstallation(dataDir);

  const app = await electron.launch({
    executablePath: exe,
    env: { ...process.env, CERAMISYS_USER_DATA_DIR: dataDir },
  });
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await mockLicenseApi(page);
    await activate(page);
    await login(page);
    await expect(page.locator('#sec-pulse')).toBeVisible();
  } finally {
    await app.close();
  }
});
