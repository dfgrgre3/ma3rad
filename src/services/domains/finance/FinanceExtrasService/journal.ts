import { v4 as uuidv4 } from 'uuid';
import { localDateString } from '../../../../utils/shared/date';
import { postLedgerEntry, reverseLedgerEntry } from '../../../../database/repositories/ledger';
import { ExtrasAccountsBase } from './accounts';
import { round2, validDate } from './types';
import type {
  AccountType,
  JournalEntry,
  JournalLine,
  JournalLineInput,
} from './types';

export abstract class ExtrasJournalBase extends ExtrasAccountsBase {
  // ─── Journal entries ────────────────────────────────────────────────────────

  getJournalEntries(limit = 200): JournalEntry[] {
    this.requireView();
    const branch = this.branchAccess.sqlScope('e.branch_id');
    const company = this.branchAccess.companyScope('e.company_id');
    const entries = this.db.query<JournalEntry>(
      `SELECT e.*, (SELECT COUNT(*) FROM journal_entry_lines l WHERE l.entry_id = e.id) AS line_count,
              (SELECT r.id FROM journal_entries r
                WHERE r.reference_type = 'MANUAL_REVERSAL' AND r.reference_id = e.id
                LIMIT 1) AS reversed_by_entry_id
       FROM journal_entries e
       WHERE (${branch.clause}) AND (${company.clause})
       ORDER BY e.date DESC, e.created_at DESC
       LIMIT ?`,
      [...branch.params, ...company.params, limit]
    );
    return this.attachSourceLabels(entries);
  }

  /**
   * Resolve the originating business document for each journal entry so the
   * accounting trail can be followed from the entry back to its source.
   */
  private attachSourceLabels(entries: JournalEntry[]): JournalEntry[] {
    const descriptor: Record<string, { table: string; column: string; label: string }> = {
      SALES_INVOICE: { table: 'sales_invoices', column: 'invoice_number', label: 'فاتورة بيع' },
      SALES_VOID: { table: 'sales_invoices', column: 'invoice_number', label: 'إلغاء فاتورة بيع' },
      SALES_RETURN: { table: 'sales_returns', column: 'return_number', label: 'مرتجع بيع' },
      PURCHASE_INVOICE: { table: 'purchase_invoices', column: 'invoice_number', label: 'فاتورة شراء' },
      PURCHASE_VOID: { table: 'purchase_invoices', column: 'invoice_number', label: 'إلغاء فاتورة شراء' },
      PURCHASE_RETURN: { table: 'purchase_returns', column: 'return_number', label: 'مرتجع شراء' },
      CUSTOMER_PAYMENT: { table: 'customer_payments', column: 'receipt_number', label: 'سند تحصيل' },
      CUSTOMER_PAYMENT_VOID: { table: 'customer_payments', column: 'receipt_number', label: 'إلغاء سند تحصيل' },
      SUPPLIER_PAYMENT: { table: 'supplier_payments', column: 'receipt_number', label: 'سند دفع مورد' },
      SUPPLIER_PAYMENT_VOID: { table: 'supplier_payments', column: 'receipt_number', label: 'إلغاء سند دفع مورد' },
      EXPENSE: { table: 'expenses', column: 'description', label: 'مصروف' },
      EXPENSE_EDIT: { table: 'expenses', column: 'description', label: 'تعديل مصروف' },
    };
    const wanted = new Map<string, Set<string>>();
    for (const entry of entries) {
      const target = entry.referenceType ? descriptor[entry.referenceType] : undefined;
      if (!target || !entry.referenceId) continue;
      const key = `${target.table}:${target.column}`;
      const ids = wanted.get(key) || new Set<string>();
      ids.add(entry.referenceId.split(':', 1)[0]);
      wanted.set(key, ids);
    }
    const resolved = new Map<string, string>();
    for (const [key, ids] of wanted) {
      const [table, column] = key.split(':');
      const list = [...ids];
      const placeholders = list.map(() => '?').join(', ');
      const rows = this.db.query<{ id: string; value: string | null }>(
        `SELECT id, ${column} AS value FROM ${table} WHERE id IN (${placeholders})`,
        list,
      );
      for (const row of rows) {
        if (row.value) resolved.set(`${key}:${row.id}`, String(row.value));
      }
    }
    return entries.map((entry) => {
      if (!entry.referenceType) return { ...entry, sourceLabel: 'قيد يدوي' };
      if (entry.referenceType === 'MANUAL_JOURNAL') return { ...entry, sourceLabel: 'قيد يدوي' };
      if (entry.referenceType === 'MANUAL_REVERSAL') return { ...entry, sourceLabel: 'قيد عكسي' };
      const target = descriptor[entry.referenceType];
      if (!target || !entry.referenceId) {
        return { ...entry, sourceLabel: entry.referenceType };
      }
      const documentNumber = resolved.get(
        `${target.table}:${target.column}:${entry.referenceId.split(':', 1)[0]}`,
      );
      return {
        ...entry,
        sourceLabel: documentNumber ? `${target.label} ${documentNumber}` : target.label,
      };
    });
  }

