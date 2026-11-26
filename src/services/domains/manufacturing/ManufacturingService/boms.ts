import { v4 as uuidv4 } from 'uuid';
import type { ManufacturingContext } from './context';
import type {
  BillOfMaterials,
  BomCostEstimate,
  BomItem,
  BomLeafRequirement,
  BomOperation,
  BomStockAlert,
  CreateBomDTO,
  UpdateBomDTO,
} from './types';

interface ProductUomRow {
  id: string;
  baseUnit: string | null;
  costPrice: number;
}

/** Bill-of-materials queries. Extracted verbatim from ManufacturingService. */
export class BomsModule {
  private readonly ctx: ManufacturingContext;
  constructor(ctx: ManufacturingContext) { this.ctx = ctx; }

  /** Raw BOM + items loader without a permission check (callers authorize). */
  private loadBomWithItems(bomId: string): BillOfMaterials | null {
    const bom = this.ctx.db.query<BillOfMaterials>(
      `SELECT b.*, p.name AS product_name
       FROM bills_of_materials b
       JOIN products p ON p.id = b.product_id
       WHERE b.id = ?`,
      [bomId]
    )[0];
    if (!bom) return null;
    bom.items = this.ctx.db.query<BomItem>(
      `SELECT i.*, p.name AS component_name
       FROM bom_items i
       LEFT JOIN products p ON p.id = i.component_product_id
       WHERE i.bom_id = ?
       ORDER BY i.created_at`,
      [bomId]
    );
    return bom;
  }

  /** Routing template lines of a BOM ordered by sequence. */
  public loadBomOperations(bomId: string): BomOperation[] {
    return this.ctx.db.query<BomOperation>(
      `SELECT o.*, w.name AS work_center_name
       FROM bom_operations o
       LEFT JOIN work_centers w ON w.id = o.work_center_id
       WHERE o.bom_id = ?
       ORDER BY o.sequence, o.created_at`,
      [bomId]
    );
  }

