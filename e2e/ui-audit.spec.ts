import { test, expect } from '@playwright/test';
import { launchSeededApp, login, waitForLogin } from './support/app.fixture';
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
  'system-health',
  'admin',
  'users',
  'audit',
] as const;

const EXPECTED_HEADINGS: Record<(typeof HIGH_RISK_ROUTES)[number], string> = {
  dashboard: 'لوحة المعلومات',
  pos: 'نقطة البيع السريعة',
  sales: 'مركز المبيعات',
  'sales/cycle': 'دورة الفاتورة',
  returns: 'مرتجع مبيعات المعرض',
  orders: 'طلبات وحجوزات العملاء',
  quotations: 'عروض الأسعار والمقايسات',
  products: 'إدارة الأصناف المتكاملة',
  inventory: 'إدارة مخزون المعرض',
  'inventory/counts': 'جرد المخزون',
  'inventory/transfers': 'التحويلات المخزنية',
  purchases: 'فواتير المشتريات وتكاليف الوصول',
  'purchases/orders': 'أوامر الشراء',
  'purchases/returns': 'مرتجعات الشراء',
  customers: 'إدارة العملاء',
  suppliers: 'إدارة الموردون',
  cashboxes: 'الخزينة النقدية والورديات',
  finance: 'المؤشرات المالية',
  'finance/expenses': 'إدارة المصروفات التشغيلية',
  'finance/journal': 'القيود اليومية وميزان المراجعة',
  reports: 'مركز التقارير والتحليلات',
  settings: 'مركز إعدادات النظام',
  'system-health': 'مركز صحة النظام وتشخيصه',
  admin: 'مركز التحكم الإداري',
  users: 'مركز التحكم الإداري',
  audit: 'سجل المراجعة والأمان',
};

test('high-risk routes render without uncaught page errors (single app session)', async () => {
  const { app, page, closeMockServer } = await launchSeededApp();
  await waitForLogin(page);
  await login(page);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const results: Array<{
    route: string;
    heading: string;
    expectedHeading: string;
    interactive: number;
    pageContentChanged: boolean;
    routeSpecificReady: boolean;
    errors: string[];
    status: 'PASS' | 'BROKEN';
  }> = [];

  try {
    for (const route of HIGH_RISK_ROUTES) {
      const before = pageErrors.length;
      const main = page.locator('main.app-main');
      const expectedHeading = EXPECTED_HEADINGS[route];
      const previousContent = await main.innerText();
      const previousHash = await page.evaluate(() => window.location.hash);
      await page.evaluate((hash) => { window.location.hash = hash; }, `#/${route}`);

      const deadline = Date.now() + 15_000;
      let interactive = 0;
      let heading = '';
      let pageContentChanged = previousHash === `#/${route}`;
      let routeSpecificReady = false;
      let currentHash = '';
      while (Date.now() < deadline && (
        !interactive || !heading.includes(expectedHeading) || !pageContentChanged
        || !routeSpecificReady || currentHash !== `#/${route}`
      )) {
        interactive = await main.locator('button, input, select, a[href], [role="tab"]').count();
        const headings = main.locator('h1, h2, h3');
        if (interactive && await headings.count()) heading = (await headings.first().innerText()).trim();
        currentHash = await page.evaluate(() => window.location.hash);
        pageContentChanged = previousHash === `#/${route}`
          || (await main.innerText()) !== previousContent;
        routeSpecificReady = route !== 'users'
          || (await main.getByRole('tablist').getByRole('button', { name: 'المستخدمون', exact: true })
            .getAttribute('aria-selected')) === 'true';
        if (!interactive || !heading.includes(expectedHeading) || !pageContentChanged
          || !routeSpecificReady || currentHash !== `#/${route}`) {
          await page.waitForTimeout(250);
        }
      }

      const newErrors = pageErrors.slice(before);
      const status: 'PASS' | 'BROKEN' = currentHash === `#/${route}`
        && interactive > 0 && heading.includes(expectedHeading) && pageContentChanged
        && routeSpecificReady && newErrors.length === 0
        ? 'PASS'
        : 'BROKEN';
      results.push({
        route,
        heading,
        expectedHeading,
        interactive,
        pageContentChanged,
        routeSpecificReady,
        errors: newErrors,
        status,
      });

      console.log(`AUDIT ${status.padEnd(6)} #/${route} (heading="${heading}", contentControls=${interactive}, newErrors=${newErrors.length})`);
    }

    await page.evaluate(() => { window.location.hash = '#/system-health'; });
    const refreshDiagnostics = page.getByRole('button', { name: 'إعادة الفحص' });
    await expect(refreshDiagnostics).toBeVisible();
    await refreshDiagnostics.click();
    await expect(page.getByText(/آخر فحص:/)).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  } finally {
    await app.close();
    await closeMockServer();
  }

  const reportPath = path.join(process.cwd(), 'docs', 'ui-audit', 'smoke-report.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));

  const broken = results.filter((r) => r.status === 'BROKEN');
  for (const r of broken) {
    console.log(`BROKEN #/${r.route}: expected="${r.expectedHeading}", actual="${r.heading}", contentChanged=${r.pageContentChanged}, routeSpecific=${r.routeSpecificReady}, controls=${r.interactive}, errors=${r.errors.join(' | ')}`);
  }
  expect(broken, `${broken.length} route(s) failed smoke audit`).toHaveLength(0);
});
