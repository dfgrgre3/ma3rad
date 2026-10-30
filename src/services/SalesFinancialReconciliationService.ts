import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../database/db';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { BranchAccessService } from './BranchAccessService';
import { round2 } from './financials';

export interface SalesFinancialCheck {
  key: string;
  label: string;
  ledger: number;
  source: number;
  difference: number;
  status: 'MATCH' | 'DIFFERENCE';
  detail: string;
  reason?: string;
}

export interface SalesFinancialClosure {
  id: string;
  dateFrom: string;
  dateTo: string;
  checks: SalesFinancialCheck[];
  notes: string;
  closedBy: string;
  closedAt: string;
}

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export class SalesFinancialReconciliationService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();

  public canUseCentralClosure(): boolean {
    return this.branchAccess.getAccessibleBranchIds() === null;
  }

  public getBranchScopeWarning(): string | null {
    return 'تعرض هذه المصالحة بيانات الفرع النشط فقط؛ القيود غير المرتبطة بفرع لا تدخل في المقارنة.';
  }

  private validatePeriod(dateFrom: string, dateTo: string): void {
    if (!isValidDate(dateFrom) || !isValidDate(dateTo) || dateFrom > dateTo) {
      throw new Error('فترة المصالحة غير صحيحة.');
    }
  }

  private addCheck(
    key: string,
    label: string,
    ledger: number,
    source: number,
    detail: string,
  ): SalesFinancialCheck {
    const roundedLedger = round2(ledger);
    const roundedSource = round2(source);
    const difference = round2(roundedLedger - roundedSource);
    return {
      key,
      label,
      ledger: roundedLedger,
      source: roundedSource,
      difference,
      status: Math.abs(difference) < 0.01 ? 'MATCH' : 'DIFFERENCE',
      detail,
    };
  }

  public getReconciliation(dateFrom: string, dateTo: string): SalesFinancialCheck[] {
    this.validatePeriod(dateFrom, dateTo);
    PermissionService.require(AuthService.requireAuth(), 'finance.view');
    // Documents are owned by a branch *and* a legal entity, so a reconciliation
    // must never mix two companies that happen to share branch access.
    const mergedScope = (branchExpression: string, companyExpression: string) => {
      const branch = this.branchAccess.sqlScope(branchExpression);
      const company = this.branchAccess.companyScope(companyExpression);
      return {
        clause: `(${branch.clause}) AND (${company.clause})`,
        params: [...branch.params, ...company.params],
      };
    };
    const invoiceScope = mergedScope('si.branch_id', 'si.company_id');
    const returnScope = mergedScope('original.branch_id', 'original.company_id');
    const ledgerScope = mergedScope('e.branch_id', 'e.company_id');
    const warehouseScope = this.branchAccess.sqlScope(
      'w.branch_id',
      '(SELECT bw.branch_id FROM branch_warehouses bw WHERE bw.warehouse_id = w.id ORDER BY bw.is_primary DESC, bw.branch_id LIMIT 1)'
    );
    const warehouseCompanyScope = this.branchAccess.companyScope('w.company_id');

    const netSales = Number(this.db.query<{ amount: number }>(`
      SELECT COALESCE(SUM(si.subtotal - si.discount_amount + si.shipping_cost), 0)
        - COALESCE((
          SELECT SUM(sr.total_amount - CASE WHEN original.total_amount > 0
            THEN ROUND(sr.total_amount * COALESCE(original.tax_amount, 0) / original.total_amount, 2)
            ELSE 0 END)
          FROM sales_returns sr
          JOIN sales_invoices original ON original.id = sr.original_invoice_id
          WHERE sr.date >= ? AND sr.date <= ? AND original.invoice_status != 'VOID'
            AND ${returnScope.clause}
        ), 0) AS amount
      FROM sales_invoices si
      WHERE si.date >= ? AND si.date <= ? AND si.invoice_status != 'VOID' AND ${invoiceScope.clause}
    `, [
      dateFrom, dateTo, ...returnScope.params,
      dateFrom, dateTo, ...invoiceScope.params,
    ])[0]?.amount || 0);
    const ledgerSales = Number(this.db.query<{ amount: number }>(`
      SELECT COALESCE(SUM(l.credit - l.debit), 0) AS amount
      FROM journal_entry_lines l
      JOIN journal_entries e ON e.id = l.entry_id
      JOIN chart_of_accounts a ON a.id = l.account_id
      WHERE e.is_posted = 1 AND e.date >= ? AND e.date <= ?
        AND ${ledgerScope.clause}
        AND a.code IN ('4101', '4102')
        AND (
          (e.reference_type = 'SALES_INVOICE' AND EXISTS (
            SELECT 1 FROM sales_invoices si
            WHERE si.id = e.reference_id AND si.invoice_status != 'VOID'
          ))
          OR (e.reference_type = 'SALES_RETURN' AND EXISTS (
            SELECT 1 FROM sales_returns sr
            JOIN sales_invoices si ON si.id = sr.original_invoice_id
            WHERE sr.id = e.reference_id AND si.invoice_status != 'VOID'
          ))
        )
    `, [dateFrom, dateTo, ...ledgerScope.params])[0]?.amount || 0);

    const costOfSales = Number(this.db.query<{ amount: number }>(`
      SELECT COALESCE(SUM(si.total_cost), 0)
        - COALESCE((
          SELECT SUM(sri.quantity_m2 * sri.unit_cost)
          FROM sales_return_items sri
          JOIN sales_returns sr ON sr.id = sri.return_id
          JOIN sales_invoices original ON original.id = sr.original_invoice_id
          WHERE sr.date >= ? AND sr.date <= ? AND original.invoice_status != 'VOID'
            AND ${returnScope.clause}
        ), 0) AS amount
      FROM sales_invoices si
      WHERE si.date >= ? AND si.date <= ? AND si.invoice_status != 'VOID' AND ${invoiceScope.clause}
    `, [
      dateFrom, dateTo, ...returnScope.params,
      dateFrom, dateTo, ...invoiceScope.params,
    ])[0]?.amount || 0);
    const ledgerCostOfSales = Number(this.db.query<{ amount: number }>(`
      SELECT COALESCE(SUM(l.debit - l.credit), 0) AS amount
      FROM journal_entry_lines l
      JOIN journal_entries e ON e.id = l.entry_id
      JOIN chart_of_accounts a ON a.id = l.account_id
      WHERE e.is_posted = 1 AND e.date >= ? AND e.date <= ? AND ${ledgerScope.clause} AND a.code = '5101'
        AND (
          (e.reference_type = 'SALES_INVOICE' AND EXISTS (
            SELECT 1 FROM sales_invoices si
            WHERE si.id = e.reference_id AND si.invoice_status != 'VOID'
          ))
          OR (e.reference_type = 'SALES_RETURN' AND EXISTS (
            SELECT 1 FROM sales_returns sr
            JOIN sales_invoices si ON si.id = sr.original_invoice_id
            WHERE sr.id = e.reference_id AND si.invoice_status != 'VOID'
          ))
        )
    `, [dateFrom, dateTo, ...ledgerScope.params])[0]?.amount || 0);

    const accountBalance = (code: string) => Number(this.db.query<{ balance: number }>(`
      SELECT COALESCE(SUM(l.debit - l.credit), 0) AS balance
      FROM journal_entry_lines l
      JOIN journal_entries e ON e.id = l.entry_id
      JOIN chart_of_accounts a ON a.id = l.account_id
      WHERE e.is_posted = 1 AND a.code = ? AND ${ledgerScope.clause}
    `, [code, ...ledgerScope.params])[0]?.balance || 0);
    const customerBalance = Number(this.db.query<{ balance: number }>(`
      SELECT COALESCE(SUM(si.remaining_amount), 0) AS balance
      FROM sales_invoices si
      WHERE si.invoice_status != 'VOID' AND ${invoiceScope.clause}
    `, invoiceScope.params)[0]?.balance || 0);
    const inventoryValue = Number(this.db.query<{ value: number }>(`
      SELECT COALESCE(SUM(icl.quantity_remaining * icl.unit_cost), 0) AS value
      FROM inventory_cost_layers icl
      JOIN warehouses w ON w.id = icl.warehouse_id
      WHERE icl.quantity_remaining > 0.009 AND ${warehouseScope.clause} AND (${warehouseCompanyScope.clause})
    `, [...warehouseScope.params, ...warehouseCompanyScope.params])[0]?.value || 0);
    const costingMethod = this.db.query<{ value: string }>(
      "SELECT value FROM system_settings WHERE key = 'costingMethod'"
    )[0]?.value || 'AVERAGE_COST';
    const currentInventoryValue = costingMethod === 'FIFO'
      ? inventoryValue
      : Number(this.db.query<{ value: number }>(`
          SELECT COALESCE(SUM(ws.quantity_m2 * p.cost_price), 0) AS value
          FROM warehouse_stock ws
          JOIN warehouses w ON w.id = ws.warehouse_id
          JOIN products p ON p.id = ws.product_id
          WHERE ${warehouseScope.clause} AND (${warehouseCompanyScope.clause})
        `, [...warehouseScope.params, ...warehouseCompanyScope.params])[0]?.value || 0);
    const registerScope = this.branchAccess.sqlScope('branch_id');
    const cashRegisters = Number(this.db.query<{ balance: number }>(
      `SELECT COALESCE(SUM(current_balance), 0) AS balance FROM cash_registers WHERE ${registerScope.clause}`,
      registerScope.params
    )[0]?.balance || 0);

    const checks = [
      this.addCheck('sales', 'صافي المبيعات والمرتجعات مقابل دفتر الإيرادات', ledgerSales, netSales,
        `حركات الفترة ${dateFrom} إلى ${dateTo}، دون ضريبة القيمة المضافة.`),
      this.addCheck('cost', 'تكلفة المبيعات والمرتجعات مقابل دفتر التكلفة', ledgerCostOfSales, costOfSales,
        'صافي تكلفة البضاعة المباعة بعد عكس تكلفة الأصناف المرتجعة في الفترة.'),
      this.addCheck('receivables', 'ذمم العملاء مقابل الأستاذ العام', accountBalance('1103'), customerBalance,
        'مقارنة رصيد حساب العملاء 1103 بإجمالي الأرصدة الحالية في سجلات العملاء.'),
      this.addCheck('inventory', 'قيمة المخزون مقابل الأستاذ العام', accountBalance('1104'), currentInventoryValue,
        costingMethod === 'FIFO'
          ? 'قيمة طبقات التكلفة المتبقية بطريقة FIFO.'
          : 'القيمة التقديرية للمخزون وفق الكمية × تكلفة الصنف الحالية.'),
      this.addCheck('cash', 'أرصدة الخزائن مقابل الأستاذ العام', accountBalance('1101'), cashRegisters,
        'مقارنة حساب الصندوق 1101 بإجمالي أرصدة الخزائن المسجلة.'),
    ];
    const bankScope = this.branchAccess.sqlScope('ba.branch_id');
    const bankAccounts = this.db.query<{ count: number; balance: number }>(`
      SELECT COUNT(*) AS count, COALESCE(SUM(ba.current_balance), 0) AS balance
      FROM bank_accounts ba WHERE ${bankScope.clause}
    `, bankScope.params)[0];
    checks.push(this.addCheck('banks', 'أرصدة البنوك مقابل الأستاذ العام', accountBalance('1102'), Number(bankAccounts?.balance || 0),
      'مقارنة حساب البنوك 1102 بإجمالي أرصدة الحسابات البنكية المرتبطة بالفرع النشط.'));
    return checks;
  }

  public getLatestClosure(dateFrom: string, dateTo: string): SalesFinancialClosure | null {
    this.validatePeriod(dateFrom, dateTo);
    PermissionService.require(AuthService.requireAuth(), 'finance.view');
    if (!this.canUseCentralClosure()) return null;
    const branchId = this.branchAccess.getCurrentBranchId();
    const row = this.db.query<{
      id: string;
      dateFrom: string;
      dateTo: string;
      checksJson: string;
      notes: string;
      closedBy: string;
      closedAt: string;
    }>(`
      SELECT r.id, r.date_from AS dateFrom, r.date_to AS dateTo, r.checks_json AS checksJson,
        r.notes, u.full_name AS closedBy, r.closed_at AS closedAt
      FROM sales_financial_reconciliations r
      LEFT JOIN users u ON u.id = r.closed_by
      WHERE r.branch_id = ? AND r.date_from = ? AND r.date_to = ?
      ORDER BY r.closed_at DESC
      LIMIT 1
    `, [branchId, dateFrom, dateTo])[0];
    if (!row) return null;
    return {
      id: row.id,
      dateFrom: row.dateFrom,
      dateTo: row.dateTo,
      checks: JSON.parse(row.checksJson) as SalesFinancialCheck[],
      notes: row.notes,
      closedBy: row.closedBy || 'مستخدم غير معروف',
      closedAt: row.closedAt,
    };
  }

  public closeReconciliation(
    dateFrom: string,
    dateTo: string,
    reasons: Record<string, string>,
  ): SalesFinancialClosure {
    this.validatePeriod(dateFrom, dateTo);
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'finance.close');
    if (this.branchAccess.getAccessibleBranchIds(actor) !== null) {
      throw new Error('إقفال المصالحة متاح للصلاحيات المركزية فقط لأن سجل الإقفال مشترك بين الفروع.');
    }
    const checks = this.getReconciliation(dateFrom, dateTo).map((check) => ({
      ...check,
      reason: check.status === 'DIFFERENCE' ? (reasons[check.key] || '').trim() : undefined,
    }));
    const missingReason = checks.find((check) => check.status === 'DIFFERENCE' && !check.reason);
    if (missingReason) {
      throw new Error(`يرجى توضيح سبب الفرق في بند «${missingReason.label}» قبل الإقفال.`);
    }
    const notes = checks
      .filter((check) => check.reason)
      .map((check) => `${check.label}: ${check.reason}`)
      .join('\n') || 'تمت مراجعة الفروقات ولم تُسجل فروقات قائمة.';
    const id = `sfr_${uuidv4().slice(0, 12)}`;
    const closedAt = new Date().toISOString();
    const branchId = this.branchAccess.getCurrentBranchId(actor);

    this.db.executeTransaction((db) => {
      db.run(`
        INSERT INTO sales_financial_reconciliations
          (id, branch_id, date_from, date_to, checks_json, notes, closed_by, closed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [id, branchId, dateFrom, dateTo, JSON.stringify(checks), notes, actor.id, closedAt]);
      db.run(`
        INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
        VALUES (?, ?, ?, ?, 'FINANCE', ?, ?)
      `, [
        `aud_${uuidv4().slice(0, 10)}`,
        actor.id,
        actor.fullName,
        'إقفال مراجعة مصالحة المبيعات',
        id,
        JSON.stringify({ dateFrom, dateTo, checks }),
      ]);
    });

    return { id, dateFrom, dateTo, checks, notes, closedBy: actor.fullName, closedAt };
  }
}
