import { DatabaseManager } from '../../../database/repositories/databaseManager';
import type { Warehouse, WarehouseStock, UnitType } from '../../../types';
import { AuthService } from '../auth/AuthService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { maskCostFields } from '../auth/sensitiveFields';
import { getProductUnitLabel } from '../../../utils/products/productUnits';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import { StockLedgerMovementPolicy } from './StockLedgerMovementPolicy';

type WarehouseStockView = WarehouseStock & {
  productName: string;
  sku: string;
  barcode: string;
  grade: string;
  size: string;
  metersPerBox: number;
  costPrice: number;
  sellingPriceM2: number;
  productType: 'CERAMIC' | 'GENERAL';
  baseUnit: UnitType;
  customUnit: string;
  minStockLevel: number;
};

export class InventoryServicePart01 {
protected db = DatabaseManager.getInstance();
protected branchAccess = new BranchAccessService();

/** Service-layer guard: a deactivated inventory module must not accept new stock movements. */
protected assertInventoryModuleEnabled(): void {
  ModuleRegistryService.assertModuleEnabled('inventory');
}

protected getUnitLabel(productId: string): string {
    const product = this.db.query<{ productType: 'CERAMIC' | 'GENERAL'; baseUnit: UnitType; customUnit: string }>(
      `SELECT product_type AS productType, base_unit AS baseUnit, custom_unit AS customUnit FROM products WHERE id = ?`,
      [productId],
    )[0];
    return product ? getProductUnitLabel(product) : 'م²';
  }

public getAllWarehouses(): Warehouse[] {
      AuthService.requireAuth();
      const { sql, params } = this.buildWarehousesQuery();
      return this.db.query<Warehouse>(sql, params);
  }

  private buildWarehousesQuery(): { sql: string; params: any[] } {
      const scope = this.branchAccess.sqlScope(
        'w.branch_id',
        '(SELECT bw.branch_id FROM branch_warehouses bw WHERE bw.warehouse_id = w.id AND bw.is_primary = 1)'
      );
      const company = this.branchAccess.companyScope('w.company_id');
      return {
        sql: `SELECT w.* FROM warehouses w WHERE w.is_active = 1 AND ${scope.clause} AND ${company.clause}
         ORDER BY w.is_default DESC, w.name ASC`,
        params: [...scope.params, ...company.params],
      };
  }

  public async getAllWarehousesAsync(): Promise<Warehouse[]> {
      AuthService.requireAuth();
      const { sql, params } = this.buildWarehousesQuery();
      return this.db.queryAsync<Warehouse>(sql, params);
  }

public getWarehouseStock(warehouseId?: string, search?: string): WarehouseStockView[] {
    return this.queryWarehouseStock(warehouseId, search, 'active');
  }

public getInactiveWarehouseStock(warehouseId?: string, search?: string): WarehouseStockView[] {
    return this.queryWarehouseStock(warehouseId, search, 'inactive');
  }

  public getWarehouseStockAsync(warehouseId?: string, search?: string): Promise<WarehouseStockView[]> {
    return this.queryWarehouseStockAsync(warehouseId, search, 'active');
  }

  public getInactiveWarehouseStockAsync(warehouseId?: string, search?: string): Promise<WarehouseStockView[]> {
    return this.queryWarehouseStockAsync(warehouseId, search, 'inactive');
  }

private buildWarehouseStockQuery(warehouseId: string | undefined, search: string | undefined, productStatus: 'active' | 'inactive'): { sql: string; params: any[] } {
    const scope = this.branchAccess.sqlScope(
      'w.branch_id',
      '(SELECT bw.branch_id FROM branch_warehouses bw WHERE bw.warehouse_id = w.id AND bw.is_primary = 1)'
    );
    const company = this.branchAccess.companyScope('w.company_id');
    let sql = `
      SELECT 
        ws.id, ws.warehouse_id as warehouseId, ws.product_id as productId,
        ws.quantity_m2 as quantityM2, ws.reserved_m2 as reservedM2, ws.location_in_warehouse as locationInWarehouse,
        ws.last_updated as lastUpdated,
        w.name as warehouseName,
        p.name as productName, p.sku, p.barcode, p.grade, p.size,
        p.product_type as productType, p.base_unit as baseUnit, p.custom_unit as customUnit,
        p.meters_per_box as metersPerBox, p.pieces_per_box as piecesPerBox,
        p.cost_price / 100.0 as costPrice, p.selling_price_m2 / 100.0 as sellingPriceM2,
        COALESCE(p.min_stock_level, 0) as minStockLevel,
        COALESCE(movement_totals.quantity_in, 0) AS quantityIn,
        COALESCE(movement_totals.quantity_out, 0) AS quantityOut
      FROM warehouse_stock ws
      JOIN warehouses w ON ws.warehouse_id = w.id
      JOIN products p ON ws.product_id = p.id
      LEFT JOIN (
        SELECT it.product_id, it.warehouse_id,
               SUM(${StockLedgerMovementPolicy.qtyInSql}) AS quantity_in,
               SUM(${StockLedgerMovementPolicy.totalOutSql}) AS quantity_out
        FROM inventory_transactions it
        GROUP BY it.product_id, it.warehouse_id
      ) movement_totals ON movement_totals.product_id = ws.product_id
                       AND movement_totals.warehouse_id = ws.warehouse_id
      WHERE ${productStatus === 'inactive' ? 'p.is_active = 0 AND COALESCE(ws.quantity_m2, 0) != 0' : 'p.is_active = 1'}
        AND ${scope.clause} AND ${company.clause}
    `;
    const params: any[] = [...scope.params, ...company.params];

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
    return { sql, params };
  }

