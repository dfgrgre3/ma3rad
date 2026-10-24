import { DatabaseManager } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

export interface Account {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  parentCode?: string | null;
  balance: number;
  computedBalance?: number;
  isActive: number;
  notes?: string | null;
}

export interface JournalLineInput {
  accountId: string;
  debit: number;
  credit: number;
  description?: string;
}

export interface JournalEntry {
  id: string;
  entryNumber: string;
  date: string;
  description: string;
  referenceType?: string | null;
  referenceId?: string | null;
  totalDebit: number;
  totalCredit: number;
  isPosted: number;
  createdBy: string;
  createdAt: string;
  lineCount?: number;
}

export interface JournalLine {
  id: string;
  entryId: string;
  accountId: string;
  accountCode?: string;
  accountName?: string;
  debit: number;
  credit: number;
  description?: string | null;
}

export type ChequeType = 'RECEIVED' | 'ISSUED';
export type ChequeStatus = 'PENDING' | 'DEPOSITED' | 'CLEARED' | 'BOUNCED' | 'CANCELLED';

export interface Cheque {
  id: string;
  chequeNumber: string;
  type: ChequeType;
  partyType: 'CUSTOMER' | 'SUPPLIER' | 'OTHER';
  partyId?: string | null;
  partyName: string;
  bankName?: string | null;
  amount: number;
  dueDate: string;
  status: ChequeStatus;
  notes?: string | null;
  createdBy?: string | null;
  createdAt: string;
}

export interface FixedAsset {
  id: string;
  code: string;
  name: string;
  category: string;
  purchaseDate: string;
  purchaseCost: number;
  salvageValue: number;
  usefulLifeYears: number;
  accumulatedDepreciation: number;
  status: 'ACTIVE' | 'DISPOSED' | 'FULLY_DEPRECIATED';
  location?: string | null;
  notes?: string | null;
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export class FinanceExtrasService {
  private db = DatabaseManager.getInstance();

  private requireView() {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'finance.view');
    return actor;
  }

