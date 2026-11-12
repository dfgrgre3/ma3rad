import type { InventoryTransaction } from '../../../types';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { InventoryServicePart02 } from './InventoryServicePart02';

export class InventoryServicePart03 extends InventoryServicePart02 {
  public getTransactions(limit = 100): InventoryTransaction[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.inventory.hub.view');
    const scope = this.branchAccess.sqlScope(
      'w.branch_id',
      '(SELECT bw.branch_id FROM branch_warehouses bw WHERE bw.warehouse_id = w.id AND bw.is_primary = 1)',
      actor
    );
    const company = this.branchAccess.companyScope('w.company_id', actor);
    return this.db.query<InventoryTransaction>(`
      SELECT it.*, p.name as productName, p.sku as productSku,
             p.product_type as productType, p.base_unit as baseUnit, p.custom_unit as customUnit,
             w.name as warehouseName, u.full_name as performedByName
      FROM inventory_transactions it
      JOIN products p ON it.product_id = p.id
      JOIN warehouses w ON it.warehouse_id = w.id
      LEFT JOIN users u ON it.performed_by = u.id
      WHERE ${scope.clause} AND ${company.clause}
      ORDER BY it.created_at DESC
      LIMIT ?
    `, [...scope.params, ...company.params, limit]);
  }
}
