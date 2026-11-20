import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getActivityFieldPresets, ACTIVITY_MASTER_FIELD_PRESETS } from '../src/config/activityFieldPresets.ts';
import { OPERATIONAL_ENTITY_TYPES } from '../src/services/domains/products/OperationalFieldService.ts';
import { getActivityRows } from '../src/config/activityCatalog.ts';

test('master presets only target registered operational entity types', () => {
  const known = new Set(OPERATIONAL_ENTITY_TYPES.map((e) => e.value));
  for (const [activity, presets] of Object.entries(ACTIVITY_MASTER_FIELD_PRESETS)) {
    for (const p of presets) assert.ok(known.has(p.entityType), `${activity}: ${p.entityType}`);
  }
});

test('master presets belong to catalog activities', () => {
  const ids = new Set(getActivityRows().map((r) => r.id));
  for (const activity of Object.keys(ACTIVITY_MASTER_FIELD_PRESETS)) assert.ok(ids.has(activity), activity);
});

test('merged presets keep (entityType, code) unique per activity', () => {
  for (const row of getActivityRows()) {
    const keys = getActivityFieldPresets(row.id).map((p) => `${p.entityType}:${p.code}`);
    assert.equal(new Set(keys).size, keys.length, `duplicate field in ${row.id}`);
  }
});

test('select presets always declare options', () => {
  for (const row of getActivityRows()) {
    for (const p of getActivityFieldPresets(row.id)) {
      if (p.dataType === 'SELECT' || p.dataType === 'MULTI_SELECT') {
        assert.ok(p.options?.length, `${row.id}:${p.code}`);
      }
    }
  }
});

test('logistics gains vehicle fields, ceramics gains lead fields', () => {
  assert.ok(getActivityFieldPresets('logistics').some((p) => p.entityType === 'vehicles'));
  assert.ok(getActivityFieldPresets('ceramics').some((p) => p.entityType === 'leads'));
});
