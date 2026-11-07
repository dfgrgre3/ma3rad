import { DatabaseManager } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { localDateString } from '../utils/date';
import { paymentAccountCode, postLedgerEntry, reverseLedgerEntry } from '../database/ledger';
import { BranchAccessService } from './BranchAccessService';
import { inclusiveReturnTaxSql, returnTaxSql } from './financials';

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
  depreciationMethod?: 'STRAIGHT_LINE' | 'DECLINING_BALANCE' | 'UNITS_OF_PRODUCTION' | 'NON_DEPRECIABLE';
  decliningRate?: number | null;
  expectedUnits?: number | null;
  branchId?: string | null;
  departmentId?: string | null;
  responsibleUserId?: string | null;
}

export type FixedAssetTransfer = {
  id: string; assetId: string; transferDate: string; fromBranchId: string | null; toBranchId: string | null;
  fromDepartmentId: string | null; toDepartmentId: string | null; fromLocation: string | null; toLocation: string | null;
  fromResponsibleUserId: string | null; toResponsibleUserId: string | null; notes: string | null;
  actorId: string; actorName: string; createdAt: string;
};
export type FixedAssetMaintenance = {
  id: string; assetId: string; maintenanceDate: string; maintenanceType: string; description: string;
  cost: number; costTreatment: 'OPERATIONAL' | 'CAPITALIZED'; vendor: string | null;
  nextMaintenanceDate: string | null; journalEntryId: string | null; actorId: string; actorName: string;
};
export type FixedAssetDisposal = {
  id: string; assetId: string; disposalDate: string; reason: string; saleProceeds: number;
  expenses: number; buyer: string | null; accumulatedDepreciation: number; bookValue: number;
  gainLoss: number; journalEntryId: string; approvedBy: string; settlementType: 'CASH_REGISTER' | 'BANK_ACCOUNT';
  settlementId: string;
};
export type FixedAssetDepreciationPeriod = {
  id: string; assetId: string; period: string; postingDate: string; amount: number; usageQuantity: number | null;
  status: 'POSTED'; journalEntryId: string; postedBy: string;
};
export type FixedAssetDepreciationRequest = {
  id: string; assetId: string; period: string; postingDate: string; amount: number; usageQuantity: number | null;
  status: 'PENDING' | 'APPROVED'; requestedBy: string; requesterName: string; approvedBy: string | null;
  approverName: string | null; journalEntryId: string | null; depreciationPeriodId: string | null;
  createdAt: string; approvedAt: string | null;
};
export type FixedAssetAttachment = {
  id: string; assetId: string; documentType: 'INVOICE' | 'WARRANTY' | 'PURCHASE_CONTRACT' | 'OWNERSHIP' | 'OTHER';
  fileName: string; mimeType: string | null; fileSize: number; checksum: string | null;
  storageName: string; uploadedBy: string; uploadedByName: string; createdAt: string;
};
export type FixedAssetSettlementSource = {
  id: string; name: string; type: 'CASH_REGISTER' | 'BANK_ACCOUNT'; currentBalance: number;
};
export type FixedAssetCountCampaign = {
  id: string; branchId: string; location: string | null; countDate: string; status: 'OPEN' | 'FINALIZED';
  createdBy: string; finalizedBy: string | null; finalizedAt: string | null;
};
export type FixedAssetCountObservation = {
  id: string; campaignId: string; assetId: string | null; scannedCode: string; countStatus: 'FOUND' | 'MISSING' | 'UNREGISTERED';
  condition: string | null; notes: string | null; actorId: string; createdAt: string;
};
export type FixedAssetCountSnapshot = {
  assetId: string; assetCode: string; assetName: string; registeredStatus: FixedAsset['status'];
  registeredLocation: string | null; observed: number;
};
export type FixedAssetCountAudit = {
  action: string; details: string | null; actorId: string; actorName: string; createdAt: string;
};
export type FixedAssetTimelineEvent = {
  eventDate: string;
  eventType: 'ACQUISITION' | 'TRANSFER' | 'MAINTENANCE' | 'DEPRECIATION' | 'DISPOSAL';
  label: string;
  amount: number | null;
  actorName: string | null;
  referenceId: string;
  details: string | null;
};

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export class FinanceExtrasService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();

  private requireView() {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.finance.overview.view');
    return actor;
  }

  private requireManage() {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.finance.receivables.approve');
    return actor;
  }

  private assertPostingDate(date: string, allowCurrentMonthEnd = false): void {
    const currentPeriod = localDateString().slice(0, 7);
    if (!validDate(date) || (date > localDateString() && !(allowCurrentMonthEnd && date.slice(0, 7) === currentPeriod))) {
      throw new Error('تاريخ الترحيل غير صالح أو يقع في المستقبل.');
    }
    const closedDate = this.db.query<{ value: string }>(
      "SELECT value FROM system_settings WHERE key = 'accounting_closed_until_date'"
    )[0]?.value;
    if (closedDate && date <= closedDate) throw new Error('لا يمكن الترحيل في فترة محاسبية مغلقة.');
    const period = this.db.query<{ name: string; status: string }>(
      "SELECT name, status FROM fiscal_periods WHERE ? >= start_date AND ? <= end_date AND status IN ('CLOSED', 'LOCKED') LIMIT 1",
      [date, date]
    )[0];
    if (period) throw new Error(`لا يمكن الترحيل في فترة محاسبية مقفلة: ${period.name} (${period.status}).`);
  }

  // ─── Chart of accounts ──────────────────────────────────────────────────────

  getAccounts(): Account[] {
    this.requireView();
    return this.db.query<Account>(
      `SELECT a.*, COALESCE(SUM(CASE WHEN e.is_posted = 1 THEN
                CASE WHEN a.type IN ('LIABILITY', 'EQUITY', 'REVENUE') THEN l.credit - l.debit ELSE l.debit - l.credit END
              ELSE 0 END), 0) AS computed_balance
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
  // ─── Journal entries ────────────────────────────────────────────────────────

  getJournalEntries(limit = 200): JournalEntry[] {
    this.requireView();
    const branch = this.branchAccess.sqlScope('e.branch_id');
    const company = this.branchAccess.companyScope('e.company_id');
    return this.db.query<JournalEntry>(
      `SELECT e.*, (SELECT COUNT(*) FROM journal_entry_lines l WHERE l.entry_id = e.id) AS line_count
       FROM journal_entries e
       WHERE (${branch.clause}) AND (${company.clause})
       ORDER BY e.date DESC, e.created_at DESC
       LIMIT ?`,
      [...branch.params, ...company.params, limit]
    );
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
      const account = this.db.query<{ id: string; isActive: number; childCount: number }>(`SELECT a.id, a.is_active, (SELECT COUNT(*) FROM chart_of_accounts c WHERE c.parent_code = a.code) AS child_count FROM chart_of_accounts a WHERE a.id = ?`, [line.accountId])[0];
      if (!account || !account.isActive || account.childCount > 0) throw new Error('اختر حسابًا موجودًا ونشطًا لكل سطر.');
      return { ...line, debit: roundedDebit, credit: roundedCredit };
    }).filter((line) => line.debit > 0 || line.credit > 0);
    if (lines.length < 2) throw new Error('القيد يحتاج إلى سطرين على الأقل.');
    const debitCents = lines.reduce((sum, line) => sum + Math.round(line.debit * 100), 0);
    const creditCents = lines.reduce((sum, line) => sum + Math.round(line.credit * 100), 0);
    const totalDebit = debitCents / 100;
    const totalCredit = creditCents / 100;
    if (debitCents !== creditCents) throw new Error('القيد غير متوازن: إجمالي المدين لا يساوي إجمالي الدائن.');

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
          [`jvl_${uuidv4().substring(0, 8)}`, id, line.accountId, line.debit, line.credit, line.description?.trim() || null]
        );
        db.run('UPDATE chart_of_accounts SET balance = ROUND(balance + ?, 2) WHERE id = ?', [line.debit - line.credit, line.accountId]);
      }
    });
    return id;
  }
  deleteJournalEntry(id: string): void {
    this.requireManage();
    const entry = this.db.query<JournalEntry>('SELECT * FROM journal_entries WHERE id = ?', [id])[0];
    if (!entry) throw new Error('القيد غير موجود.');
    if (entry.referenceType) throw new Error('لا يمكن حذف قيد مرتبط بحركة تشغيلية.');
    const lines = this.getJournalLines(id);
    this.db.executeTransaction((db) => {
      for (const line of lines) {
        db.run('UPDATE chart_of_accounts SET balance = ROUND(balance - ?, 2) WHERE id = ?', [line.debit - line.credit, line.accountId]);
      }
      db.run('DELETE FROM journal_entry_lines WHERE entry_id = ?', [id]);
      db.run('DELETE FROM journal_entries WHERE id = ?', [id]);
    });
  }

  getTrialBalance(dateFrom?: string, dateTo?: string): Array<{ code: string; name: string; type: AccountType; debit: number; credit: number }> {
    this.requireView();
    if (dateFrom && dateTo && dateFrom > dateTo) throw new Error('تاريخ البداية يجب ألا يتجاوز تاريخ النهاية.');
    const conditions: string[] = [];
    const params: string[] = [];
    if (dateFrom) { conditions.push('e.date >= ?'); params.push(dateFrom); }
    if (dateTo) { conditions.push('e.date <= ?'); params.push(dateTo); }
    const dateFilter = conditions.length ? `AND ${conditions.join(' AND ')}` : '';
    return this.db.query(
      `SELECT a.code, a.name, a.type,
              MAX(COALESCE(SUM(CASE WHEN e.id IS NOT NULL THEN l.debit - l.credit ELSE 0 END), 0), 0) AS debit,
              MAX(COALESCE(SUM(CASE WHEN e.id IS NOT NULL THEN l.credit - l.debit ELSE 0 END), 0), 0) AS credit
       FROM chart_of_accounts a
       LEFT JOIN journal_entry_lines l ON l.account_id = a.id
       LEFT JOIN journal_entries e ON e.id = l.entry_id AND e.is_posted = 1 ${dateFilter}
       GROUP BY a.id
       HAVING debit > 0 OR credit > 0
       ORDER BY a.code`, params
    );
  }
  // ─── VAT / tax ──────────────────────────────────────────────────────────────

  private taxScope(alias: string) {
    const branch = this.branchAccess.sqlScope(
      `${alias}.branch_id`,
      `(SELECT w.branch_id FROM warehouses w WHERE w.id = ${alias}.warehouse_id)`
    );
    const company = this.branchAccess.companyScope(`${alias}.company_id`);
    return {
      clause: `(${branch.clause}) AND (${company.clause})`,
      params: [...branch.params, ...company.params],
    };
  }

  getTaxSummary(dateFrom: string, dateTo: string) {
    this.requireView();
    const salesScope = this.taxScope('si');
    const purchaseScope = this.taxScope('pi');
    const returnSalesScope = this.taxScope('original');
    const returnPurchaseScope = this.taxScope('original');
    const salesReturnTax = returnTaxSql(
      'sr.total_amount', 'original.subtotal', 'original.discount_amount', 'original.tax_amount'
    );
    const purchaseReturnTax = inclusiveReturnTaxSql(
      'pr.total_amount', 'original.subtotal', 'original.discount_amount', 'original.tax_amount'
    );
    const sales = this.db.query<any>(
      `SELECT COALESCE(SUM(tax_amount), 0) AS tax, COALESCE(SUM(total_amount), 0) AS total, COUNT(*) AS count
       FROM sales_invoices si
       WHERE si.invoice_status != 'VOID' AND si.date >= ? AND si.date <= ? AND ${salesScope.clause}`,
      [dateFrom, dateTo, ...salesScope.params]
    )[0] || {};
    const purchases = this.db.query<any>(
      `SELECT COALESCE(SUM(tax_amount), 0) AS tax, COALESCE(SUM(total_amount), 0) AS total, COUNT(*) AS count
       FROM purchase_invoices pi
       WHERE pi.date >= ? AND pi.date <= ? AND ${purchaseScope.clause}`,
      [dateFrom, dateTo, ...purchaseScope.params]
    )[0] || {};
    const salesReturns = this.db.query<any>(
      `SELECT COALESCE(SUM(sr.total_amount), 0) AS net,
              COALESCE(SUM(${salesReturnTax}), 0) AS tax
       FROM sales_returns sr
       JOIN sales_invoices original ON original.id = sr.original_invoice_id
       WHERE sr.date >= ? AND sr.date <= ? AND original.invoice_status != 'VOID'
         AND ${returnSalesScope.clause}`,
      [dateFrom, dateTo, ...returnSalesScope.params]
    )[0] || {};
    const purchaseReturns = this.db.query<any>(
      `SELECT COALESCE(SUM(pr.total_amount), 0) AS total,
              COALESCE(SUM(${purchaseReturnTax}), 0) AS tax
       FROM purchase_returns pr
       JOIN purchase_invoices original ON original.id = pr.original_purchase_id
       WHERE pr.date >= ? AND pr.date <= ? AND ${returnPurchaseScope.clause}`,
      [dateFrom, dateTo, ...returnPurchaseScope.params]
    )[0] || {};
    const outputTax = round2(Number(sales.tax || 0) - Number(salesReturns.tax || 0));
    const inputTax = round2(Number(purchases.tax || 0) - Number(purchaseReturns.tax || 0));
    return {
      outputTax,
      inputTax,
      netTax: round2(outputTax - inputTax),
      salesTotal: round2(Number(sales.total || 0) - Number(salesReturns.net || 0) - Number(salesReturns.tax || 0)),
      purchasesTotal: round2(
        Number(purchases.total || 0) - Number(purchaseReturns.total || 0)
      ),
      salesCount: sales.count || 0,
      purchasesCount: purchases.count || 0,
    };
  }

  getTaxByMonth(dateFrom: string, dateTo: string) {
    this.requireView();
    const salesScope = this.taxScope('si');
    const purchaseScope = this.taxScope('pi');
    const returnSalesScope = this.taxScope('original');
    const returnPurchaseScope = this.taxScope('original');
    const salesReturnTax = returnTaxSql(
      'sr.total_amount', 'original.subtotal', 'original.discount_amount', 'original.tax_amount'
    );
    const purchaseReturnTax = inclusiveReturnTaxSql(
      'pr.total_amount', 'original.subtotal', 'original.discount_amount', 'original.tax_amount'
    );
    return this.db.query<{ month: string; outputTax: number; inputTax: number }>(
      `SELECT month, SUM(output_tax) AS outputTax, SUM(input_tax) AS inputTax FROM (
         SELECT substr(si.date, 1, 7) AS month, si.tax_amount AS output_tax, 0 AS input_tax
         FROM sales_invoices si
         WHERE si.invoice_status != 'VOID' AND si.date >= ? AND si.date <= ? AND ${salesScope.clause}
         UNION ALL
         SELECT substr(sr.date, 1, 7) AS month,
                -(${salesReturnTax}) AS output_tax,
                0 AS input_tax
         FROM sales_returns sr
         JOIN sales_invoices original ON original.id = sr.original_invoice_id
         WHERE sr.date >= ? AND sr.date <= ? AND original.invoice_status != 'VOID'
           AND ${returnSalesScope.clause}
         UNION ALL
         SELECT substr(pi.date, 1, 7) AS month, 0 AS output_tax, pi.tax_amount AS input_tax
         FROM purchase_invoices pi
         WHERE pi.date >= ? AND pi.date <= ? AND ${purchaseScope.clause}
         UNION ALL
         SELECT substr(pr.date, 1, 7) AS month, 0 AS output_tax,
                -(${purchaseReturnTax}) AS input_tax
         FROM purchase_returns pr
         JOIN purchase_invoices original ON original.id = pr.original_purchase_id
         WHERE pr.date >= ? AND pr.date <= ? AND ${returnPurchaseScope.clause}
       ) GROUP BY month ORDER BY month DESC`,
      [
        dateFrom, dateTo, ...salesScope.params,
        dateFrom, dateTo, ...returnSalesScope.params,
        dateFrom, dateTo, ...purchaseScope.params,
        dateFrom, dateTo, ...returnPurchaseScope.params,
      ]
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
    const actor = this.requireView();
    const allowed = this.branchAccess.getAccessibleBranchIds(actor);
    if (allowed === null) return this.db.query<FixedAsset>('SELECT * FROM fixed_assets ORDER BY code ASC');
    if (!allowed.length) return [];
    return this.db.query<FixedAsset>(
      `SELECT * FROM fixed_assets WHERE branch_id IN (${allowed.map(() => '?').join(',')}) ORDER BY code ASC`,
      allowed
    );
  }

  private requireAssetAccess(asset: FixedAsset, actor = AuthService.requireAuth()): void {
    if (!asset.branchId) {
      if (actor.role !== 'ADMIN') throw new Error('الأصل غير مرتبط بفرع ولا يمكن الوصول إليه.');
      return;
    }
    const allowed = this.branchAccess.getAccessibleBranchIds(actor);
    if (allowed !== null && !allowed.includes(asset.branchId)) throw new Error('ليس لديك صلاحية الوصول إلى هذا الأصل.');
  }

  saveFixedAsset(input: Partial<FixedAsset> & {
    name: string; purchaseDate: string; purchaseCost: number; paymentType?: string; registerId?: string;
    depreciationMethod?: FixedAsset['depreciationMethod']; decliningRate?: number | null; expectedUnits?: number | null;
  }): void {
    const actor = this.requireManage();
    if (!input.name.trim()) throw new Error('اسم الأصل مطلوب.');
    if (!Number.isFinite(Number(input.purchaseCost)) || round2(Number(input.purchaseCost)) <= 0) throw new Error('تكلفة الشراء يجب أن تكون أكبر من صفر.');
    if (!validDate(input.purchaseDate)) throw new Error('تاريخ الشراء غير صحيح.');
    const method = input.depreciationMethod || 'STRAIGHT_LINE';
    if (!['STRAIGHT_LINE', 'DECLINING_BALANCE', 'UNITS_OF_PRODUCTION', 'NON_DEPRECIABLE'].includes(method)) {
      throw new Error('طريقة الإهلاك غير صحيحة.');
    }
    const salvage = Number(input.salvageValue || 0);
    const life = Number(input.usefulLifeYears || 5);
    const rate = input.decliningRate == null ? null : Number(input.decliningRate);
    const units = input.expectedUnits == null ? null : Number(input.expectedUnits);
    if (!Number.isFinite(salvage) || salvage < 0 || salvage > Number(input.purchaseCost)) throw new Error('قيمة الإنقاذ يجب ألا تتجاوز تكلفة الأصل.');
    if (!Number.isFinite(life) || life < 0 || (method !== 'NON_DEPRECIABLE' && life <= 0)) {
      throw new Error('العمر الإنتاجي غير صحيح.');
    }
    if (method === 'DECLINING_BALANCE' && (rate === null || !Number.isFinite(rate) || rate <= 0 || rate > 1)) {
      throw new Error('معدل الإهلاك المتناقص مطلوب ويجب أن يكون بين 0 و1.');
    }
    if (method === 'UNITS_OF_PRODUCTION' && (units === null || !Number.isFinite(units) || units <= 0)) {
      throw new Error('إجمالي الوحدات المتوقع يجب أن يكون أكبر من صفر.');
    }
    const values = [
      input.name.trim(),
      input.category || 'OTHER',
      input.purchaseDate,
      round2(Number(input.purchaseCost)),
      round2(salvage),
      method === 'NON_DEPRECIABLE' ? Math.max(0, life) : life,
      input.status || 'ACTIVE',
      input.location || null,
      input.notes || null,
      method,
      rate,
      units,
    ];
    if (input.id) {
      const posted = this.db.query<any>(`SELECT id FROM journal_entries WHERE reference_type='ASSET_ACQUISITION' AND reference_id=?`, [input.id])[0];
      const existing = this.db.query<FixedAsset>('SELECT * FROM fixed_assets WHERE id=?', [input.id])[0];
      if (!existing) throw new Error('Fixed asset not found.');
      this.requireAssetAccess(existing, actor);
      if (existing.status === 'DISPOSED') throw new Error('لا يمكن تعديل أصل مستبعد.');
      if (input.status !== undefined && input.status !== existing.status) throw new Error('يجب تنفيذ تغيير حالة الأصل من خلال إجراء الاستبعاد.');
      if ((input.location || null) !== (existing.location || null)) throw new Error('غيّر موقع الأصل من خلال سجل النقل للحفاظ على سجل الحركة.');
      if (this.db.query('SELECT id FROM fixed_asset_depreciation_periods WHERE asset_id = ? LIMIT 1', [input.id]).length &&
          (existing.depreciationMethod !== method || Number(existing.usefulLifeYears) !== life ||
            Number(existing.salvageValue) !== salvage || Number(existing.decliningRate || 0) !== Number(rate || 0) ||
            Number(existing.expectedUnits || 0) !== Number(units || 0))) {
        throw new Error('لا يمكن تغيير طريقة أو مدخلات الإهلاك بعد ترحيل إهلاك للأصل.');
      }
      if (posted && (existing.purchaseDate !== input.purchaseDate || Math.abs(Number(existing.purchaseCost) - Number(input.purchaseCost)) > 0.009)) {
        throw new Error('The acquisition date and cost cannot be edited after posting. Dispose and re-enter the asset to correct it.');
      }
      this.db.run(
        `UPDATE fixed_assets SET name = ?, category = ?, purchase_date = ?, purchase_cost = ?, salvage_value = ?,
           useful_life_years = ?, status = ?, location = ?, notes = ?, depreciation_method = ?, declining_rate = ?,
           expected_units = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [...values, input.id]
      );
    } else {
      if (input.status !== undefined && input.status !== 'ACTIVE') throw new Error('يجب تسجيل الأصل أولًا كأصل نشط.');
      const id = `fa_${uuidv4().substring(0, 8)}`;
      const maxCode = this.db.query<{ code: string }>('SELECT code FROM fixed_assets ORDER BY code DESC LIMIT 1')[0]?.code;
      const lastNumber = maxCode ? Number(String(maxCode).replace(/\D/g, '')) : 0;
      const next = Number.isFinite(lastNumber) ? lastNumber + 1 : 1;
      const paymentType = input.paymentType || 'CREDIT';
      const registerId = input.registerId || 'cr_main';
      const branchId = input.branchId || this.branchAccess.getCurrentBranchId(actor);
      const allowed = this.branchAccess.getAccessibleBranchIds(actor);
      if (!this.db.query('SELECT id FROM branches WHERE id = ? AND is_active = 1', [branchId]).length ||
          (allowed !== null && !allowed.includes(branchId))) throw new Error('الفرع المحدد غير متاح أو خارج نطاق صلاحيتك.');
      this.db.executeTransaction((db) => {
        db.run(
          `INSERT INTO fixed_assets (id, code, name, category, purchase_date, purchase_cost, salvage_value,
             useful_life_years, status, location, notes, depreciation_method, declining_rate, expected_units,
             branch_id, department_id, responsible_user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, `FA-${String(next).padStart(4, '0')}`, ...values, branchId, input.departmentId || null, input.responsibleUserId || null]
        );
        const cashAccount = paymentType === 'CREDIT' ? '2201' : paymentAccountCode(paymentType);
        if (paymentType === 'CASH') {
          const register = db.query<any>('SELECT id FROM cash_registers WHERE id=? AND is_active=1', [registerId])[0];
          if (!register) throw new Error('The selected cash register is unavailable.');
          db.run('UPDATE cash_registers SET current_balance=current_balance-? WHERE id=?', [Number(input.purchaseCost), registerId]);
        }
        postLedgerEntry(db.getDatabase(), {
          date: input.purchaseDate,
          description: `Fixed asset acquisition: ${input.name.trim()}`,
          referenceType: 'ASSET_ACQUISITION', referenceId: id, createdBy: actor.id, branchId,
          lines: [
            { accountCode: '1601', debit: Number(input.purchaseCost), credit: 0 },
            { accountCode: cashAccount, debit: 0, credit: Number(input.purchaseCost) },
          ],
        });
        db.run(`INSERT INTO audit_logs (id,user_id,user_name,action,module,record_id,new_values) VALUES (?,?,?,?,?,?,?)`,
          [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, 'Record fixed asset acquisition', 'FINANCE', id,
            JSON.stringify({ purchaseCost: input.purchaseCost, purchaseDate: input.purchaseDate, paymentType, registerId })]);
      });
    }
  }

  postMonthlyDepreciation(id: string): void {
    this.requestFixedAssetDepreciation(id, localDateString().slice(0, 7));
  }

  getDepreciationSchedule(assetId: string, throughPeriod: string, usageQuantity?: number): Array<{
    period: string; amount: number; usageQuantity: number | null; status: 'POSTED' | 'SCHEDULED';
  }> {
    this.requireView();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(throughPeriod)) throw new Error('فترة الإهلاك غير صحيحة.');
    const asset = this.db.query<FixedAsset>('SELECT * FROM fixed_assets WHERE id = ?', [assetId])[0];
    if (!asset) throw new Error('الأصل غير موجود.');
    this.requireAssetAccess(asset);
    const depreciationRows = this.db.query<{ period: string; amount: number; usageQuantity: number | null }>(
      'SELECT period, amount, usage_quantity FROM fixed_asset_depreciation_periods WHERE asset_id = ? ORDER BY period',
      [assetId]
    );
    const posted = new Map(depreciationRows.map((row) => [row.period, row]));
    const postedTotal = depreciationRows.reduce((total, row) => total + Number(row.amount), 0);
    let accumulated = Math.max(0, Number(asset.accumulatedDepreciation || 0) - postedTotal);
    const depreciable = Math.max(0, Number(asset.purchaseCost) - Number(asset.salvageValue));
    const start = asset.purchaseDate.slice(0, 7);
    if (throughPeriod < start) return [];
    const schedule: Array<{ period: string; amount: number; usageQuantity: number | null; status: 'POSTED' | 'SCHEDULED' }> = [];
    let [year, month] = start.split('-').map(Number);
    let cursor = start;
    while (cursor <= throughPeriod) {
      const prior = posted.get(cursor);
      if (prior) {
        accumulated += Number(prior.amount);
        schedule.push({ period: cursor, amount: Number(prior.amount), usageQuantity: prior.usageQuantity, status: 'POSTED' });
      } else {
        let amount = 0;
        const remaining = Math.max(0, depreciable - accumulated);
        switch (asset.depreciationMethod || 'STRAIGHT_LINE') {
          case 'STRAIGHT_LINE':
            amount = asset.usefulLifeYears > 0 ? round2(depreciable / (Number(asset.usefulLifeYears) * 12)) : 0;
            break;
          case 'DECLINING_BALANCE':
            amount = round2(Math.max(0, Number(asset.purchaseCost) - accumulated) * Number(asset.decliningRate || 0) / 12);
            break;
          case 'UNITS_OF_PRODUCTION':
            if (cursor === throughPeriod && usageQuantity !== undefined) {
              if (!Number.isFinite(usageQuantity) || usageQuantity < 0) throw new Error('كمية الاستخدام يجب أن تكون رقمًا غير سالب.');
              amount = Number(asset.expectedUnits) > 0
                ? round2(depreciable * usageQuantity / Number(asset.expectedUnits))
                : 0;
            }
            break;
          case 'NON_DEPRECIABLE':
            amount = 0;
            break;
          default:
            throw new Error('طريقة الإهلاك المخزنة غير مدعومة.');
        }
        amount = round2(Math.min(remaining, amount));
        accumulated += amount;
        schedule.push({
          period: cursor, amount,
          usageQuantity: cursor === throughPeriod && asset.depreciationMethod === 'UNITS_OF_PRODUCTION' ? usageQuantity ?? null : null,
          status: 'SCHEDULED',
        });
      }
      month += 1;
      if (month > 12) { month = 1; year += 1; }
      cursor = `${year}-${String(month).padStart(2, '0')}`;
    }
    return schedule;
  }

  requestFixedAssetDepreciation(id: string, period: string, usageQuantity?: number): string {
    const actor = this.requireManage();
    const asset = this.db.query<FixedAsset>('SELECT * FROM fixed_assets WHERE id = ?', [id])[0];
    if (!asset) throw new Error('الأصل غير موجود.');
    this.requireAssetAccess(asset, actor);
    if (asset.status !== 'ACTIVE') throw new Error('لا يمكن إهلاك أصل غير نشط.');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error('فترة الإهلاك غير صحيحة.');
    const today = localDateString();
    if (period > today.slice(0, 7)) throw new Error('لا يمكن ترحيل إهلاك فترة مستقبلية.');
    if (asset.depreciationMethod === 'UNITS_OF_PRODUCTION' &&
        (usageQuantity === undefined || !Number.isFinite(usageQuantity) || usageQuantity < 0)) {
      throw new Error('طريقة وحدات الإنتاج تتطلب كمية استخدام غير سالبة للفترة.');
    }
    const postingDate = `${period}-${new Date(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0).getDate()}`;
    if (!validDate(postingDate) || postingDate < asset.purchaseDate) throw new Error('فترة الإهلاك تسبق تاريخ بدء الأصل.');
    this.assertPostingDate(postingDate, true);
    if (this.db.query('SELECT id FROM fixed_asset_depreciation_periods WHERE asset_id = ? AND period = ?', [id, period]).length) {
      throw new Error('تم ترحيل إهلاك هذا الأصل لهذه الفترة بالفعل.');
    }
    if (this.db.query('SELECT id FROM fixed_asset_depreciation_requests WHERE asset_id = ? AND period = ?', [id, period]).length) {
      throw new Error('تم تقديم طلب إهلاك لهذا الأصل والفترة بالفعل.');
    }
    if (this.db.query(
      'SELECT id FROM fixed_asset_depreciation_requests WHERE asset_id = ? AND status = ?',
      [id, 'PENDING']
    ).length) {
      throw new Error('يوجد طلب إهلاك آخر قيد المراجعة لهذا الأصل.');
    }
    if (this.db.query(
      'SELECT id FROM journal_entries WHERE reference_type = ? AND reference_id = ?',
      ['ASSET_DEPRECIATION', `${id}:${period}`]
    ).length) {
      throw new Error('يوجد قيد إهلاك سابق لهذه الفترة؛ راجع سجل الترحيل قبل أي معالجة.');
    }
    const schedule = this.getDepreciationSchedule(id, period, usageQuantity);
    const currentPeriod = schedule[schedule.length - 1];
    const amount = Number(currentPeriod?.amount || 0);
    if (amount <= 0) throw new Error('لا توجد قيمة قابلة للإهلاك.');
    const requestId = `fadr_${uuidv4().substring(0, 12)}`;
    this.db.executeTransaction((db) => {
      db.run(
        `INSERT INTO fixed_asset_depreciation_requests
         (id, asset_id, period, posting_date, amount, usage_quantity, requested_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [requestId, id, period, postingDate, round2(amount),
          asset.depreciationMethod === 'UNITS_OF_PRODUCTION' ? usageQuantity ?? null : null, actor.id]
      );
      db.run(
        'INSERT INTO audit_logs (id,user_id,user_name,action,module,record_id,new_values) VALUES (?,?,?,?,?,?,?)',
        [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, 'Request fixed asset depreciation', 'FINANCE',
          asset.id, JSON.stringify({ requestId, period, postingDate, amount: round2(amount) })]
      );
    });
    return requestId;
  }

  postDepreciationPeriod(id: string, period: string, usageQuantity?: number): void {
    this.requestFixedAssetDepreciation(id, period, usageQuantity);
  }

  getFixedAssetDepreciationRequests(assetId: string): FixedAssetDepreciationRequest[] {
    const actor = this.requireView();
    const asset = this.db.query<FixedAsset>('SELECT * FROM fixed_assets WHERE id = ?', [assetId])[0];
    if (!asset) throw new Error('الأصل غير موجود.');
    this.requireAssetAccess(asset, actor);
    return this.db.query<FixedAssetDepreciationRequest>(
      `SELECT r.*, requester.full_name AS requester_name, approver.full_name AS approver_name
       FROM fixed_asset_depreciation_requests r
       JOIN users requester ON requester.id = r.requested_by
       LEFT JOIN users approver ON approver.id = r.approved_by
       WHERE r.asset_id = ? ORDER BY r.created_at DESC, r.id DESC`,
      [assetId]
    );
  }

  approveFixedAssetDepreciationRequest(requestId: string): FixedAssetDepreciationPeriod {
    const actor = this.requireManage();
    const request = this.db.query<FixedAssetDepreciationRequest>(
      'SELECT * FROM fixed_asset_depreciation_requests WHERE id = ?',
      [requestId]
    )[0];
    if (!request) throw new Error('طلب الإهلاك غير موجود.');
    if (request.status !== 'PENDING') throw new Error('تمت معالجة طلب الإهلاك بالفعل.');
    if (request.requestedBy === actor.id) throw new Error('يجب أن يكون معتمد الإهلاك مستخدمًا مختلفًا عن مقدم الطلب.');
    const asset = this.db.query<FixedAsset>('SELECT * FROM fixed_assets WHERE id = ?', [request.assetId])[0];
    if (!asset) throw new Error('الأصل غير موجود.');
    this.requireAssetAccess(asset, actor);
    if (asset.status !== 'ACTIVE') throw new Error('لا يمكن إهلاك أصل غير نشط.');
    this.assertPostingDate(request.postingDate, true);
    if (this.db.query(
      'SELECT id FROM fixed_asset_depreciation_periods WHERE asset_id = ? AND period = ?',
      [asset.id, request.period]
    ).length) throw new Error('تم ترحيل إهلاك هذا الأصل لهذه الفترة بالفعل.');
    if (this.db.query(
      'SELECT id FROM journal_entries WHERE reference_type = ? AND reference_id = ?',
      ['ASSET_DEPRECIATION', `${asset.id}:${request.period}`]
    ).length) throw new Error('يوجد قيد إهلاك سابق لهذه الفترة؛ راجع سجل الترحيل قبل أي معالجة.');
    const expense = this.accountByCode('5205', 'EXPENSE');
    const accumulated = this.accountByCode('1602', 'ASSET');
    if (!expense || !accumulated) throw new Error('حسابات الإهلاك غير مهيأة في دليل الحسابات.');
    const amount = round2(Number(request.amount));
    const depreciable = Math.max(0, Number(asset.purchaseCost) - Number(asset.salvageValue));
    const nextAccumulated = round2(Number(asset.accumulatedDepreciation) + amount);
    if (amount <= 0 || nextAccumulated > depreciable + 0.009) {
      throw new Error('تغير رصيد الأصل منذ تقديم الطلب؛ أعد تقديم طلب الإهلاك بعد المراجعة.');
    }
    const periodId = `fad_${uuidv4().substring(0, 8)}`;
    let result: FixedAssetDepreciationPeriod | undefined;
    this.db.executeTransaction((db) => {
      const current = db.query<{ status: string; requestedBy: string }>(
        'SELECT status, requested_by AS requestedBy FROM fixed_asset_depreciation_requests WHERE id = ?',
        [requestId]
      )[0];
      if (!current || current.status !== 'PENDING') throw new Error('تمت معالجة طلب الإهلاك بالفعل.');
      if (current.requestedBy === actor.id) throw new Error('يجب أن يكون معتمد الإهلاك مستخدمًا مختلفًا عن مقدم الطلب.');
      const entryId = postLedgerEntry(db.getDatabase(), {
        date: request.postingDate,
        description: `إهلاك ${request.period}: ${asset.name} (${asset.code})`,
        referenceType: 'ASSET_DEPRECIATION', referenceId: `${asset.id}:${request.period}`,
        createdBy: actor.id, branchId: asset.branchId,
        lines: [
          { accountCode: '5205', debit: amount, credit: 0 },
          { accountCode: '1602', debit: 0, credit: amount },
        ],
      });
      db.run(
        `INSERT INTO fixed_asset_depreciation_periods
         (id, asset_id, period, posting_date, amount, usage_quantity, status, journal_entry_id, posted_by)
         VALUES (?, ?, ?, ?, ?, ?, 'POSTED', ?, ?)`,
        [periodId, asset.id, request.period, request.postingDate, amount, request.usageQuantity, entryId, actor.id]
      );
      db.run(
        'UPDATE fixed_assets SET accumulated_depreciation = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [Math.min(depreciable, nextAccumulated), nextAccumulated >= depreciable - 0.009 ? 'FULLY_DEPRECIATED' : 'ACTIVE', asset.id]
      );
      db.run(
        `UPDATE fixed_asset_depreciation_requests
         SET status = 'APPROVED', approved_by = ?, journal_entry_id = ?, depreciation_period_id = ?, approved_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'PENDING'`,
        [actor.id, entryId, periodId, requestId]
      );
      db.run(
        'INSERT INTO audit_logs (id,user_id,user_name,action,module,record_id,new_values) VALUES (?,?,?,?,?,?,?)',
        [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, 'Approve fixed asset depreciation', 'FINANCE',
          asset.id, JSON.stringify({ requestId, period: request.period, amount, journalEntryId: entryId })]
      );
      result = {
        id: periodId, assetId: asset.id, period: request.period, postingDate: request.postingDate,
        amount, usageQuantity: request.usageQuantity, status: 'POSTED', journalEntryId: entryId, postedBy: actor.id,
      };
    });
    if (!result) throw new Error('تعذر اعتماد طلب الإهلاك.');
    return result;
  }

  private accountByCode(code: string, type: AccountType): { id: string } | undefined {
    return this.db.query<{ id: string }>('SELECT id FROM chart_of_accounts WHERE code = ? AND type = ? AND is_active = 1', [code, type])[0];
  }

  getFixedAssetTransfers(assetId: string): FixedAssetTransfer[] {
    const actor = this.requireView();
    const asset = this.db.query<FixedAsset>('SELECT * FROM fixed_assets WHERE id = ?', [assetId])[0];
    if (!asset) throw new Error('الأصل غير موجود.');
    this.requireAssetAccess(asset, actor);
    return this.db.query<FixedAssetTransfer>(
      `SELECT t.*, u.full_name AS actor_name
       FROM fixed_asset_transfers t JOIN users u ON u.id = t.actor_id
       WHERE t.asset_id = ? ORDER BY t.transfer_date DESC, t.created_at DESC`,
      [assetId]
    );
  }

  getFixedAssetTimeline(assetId: string): FixedAssetTimelineEvent[] {
    const actor = this.requireView();
    const asset = this.db.query<FixedAsset>('SELECT * FROM fixed_assets WHERE id = ?', [assetId])[0];
    if (!asset) throw new Error('الأصل غير موجود.');
    this.requireAssetAccess(asset, actor);
    return this.db.query<FixedAssetTimelineEvent>(
      `SELECT event_date AS eventDate, event_type AS eventType, label, amount,
              actor_name AS actorName, reference_id AS referenceId, details
       FROM (
         SELECT e.date AS event_date, 'ACQUISITION' AS event_type, 'اقتناء الأصل' AS label,
                e.total_debit AS amount, u.full_name AS actor_name, e.id AS reference_id,
                e.description AS details, e.created_at AS sort_time
         FROM journal_entries e
         LEFT JOIN users u ON u.id = e.created_by
         WHERE e.reference_type = 'ASSET_ACQUISITION' AND e.reference_id = ?
         UNION ALL
         SELECT t.transfer_date, 'TRANSFER', 'نقل الأصل', NULL, u.full_name, t.id,
                COALESCE(t.notes, '') ||
                  CASE WHEN t.from_location IS NOT t.to_location
                    THEN ' | الموقع: ' || COALESCE(t.from_location, '—') || ' ← ' || COALESCE(t.to_location, '—')
                    ELSE '' END ||
                  ' | الفرع: ' || COALESCE(t.from_branch_id, '—') || ' ← ' || COALESCE(t.to_branch_id, '—'),
                t.created_at
         FROM fixed_asset_transfers t
         JOIN users u ON u.id = t.actor_id
         WHERE t.asset_id = ?
         UNION ALL
         SELECT m.maintenance_date, 'MAINTENANCE',
                CASE m.cost_treatment WHEN 'CAPITALIZED' THEN 'تحسين رأسمالي' ELSE 'صيانة تشغيلية' END,
                m.cost, u.full_name, COALESCE(m.journal_entry_id, m.id),
                m.maintenance_type || ' — ' || m.description ||
                  CASE WHEN m.vendor IS NOT NULL AND TRIM(m.vendor) <> '' THEN ' | المورد: ' || m.vendor ELSE '' END,
                m.created_at
         FROM fixed_asset_maintenance m
         JOIN users u ON u.id = m.actor_id
         WHERE m.asset_id = ?
         UNION ALL
         SELECT d.posting_date, 'DEPRECIATION', 'إهلاك مرحّل', d.amount, u.full_name,
                d.journal_entry_id, 'الفترة ' || d.period || ' — الحالة: ' || d.status, d.created_at
         FROM fixed_asset_depreciation_periods d
         JOIN users u ON u.id = d.posted_by
         WHERE d.asset_id = ?
         UNION ALL
         SELECT d.disposal_date, 'DISPOSAL', 'استبعاد معتمد', d.sale_proceeds, u.full_name,
                d.journal_entry_id,
                d.reason || ' | القيمة الدفترية: ' || d.book_value ||
                  ' | مصروفات: ' || d.expenses || ' | ربح/خسارة: ' || d.gain_loss,
                d.created_at
         FROM fixed_asset_disposals d
         JOIN users u ON u.id = d.approved_by
         WHERE d.asset_id = ?
       )
       ORDER BY event_date DESC, sort_time DESC, reference_id DESC`,
      [assetId, assetId, assetId, assetId, assetId]
    );
  }

  transferFixedAsset(input: {
    assetId: string; transferDate: string; branchId: string; departmentId?: string; location?: string;
    responsibleUserId?: string; notes?: string;
  }): void {
    const actor = this.requireManage();
    const asset = this.db.query<FixedAsset>('SELECT * FROM fixed_assets WHERE id = ?', [input.assetId])[0];
    if (!asset) throw new Error('الأصل غير موجود.');
    this.requireAssetAccess(asset, actor);
    if (asset.status === 'DISPOSED') throw new Error('لا يمكن نقل أصل مستبعد.');
    if (!validDate(input.transferDate) || input.transferDate < asset.purchaseDate) throw new Error('تاريخ النقل غير صحيح.');
    const allowed = this.branchAccess.getAccessibleBranchIds(actor);
    if (!input.branchId || !this.db.query('SELECT id FROM branches WHERE id = ? AND is_active = 1', [input.branchId]).length ||
        (allowed !== null && !allowed.includes(input.branchId))) throw new Error('الفرع الوجهة غير متاح أو خارج نطاق صلاحيتك.');
    const lastTransfer = this.db.query<{ transferDate: string }>(
      'SELECT transfer_date AS transferDate FROM fixed_asset_transfers WHERE asset_id = ? ORDER BY transfer_date DESC, created_at DESC LIMIT 1',
      [asset.id]
    )[0];
    if (lastTransfer && input.transferDate < lastTransfer.transferDate) throw new Error('تاريخ النقل لا يمكن أن يسبق آخر حركة مسجلة.');
    if (asset.branchId === input.branchId && (asset.departmentId || null) === (input.departmentId || null) &&
        (asset.location || null) === (input.location?.trim() || null) &&
        (asset.responsibleUserId || null) === (input.responsibleUserId || null)) {
      throw new Error('بيانات النقل مطابقة للموقع الحالي للأصل.');
    }
    if (input.departmentId) {
      const department = this.db.query<{ branchId: string | null }>('SELECT branch_id AS branchId FROM departments WHERE id = ?', [input.departmentId])[0];
      if (!department || (department.branchId && department.branchId !== input.branchId)) throw new Error('القسم غير موجود في الفرع الوجهة.');
    }
    if (input.responsibleUserId && !this.db.query(
      `SELECT u.id FROM users u
       WHERE u.id = ? AND u.is_active = 1 AND
         (u.role = 'ADMIN' OR u.branch_scope = 'ALL' OR EXISTS (
           SELECT 1 FROM users_branches ub WHERE ub.user_id = u.id AND ub.branch_id = ?
         ))`,
      [input.responsibleUserId, input.branchId]
    ).length) {
      throw new Error('المستخدم المسؤول غير موجود أو غير نشط.');
    }
    const id = `fat_${uuidv4().substring(0, 8)}`;
    this.db.executeTransaction((db) => {
      db.run(
        `INSERT INTO fixed_asset_transfers
         (id, asset_id, transfer_date, from_branch_id, to_branch_id, from_department_id, to_department_id,
          from_location, to_location, from_responsible_user_id, to_responsible_user_id, notes, actor_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, asset.id, input.transferDate, asset.branchId || null, input.branchId, asset.departmentId || null,
          input.departmentId || null, asset.location || null, input.location?.trim() || null,
          asset.responsibleUserId || null, input.responsibleUserId || null, input.notes?.trim() || null, actor.id]
      );
      db.run(
        `UPDATE fixed_assets SET branch_id = ?, department_id = ?, location = ?, responsible_user_id = ?,
         updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [input.branchId, input.departmentId || null, input.location?.trim() || null, input.responsibleUserId || null, asset.id]
      );
      db.run(
        'INSERT INTO audit_logs (id,user_id,user_name,action,module,record_id,new_values) VALUES (?,?,?,?,?,?,?)',
        [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, 'Transfer fixed asset', 'FINANCE', asset.id, JSON.stringify(input)]
      );
    });
  }

  getFixedAssetMaintenance(assetId: string): FixedAssetMaintenance[] {
    const actor = this.requireView();
    const asset = this.db.query<FixedAsset>('SELECT * FROM fixed_assets WHERE id = ?', [assetId])[0];
    if (!asset) throw new Error('الأصل غير موجود.');
    this.requireAssetAccess(asset, actor);
    return this.db.query<FixedAssetMaintenance>(
      `SELECT m.*, u.full_name AS actor_name
       FROM fixed_asset_maintenance m JOIN users u ON u.id = m.actor_id
       WHERE m.asset_id = ? ORDER BY m.maintenance_date DESC, m.created_at DESC`,
      [assetId]
    );
  }

  recordFixedAssetMaintenance(input: {
    assetId: string; date: string; type: string; description: string; cost: number;
    treatment: 'OPERATIONAL' | 'CAPITALIZED'; vendor?: string; nextDate?: string;
  }): string {
    const actor = this.requireManage();
    const asset = this.db.query<FixedAsset>('SELECT * FROM fixed_assets WHERE id = ?', [input.assetId])[0];
    if (!asset) throw new Error('الأصل غير موجود.');
    this.requireAssetAccess(asset, actor);
    if (asset.status === 'DISPOSED') throw new Error('لا يمكن تسجيل صيانة لأصل مستبعد.');
    if (!validDate(input.date) || input.date < asset.purchaseDate || input.date > localDateString()) throw new Error('تاريخ الصيانة غير صحيح.');
    this.assertPostingDate(input.date);
    if (input.nextDate && (!validDate(input.nextDate) || input.nextDate < input.date)) throw new Error('تاريخ الصيانة التالية غير صحيح.');
    if (!input.type.trim() || !input.description.trim()) throw new Error('نوع الصيانة والوصف مطلوبان.');
    if (!Number.isFinite(input.cost) || input.cost <= 0) throw new Error('تكلفة الصيانة يجب أن تكون أكبر من صفر.');
    if (!['OPERATIONAL', 'CAPITALIZED'].includes(input.treatment)) throw new Error('معالجة التكلفة غير صحيحة.');
    if (input.treatment === 'CAPITALIZED' && input.cost <= 0) throw new Error('قيمة التحسين الرأسمالي يجب أن تكون أكبر من صفر.');
    const id = `fam_${uuidv4().substring(0, 8)}`;
    this.db.executeTransaction((db) => {
      let journalEntryId: string | null = null;
      if (input.treatment === 'OPERATIONAL') {
        journalEntryId = postLedgerEntry(db.getDatabase(), {
          date: input.date,
          description: `صيانة تشغيلية للأصل ${asset.code}: ${input.description.trim()}`,
          referenceType: 'ASSET_OPERATIONAL_MAINTENANCE', referenceId: id,
          createdBy: actor.id, branchId: asset.branchId,
          lines: [
            { accountCode: '5201', debit: round2(input.cost), credit: 0 },
            { accountCode: '2201', debit: 0, credit: round2(input.cost) },
          ],
        });
      } else {
        journalEntryId = postLedgerEntry(db.getDatabase(), {
          date: input.date, description: `تحسين رأسمالي للأصل ${asset.code}: ${input.description.trim()}`,
          referenceType: 'ASSET_CAPITALIZED_MAINTENANCE', referenceId: id, createdBy: actor.id, branchId: asset.branchId,
          lines: [
            { accountCode: '1601', debit: round2(input.cost), credit: 0 },
            { accountCode: '2201', debit: 0, credit: round2(input.cost) },
          ],
        });
      }
      db.run(
        `INSERT INTO fixed_asset_maintenance
         (id, asset_id, maintenance_date, maintenance_type, description, cost, cost_treatment, vendor, next_maintenance_date, journal_entry_id, actor_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, asset.id, input.date, input.type.trim(), input.description.trim(), round2(input.cost), input.treatment,
          input.vendor?.trim() || null, input.nextDate || null, journalEntryId, actor.id]
      );
      if (input.treatment === 'CAPITALIZED') {
        db.run('UPDATE fixed_assets SET purchase_cost = ROUND(purchase_cost + ?, 2), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [round2(input.cost), asset.id]);
      }
      db.run(
        'INSERT INTO audit_logs (id,user_id,user_name,action,module,record_id,new_values) VALUES (?,?,?,?,?,?,?)',
        [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, 'Record fixed asset maintenance', 'FINANCE',
          asset.id, JSON.stringify({ maintenanceId: id, date: input.date, treatment: input.treatment, cost: round2(input.cost), journalEntryId })]
      );
    });
    return id;
  }

  getFixedAssetDisposal(assetId: string): FixedAssetDisposal | null {
    const actor = this.requireView();
    const asset = this.db.query<FixedAsset>('SELECT * FROM fixed_assets WHERE id = ?', [assetId])[0];
    if (!asset) throw new Error('الأصل غير موجود.');
    this.requireAssetAccess(asset, actor);
    return this.db.query<FixedAssetDisposal>('SELECT * FROM fixed_asset_disposals WHERE asset_id = ?', [assetId])[0] || null;
  }

  getFixedAssetSettlementSources(assetId: string): FixedAssetSettlementSource[] {
    const actor = this.requireView();
    const asset = this.db.query<FixedAsset>('SELECT * FROM fixed_assets WHERE id = ?', [assetId])[0];
    if (!asset) throw new Error('الأصل غير موجود.');
    this.requireAssetAccess(asset, actor);
    if (!asset.branchId) return [];
    return [
      ...this.db.query<{ id: string; name: string; currentBalance: number }>(
        `SELECT id, name, current_balance AS currentBalance FROM cash_registers
         WHERE is_active = 1 AND branch_id = ? ORDER BY is_default DESC, name`,
        [asset.branchId]
      ).map((row) => ({ ...row, type: 'CASH_REGISTER' as const, currentBalance: Number(row.currentBalance) })),
      ...this.db.query<{ id: string; name: string; currentBalance: number }>(
        `SELECT ba.id, ba.account_name AS name, ba.current_balance AS currentBalance
         FROM bank_accounts ba
         JOIN chart_of_accounts coa ON coa.id = ba.gl_account_id
         WHERE ba.is_active = 1 AND ba.branch_id = ? AND ba.currency = 'EGP'
           AND coa.is_active = 1 AND coa.type = 'ASSET'
         ORDER BY ba.account_name`,
        [asset.branchId]
      ).map((row) => ({ ...row, type: 'BANK_ACCOUNT' as const, currentBalance: Number(row.currentBalance) })),
    ];
  }

  getFixedAssetAttachments(assetId: string): FixedAssetAttachment[] {
    const actor = this.requireView();
    const asset = this.db.query<FixedAsset>('SELECT * FROM fixed_assets WHERE id = ?', [assetId])[0];
    if (!asset) throw new Error('الأصل غير موجود.');
    this.requireAssetAccess(asset, actor);
    return this.db.query<FixedAssetAttachment>(
      `SELECT a.*, u.full_name AS uploaded_by_name
       FROM fixed_asset_attachments a JOIN users u ON u.id = a.uploaded_by
       WHERE a.asset_id = ? ORDER BY a.created_at DESC, a.id DESC`,
      [assetId]
    );
  }

  addFixedAssetAttachment(input: {
    assetId: string; documentType: FixedAssetAttachment['documentType']; fileName: string;
    mimeType?: string | null; fileSize: number; checksum?: string | null; storageName: string;
  }): FixedAssetAttachment {
    const actor = this.requireManage();
    const asset = this.db.query<FixedAsset>('SELECT * FROM fixed_assets WHERE id = ?', [input.assetId])[0];
    if (!asset) throw new Error('الأصل غير موجود.');
    this.requireAssetAccess(asset, actor);
    const documentTypes = ['INVOICE', 'WARRANTY', 'PURCHASE_CONTRACT', 'OWNERSHIP', 'OTHER'];
    const fileName = String(input.fileName || '').trim();
    const storageName = String(input.storageName || '').trim();
    if (!documentTypes.includes(input.documentType)) throw new Error('نوع مستند الأصل غير صحيح.');
    // eslint-disable-next-line no-control-regex
    if (!fileName || fileName.length > 255 || /[\u0000-\u001f]/.test(fileName)) throw new Error('اسم الملف غير صالح.');
    if (!/^doc_[a-f0-9]{32}\.[a-z0-9]{1,10}$/i.test(storageName)) throw new Error('مرجع التخزين المحلي غير صالح.');
    if (!Number.isInteger(input.fileSize) || input.fileSize <= 0 || input.fileSize > 25 * 1024 * 1024) {
      throw new Error('حجم الملف يتجاوز الحد المسموح أو غير صالح.');
    }
    if (input.checksum && !/^[a-f0-9]{64}$/i.test(input.checksum)) throw new Error('بصمة الملف غير صالحة.');
    const id = `faatt_${uuidv4().substring(0, 12)}`;
    this.db.executeTransaction((db) => {
      db.run(
        `INSERT INTO fixed_asset_attachments
         (id, asset_id, document_type, file_name, mime_type, file_size, checksum, storage_name, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, input.assetId, input.documentType, fileName, input.mimeType?.trim() || null,
          input.fileSize, input.checksum?.trim() || null, storageName, actor.id]
      );
      db.run(
        'INSERT INTO audit_logs (id,user_id,user_name,action,module,record_id,new_values) VALUES (?,?,?,?,?,?,?)',
        [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, 'Attach fixed asset document', 'FINANCE',
          input.assetId, JSON.stringify({ attachmentId: id, documentType: input.documentType, fileName, fileSize: input.fileSize })]
      );
    });
    return this.getFixedAssetAttachments(input.assetId).find((row) => row.id === id)!;
  }

  disposeFixedAsset(input: {
    assetId: string; date: string; reason: string; proceeds: number; expenses?: number; buyer?: string;
    settlementType: 'CASH_REGISTER' | 'BANK_ACCOUNT'; settlementId: string;
  }): FixedAssetDisposal {
    const actor = this.requireManage();
    const asset = this.db.query<FixedAsset>('SELECT * FROM fixed_assets WHERE id = ?', [input.assetId])[0];
    if (!asset) throw new Error('الأصل غير موجود.');
    this.requireAssetAccess(asset, actor);
    if (asset.status === 'DISPOSED') throw new Error('الأصل مستبعد بالفعل.');
    if (!validDate(input.date) || input.date < asset.purchaseDate || input.date > localDateString()) throw new Error('تاريخ الاستبعاد غير صحيح.');
    this.assertPostingDate(input.date);
    if (!input.reason.trim()) throw new Error('سبب الاستبعاد مطلوب.');
    const proceeds = Number(input.proceeds);
    const expenses = Number(input.expenses || 0);
    if (!Number.isFinite(proceeds) || proceeds < 0 || !Number.isFinite(expenses) || expenses < 0) {
      throw new Error('المتحصلات والمصروفات يجب أن تكون أرقامًا غير سالبة.');
    }
    const already = this.db.query('SELECT id FROM fixed_asset_disposals WHERE asset_id = ?', [asset.id])[0];
    if (already) throw new Error('تم استبعاد هذا الأصل بالفعل.');
    const cost = round2(Number(asset.purchaseCost));
    const depreciable = Math.max(0, cost - Number(asset.salvageValue || 0));
    const depreciation = round2(Math.min(depreciable, Number(asset.accumulatedDepreciation || 0)));
    const bookValue = round2(Math.max(0, cost - depreciation));
    const gainLoss = round2(proceeds - bookValue);
    if (!['CASH_REGISTER', 'BANK_ACCOUNT'].includes(input.settlementType) || !input.settlementId) {
      throw new Error('حدد قناة تسوية نشطة للاستبعاد.');
    }
    const lines: Array<{ accountCode: string; debit: number; credit: number }> = [
      ...(depreciation > 0 ? [{ accountCode: '1602', debit: depreciation, credit: 0 }] : []),
      ...(proceeds > 0 ? [{ accountCode: '__SETTLEMENT__', debit: round2(proceeds), credit: 0 }] : []),
      ...(gainLoss < 0 ? [{ accountCode: '5208', debit: round2(-gainLoss), credit: 0 }] : []),
      ...(gainLoss > 0 ? [{ accountCode: '4205', debit: 0, credit: gainLoss }] : []),
      { accountCode: '1601', debit: 0, credit: cost },
      ...(expenses > 0 ? [{ accountCode: '5201', debit: round2(expenses), credit: 0 }, { accountCode: '__SETTLEMENT__', debit: 0, credit: round2(expenses) }] : []),
    ];
    const disposalId = `fadsp_${uuidv4().substring(0, 8)}`;
    let result: FixedAssetDisposal | undefined;
    this.db.executeTransaction((db) => {
      let settlementAccountCode = '1101';
      let currentBalance = 0;
      if (input.settlementType === 'CASH_REGISTER') {
        const register = db.query<{ currentBalance: number; branchId: string | null }>(
          'SELECT current_balance AS currentBalance, branch_id AS branchId FROM cash_registers WHERE id = ? AND is_active = 1',
          [input.settlementId]
        )[0];
        if (!register || !register.branchId || register.branchId !== asset.branchId) {
          throw new Error('الخزينة المحددة غير نشطة أو لا تتبع فرع الأصل.');
        }
        this.branchAccess.requireBranchAuthorization(register.branchId, actor);
        currentBalance = Number(register.currentBalance);
      } else {
        const bank = db.query<{ currentBalance: number; branchId: string | null; accountCode: string }>(
          `SELECT ba.current_balance AS currentBalance, ba.branch_id AS branchId, coa.code AS accountCode
           FROM bank_accounts ba JOIN chart_of_accounts coa ON coa.id = ba.gl_account_id
           WHERE ba.id = ? AND ba.is_active = 1 AND ba.currency = 'EGP'
             AND coa.is_active = 1 AND coa.type = 'ASSET'`,
          [input.settlementId]
        )[0];
        if (!bank || !bank.branchId || bank.branchId !== asset.branchId) {
          throw new Error('الحساب البنكي المحدد غير نشط أو لا يتبع فرع الأصل أو ليس حسابًا نقديًا صالحًا.');
        }
        this.branchAccess.requireBranchAuthorization(bank.branchId, actor);
        settlementAccountCode = bank.accountCode;
        currentBalance = Number(bank.currentBalance);
      }
      if (!Number.isFinite(currentBalance) || currentBalance + proceeds - expenses < -0.009) {
        throw new Error('رصيد قناة التسوية غير كافٍ لمصروفات الاستبعاد.');
      }
      const postingLines = lines.map((line) => ({
        ...line, accountCode: line.accountCode === '__SETTLEMENT__' ? settlementAccountCode : line.accountCode,
      }));
      const journalEntryId = postLedgerEntry(db.getDatabase(), {
        date: input.date, description: `استبعاد أصل ${asset.code}: ${input.reason.trim()}`,
        referenceType: 'ASSET_DISPOSAL', referenceId: disposalId, createdBy: actor.id,
        branchId: asset.branchId, lines: postingLines,
      });
      db.run(
        `INSERT INTO fixed_asset_disposals
         (id, asset_id, disposal_date, reason, sale_proceeds, expenses, buyer, accumulated_depreciation, book_value, gain_loss, journal_entry_id, approved_by, settlement_type, settlement_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [disposalId, asset.id, input.date, input.reason.trim(), round2(proceeds), round2(expenses),
          input.buyer?.trim() || null, depreciation, bookValue, gainLoss, journalEntryId, actor.id,
          input.settlementType, input.settlementId]
      );
      db.run("UPDATE fixed_assets SET status = 'DISPOSED', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [asset.id]);
      if (input.settlementType === 'CASH_REGISTER') {
        db.run('UPDATE cash_registers SET current_balance = ROUND(current_balance + ? - ?, 2) WHERE id = ?',
          [round2(proceeds), round2(expenses), input.settlementId]);
      } else {
        db.run('UPDATE bank_accounts SET current_balance = ROUND(current_balance + ? - ?, 2), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [round2(proceeds), round2(expenses), input.settlementId]);
      }
      db.run(
        'INSERT INTO audit_logs (id,user_id,user_name,action,module,record_id,new_values) VALUES (?,?,?,?,?,?,?)',
        [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, 'Approve fixed asset disposal', 'FINANCE', asset.id,
          JSON.stringify({ date: input.date, reason: input.reason, proceeds, expenses, bookValue, gainLoss, journalEntryId,
            settlementType: input.settlementType, settlementId: input.settlementId })]
      );
      result = {
        id: disposalId, assetId: asset.id, disposalDate: input.date, reason: input.reason.trim(),
        saleProceeds: round2(proceeds), expenses: round2(expenses), buyer: input.buyer?.trim() || null,
        accumulatedDepreciation: depreciation, bookValue, gainLoss, journalEntryId, approvedBy: actor.id,
        settlementType: input.settlementType, settlementId: input.settlementId,
      };
    });
    if (!result) throw new Error('تعذر اعتماد استبعاد الأصل.');
    return result;
  }

  getFixedAssetDepreciationPeriods(assetId: string): FixedAssetDepreciationPeriod[] {
    const actor = this.requireView();
    const asset = this.db.query<FixedAsset>('SELECT * FROM fixed_assets WHERE id = ?', [assetId])[0];
    if (!asset) throw new Error('الأصل غير موجود.');
    this.requireAssetAccess(asset, actor);
    return this.db.query<FixedAssetDepreciationPeriod>(
      'SELECT * FROM fixed_asset_depreciation_periods WHERE asset_id = ? ORDER BY period DESC',
      [assetId]
    );
  }

  getFixedAssetCountCampaigns(): FixedAssetCountCampaign[] {
    const actor = this.requireView();
    const allowed = this.branchAccess.getAccessibleBranchIds(actor);
    if (allowed === null) return this.db.query<FixedAssetCountCampaign>('SELECT * FROM fixed_asset_count_campaigns ORDER BY count_date DESC, created_at DESC');
    if (!allowed.length) return [];
    return this.db.query<FixedAssetCountCampaign>(
      `SELECT * FROM fixed_asset_count_campaigns WHERE branch_id IN (${allowed.map(() => '?').join(',')}) ORDER BY count_date DESC, created_at DESC`,
      allowed
    );
  }

  getFixedAssetBranches(): Array<{ id: string; name: string; code: string; isMain: boolean }> {
    const actor = this.requireView();
    return this.branchAccess.getSelectableBranches(actor);
  }

  getFixedAssetCurrentBranch(): string {
    const actor = this.requireView();
    return this.branchAccess.getCurrentBranchId(actor);
  }

  getFixedAssetDepartments(branchId: string): Array<{ id: string; name: string }> {
    const actor = this.requireView();
    const allowed = this.branchAccess.getAccessibleBranchIds(actor);
    if (allowed !== null && !allowed.includes(branchId)) throw new Error('ليس لديك صلاحية الوصول إلى هذا الفرع.');
    return this.db.query<{ id: string; name: string }>(
      'SELECT id, name FROM departments WHERE branch_id = ? OR branch_id IS NULL ORDER BY name',
      [branchId]
    );
  }

  getFixedAssetResponsibleUsers(branchId: string): Array<{ id: string; name: string }> {
    const actor = this.requireView();
    const allowed = this.branchAccess.getAccessibleBranchIds(actor);
    if (allowed !== null && !allowed.includes(branchId)) throw new Error('ليس لديك صلاحية الوصول إلى هذا الفرع.');
    return this.db.query<{ id: string; name: string }>(
      `SELECT DISTINCT u.id, u.full_name AS name FROM users u
       LEFT JOIN users_branches ub ON ub.user_id = u.id AND ub.branch_id = ?
       WHERE u.is_active = 1 AND (u.role = 'ADMIN' OR u.branch_scope = 'ALL' OR ub.user_id IS NOT NULL)
       ORDER BY u.full_name`,
      [branchId]
    );
  }

  getFixedAssetCountObservations(campaignId: string): FixedAssetCountObservation[] {
    const actor = this.requireView();
    const campaign = this.db.query<FixedAssetCountCampaign>('SELECT * FROM fixed_asset_count_campaigns WHERE id = ?', [campaignId])[0];
    if (!campaign) throw new Error('حملة الجرد غير موجودة.');
    const allowed = this.branchAccess.getAccessibleBranchIds(actor);
    if (allowed !== null && !allowed.includes(campaign.branchId)) throw new Error('ليس لديك صلاحية الوصول إلى حملة الجرد.');
    return this.db.query<FixedAssetCountObservation>(
      'SELECT * FROM fixed_asset_count_observations WHERE campaign_id = ? ORDER BY created_at, id',
      [campaignId]
    );
  }

  getFixedAssetCountSnapshots(campaignId: string): FixedAssetCountSnapshot[] {
    const actor = this.requireView();
    const campaign = this.db.query<FixedAssetCountCampaign>('SELECT * FROM fixed_asset_count_campaigns WHERE id = ?', [campaignId])[0];
    if (!campaign) throw new Error('حملة الجرد غير موجودة.');
    const allowed = this.branchAccess.getAccessibleBranchIds(actor);
    if (allowed !== null && !allowed.includes(campaign.branchId)) throw new Error('ليس لديك صلاحية الوصول إلى حملة الجرد.');
    return this.db.query<FixedAssetCountSnapshot>(
      `SELECT s.asset_id AS assetId, s.asset_code AS assetCode, s.asset_name AS assetName,
              s.registered_status AS registeredStatus,
              s.registered_location AS registeredLocation,
              EXISTS (SELECT 1 FROM fixed_asset_count_observations o
                WHERE o.campaign_id = s.campaign_id AND o.asset_id = s.asset_id AND o.count_status = 'FOUND') AS observed
       FROM fixed_asset_count_snapshots s WHERE s.campaign_id = ? ORDER BY s.asset_code`,
      [campaignId]
    );
  }

  getFixedAssetCountAudit(campaignId: string): FixedAssetCountAudit[] {
    const actor = this.requireView();
    const campaign = this.db.query<FixedAssetCountCampaign>('SELECT * FROM fixed_asset_count_campaigns WHERE id = ?', [campaignId])[0];
    if (!campaign) throw new Error('حملة الجرد غير موجودة.');
    const allowed = this.branchAccess.getAccessibleBranchIds(actor);
    if (allowed !== null && !allowed.includes(campaign.branchId)) throw new Error('ليس لديك صلاحية الوصول إلى حملة الجرد.');
    return this.db.query<FixedAssetCountAudit>(
      `SELECT a.action, a.details, a.actor_id AS actorId, u.full_name AS actorName, a.created_at AS createdAt
       FROM fixed_asset_count_audit a JOIN users u ON u.id = a.actor_id
       WHERE a.campaign_id = ? ORDER BY a.created_at, a.id`,
      [campaignId]
    );
  }

  createFixedAssetCountCampaign(input: { branchId: string; location?: string; date: string }): string {
    const actor = this.requireManage();
    const allowed = this.branchAccess.getAccessibleBranchIds(actor);
    if (!this.db.query('SELECT id FROM branches WHERE id = ? AND is_active = 1', [input.branchId]).length ||
        (allowed !== null && !allowed.includes(input.branchId))) throw new Error('الفرع غير متاح أو خارج نطاق صلاحيتك.');
    if (!validDate(input.date)) throw new Error('تاريخ الجرد غير صحيح.');
    const campaignId = `fac_${uuidv4().substring(0, 8)}`;
    const location = input.location?.trim() || null;
    this.db.executeTransaction((db) => {
      db.run(
        'INSERT INTO fixed_asset_count_campaigns (id, branch_id, location, count_date, created_by) VALUES (?, ?, ?, ?, ?)',
        [campaignId, input.branchId, location, input.date, actor.id]
      );
      db.run(
        `INSERT INTO fixed_asset_count_snapshots
         (campaign_id, asset_id, asset_code, asset_name, registered_status, registered_location)
         SELECT ?, id, code, name, status, location FROM fixed_assets
         WHERE branch_id = ? AND status != 'DISPOSED' AND (? IS NULL OR location = ?)`,
        [campaignId, input.branchId, location, location]
      );
      db.run(
        'INSERT INTO fixed_asset_count_audit (id,campaign_id,action,details,actor_id) VALUES (?,?,?,?,?)',
        [`faca_${uuidv4().substring(0, 8)}`, campaignId, 'CREATED', JSON.stringify({ branchId: input.branchId, location, date: input.date }), actor.id]
      );
    });
    return campaignId;
  }

  recordFixedAssetCountObservation(input: {
    campaignId: string; code: string; condition?: string; notes?: string;
  }): FixedAssetCountObservation {
    const actor = this.requireManage();
    const campaign = this.db.query<FixedAssetCountCampaign>('SELECT * FROM fixed_asset_count_campaigns WHERE id = ?', [input.campaignId])[0];
    if (!campaign) throw new Error('حملة الجرد غير موجودة.');
    const allowed = this.branchAccess.getAccessibleBranchIds(actor);
    if (allowed !== null && !allowed.includes(campaign.branchId)) throw new Error('ليس لديك صلاحية الوصول إلى حملة الجرد.');
    if (campaign.status !== 'OPEN') throw new Error('حملة الجرد مغلقة.');
    const code = input.code.trim();
    if (!code) throw new Error('كود الأصل مطلوب.');
    const found = this.db.query<FixedAsset>('SELECT * FROM fixed_assets WHERE code = ?', [code])[0];
    const snapshot = found && found.branchId === campaign.branchId && (campaign.location === null || found.location === campaign.location)
      ? this.db.query('SELECT asset_id FROM fixed_asset_count_snapshots WHERE campaign_id = ? AND asset_id = ?', [campaign.id, found.id])[0]
      : null;
    if (snapshot && this.db.query(
      "SELECT id FROM fixed_asset_count_observations WHERE campaign_id = ? AND asset_id = ? AND count_status = 'FOUND'",
      [campaign.id, found?.id]
    ).length) throw new Error('تم تسجيل هذا الأصل في الحملة بالفعل.');
    const countStatus = snapshot ? 'FOUND' : 'UNREGISTERED';
    const observationId = `faco_${uuidv4().substring(0, 8)}`;
    this.db.executeTransaction((db) => {
      db.run(
        `INSERT INTO fixed_asset_count_observations
         (id, campaign_id, asset_id, scanned_code, count_status, condition, notes, actor_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [observationId, campaign.id, snapshot ? found?.id || null : null, code, countStatus,
          input.condition?.trim() || null, input.notes?.trim() || null, actor.id]
      );
      db.run(
        'INSERT INTO fixed_asset_count_audit (id,campaign_id,action,details,actor_id) VALUES (?,?,?,?,?)',
        [`faca_${uuidv4().substring(0, 8)}`, campaign.id, countStatus, JSON.stringify({ code, condition: input.condition, notes: input.notes }), actor.id]
      );
    });
    return this.db.query<FixedAssetCountObservation>('SELECT * FROM fixed_asset_count_observations WHERE id = ?', [observationId])[0];
  }

  finalizeFixedAssetCountCampaign(campaignId: string): void {
    const actor = this.requireManage();
    const campaign = this.db.query<FixedAssetCountCampaign>('SELECT * FROM fixed_asset_count_campaigns WHERE id = ?', [campaignId])[0];
    if (!campaign) throw new Error('حملة الجرد غير موجودة.');
    const allowed = this.branchAccess.getAccessibleBranchIds(actor);
    if (allowed !== null && !allowed.includes(campaign.branchId)) throw new Error('ليس لديك صلاحية الوصول إلى حملة الجرد.');
    if (campaign.status !== 'OPEN') throw new Error('تم اعتماد هذه الحملة بالفعل.');
    this.db.executeTransaction((db) => {
      db.run(
        `INSERT INTO fixed_asset_count_observations
         (id, campaign_id, asset_id, scanned_code, count_status, actor_id)
         SELECT 'faco_' || lower(hex(randomblob(8))), s.campaign_id, s.asset_id, s.asset_code, 'MISSING', ?
         FROM fixed_asset_count_snapshots s
         WHERE s.campaign_id = ? AND NOT EXISTS (
           SELECT 1 FROM fixed_asset_count_observations o
           WHERE o.campaign_id = s.campaign_id AND o.asset_id = s.asset_id AND o.count_status = 'FOUND'
         )`,
        [actor.id, campaignId]
      );
      db.run(
        "UPDATE fixed_asset_count_campaigns SET status = 'FINALIZED', finalized_by = ?, finalized_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'OPEN'",
        [actor.id, campaignId]
      );
      db.run(
        'INSERT INTO fixed_asset_count_audit (id,campaign_id,action,details,actor_id) VALUES (?,?,?,?,?)',
        [`faca_${uuidv4().substring(0, 8)}`, campaignId, 'FINALIZED', null, actor.id]
      );
    });
  }

  deleteFixedAsset(id: string): void {
    const actor = this.requireManage();
    const asset = this.db.query<FixedAsset>('SELECT * FROM fixed_assets WHERE id=?', [id])[0];
    if (!asset) return;
    this.requireAssetAccess(asset, actor);
    const historyCount = this.db.query<{ count: number }>(
      `SELECT
        (SELECT COUNT(*) FROM fixed_asset_transfers WHERE asset_id = ?) +
        (SELECT COUNT(*) FROM fixed_asset_maintenance WHERE asset_id = ?) +
        (SELECT COUNT(*) FROM fixed_asset_disposals WHERE asset_id = ?) +
        (SELECT COUNT(*) FROM fixed_asset_depreciation_periods WHERE asset_id = ?) +
        (SELECT COUNT(*) FROM fixed_asset_depreciation_requests WHERE asset_id = ?) +
        (SELECT COUNT(*) FROM fixed_asset_attachments WHERE asset_id = ?) +
        (SELECT COUNT(*) FROM fixed_asset_count_snapshots WHERE asset_id = ?) AS count`,
      [id, id, id, id, id, id, id]
    )[0]?.count || 0;
    if (historyCount) throw new Error('لا يمكن حذف أصل له سجل نقل أو صيانة أو إهلاك أو جرد أو استبعاد.');
    if (this.db.query('SELECT id FROM journal_entries WHERE reference_id = ? OR reference_id LIKE ?', [id, `${id}:%`]).length) {
      throw new Error('لا يمكن حذف أصل مرتبط بحركة محاسبية.');
    }
    const acquisition = this.db.query<any>(`SELECT id FROM journal_entries WHERE reference_type='ASSET_ACQUISITION' AND reference_id=?`, [id])[0];
    this.db.executeTransaction((db) => {
      if (acquisition) {
        const cashLine = db.query<any>(`SELECT 1 AS found FROM journal_entry_lines l JOIN chart_of_accounts a ON a.id=l.account_id WHERE l.entry_id=? AND a.code='1101' AND l.credit>0`, [acquisition.id])[0];
        reverseLedgerEntry(db.getDatabase(), acquisition.id, {
          date: localDateString(), description: `Reverse fixed asset acquisition ${asset.code}`,
          referenceType: 'ASSET_ACQUISITION_VOID', referenceId: `${id}:${uuidv4()}`, createdBy: actor.id,
        });
        if (cashLine) db.run('UPDATE cash_registers SET current_balance=current_balance+? WHERE id=?', [asset.purchaseCost, 'cr_main']);
      }
      db.run('DELETE FROM fixed_assets WHERE id=?', [id]);
    });
  }
}
