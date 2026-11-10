import { v4 as uuidv4 } from 'uuid';
import type { SqlValue } from 'sql.js';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { queryLedgerRows, postLedgerEntry } from '../../../database/repositories/ledger';
import { AuthService } from '../auth/AuthService';
import { AuditService } from '../security/AuditService';
import { PermissionService } from '../auth/PermissionService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { localDateString } from '../../../utils/shared/date';

export interface HistoricalReturnCandidate {
  id: string;
  returnNumber: string;
  returnDate: string;
  customerName: string;
  invoiceNumber: string;
  originalInvoiceId: string;
  branchId: string | null;
  netAmount: number;
  calculatedTax: number;
  grossAmount: number;
  storedCashAmount: number;
  storedBalanceAmount: number;
  invoiceReturnedAmount: number;
  customerBalance: number;
  customerTotalPurchases: number;
  invoiceRemainingAmount: number;
  registerId: string | null;
  shiftId: string | null;
  cashRegisterBalance: number | null;
  shiftTotalRefunds: number | null;
  ledgerEntryIds: string;
  ledgerEntryNumbers: string;
  ledgerLinesSummary: string;
  ledgerEntryCount: number;
  ledgerCashAmount: number;
  ledgerRevenueAmount: number;
  ledgerTaxAmount: number;
  ledgerBalanceAmount: number;
}

export interface HistoricalReturnApproval {
  returnId: string;
  reviewId: string;
  confirmedCashAmount: number;
  confirmedBalanceAmount: number;
  taxAlreadyIncludedInCustomerPurchases: boolean;
  notes: string;
}

type CandidateRow = {
  id: string;
  customer_id: string;
  return_number: string;
  date: string;
  customer_name: string;
  invoice_number: string;
  original_invoice_id: string;
  branch_id: string | null;
  net_amount: number;
  invoice_taxable_base: number;
  invoice_tax_amount: number;
  stored_cash_amount: number;
  stored_balance_amount: number;
  invoice_returned_amount: number;
  customer_balance: number;
  customer_total_purchases: number;
  invoice_remaining_amount: number;
  register_id: string | null;
  shift_id: string | null;
  cash_register_balance: number | null;
  shift_total_refunds: number | null;
  ledger_entry_ids: string | null;
  ledger_entry_numbers: string | null;
  ledger_lines_summary: string | null;
  ledger_entry_count: number;
  ledger_cash_amount: number;
  ledger_revenue_amount: number;
  ledger_tax_amount: number;
  ledger_balance_amount: number;
};

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function calculateTax(row: CandidateRow): number {
  const taxableBase = Math.max(0, Number(row.invoice_taxable_base || 0));
  return taxableBase > 0
    ? round2(Number(row.net_amount || 0) * Number(row.invoice_tax_amount || 0) / taxableBase)
    : 0;
}

export class HistoricalReturnReconciliationService {
  private readonly db = DatabaseManager.getInstance();
  private readonly branchAccess = new BranchAccessService();

  public listPending(): HistoricalReturnCandidate[] {
    PermissionService.require(AuthService.requireAuth(), 'returns.approve');
    return this.pendingRows().map((row) => {
      const calculatedTax = calculateTax(row);
      return {
        id: row.id,
        returnNumber: row.return_number,
        returnDate: row.date,
        customerName: row.customer_name,
        invoiceNumber: row.invoice_number,
        originalInvoiceId: row.original_invoice_id,
        branchId: row.branch_id,
        netAmount: Number(row.net_amount || 0),
        calculatedTax,
        grossAmount: round2(Number(row.net_amount || 0) + calculatedTax),
        storedCashAmount: Number(row.stored_cash_amount || 0),
        storedBalanceAmount: Number(row.stored_balance_amount || 0),
        invoiceReturnedAmount: Number(row.invoice_returned_amount || 0),
        customerBalance: Number(row.customer_balance || 0),
        customerTotalPurchases: Number(row.customer_total_purchases || 0),
        invoiceRemainingAmount: Number(row.invoice_remaining_amount || 0),
        registerId: row.register_id,
        shiftId: row.shift_id,
        cashRegisterBalance: row.cash_register_balance == null ? null : Number(row.cash_register_balance),
        shiftTotalRefunds: row.shift_total_refunds == null ? null : Number(row.shift_total_refunds),
        ledgerEntryIds: row.ledger_entry_ids || '',
        ledgerEntryNumbers: row.ledger_entry_numbers || '',
        ledgerLinesSummary: row.ledger_lines_summary || '',
        ledgerEntryCount: Number(row.ledger_entry_count || 0),
        ledgerCashAmount: round2(Number(row.ledger_cash_amount || 0)),
        ledgerRevenueAmount: round2(Number(row.ledger_revenue_amount || 0)),
        ledgerTaxAmount: round2(Number(row.ledger_tax_amount || 0)),
        ledgerBalanceAmount: round2(Number(row.ledger_balance_amount || 0)),
      };
    });
  }

