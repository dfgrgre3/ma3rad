import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NAV_GROUPS } from '../src/config/navigation.tsx';
import { getActivityRows } from '../src/config/activityCatalog.ts';
import { getActivityHiddenPaths, isActivityPathHidden } from '../src/config/activityPageVisibility.ts';
import { getActivityNavLabel } from '../src/config/activityNavLabels.ts';
import { getActivityPathCopy } from '../src/config/activityPathCopy.ts';
import { getActivitySpec, getActivitySpecs } from '../src/config/activitySpec.ts';

const navPaths = NAV_GROUPS.flatMap((group) => group.items.map((item) => item.to));

test('activity spec exposes one entry per catalog activity', () => {
  const catalogIds = getActivityRows().map((row) => row.id);
  assert.deepEqual(getActivitySpecs().map((spec) => spec.id), catalogIds);
});

test('activity spec delegates to the existing sources for every activity and nav path', () => {
  for (const spec of getActivitySpecs()) {
    assert.deepEqual(spec.hiddenPaths(), getActivityHiddenPaths(spec.id), `hiddenPaths ${spec.id}`);
    for (const path of navPaths) {
      assert.equal(
        spec.isPathHidden(path),
        isActivityPathHidden(path, spec.id),
        `isPathHidden ${spec.id} ${path}`,
      );
      assert.equal(spec.navLabel(path), getActivityNavLabel(path, spec.id), `navLabel ${spec.id} ${path}`);
      assert.deepEqual(spec.pathCopy(path), getActivityPathCopy(path, spec.id), `pathCopy ${spec.id} ${path}`);
    }
  }
});

test('getActivitySpec returns the requested activity with its family', () => {
  const spec = getActivitySpec('manufacturing');
  assert.equal(spec.id, 'manufacturing');
  assert.equal(spec.familyId, 'manufacturing');
  assert.equal(spec.label, 'التصنيع والإنتاج');
});

test('getActivitySpec for an unknown id matches the existing sources', () => {
  const spec = getActivitySpec('unknown_activity_xyz');
  assert.equal(spec.id, 'unknown_activity_xyz');
  assert.equal(spec.familyId, '');
  for (const path of navPaths) {
    assert.equal(spec.isPathHidden(path), isActivityPathHidden(path, 'unknown_activity_xyz'));
  }
});
