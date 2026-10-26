import { DatabaseManager } from '../database/db';
import type { Warehouse, WarehouseStock, InventoryTransaction, InventoryTransactionType, UnitType } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { localDateString } from '../utils/date';
import { postLedgerEntry } from '../database/ledger';
import { InventoryCostingService } from './InventoryCostingService';
import { getProductUnitLabel } from '../utils/productUnits';

export class InventoryServicePart01 {
protected db = DatabaseManager.getInstance();

protected getUnitLabel(productId: string): string {
    const product = this.db.query<{ productType: 'CERAMIC' | 'GENERAL'; baseUnit: UnitType; customUnit: string }>(
      `SELECT product_type AS productType, base_unit AS baseUnit, custom_unit AS customUnit FROM products WHERE id = ?`,
      [productId],
    )[0];
    return product ? getProductUnitLabel(product) : 'م²';
  }

public getAllWarehouses(): Warehouse[] {
    return this.db.query<Warehouse>(`SELECT * FROM warehouses WHERE is_active = 1 ORDER BY is_default DESC, name ASC`);
  }

public getWarehouseStock(warehouseId?: string, search?: string): (WarehouseStock & { productName: string; sku: string; barcode: string; grade: string; size: string; metersPerBox: number; costPrice: number; sellingPriceM2: number; productType: 'CERAMIC' | 'GENERAL'; baseUnit: UnitType; customUnit: string })[] {
    let sql = `
      SELECT 
        ws.id, ws.warehouse_id as warehouseId, ws.product_id as productId,
        ws.quantity_m2 as quantityM2, ws.reserved_m2 as reservedM2, ws.location_in_warehouse as locationInWarehouse,
        ws.last_updated as lastUpdated,
        w.name as warehouseName,
        p.name as productName, p.sku, p.barcode, p.grade, p.size,
        p.product_type as productType, p.base_unit as baseUnit, p.custom_unit as customUnit,
        p.meters_per_box as metersPerBox, p.pieces_per_box as piecesPerBox,
        p.cost_price as costPrice, p.selling_price_m2 as sellingPriceM2,
        COALESCE(movement_totals.quantity_in, 0) AS quantityIn,
        COALESCE(movement_totals.quantity_out, 0) AS quantityOut
      FROM warehouse_stock ws
      JOIN warehouses w ON ws.warehouse_id = w.id
      JOIN products p ON ws.product_id = p.id
      LEFT JOIN (
        SELECT product_id, warehouse_id,
               SUM(CASE WHEN quantity_m2 > 0 THEN quantity_m2 ELSE 0 END) AS quantity_in,
               SUM(CASE WHEN quantity_m2 < 0 THEN ABS(quantity_m2) ELSE 0 END) AS quantity_out
        FROM inventory_transactions
        GROUP BY product_id, warehouse_id
      ) movement_totals ON movement_totals.product_id = ws.product_id
                       AND movement_totals.warehouse_id = ws.warehouse_id
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
      const isGeneral = r.productType === 'GENERAL';
      const mPerBox = r.metersPerBox || 1.44;
      const boxes = isGeneral
        ? r.baseUnit === 'BOX' ? r.quantityM2 : 0
        : Number((r.quantityM2 / mPerBox).toFixed(2));
      const pPerBox = r.piecesPerBox || 4;
      const pieces = isGeneral
        ? r.baseUnit === 'PIECE' ? r.quantityM2 : 0
        : Math.round(boxes * pPerBox);
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
      SELECT ws.*, p.meters_per_box as metersPerBox, p.product_type as productType, p.base_unit as baseUnit
      FROM warehouse_stock ws
      JOIN products p ON ws.product_id = p.id
      WHERE ws.product_id = ? AND ws.warehouse_id = ?
    `, [productId, warehouseId]);

    if (rows.length === 0) return null;
    const r = rows[0];
    if ((r as any).productType === 'GENERAL') {
      return {
        ...r,
        quantityBoxes: (r as any).baseUnit === 'BOX' ? r.quantityM2 : 0,
        quantityPieces: (r as any).baseUnit === 'PIECE' ? r.quantityM2 : 0,
        availableM2: Number((r.quantityM2 - (r.reservedM2 || 0)).toFixed(2)),
      };
    }
    const mPerBox = (r as any).metersPerBox || 1.44;
    return {
      ...r,
      quantityBoxes: Number((r.quantityM2 / mPerBox).toFixed(2)),
      availableM2: Number((r.quantityM2 - (r.reservedM2 || 0)).toFixed(2))
    };
  }
}