  /**
   * Replace the routing template of a DRAFT BOM. Each entry is one operation:
   * work center + minutes per finished unit. Empty array clears the routing.
   */
  public setBomOperations(bomId: string, operations: Array<{ workCenterId: string; minutesPerUnit: number }>): BomOperation[] {
    this.ctx.guardWrites();
    this.ctx.requireAny(['manufacturing.manage', 'manufacturing.bom.manage']);
    const bom = this.getBom(bomId);
    if (bom.status !== 'DRAFT') throw new Error('لا يمكن تعديل التوجيه إلا على BOM مسودة.');
    const now = new Date().toISOString();
    this.ctx.db.executeFinancialTransaction((db) => {
      db.run(`DELETE FROM bom_operations WHERE bom_id = ?`, [bomId]);
      operations.forEach((op, index) => {
        const wc = db.query<{ id: string }>(`SELECT id FROM work_centers WHERE id = ?`, [op.workCenterId])[0];
        if (!wc) throw new Error('مركز العمل المحدد غير موجود.');
        const minutes = Number(op.minutesPerUnit);
        if (!Number.isFinite(minutes) || minutes < 0) throw new Error('دقائق العملية لكل وحدة يجب أن تكون رقماً غير سالب.');
        db.run(
          `INSERT INTO bom_operations (id, bom_id, work_center_id, sequence, minutes_per_unit, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [`bopo_${uuidv4().replace(/-/g, '').slice(0, 12)}`, bomId, op.workCenterId, index, minutes, now]
        );
      });
    });
    this.ctx.audit('تحديث توجيه BOM', bomId, { operations: operations.length });
    return this.loadBomOperations(bomId);
  }

  private loadProductUom(productId: string): ProductUomRow | null {
    return this.ctx.db.query<ProductUomRow>(
      `SELECT id, base_unit AS baseUnit, cost_price AS costPrice
       FROM products WHERE id = ?`,
      [productId]
    )[0] || null;
  }

  private findActiveBomForProduct(productId: string): BillOfMaterials | null {
    const row = this.ctx.db.query<{ id: string }>(
      `SELECT id FROM bills_of_materials WHERE product_id = ? AND status = 'ACTIVE' LIMIT 1`,
      [productId]
    )[0];
    return row ? this.loadBomWithItems(row.id) : null;
  }

  /**
   * Rolled-up unit cost of a component: when the component has its own ACTIVE
   * BOM the cost is the exploded material cost of that BOM (recursive),
   * otherwise the product's recorded cost price. Cycle-safe via `visited`.
   */
  private rolledUnitCost(productId: string, visited = new Set<string>()): number {
    const product = this.loadProductUom(productId);
    if (!product) return 0;
    if (visited.has(productId)) return Number(product.costPrice || 0) / 100;
    const subBom = this.findActiveBomForProduct(productId);
    if (!subBom || subBom.items.length === 0) return Number(product.costPrice || 0) / 100;
    visited.add(productId);
    try {
      const cost = subBom.items.reduce((sum, item) => {
        const qty = this.itemQtyRequired(item);
        return sum + qty * this.rolledUnitCost(item.componentProductId, visited);
      }, 0);
      return cost;
    } finally {
      visited.delete(productId);
    }
  }

  /**
   * BOM item quantity in the component's base stock unit. `bom_items.quantity`
   * is canonically stored in base units (the `unit` column is normalized to the
   * component's base unit at creation), so planning never re-interprets it.
   */
  private itemQtyInBase(item: BomItem): number {
    return Number(item.quantity) || 0;
  }

  /** Net quantity inflated by the item's preparation-loss percentage. */
  private itemQtyRequired(item: BomItem): number {
    return this.itemQtyInBase(item) * (1 + (Number(item.wastePercent) || 0) / 100);
  }

  public getBoms(productId?: string): BillOfMaterials[] {
    this.ctx.requireAny(['manufacturing.view', 'manufacturing.bom.view']);
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

  /** Estimated material cost per BOM unit using rolled-up component costs. */
  private attachEstimatedCosts(boms: BillOfMaterials[]): BillOfMaterials[] {
    return boms.map((bom) => ({
      ...bom,
      estimatedCost: Math.round(
        bom.items.reduce((sum, item) => sum + this.itemQtyRequired(item) * this.rolledUnitCost(item.componentProductId), 0) * 100
      ) / 100,
    }));
  }

  /** Detailed cost breakdown for one BOM (base-unit quantities, rolled costs). */
  public getBomCostEstimate(bomId: string): BomCostEstimate {
    this.ctx.requireAny(['manufacturing.view', 'manufacturing.bom.view', 'manufacturing.orders.view']);
    const bom = this.getBom(bomId);
    const items = bom.items.map((item) => {
      const qty = this.itemQtyRequired(item);
      const unitCost = this.rolledUnitCost(item.componentProductId);
      return {
        componentProductId: item.componentProductId,
        componentName: item.componentName || item.componentProductId,
        quantity: qty,
        unitCost,
        lineCost: Math.round(qty * unitCost * 100) / 100,
      };
    });
    return {
      bomId: bom.id,
      totalCost: Math.round(items.reduce((sum, item) => sum + item.lineCost, 0) * 100) / 100,
      items,
    };
  }

  /**
   * Explode a BOM into leaf-level material requirements for `quantity` units
   * of the finished product. Components that have their own ACTIVE BOM are
   * recursively exploded (sub-assemblies are treated as phantom until real
   * multi-level production orders exist). Quantities are returned in each
   * component's base stock unit and aggregated per product.
   */
  public getBomLeafRequirements(bomId: string, quantity = 1): BomLeafRequirement[] {
    this.ctx.requireAny(['manufacturing.view', 'manufacturing.bom.view', 'manufacturing.orders.view', 'manufacturing.orders.create', 'manufacturing.orders.execute', 'manufacturing.quality.view', 'manufacturing.quality.manage']);
    const aggregated = new Map<string, number>();
    const visit = (currentBomId: string, parentQty: number, trail: Set<string>) => {
      if (trail.has(currentBomId)) {
        throw new Error('تعذر تفجير قائمة المواد: توجد دورة بين قوائم المواد (BOM).');
      }
      trail.add(currentBomId);
      const bom = this.loadBomWithItems(currentBomId);
      if (!bom) throw new Error('قائمة المواد غير موجودة.');
      for (const item of bom.items) {
        const needed = this.itemQtyRequired(item) * parentQty;
        const subBom = this.findActiveBomForProduct(item.componentProductId);
        if (subBom) {
          visit(subBom.id, needed, trail);
        } else {
          aggregated.set(item.componentProductId, (aggregated.get(item.componentProductId) || 0) + needed);
        }
      }
      trail.delete(currentBomId);
    };
    visit(bomId, quantity, new Set());

    const ids = [...aggregated.keys()];
    const names = new Map(
      ids.length === 0 ? [] : this.ctx.db.query<{ id: string; name: string; baseUnit: string }>(
        `SELECT id, name, base_unit AS baseUnit FROM products WHERE id IN (${ids.map(() => '?').join(',')})`,
        ids
      ).map((row) => [row.id, row])
    );
    return ids.map((id) => ({
      componentProductId: id,
      componentName: names.get(id)?.name,
      quantity: Math.round((aggregated.get(id) || 0) * 1e6) / 1e6,
      unit: names.get(id)?.baseUnit || 'PIECE',
    }));
  }

  /**
   * Critical-component alerts: components of ACTIVE BOMs whose total stock is
   * depleted or at/below the product reorder point.
   */
  public getBomStockAlerts(): BomStockAlert[] {
    this.ctx.requireAny(['manufacturing.view', 'manufacturing.bom.view', 'manufacturing.orders.view']);
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
    this.ctx.requireAny(['manufacturing.view', 'manufacturing.bom.view']);
    const bom = this.loadBomWithItems(id);
    if (!bom) throw new Error('BOM غير موجود.');
    const withCost = this.attachEstimatedCosts([bom])[0];
    withCost.operations = this.loadBomOperations(id);
    return withCost;
  }

  public createBom(input: CreateBomDTO): BillOfMaterials {
    this.ctx.guardWrites();
    const actor = this.ctx.requireAny(['manufacturing.manage', 'manufacturing.bom.manage']);
    if (!input.productId) throw new Error('يجب اختيار المنتج المصنّع.');
    const product = this.ctx.db.query<{ id: string }>(`SELECT id FROM products WHERE id = ?`, [input.productId])[0];
    if (!product) throw new Error('المنتج المحدد غير موجود.');
    if (!input.name?.trim()) throw new Error('اسم BOM مطلوب.');
    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new Error('يجب إضافة مكوّن واحد على الأقل إلى BOM.');
    }
    for (const item of input.items) {
      if (!(item.quantity > 0)) throw new Error('كمية المكوّن يجب أن تكون أكبر من صفر.');
      const component = this.loadProductUom(item.componentProductId);
      if (!component) throw new Error('أحد مكوّنات BOM غير موجود.');
      // Quantities are canonically stored in the component's base stock unit;
      // the unit label is normalized to it so planning never re-interprets.
      item.unit = component.baseUnit || item.unit?.trim() || 'PIECE';
    }

    const id = `bom_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = new Date().toISOString();
    this.ctx.db.executeFinancialTransaction((db) => {
      db.run(
        `INSERT INTO bills_of_materials (id, product_id, name, version, status, notes, requires_final_qc, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?)`,
        [id, input.productId, input.name.trim(), input.version?.trim() || '1.0', input.notes?.trim() || null, input.requiresFinalQc ? 1 : 0, actor.id, now, now]
      );
      for (const item of input.items) {
        db.run(
          `INSERT INTO bom_items (id, bom_id, component_product_id, quantity, unit, waste_percent, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            `bomi_${uuidv4().replace(/-/g, '').slice(0, 12)}`, id, item.componentProductId,
            item.quantity, item.unit || 'PIECE', Math.max(0, Number(item.wastePercent) || 0),
            item.notes?.trim() || null, now,
          ]
        );
      }
      (input.operations || []).forEach((op, index) => {
        const wc = db.query<{ id: string }>(`SELECT id FROM work_centers WHERE id = ?`, [op.workCenterId])[0];
        if (!wc) throw new Error('مركز العمل المحدد في التوجيه غير موجود.');
        const minutes = Number(op.minutesPerUnit);
        if (!Number.isFinite(minutes) || minutes < 0) throw new Error('دقائق العملية لكل وحدة يجب أن تكون رقماً غير سالب.');
        db.run(
          `INSERT INTO bom_operations (id, bom_id, work_center_id, sequence, minutes_per_unit, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [`bopo_${uuidv4().replace(/-/g, '').slice(0, 12)}`, id, op.workCenterId, index, minutes, now]
        );
      });
      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
         VALUES (?, ?, ?, 'إنشاء BOM', 'MANUFACTURING', ?, ?)`,
        [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id, JSON.stringify({ productId: input.productId, name: input.name.trim() })]
      );
    });
    return this.getBom(id);
  }

  /**
   * Edit a DRAFT BOM header and/or replace its component list. ACTIVE/ARCHIVED
   * BOMs are immutable — create a new revision instead so historical orders
   * keep their material basis.
   */
  public updateBom(id: string, input: UpdateBomDTO): BillOfMaterials {
    this.ctx.guardWrites();
    this.ctx.requireAny(['manufacturing.manage', 'manufacturing.bom.manage']);
    const bom = this.getBom(id);
    if (bom.status !== 'DRAFT') throw new Error('لا يمكن تعديل BOM إلا إذا كان مسودة — أنشئ نسخة جديدة.');

    const updates: string[] = [];
    const headerParams: Array<any> = [];
    if (input.name !== undefined) {
      const name = input.name?.trim();
      if (!name) throw new Error('اسم BOM مطلوب.');
      updates.push('name = ?'); headerParams.push(name);
    }
    if (input.version !== undefined) {
      updates.push('version = ?'); headerParams.push(input.version?.trim() || '1.0');
    }
    if (input.notes !== undefined) {
      updates.push('notes = ?'); headerParams.push(input.notes?.trim() || null);
    }
    if (input.requiresFinalQc !== undefined) {
      updates.push('requires_final_qc = ?'); headerParams.push(input.requiresFinalQc ? 1 : 0);
    }

    const items = input.items;
    if (items !== undefined) {
      if (!Array.isArray(items) || items.length === 0) {
        throw new Error('يجب إضافة مكوّن واحد على الأقل إلى BOM.');
      }
      for (const item of items) {
        if (!(item.quantity > 0)) throw new Error('كمية المكوّن يجب أن تكون أكبر من صفر.');
        const component = this.loadProductUom(item.componentProductId);
        if (!component) throw new Error('أحد مكوّنات BOM غير موجود.');
        item.unit = component.baseUnit || item.unit?.trim() || 'PIECE';
      }
    }

    const now = new Date().toISOString();
    this.ctx.db.executeFinancialTransaction((db) => {
      if (updates.length > 0) {
        updates.push('updated_at = ?'); headerParams.push(now);
        headerParams.push(id);
        db.run(`UPDATE bills_of_materials SET ${updates.join(', ')} WHERE id = ?`, headerParams);
      }
      if (items !== undefined) {
        db.run(`DELETE FROM bom_items WHERE bom_id = ?`, [id]);
        for (const item of items) {
          db.run(
            `INSERT INTO bom_items (id, bom_id, component_product_id, quantity, unit, waste_percent, notes, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              `bomi_${uuidv4().replace(/-/g, '').slice(0, 12)}`, id, item.componentProductId,
              item.quantity, item.unit || 'PIECE', Math.max(0, Number(item.wastePercent) || 0),
              item.notes?.trim() || null, now,
            ]
          );
        }
      }
    });
    this.ctx.audit('تعديل BOM', id, { fields: Object.keys(input) });
    return this.getBom(id);
  }

  public activateBom(id: string): BillOfMaterials {
    this.ctx.guardWrites();
    this.ctx.requireAny(['manufacturing.manage', 'manufacturing.bom.manage']);
    const bom = this.getBom(id);
    if (bom.status !== 'DRAFT') throw new Error('لا يمكن تفعيل BOM إلا إذا كان مسودة.');
    if (bom.items.length === 0) throw new Error('لا يمكن تفعيل BOM بدون مكوّنات.');
    const otherActive = this.ctx.db.query<{ id: string }>(
      `SELECT id FROM bills_of_materials WHERE product_id = ? AND status = 'ACTIVE' AND id != ? LIMIT 1`,
      [bom.productId, id]
    )[0];
    if (otherActive) {
      throw new Error('يوجد BOM نشط آخر لهذا المنتج — أرشفه أولاً لضمان مصدر واحد للحقيقة.');
    }

    this.ctx.db.run(
      `UPDATE bills_of_materials SET status = 'ACTIVE', updated_at = ? WHERE id = ?`,
      [new Date().toISOString(), id]
    );
    this.ctx.audit('تفعيل BOM', id, { productId: bom.productId });
    return this.getBom(id);
  }

  public archiveBom(id: string): BillOfMaterials {
    this.ctx.guardWrites();
    this.ctx.requireAny(['manufacturing.manage', 'manufacturing.bom.manage']);
    const bom = this.getBom(id);
    this.ctx.db.run(
      `UPDATE bills_of_materials SET status = 'ARCHIVED', updated_at = ? WHERE id = ?`,
      [new Date().toISOString(), id]
    );
    this.ctx.audit('أرشفة BOM', id, { productId: bom.productId });
    return this.getBom(id);
  }
}
