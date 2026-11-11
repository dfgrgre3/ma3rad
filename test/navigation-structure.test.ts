import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { Navigate } from 'react-router-dom';
import { NAV_GROUPS, NAV_STORAGE_KEYS } from '../src/config/navigation.tsx';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { appRoutes } from '../src/router/routesList.tsx';
import { NavigationService } from '../src/services/domains/config/NavigationService.ts';
import { resolveNavigationBreadcrumbs } from '../src/utils/navigation/resolvePageTitle.ts';

const expectedSections = [
  'الرئيسية',
  'مركز العمل اليومي',
  'المبيعات',
  'المخزون والمستودعات',
  'المشتريات والموردون',
  'العملاء وإدارة العلاقات CRM',
  'المالية والحسابات',
  'إدارة المنشأة والعمليات',
  'إدارة الموارد البشرية',
  'التقارير والتحليلات',
  'المستندات والموافقات',
  'إدارة النظام',
];

const expectedHrPermissions: Record<string, string> = {
  '/hr/dashboard': 'employees.view',
  '/employees': 'employees.view',
  '/employees/attendance': 'employees.view',
  '/employees/payroll': 'employees.payroll.view',
  '/employees/commissions': 'employees.payroll.view',
  '/employees/leave': 'hr.leave.view',
  '/hr/organization': 'employees.view',
  '/hr/performance': 'employees.payroll.view',
  '/hr/training': 'employees.payroll.view',
  '/hr/discipline': 'employees.payroll.view',
  '/hr/benefits': 'employees.payroll.view',
  '/employees/contracts': 'hr.contracts.view',
  '/employees/documents': 'hr.documents.view',
  '/employees/recruitment': 'hr.recruitment.view',
  '/hr/self-service': 'hr.selfservice.view',
};

const expectedHrPaths = Object.keys(expectedHrPermissions);

const expectedOperationsPaths = [
  '/fleet/dashboard',
  '/branches',
  '/facility-management',
  '/warehouses',
  '/operations/shifts',
  '/deliveries',
  '/drivers',
  '/vehicles',
  '/manufacturing',
];

test('navigation has the required 12 sections and no duplicate destinations', () => {
  const paths = NAV_GROUPS.flatMap((group) => group.items.map((item) => item.to));

  assert.deepEqual(NAV_GROUPS.map((group) => group.label), expectedSections);
  assert.equal(NAV_GROUPS.length, 12);
  assert.equal(new Set(paths).size, paths.length);
});

test('HR routes have a dedicated group without reducing operations route coverage', () => {
  const hr = NAV_GROUPS.find((group) => group.id === 'hr');
  const operations = NAV_GROUPS.find((group) => group.id === 'operations');
  const dashboard = NAV_GROUPS.find((group) => group.id === 'dashboard');

  assert.ok(hr);
  assert.deepEqual(hr.items.map((item) => item.to).sort(), [...expectedHrPaths].sort());
  assert.deepEqual(
    Object.fromEntries(hr.items.map(({ to, perm }) => [to, perm])),
    expectedHrPermissions,
  );
  assert.ok(operations);
  assert.ok(dashboard);
  assert.deepEqual(operations.items.map((item) => item.to).sort(), [...expectedOperationsPaths].sort());
  assert.ok(!operations.items.some((item) => expectedHrPaths.includes(item.to)));
  assert.ok(!dashboard.items.some((item) => expectedHrPaths.includes(item.to)));
});

test('default navigation order and customized HR item order survive migration', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  const keys = [
    NAV_STORAGE_KEYS.groupsOrder,
    NAV_STORAGE_KEYS.itemsOrder,
    NAV_STORAGE_KEYS.groupAssignments,
  ];
  const previous = new Map(keys.map((key) => [
    key,
    db.query<{ value: string }>('SELECT value FROM system_settings WHERE key = ?', [key])[0]?.value,
  ]));
  const customHrOrder = ['/employees/recruitment', '/employees/payroll', '/employees'];

  try {
    db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [
      NAV_STORAGE_KEYS.groupsOrder,
      '[]',
    ]);
    db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [
      NAV_STORAGE_KEYS.itemsOrder,
      JSON.stringify({ operations: [...customHrOrder, '/fleet/dashboard'] }),
    ]);
    db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [
      NAV_STORAGE_KEYS.groupAssignments,
      '{}',
    ]);

    const groups = NavigationService.getGroups();
    assert.deepEqual(groups.map((group) => group.id).slice(0, 2), ['dashboard', 'daily']);
    assert.deepEqual(
      groups.find((group) => group.id === 'hr')?.items.slice(0, customHrOrder.length).map((item) => item.to),
      customHrOrder,
    );
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) db.run('DELETE FROM system_settings WHERE key = ?', [key]);
      else db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [key, value]);
    }
  }
});

