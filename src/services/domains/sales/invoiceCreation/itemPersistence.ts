import { v4 as uuidv4 } from 'uuid';
import { InventoryCostingService } from '../../inventory/InventoryCostingService';
import { InventoryLocationStockService } from '../../inventory/InventoryLocationStockService';
import { BatchService } from '../../inventory/BatchService';
import { round2 } from '../../finance/financials';
import type { CreateSaleDTO } from '../../../../types/sales/serviceTypes';
import type { PreparedSaleItem } from './types';

export function insertInvoiceItems(
  sqliteDb: any,
  dto: CreateSaleDTO,
  preparedItems: PreparedSaleItem[],
  invoiceId: string,
  invoiceNumber: string | number,
  actor: any,
  costingMethod: string,
  allowNegativeStock = false
): void {
  for (const item of preparedItems) {
    item.invoiceId = invoiceId;
    sqliteDb.run(`
      INSERT INTO sales_invoice_items (
        id, invoice_id, product_id, product_name, product_sku, product_grade, size,
        sold_by, quantity_m2, quantity, uom, boxes_count, pieces_count, unit_price, original_unit_price,
        unit_cost, discount_amount, total_price, total_cost, profit, meters_per_box, pieces_per_box, special_stock_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ROUND(? * 100), ROUND(? * 100), ROUND(? * 100), ROUND(? * 100), ROUND(? * 100), ROUND(? * 100), ROUND(? * 100), ?, ?, ?)
    `, [
      item.id, item.invoiceId, item.productId, item.productName, item.productSku, item.productGrade,
      item.size, item.soldBy, item.quantityM2, item.quantityM2, item.baseUom, item.boxesCount, item.piecesCount,
      item.unitPrice, item.originalUnitPrice, round2(item.unitCost), item.discountAmount,
      item.totalPrice, item.totalCost, item.profit, item.metersPerBox, item.piecesPerBox, item.specialStockId
    ]);

    if (!item.tracksStock) continue;
    if (item.specialStockId) {
      const source = sqliteDb.query(`
        SELECT remaining_quantity_m2 AS remainingQuantityM2, status
        FROM inventory_special_stocks WHERE id = ?
      `, [item.specialStockId])[0];
      if (!source || source.status !== 'DOWNGRADED_SALE' || Number(source.remainingQuantityM2) < item.quantityM2) {
        throw new Error(`نفدت الكمية المتاحة من سجل البيع المخفض ${item.specialNumber || item.specialStockId}.`);
      }
      sqliteDb.run(`
        UPDATE inventory_special_stocks
        SET remaining_quantity_m2 = remaining_quantity_m2 - ?
        WHERE id = ? AND status = 'DOWNGRADED_SALE' AND remaining_quantity_m2 >= ?
      `, [item.quantityM2, item.specialStockId, item.quantityM2]);

      const txId = `tx_${uuidv4().substring(0, 8)}`;
      sqliteDb.run(`
        INSERT INTO inventory_transactions (
          id, transaction_number, type, product_id, warehouse_id,
          quantity_m2, boxes_count, unit_cost, total_cost, reference_type,
          reference_id, notes, performed_by
        ) VALUES (?, ?, 'SALE', ?, ?, ?, ?, ROUND(?*100), ROUND(?*100), 'SPECIAL_STOCK_SALE', ?, ?, ?)
      `, [
        txId, sqliteDb.nextNumber('TX-SALE'), item.productId, dto.warehouseId,
        -item.quantityM2, -item.boxesCount, round2(item.unitCost), item.totalCost,
        item.id, `بيع مخزون مخفض ${item.specialNumber || ''} بموجب فاتورة ${invoiceNumber}`.trim(), actor.id
      ]);
      continue;
    }

    const stockUpdate = sqliteDb.query(
      `SELECT id FROM warehouse_stock WHERE product_id = ? AND warehouse_id = ?`,
      [item.productId, dto.warehouseId]
    )[0] as { id: string } | undefined;
    if (!stockUpdate) {
      throw new Error(`لا يوجد رصيد مخزني مسجل للصنف "${item.productName}" في المخزن المحدد.`);
    }

    sqliteDb.run(`
      UPDATE warehouse_stock
      SET quantity_m2 = quantity_m2 - ?, last_updated = CURRENT_TIMESTAMP
      WHERE product_id = ? AND warehouse_id = ?
    `, [item.quantityM2, item.productId, dto.warehouseId]);

    InventoryLocationStockService.release(sqliteDb, {
      warehouseId: dto.warehouseId,
      productId: item.productId,
      quantity: item.quantityM2,
      actorId: actor.id,
      reason: `بيع بموجب فاتورة ${invoiceNumber}`,
    });

    const txId = `tx_${uuidv4().substring(0, 8)}`;
    sqliteDb.run(`
      INSERT INTO inventory_transactions (
        id, transaction_number, type, product_id, warehouse_id,
        quantity_m2, boxes_count, unit_cost, total_cost, reference_type,
        reference_id, notes, performed_by
      ) VALUES (?, ?, 'SALE', ?, ?, ?, ?, ROUND(?*100), ROUND(?*100), 'INVOICE', ?, ?, ?)
    `, [
      txId, sqliteDb.nextNumber('TX-SALE'), item.productId, dto.warehouseId,
      -item.quantityM2, -item.boxesCount, round2(item.unitCost), item.totalCost,
      invoiceId, `بيع بموجب فاتورة ${invoiceNumber}`, actor.id
    ]);
    if (costingMethod === 'FIFO' && item.fifoPlan) InventoryCostingService.consumeFifo(sqliteDb, txId, item.fifoPlan, item.id);

    if (item.productType !== 'GENERAL') {
      const batchResult = new BatchService().deductFromBatches(item.productId, dto.warehouseId, item.quantityM2, { allowShortfall: allowNegativeStock });
      for (const allocation of batchResult.allocations) {
        sqliteDb.run(`
          INSERT INTO sales_invoice_batch_allocations (id, invoice_item_id, batch_id, quantity_m2)
          VALUES (?, ?, ?, ?)
        `, [`sba_${uuidv4().substring(0, 8)}`, item.id, allocation.batchId, allocation.quantityM2]);
      }
    }
  }
}
