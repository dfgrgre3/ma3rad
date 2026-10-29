import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * End-to-end smoke tests for the packaged web bundle running inside Electron.
 * Each test gets a throwaway data directory (CERAMISYS_USER_DATA_DIR) so a run
 * never reads or writes a real installation's database.
 */

const ROOT = process.cwd();
const APP_HTML = pathToFileURL(path.join(ROOT, 'dist', 'index.html')).href;

function tempDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ceramisys-e2e-'));
}

async function launchApp(dataDir: string): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [ROOT],
    cwd: ROOT,
    env: {
      ...process.env,
      CERAMISYS_E2E: '1',
      CERAMISYS_USER_DATA_DIR: dataDir,
      VITE_DEV_SERVER_URL: APP_HTML,
    },
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return { app, page };
}

async function login(page: Page): Promise<void> {
  await expect(page.locator('#username')).toBeVisible();
  await page.locator('#username').fill('admin');
  await page.locator('#password').fill('admin123');
  await page.locator('form button[type="submit"]').click();
}

test('a fresh installation starts on login and then asks for setup', async () => {
  const dataDir = tempDataDir();
  const { app, page } = await launchApp(dataDir);
  try {
    await expect(page).toHaveTitle(/CeramiSys/);
    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();

    await login(page);

    // First run: no products and no invoices, so the setup wizard must appear.
    await expect(page.getByRole('heading', { name: 'إعداد نظام ERP' })).toBeVisible();
    await expect(page.getByText('بيانات المعرض')).toBeVisible();

    // The window really rendered the built bundle, not an error page.
    const rootHtml = await page.locator('#root').innerHTML();
    expect(rootHtml.length).toBeGreaterThan(500);
  } finally {
    await app.close();
  }
});

test('an existing installation logs in straight to the dashboard and can navigate', async () => {
  const dataDir = tempDataDir();
  execFileSync(
    process.execPath,
    ['--import', './test/register-hook.mjs', 'scripts/e2e/seed-db.ts', dataDir],
    { cwd: ROOT, stdio: 'pipe' }
  );

  const { app, page } = await launchApp(dataDir);
  try {
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
  execFileSync(
    process.execPath,
    ['--import', './test/register-hook.mjs', 'scripts/e2e/seed-db.ts', dataDir],
    { cwd: ROOT, stdio: 'pipe' }
  );

  const app = await electron.launch({
    executablePath: exe,
    env: { ...process.env, CERAMISYS_USER_DATA_DIR: dataDir },
  });
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await login(page);
    await expect(page.locator('#sec-pulse')).toBeVisible();
  } finally {
    await app.close();
  }
});