  private requireManage() {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'finance.approve');
    return actor;
  }

  // ─── Chart of accounts ──────────────────────────────────────────────────────

  getAccounts(): Account[] {
    this.requireView();
    return this.db.query<Account>(
      `SELECT a.*, COALESCE(SUM(l.debit - l.credit), 0) AS computed_balance
       FROM chart_of_accounts a
       LEFT JOIN journal_entry_lines l ON l.account_id = a.id
       GROUP BY a.id
       ORDER BY a.code ASC`
    );
  }

  createAccount(input: { code: string; name: string; type: AccountType; parentCode?: string; notes?: string }): void {
    this.requireManage();
    const code = input.code.trim();
    if (!code) throw new Error('كود الحساب مطلوب.');
    if (!input.name.trim()) throw new Error('اسم الحساب مطلوب.');
    if (this.db.query('SELECT id FROM chart_of_accounts WHERE code = ?', [code]).length > 0) {
      throw new Error('كود الحساب مستخدم بالفعل.');
    }
    this.db.run(
      `INSERT INTO chart_of_accounts (id, code, name, type, parent_code, balance, is_active, notes)
       VALUES (?, ?, ?, ?, ?, 0, 1, ?)`,
      [`acc_${uuidv4().substring(0, 8)}`, code, input.name.trim(), input.type, input.parentCode || null, input.notes || null]
    );
  }

  updateAccount(id: string, input: { name?: string; isActive?: boolean; notes?: string }): void {
    this.requireManage();
    this.db.run(
      `UPDATE chart_of_accounts SET name = COALESCE(?, name), is_active = COALESCE(?, is_active), notes = COALESCE(?, notes) WHERE id = ?`,
      [input.name?.trim() || null, input.isActive === undefined ? null : input.isActive ? 1 : 0, input.notes ?? null, id]
    );
  }

  deleteAccount(id: string): void {
    this.requireManage();
    const children = this.db.query<{ c: number }>('SELECT COUNT(*) AS c FROM chart_of_accounts WHERE parent_code = (SELECT code FROM chart_of_accounts WHERE id = ?)', [id])[0]?.c || 0;
    if (children > 0) throw new Error('لا يمكن حذف حساب له حسابات فرعية.');
    const used = this.db.query<{ c: number }>('SELECT COUNT(*) AS c FROM journal_entry_lines WHERE account_id = ?', [id])[0]?.c || 0;
    if (used > 0) throw new Error('لا يمكن حذف حساب عليه حركات في القيود.');
    this.db.run('DELETE FROM chart_of_accounts WHERE id = ?', [id]);
  }

  // ─── Journal entries ────────────────────────────────────────────────────────

  getJournalEntries(limit = 200): JournalEntry[] {
    this.requireView();
    return this.db.query<JournalEntry>(
      `SELECT e.*, (SELECT COUNT(*) FROM journal_entry_lines l WHERE l.entry_id = e.id) AS line_count
       FROM journal_entries e
       ORDER BY e.date DESC, e.created_at DESC
       LIMIT ?`,
      [limit]
    );
  }

  getJournalLines(entryId: string): JournalLine[] {
    this.requireView();
    return this.db.query<JournalLine>(
      `SELECT l.*, a.code AS account_code, a.name AS account_name
       FROM journal_entry_lines l
       LEFT JOIN chart_of_accounts a ON a.id = l.account_id
       WHERE l.entry_id = ?
       ORDER BY l.debit DESC`,
      [entryId]
    );
  }

  createJournalEntry(input: {
    date: string;
    description: string;
    lines: JournalLineInput[];
    createdBy: string;
    referenceType?: string;
    referenceId?: string;
  }): string {
    const actor = this.requireManage();
    if (!input.description.trim()) throw new Error('بيان القيد مطلوب.');
    const lines = input.lines.filter((l) => Number(l.debit) > 0 || Number(l.credit) > 0);
    if (lines.length < 2) throw new Error('القيد يحتاج إلى سطرين على الأقل.');
    const totalDebit = round2(lines.reduce((s, l) => s + Number(l.debit || 0), 0));
    const totalCredit = round2(lines.reduce((s, l) => s + Number(l.credit || 0), 0));
    if (Math.abs(totalDebit - totalCredit) > 0.009) {
      throw new Error('القيد غير متوازن: إجمالي المدين لا يساوي إجمالي الدائن.');
    }
    const id = `jv_${uuidv4().substring(0, 8)}`;
    this.db.executeTransaction((db) => {
      const number = db.nextNumber('JV');
      db.run(
        `INSERT INTO journal_entries (id, entry_number, date, description, reference_type, reference_id, total_debit, total_credit, is_posted, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        [id, number, input.date, input.description.trim(), input.referenceType || null, input.referenceId || null, totalDebit, totalCredit, actor.id]
      );
      for (const line of lines) {
        db.run(
          `INSERT INTO journal_entry_lines (id, entry_id, account_id, debit, credit, description) VALUES (?, ?, ?, ?, ?, ?)`,
          [`jvl_${uuidv4().substring(0, 8)}`, id, line.accountId, round2(Number(line.debit || 0)), round2(Number(line.credit || 0)), line.description || null]
        );
        db.run('UPDATE chart_of_accounts SET balance = balance + ? WHERE id = ?', [round2(Number(line.debit || 0)) - round2(Number(line.credit || 0)), line.accountId]);
      }
    });
    return id;
  }

  deleteJournalEntry(id: string): void {
    this.requireManage();
    const entry = this.db.query<JournalEntry>('SELECT * FROM journal_entries WHERE id = ?', [id])[0];
    if (!entry) throw new Error('القيد غير موجود.');
    const lines = this.getJournalLines(id);
    this.db.executeTransaction((db) => {
      for (const line of lines) {
        db.run('UPDATE chart_of_accounts SET balance = balance - ? WHERE id = ?', [line.debit - line.credit, line.accountId]);
      }
      db.run('DELETE FROM journal_entry_lines WHERE entry_id = ?', [id]);
      db.run('DELETE FROM journal_entries WHERE id = ?', [id]);
    });
  }

  getTrialBalance(): Array<{ code: string; name: string; type: AccountType; debit: number; credit: number }> {
    this.requireView();
    return this.db.query(
      `SELECT a.code, a.name, a.type,
              COALESCE(SUM(l.debit), 0) AS debit,
              COALESCE(SUM(l.credit), 0) AS credit
       FROM chart_of_accounts a
       LEFT JOIN journal_entry_lines l ON l.account_id = a.id
       GROUP BY a.id
       HAVING debit > 0 OR credit > 0
       ORDER BY a.code`
    );
  }

  // ─── VAT / tax ──────────────────────────────────────────────────────────────

  getTaxSummary(dateFrom: string, dateTo: string) {
    this.requireView();
    const sales = this.db.query<any>(
      `SELECT COALESCE(SUM(tax_amount), 0) AS tax, COALESCE(SUM(total_amount), 0) AS total, COUNT(*) AS count
       FROM sales_invoices WHERE invoice_status != 'VOID' AND date >= ? AND date <= ?`,
      [dateFrom, dateTo]
    )[0] || {};
    const purchases = this.db.query<any>(
      `SELECT COALESCE(SUM(tax_amount), 0) AS tax, COALESCE(SUM(total_amount), 0) AS total, COUNT(*) AS count
       FROM purchase_invoices WHERE date >= ? AND date <= ?`,
      [dateFrom, dateTo]
    )[0] || {};
    const outputTax = round2(sales.tax || 0);
    const inputTax = round2(purchases.tax || 0);
    return {
      outputTax,
      inputTax,
      netTax: round2(outputTax - inputTax),
      salesTotal: round2(sales.total || 0),
      purchasesTotal: round2(purchases.total || 0),
      salesCount: sales.count || 0,
      purchasesCount: purchases.count || 0,
    };
  }

  getTaxByMonth(dateFrom: string, dateTo: string) {
    this.requireView();
    return this.db.query<{ month: string; outputTax: number; inputTax: number }>(
      `SELECT month, SUM(output_tax) AS output_tax, SUM(input_tax) AS input_tax FROM (
         SELECT substr(date, 1, 7) AS month, tax_amount AS output_tax, 0 AS input_tax
         FROM sales_invoices WHERE invoice_status != 'VOID' AND date >= ? AND date <= ?
         UNION ALL
         SELECT substr(date, 1, 7) AS month, 0 AS output_tax, tax_amount AS input_tax
         FROM purchase_invoices WHERE date >= ? AND date <= ?
       ) GROUP BY month ORDER BY month DESC`,
      [dateFrom, dateTo, dateFrom, dateTo]
    );
  }

  // ─── Cheques ────────────────────────────────────────────────────────────────

  getCheques(): Cheque[] {
    this.requireView();
    return this.db.query<Cheque>('SELECT * FROM cheques ORDER BY due_date ASC, created_at DESC');
  }

  saveCheque(input: Partial<Cheque> & { chequeNumber: string; partyName: string; amount: number; dueDate: string }): void {
    const actor = this.requireManage();
    if (!input.chequeNumber.trim()) throw new Error('رقم الشيك مطلوب.');
    if (!input.partyName.trim()) throw new Error('اسم الطرف مطلوب.');
    if (!(Number(input.amount) > 0)) throw new Error('قيمة الشيك يجب أن تكون أكبر من صفر.');
    if (!input.dueDate) throw new Error('تاريخ الاستحقاق مطلوب.');
    const values = [
      input.chequeNumber.trim(),
      input.type || 'RECEIVED',
      input.partyType || 'OTHER',
      input.partyId || null,
      input.partyName.trim(),
      input.bankName || null,
      round2(Number(input.amount)),
      input.dueDate,
      input.status || 'PENDING',
      input.notes || null,
    ];
    if (input.id) {
      this.db.run(
        `UPDATE cheques SET cheque_number = ?, type = ?, party_type = ?, party_id = ?, party_name = ?, bank_name = ?,
           amount = ?, due_date = ?, status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [...values, input.id]
      );
    } else {
      this.db.run(
        `INSERT INTO cheques (id, cheque_number, type, party_type, party_id, party_name, bank_name, amount, due_date, status, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [`chq_${uuidv4().substring(0, 8)}`, ...values, actor.id]
      );
    }
  }

  setChequeStatus(id: string, status: ChequeStatus): void {
    this.requireManage();
    this.db.run('UPDATE cheques SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, id]);
  }

  deleteCheque(id: string): void {
    this.requireManage();
    this.db.run('DELETE FROM cheques WHERE id = ?', [id]);
  }

  // ─── Fixed assets ───────────────────────────────────────────────────────────

  getFixedAssets(): FixedAsset[] {
    this.requireView();
    return this.db.query<FixedAsset>('SELECT * FROM fixed_assets ORDER BY code ASC');
  }

  saveFixedAsset(input: Partial<FixedAsset> & { name: string; purchaseDate: string; purchaseCost: number }): void {
    this.requireManage();
    if (!input.name.trim()) throw new Error('اسم الأصل مطلوب.');
    if (!(Number(input.purchaseCost) > 0)) throw new Error('تكلفة الشراء يجب أن تكون أكبر من صفر.');
    if (!input.purchaseDate) throw new Error('تاريخ الشراء مطلوب.');
    const values = [
      input.name.trim(),
      input.category || 'OTHER',
      input.purchaseDate,
      round2(Number(input.purchaseCost)),
      round2(Number(input.salvageValue || 0)),
      Number(input.usefulLifeYears || 5),
      input.status || 'ACTIVE',
      input.location || null,
      input.notes || null,
    ];
    if (input.id) {
      this.db.run(
        `UPDATE fixed_assets SET name = ?, category = ?, purchase_date = ?, purchase_cost = ?, salvage_value = ?,
           useful_life_years = ?, status = ?, location = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [...values, input.id]
      );
    } else {
      const id = `fa_${uuidv4().substring(0, 8)}`;
      const maxCode = this.db.query<{ code: string }>('SELECT code FROM fixed_assets ORDER BY code DESC LIMIT 1')[0]?.code;
      const lastNumber = maxCode ? Number(String(maxCode).replace(/\D/g, '')) : 0;
      const next = Number.isFinite(lastNumber) ? lastNumber + 1 : 1;
      this.db.run(
        `INSERT INTO fixed_assets (id, code, name, category, purchase_date, purchase_cost, salvage_value,
           useful_life_years, status, location, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, `FA-${String(next).padStart(4, '0')}`, ...values]
      );
    }
  }

  postMonthlyDepreciation(id: string): void {
    this.requireManage();
    const asset = this.db.query<FixedAsset>('SELECT * FROM fixed_assets WHERE id = ?', [id])[0];
    if (!asset) throw new Error('الأصل غير موجود.');
    if (asset.status !== 'ACTIVE') throw new Error('لا يمكن إهلاك أصل غير نشط.');
    const depreciable = Math.max(0, Number(asset.purchaseCost) - Number(asset.salvageValue));
    const monthly = asset.usefulLifeYears > 0 ? depreciable / (asset.usefulLifeYears * 12) : 0;
    if (monthly <= 0) throw new Error('لا توجد قيمة قابلة للإهلاك.');
    const nextAccumulated = Math.min(depreciable, round2(Number(asset.accumulatedDepreciation) + monthly));
    const status = nextAccumulated >= depreciable - 0.009 ? 'FULLY_DEPRECIATED' : 'ACTIVE';
    this.db.run(
      'UPDATE fixed_assets SET accumulated_depreciation = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [nextAccumulated, status, id]
    );
  }

  deleteFixedAsset(id: string): void {
    this.requireManage();
    this.db.run('DELETE FROM fixed_assets WHERE id = ?', [id]);
  }
}
