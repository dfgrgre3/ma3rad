import { DatabaseManager } from '../../../database/repositories/databaseManager';

export type WarehouseType =
  | 'MAIN_WAREHOUSE'
  | 'SHOWROOM'
  | 'BRANCH_WAREHOUSE'
  | 'TRANSIT_WAREHOUSE'
  | 'RETURNS_WAREHOUSE'
  | 'QUARANTINE_WAREHOUSE';

/**
 * Central rules derived from warehouse_type. A type stored in the database is
 * only useful if every service that moves stock honours it.
 */
export class WarehouseTypePolicy {
  static typeOf(db: DatabaseManager, warehouseId: string): WarehouseType | null {
    const row = db.query<{ type: WarehouseType }>(
      `SELECT warehouse_type AS type FROM warehouses WHERE id = ?`,
      [warehouseId],
    )[0];
    return row?.type ?? null;
  }

  static isSellable(type: WarehouseType | null): boolean {
    return type === 'MAIN_WAREHOUSE' || type === 'SHOWROOM' || type === 'BRANCH_WAREHOUSE';
  }

  static isPurchasable(type: WarehouseType | null): boolean {
    // Transit warehouses are filled only by transfers, never by purchases.
    return type !== 'TRANSIT_WAREHOUSE';
  }

  static isAdjustable(type: WarehouseType | null): boolean {
    return type !== 'TRANSIT_WAREHOUSE';
  }

  static isLocationManaged(type: WarehouseType | null): boolean {
    return type !== 'TRANSIT_WAREHOUSE';
  }

  static assertSellable(db: DatabaseManager, warehouseId: string, context = 'البيع'): void {
    const type = this.typeOf(db, warehouseId);
    if (!this.isSellable(type)) {
      throw new Error(`لا يمكن إجراء ${context} من مستودع من نوع ${type || 'غير محدد'} (انتقالي/حجر/مرتجعات).`);
    }
  }

  static assertPurchasable(db: DatabaseManager, warehouseId: string, context = 'الشراء'): void {
    const type = this.typeOf(db, warehouseId);
    if (!this.isPurchasable(type)) {
      throw new Error(`لا يمكن إجراء ${context} إلى مستودع انتقالي (TRANSIT_WAREHOUSE).`);
    }
  }

  static assertAdjustable(db: DatabaseManager, warehouseId: string, context = 'التسوية'): void {
    const type = this.typeOf(db, warehouseId);
    if (!this.isAdjustable(type)) {
      throw new Error(`لا يمكن إجراء ${context} على مستودع انتقالي.`);
    }
  }

  static assertLocationManaged(db: DatabaseManager, warehouseId: string): void {
    const type = this.typeOf(db, warehouseId);
    if (!this.isLocationManaged(type)) {
      throw new Error('لا يمكن إدارة مواقع/رفوف مستودع انتقالي.');
    }
  }
}
