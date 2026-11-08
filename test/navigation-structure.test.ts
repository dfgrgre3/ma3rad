import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { Navigate } from 'react-router-dom';
import { NAV_GROUPS } from '../src/config/navigation.tsx';
import { appRoutes } from '../src/router/routesList.tsx';
import { resolveNavigationBreadcrumbs } from '../src/utils/resolvePageTitle.ts';

const expectedSections = [
  'الرئيسية',
  'مركز العمل اليومي',
  'المبيعات',
  'المخزون والمستودعات',
  'المشتريات والموردون',
  'العملاء وإدارة العلاقات CRM',
  'المالية والحسابات',
  'إدارة المنشأة والموارد البشرية',
  'التقارير والتحليلات',
  'المستندات والموافقات',
  'إدارة النظام',
];

test('navigation has the required 11 sections and no duplicate destinations', () => {
  const paths = NAV_GROUPS.flatMap((group) => group.items.map((item) => item.to));

  assert.deepEqual(NAV_GROUPS.map((group) => group.label), expectedSections);
  assert.equal(NAV_GROUPS.length, 11);
  assert.equal(new Set(paths).size, paths.length);
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
