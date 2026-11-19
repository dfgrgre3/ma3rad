import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../../auth/AuthService';
import { PermissionService } from '../../auth/PermissionService';
import { unscaleMoneyRow } from '../../../../utils/money';
import { PROJECT_PRODUCT_MONEY_FIELDS, type ProjectProduct } from './types';
import { UnitsLayer } from './units';

/** Project products (materials planned/delivered per project unit). */
export class ProductsLayer extends UnitsLayer {
  public getProjectProducts(projectId: string): ProjectProduct[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.projects.list.view');
    this.requireProject(projectId);
    return this.db.query<ProjectProduct>(
      `SELECT pp.*, u.name AS unit_name FROM project_products pp
       LEFT JOIN project_units u ON u.id = pp.unit_id
       WHERE pp.project_id = ? ORDER BY pp.created_at`,
      [projectId]
    ).map((row) => unscaleMoneyRow(row, PROJECT_PRODUCT_MONEY_FIELDS));
  }

  public addProjectProduct(input: {
    projectId: string; unitId?: string; productId: string; plannedQuantityM2: number;
    agreedPriceM2?: number; notes?: string;
  }): ProjectProduct {
    this.requireWrite('ui.projects.list.update');
    this.requireProject(input.projectId);
    const product = this.db.query<{ name: string }>(`SELECT name FROM products WHERE id = ?`, [input.productId])[0];
    if (!product) throw new Error('المنتج غير موجود.');
    if (!(input.plannedQuantityM2 > 0)) throw new Error('الكمية المخططة يجب أن تكون أكبر من صفر.');
    if (input.unitId) {
      const unit = this.db.query<{ projectId: string }>(
        `SELECT project_id AS projectId FROM project_units WHERE id = ?`,
        [input.unitId]
      )[0];
      if (!unit || unit.projectId !== input.projectId) {
        throw new Error('الوحدة المحددة لا تتبع المشروع.');
      }
    }

    const id = `pp_${uuidv4().substring(0, 8)}`;
    this.db.run(
      `INSERT INTO project_products (id, project_id, unit_id, product_id, product_name, planned_quantity_m2, agreed_price_m2, notes)
       VALUES (?, ?, ?, ?, ?, ?, ROUND(?*100), ?)`,
      [
        id, input.projectId, input.unitId || null, input.productId, product.name,
        input.plannedQuantityM2, input.agreedPriceM2 || 0, input.notes || null,
      ]
    );
    this.db.run(
      `UPDATE projects SET total_sold = (
        SELECT COALESCE(SUM(planned_quantity_m2 * agreed_price_m2), 0) FROM project_products WHERE project_id = ?
      ), updated_at = ? WHERE id = ?`,
      [input.projectId, new Date().toISOString(), input.projectId]
    );
    return unscaleMoneyRow(this.db.query<ProjectProduct>(`SELECT * FROM project_products WHERE id = ?`, [id])[0], PROJECT_PRODUCT_MONEY_FIELDS);
  }

  public updateProjectProduct(id: string, patch: { deliveredQuantityM2?: number; agreedPriceM2?: number; notes?: string }): void {
    this.requireWrite('ui.projects.list.update');
    const existing = unscaleMoneyRow(this.db.query<ProjectProduct>(`SELECT * FROM project_products WHERE id = ?`, [id])[0], PROJECT_PRODUCT_MONEY_FIELDS);
    if (!existing) throw new Error('بند المشروع غير موجود.');
    this.requireProject(existing.projectId);
    this.db.run(
      `UPDATE project_products SET
        delivered_quantity_m2 = COALESCE(?, delivered_quantity_m2),
        agreed_price_m2 = COALESCE(ROUND(?*100), agreed_price_m2),
        notes = COALESCE(?, notes) WHERE id = ?`,
      [patch.deliveredQuantityM2 ?? null, patch.agreedPriceM2 ?? null, patch.notes ?? null, id]
    );
    this.db.run(
      `UPDATE projects SET total_sold = (
        SELECT COALESCE(SUM(planned_quantity_m2 * agreed_price_m2), 0) FROM project_products WHERE project_id = ?
      ), updated_at = ? WHERE id = ?`,
      [existing.projectId, new Date().toISOString(), existing.projectId]
    );
  }

  public deleteProjectProduct(id: string): void {
    this.requireWrite('ui.projects.list.update');
    const existing = unscaleMoneyRow(this.db.query<ProjectProduct>(`SELECT * FROM project_products WHERE id = ?`, [id])[0], PROJECT_PRODUCT_MONEY_FIELDS);
    if (!existing) return;
    this.requireProject(existing.projectId);
    this.db.run(`DELETE FROM project_products WHERE id = ?`, [id]);
    this.db.run(
      `UPDATE projects SET total_sold = (
        SELECT COALESCE(SUM(planned_quantity_m2 * agreed_price_m2), 0) FROM project_products WHERE project_id = ?
      ), updated_at = ? WHERE id = ?`,
      [existing.projectId, new Date().toISOString(), existing.projectId]
    );
  }
}
