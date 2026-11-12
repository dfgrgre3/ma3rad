import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { v4 as uuidv4 } from 'uuid';
import { InventoryServicePart04 } from './InventoryServicePart04';
import { round2 } from '../finance/financials';
import { InventoryLocationStockService } from './InventoryLocationStockService';

export class InventoryWarehouseLocationService extends InventoryServicePart04 {
  public getWarehouseLocations(warehouseId?: string, search?: string): any[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.inventory.hub.view');
    if (warehouseId) this.branchAccess.requireWarehouseAuthorization(warehouseId, actor);
    const branchScope = this.branchAccess.warehouseBranchScope('w', undefined, actor);
    const companyScope = this.branchAccess.companyScope('w.company_id', actor);
    let sql = `
      SELECT 
        wl.id, wl.warehouse_id as warehouseId, w.name as warehouseName,
        wl.zone, wl.aisle, wl.shelf, wl.bin, wl.barcode,
        wl.max_capacity_m2 as maxCapacityM2, wl.notes, wl.is_active as isActive,
        wl.created_at as createdAt,
        COALESCE((SELECT SUM(CASE
          WHEN p.base_unit = 'M2' THEN pls.quantity_m2
          WHEN p.base_unit = 'BOX' AND p.meters_per_box > 0 THEN pls.quantity_m2 * p.meters_per_box
          WHEN p.base_unit = 'PIECE' AND p.meters_per_box > 0 AND p.pieces_per_box > 0
            THEN pls.quantity_m2 * p.meters_per_box / p.pieces_per_box
          ELSE 0 END)
          FROM product_location_stock pls
          JOIN products p ON p.id = pls.product_id
          WHERE pls.location_id = wl.id), 0) as currentOccupiedM2,
        COALESCE((SELECT COUNT(DISTINCT pls.product_id) FROM product_location_stock pls
          JOIN products p ON p.id = pls.product_id
          WHERE pls.location_id = wl.id AND pls.quantity_m2 > 0 AND p.product_type = 'GENERAL'), 0) as generalProductsCount,
        COALESCE((SELECT COUNT(DISTINCT pls.product_id) FROM product_location_stock pls WHERE pls.location_id = wl.id AND pls.quantity_m2 > 0), 0) as productsCount
      FROM warehouse_locations wl
      JOIN warehouses w ON wl.warehouse_id = w.id
      WHERE wl.is_active = 1 AND ${branchScope.clause} AND ${companyScope.clause}
    `;
    const params: any[] = [...branchScope.params, ...companyScope.params];
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

    const wh = this.db.query<any>(`SELECT code, company_id AS companyId FROM warehouses WHERE id = ?`, [input.warehouseId])[0];
    if (!wh) throw new Error('المخزن غير موجود.');
    this.branchAccess.requireWarehouseAuthorization(input.warehouseId, actor);
    if (wh.companyId) this.branchAccess.requireCompanyAccess(wh.companyId, actor);

    const zone = input.zone.trim().toUpperCase();
    const aisle = input.aisle.trim().toUpperCase();
    const shelf = input.shelf.trim().toUpperCase();
    const bin = input.bin.trim().toUpperCase();
    const generatedBarcode = input.barcode?.trim() || `${wh.code}-${zone}-${aisle}-${shelf}-${bin}`;

    if (input.maxCapacityM2 !== undefined && input.maxCapacityM2 !== null) {
      if (!Number.isFinite(input.maxCapacityM2) || input.maxCapacityM2 < 0) {
        throw new Error('السعة (m²) يجب أن تكون رقماً غير سالب.');
      }
    }
    const maxCapacity = input.maxCapacityM2 === undefined || input.maxCapacityM2 === null
      ? 0
      : Number(input.maxCapacityM2);

    const existing = this.db.query<any>(`SELECT id FROM warehouse_locations WHERE barcode = ?`, [generatedBarcode])[0];
    if (existing) throw new Error(`الباركود ${generatedBarcode} مستخدم لموقع آخر بالفعل.`);

    const id = `loc_${uuidv4().substring(0, 8)}`;
    this.db.run(`
      INSERT INTO warehouse_locations (
        id, warehouse_id, zone, aisle, shelf, bin, barcode, max_capacity_m2, notes, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `, [
      id, input.warehouseId, zone, aisle, shelf, bin,
      generatedBarcode, maxCapacity, input.notes?.trim() || null
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

    const existing = this.db.query<any>(`
      SELECT wl.*, w.company_id AS companyId FROM warehouse_locations wl
      JOIN warehouses w ON w.id = wl.warehouse_id WHERE wl.id = ?
    `, [id])[0];
    if (!existing) throw new Error('الموقع غير موجود.');
    this.branchAccess.requireWarehouseAuthorization(existing.warehouseId ?? existing.warehouse_id, actor);
    if (existing.companyId) this.branchAccess.requireCompanyAccess(existing.companyId, actor);

    if (input.barcode && input.barcode !== existing.barcode) {
      const dup = this.db.query<any>(`SELECT id FROM warehouse_locations WHERE barcode = ? AND id != ?`, [input.barcode, id])[0];
      if (dup) throw new Error('الباركود مستخدم لموقع آخر.');
    }

    if (input.maxCapacityM2 !== undefined && input.maxCapacityM2 !== null) {
      if (!Number.isFinite(input.maxCapacityM2) || input.maxCapacityM2 < 0) {
        throw new Error('السعة (m²) يجب أن تكون رقماً غير سالباً.');
      }
      const currentOccupied = this.getLocationOccupiedM2(id);
      if (input.maxCapacityM2 > 0 && currentOccupied > input.maxCapacityM2 + 0.009) {
        throw new Error(`لا يمكن تقليل سعة الموقع إلى أقل من الإشغال الحالي (${round2(currentOccupied)} m²).`);
      }
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

  private getLocationOccupiedM2(locationId: string): number {
    const row = this.db.query<any>(`
      SELECT COALESCE(SUM(CASE
        WHEN p.base_unit = 'M2' THEN pls.quantity_m2
        WHEN p.base_unit = 'BOX' AND p.meters_per_box > 0 THEN pls.quantity_m2 * p.meters_per_box
        WHEN p.base_unit = 'PIECE' AND p.meters_per_box > 0 AND p.pieces_per_box > 0
          THEN pls.quantity_m2 * p.meters_per_box / p.pieces_per_box
        ELSE 0 END), 0) AS occupied
      FROM product_location_stock pls
      JOIN products p ON p.id = pls.product_id
      WHERE pls.location_id = ?
    `, [locationId])[0];
    return Number(row?.occupied || 0);
  }

  public transferStockBetweenLocations(input: {
    warehouseId: string;
    productId: string;
    fromLocationId: string;
    toLocationId: string;
    quantityM2: number;
    reason?: string;
    notes?: string;
  }): void {
    this.assertInventoryModuleEnabled();
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.inventory.hub.adjust');
    if (input.fromLocationId === input.toLocationId) {
      throw new Error('يجب اختيار رفّين مختلفين للنقل.');
    }
    const fromLoc = this.db.query<any>(`
      SELECT wl.id, wl.warehouse_id AS warehouseId, wl.is_active AS isActive, w.company_id AS companyId
      FROM warehouse_locations wl JOIN warehouses w ON w.id = wl.warehouse_id
      WHERE wl.id = ?
    `, [input.fromLocationId])[0];
    const toLoc = this.db.query<any>(`
      SELECT wl.id, wl.warehouse_id AS warehouseId, wl.is_active AS isActive, wl.max_capacity_m2 AS maxCapacity,
        w.company_id AS companyId
      FROM warehouse_locations wl JOIN warehouses w ON w.id = wl.warehouse_id
      WHERE wl.id = ?
    `, [input.toLocationId])[0];
    if (!fromLoc || !toLoc) throw new Error('أحد الرفّين غير موجود.');
    if (fromLoc.warehouseId !== input.warehouseId || toLoc.warehouseId !== input.warehouseId) {
      throw new Error('يجب أن ينتمي الرفان إلى نفس المستودع.');
    }
    this.branchAccess.requireWarehouseAuthorization(input.warehouseId, actor);
    if (fromLoc.companyId) this.branchAccess.requireCompanyAccess(fromLoc.companyId, actor);
    if (toLoc.companyId) this.branchAccess.requireCompanyAccess(toLoc.companyId, actor);
    if (!fromLoc.isActive || !toLoc.isActive) throw new Error('لا يمكن النقل من/إلى رف غير نشط.');

    const qty = Number(input.quantityM2);
    if (!Number.isFinite(qty) || qty <= 0) throw new Error('كمية النقل يجب أن تكون أكبر من صفر.');

    const occupied = this.getLocationOccupiedM2(input.toLocationId);
    const maxCapacity = Number(toLoc.maxCapacity || 0);
    if (maxCapacity > 0 && occupied + qty > maxCapacity + 0.009) {
      throw new Error(`سعة الرف الوجهة غير كافية (المشغول ${round2(occupied)} m² من ${maxCapacity} m²).`);
    }

    this.db.executeTransaction((txDb) => {
      InventoryLocationStockService.transferBetweenBins(txDb, {
        warehouseId: input.warehouseId,
        productId: input.productId,
        fromLocationId: input.fromLocationId,
        toLocationId: input.toLocationId,
        quantity: qty,
        actorId: actor.id,
        reason: input.reason || 'نقل بين رفّين (Bin-to-Bin)',
      });
    });
  }
  public deleteWarehouseLocation(id: string): void {
    this.assertInventoryModuleEnabled();
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.inventory.hub.adjust');

    const location = this.db.query<any>(`
      SELECT wl.warehouse_id AS warehouseId, w.company_id AS companyId
      FROM warehouse_locations wl JOIN warehouses w ON w.id = wl.warehouse_id
      WHERE wl.id = ?
    `, [id])[0];
    if (!location) throw new Error('الموقع غير موجود.');
    this.branchAccess.requireWarehouseAuthorization(location.warehouseId, actor);
    if (location.companyId) this.branchAccess.requireCompanyAccess(location.companyId, actor);

    const occupied = this.db.query<any>(`SELECT SUM(quantity_m2) as qty FROM product_location_stock WHERE location_id = ?`, [id])[0];
    if (occupied && Number(occupied.qty || 0) > 0) {
      throw new Error('لا يمكن حذف موقع يحتوي على مخزون.');
    }
    this.db.run(`UPDATE warehouse_locations SET is_active = 0 WHERE id = ?`, [id]);
  }
}