  private mapWarehouseStockRows(rows: any[]): WarehouseStockView[] {
    return rows.map(r => {
      maskCostFields(r, ['costPrice']);
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

  private queryWarehouseStock(warehouseId: string | undefined, search: string | undefined, productStatus: 'active' | 'inactive'): WarehouseStockView[] {
    AuthService.requireAuth();
    if (warehouseId) this.branchAccess.requireWarehouseAccess(warehouseId);
    const { sql, params } = this.buildWarehouseStockQuery(warehouseId, search, productStatus);
    return this.mapWarehouseStockRows(this.db.query<any>(sql, params));
  }

  private async queryWarehouseStockAsync(warehouseId: string | undefined, search: string | undefined, productStatus: 'active' | 'inactive'): Promise<WarehouseStockView[]> {
    AuthService.requireAuth();
    if (warehouseId) this.branchAccess.requireWarehouseAccess(warehouseId);
    const { sql, params } = this.buildWarehouseStockQuery(warehouseId, search, productStatus);
    return this.mapWarehouseStockRows(await this.db.queryAsync<any>(sql, params));
  }

private buildProductStockQuery(productId: string, warehouseId: string): { sql: string; params: any[] } {
    return {
      sql: `
      SELECT ws.*, p.meters_per_box as metersPerBox, p.product_type as productType, p.base_unit as baseUnit
      FROM warehouse_stock ws
      JOIN products p ON ws.product_id = p.id
      WHERE ws.product_id = ? AND ws.warehouse_id = ?
    `,
      params: [productId, warehouseId],
    };
  }

  private mapProductStockRow(r: WarehouseStock & { metersPerBox?: number; productType?: string; baseUnit?: UnitType }): WarehouseStock {
    if (r.productType === 'GENERAL') {
      return {
        ...r,
        quantityBoxes: (r as any).baseUnit === 'BOX' ? r.quantityM2 : 0,
        quantityPieces: (r as any).baseUnit === 'PIECE' ? r.quantityM2 : 0,
        availableM2: Number((r.quantityM2 - (r.reservedM2 || 0)).toFixed(2)),
      } as WarehouseStock;
    }
    const mPerBox = (r as any).metersPerBox || 1.44;
    return {
      ...r,
      quantityBoxes: Number((r.quantityM2 / mPerBox).toFixed(2)),
      availableM2: Number((r.quantityM2 - (r.reservedM2 || 0)).toFixed(2))
    } as WarehouseStock;
  }

public getProductStock(productId: string, warehouseId: string): WarehouseStock | null {
    AuthService.requireAuth();
    this.branchAccess.requireWarehouseAccess(warehouseId);
    const { sql, params } = this.buildProductStockQuery(productId, warehouseId);
    const rows = this.db.query<any>(sql, params);

    if (rows.length === 0) return null;
    return this.mapProductStockRow(rows[0]);
  }

  public async getProductStockAsync(productId: string, warehouseId: string): Promise<WarehouseStock | null> {
    AuthService.requireAuth();
    this.branchAccess.requireWarehouseAccess(warehouseId);
    const { sql, params } = this.buildProductStockQuery(productId, warehouseId);
    const rows = await this.db.queryAsync<any>(sql, params);

    if (rows.length === 0) return null;
    return this.mapProductStockRow(rows[0]);
  }
}
