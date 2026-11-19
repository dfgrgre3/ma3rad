import { v4 as uuidv4 } from 'uuid';
import type { ManufacturingContext } from './context';
import type { BillOfMaterials, BomCostEstimate, BomItem, BomStockAlert, CreateBomDTO } from './types';

/** Bill-of-materials queries. Extracted verbatim from ManufacturingService. */
export class BomsModule {
  private readonly ctx: ManufacturingContext;
  constructor(ctx: ManufacturingContext) { this.ctx = ctx; }

  public getBoms(productId?: string): BillOfMaterials[] {
    this.ctx.require('manufacturing.view');
    const conditions: string[] = [];
    const params: Array<string> = [];
    if (productId) {
      conditions.push('b.product_id = ?');
      params.push(productId);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const boms = this.ctx.db.query<BillOfMaterials>(
      `SELECT b.*, p.name AS product_name
       FROM bills_of_materials b
       JOIN products p ON p.id = b.product_id
       ${where}
       ORDER BY b.created_at DESC`,
      params
    );
    const withItems = boms.map((bom) => ({
      ...bom,
      items: this.ctx.db.query<BomItem>(
        `SELECT i.*, p.name AS component_name
         FROM bom_items i
         LEFT JOIN products p ON p.id = i.component_product_id
         WHERE i.bom_id = ?
         ORDER BY i.created_at`,
        [bom.id]
      ),
    }));
    return this.attachEstimatedCosts(withItems);
  }

  /** Estimated material cost per BOM unit: Σ item qty × component cost_price. */
  private attachEstimatedCosts(boms: BillOfMaterials[]): BillOfMaterials[] {
    const componentIds = [...new Set(boms.flatMap((bom) => bom.items.map((item) => item.componentProductId)))];
    if (componentIds.length === 0) return boms;
    const placeholders = componentIds.map(() => '?').join(',');
    const costs = new Map(
      this.ctx.db.query<{ id: string; costPrice: number }>(
        `SELECT id, cost_price AS costPrice FROM products WHERE id IN (${placeholders})`,
        componentIds
      ).map((row) => [row.id, Number(row.costPrice || 0) / 100])
    );
    return boms.map((bom) => ({
      ...bom,
      estimatedCost: Math.round(
        bom.items.reduce((sum, item) => sum + item.quantity * (costs.get(item.componentProductId) || 0), 0) * 100
      ) / 100,
    }));
  }

  /** Detailed cost breakdown for one BOM. */
  public getBomCostEstimate(bomId: string): BomCostEstimate {
    this.ctx.require('manufacturing.view');
    const bom = this.getBom(bomId);
    const componentIds = bom.items.map((item) => item.componentProductId);
    const placeholders = componentIds.map(() => '?').join(',');
    const costs = new Map(
      componentIds.length === 0 ? [] : this.ctx.db.query<{ id: string; costPrice: number; name: string }>(
        `SELECT id, cost_price AS costPrice, name FROM products WHERE id IN (${placeholders})`,
        componentIds
      ).map((row) => [row.id, { unitCost: Number(row.costPrice || 0) / 100, name: row.name }])
    );
    const items = bom.items.map((item) => {
      const cost = costs.get(item.componentProductId);
      const unitCost = cost?.unitCost || 0;
      return {
        componentProductId: item.componentProductId,
        componentName: item.componentName || cost?.name || item.componentProductId,
        quantity: item.quantity,
        unitCost,
        lineCost: Math.round(item.quantity * unitCost * 100) / 100,
      };
    });
    return {
      bomId: bom.id,
      totalCost: Math.round(items.reduce((sum, item) => sum + item.lineCost, 0) * 100) / 100,
      items,
    };
  }

  /**
   * Critical-component alerts: components of ACTIVE BOMs whose total stock is
   * depleted or at/below the product reorder point.
   */
  public getBomStockAlerts(): BomStockAlert[] {
    this.ctx.require('manufacturing.view');
    const rows = this.ctx.db.query<{
      componentProductId: string; componentName: string; reorderPoint: number;
      bomId: string; bomName: string; productName: string;
    }>(
      `SELECT i.component_product_id AS componentProductId, p.name AS componentName,
              COALESCE(p.reorder_point, 0) AS reorderPoint,
              b.id AS bomId, b.name AS bomName, bp.name AS productName
       FROM bom_items i
       JOIN bills_of_materials b ON b.id = i.bom_id AND b.status = 'ACTIVE'
       JOIN products p ON p.id = i.component_product_id
       JOIN products bp ON bp.id = b.product_id
       ORDER BY b.name, i.created_at`
    );
    const stock = new Map<string, number>();
    for (const row of this.ctx.db.query<{ productId: string; qty: number }>(
      `SELECT product_id AS productId, COALESCE(SUM(quantity_m2), 0) AS qty
       FROM warehouse_stock GROUP BY product_id`
    )) {
      stock.set(row.productId, Number(row.qty || 0));
    }
    const groups = new Map<string, BomStockAlert>();
    for (const row of rows) {
      const availableQty = stock.get(row.componentProductId) ?? 0;
      const reorderPoint = Number(row.reorderPoint || 0);
      const severity = availableQty <= 0 ? 'OUT' : reorderPoint > 0 && availableQty <= reorderPoint ? 'LOW' : null;
      if (!severity) continue;
      const existing = groups.get(row.componentProductId);
      if (existing) {
        existing.usedBy.push({ bomId: row.bomId, bomName: row.bomName, productName: row.productName });
        continue;
      }
      groups.set(row.componentProductId, {
        componentProductId: row.componentProductId,
        componentName: row.componentName,
        reorderPoint,
        availableQty,
        severity,
        usedBy: [{ bomId: row.bomId, bomName: row.bomName, productName: row.productName }],
      });
    }
    return [...groups.values()].sort((a, b) =>
      (a.severity === b.severity ? a.availableQty - b.availableQty : a.severity === 'OUT' ? -1 : 1)
    );
  }

  public getBom(id: string): BillOfMaterials {
    this.ctx.require('manufacturing.view');
    const bom = this.ctx.db.query<BillOfMaterials>(
      `SELECT b.*, p.name AS product_name
       FROM bills_of_materials b
       JOIN products p ON p.id = b.product_id
       WHERE b.id = ?`,
      [id]
    )[0];
    if (!bom) throw new Error('BOM غير موجود.');
    bom.items = this.ctx.db.query<BomItem>(
      `SELECT i.*, p.name AS component_name
       FROM bom_items i
       LEFT JOIN products p ON p.id = i.component_product_id
       WHERE i.bom_id = ?
       ORDER BY i.created_at`,
      [id]
    );
    return this.attachEstimatedCosts([bom])[0];
  }

  public createBom(input: CreateBomDTO): BillOfMaterials {
    this.ctx.guardWrites();
    const actor = this.ctx.require('manufacturing.manage');
    if (!input.productId) throw new Error('يجب اختيار المنتج المصنّع.');
    const product = this.ctx.db.query<{ id: string }>(`SELECT id FROM products WHERE id = ?`, [input.productId])[0];
    if (!product) throw new Error('المنتج المحدد غير موجود.');
    if (!input.name?.trim()) throw new Error('اسم BOM مطلوب.');
    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new Error('يجب إضافة مكوّن واحد على الأقل إلى BOM.');
    }
    for (const item of input.items) {
      if (!(item.quantity > 0)) throw new Error('كمية المكوّن يجب أن تكون أكبر من صفر.');
      const component = this.ctx.db.query<{ id: string }>(`SELECT id FROM products WHERE id = ?`, [item.componentProductId])[0];
      if (!component) throw new Error('أحد مكوّنات BOM غير موجود.');
    }

    const id = `bom_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = new Date().toISOString();
    this.ctx.db.executeFinancialTransaction((db) => {
      db.run(
        `INSERT INTO bills_of_materials (id, product_id, name, version, status, notes, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?)`,
        [id, input.productId, input.name.trim(), input.version?.trim() || '1.0', input.notes?.trim() || null, actor.id, now, now]
      );
      for (const item of input.items) {
        db.run(
          `INSERT INTO bom_items (id, bom_id, component_product_id, quantity, unit, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            `bomi_${uuidv4().replace(/-/g, '').slice(0, 12)}`, id, item.componentProductId,
            item.quantity, item.unit?.trim() || 'PIECE', item.notes?.trim() || null, now,
          ]
        );
      }
      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
         VALUES (?, ?, ?, 'إنشاء BOM', 'MANUFACTURING', ?, ?)`,
        [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id, JSON.stringify({ productId: input.productId, name: input.name.trim() })]
      );
    });
    return this.getBom(id);
  }

  public activateBom(id: string): BillOfMaterials {
    this.ctx.guardWrites();
    this.ctx.require('manufacturing.manage');
    const bom = this.getBom(id);
    if (bom.status !== 'DRAFT') throw new Error('لا يمكن تفعيل BOM إلا إذا كان مسودة.');
    if (bom.items.length === 0) throw new Error('لا يمكن تفعيل BOM بدون مكوّنات.');

    this.ctx.db.run(
      `UPDATE bills_of_materials SET status = 'ACTIVE', updated_at = ? WHERE id = ?`,
      [new Date().toISOString(), id]
    );
    this.ctx.audit('تفعيل BOM', id, { productId: bom.productId });
    return this.getBom(id);
  }

  public archiveBom(id: string): BillOfMaterials {
    this.ctx.guardWrites();
    this.ctx.require('manufacturing.manage');
    const bom = this.getBom(id);
    this.ctx.db.run(
      `UPDATE bills_of_materials SET status = 'ARCHIVED', updated_at = ? WHERE id = ?`,
      [new Date().toISOString(), id]
    );
    this.ctx.audit('أرشفة BOM', id, { productId: bom.productId });
    return this.getBom(id);
  }
}
