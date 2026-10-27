import { DatabaseManager } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { localDateString } from '../utils/date';
import { round2 } from './financials';
import { postLedgerEntry } from '../database/ledger';
import type { ReorderSuggestion, SupplierRfqRow, SupplierRfqItem, SupplierQuotationRow, SupplierQuotationItem, GoodsReceiptRow, GoodsReceiptItem, SupplierClaimRow, SupplierClaimItem, ThreeWayMatchingResult, LandedCostBreakdownItem, SupplierScorecard, ProductPriceHistoryEntry } from './procurementTypes';
import { ProcurementServicePart06 } from './ProcurementServicePart06';
import { BranchAccessService } from './BranchAccessService';

function getDeliveryMetrics(orders: Array<{
  status: string;
  receiptDate: string | null;
  expectedDate: string | null;
}>): { receivedOrders: number; onTimeDeliveries: number } {
  let receivedOrders = 0;
  let onTimeDeliveries = 0;

  for (const order of orders) {
    if (!['PARTIAL', 'RECEIVED'].includes(order.status) && !order.receiptDate) continue;

    receivedOrders++;
    if (!order.expectedDate || !order.receiptDate || order.receiptDate <= order.expectedDate) {
      onTimeDeliveries++;
    }
  }

  return { receivedOrders, onTimeDeliveries };
}

function getSupplierRatingLabel(score: number): SupplierScorecard['ratingLabel'] {
  if (score >= 90) return 'ممتاز';
  if (score >= 80) return 'جيد جداً';
  if (score >= 70) return 'جيد';
  if (score >= 55) return 'يحتاج تحسين';
  return 'ضعيف';
}

