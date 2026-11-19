import { v4 as uuidv4 } from 'uuid';
import { ExtrasCoreBase } from './core';
import type { Account, AccountType } from './types';

export abstract class ExtrasAccountsBase extends ExtrasCoreBase {
  // ─── Chart of accounts ──────────────────────────────────────────────────────

  getAccounts(): Account[] {
    this.requireView();
    return this.db.query<Account>(
      `SELECT a.*, COALESCE(SUM(CASE WHEN e.is_posted = 1 THEN
                CASE WHEN a.type IN ('LIABILITY', 'EQUITY', 'REVENUE') THEN l.credit - l.debit ELSE l.debit - l.credit END
              ELSE 0 END) / 100.0, 0) AS computed_balance
       FROM chart_of_accounts a
       LEFT JOIN journal_entry_lines l ON l.account_id = a.id
       LEFT JOIN journal_entries e ON e.id = l.entry_id
       GROUP BY a.id
       ORDER BY a.code ASC`
    );
  }

  createAccount(input: { code: string; name: string; type: AccountType; parentCode?: string; notes?: string }): void {
    this.requireManage();
    const code = input.code.trim();
    const name = input.name.trim();
    if (!code) throw new Error('كود الحساب مطلوب.');
    if (!name) throw new Error('اسم الحساب مطلوب.');
    if (!['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'].includes(input.type)) throw new Error('نوع الحساب غير صحيح.');
    if (this.db.query('SELECT id FROM chart_of_accounts WHERE code = ?', [code]).length) throw new Error('كود الحساب مستخدم بالفعل.');
    this.validateParent(input.parentCode, input.type);
    this.db.run(
      `INSERT INTO chart_of_accounts (id, code, name, type, parent_code, balance, is_active, notes)
       VALUES (?, ?, ?, ?, ?, 0, 1, ?)`,
      [`acc_${uuidv4().substring(0, 8)}`, code, name, input.type, input.parentCode || null, input.notes || null]
    );
  }

  updateAccount(id: string, input: { name?: string; isActive?: boolean; notes?: string }): void {
    this.requireManage();
    const account = this.db.query<Account>('SELECT * FROM chart_of_accounts WHERE id = ?', [id])[0];
    if (!account) throw new Error('الحساب غير موجود.');
    if (input.name !== undefined && !input.name.trim()) throw new Error('اسم الحساب مطلوب.');
    if (input.isActive === false) {
      const activeChildren = this.db.query<{ c: number }>('SELECT COUNT(*) AS c FROM chart_of_accounts WHERE parent_code = ? AND is_active = 1', [account.code])[0]?.c || 0;
      if (activeChildren) throw new Error('أوقف الحسابات الفرعية أولًا.');
    }
    this.db.run(
      'UPDATE chart_of_accounts SET name = ?, is_active = ?, notes = ? WHERE id = ?',
      [input.name === undefined ? account.name : input.name.trim(), input.isActive === undefined ? account.isActive : input.isActive ? 1 : 0,
        input.notes === undefined ? account.notes ?? null : input.notes || null, id]
    );
  }

  private validateParent(parentCode: string | undefined, type: AccountType, currentId?: string): void {
    if (!parentCode) return;
    const parent = this.db.query<Account>('SELECT * FROM chart_of_accounts WHERE code = ?', [parentCode])[0];
    if (!parent || !parent.isActive) throw new Error('الحساب الأب غير موجود أو موقوف.');
    if (parent.type !== type) throw new Error('يجب أن يتطابق نوع الحساب الفرعي مع الحساب الأب.');

    const parentHasEntries = this.db.query<{ c: number }>('SELECT COUNT(*) AS c FROM journal_entry_lines WHERE account_id = ?', [parent.id])[0]?.c || 0;
    if (parentHasEntries) throw new Error('Cannot add children to an account with posted entries.');
    if (parent.id === currentId) throw new Error('لا يمكن جعل الحساب أبًا لنفسه.');
    if (currentId) {
      const descendants = this.db.query<{ id: string }>(
        `WITH RECURSIVE descendants(id, code) AS (
           SELECT id, code FROM chart_of_accounts WHERE parent_code = (SELECT code FROM chart_of_accounts WHERE id = ?)
           UNION ALL SELECT a.id, a.code FROM chart_of_accounts a JOIN descendants d ON a.parent_code = d.code
         ) SELECT id FROM descendants`, [currentId]
      );
      if (descendants.some((row) => row.id === parent.id)) throw new Error('لا يمكن تكوين حلقة في هيكل الحسابات.');
    }
  }

  deleteAccount(id: string): void {
    this.requireManage();
    const children = this.db.query<{ c: number }>('SELECT COUNT(*) AS c FROM chart_of_accounts WHERE parent_code = (SELECT code FROM chart_of_accounts WHERE id = ?)', [id])[0]?.c || 0;
    if (children > 0) throw new Error('لا يمكن حذف حساب له حسابات فرعية.');
    const used = this.db.query<{ c: number }>('SELECT COUNT(*) AS c FROM journal_entry_lines WHERE account_id = ?', [id])[0]?.c || 0;
    if (used > 0) throw new Error('لا يمكن حذف حساب عليه حركات في القيود.');
    this.db.run('DELETE FROM chart_of_accounts WHERE id = ?', [id]);
  }
}
