import { DatabaseManager } from '../database/db';
import type { Warehouse, WarehouseStock, InventoryTransaction, InventoryTransactionType, UnitType } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { localDateString } from '../utils/date';
import { postLedgerEntry } from '../database/ledger';
import { InventoryCostingService } from './InventoryCostingService';
import { getProductUnitLabel } from '../utils/productUnits';
import { InventoryServicePart03 } from './InventoryServicePart03';

export class InventoryServicePart04 extends InventoryServicePart03 {
public getTransfersList(dateFrom?: string, dateTo?: string, warehouseId?: string): any[] {
    let sql = `
      SELECT 
        out_tx.transaction_number as transferNumber,
        out_tx.created_at as transferDate,
        out_tx.notes as transferNotes,
        p.name as productName,
        p.sku as productSku,
        p.product_type as productType, p.base_unit as baseUnit, p.custom_unit as customUnit,
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

public getTransferSummaryByWarehouse(): { warehouseId: string; warehouseName: string; unitLabel: string; totalIn: number; totalOut: number }[] {
    const rows = this.db.query<any>(`
      SELECT 
        w.id as warehouseId,
        w.name as warehouseName,
        p.product_type as productType, p.base_unit as baseUnit, p.custom_unit as customUnit,
        COALESCE(SUM(CASE WHEN it.type = 'TRANSFER_IN' THEN it.quantity_m2 ELSE 0 END), 0) as totalIn,
        COALESCE(SUM(CASE WHEN it.type = 'TRANSFER_OUT' THEN ABS(it.quantity_m2) ELSE 0 END), 0) as totalOut
      FROM warehouses w
      LEFT JOIN inventory_transactions it ON w.id = it.warehouse_id AND it.type IN ('TRANSFER_IN', 'TRANSFER_OUT')
      LEFT JOIN products p ON p.id = it.product_id
      WHERE w.is_active = 1
      GROUP BY w.id, w.name, p.product_type, p.base_unit, p.custom_unit
      ORDER BY w.name
    `);
    return rows.map((row) => ({
      ...row,
      unitLabel: row.productType ? getProductUnitLabel(row) : '',
    }));
  }

public getWarehouseLocations(warehouseId?: string, search?: string): any[] {
    let sql = `
      SELECT 
        wl.id, wl.warehouse_id as warehouseId, w.name as warehouseName,
        wl.zone, wl.aisle, wl.shelf, wl.bin, wl.barcode,
        wl.max_capacity_m2 as maxCapacityM2, wl.notes, wl.is_active as isActive,
        wl.created_at as createdAt,
        COALESCE((SELECT SUM(pls.quantity_m2) FROM product_location_stock pls
          JOIN products p ON p.id = pls.product_id
          WHERE pls.location_id = wl.id AND p.product_type != 'GENERAL'), 0) as currentOccupiedM2,
        COALESCE((SELECT COUNT(DISTINCT pls.product_id) FROM product_location_stock pls
          JOIN products p ON p.id = pls.product_id
          WHERE pls.location_id = wl.id AND pls.quantity_m2 > 0 AND p.product_type = 'GENERAL'), 0) as generalProductsCount,
        COALESCE((SELECT COUNT(DISTINCT pls.product_id) FROM product_location_stock pls WHERE pls.location_id = wl.id AND pls.quantity_m2 > 0), 0) as productsCount
      FROM warehouse_locations wl
      JOIN warehouses w ON wl.warehouse_id = w.id
      WHERE wl.is_active = 1
    `;
    const params: any[] = [];
    if (warehouseId) {
      sql += ` AND wl.warehouse_id = ?`;
      params.push(warehouseId);
    }
    if (search && search.trim()) {
      sql += ` AND (wl.zone LIKE ? OR wl.aisle LIKE ? OR wl.shelf LIKE ? OR wl.bin LIKE ? OR wl.barcode LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term, term);
    }
    sql += ` ORDER BY wl.zone ASC, wl.aisle ASC, wl.shelf ASC, wl.bin ASC`;
    return this.db.query<any>(sql, params);
  }

public createWarehouseLocation(input: {
    warehouseId: string;
    zone: string;
    aisle: string;
    shelf: string;
    bin: string;
    barcode?: string;
    maxCapacityM2?: number;
    notes?: string;
  }): any {
    this.assertInventoryModuleEnabled();
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'inventory.adjust');

    const wh = this.db.query<any>(`SELECT code FROM warehouses WHERE id = ?`, [input.warehouseId])[0];
    if (!wh) throw new Error('المخزن غير موجود.');

    const zone = input.zone.trim().toUpperCase();
    const aisle = input.aisle.trim().toUpperCase();
    const shelf = input.shelf.trim().toUpperCase();
    const bin = input.bin.trim().toUpperCase();
    const generatedBarcode = input.barcode?.trim() || `${wh.code}-${zone}-${aisle}-${shelf}-${bin}`;

    const existing = this.db.query<any>(`SELECT id FROM warehouse_locations WHERE barcode = ?`, [generatedBarcode])[0];
    if (existing) throw new Error(`الباركود ${generatedBarcode} مستخدم لموقع آخر بالفعل.`);

    const id = `loc_${uuidv4().substring(0, 8)}`;
    this.db.run(`
      INSERT INTO warehouse_locations (
        id, warehouse_id, zone, aisle, shelf, bin, barcode, max_capacity_m2, notes, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `, [
      id, input.warehouseId, zone, aisle, shelf, bin,
      generatedBarcode, input.maxCapacityM2 || 0, input.notes?.trim() || null
    ]);

    return this.getWarehouseLocations(input.warehouseId).find(l => l.id === id);
  }
}
