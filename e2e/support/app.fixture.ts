import { expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BYPASS_FIRST_RUN_ACTIVATION } from '../../src/config/setupLifecycle';

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

export async function startMockLicenseServer(): Promise<{ origin: string; close: () => Promise<void> }> {
  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const send = (status: number, value: unknown) => {
        response.writeHead(status, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(value));
      };

      if (request.url === '/api/v1/licensing/activate' && request.method === 'POST') {
        let payload: { activationCode?: string };
        try {
          payload = JSON.parse(body) as { activationCode?: string };
        } catch {
          send(400, { message: 'Invalid request.' });
          return;
        }
        if (payload.activationCode !== 'VALID-CODE') {
          send(401, { message: 'رمز التفعيل غير صحيح.' });
          return;
        }
        send(200, {
          deviceCredential: 'test-device-credential',
          localAccount: {
            username: 'admin',
            fullName: 'Administrator',
            role: 'admin',
            phone: '01000000000',
          },
        });
        return;
      }

      if (request.url === '/api/v1/licensing/validate' && request.method === 'POST') {
        send(200, { valid: true });
        return;
      }
      if (request.method === 'GET') {
        send(200, request.url === '/api/v1/releases' ? [] : {});
        return;
      }
      if (request.method === 'POST') {
        send(200, {});
        return;
      }
      send(404, { message: 'Not found.' });
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    throw new Error('Mock licensing server did not bind to a TCP port.');
  }
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

async function setLicenseServer(page: Page, origin: string): Promise<void> {
  await page.evaluate((serverOrigin) => {
    localStorage.setItem('central_server_url', serverOrigin);
  }, origin);
}

export async function launchApp(dataDir: string): Promise<{
  app: ElectronApplication;
  page: Page;
  closeMockServer: () => Promise<void>;
}> {
  const mockServer = await startMockLicenseServer();
  let app: ElectronApplication;
  const launchEnv = { ...process.env };
  // Some IDE/automation shells set this flag globally. It makes the Electron
  // executable run as plain Node, which breaks Playwright's Electron launcher.
  delete launchEnv.ELECTRON_RUN_AS_NODE;
  try {
    app = await electron.launch({
      args: [ROOT],
      cwd: ROOT,
      env: {
        ...launchEnv,
        CERAMISYS_E2E: '1',
        CERAMISYS_USER_DATA_DIR: dataDir,
        CENTRAL_API_URL: mockServer.origin,
        VITE_DEV_SERVER_URL: APP_HTML,
      },
    });
  } catch (error) {
    await mockServer.close();
    throw error;
  }
  try {
    // Seeded databases may run migrations and create an encrypted backup before
    // the first BrowserWindow is created. Keep the launcher timeout separate
    // from Playwright's default 30-second assertion timeout.
    const page = await app.firstWindow({ timeout: 90_000 });
    await page.waitForLoadState('domcontentloaded');
    if (!BYPASS_FIRST_RUN_ACTIVATION) {
      await setLicenseServer(page, mockServer.origin);
    }
    return { app, page, closeMockServer: mockServer.close };
  } catch (error) {
    await app.close();
    await mockServer.close();
    throw error;
  }
}

export async function launchSeededApp(): Promise<{
  app: ElectronApplication;
  page: Page;
  dataDir: string;
  closeMockServer: () => Promise<void>;
}> {
  const dataDir = tempDataDir();
  seedReturningInstallation(dataDir);
  const { app, page, closeMockServer } = await launchApp(dataDir);
  return { app, page, dataDir, closeMockServer };
}

export async function activate(page: Page): Promise<void> {
  const loginOrActivationAccount = page.locator('#username').or(page.getByLabel('اسم الحساب'));
  await expect(loginOrActivationAccount).toBeVisible({ timeout: 90_000 });
  if (await page.locator('#username').isVisible().catch(() => false)) return;

  await page.getByLabel('اسم الحساب').fill('admin');
  await page.getByLabel('كلمة المرور').fill('admin123');
  await page.getByLabel('رقم الهاتف').fill('01000000000');
  await page.getByLabel('مفتاح الترخيص').fill('VALID-CODE');
  await page.getByRole('button', { name: 'تحقق وانتقل لتسجيل الدخول' }).click();
  await expect(page.locator('#username')).toBeVisible();
}

const DEFAULT_E2E_ADMIN_PASSWORD = 'admin123';
const STRONG_E2E_ADMIN_PASSWORD = 'E2eTest2026!';

async function completePasswordChangeIfNeeded(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'تغيير كلمة المرور الافتراضية' });
  let seen = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await dialog.isVisible().catch(() => false)) {
      seen = true;
      break;
    }
    await page.waitForTimeout(250);
  }
  if (!seen) return;

  await dialog.locator('#current-password').fill(DEFAULT_E2E_ADMIN_PASSWORD);
  await dialog.locator('#new-password').fill(STRONG_E2E_ADMIN_PASSWORD);
  await dialog.locator('#confirm-password').fill(STRONG_E2E_ADMIN_PASSWORD);
  await dialog.getByRole('button', { name: 'حفظ كلمة المرور وتأمين النظام' }).click();
  await expect(dialog).toHaveCount(0, { timeout: 30_000 });
}

export async function login(page: Page): Promise<void> {
  await expect(page.locator('#username')).toBeVisible();
  await page.locator('#username').fill('admin');
  await page.locator('#password').fill(DEFAULT_E2E_ADMIN_PASSWORD);
  await page.locator('#password').press('Enter');

  await completePasswordChangeIfNeeded(page);
  await expect(page.locator('#username')).toBeHidden({ timeout: 30_000 });
}

/** Seed and restore a valid local admin session for authenticated UI journeys. */
export async function launchAuthenticatedApp(): Promise<{
  app: ElectronApplication;
  page: Page;
  dataDir: string;
  closeMockServer: () => Promise<void>;
}> {
  const seeded = await launchSeededApp();
  await expect(seeded.page.locator('#username').or(seeded.page.getByLabel('اسم الحساب')))
    .toBeVisible({ timeout: 90_000 });
  await seeded.page.addInitScript(() => {
    sessionStorage.setItem('ceramisys_runtime_initialized', '1');
    localStorage.setItem('ceramisys_session_user_id', 'usr_admin');
  });
  await seeded.page.reload();
  await expect(seeded.page.locator('#sec-pulse')).toBeVisible({ timeout: 90_000 });
  const passwordDialog = seeded.page.getByRole('dialog', { name: 'تغيير كلمة المرور الافتراضية' });
  await expect(passwordDialog).toBeVisible();
  await passwordDialog.locator('#current-password').fill('admin123');
  await passwordDialog.locator('#new-password').fill('E2eTest2026!');
  await passwordDialog.locator('#confirm-password').fill('E2eTest2026!');
  await passwordDialog.getByRole('button', { name: 'حفظ كلمة المرور وتأمين النظام' }).click();
  await expect(passwordDialog).toHaveCount(0);
  return seeded;
}