export abstract class ProcurementServicePart07 extends ProcurementServicePart06 {
public getSupplierScorecard(supplierId: string): SupplierScorecard {
    const sup = this.db.query<any>(`SELECT * FROM suppliers WHERE id = ?`, [supplierId])[0];
    if (!sup) throw new Error('المورد غير موجود.');

    // Supplier master data is shared, but every transactional row behind the
    // scorecard must stay inside the branches the current user may see.
    const branchAccess = new BranchAccessService();
    const orderScope = branchAccess.warehouseBranchScope('w');
    const grnScope = branchAccess.sqlScope(
      'w.branch_id',
      '(SELECT bw.branch_id FROM branch_warehouses bw WHERE bw.warehouse_id = grn.warehouse_id ORDER BY bw.is_primary DESC, bw.branch_id ASC LIMIT 1)'
    );
    const claimScope = branchAccess.supplierClaimBranchScope('supplier_claims');

    // 1. PO punctuality
    const orders = this.db.query<any>(`
      SELECT po.id, po.date, po.expected_date, po.status, grn.date AS receiptDate
      FROM purchase_orders po
      LEFT JOIN warehouses w ON w.id = po.warehouse_id
      LEFT JOIN goods_receipt_notes grn ON grn.purchase_order_id = po.id
      WHERE po.supplier_id = ? AND ${orderScope.clause}
    `, [supplierId, ...orderScope.params]);

    const totalOrders = orders.length;
    const { receivedOrders, onTimeDeliveries } = getDeliveryMetrics(orders);
    const onTimeRate = receivedOrders > 0 ? round2((onTimeDeliveries / receivedOrders) * 100) : 100;

    // 2. Goods receipt quality
    const grnStats = this.db.query<any>(`
      SELECT
        COALESCE(SUM(grn.total_received_m2), 0) AS totalReceived,
        COALESCE(SUM(grn.total_accepted_m2), 0) AS totalAccepted,
        COALESCE(SUM(grn.total_damaged_m2), 0) AS totalDamaged
      FROM goods_receipt_notes grn
      LEFT JOIN warehouses w ON w.id = grn.warehouse_id
      WHERE grn.supplier_id = ? AND ${grnScope.clause}
    `, [supplierId, ...grnScope.params])[0];

    const totalReceivedM2 = round2(Number(grnStats?.totalReceived || 0));
    const totalAcceptedM2 = round2(Number(grnStats?.totalAccepted || 0));
    const totalDamagedM2 = round2(Number(grnStats?.totalDamaged || 0));

    const acceptanceRate = totalReceivedM2 > 0 ? round2((totalAcceptedM2 / totalReceivedM2) * 100) : 100;
    const damageRate = totalReceivedM2 > 0 ? round2((totalDamagedM2 / totalReceivedM2) * 100) : 0;

    // 3. Claims
    const claims = this.db.query<any>(`
      SELECT
        COUNT(*) AS totalCount,
        SUM(CASE WHEN status = 'SETTLED' THEN 1 ELSE 0 END) AS settledCount,
        COALESCE(SUM(claimed_amount), 0) AS totalClaimed,
        COALESCE(SUM(agreed_amount), 0) AS totalAgreed
      FROM supplier_claims WHERE supplier_id = ? AND ${claimScope.clause}
    `, [supplierId, ...claimScope.params])[0];

    const totalClaimsCount = Number(claims?.totalCount || 0);
    const settledClaimsCount = Number(claims?.settledCount || 0);
    const totalClaimedAmount = round2(Number(claims?.totalClaimed || 0));
    const totalAgreedAmount = round2(Number(claims?.totalAgreed || 0));

    // Overall score calculation
    // 40% on-time delivery + 40% acceptance rate + 20% claims stability
    const claimsPenalty = Math.min(20, totalClaimsCount * 4);
    const overallScore = Math.max(0, Math.min(100, round2((onTimeRate * 0.4) + (acceptanceRate * 0.4) + (20 - claimsPenalty))));

    const ratingLabel = getSupplierRatingLabel(overallScore);

    return {
      supplierId: sup.id,
      supplierName: sup.name,
      totalOrders,
      receivedOrders,
      onTimeDeliveries,
      onTimeDeliveryRate: onTimeRate,
      totalReceivedM2,
      totalAcceptedM2,
      totalDamagedM2,
      acceptanceRate,
      damageRate,
      totalClaimsCount,
      settledClaimsCount,
      totalClaimedAmount,
      totalAgreedAmount,
      averagePaymentDays: Number(sup.paymentTermsDays || 30),
      currentBalance: round2(Number(sup.currentBalance || 0)),
      totalPurchases: round2(Number(sup.totalPurchases || 0)),
      overallScore,
      ratingLabel,
    };
  }

public getProductPriceHistory(productId: string): ProductPriceHistoryEntry[] {
    const invoiceScope = new BranchAccessService().sqlScope(
      'pi.branch_id',
      '(SELECT w.branch_id FROM warehouses w WHERE w.id = pi.warehouse_id)'
    );
    const rows = this.db.query<any>(`
      SELECT
        pii.product_id AS productId,
        pi.date,
        pi.invoice_number AS invoiceNumber,
        pi.supplier_id AS supplierId,
        s.name AS supplierName,
        pii.quantity_m2 AS quantityM2,
        pii.unit_cost AS unitCost,
        COALESCE(NULLIF(pii.effective_unit_cost, 0), pii.unit_cost) AS effectiveUnitCost,
        (SELECT pb.batch_number FROM product_batches pb WHERE pb.product_id = pii.product_id AND pb.supplier_id = pi.supplier_id ORDER BY pb.created_at DESC LIMIT 1) AS batchNumber
      FROM purchase_invoice_items pii
      JOIN purchase_invoices pi ON pi.id = pii.purchase_id
      JOIN suppliers s ON s.id = pi.supplier_id
      WHERE pii.product_id = ? AND ${invoiceScope.clause}
      ORDER BY pi.date DESC, pi.created_at DESC
    `, [productId, ...invoiceScope.params]);

    return rows.map((r) => ({
      productId: r.productId,
      date: r.date,
      invoiceNumber: r.invoiceNumber,
      supplierId: r.supplierId,
      supplierName: r.supplierName,
      quantityM2: Number(r.quantityM2),
      unitCost: Number(r.unitCost),
      effectiveUnitCost: Number(r.effectiveUnitCost),
      batchNumber: r.batchNumber || null,
    }));
  }
}
