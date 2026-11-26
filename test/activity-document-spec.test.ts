import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isDocElementHidden,
  getDocElementLabel,
  resolveDocElement,
  resolveDocElements,
  DOC_ELEMENT_RULES,
} from '../src/config/activityDocumentSpec.ts';
import { getActivityRows } from '../src/config/activityCatalog.ts';

test('sales invoice: offices lose counter-only actions', () => {
  // Thermal receipts and goods returns don't apply to B2B office billing.
  assert.equal(isDocElementHidden('/doc/sales_invoice', 'receipt-thermal', 'professional_services'), true);
  assert.equal(isDocElementHidden('/doc/sales_invoice', 'receipt-thermal', 'healthcare_admin'), true);
  assert.equal(isDocElementHidden('/doc/sales_invoice', 'receipt-thermal', 'education'), true);
  assert.equal(isDocElementHidden('/doc/sales_invoice', 'receipt-thermal', 'construction'), true);
  assert.equal(isDocElementHidden('/doc/sales_invoice', 'receipt-thermal', 'ceramics'), false);
  assert.equal(isDocElementHidden('/doc/sales_invoice', 'receipt-thermal', 'hospitality'), false);

  // Service activities can't return goods.
  assert.equal(isDocElementHidden('/doc/sales_invoice', 'return', 'professional_services'), true);
  assert.equal(isDocElementHidden('/doc/sales_invoice', 'return', 'healthcare_admin'), true);
  assert.equal(isDocElementHidden('/doc/sales_invoice', 'return', 'education'), true);
  // Construction sells materials — returns stay.
  assert.equal(isDocElementHidden('/doc/sales_invoice', 'return', 'construction'), false);
  assert.equal(isDocElementHidden('/doc/sales_invoice', 'return', 'ceramics'), false);

  // Universal actions stay visible everywhere.
  for (const id of ['preview', 'print-a4', 'statement', 'collect-payment', 'void']) {
    for (const activity of ['ceramics', 'professional_services', 'healthcare_admin', 'education', 'hospitality']) {
      assert.equal(isDocElementHidden('/doc/sales_invoice', id, activity), false, `${id}/${activity}`);
    }
  }
});

test('quotation: convert-to-order hidden for service offices', () => {
  // Service offices quote services, not stocked orders.
  assert.equal(isDocElementHidden('/doc/quotation', 'convert-to-order', 'professional_services'), true);
  assert.equal(isDocElementHidden('/doc/quotation', 'convert-to-order', 'services'), true); // same family
  assert.equal(isDocElementHidden('/doc/quotation', 'convert-to-order', 'healthcare_admin'), true);
  assert.equal(isDocElementHidden('/doc/quotation', 'convert-to-order', 'education'), true);
  assert.equal(isDocElementHidden('/doc/quotation', 'convert-to-order', 'ceramics'), false);
  assert.equal(isDocElementHidden('/doc/quotation', 'convert-to-order', 'construction'), false);
  // convert-to-invoice stays available for everyone.
  assert.equal(isDocElementHidden('/doc/quotation', 'convert-to-invoice', 'professional_services'), false);
});

test('quotation send label adapts per activity', () => {
  assert.equal(getDocElementLabel('/doc/quotation', 'send', 'hospitality'), 'إرسال للنزيل');
  assert.equal(getDocElementLabel('/doc/quotation', 'send', 'healthcare_admin'), 'إرسال للمريض');
  assert.equal(getDocElementLabel('/doc/quotation', 'send', 'education'), 'إرسال لولي الأمر');
  assert.equal(getDocElementLabel('/doc/quotation', 'send', 'ceramics'), undefined);
});

test('sales order: delivery follows /deliveries route visibility', () => {
  // Activities without a delivery workflow lose "تسجيل تسليم".
  assert.equal(isDocElementHidden('/doc/sales_order', 'delivery', 'healthcare_admin'), true);
  assert.equal(isDocElementHidden('/doc/sales_order', 'delivery', 'education'), true);
  assert.equal(isDocElementHidden('/doc/sales_order', 'delivery', 'ceramics'), false);
});

test('purchase invoice: claims only for traders and producers', () => {
  assert.equal(isDocElementHidden('/doc/purchase_invoice', 'claim', 'import_export'), false);
  assert.equal(isDocElementHidden('/doc/purchase_invoice', 'claim', 'logistics'), false);
  assert.equal(isDocElementHidden('/doc/purchase_invoice', 'claim', 'manufacturing'), false);
  assert.equal(isDocElementHidden('/doc/purchase_invoice', 'claim', 'ceramics'), true);
  assert.equal(isDocElementHidden('/doc/purchase_invoice', 'claim', 'hospitality'), true);
  for (const id of ['print', 'export', 'pay-supplier', 'return']) {
    assert.equal(isDocElementHidden('/doc/purchase_invoice', id, 'ceramics'), false, id);
  }
});

test('unknown elements resolve visible with no overrides', () => {
  const state = resolveDocElement('/doc/sales_invoice', 'not-a-real-element', 'ceramics');
  assert.equal(state.visible, true);
  assert.equal(state.label, undefined);
  assert.equal(state.required, false);
});