test('every static non-alias page route has one primary navigation destination', () => {
  const paths = new Set(NAV_GROUPS.flatMap((group) => group.items.map((item) => item.to)));
  const samePageAliases = new Set(['/products/catalog', '/inventory', '/crm/hub']);
  const missing = appRoutes
    .filter((route) => !route.path.includes(':') && route.path !== '*')
    .filter((route) => !(React.isValidElement(route.element) && route.element.type === Navigate))
    .filter((route) => !samePageAliases.has(`/${route.path}`))
    .map((route) => `/${route.path}`)
    .filter((path) => !paths.has(path));

  assert.deepEqual(missing, []);
});

test('primary destinations use canonical routes while existing aliases remain registered', () => {
  const paths = new Set(NAV_GROUPS.flatMap((group) => group.items.map((item) => item.to)));
  const routePaths = new Set(appRoutes.map((route) => `/${route.path}`));

  assert.ok(paths.has('/sales/orders-deposits'));
  assert.ok(paths.has('/sales/analytics'));
  assert.ok(paths.has('/cashboxes'));
  assert.ok(paths.has('/data-import/types'));
  assert.ok(!paths.has('/sales/reservations'));
  assert.ok(!paths.has('/products/catalog'));
  assert.ok(routePaths.has('/sales/reservations'));
  assert.ok(routePaths.has('/products/catalog'));
  assert.ok(routePaths.has('/inventory'));
  assert.ok(routePaths.has('/crm/hub'));
});

test('breadcrumbs use accessible canonical labels and never expose detail identifiers', () => {
  const groups = NAV_GROUPS.filter((group) =>
    group.items.some((item) => ['/customers', '/products', '/suppliers', '/projects'].includes(item.to))
  );
  const cases = [
    ['/customers/cust_123', 'تفاصيل العميل', '/customers'],
    ['/products/prod_456', 'تفاصيل المنتج', '/products'],
    ['/suppliers/sup_789', 'تفاصيل المورد', '/suppliers'],
    ['/projects/proj_987', 'تفاصيل المشروع', '/projects'],
  ] as const;

  for (const [pathname, detailLabel, parentPath] of cases) {
    const result = resolveNavigationBreadcrumbs(pathname, groups);
    assert.equal(result.title, detailLabel);
    assert.deepEqual(result.breadcrumbs.map((crumb) => crumb.label), [
      result.group,
      groups.flatMap((group) => group.items).find((item) => item.to === parentPath)?.label,
      detailLabel,
    ]);
    assert.equal(result.breadcrumbs[1].path, parentPath);
    assert.ok(!result.breadcrumbs.some((crumb) => crumb.label.includes(pathname.split('/').pop()!)));
  }
});

test('breadcrumb aliases resolve to primary paths and inaccessible labels stay hidden', () => {
  const sales = NAV_GROUPS.filter((group) => group.id === 'sales');
  const alias = resolveNavigationBreadcrumbs('/sales/reservations?tab=current', sales);
  assert.equal(alias.breadcrumbs.at(-1)?.label, 'الحجوزات والعربونات');
  assert.equal(alias.breadcrumbs.at(-1)?.path, undefined);

  const hiddenCustomers = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.to !== '/customers'),
  })).filter((group) => group.items.length > 0);
  const inaccessibleDetail = resolveNavigationBreadcrumbs('/customers/private-id', hiddenCustomers);
  assert.equal(inaccessibleDetail.title, 'سيراميسيس');
  assert.ok(!inaccessibleDetail.breadcrumbs.some((crumb) => crumb.label === 'العملاء'));
});
