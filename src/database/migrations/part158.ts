import type { Database } from 'sql.js';
import { addColumn, tableExists } from './support';
import type { Migration } from './support';

/**
 * Migration 253: link ceramics area takeoffs to the quotation they produced.
 *
 * When a saved takeoff (مقايسة مساحة) is converted, every row keeps the
 * generated quotation reference so the showroom can trace takeoff → offer.
 */
export const MIGRATION_253_CERAMIC_QUOTE_CONVERSION: Migration = {
  id: '253_ceramic_quote_conversion',
  description: 'Add quotation links to ceramic_area_quotes',
  up: (db: Database) => {
    if (!tableExists(db, 'ceramic_area_quotes')) return;
    addColumn(db, 'ceramic_area_quotes', 'quotation_id', 'TEXT');
    addColumn(db, 'ceramic_area_quotes', 'quotation_number', 'TEXT');
    db.exec(`CREATE INDEX IF NOT EXISTS idx_ceramic_quotes_quotation ON ceramic_area_quotes(quotation_id);`);
  },
};
