import { v4 as uuidv4 } from 'uuid';
import type { ManufacturingContext } from './context';
import type { BillOfMaterials, BomItem, CreateBomDTO } from './types';

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
    return boms.map((bom) => ({
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
    return bom;
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
