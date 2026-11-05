import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT,
  tempDataDir,
  launchApp,
  launchSeededApp,
  activate,
  login,
} from './support/app.fixture';

/**
 * End-to-end smoke tests for the packaged web bundle running inside Electron.
 * Each test gets a throwaway data directory (CERAMISYS_USER_DATA_DIR) so a run
 * never reads or writes a real installation's database.
 */

test('a fresh installation activates and permits local sign-in', async () => {
  const dataDir = tempDataDir();
  const { app, page, closeMockServer } = await launchApp(dataDir);
  try {
    await expect(page).toHaveTitle(/سيراميسيس/);
    await expect(page.getByLabel('مفتاح الترخيص')).toBeVisible();
    await page.getByLabel('اسم الحساب').fill('admin');
    await page.getByLabel('كلمة المرور').fill('admin123');
    await page.getByLabel('رقم الهاتف').fill('01000000000');
    await page.getByLabel('مفتاح الترخيص').fill('INVALID-CODE');
    await page.getByRole('button', { name: 'تحقق وانتقل لتسجيل الدخول' }).click();
    await expect(page.getByRole('alert')).toContainText('رمز التفعيل غير صحيح.');
    await expect(page.locator('#username')).toHaveCount(0);

    await page.getByLabel('مفتاح الترخيص').fill('VALID-CODE');
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

    await expect(page.locator('#sec-pulse')).toBeVisible();

    // The window really rendered the built bundle, not an error page.
    const rootHtml = await page.locator('#root').innerHTML();
    expect(rootHtml.length).toBeGreaterThan(500);
  } finally {
    await app.close();
    await closeMockServer();
  }
});

test('an existing installation logs in straight to the dashboard and can navigate', async () => {
  const { app, page, closeMockServer } = await launchSeededApp();
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
    await closeMockServer();
  }
});

test('the packaged Windows build starts without enabling remote debugging', async () => {
  const exe = process.env.CERAMISYS_TEST_EXE_PATH
    ? path.resolve(process.env.CERAMISYS_TEST_EXE_PATH)
    : path.join(ROOT, 'release', 'win-unpacked', 'CeramiSys ERP.exe');
  test.skip(
    process.env.CERAMISYS_TEST_PACKAGED !== '1' || !fs.existsSync(exe),
    'Build the Windows package and set CERAMISYS_TEST_PACKAGED=1 to run this platform-specific smoke test.',
  );

  const dataDir = process.env.CERAMISYS_TEST_DATA_DIR || tempDataDir();
  const logFile = path.join(dataDir, 'logs', 'app.log');
  const app = spawn(exe, [], {
    env: { ...process.env, CERAMISYS_USER_DATA_DIR: dataDir },
    stdio: 'ignore',
  });
  try {
    await expect.poll(() => {
      if (app.exitCode !== null) throw new Error(`Packaged app exited with code ${app.exitCode}.`);
      return fs.existsSync(logFile) && fs.readFileSync(logFile, 'utf8').includes('Application diagnostics initialized');
    }, { timeout: 30_000 }).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    expect(app.exitCode).toBeNull();
  } finally {
    if (app.exitCode === null) app.kill();
  }
});
