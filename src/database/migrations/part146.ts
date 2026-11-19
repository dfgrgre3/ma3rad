import type { Migration } from './support';

/**
 * Migration 230: allow INSERT ... ON CONFLICT upserts on fiscal periods/years.
 *
 * The overlap triggers from migration 124 fired on BEFORE INSERT without
 * excluding the conflicting row itself. Import/merge paths use
 * `INSERT ... ON CONFLICT (id) DO UPDATE`, which still fires BEFORE INSERT
 * triggers, so re-importing an existing period aborted with a false overlap
 * error. Excluding NEW.id keeps genuine overlaps rejected while letting the
 * companion BEFORE UPDATE trigger validate real date changes.
 */
export const MIGRATION_PART_146: Migration = {
  id: '230_fiscal_overlap_triggers_allow_upsert',
  description: 'Exclude the conflicting row from fiscal overlap INSERT triggers so upserts work',
  up: (db) => {
    db.exec(`
      DROP TRIGGER IF EXISTS trg_fiscal_period_no_overlap_insert;
      CREATE TRIGGER trg_fiscal_period_no_overlap_insert
      BEFORE INSERT ON fiscal_periods
      WHEN EXISTS (
        SELECT 1 FROM fiscal_periods fp
        WHERE fp.fiscal_year_id = NEW.fiscal_year_id
          AND fp.id != NEW.id
          AND fp.start_date <= NEW.end_date
          AND fp.end_date >= NEW.start_date
      )
      BEGIN
        SELECT RAISE(ABORT, 'الفترة المالية تتداخل مع فترة موجودة في نفس السنة المالية');
      END;

      DROP TRIGGER IF EXISTS trg_fiscal_year_no_overlap_insert;
      CREATE TRIGGER trg_fiscal_year_no_overlap_insert
      BEFORE INSERT ON fiscal_years
      WHEN EXISTS (
        SELECT 1 FROM fiscal_years fy
        WHERE fy.id != NEW.id
          AND fy.start_date <= NEW.end_date
          AND fy.end_date >= NEW.start_date
      )
      BEGIN
        SELECT RAISE(ABORT, 'السنة المالية تتداخل مع سنة موجودة');
      END;
    `);
  },
};
