import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  listScreens,
  screenPermissionBase,
  screenRequirementFor,
  tabPermissionCode,
} from '../src/config/screenRegistry.ts';
import { PAGE_VIEW_PERMISSIONS } from '../src/config/permissionMatrix.ts';
import { ROUTE_PERMISSIONS } from '../src/config/routePermissions.ts';

const samplePath = (pattern: string): string =>
  pattern.includes(':') ? pattern.replace(/:[^/]+/g, 'x1') : pattern;

test('screen registry covers every route rule and page-view pattern', () => {
  const screens = listScreens();
  const patterns = new Set(screens.map((screen) => screen.pathPattern));
  for (const rule of ROUTE_PERMISSIONS) {
    assert.ok(patterns.has(rule.path), `missing screen for route rule ${rule.path}`);
  }
  for (const pattern of Object.keys(PAGE_VIEW_PERMISSIONS)) {
    assert.ok(patterns.has(pattern), `missing screen for page view ${pattern}`);
  }
});

test('requirement merges route rule and page-view code', () => {
  const sales = screenRequirementFor('/sales');
  assert.ok(sales);
  assert.ok(sales.all.includes('sales.view'));
  assert.ok(sales.all.includes('ui.sales.invoices.view'));

  const statements = screenRequirementFor('/reports/statements');
  assert.ok(statements);
  assert.ok(statements.all.includes('reports.financial.view'));
});

test('dynamic page patterns resolve to their own view code', () => {
  const detail = screenRequirementFor('/products/123');
  assert.ok(detail);
  assert.ok(detail.all.includes('products.view'));
  assert.ok(detail.all.includes('ui.products.detail.view'));
});

test('unknown paths have no screen requirement', () => {
  assert.equal(screenRequirementFor('/no-such-screen'), null);
  assert.equal(screenRequirementFor(null), null);
  assert.equal(screenRequirementFor(undefined), null);
});

test('fixed conflicts stay unified', () => {
  const debts = screenRequirementFor('/finance/debts');
  assert.ok(debts?.all.includes('finance.debts.view'));

  const payrollSettings = screenRequirementFor('/employees/payroll/notification-settings');
  assert.ok(payrollSettings?.all.includes('employees.payroll.manage'));
});

test('screen permission base and tab codes', () => {
  const base = screenPermissionBase('/sales');
  assert.equal(base, 'ui.sales.invoices');
  assert.equal(tabPermissionCode(base!, 'payments'), 'ui.sales.invoices.section.payments.view');
  assert.equal(tabPermissionCode(base!, 'no-such-tab'), null);
  assert.equal(screenPermissionBase('/no-such-screen'), null);
});