  public recordReportReview(): string {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'returns.approve');
    const candidates = this.pendingRows().map((row) => this.toCandidate(row));
    const reviewId = `srrv_${uuidv4().slice(0, 10)}`;
    const reviewedAt = new Date().toISOString();
    const snapshotJson = JSON.stringify({ candidates });
    this.db.executeTransaction((tx) => {
      tx.run(
        `INSERT INTO sales_return_reconciliation_reviews
           (id, reviewed_by, reviewed_at, candidate_count, snapshot_json)
         VALUES (?, ?, ?, ?, ?)`,
        [reviewId, actor.id, reviewedAt, candidates.length, snapshotJson]
      );
    });
    new AuditService().log({
      userId: actor.id,
      userName: actor.fullName,
      action: 'حفظ تقرير مراجعة المرتجعات التاريخية',
      module: 'FINANCE',
      recordId: reviewId,
      newValues: JSON.stringify({ candidateCount: candidates.length, reviewedAt }),
    });
    return reviewId;
  }

  public approve(input: HistoricalReturnApproval): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'returns.approve');
    const confirmedCashAmount = round2(Number(input.confirmedCashAmount));
    const confirmedBalanceAmount = round2(Number(input.confirmedBalanceAmount));
    const notes = typeof input.notes === 'string' ? input.notes.trim() : '';
    if (!input.returnId || !input.reviewId || !Number.isFinite(confirmedCashAmount) || confirmedCashAmount < 0 ||
        !Number.isFinite(confirmedBalanceAmount) || confirmedBalanceAmount < 0 ||
        typeof input.taxAlreadyIncludedInCustomerPurchases !== 'boolean' || notes.length < 5) {
      throw new Error('أدخل مبالغ مؤكدة صحيحة، وحدد معالجة الضريبة السابقة، واكتب ملاحظة تدقيق لا تقل عن 5 أحرف.');
    }

    const candidateRow = this.pendingRows(input.returnId)[0];
    if (!candidateRow) throw new Error('هذا المرتجع غير متاح للتسوية أو سبق اعتماده.');
    const candidate = this.toCandidate(candidateRow);
    this.assertReportReview(input.reviewId, actor.id, candidate);
    if (Math.abs(confirmedCashAmount + confirmedBalanceAmount - candidate.grossAmount) > 0.01) {
      throw new Error(`يجب أن يساوي مجموع النقد المؤكد والرصيد المؤكد الإجمالي شامل الضريبة (${candidate.grossAmount.toFixed(2)}).`);
    }
    if (Math.abs(confirmedCashAmount - candidate.ledgerCashAmount) > 0.01) {
      throw new Error('المبلغ النقدي المؤكد لا يطابق القيد النقدي الموجود. لا يمكن تعديل النقد التاريخي آليًا؛ راجع الخزينة والوردية والقيد يدويًا.');
    }
    if (candidate.ledgerEntryCount === 0 && confirmedCashAmount > 0.01) {
      throw new Error('لا يوجد قيد تاريخي يثبت المبلغ النقدي؛ لا يمكن إنشاء حركة نقدية بديلة ضمن هذه التسوية.');
    }

    const reconciliationId = `srr_${uuidv4().slice(0, 10)}`;
    const correctionDate = localDateString();
    const ledgerSummary = JSON.stringify({
      entryIds: candidate.ledgerEntryIds,
      entryCount: candidate.ledgerEntryCount,
      cash: candidate.ledgerCashAmount,
      revenue: candidate.ledgerRevenueAmount,
      tax: candidate.ledgerTaxAmount,
      customerBalance: candidate.ledgerBalanceAmount,
      registerId: candidate.registerId,
      shiftId: candidate.shiftId,
      cashRegisterBalance: candidate.cashRegisterBalance,
      shiftTotalRefunds: candidate.shiftTotalRefunds,
      entryNumbers: candidate.ledgerEntryNumbers,
      lines: candidate.ledgerLinesSummary,
    });
    const balanceDelta = round2(confirmedBalanceAmount - candidate.storedBalanceAmount);
    const recordedCredits = round2(candidate.storedCashAmount + candidate.storedBalanceAmount);
    const invoiceReturnDelta = round2(candidate.grossAmount - recordedCredits);
    const taxReduction = candidate.calculatedTax;
    const customerPurchaseTaxReduction = input.taxAlreadyIncludedInCustomerPurchases ? 0 : taxReduction;

    const correctionEntryId = this.db.executeTransaction((tx) => {
      const fresh = this.pendingRows(input.returnId, tx.getDatabase())[0];
      if (!fresh) throw new Error('تغيرت حالة المرتجع أثناء المراجعة. أعد تحميل قائمة التسويات.');
      const freshCandidate = this.toCandidate(fresh);
      this.assertReportReview(input.reviewId, actor.id, freshCandidate, tx.getDatabase());
      if (Math.abs(confirmedCashAmount - freshCandidate.ledgerCashAmount) > 0.01) {
        throw new Error('تغير القيد النقدي أثناء المراجعة؛ لم تُطبق أي تسوية.');
      }

      const lines = this.buildCorrectionLines(tx, freshCandidate, confirmedBalanceAmount, taxReduction);
      const entryId = lines.length
        ? postLedgerEntry(tx.getDatabase(), {
            date: correctionDate,
            description: `Approved historical sales return reconciliation ${freshCandidate.returnNumber}`,
            referenceType: 'SALES_RETURN_RECONCILIATION',
            referenceId: reconciliationId,
            createdBy: actor.id,
            branchId: freshCandidate.branchId,
            lines,
          })
        : null;

      tx.run(
        `UPDATE sales_returns
         SET return_tax_amount = ?, refunded_amount = ?, remaining_to_balance = ?
         WHERE id = ? AND return_tax_amount IS NULL`,
        [taxReduction, confirmedCashAmount, confirmedBalanceAmount, input.returnId]
      );
      tx.run(
        `UPDATE customers
         SET current_balance = COALESCE(current_balance, 0) - ?,
             total_purchases = COALESCE(total_purchases, 0) - ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [balanceDelta, customerPurchaseTaxReduction, fresh.customer_id]
      );
      tx.run(
        `UPDATE sales_invoices
         SET returned_amount = COALESCE(returned_amount, 0) + ?,
             remaining_amount = MAX(0, COALESCE(remaining_amount, 0) - ?),
             payment_status = CASE
               WHEN MAX(0, COALESCE(remaining_amount, 0) - ?) <= 0.009 THEN 'PAID'
               WHEN COALESCE(paid_amount, 0) > 0 THEN 'PARTIAL'
               ELSE 'UNPAID'
             END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [invoiceReturnDelta, balanceDelta, balanceDelta, freshCandidate.originalInvoiceId]
      );
      tx.run(
        `INSERT INTO sales_return_reconciliations (
           id, return_id, invoice_returned_amount_before, stored_cash_amount, stored_balance_amount,
           calculated_tax_amount, confirmed_cash_amount, confirmed_balance_amount,
           customer_purchase_tax_included, existing_ledger_summary, correction_entry_id,
           approved_by, approved_at, notes
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          reconciliationId, input.returnId, freshCandidate.invoiceReturnedAmount,
          freshCandidate.storedCashAmount, freshCandidate.storedBalanceAmount, taxReduction,
          confirmedCashAmount, confirmedBalanceAmount,
          input.taxAlreadyIncludedInCustomerPurchases ? 1 : 0, ledgerSummary, entryId,
          actor.id, new Date().toISOString(), notes,
        ]
      );
      return entryId;
    });

    new AuditService().log({
      userId: actor.id,
      userName: actor.fullName,
      action: 'اعتماد تسوية مرتجع تاريخي',
      module: 'FINANCE',
      recordId: input.returnId,
      oldValues: JSON.stringify({
        cash: candidate.storedCashAmount,
        balance: candidate.storedBalanceAmount,
        tax: null,
      }),
      newValues: JSON.stringify({
        cash: confirmedCashAmount,
        balance: confirmedBalanceAmount,
        tax: taxReduction,
        taxAlreadyIncludedInCustomerPurchases: input.taxAlreadyIncludedInCustomerPurchases,
        correctionEntryId,
        notes,
      }),
    });
  }

  private assertReportReview(
    reviewId: string,
    actorId: string,
    candidate: HistoricalReturnCandidate,
    database = this.db.getDatabase()
  ): void {
    const review = queryLedgerRows<{ reviewed_by: string; snapshot_json: string }>(
      database,
      `SELECT reviewed_by, snapshot_json
       FROM sales_return_reconciliation_reviews WHERE id = ?`,
      [reviewId]
    )[0];
    if (!review || review.reviewed_by !== actorId) {
      throw new Error('احفظ تقرير الفروقات الحالي وراجعه قبل اعتماد أي تسوية.');
    }
    let candidates: HistoricalReturnCandidate[];
    try {
      candidates = JSON.parse(review.snapshot_json).candidates;
    } catch {
      throw new Error('سجل تقرير المراجعة تالف؛ أنشئ تقريرًا جديدًا.');
    }
    const reviewed = candidates.find((item) => item.id === candidate.id);
    const comparedFields: Array<keyof HistoricalReturnCandidate> = [
      'netAmount', 'calculatedTax', 'grossAmount', 'storedCashAmount', 'storedBalanceAmount',
      'registerId', 'shiftId', 'cashRegisterBalance', 'shiftTotalRefunds', 'ledgerEntryIds',
      'ledgerEntryNumbers', 'ledgerLinesSummary', 'ledgerEntryCount', 'ledgerCashAmount',
      'ledgerRevenueAmount', 'ledgerTaxAmount', 'ledgerBalanceAmount',
    ];
    if (!reviewed || comparedFields.some((field) => reviewed[field] !== candidate[field])) {
      throw new Error('تغيرت بيانات المرتجع أو القيد منذ حفظ التقرير؛ راجع تقرير فروقات محدثًا.');
    }
  }

  private pendingRows(returnId?: string, database = this.db.getDatabase()): CandidateRow[] {
    const scope = this.branchAccess.sqlScope('si.branch_id', 'w.branch_id');
    const params: SqlValue[] = [...scope.params];
    const returnFilter = returnId ? 'AND sr.id = ?' : '';
    if (returnId) params.push(returnId);
    return queryLedgerRows<CandidateRow>(database, `
      SELECT sr.id, sr.customer_id, sr.return_number, sr.date, sr.original_invoice_id,
             sr.total_amount AS net_amount,
             si.invoice_number,
             COALESCE(si.branch_id, w.branch_id) AS branch_id,
             MAX(0, COALESCE(si.subtotal, 0) - COALESCE(si.discount_amount, 0)) AS invoice_taxable_base,
             COALESCE(si.tax_amount, 0) AS invoice_tax_amount,
             COALESCE(sr.refunded_amount, 0) AS stored_cash_amount,
             COALESCE(sr.remaining_to_balance, 0) AS stored_balance_amount,
             COALESCE(si.returned_amount, 0) AS invoice_returned_amount,
             COALESCE(c.current_balance, 0) AS customer_balance,
             COALESCE(c.total_purchases, 0) AS customer_total_purchases,
             COALESCE(si.remaining_amount, 0) AS invoice_remaining_amount,
             sr.register_id, sr.shift_id, c.name AS customer_name,
             cr.current_balance AS cash_register_balance,
             cs.total_refunds AS shift_total_refunds,
             COALESCE(ledger.entry_ids, '') AS ledger_entry_ids,
             COALESCE(ledger.entry_numbers, '') AS ledger_entry_numbers,
             COALESCE(ledger.lines_summary, '') AS ledger_lines_summary,
             COALESCE(ledger.entry_count, 0) AS ledger_entry_count,
             COALESCE(ledger.cash_amount, 0) AS ledger_cash_amount,
             COALESCE(ledger.revenue_amount, 0) AS ledger_revenue_amount,
             COALESCE(ledger.tax_amount, 0) AS ledger_tax_amount,
             COALESCE(ledger.balance_amount, 0) AS ledger_balance_amount
      FROM sales_returns sr
      JOIN sales_invoices si ON si.id = sr.original_invoice_id
      JOIN customers c ON c.id = sr.customer_id
      JOIN warehouses w ON w.id = si.warehouse_id
      LEFT JOIN cash_registers cr ON cr.id = sr.register_id
      LEFT JOIN cash_shifts cs ON cs.id = sr.shift_id
      LEFT JOIN (
        SELECT je.reference_id,
               GROUP_CONCAT(DISTINCT je.id) AS entry_ids,
               GROUP_CONCAT(DISTINCT je.entry_number) AS entry_numbers,
               COUNT(DISTINCT je.id) AS entry_count,
               GROUP_CONCAT(coa.code || ' D' || printf('%.2f', jel.debit) ||
                 ' C' || printf('%.2f', jel.credit), ' | ') AS lines_summary,
               SUM(CASE WHEN coa.code IN ('1101','1102','1105','1106')
                   THEN jel.credit - jel.debit ELSE 0 END) AS cash_amount,
               SUM(CASE WHEN coa.code = '4101' THEN jel.debit - jel.credit ELSE 0 END) AS revenue_amount,
               SUM(CASE WHEN coa.code = '2102' THEN jel.debit - jel.credit ELSE 0 END) AS tax_amount,
               SUM(CASE WHEN coa.code = '1103' THEN jel.credit - jel.debit ELSE 0 END) AS balance_amount
        FROM journal_entries je
        JOIN journal_entry_lines jel ON jel.entry_id = je.id
        JOIN chart_of_accounts coa ON coa.id = jel.account_id
        WHERE je.reference_type = 'SALES_RETURN' AND je.is_posted = 1
        GROUP BY je.reference_id
      ) ledger ON ledger.reference_id = sr.id
      WHERE sr.return_tax_amount IS NULL
        AND ${scope.clause}
        AND NOT EXISTS (
          SELECT 1 FROM sales_return_reconciliations reconciliation
          WHERE reconciliation.return_id = sr.id
        )
        ${returnFilter}
      ORDER BY sr.date, sr.created_at, sr.id
    `, params);
  }

  private toCandidate(row: CandidateRow): HistoricalReturnCandidate {
    const calculatedTax = calculateTax(row);
    return {
      id: row.id,
      returnNumber: row.return_number,
      returnDate: row.date,
      customerName: row.customer_name,
      invoiceNumber: row.invoice_number,
      originalInvoiceId: row.original_invoice_id,
      branchId: row.branch_id,
      netAmount: Number(row.net_amount || 0),
      calculatedTax,
      grossAmount: round2(Number(row.net_amount || 0) + calculatedTax),
      storedCashAmount: Number(row.stored_cash_amount || 0),
      storedBalanceAmount: Number(row.stored_balance_amount || 0),
      invoiceReturnedAmount: Number(row.invoice_returned_amount || 0),
      customerBalance: Number(row.customer_balance || 0),
      customerTotalPurchases: Number(row.customer_total_purchases || 0),
      invoiceRemainingAmount: Number(row.invoice_remaining_amount || 0),
      registerId: row.register_id,
      shiftId: row.shift_id,
      cashRegisterBalance: row.cash_register_balance == null ? null : Number(row.cash_register_balance),
      shiftTotalRefunds: row.shift_total_refunds == null ? null : Number(row.shift_total_refunds),
      ledgerEntryIds: row.ledger_entry_ids || '',
      ledgerEntryNumbers: row.ledger_entry_numbers || '',
      ledgerLinesSummary: row.ledger_lines_summary || '',
      ledgerEntryCount: Number(row.ledger_entry_count || 0),
      ledgerCashAmount: round2(Number(row.ledger_cash_amount || 0)),
      ledgerRevenueAmount: round2(Number(row.ledger_revenue_amount || 0)),
      ledgerTaxAmount: round2(Number(row.ledger_tax_amount || 0)),
      ledgerBalanceAmount: round2(Number(row.ledger_balance_amount || 0)),
    };
  }

  private buildCorrectionLines(
    tx: DatabaseManager,
    candidate: HistoricalReturnCandidate,
    confirmedBalanceAmount: number,
    confirmedTaxAmount: number
  ): { accountCode: string; debit: number; credit: number }[] {
    const existing = queryLedgerRows<{ code: string; signed_amount: number }>(
      tx.getDatabase(),
      `SELECT coa.code, SUM(jel.debit - jel.credit) AS signed_amount
       FROM journal_entries je
       JOIN journal_entry_lines jel ON jel.entry_id = je.id
       JOIN chart_of_accounts coa ON coa.id = jel.account_id
       WHERE je.reference_type = 'SALES_RETURN' AND je.reference_id = ? AND je.is_posted = 1
         AND coa.code IN ('4101', '2102', '1103')
       GROUP BY coa.code`,
      [candidate.id]
    );
    const existingByCode = new Map(existing.map((row) => [row.code, Number(row.signed_amount || 0)]));
    const targets = new Map<string, number>([
      ['4101', candidate.netAmount],
      ['2102', confirmedTaxAmount],
      ['1103', -confirmedBalanceAmount],
    ]);
    const lines: { accountCode: string; debit: number; credit: number }[] = [];
    let signedTotal = 0;
    for (const [accountCode, desiredSignedAmount] of targets) {
      const delta = round2(desiredSignedAmount - (existingByCode.get(accountCode) || 0));
      signedTotal = round2(signedTotal + delta);
      if (delta > 0.009) lines.push({ accountCode, debit: delta, credit: 0 });
      else if (delta < -0.009) lines.push({ accountCode, debit: 0, credit: -delta });
    }
    if (Math.abs(signedTotal) > 0.01) {
      throw new Error('القيد الموجود لا يمكن تصحيحه دون تعديل حركة نقدية أو إنشاء طرف مقابل غير مثبت؛ لم تُطبق أي تسوية.');
    }
    return lines;
  }

}
