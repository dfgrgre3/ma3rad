import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { v4 as uuidv4 } from 'uuid';
import { InventoryServicePart04 } from './InventoryServicePart04';

export class InventoryWarehouseLocationService extends InventoryServicePart04 {
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
    PermissionService.require(actor, 'ui.inventory.hub.adjust');

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

    return this.getWarehouseLocations(input.warehouseId).find((l: any) => l.id === id);
  }

  public updateWarehouseLocation(id: string, input: {
    zone?: string;
    aisle?: string;
    shelf?: string;
    bin?: string;
    barcode?: string;
    maxCapacityM2?: number;
    notes?: string;
  }): void {
    this.assertInventoryModuleEnabled();
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.inventory.hub.adjust');

    const existing = this.db.query<any>(`SELECT * FROM warehouse_locations WHERE id = ?`, [id])[0];
    if (!existing) throw new Error('الموقع غير موجود.');

    if (input.barcode && input.barcode !== existing.barcode) {
      const dup = this.db.query<any>(`SELECT id FROM warehouse_locations WHERE barcode = ? AND id != ?`, [input.barcode, id])[0];
      if (dup) throw new Error('الباركود مستخدم لموقع آخر.');
    }

    this.db.run(`
      UPDATE warehouse_locations
      SET zone = COALESCE(?, zone),
          aisle = COALESCE(?, aisle),
          shelf = COALESCE(?, shelf),
          bin = COALESCE(?, bin),
          barcode = COALESCE(?, barcode),
          max_capacity_m2 = COALESCE(?, max_capacity_m2),
          notes = COALESCE(?, notes)
      WHERE id = ?
    `, [
      input.zone?.toUpperCase() ?? null,
      input.aisle?.toUpperCase() ?? null,
      input.shelf?.toUpperCase() ?? null,
      input.bin?.toUpperCase() ?? null,
      input.barcode ?? null,
      input.maxCapacityM2 ?? null,
      input.notes ?? null,
      id
    ]);
  }

  public deleteWarehouseLocation(id: string): void {
    this.assertInventoryModuleEnabled();
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.inventory.hub.adjust');

    const occupied = this.db.query<any>(`SELECT SUM(quantity_m2) as qty FROM product_location_stock WHERE location_id = ?`, [id])[0];
    if (occupied && Number(occupied.qty || 0) > 0) {
      throw new Error('لا يمكن حذف موقع يحتوي على مخزون.');
    }
    this.db.run(`UPDATE warehouse_locations SET is_active = 0 WHERE id = ?`, [id]);
  }
}