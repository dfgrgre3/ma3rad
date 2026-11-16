import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { localDateString } from '../../../utils/shared/date';
import { round2 } from '../finance/financials';

export interface ProductGradeOption {
  id: string;
  productId: string;
  grade: string;
  size: string;
  color: string;
  tone: string;
  finish: string;
  surfaceLocation: string;
  thickness: number;
  quantity: number;
  warehouseId: string;
  minStockLevel: number;
  maxStockLevel: number;
  location: string;
  lastMovedAt: string;
}

export interface SlowMovingAnalysis {
  productId: string;
  productName: string;
  grade: string;
  size: string;
  color: string;
  daysSinceLastMovement: number;
  currentStock: number;
  minStockLevel: number;
  daysOverThreshold: number;
  totalValueAtCost: number;
  totalValueAtSale: number;
  status: 'ACTIVE' | 'SLOW_MOVING' | 'IDLE' | 'OBSOLETE';
}

export interface ProfitMarginAlert {
  productId: string;
  productName: string;
  grade: string;
  size: string;
  color: string;
  costPrice: number;
  salePrice: number;
  currentMargin: number;
  minMarginThreshold: number;
  alertLevel: 'CRITICAL' | 'WARNING' | 'OK';
  daysSinceLastSale: number;
}

export interface InventoryValuation {
  productId: string;
  productName: string;
  grade: string;
  size: string;
  color: string;
  warehouseId: string;
  quantity: number;
  costPrice: number;
  salePrice: number;
  totalCost: number;
  totalSaleValue: number;
  grossProfit: number;
  grossProfitMargin: number;
  daysSinceLastPurchase: number;
  daysSinceLastSale: number;
  status: 'ACTIVE' | 'LOW_STOCK' | 'OUT_OF_STOCK';
}

export class InventoryCostingPolicyService {
  private db = DatabaseManager.getInstance();

  private requirePermission(permission: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, permission, '/inventory');
  }

  public getCostingMethod(): 'FIFO' | 'AVERAGE_COST' {
    const row = this.db.query<{ value: string }>(
      `SELECT value FROM system_settings WHERE key='costingMethod'`
    )[0];
    return row?.value === 'FIFO' ? 'FIFO' : 'AVERAGE_COST';
  }

  public setCostingMethod(method: 'FIFO' | 'AVERAGE_COST', updatedBy: string): void {
    this.requirePermission('inventory.costing.method.set');
    this.db.run(
      `UPDATE system_settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key='costingMethod'`,
      [method]
    );
    this.db.run(
      `INSERT INTO inventory_costing_log (event_type, details, changed_by, changed_at)
       VALUES ('COSTING_METHOD_CHANGE', ?, CURRENT_TIMESTAMP, ?)`,
      [method, updatedBy]
    );
  }
}