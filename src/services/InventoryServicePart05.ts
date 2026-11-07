import type { Warehouse, WarehouseStock, InventoryTransaction, InventoryTransactionType, UnitType } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { localDateString } from '../utils/date';
import { postLedgerEntry } from '../database/ledger';
import { InventoryCostingService } from './InventoryCostingService';
import { getProductUnitLabel } from '../utils/productUnits';
import { InventoryWarehouseLocationService } from './InventoryWarehouseLocationService';

export class InventoryServicePart05 extends InventoryWarehouseLocationService {
public assignProductLocation(locationId: string, productId: string, quantityM2: number): void {
    this.assertInventoryModuleEnabled();
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.inventory.hub.adjust');
    if (quantityM2 < 0) throw new Error('الكمية لا يمكن أن تكون سالبة.');

    const location = this.db.query<any>(`SELECT * FROM warehouse_locations WHERE id = ?`, [locationId])[0];
    if (!location) throw new Error('الموقع غير موجود.');

    const prod = this.db.query<any>(`SELECT name FROM products WHERE id = ?`, [productId])[0];
    if (!prod) throw new Error('المنتج غير موجود.');

    this.db.executeTransaction((txDb) => {
      const existing = txDb.query<any>(`SELECT id FROM product_location_stock WHERE location_id = ? AND product_id = ?`, [locationId, productId])[0];
      if (existing) {
        if (quantityM2 === 0) {
          txDb.run(`DELETE FROM product_location_stock WHERE id = ?`, [existing.id]);
        } else {
          txDb.run(`UPDATE product_location_stock SET quantity_m2 = ?, last_moved_at = CURRENT_TIMESTAMP WHERE id = ?`, [quantityM2, existing.id]);
        }
      } else if (quantityM2 > 0) {
        txDb.run(`
          INSERT INTO product_location_stock (id, location_id, product_id, quantity_m2)
          VALUES (?, ?, ?, ?)
        `, [`pls_${uuidv4().substring(0, 8)}`, locationId, productId, quantityM2]);
      }
    });
  }

public getLocationProducts(locationId: string): any[] {
    return this.db.query<any>(`
      SELECT 
        pls.id, pls.location_id as locationId, pls.product_id as productId,
        pls.quantity_m2 as quantityM2, pls.last_moved_at as lastMovedAt,
        p.name as productName, p.sku, p.barcode, p.grade, p.size,
        p.meters_per_box as metersPerBox, p.product_type as productType,
        p.base_unit as baseUnit, p.custom_unit as customUnit
      FROM product_location_stock pls
      JOIN products p ON pls.product_id = p.id
      WHERE pls.location_id = ? AND pls.quantity_m2 > 0
      ORDER BY p.name ASC
    `, [locationId]);
  }

public getSpecialStocks(filters: { warehouseId?: string; category?: string; status?: string; search?: string } = {}): any[] {
    let sql = `
      SELECT 
        iss.id, iss.special_number as specialNumber, iss.warehouse_id as warehouseId, w.name as warehouseName,
        iss.product_id as productId, p.name as productName, p.sku, p.grade, p.size,
        p.product_type as productType, p.base_unit as baseUnit, p.custom_unit as customUnit,
        iss.category, iss.quantity_m2 as quantityM2, iss.boxes_count as boxesCount,
        iss.unit_cost as unitCost, iss.total_cost as totalCost, iss.status,
        iss.source_type as sourceType, iss.source_id as sourceId,
        iss.inspection_notes as inspectionNotes, iss.inspected_at as inspectedAt,
        u_ins.full_name as inspectedByName,
        iss.resolution_notes as resolutionNotes, iss.resolved_at as resolvedAt,
        u_res.full_name as resolvedByName,
        u_cre.full_name as createdByName, iss.created_at as createdAt
      FROM inventory_special_stocks iss
      JOIN warehouses w ON iss.warehouse_id = w.id
      JOIN products p ON iss.product_id = p.id
      LEFT JOIN users u_ins ON iss.inspected_by = u_ins.id
      LEFT JOIN users u_res ON iss.resolved_by = u_res.id
      LEFT JOIN users u_cre ON iss.created_by = u_cre.id
      WHERE 1=1
    `;
    const params: any[] = [];
    if (filters.warehouseId) {
      sql += ` AND iss.warehouse_id = ?`;
      params.push(filters.warehouseId);
    }
    if (filters.category && filters.category !== 'ALL') {
      sql += ` AND iss.category = ?`;
      params.push(filters.category);
    }
    if (filters.status && filters.status !== 'ALL') {
      sql += ` AND iss.status = ?`;
      params.push(filters.status);
    }
    if (filters.search && filters.search.trim()) {
      sql += ` AND (p.name LIKE ? OR p.sku LIKE ? OR iss.special_number LIKE ?)`;
      const term = `%${filters.search.trim()}%`;
      params.push(term, term, term);
    }
    sql += ` ORDER BY iss.created_at DESC`;
    return this.db.query<any>(sql, params);
  }
}