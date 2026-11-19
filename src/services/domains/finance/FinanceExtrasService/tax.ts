import { ExtrasJournalBase } from './journal';
import { inclusiveReturnTaxSql, returnTaxSql } from '../financials';
import { round2 } from './types';

export abstract class ExtrasTaxBase extends ExtrasJournalBase {
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
      `SELECT COALESCE(SUM(tax_amount), 0) / 100.0 AS tax, COALESCE(SUM(total_amount), 0) / 100.0 AS total, COUNT(*) AS count
       FROM sales_invoices si
       WHERE si.invoice_status != 'VOID' AND si.date >= ? AND si.date <= ? AND ${salesScope.clause}`,
      [dateFrom, dateTo, ...salesScope.params]
    )[0] || {};
    const purchases = this.db.query<any>(
      `SELECT COALESCE(SUM(tax_amount), 0) / 100.0 AS tax, COALESCE(SUM(total_amount), 0) / 100.0 AS total, COUNT(*) AS count
       FROM purchase_invoices pi
       WHERE pi.date >= ? AND pi.date <= ? AND ${purchaseScope.clause}`,
      [dateFrom, dateTo, ...purchaseScope.params]
    )[0] || {};
    const salesReturns = this.db.query<any>(
      `SELECT COALESCE(SUM(sr.total_amount), 0) / 100.0 AS net,
              COALESCE(SUM(${salesReturnTax}), 0) / 100.0 AS tax
       FROM sales_returns sr
       JOIN sales_invoices original ON original.id = sr.original_invoice_id
       WHERE sr.date >= ? AND sr.date <= ? AND original.invoice_status != 'VOID'
         AND ${returnSalesScope.clause}`,
      [dateFrom, dateTo, ...returnSalesScope.params]
    )[0] || {};
    const purchaseReturns = this.db.query<any>(
      `SELECT COALESCE(SUM(pr.total_amount), 0) / 100.0 AS total,
              COALESCE(SUM(${purchaseReturnTax}), 0) / 100.0 AS tax
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
         SELECT substr(si.date, 1, 7) AS month, si.tax_amount / 100.0 AS output_tax, 0 AS input_tax
         FROM sales_invoices si
         WHERE si.invoice_status != 'VOID' AND si.date >= ? AND si.date <= ? AND ${salesScope.clause}
         UNION ALL
         SELECT substr(sr.date, 1, 7) AS month,
                -(${salesReturnTax}) / 100.0 AS output_tax,
                0 AS input_tax
         FROM sales_returns sr
         JOIN sales_invoices original ON original.id = sr.original_invoice_id
         WHERE sr.date >= ? AND sr.date <= ? AND original.invoice_status != 'VOID'
           AND ${returnSalesScope.clause}
         UNION ALL
         SELECT substr(pi.date, 1, 7) AS month, 0 AS output_tax, pi.tax_amount / 100.0 AS input_tax
         FROM purchase_invoices pi
         WHERE pi.date >= ? AND pi.date <= ? AND ${purchaseScope.clause}
         UNION ALL
         SELECT substr(pr.date, 1, 7) AS month, 0 AS output_tax,
                -(${purchaseReturnTax}) / 100.0 AS input_tax
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
}
