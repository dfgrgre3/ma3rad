import type { Warehouse, WarehouseStock, InventoryTransaction, InventoryTransactionType, UnitType } from '../../../types';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { localDateString } from '../../../utils/shared/date';
import { postLedgerEntry } from '../../../database/repositories/ledger';
import { InventoryCostingService } from './InventoryCostingService';
import { getProductUnitLabel } from '../../../utils/products/productUnits';
import { baseQuantityAsM2 } from '../../../utils/products/uom';
import { InventoryWarehouseLocationService } from './InventoryWarehouseLocationService';

export class InventoryServicePart05 extends InventoryWarehouseLocationService {
public assignProductLocation(locationId: string, productId: string, quantityM2: number): void {
    this.assertInventoryModuleEnabled();
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.inventory.hub.adjust');
    if (!Number.isFinite(quantityM2) || quantityM2 < 0) throw new Error('الكمية يجب أن تكون رقماً غير سالب.');

    const location = this.db.query<any>(`
      SELECT wl.*, w.company_id AS companyId FROM warehouse_locations wl
      JOIN warehouses w ON w.id = wl.warehouse_id WHERE wl.id = ?
    `, [locationId])[0];
    if (!location) throw new Error('الموقع غير موجود.');
    if (Number(location.isActive ?? location.is_active) !== 1) throw new Error('لا يمكن تخصيص مخزون إلى موقع غير نشط.');
    this.branchAccess.requireWarehouseAuthorization(location.warehouseId ?? location.warehouse_id, actor);
    if (location.companyId) this.branchAccess.requireCompanyAccess(location.companyId, actor);

    const prod = this.db.query<any>(`
      SELECT name, product_type AS productType, base_unit AS baseUnit, custom_unit AS customUnit,
        meters_per_box AS metersPerBox, pieces_per_box AS piecesPerBox
      FROM products WHERE id = ?
    `, [productId])[0];
    if (!prod) throw new Error('المنتج غير موجود.');

    this.db.executeTransaction((txDb) => {
      const current = txDb.query<{ id: string; quantityM2: number }>(`
        SELECT id, quantity_m2 AS quantityM2
        FROM product_location_stock WHERE location_id = ? AND product_id = ?
      `, [locationId, productId])[0];
      const previousQuantity = Number(current?.quantityM2 || 0);
      const allocatedElsewhere = Number(txDb.query<{ quantity: number }>(`
        SELECT COALESCE(SUM(pls.quantity_m2), 0) AS quantity
        FROM product_location_stock pls
        JOIN warehouse_locations wl ON wl.id = pls.location_id
        WHERE pls.product_id = ? AND wl.warehouse_id = ? AND wl.id != ?
      `, [productId, location.warehouseId ?? location.warehouse_id, locationId])[0]?.quantity || 0);
      const warehouseStock = Number(txDb.query<{ quantity: number }>(`
        SELECT COALESCE(quantity_m2, 0) AS quantity
        FROM warehouse_stock WHERE product_id = ? AND warehouse_id = ?
      `, [productId, location.warehouseId ?? location.warehouse_id])[0]?.quantity || 0);
      if (quantityM2 > previousQuantity && allocatedElsewhere + quantityM2 > warehouseStock + 0.001) {
        throw new Error(`إجمالي الكمية المسكنة سيتجاوز رصيد المستودع (${warehouseStock}).`);
      }

      const maxCapacityM2 = Number(location.maxCapacityM2 ?? location.max_capacity_m2 ?? 0);
      if (maxCapacityM2 > 0 && quantityM2 > previousQuantity) {
        const otherLocationItems = txDb.query<any>(`
          SELECT pls.quantity_m2 AS quantityM2, p.product_type AS productType,
            p.base_unit AS baseUnit, p.custom_unit AS customUnit,
            p.meters_per_box AS metersPerBox, p.pieces_per_box AS piecesPerBox
          FROM product_location_stock pls
          JOIN products p ON p.id = pls.product_id
          WHERE pls.location_id = ? AND pls.product_id != ? AND pls.quantity_m2 > 0
        `, [locationId, productId]);
        const otherOccupiedM2 = otherLocationItems.reduce((sum: number, storedProduct: any) => {
          const areaM2 = baseQuantityAsM2(Number(storedProduct.quantityM2), storedProduct);
          if (areaM2 <= 0) throw new Error('لا يمكن التحقق من سعة الموقع لوجود صنف غير قابل للتحويل إلى م².');
          return sum + areaM2;
        }, 0);
        const productOccupiedM2 = baseQuantityAsM2(quantityM2, prod);
        if (quantityM2 > 0 && productOccupiedM2 <= 0) {
          throw new Error('لا يمكن التحقق من سعة الموقع لهذا الصنف لعدم توفر معامل تحويل إلى م².');
        }
        if (quantityM2 > previousQuantity && otherOccupiedM2 + productOccupiedM2 > maxCapacityM2 + 0.001) {
          throw new Error(`الكمية تتجاوز سعة الموقع البالغة ${maxCapacityM2} م².`);
        }
      }

      const delta = Number((quantityM2 - previousQuantity).toFixed(3));
      if (Math.abs(delta) <= 0.001) return;

      if (current) {
        if (quantityM2 === 0) {
          txDb.run(`DELETE FROM product_location_stock WHERE id = ?`, [current!.id]);
        } else {
          txDb.run(`UPDATE product_location_stock SET quantity_m2 = ?, last_moved_at = CURRENT_TIMESTAMP WHERE id = ?`, [quantityM2, current!.id]);
        }
      } else if (quantityM2 > 0) {
        txDb.run(`
          INSERT INTO product_location_stock (id, location_id, product_id, quantity_m2)
          VALUES (?, ?, ?, ?)
        `, [`pls_${uuidv4().substring(0, 8)}`, locationId, productId, quantityM2]);
      }

      const movementType = delta > 0 ? 'ASSIGN' : 'RELEASE';
      txDb.run(`
        INSERT INTO warehouse_location_movements (
          id, warehouse_id, product_id, from_location_id, to_location_id,
          movement_type, quantity_m2, location_quantity_before, location_quantity_after, performed_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        `wlm_${uuidv4().substring(0, 8)}`, location.warehouseId ?? location.warehouse_id,
        productId, delta < 0 ? locationId : null, delta > 0 ? locationId : null,
        movementType, Math.abs(delta), previousQuantity, quantityM2, actor.id,
      ]);
    });
  }

public getLocationProducts(locationId: string): any[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.inventory.hub.view');
    const branchScope = this.branchAccess.warehouseBranchScope('w', undefined, actor);
    const companyScope = this.branchAccess.companyScope('w.company_id', actor);
    const location = this.db.query<any>(`
      SELECT wl.id FROM warehouse_locations wl
      JOIN warehouses w ON w.id = wl.warehouse_id
      WHERE wl.id = ? AND ${branchScope.clause} AND ${companyScope.clause}
    `, [locationId, ...branchScope.params, ...companyScope.params])[0];
    if (!location) throw new Error('الموقع غير موجود.');
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
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.inventory.hub.view');
    if (filters.warehouseId) this.branchAccess.requireWarehouseAuthorization(filters.warehouseId, actor);
    const branchScope = this.branchAccess.warehouseBranchScope('w', undefined, actor);
    const companyScope = this.branchAccess.companyScope('w.company_id', actor);
    let sql = `
      SELECT 
        iss.id, iss.special_number as specialNumber, iss.warehouse_id as warehouseId, w.name as warehouseName,
        iss.product_id as productId, p.name as productName, p.sku, p.grade, p.size,
        p.product_type as productType, p.base_unit as baseUnit, p.custom_unit as customUnit,
        iss.category, iss.quantity_m2 as quantityM2, iss.boxes_count as boxesCount,
        iss.remaining_quantity_m2 as remainingQuantityM2,
        iss.discounted_unit_price as discountedUnitPrice,
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
      WHERE ${branchScope.clause} AND ${companyScope.clause}
    `;
    const params: any[] = [...branchScope.params, ...companyScope.params];
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