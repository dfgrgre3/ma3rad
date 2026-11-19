import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { localDateString } from '../../../utils/shared/date';
import { round2 } from '../finance/financials';
import { postLedgerEntry } from '../../../database/repositories/ledger';
import type { SupplierClaimRow, SupplierClaimItem } from '../../../types/procurement';
import { ProcurementServicePart05 } from './ProcurementServicePart05';
import { BranchAccessService } from '../auth/BranchAccessService';

export abstract class ProcurementServicePart06 extends ProcurementServicePart05 {
private claimBranchAccess = new BranchAccessService();

private claimScope(actor: ReturnType<typeof AuthService.requireAuth>) {
    const branchExpression = 'COALESCE(c.branch_id, pi.branch_id, piw.branch_id, grnw.branch_id, pow.branch_id)';
    return {
      branch: this.claimBranchAccess.sqlScope(branchExpression, undefined, actor),
      company: this.claimBranchAccess.companyScope('COALESCE(pi.company_id, b.company_id)', actor),
    };
  }

private claimJoins(): string {
    return `
      LEFT JOIN purchase_invoices pi ON pi.id = c.purchase_invoice_id
      LEFT JOIN warehouses piw ON piw.id = pi.warehouse_id
      LEFT JOIN goods_receipt_notes grn ON grn.id = c.grn_id
      LEFT JOIN warehouses grnw ON grnw.id = grn.warehouse_id
      LEFT JOIN purchase_orders po ON po.id = c.purchase_order_id
      LEFT JOIN warehouses pow ON pow.id = po.warehouse_id
      LEFT JOIN branches b ON b.id = COALESCE(c.branch_id, pi.branch_id, piw.branch_id, grnw.branch_id, pow.branch_id)
    `;
  }

