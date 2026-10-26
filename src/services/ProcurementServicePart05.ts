import { DatabaseManager } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { localDateString } from '../utils/date';
import { round2 } from './financials';
import { postLedgerEntry } from '../database/ledger';
import type { ReorderSuggestion, SupplierRfqRow, SupplierRfqItem, SupplierQuotationRow, SupplierQuotationItem, GoodsReceiptRow, GoodsReceiptItem, SupplierClaimRow, SupplierClaimItem, ThreeWayMatchingResult, LandedCostBreakdownItem, SupplierScorecard, ProductPriceHistoryEntry } from './procurementTypes';
import { ProcurementServicePart04 } from './ProcurementServicePart04';

export abstract class ProcurementServicePart05 extends ProcurementServicePart04 {
public calculateLandedCost(
    items: { productId: string; quantityM2: number; unitCost: number }[],
    expenses: { freight?: number; loading?: number; customsTaxes?: number; insurance?: number; other?: number },
    method: 'VALUE' | 'QUANTITY' | 'WEIGHT' = 'VALUE'
  ): { totalLandedExpenses: number; items: LandedCostBreakdownItem[] } {
    const totalFreight = Number(expenses.freight || 0);
    const totalLoading = Number(expenses.loading || 0);
    const totalCustoms = Number(expenses.customsTaxes || 0);
    const totalInsurance = Number(expenses.insurance || 0);
    const totalOther = Number(expenses.other || 0);
    const totalLandedExpenses = round2(totalFreight + totalLoading + totalCustoms + totalInsurance + totalOther);

    if (totalLandedExpenses <= 0 || !items.length) {
      return {
        totalLandedExpenses: 0,
        items: items.map((i) => {
          const prod = this.db.query<any>(`SELECT name FROM products WHERE id = ?`, [i.productId])[0];
          const baseTotal = round2(i.quantityM2 * i.unitCost);
          return {
            productId: i.productId,
            productName: prod?.name || 'صنف',
            quantityM2: i.quantityM2,
            baseUnitCost: i.unitCost,
            baseTotalCost: baseTotal,
            landedShare: 0,
            effectiveUnitCost: i.unitCost,
            effectiveTotalCost: baseTotal,
          };
        }),
      };
    }

    // Determine weight or denominator based on method
    let denominator = 0;
    const itemWeights: number[] = [];

    for (const item of items) {
      if (method === 'QUANTITY') {
        denominator += Number(item.quantityM2);
        itemWeights.push(Number(item.quantityM2));
      } else if (method === 'WEIGHT') {
        const prod = this.db.query<any>(`SELECT weight_per_box, meters_per_box FROM products WHERE id = ?`, [item.productId])[0];
        const weightPerBox = Number(prod?.weightPerBox || 20);
        const metersPerBox = Number(prod?.metersPerBox || 1.44);
        const estWeight = (Number(item.quantityM2) / metersPerBox) * weightPerBox;
        denominator += estWeight;
        itemWeights.push(estWeight);
      } else {
        // Default: VALUE
        const val = Number(item.quantityM2) * Number(item.unitCost);
        denominator += val;
        itemWeights.push(val);
      }
    }

    if (denominator <= 0) denominator = 1;

    let allocatedSum = 0;
    const resultItems: LandedCostBreakdownItem[] = [];

    items.forEach((item, index) => {
      const prod = this.db.query<any>(`SELECT name FROM products WHERE id = ?`, [item.productId])[0];
      const baseTotal = round2(item.quantityM2 * item.unitCost);
      const ratio = itemWeights[index] / denominator;
      const share = index === items.length - 1
        ? round2(totalLandedExpenses - allocatedSum) // Adjust rounding difference on last item
        : round2(totalLandedExpenses * ratio);
      allocatedSum = round2(allocatedSum + share);

      const effectiveTotal = round2(baseTotal + share);
      const effectiveUnitCost = item.quantityM2 > 0 ? round2(effectiveTotal / item.quantityM2) : item.unitCost;

      resultItems.push({
        productId: item.productId,
        productName: prod?.name || 'صنف',
        quantityM2: item.quantityM2,
        baseUnitCost: item.unitCost,
        baseTotalCost: baseTotal,
        landedShare: share,
        effectiveUnitCost,
        effectiveTotalCost: effectiveTotal,
      });
    });

    return { totalLandedExpenses, items: resultItems };
  }

public createClaim(dto: {
    supplierId: string;
    purchaseInvoiceId?: string;
    grnId?: string;
    purchaseOrderId?: string;
    claimType: 'SHORTAGE' | 'DAMAGE_DEFECT' | 'PRICE_DIFFERENCE' | 'LATE_DELIVERY' | 'OTHER';
    severity?: 'LOW' | 'MEDIUM' | 'CRITICAL';
    claimedAmount: number;
    notes?: string;
    items?: { productId: string; defectType?: string; quantityM2: number; unitCost: number; notes?: string }[];
  }): SupplierClaimRow {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'purchases.create');
    if (Number(dto.claimedAmount) <= 0) throw new Error('يجب تحديد مبلغ المطالبة بقيمة موجبة.');

    const claimId = `sclm_${uuidv4().substring(0, 8)}`;
    const today = localDateString();

    return this.db.executeTransaction((db) => {
      const claimNumber = db.nextNumber('CLM');

      db.run(`
        INSERT INTO supplier_claims (
          id, claim_number, date, supplier_id, purchase_invoice_id, grn_id, purchase_order_id,
          claim_type, severity, claimed_amount, agreed_amount, status, resolution_type, notes, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'OPEN', 'PENDING', ?, ?)
      `, [
        claimId, claimNumber, today, dto.supplierId, dto.purchaseInvoiceId || null,
        dto.grnId || null, dto.purchaseOrderId || null, dto.claimType, dto.severity || 'MEDIUM',
        round2(dto.claimedAmount), dto.notes || null, actor.id,
      ]);

      if (dto.items && dto.items.length > 0) {
        for (const item of dto.items) {
          const prod = db.query<any>(`SELECT name FROM products WHERE id = ?`, [item.productId])[0];
          const itemTotal = round2(Number(item.quantityM2) * Number(item.unitCost));
          db.run(`
            INSERT INTO supplier_claim_items (id, claim_id, product_id, product_name, defect_type, quantity_m2, unit_cost, total_amount, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            `sclmi_${uuidv4().substring(0, 8)}`, claimId, item.productId, prod?.name || 'صنف',
            item.defectType || null, Number(item.quantityM2), Number(item.unitCost), itemTotal, item.notes || null,
          ]);
        }
      }

      return this.getClaimById(claimId)!;
    });
  }
}
