import test from 'node:test';
import assert from 'node:assert/strict';
import { IMPACT_REGISTRY, IMPACT_OPERATION_IDS } from '../src/config/impactRegistry';

const VALID_STATUS = new Set(['wired', 'partial', 'missing']);

test('impact registry has unique operation ids and complete labels', () => {
  const ids = IMPACT_OPERATION_IDS;
  assert.equal(new Set(ids).size, ids.length, 'duplicate operation ids');
  for (const op of IMPACT_REGISTRY) {
    assert.ok(op.id.trim().length > 0);
    assert.ok(op.labelAr.trim().length > 0);
    assert.ok(op.labelEn.trim().length > 0);
    assert.ok(['unchanged', 'cascade'].includes(op.historicalDocs));
    assert.ok(op.effects.length > 0, `${op.id} must declare at least one effect`);
  }
});

test('impact registry effects are well-formed', () => {
  for (const op of IMPACT_REGISTRY) {
    const seen = new Set<string>();
    for (const effect of op.effects) {
      assert.ok(effect.target.trim().length > 0, `${op.id}: empty target`);
      assert.ok(!seen.has(effect.target), `${op.id}: duplicate target ${effect.target}`);
      seen.add(effect.target);
      assert.ok(VALID_STATUS.has(effect.status), `${op.id}/${effect.target}: invalid status ${effect.status}`);
      if (effect.status !== 'wired') {
        assert.ok(
          typeof effect.note === 'string' && effect.note.trim().length > 0,
          `${op.id}/${effect.target} (${effect.status}) must explain the gap in note`
        );
      }
    }
  }
});

test('impact registry documents every critical business cycle', () => {
  const required = [
    'sales.invoice.create',
    'sales.return.create',
    'sales.invoice.void',
    'purchase.invoice.create',
    'customer.payment.create',
    'supplier.payment.create',
    'inventory.transfer',
    'expense.create',
    'user.permission.update',
    'accounting.taxSetting.update',
  ];
  for (const id of required) {
    assert.ok(IMPACT_OPERATION_IDS.includes(id), `missing impact operation ${id}`);
  }
});