test('resolveDocElements returns every declared element state', () => {
  const states = resolveDocElements('/doc/quotation', 'professional_services');
  assert.equal(states['convert-to-order'].visible, false);
  assert.equal(states['convert-to-invoice'].visible, true);
});

test('every catalog activity resolves doc rules without crashing', () => {
  const docPaths = Object.keys(DOC_ELEMENT_RULES);
  for (const activity of getActivityRows()) {
    for (const docPath of docPaths) {
      resolveDocElements(docPath, activity.id);
    }
  }
});

test('required fields: enforced per activity/family on create only', async () => {
  const { isFieldRequiredByActivity } = await import('../src/config/activityDocumentSpec.ts');
  assert.equal(isFieldRequiredByActivity('purchase_invoices', 'INCOTERM', 'import_export'), true);
  assert.equal(isFieldRequiredByActivity('purchase_invoices', 'INCOTERM', 'ceramics'), false);
  assert.equal(isFieldRequiredByActivity('projects', 'SITE_ADDRESS', 'construction'), true);
  assert.equal(isFieldRequiredByActivity('projects', 'site_address', 'ceramics'), false);
});

test('workflow gate: manufacturing invoices only READY/PARTIAL orders', async () => {
  const { isWorkflowActionAllowed, getWorkflowGate } = await import('../src/config/activityDocumentSpec.ts');
  assert.deepEqual(getWorkflowGate('/doc/sales_order', 'convert-to-invoice', 'manufacturing'), ['PARTIAL', 'READY']);
  assert.equal(isWorkflowActionAllowed('/doc/sales_order', 'convert-to-invoice', 'PENDING', 'manufacturing'), false);
  assert.equal(isWorkflowActionAllowed('/doc/sales_order', 'convert-to-invoice', 'READY', 'manufacturing'), true);
  // Ungated activities are unchanged.
  assert.equal(isWorkflowActionAllowed('/doc/sales_order', 'convert-to-invoice', 'PENDING', 'ceramics'), true);
});

// ── Drift guards: activity rules must reference things that really exist ──
test('drift guard: every ACTIVITY_REQUIRED_FIELDS entry targets a real activity/family and a seeded preset', async () => {
  const { ACTIVITY_REQUIRED_FIELDS } = await import('../src/config/activityDocumentSpec.ts');
  const { getActivityFieldPresets } = await import('../src/config/activityFieldPresets.ts');
  const { getActivityFamily } = await import('../src/config/activityCatalog.ts');
  const rows = getActivityRows();
  const activityIds = new Set(rows.map((row) => row.id));

  for (const [scopeId, keys] of Object.entries(ACTIVITY_REQUIRED_FIELDS)) {
    const isActivity = activityIds.has(scopeId);
    const isFamily = Boolean(getActivityFamily(scopeId));
    assert.ok(isActivity || isFamily, `ACTIVITY_REQUIRED_FIELDS: unknown activity/family "${scopeId}"`);
    // A family-scoped rule is satisfied by any member activity seeding the field.
    const owners = isActivity ? [scopeId] : rows.filter((row) => row.familyId === scopeId).map((row) => row.id);
    for (const key of keys) {
      const seeded = owners.some((owner) =>
        getActivityFieldPresets(owner).some((p) => `${p.entityType}:${p.code.toUpperCase()}` === key));
      assert.ok(seeded, `ACTIVITY_REQUIRED_FIELDS["${scopeId}"] requires "${key}" but no preset seeds it`);
    }
  }
});

test('drift guard: every DOC_WORKFLOW_GATES scope is a real activity/family and has non-empty statuses', async () => {
  const { DOC_WORKFLOW_GATES } = await import('../src/config/activityDocumentSpec.ts');
  const { getActivityFamily } = await import('../src/config/activityCatalog.ts');
  const activityIds = new Set(getActivityRows().map((row) => row.id));
  for (const [docPath, scopes] of Object.entries(DOC_WORKFLOW_GATES)) {
    assert.ok(docPath in DOC_ELEMENT_RULES, `gate on unknown document type ${docPath}`);
    for (const [scopeId, gates] of Object.entries(scopes)) {
      assert.ok(activityIds.has(scopeId) || getActivityFamily(scopeId), `gate scope "${scopeId}" is unknown`);
      for (const [elementId, statuses] of Object.entries(gates)) {
        assert.ok(elementId in DOC_ELEMENT_RULES[docPath], `${docPath} gate targets undeclared element "${elementId}"`);
        assert.ok(statuses.length > 0, `${docPath}/${elementId} gate has no allowed statuses`);
      }
    }
  }
});

test('drift guard: declared profile workflows have steps and unique ids', async () => {
  const { getBusinessProfile } = await import('../src/config/businessProfiles.ts');
  for (const row of getActivityRows()) {
    const workflows = getBusinessProfile(row.id).workflows ?? [];
    const ids = workflows.map((w) => w.id);
    assert.equal(new Set(ids).size, ids.length, `${row.id}: duplicate workflow ids`);
    for (const w of workflows) assert.ok(w.steps.length >= 2, `${row.id}/${w.id}: a workflow needs at least 2 steps`);
  }
});