  getJournalLines(entryId: string): JournalLine[] {
    this.requireView();
    const branch = this.branchAccess.sqlScope('e.branch_id');
    const company = this.branchAccess.companyScope('e.company_id');
    const visible = this.db.query<{ id: string }>(
      `SELECT e.id FROM journal_entries e WHERE e.id = ? AND (${branch.clause}) AND (${company.clause})`,
      [entryId, ...branch.params, ...company.params]
    )[0];
    if (!visible) throw new Error('القيد المحاسبي غير موجود ضمن نطاق صلاحيتك.');
    return this.db.query<JournalLine>(
      `SELECT l.id, l.entry_id, l.account_id, l.debit / 100.0 AS debit, l.credit / 100.0 AS credit, l.description, l.cost_center_id, a.code AS account_code, a.name AS account_name
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(Date.parse(`${input.date}T00:00:00Z`)) ||
        new Date(`${input.date}T00:00:00Z`).toISOString().slice(0, 10) !== input.date) throw new Error('تاريخ القيد غير صحيح.');
    if (!Array.isArray(input.lines)) throw new Error('سطور القيد غير صحيحة.');
    const lines = input.lines.map((line) => {
      const debit = Number(line.debit);
      const credit = Number(line.credit);
      if (!Number.isFinite(debit) || !Number.isFinite(credit) || debit < 0 || credit < 0) throw new Error('قيم المدين والدائن يجب أن تكون أرقامًا موجبة أو صفرًا.');
      const roundedDebit = round2(debit);
      const roundedCredit = round2(credit);
      if ((roundedDebit > 0) === (roundedCredit > 0)) throw new Error('يجب إدخال مبلغ مدين أو دائن فقط في كل سطر.');
      const account = this.db.query<{ id: string; code: string; isActive: number; childCount: number }>(`SELECT a.id, a.code, a.is_active, (SELECT COUNT(*) FROM chart_of_accounts c WHERE c.parent_code = a.code) AS child_count FROM chart_of_accounts a WHERE a.id = ?`, [line.accountId])[0];
      if (!account || !account.isActive || account.childCount > 0) throw new Error('اختر حسابًا موجودًا ونشطًا لكل سطر.');
      return { ...line, accountCode: account.code, debit: roundedDebit, credit: roundedCredit };
    }).filter((line) => line.debit > 0 || line.credit > 0);
    if (lines.length < 2) throw new Error('القيد يحتاج إلى سطرين على الأقل.');
    const debitCents = lines.reduce((sum, line) => sum + Math.round(line.debit * 100), 0);
    const creditCents = lines.reduce((sum, line) => sum + Math.round(line.credit * 100), 0);
    if (debitCents !== creditCents) throw new Error('القيد غير متوازن: إجمالي المدين لا يساوي إجمالي الدائن.');

    // Manual entries go through the same posting gate as operational entries:
    // fiscal-period lock, branch/company attribution, source tracking, and the
    // party subledger hook. A unique reference id keeps postLedgerEntry's
    // idempotency check from collapsing two identical manual entries.
    this.assertPostingDate(input.date);
    const referenceType = input.referenceType?.trim() || 'MANUAL_JOURNAL';
    const referenceId = input.referenceId?.trim() || `manual-${uuidv4()}`;
    let entryId = '';
    this.db.executeFinancialTransaction((db) => {
      entryId = postLedgerEntry(db.getDb(), {
        date: input.date,
        description: input.description,
        referenceType,
        referenceId,
        createdBy: actor.id,
        branchId: this.branchAccess.getCurrentBranchId(actor),
        lines: lines.map((line) => ({
          accountCode: line.accountCode,
          debit: line.debit,
          credit: line.credit,
          description: line.description,
        })),
      });
    });
    return entryId;
  }

  /** Posted entries are immutable: corrections must be made through a reversal. */
  deleteJournalEntry(id: string): void {
    this.requireManage();
    const entry = this.getScopedJournalEntry(id);
    if (entry.isPosted) throw new Error('لا يمكن حذف قيد مرحّل؛ أنشئ قيدًا عكسيًا لتصحيحه.');
    const lines = this.getJournalLines(id);
    this.db.executeFinancialTransaction((db) => {
      for (const line of lines) {
        db.run('UPDATE chart_of_accounts SET balance = balance - ROUND(? * 100) WHERE id = ?', [line.debit - line.credit, line.accountId]);
      }
      db.run('DELETE FROM journal_entry_lines WHERE entry_id = ?', [id]);
      db.run('DELETE FROM journal_entries WHERE id = ?', [id]);
    });
  }

  /** Create an auditable reversal for a manually-created posted journal entry. */
  reverseJournalEntry(id: string, options: { date?: string; reason?: string } = {}): string {
    const actor = this.requireManage();
    const entry = this.getScopedJournalEntry(id);
    if (!entry.isPosted) throw new Error('لا يمكن عكس قيد غير مرحّل؛ احذفه مباشرة.');
    const sourceType = entry.referenceType || 'MANUAL_JOURNAL';
    if (sourceType !== 'MANUAL_JOURNAL') {
      throw new Error('هذا القيد مرتبط بمستند تشغيلي؛ اعكس المستند من شاشته الأصلية لتظل الدورة المحاسبية متسقة.');
    }
    const alreadyReversed = this.db.query<{ id: string }>(
      `SELECT id FROM journal_entries WHERE reference_type = 'MANUAL_REVERSAL' AND reference_id = ?`,
      [id],
    )[0];
    if (alreadyReversed) throw new Error('تم عكس هذا القيد مسبقًا.');
    const date = options.date || localDateString();
    this.assertPostingDate(date);
    let reversalId = '';
    this.db.executeFinancialTransaction((db) => {
      reversalId = reverseLedgerEntry(db.getDb(), id, {
        date,
        description: `عكس القيد ${entry.entryNumber}${options.reason?.trim() ? ` — ${options.reason.trim()}` : ''}`,
        referenceType: 'MANUAL_REVERSAL',
        referenceId: id,
        createdBy: actor.id,
        branchId: entry.branchId || this.branchAccess.getCurrentBranchId(actor),
      }) || '';
    });
    if (!reversalId) throw new Error('تعذر إنشاء القيد العكسي.');
    return reversalId;
  }

  private getScopedJournalEntry(id: string): JournalEntry {
    const branch = this.branchAccess.sqlScope('e.branch_id');
    const company = this.branchAccess.companyScope('e.company_id');
    const entry = this.db.query<JournalEntry>(
      `SELECT e.* FROM journal_entries e WHERE e.id = ? AND (${branch.clause}) AND (${company.clause})`,
      [id, ...branch.params, ...company.params],
    )[0];
    if (!entry) throw new Error('القيد المحاسبي غير موجود ضمن نطاق صلاحيتك.');
    return entry;
  }

  getTrialBalance(dateFrom?: string, dateTo?: string): Array<{ code: string; name: string; type: AccountType; debit: number; credit: number }> {
    this.requireView();
    if ((dateFrom && !validDate(dateFrom)) || (dateTo && !validDate(dateTo)) || (dateFrom && dateTo && dateFrom > dateTo)) {
      throw new Error('نطاق تاريخ ميزان المراجعة غير صحيح.');
    }
    const branch = this.branchAccess.sqlScope('e.branch_id');
    const company = this.branchAccess.companyScope('e.company_id');
    const conditions = [`e.is_posted = 1`, branch.clause, company.clause];
    const params: string[] = [...branch.params, ...company.params];
    if (dateFrom) { conditions.push('e.date >= ?'); params.push(dateFrom); }
    if (dateTo) { conditions.push('e.date <= ?'); params.push(dateTo); }
    return this.db.query(
      `WITH scoped AS (
         SELECT a.code, a.name, a.type,
                COALESCE(SUM(CASE WHEN e.id IS NOT NULL THEN l.debit ELSE 0 END), 0) AS debit_total,
                COALESCE(SUM(CASE WHEN e.id IS NOT NULL THEN l.credit ELSE 0 END), 0) AS credit_total
         FROM chart_of_accounts a
         LEFT JOIN journal_entry_lines l ON l.account_id = a.id
         LEFT JOIN journal_entries e ON e.id = l.entry_id AND ${conditions.join(' AND ')}
         GROUP BY a.id
       )
       SELECT code, name, type,
              ROUND(MAX(0, (debit_total - credit_total) / 100.0), 2) AS debit,
              ROUND(MAX(0, (credit_total - debit_total) / 100.0), 2) AS credit
       FROM scoped
       WHERE ROUND((debit_total - credit_total) / 100.0, 2) != 0
       ORDER BY code`, params
    );
  }
}
