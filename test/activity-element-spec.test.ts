import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isActivityElementHidden,
  getActivityElementLabel,
  resolveActivityElement,
  resolveActivityElements,
  resolveActivityTabs,
} from '../src/config/activityElementSpec.ts';
import { getActivityRows } from '../src/config/activityCatalog.ts';

test('hiddenPath elements follow route visibility per activity', () => {
  // /pos is hidden for service/office families → pos-checkout hides with it.
  assert.equal(isActivityElementHidden('/sales', 'pos-checkout', 'education'), true);
  assert.equal(isActivityElementHidden('/sales', 'pos-checkout', 'healthcare_admin'), true);
  assert.equal(isActivityElementHidden('/sales', 'pos-checkout', 'ceramics'), false);
  assert.equal(isActivityElementHidden('/sales', 'pos-checkout', 'hospitality'), false);
  // /returns is visible everywhere → sales-return stays.
  assert.equal(isActivityElementHidden('/sales', 'sales-return', 'education'), false);
});

test('hiddenFor resolves activity ids and family ids', () => {
  // discount is hidden for marketing-less office families.
  assert.equal(isActivityElementHidden('/pos', 'discount', 'professional_services'), true);
  assert.equal(isActivityElementHidden('/pos', 'discount', 'services'), true); // same family
  assert.equal(isActivityElementHidden('/pos', 'discount', 'healthcare_admin'), true);
  assert.equal(isActivityElementHidden('/pos', 'discount', 'ceramics'), false);
  assert.equal(isActivityElementHidden('/pos', 'discount', 'hospitality'), false);
});

test('onlyFor keeps an element exclusive to listed activities', () => {
  assert.equal(isActivityElementHidden('/ceramics', 'calculator', 'ceramics'), false);
  assert.equal(isActivityElementHidden('/ceramics', 'calculator', 'sanitary'), true);
  assert.equal(isActivityElementHidden('/ceramics', 'calculator', 'hospitality'), true);
});

test('element labels resolve per activity', () => {
  assert.equal(getActivityElementLabel('/sales', 'new-invoice', 'hospitality'), 'فاتورة إقامة');
  assert.equal(getActivityElementLabel('/sales', 'new-invoice', 'workshop'), 'فاتورة صيانة');
  assert.equal(getActivityElementLabel('/sales', 'new-invoice', 'ceramics'), undefined);
  assert.equal(getActivityElementLabel('/sales', 'pos-checkout', 'ceramics'), undefined);
});

test('descendant paths inherit the nearest ancestor element rules', () => {
  // /customers/:id has no own rules → inherits /customers.
  assert.equal(isActivityElementHidden('/customers/cust_1', 'imported-products', 'ceramics'), true);
  assert.equal(isActivityElementHidden('/customers/cust_1', 'imported-products', 'sanitary'), false);
  // Exact rules win over ancestors.
  assert.equal(isActivityElementHidden('/inventory/expiry', 'print-labels', 'professional_services'), true);
  assert.equal(isActivityElementHidden('/inventory/expiry', 'print-labels', 'food'), false);
});

test('resolveActivityElements returns every declared element state', () => {
  const states = resolveActivityElements('/pos', 'education');
  assert.equal(states.discount?.visible, false);
  assert.equal(states.hold?.visible, true);
  assert.deepEqual(resolveActivityElements('/no-such-page', 'ceramics'), {});
});

test('resolveActivityTabs hides tab elements and applies tab labels', () => {
  const tabs = [
    { id: 'products', label: 'المنتجات', path: '/products' },
    { id: 'barcodes', label: 'الباركود', path: '/products/barcodes' },
  ];
  // Barcodes tab is hidden for office activities via its `tab` element rule.
  const office = resolveActivityTabs(tabs, 'professional_services');
  assert.deepEqual(office.map((t) => t.id), ['products']);
  // Retail activities keep both tabs.
  const retail = resolveActivityTabs(tabs, 'ceramics');
  assert.deepEqual(retail.map((t) => t.id), ['products', 'barcodes']);
  // Path-hidden tabs are filtered too (showroom stock is hidden for offices).
  const stockTabs = [
    { id: 'warehouse', label: 'مخازن', path: '/inventory/warehouse-stock' },
    { id: 'showroom', label: 'معارض', path: '/inventory/showroom-stock' },
  ];
  const officeStock = resolveActivityTabs(stockTabs, 'education');
  assert.deepEqual(officeStock.map((t) => t.id), ['warehouse']);
});

test('every catalog activity resolves element rules without crashing', () => {
  for (const activity of getActivityRows()) {
    const state = resolveActivityElement('/sales', 'pos-checkout', activity.id);
    assert.equal(typeof state.visible, 'boolean');
    resolveActivityElements('/purchases', activity.id);
    resolveActivityTabs([{ id: 't', label: 'x', path: '/sales' }], activity.id);
  }
});
