import type { Migration } from './support';
import { tableExists } from './support';

// Fiscal periods within one fiscal year must not overlap, and fiscal years
// must not overlap each other. Previously this was only enforced by services,
// so direct writes could create ambiguous accounting periods.
export const MIGRATION_PART_124: Migration = {
  id: '209_fiscal_period_non_overlap',
  description: 'Prevent overlapping fiscal periods and fiscal years at the database level',
  up: (db) => {
    if (tableExists(db, 'fiscal_periods')) {
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS trg_fiscal_period_no_overlap_insert
        BEFORE INSERT ON fiscal_periods
        WHEN EXISTS (
          SELECT 1 FROM fiscal_periods fp
          WHERE fp.fiscal_year_id = NEW.fiscal_year_id
            AND fp.start_date <= NEW.end_date
            AND fp.end_date >= NEW.start_date
        )
        BEGIN
          SELECT RAISE(ABORT, 'الفترة المالية تتداخل مع فترة موجودة في نفس السنة المالية');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_fiscal_period_no_overlap_update
        BEFORE UPDATE OF fiscal_year_id, start_date, end_date ON fiscal_periods
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
      `);
    }

    if (tableExists(db, 'fiscal_years')) {
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS trg_fiscal_year_no_overlap_insert
        BEFORE INSERT ON fiscal_years
        WHEN EXISTS (
          SELECT 1 FROM fiscal_years fy
          WHERE fy.start_date <= NEW.end_date
            AND fy.end_date >= NEW.start_date
        )
        BEGIN
          SELECT RAISE(ABORT, 'السنة المالية تتداخل مع سنة موجودة');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_fiscal_year_no_overlap_update
        BEFORE UPDATE OF start_date, end_date ON fiscal_years
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
    }
  },
};
