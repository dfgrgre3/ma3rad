import { DatabaseManager } from '../database/db';
import type { Warehouse, WarehouseStock, InventoryTransaction, InventoryTransactionType } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { localDateString } from '../utils/date';
import { postLedgerEntry } from '../database/ledger';
import { InventoryCostingService } from './InventoryCostingService';

export class InventoryService {
  private db = DatabaseManager.getInstance();

  public getAllWarehouses(): Warehouse[] {
    return this.db.query<Warehouse>(`SELECT * FROM warehouses WHERE is_active = 1 ORDER BY is_default DESC, name ASC`);
  }

  public getWarehouseStock(warehouseId?: string, search?: string): (WarehouseStock & { productName: string; sku: string; barcode: string; grade: string; size: string; metersPerBox: number; costPrice: number; sellingPriceM2: number })[] {
    let sql = `
      SELECT 
        ws.id, ws.warehouse_id as warehouseId, ws.product_id as productId,
        ws.quantity_m2 as quantityM2, ws.reserved_m2 as reservedM2, ws.location_in_warehouse as locationInWarehouse,
        ws.last_updated as lastUpdated,
        w.name as warehouseName,
        p.name as productName, p.sku, p.barcode, p.grade, p.size,
        p.meters_per_box as metersPerBox, p.pieces_per_box as piecesPerBox,
        p.cost_price as costPrice, p.selling_price_m2 as sellingPriceM2
      FROM warehouse_stock ws
      JOIN warehouses w ON ws.warehouse_id = w.id
      JOIN products p ON ws.product_id = p.id
      WHERE p.is_active = 1
    `;
    const params: any[] = [];

    if (warehouseId) {
      sql += ` AND ws.warehouse_id = ?`;
      params.push(warehouseId);
    }

    if (search && search.trim()) {
      sql += ` AND (p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    sql += ` ORDER BY p.name ASC`;

    const rows = this.db.query<any>(sql, params);
    return rows.map(r => {
      const mPerBox = r.metersPerBox || 1.44;
      const boxes = Number((r.quantityM2 / mPerBox).toFixed(2));
      const pPerBox = r.piecesPerBox || 4;
      const pieces = Math.round(boxes * pPerBox);
      return {
        ...r,
        quantityBoxes: boxes,
        quantityPieces: pieces,
        availableM2: Number((r.quantityM2 - (r.reservedM2 || 0)).toFixed(2))
      };
    });
  }

  public getProductStock(productId: string, warehouseId: string): WarehouseStock | null {
    const rows = this.db.query<WarehouseStock>(`
      SELECT ws.*, p.meters_per_box as metersPerBox
      FROM warehouse_stock ws
      JOIN products p ON ws.product_id = p.id
      WHERE ws.product_id = ? AND ws.warehouse_id = ?
    `, [productId, warehouseId]);

    if (rows.length === 0) return null;
    const r = rows[0];
    const mPerBox = (r as any).metersPerBox || 1.44;
    return {
      ...r,
      quantityBoxes: Number((r.quantityM2 / mPerBox).toFixed(2)),
      availableM2: Number((r.quantityM2 - (r.reservedM2 || 0)).toFixed(2))
    };
  }

  public adjustStock(
    productId: string,
    warehouseId: string,
    actualQuantityM2: number,
    reason: string,
    performedBy = 'usr_admin'
  ): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'inventory.adjust');
    const performedBy2 = actor.id;
    const currentStock = this.getProductStock(productId, warehouseId);
    const currentM2 = currentStock ? currentStock.quantityM2 : 0;
    if (!Number.isFinite(actualQuantityM2) || actualQuantityM2 < 0 || actualQuantityM2 < Number(currentStock?.reservedM2 || 0)) {
      throw new Error('Adjusted stock cannot be negative or below the reserved quantity.');
    }
    const diffM2 = Number((actualQuantityM2 - currentM2).toFixed(3));

    if (diffM2 === 0) return;

    this.db.executeTransaction((sqliteDb) => {
      // 1. Fetch product cost and calculate FIFO plan BEFORE changing stock quantity
      const prod = sqliteDb.query(`SELECT cost_price, meters_per_box FROM products WHERE id = ?`, [productId])[0];
      const fifoEnabled = InventoryCostingService.costingMethod(sqliteDb) === 'FIFO';
      const costPlan = fifoEnabled && diffM2 < 0
        ? InventoryCostingService.planFifo(sqliteDb, productId, warehouseId, Math.abs(diffM2))
        : null;
      const unitCost = costPlan ? costPlan.unitCost : (prod ? (prod as any).costPrice : 0);
      const metersPerBox = prod ? (prod as any).metersPerBox : 1.44;
      const totalCost = Math.round(Math.abs(diffM2 * Number(unitCost || 0)) * 100) / 100;
      if (totalCost <= 0) throw new Error('Set a positive product cost before posting an inventory adjustment.');

      // 2. Ensure stock record exists and update quantity
      if (currentStock) {
        sqliteDb.run(`
          UPDATE warehouse_stock
          SET quantity_m2 = ?, last_updated = CURRENT_TIMESTAMP
          WHERE product_id = ? AND warehouse_id = ?
        `, [actualQuantityM2, productId, warehouseId]);
      } else {
        const stockId = `stk_${uuidv4().substring(0, 8)}`;
        sqliteDb.run(`
          INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2)
          VALUES (?, ?, ?, ?, 0)
        `, [stockId, warehouseId, productId, actualQuantityM2]);
      }

      // 3. Record Inventory Transaction
      const txType: InventoryTransactionType = diffM2 > 0 ? 'ADJUSTMENT_ADD' : 'ADJUSTMENT_SUB';
      const txId = `tx_${uuidv4().substring(0, 8)}`;
      const txNum = sqliteDb.nextNumber('TX-ADJ');

      sqliteDb.run(`
        INSERT INTO inventory_transactions (
          id, transaction_number, type, product_id, warehouse_id,
          quantity_m2, boxes_count, unit_cost, total_cost, reference_type,
          notes, performed_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ADJUSTMENT', ?, ?)
      `, [
        txId, txNum, txType, productId, warehouseId,
        diffM2,
        Number((diffM2 / metersPerBox).toFixed(2)),
        unitCost,
        Math.abs(diffM2 * unitCost),
        `تسوية جردية: ${reason} (من ${currentM2} م² إلى ${actualQuantityM2} م²)`,
        performedBy2
      ]);
      if (totalCost > 0) {
        postLedgerEntry(sqliteDb.getDatabase(), {
          date: localDateString(), description: `Inventory adjustment ${txNum}: ${reason}`,
          referenceType: 'INVENTORY_ADJUSTMENT', referenceId: txId, createdBy: actor.id,
          lines: diffM2 > 0
            ? [{ accountCode: '1104', debit: totalCost, credit: 0 }, { accountCode: '5201', debit: 0, credit: totalCost }]
            : [{ accountCode: '5201', debit: totalCost, credit: 0 }, { accountCode: '1104', debit: 0, credit: totalCost }],
        });
      }

      // 4. Audit Log
      sqliteDb.run(`
        INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, old_values, new_values)
        VALUES (?, ?, ?, 'تسوية رصيد مخزني', 'INVENTORY', ?, ?, ?)
      `, [
        `aud_${uuidv4().substring(0, 8)}`, performedBy2, productId,
        JSON.stringify({ currentM2 }),
        JSON.stringify({ actualQuantityM2, diffM2, reason })
      ]);
      if (costPlan) InventoryCostingService.consumeFifo(sqliteDb, txId, costPlan);
      else if (fifoEnabled && diffM2 > 0) InventoryCostingService.addLayer(sqliteDb, {
        productId, warehouseId, sourceTransactionId: txId, sourceType: 'INVENTORY_ADJUSTMENT',
        sourceId: txId, date: localDateString(), quantity: diffM2, unitCost,
      });
    });
  }

  public transferStock(
    fromWarehouseId: string,
    toWarehouseId: string,
    productId: string,
    quantityM2: number,
    notes = '',
    performedBy = 'usr_admin'
  ): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'inventory.transfer');
    const performedBy2 = actor.id;
    if (fromWarehouseId === toWarehouseId) {
      throw new Error('لا يمكن التحويل لنفس المخزن.');
    }
    if (quantityM2 <= 0) {
      throw new Error('يجب أن تكون كمية التحويل أكبر من الصفر.');
    }

    const fromStock = this.getProductStock(productId, fromWarehouseId);
    if (!fromStock || fromStock.availableM2 < quantityM2) {
      throw new Error(`الرصيد المتاح في مخزن المصدر غير كافٍ. المتاح: ${fromStock?.availableM2 || 0} م²`);
    }

    this.db.executeTransaction((sqliteDb) => {
      // 1. Calculate FIFO plan BEFORE changing any stock quantities
      const prod = sqliteDb.query(`SELECT cost_price, meters_per_box FROM products WHERE id = ?`, [productId])[0];
      const costPlan = InventoryCostingService.costingMethod(sqliteDb) === 'FIFO'
        ? InventoryCostingService.planFifo(sqliteDb, productId, fromWarehouseId, quantityM2)
        : null;
      const unitCost = costPlan ? costPlan.unitCost : (prod ? (prod as any).costPrice : 0);
      const metersPerBox = prod ? (prod as any).metersPerBox : 1.44;
      const boxes = Number((quantityM2 / metersPerBox).toFixed(2));
      const refOut = sqliteDb.nextNumber('TX-TRF-OUT');
      const refIn = sqliteDb.nextNumber('TX-TRF-IN');

      // 2. Decrease source warehouse
      sqliteDb.run(`
        UPDATE warehouse_stock 
        SET quantity_m2 = quantity_m2 - ?, last_updated = CURRENT_TIMESTAMP
        WHERE product_id = ? AND warehouse_id = ?
      `, [quantityM2, productId, fromWarehouseId]);

      // 3. Increase destination warehouse
      const toStock = this.getProductStock(productId, toWarehouseId);
      if (toStock) {
        sqliteDb.run(`
          UPDATE warehouse_stock 
          SET quantity_m2 = quantity_m2 + ?, last_updated = CURRENT_TIMESTAMP
          WHERE product_id = ? AND warehouse_id = ?
        `, [quantityM2, productId, toWarehouseId]);
      } else {
        const stockId = `stk_${uuidv4().substring(0, 8)}`;
        sqliteDb.run(`
          INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2)
          VALUES (?, ?, ?, ?, 0)
        `, [stockId, toWarehouseId, productId, quantityM2]);
      }

      // 4. Log 2 Inventory Transactions (Transfer OUT & Transfer IN)
      sqliteDb.run(`
        INSERT INTO inventory_transactions (
          id, transaction_number, type, product_id, warehouse_id,
          quantity_m2, boxes_count, unit_cost, total_cost, reference_type,
          notes, performed_by
        ) VALUES (?, ?, 'TRANSFER_OUT', ?, ?, ?, ?, ?, ?, 'TRANSFER', ?, ?)
      `, [
        `tx_${uuidv4().substring(0, 8)}`, refOut, productId, fromWarehouseId,
        -quantityM2, -boxes, unitCost, quantityM2 * unitCost,
        `تحويل مخزني صادر إلى ${toWarehouseId}. ${notes}`, performedBy2
      ]);

      sqliteDb.run(`
        INSERT INTO inventory_transactions (
          id, transaction_number, type, product_id, warehouse_id,
          quantity_m2, boxes_count, unit_cost, total_cost, reference_type,
          notes, performed_by
        ) VALUES (?, ?, 'TRANSFER_IN', ?, ?, ?, ?, ?, ?, 'TRANSFER', ?, ?)
      `, [
        `tx_${uuidv4().substring(0, 8)}`, refIn, productId, toWarehouseId,
        quantityM2, boxes, unitCost, quantityM2 * unitCost,
        `تحويل مخزني وارد من ${fromWarehouseId}. ${notes}`, performedBy2
      ]);

      // 5. Transfer cost layers using the pre-calculated plan
      if (costPlan) {
        for (const allocation of costPlan.allocations) {
          sqliteDb.run('UPDATE inventory_cost_layers SET quantity_remaining=MAX(0,quantity_remaining-?) WHERE id=?', [allocation.quantity, allocation.layerId]);
          InventoryCostingService.addLayer(sqliteDb, { productId, warehouseId: toWarehouseId, sourceTransactionId: refIn, sourceType: 'TRANSFER', sourceId: refIn,
            date: localDateString(), quantity: allocation.quantity, unitCost: allocation.unitCost });
        }
      }
    });
  }

  public getTransactions(limit = 100): InventoryTransaction[] {
    return this.db.query<InventoryTransaction>(`
      SELECT it.*, p.name as productName, p.sku as productSku, w.name as warehouseName, u.full_name as performedByName
      FROM inventory_transactions it
      JOIN products p ON it.product_id = p.id
      JOIN warehouses w ON it.warehouse_id = w.id
      LEFT JOIN users u ON it.performed_by = u.id
      ORDER BY it.created_at DESC
      LIMIT ?
    `, [limit]);
  }

  public getTransfersList(dateFrom?: string, dateTo?: string, warehouseId?: string): any[] {
    let sql = `
      SELECT 
        out_tx.transaction_number as transferNumber,
        out_tx.created_at as transferDate,
        out_tx.notes as transferNotes,
        p.name as productName,
        p.sku as productSku,
        w_out.name as fromWarehouse,
        w_in.name as toWarehouse,
        ABS(out_tx.quantity_m2) as quantityM2,
        ABS(out_tx.boxes_count) as boxesCount,
        out_tx.unit_cost as unitCost,
        out_tx.total_cost as totalCost,
        u.full_name as performedByName
      FROM inventory_transactions out_tx
      JOIN inventory_transactions in_tx 
        ON out_tx.reference_type = 'TRANSFER' 
        AND in_tx.reference_type = 'TRANSFER'
        AND out_tx.product_id = in_tx.product_id
        AND out_tx.notes LIKE '%' || in_tx.warehouse_id || '%'
      JOIN products p ON out_tx.product_id = p.id
      JOIN warehouses w_out ON out_tx.warehouse_id = w_out.id
      JOIN warehouses w_in ON in_tx.warehouse_id = w_in.id
      LEFT JOIN users u ON out_tx.performed_by = u.id
      WHERE out_tx.type = 'TRANSFER_OUT' AND in_tx.type = 'TRANSFER_IN'
    `;
    const params: any[] = [];

    if (dateFrom) {
      sql += ' AND out_tx.created_at >= ?';
      params.push(dateFrom);
    }
    if (dateTo) {
      sql += ' AND out_tx.created_at <= ?';
      params.push(dateTo + ' 23:59:59');
    }
    if (warehouseId) {
      sql += ' AND (out_tx.warehouse_id = ? OR in_tx.warehouse_id = ?)';
      params.push(warehouseId, warehouseId);
    }

    sql += ' ORDER BY out_tx.created_at DESC LIMIT 200';

    return this.db.query(sql, params);
  }

  public getTransferSummaryByWarehouse(): { warehouseId: string; warehouseName: string; totalIn: number; totalOut: number }[] {
    return this.db.query<any>(`
      SELECT 
        w.id as warehouseId,
        w.name as warehouseName,
        COALESCE(SUM(CASE WHEN it.type = 'TRANSFER_IN' THEN it.quantity_m2 ELSE 0 END), 0) as totalIn,
        COALESCE(SUM(CASE WHEN it.type = 'TRANSFER_OUT' THEN ABS(it.quantity_m2) ELSE 0 END), 0) as totalOut
      FROM warehouses w
      LEFT JOIN inventory_transactions it ON w.id = it.warehouse_id AND it.type IN ('TRANSFER_IN', 'TRANSFER_OUT')
      WHERE w.is_active = 1
      GROUP BY w.id, w.name
      ORDER BY w.name
    `);
  }
}
