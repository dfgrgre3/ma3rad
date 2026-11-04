import { expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Shared fixture for Electron end-to-end tests.
 *
 * Each test launches the built bundle (dist/index.html) inside Electron with a
 * throwaway CERAMISYS_USER_DATA_DIR so a run never reads or writes a real
 * installation's database.
 */

export const ROOT = process.cwd();
export const APP_HTML = pathToFileURL(path.join(ROOT, 'dist', 'index.html')).href;

export function tempDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ceramisys-e2e-'));
}

export function seedReturningInstallation(dataDir: string): void {
  execFileSync(
    process.execPath,
    ['--import', './test/register-hook.mjs', 'scripts/e2e/seed-db.ts', dataDir],
    { cwd: ROOT, stdio: 'pipe' }
  );
}

export async function mockLicenseApi(page: Page): Promise<void> {
  await page.evaluate(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const requestUrl = typeof input === 'string'
        ? input
        : input instanceof URL ? input.href : input.url;
      if (!requestUrl.endsWith('/api/v1/licensing/activate')) return originalFetch(input, init);

      const request = JSON.parse(String(init?.body || '{}')) as { activationCode?: string };
      const valid = request.activationCode === 'VALID-CODE';
      return new Response(JSON.stringify(valid
        ? { deviceCredential: 'test-device-credential' }
        : { message: 'رمز التفعيل غير صحيح.' }), {
        status: valid ? 200 : 401,
        headers: { 'Content-Type': 'application/json' },
      });
    };
  });
}

export async function launchApp(dataDir: string): Promise<{ app: ElectronApplication; page: Page }> {
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
  await mockLicenseApi(page);
  return { app, page };
}

export async function launchSeededApp(): Promise<{ app: ElectronApplication; page: Page; dataDir: string }> {
  const dataDir = tempDataDir();
  seedReturningInstallation(dataDir);
  const { app, page } = await launchApp(dataDir);
  return { app, page, dataDir };
}

export async function activate(page: Page): Promise<void> {
  // Wait for the (possibly async) first render to settle before deciding which
  // screen we landed on.
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await page.locator('#username').isVisible().catch(() => false)) return;
    if (await page.getByLabel('رابط خادم الترخيص').isVisible().catch(() => false)) break;
    await page.waitForTimeout(250);
  }
  if (await page.locator('#username').isVisible().catch(() => false)) return;

  await expect(page.getByLabel('رابط خادم الترخيص')).toBeVisible();
  await page.getByLabel('رابط خادم الترخيص').fill('http://localhost:4000');
  await page.getByRole('textbox', { name: 'رمز التفعيل', exact: true }).fill('VALID-CODE');
  await page.getByRole('button', { name: 'تحقق وانتقل لتسجيل الدخول' }).click();
  await expect(page.locator('#username')).toBeVisible();
}

export async function login(page: Page): Promise<void> {
  await expect(page.locator('#username')).toBeVisible();
  await page.locator('#username').fill('admin');
  await page.locator('#password').fill('admin123');
  await page.locator('form button[type="submit"]').click();
}

/** Seed + activate + login; lands on the dashboard of a returning installation. */
export async function launchAuthenticatedApp(): Promise<{ app: ElectronApplication; page: Page; dataDir: string }> {
  const seeded = await launchSeededApp();
  await activate(seeded.page);
  await login(seeded.page);
  return seeded;
}
