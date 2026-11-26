import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  expandPermissionCodes,
  featureHiddenPathsForPlan,
  isGranularPermissionCode,
  permissionsForPagePath,
  routePatternMatches,
} from '../src/pages/platform/components/access/pageAccessRules';
import { GRANULAR_PERMISSIONS } from '../src/config/permissionMatrix';

test('routePatternMatches: exact and parameterized patterns', () => {
  assert.equal(routePatternMatches('/sales', '/sales'), true);
  assert.equal(routePatternMatches('/sales', '/sales/orders'), false);
  assert.equal(routePatternMatches('/products/:id', '/products/abc-123'), true);
  assert.equal(routePatternMatches('/products/:id', '/products'), false);
  assert.equal(routePatternMatches('/products/:id/details', '/products/9/details'), true);
  assert.equal(routePatternMatches('/sales', '/Sales'), true); // case handled by caller paths; pattern compare is literal — check actual
});

test('routePatternMatches: trailing slashes and query strings', () => {
  assert.equal(routePatternMatches('/sales/', '/sales'), true);
  assert.equal(routePatternMatches('/sales', '/sales?tab=1'), true);
});

test('permissionsForPagePath returns granular defs bound to the route', () => {
  const perms = permissionsForPagePath('/sales');
  assert.ok(perms.length > 0, 'expected granular permissions for /sales');
  assert.ok(perms.every((p) => p.route && routePatternMatches(p.route, '/sales')));
});

test('isGranularPermissionCode / expandPermissionCodes', () => {
  const sample = GRANULAR_PERMISSIONS[0];
  assert.equal(isGranularPermissionCode(sample.code), true);
  assert.equal(isGranularPermissionCode('sales.create'), false);
  const expanded = expandPermissionCodes(sample.code);
  assert.ok(expanded.includes(sample.code));
  if (sample.legacy) assert.ok(expanded.includes(sample.legacy));
});

test('featureHiddenPathsForPlan mirrors central feature→page gating', () => {
  // 'multi_branch' statically owns /branches even without a flag row.
  const hidden = featureHiddenPathsForPlan([], new Set());
  assert.ok(hidden.includes('/branches'));
  assert.ok(hidden.includes('/reports/statements'));
  // Including the feature removes its pages.
  const hidden2 = featureHiddenPathsForPlan([], new Set(['multi_branch', 'advanced_reports']));
  assert.ok(!hidden2.includes('/branches'));
  assert.ok(!hidden2.includes('/reports/statements'));
  // Admin-managed pagePaths on a flag row are honored for excluded codes.
  const hidden3 = featureHiddenPathsForPlan(
    [{ id: 'f1', code: 'custom_feat', name: 'Custom', isEnabled: true, rolloutPercent: 100, isStagingOnly: false, pagePaths: ['/custom-page'] } as any],
    new Set()
  );
  assert.ok(hidden3.includes('/custom-page'));
});
