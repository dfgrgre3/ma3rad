import { test, expect } from '@playwright/test';
import { launchAuthenticatedApp } from './support/app.fixture';
import fs from 'node:fs';
import path from 'node:path';

const HIGH_RISK_ROUTES = [
  'dashboard',
  'pos',
  'sales',
  'sales/cycle',
  'returns',
  'orders',
  'quotations',
  'products',
  'inventory',
  'inventory/counts',
  'inventory/transfers',
  'purchases',
  'purchases/orders',
  'purchases/returns',
  'customers',
  'suppliers',
  'cashboxes',
  'finance',
  'finance/expenses',
  'finance/journal',
  'reports',
  'settings',
  'admin',
  'users',
  'audit',
] as const;

test('high-risk routes render without uncaught page errors (single app session)', async () => {
  const { app, page } = await launchAuthenticatedApp();
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const results: Array<{ route: string; interactive: number; errors: string[]; status: 'PASS' | 'BROKEN' }> = [];

  try {
    for (const route of HIGH_RISK_ROUTES) {
      const before = pageErrors.length;
      await page.evaluate((hash) => { window.location.hash = hash; }, `#/${route}`);

      const deadline = Date.now() + 15_000;
      let interactive = 0;
      while (Date.now() < deadline && interactive === 0) {
        interactive = await page.locator('#root button, #root input, #root select, #root a[href], #root [role="tab"]').count();
        if (interactive === 0) await page.waitForTimeout(250);
      }

      const newErrors = pageErrors.slice(before);
      const status: 'PASS' | 'BROKEN' = interactive > 0 && newErrors.length === 0 ? 'PASS' : 'BROKEN';
      results.push({ route, interactive, errors: newErrors, status });

      // eslint-disable-next-line no-console
      console.log(`AUDIT ${status.padEnd(6)} #/${route} (interactive=${interactive}, newErrors=${newErrors.length})`);
    }
  } finally {
    await app.close();
  }

  const reportPath = path.join(process.cwd(), 'docs', 'ui-audit', 'smoke-report.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));

  const broken = results.filter((r) => r.status === 'BROKEN');
  for (const r of broken) {
    console.log(`BROKEN #/${r.route}: interactive=${r.interactive}, errors=${r.errors.join(' | ')}`);
  }
  expect(broken, `${broken.length} route(s) failed smoke audit`).toHaveLength(0);
});
