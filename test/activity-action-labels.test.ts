import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveBusinessTerm } from '../src/config/businessTerminology.ts';
import { getActivityRows } from '../src/config/activityCatalog.ts';

const POS_SUFFIX_FILES = [
  'src/components/sales/SalesView.tsx',
  'src/pages/sales/sales-analytics/SalesAnalyticsPage.tsx',
];

test('the new-invoice action label resolves to a non-empty term for every activity', () => {
  for (const activity of getActivityRows()) {
    const label = resolveBusinessTerm('actions.newInvoice', {
      businessType: activity.id,
      language: 'ar',
    });
    assert.ok(label.trim().length > 0, `empty label for ${activity.id}`);
    assert.ok(!label.includes('(POS)'), `POS suffix leaked into term for ${activity.id}`);
  }
});

test('activity-specific new-invoice terms are not overridden by a fixed POS suffix', () => {
  for (const file of POS_SUFFIX_FILES) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.ok(!source.includes('{newInvoiceLabel} (POS)'), `hardcoded POS suffix still in ${file}`);
  }
});
