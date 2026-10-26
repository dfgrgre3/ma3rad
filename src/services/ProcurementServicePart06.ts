import { DatabaseManager } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { localDateString } from '../utils/date';
import { round2 } from './financials';
import { postLedgerEntry } from '../database/ledger';
import type { ReorderSuggestion, SupplierRfqRow, SupplierRfqItem, SupplierQuotationRow, SupplierQuotationItem, GoodsReceiptRow, GoodsReceiptItem, SupplierClaimRow, SupplierClaimItem, ThreeWayMatchingResult, LandedCostBreakdownItem, SupplierScorecard, ProductPriceHistoryEntry } from './procurementTypes';
import { ProcurementServicePart05 } from './ProcurementServicePart05';

export abstract class ProcurementServicePart06 extends ProcurementServicePart05 {
public getAllClaims(search = '', status = 'ALL', supplierId = ''): SupplierClaimRow[] {
    let sql = `
      SELECT c.*, s.name AS supplierName, u.full_name AS createdByName,
        pi.invoice_number AS invoiceNumber, grn.grn_number AS grnNumber, po.order_number AS orderNumber
      FROM supplier_claims c
      JOIN suppliers s ON s.id = c.supplier_id
      LEFT JOIN purchase_invoices pi ON pi.id = c.purchase_invoice_id
      LEFT JOIN goods_receipt_notes grn ON grn.id = c.grn_id
      LEFT JOIN purchase_orders po ON po.id = c.purchase_order_id
      LEFT JOIN users u ON u.id = c.created_by
      WHERE 1 = 1
    `;
    const params: any[] = [];
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
    return this.db.query<SupplierClaimRow>(sql, params);
  }

public getClaimById(id: string): (SupplierClaimRow & { items: SupplierClaimItem[] }) | null {
    const row = this.db.query<SupplierClaimRow>(`
      SELECT c.*, s.name AS supplierName, u.full_name AS createdByName,
        pi.invoice_number AS invoiceNumber, grn.grn_number AS grnNumber, po.order_number AS orderNumber
      FROM supplier_claims c
      JOIN suppliers s ON s.id = c.supplier_id
      LEFT JOIN purchase_invoices pi ON pi.id = c.purchase_invoice_id
      LEFT JOIN goods_receipt_notes grn ON grn.id = c.grn_id
      LEFT JOIN purchase_orders po ON po.id = c.purchase_order_id
      LEFT JOIN users u ON u.id = c.created_by
      WHERE c.id = ?
    `, [id])[0];
    if (!row) return null;

    const items = this.db.query<SupplierClaimItem>(`
      SELECT * FROM supplier_claim_items WHERE claim_id = ?
    `, [id]);

    return { ...row, items };
  }

public settleClaim(
    claimId: string,
    resolutionType: 'DEBIT_NOTE' | 'REPLACEMENT' | 'REFUND',
    agreedAmount: number,
    notes?: string
  ): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'purchases.approve');
    const claim = this.getClaimById(claimId);
    if (!claim) throw new Error('المطالبة غير موجودة.');
    if (claim.status === 'SETTLED') throw new Error('تمت تسوية هذه المطالبة مسبقاً.');

    const value = round2(agreedAmount);
    const today = localDateString();

    this.db.executeTransaction((db) => {
      // 1. If Debit Note, deduct from supplier balance & create accounting entry
      if (resolutionType === 'DEBIT_NOTE' && value > 0) {
        db.run(`
          UPDATE suppliers
          SET current_balance = current_balance - ?, updated_at = CURRENT_TIMESTAMP
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
        db.run(`UPDATE cash_registers SET current_balance = current_balance + ? WHERE is_default = 1`, [value]);
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
        SET status = 'SETTLED', resolution_type = ?, agreed_amount = ?, notes = COALESCE(?, notes)
        WHERE id = ?
      `, [resolutionType, value, notes || null, claimId]);
    });
  }
}
