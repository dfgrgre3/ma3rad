import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isActivityPathHidden } from '../src/config/activityPageVisibility.ts';
import { isActivityControlHidden } from '../src/config/activityUiRules.ts';
import { resolveHubTabs, resolveHubTabLabel } from '../src/config/activityHubTabs.ts';
import { getActivityRows } from '../src/config/activityCatalog.ts';

test('wildcard hidden paths cover parameterized routes', () => {
  // ceramics hides imported-products tracking for its activity.
  assert.equal(isActivityPathHidden('/customers/imported-products', 'ceramics'), true);
  assert.equal(isActivityPathHidden('/customers/cust_123/imported-products', 'ceramics'), true);
  // The wildcard must not over-match sibling routes.
  assert.equal(isActivityPathHidden('/customers/cust_123/quotations', 'ceramics'), false);
  // Retail-family activities keep the page.
  assert.equal(isActivityPathHidden('/customers/cust_123/imported-products', 'sanitary'), false);
});

test('activity control rules hide POS checkout for service activities only', () => {
  assert.equal(isActivityControlHidden('sales.pos-checkout', 'education'), true);
  assert.equal(isActivityControlHidden('sales.pos-checkout', 'healthcare_admin'), true);
  assert.equal(isActivityControlHidden('sales.pos-checkout', 'ceramics'), false);
  assert.equal(isActivityControlHidden('sales.pos-checkout', 'restaurant'), false);
});

test('control rules resolve through family ids too', () => {
  // professional_services family hides barcode labels for all its activities.
  assert.equal(isActivityControlHidden('products.barcode-labels', 'professional_services'), true);
  assert.equal(isActivityControlHidden('products.barcode-labels', 'services'), true);
  assert.equal(isActivityControlHidden('products.barcode-labels', 'ceramics'), false);
});

test('crm hub tabs get activity labels and activity ordering', () => {
  const tabs = [
    { id: 'dashboard', label: 'لوحة CRM', path: '/crm/dashboard' },
    { id: 'customers', label: 'العملاء', path: '/customers' },
    { id: 'leads', label: 'العملاء المحتملون', path: '/crm/leads' },
  ];
  const resolved = resolveHubTabs('crm', tabs, 'restaurant');
  const byId = new Map(resolved.map((t) => [t.id, t]));
  assert.equal(byId.get('customers')?.label, 'الضيوف');
  assert.equal(byId.get('leads')?.label, 'ضيوف جدد');
  // Restaurant order puts customers first and dashboard last.
  assert.equal(resolved[0].id, 'customers');
  assert.equal(resolved[resolved.length - 1].id, 'dashboard');
});

test('resolveHubTabLabel falls back to the provided label', () => {
  assert.equal(resolveHubTabLabel('crm', 'unknown-tab', 'fallback', 'restaurant'), 'fallback');
  assert.equal(resolveHubTabLabel('receivables', 'installments', 'x', 'education'), 'أقساط الطلاب');
});

test('every catalog activity resolves hub labels without crashing', () => {
  const tabs = [{ id: 'customers', label: 'العملاء', path: '/customers' }];
  for (const activity of getActivityRows()) {
    const [tab] = resolveHubTabs('crm', tabs, activity.id);
    assert.ok(tab.label.length > 0, `empty label for ${activity.id}`);
  }
});
