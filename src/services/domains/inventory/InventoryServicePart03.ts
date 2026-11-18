import type { InventoryTransaction } from '../../../types';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { InventoryServicePart02 } from './InventoryServicePart02';

export class InventoryServicePart03 extends InventoryServicePart02 {
  private buildTransactionsQuery(limit: number, actor: NonNullable<ReturnType<typeof AuthService.requireAuth>>): { sql: string; params: any[] } {
    const scope = this.branchAccess.sqlScope(
      'w.branch_id',
      '(SELECT bw.branch_id FROM branch_warehouses bw WHERE bw.warehouse_id = w.id AND bw.is_primary = 1)',
      actor
    );
    const company = this.branchAccess.companyScope('w.company_id', actor);
    return {
      sql: `
      SELECT it.*, p.name as productName, p.sku as productSku,
             p.product_type as productType, p.base_unit as baseUnit, p.custom_unit as customUnit,
             w.name as warehouseName, u.full_name as performedByName
      FROM inventory_transactions it
      JOIN products p ON it.product_id = p.id
      JOIN warehouses w ON it.warehouse_id = w.id
      LEFT JOIN users u ON it.performed_by = u.id
      WHERE ${scope.clause} AND ${company.clause}
      ORDER BY it.created_at DESC
      LIMIT ?`,
      params: [...scope.params, ...company.params, limit],
    };
  }

  public getTransactions(limit = 100): InventoryTransaction[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.inventory.hub.view');
    const { sql, params } = this.buildTransactionsQuery(limit, actor);
    return this.db.query<InventoryTransaction>(sql, params);
  }

  public async getTransactionsAsync(limit = 100): Promise<InventoryTransaction[]> {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.inventory.hub.view');
    const { sql, params } = this.buildTransactionsQuery(limit, actor);
    return this.db.queryAsync<InventoryTransaction>(sql, params);
  }
}