  private buildClaimsQuery(actor: ReturnType<typeof AuthService.requireAuth>, search: string, status: string, supplierId: string): { sql: string; params: any[] } {
    const scope = this.claimScope(actor);
    let sql = `
      SELECT c.*,
        c.claimed_amount / 100.0 AS claimed_amount,
        c.agreed_amount / 100.0 AS agreed_amount,
        s.name AS supplierName, u.full_name AS createdByName,
        pi.invoice_number AS invoiceNumber, grn.grn_number AS grnNumber, po.order_number AS orderNumber
      FROM supplier_claims c
      JOIN suppliers s ON s.id = c.supplier_id
      ${this.claimJoins()}
      LEFT JOIN users u ON u.id = c.created_by
      WHERE ${scope.branch.clause} AND ${scope.company.clause}
    `;
    const params: any[] = [...scope.branch.params, ...scope.company.params];
    if (status !== 'ALL') {
      sql += ` AND c.status = ?`;
      params.push(status);
    }
    if (supplierId) {
      sql += ` AND c.supplier_id = ?`;
      params.push(supplierId);
    }
    if (search.trim()) {
      sql += ` AND (c.claim_number LIKE ? OR s.name LIKE ? OR c.notes LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }
    sql += ` ORDER BY c.created_at DESC`;
    return { sql, params };
  }

public getAllClaims(search = '', status = 'ALL', supplierId = ''): SupplierClaimRow[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.purchases.invoices.view');
    const { sql, params } = this.buildClaimsQuery(actor, search, status, supplierId);
    return this.db.query<SupplierClaimRow>(sql, params);
  }

  public async getAllClaimsAsync(search = '', status = 'ALL', supplierId = ''): Promise<SupplierClaimRow[]> {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.purchases.invoices.view');
    const { sql, params } = this.buildClaimsQuery(actor, search, status, supplierId);
    return this.db.queryAsync<SupplierClaimRow>(sql, params);
  }

  private buildClaimByIdQueries(id: string, actor: ReturnType<typeof AuthService.requireAuth>): { rowSql: string; rowParams: any[]; itemsSql: string; itemsParams: any[] } {
    const scope = this.claimScope(actor);
    return {
      rowSql: `
      SELECT c.*,
        c.claimed_amount / 100.0 AS claimed_amount,
        c.agreed_amount / 100.0 AS agreed_amount,
        s.name AS supplierName, u.full_name AS createdByName,
        COALESCE(c.branch_id, pi.branch_id, piw.branch_id, grnw.branch_id, pow.branch_id) AS branchId,
        pi.invoice_number AS invoiceNumber, grn.grn_number AS grnNumber, po.order_number AS orderNumber
      FROM supplier_claims c
      JOIN suppliers s ON s.id = c.supplier_id
      ${this.claimJoins()}
      LEFT JOIN users u ON u.id = c.created_by
      WHERE c.id = ? AND ${scope.branch.clause} AND ${scope.company.clause}
    `,
      rowParams: [id, ...scope.branch.params, ...scope.company.params],
      itemsSql: `SELECT *, unit_cost / 100.0 AS unit_cost, total_amount / 100.0 AS total_amount FROM supplier_claim_items WHERE claim_id = ?`,
      itemsParams: [id],
    };
  }

public getClaimById(id: string): (SupplierClaimRow & { items: SupplierClaimItem[] }) | null {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.purchases.invoices.view');
    const claim = this.readClaimById(id, actor);
    if (!claim) return null;
    const { branchId: _branchId, ...result } = claim;
    return result;
  }

  public async getClaimByIdAsync(id: string): Promise<(SupplierClaimRow & { items: SupplierClaimItem[] }) | null> {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.purchases.invoices.view');
    const { rowSql, rowParams, itemsSql, itemsParams } = this.buildClaimByIdQueries(id, actor);
    const [rows, items] = await Promise.all([
      this.db.queryAsync<SupplierClaimRow & { branchId: string | null }>(rowSql, rowParams),
      this.db.queryAsync<SupplierClaimItem>(itemsSql, itemsParams),
    ]);
    const row = rows[0];
    if (!row) return null;
    const { branchId: _branchId, ...result } = { ...row, items };
    return result;
  }

protected readClaimById(
    id: string,
    actor: ReturnType<typeof AuthService.requireAuth>
  ): (SupplierClaimRow & { items: SupplierClaimItem[]; branchId: string | null }) | null {
    const { rowSql, rowParams, itemsSql, itemsParams } = this.buildClaimByIdQueries(id, actor);
    const row = this.db.query<SupplierClaimRow>(rowSql, rowParams)[0] as (SupplierClaimRow & { branchId: string | null }) | undefined;
    if (!row) return null;

    const items = this.db.query<SupplierClaimItem>(itemsSql, itemsParams);

    return { ...row, items };
  }

public settleClaim(
    claimId: string,
    resolutionType: 'DEBIT_NOTE' | 'REPLACEMENT' | 'REFUND',
    agreedAmount: number,
    notes?: string
  ): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.purchases.invoices.approve');
    const claim = this.readClaimById(claimId, actor);
    if (!claim) throw new Error('المطالبة غير موجودة.');
    if (claim.status === 'SETTLED') throw new Error('تمت تسوية هذه المطالبة مسبقاً.');

    const value = round2(agreedAmount);
    const today = localDateString();

    this.db.executeFinancialTransaction((db) => {
      // 1. If Debit Note, deduct from supplier balance & create accounting entry
      if (resolutionType === 'DEBIT_NOTE' && value > 0) {
        db.run(`
          UPDATE suppliers
          SET current_balance = current_balance - ROUND(?*100), updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [value, claim.supplierId]);

        // General ledger entry: Debit AP (2101), Credit Purchase Allowances / Discounts (5202)
        postLedgerEntry(db.getDatabase(), {
          date: today,
          description: `Debit Note for Supplier Claim ${claim.claimNumber} (${notes || 'إشعار مدين عيوب/نقص'})`,
          referenceType: 'SUPPLIER_CLAIM',
          referenceId: claimId,
          createdBy: actor.id,
          lines: [
            { accountCode: '2101', debit: value, credit: 0 },
            { accountCode: '5202', debit: 0, credit: value },
          ],
        });
      }

      // If Cash Refund, increase default cash register
      if (resolutionType === 'REFUND' && value > 0) {
        if (!claim.branchId) throw new Error('لا يمكن تحديد فرع المطالبة لتسجيل المبلغ المسترد.');
        const registerId = this.claimBranchAccess.getDefaultRegisterId(claim.branchId, actor);
        db.run(`UPDATE cash_registers SET current_balance = current_balance + ROUND(?*100) WHERE id = ?`, [value, registerId]);
        postLedgerEntry(db.getDatabase(), {
          date: today,
          description: `Cash refund for Supplier Claim ${claim.claimNumber}`,
          referenceType: 'SUPPLIER_CLAIM',
          referenceId: claimId,
          createdBy: actor.id,
          lines: [
            { accountCode: '1101', debit: value, credit: 0 },
            { accountCode: '5202', debit: 0, credit: value },
          ],
        });
      }

      db.run(`
        UPDATE supplier_claims
        SET status = 'SETTLED', resolution_type = ?, agreed_amount = ROUND(?*100), notes = COALESCE(?, notes)
        WHERE id = ?
      `, [resolutionType, value, notes || null, claimId]);
    });
  }
}
