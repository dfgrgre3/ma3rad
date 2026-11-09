import type { Database } from 'sql.js';

export function runEnterprisePart8(db: Database): void {
  // 8. Enforce Chart of Accounts Integrity: Triggers preventing deletion of used accounts
  db.run(`
    CREATE TRIGGER IF NOT EXISTS trg_prevent_delete_coa_with_entries BEFORE DELETE ON chart_of_accounts
    BEGIN
      SELECT RAISE(ABORT, 'لا يمكن حذف حساب مرتبط بقيود يومية أو حركات محاسبية.')
      WHERE (SELECT COUNT(*) FROM journal_entry_lines WHERE account_id = OLD.id) > 0;
    END;
  
    CREATE TRIGGER IF NOT EXISTS trg_prevent_delete_coa_with_children BEFORE DELETE ON chart_of_accounts
    BEGIN
      SELECT RAISE(ABORT, 'لا يمكن حذف حساب أب يتبعه حسابات فرعية نشطة.')
      WHERE (SELECT COUNT(*) FROM chart_of_accounts WHERE parent_code = OLD.code) > 0;
    END;
  `);
}
