import { v4 as uuidv4 } from 'uuid';
import { InventoryLocationStockService } from '../../inventory/InventoryLocationStockService';
import type { ManufacturingContext } from './context';
import type { ProductionOrdersModule } from './productionOrders';
import type {
  CreateQualityCheckDTO,
  QualityCheck,
  UpdateQualityCheckDTO,
} from './types';

/** Manufacturing quality-check queries. Extracted verbatim from ManufacturingService. */
export class QualityModule {
  constructor(private ctx: ManufacturingContext, private orders: ProductionOrdersModule) {}

  public createQualityCheck(input: CreateQualityCheckDTO): QualityCheck {
    this.ctx.guardWrites();
    const actor = this.ctx.require('manufacturing.manage');
    if (!input?.productionOrderId) throw new Error('أمر الإنتاج مطلوب.');
    const order = this.orders.getOrderInternal(input.productionOrderId);
    if (!order) throw new Error('أمر الإنتاج غير موجود.');
    this.ctx.branchAccess.requireBranchAccess(order.branchId, actor);

    const inspectionType = input.inspectionType || 'FINAL';
    if (!['INCOMING', 'IN_PROCESS', 'FINAL'].includes(inspectionType)) {
      throw new Error('نوع الفحص غير صالح.');
    }
    const result = input.result || 'PENDING';
    if (!['PASS', 'FAIL', 'PENDING', 'CONDITIONAL'].includes(result)) {
      throw new Error('نتيجة الفحص غير صالحة.');
    }
    const inspected = Number(input.quantityInspected ?? 0);
    const accepted = Number(input.quantityAccepted ?? 0);
    const rejected = Number(input.quantityRejected ?? 0);
    if (!Number.isFinite(inspected) || inspected < 0) throw new Error('الكمية المفحوصة غير صالحة.');
    if (!Number.isFinite(accepted) || accepted < 0) throw new Error('الكمية المقبولة غير صالحة.');
    if (!Number.isFinite(rejected) || rejected < 0) throw new Error('الكمية المرفوضة غير صالحة.');

    const id = `mqc_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = new Date().toISOString();
    const notes = input.notes === undefined ? null : (input.notes?.trim() || null);
    this.ctx.db.run(
      `INSERT INTO manufacturing_quality_checks
        (id, production_order_id, inspection_type, result, quantity_inspected, quantity_accepted, quantity_rejected, notes, inspector_id, branch_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.productionOrderId, inspectionType, result, inspected, accepted, rejected, notes, actor.id, order.branchId, now, now]
    );
    this.ctx.audit('إضافة فحص جودة', id, { productionOrderId: input.productionOrderId, result });
    return this.getQualityCheck(id);
  }

  public getQualityCheck(id: string): QualityCheck {
    const actor = this.ctx.require('manufacturing.view');
    const row = this.ctx.db.query<any>(
      `SELECT * FROM manufacturing_quality_checks WHERE id = ?`,
      [id]
    )[0];
    if (!row) throw new Error('سجل فحص الجودة غير موجود.');
    if (row.branchId) this.ctx.branchAccess.requireBranchAccess(row.branchId, actor);
    return this.mapQualityCheck(row);
  }

  public getQualityChecks(productionOrderId?: string): QualityCheck[] {
    const actor = this.ctx.require('manufacturing.view');
    const conditions: string[] = [];
    const params: Array<string> = [];
    if (productionOrderId) {
      const order = this.orders.getOrderInternal(productionOrderId);
      if (!order) throw new Error('أمر الإنتاج غير موجود.');
      this.ctx.branchAccess.requireBranchAccess(order.branchId, actor);
      conditions.push('q.production_order_id = ?');
      params.push(productionOrderId);
    }
    const scope = this.ctx.branchAccess.sqlScope('q.branch_id', undefined, actor);
    conditions.push(scope.clause);
    params.push(...scope.params);
    const rows = this.ctx.db.query<any>(
      `SELECT q.* FROM manufacturing_quality_checks q
       ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
       ORDER BY q.created_at DESC`,
      params
    );
    return rows.map((row) => this.mapQualityCheck(row));
  }

  public updateQualityCheck(id: string, input: UpdateQualityCheckDTO): QualityCheck {
    this.ctx.guardWrites();
    const actor = this.ctx.require('manufacturing.manage');
    const existing = this.ctx.db.query<any>(
      `SELECT * FROM manufacturing_quality_checks WHERE id = ?`,
      [id]
    )[0];
    if (!existing) throw new Error('سجل فحص الجودة غير موجود.');
    if (existing.branchId) this.ctx.branchAccess.requireBranchAccess(existing.branchId, actor);

    const updates: string[] = [];
    const params: Array<any> = [];
    if (input.inspectionType !== undefined) {
      if (!['INCOMING', 'IN_PROCESS', 'FINAL'].includes(input.inspectionType)) throw new Error('نوع الفحص غير صالح.');
      updates.push('inspection_type = ?'); params.push(input.inspectionType);
    }
    if (input.result !== undefined) {
      if (!['PASS', 'FAIL', 'PENDING', 'CONDITIONAL'].includes(input.result)) throw new Error('نتيجة الفحص غير صالحة.');
      updates.push('result = ?'); params.push(input.result);
    }
    if (input.quantityInspected !== undefined) {
      const v = Number(input.quantityInspected);
      if (!Number.isFinite(v) || v < 0) throw new Error('الكمية المفحوصة غير صالحة.');
      updates.push('quantity_inspected = ?'); params.push(v);
    }
    if (input.quantityAccepted !== undefined) {
      const v = Number(input.quantityAccepted);
      if (!Number.isFinite(v) || v < 0) throw new Error('الكمية المقبولة غير صالحة.');
      updates.push('quantity_accepted = ?'); params.push(v);
    }
    if (input.quantityRejected !== undefined) {
      const v = Number(input.quantityRejected);
      if (!Number.isFinite(v) || v < 0) throw new Error('الكمية المرفوضة غير صالحة.');
      updates.push('quantity_rejected = ?'); params.push(v);
    }
    if (input.notes !== undefined) {
      updates.push('notes = ?');
      params.push(input.notes === null ? null : (input.notes?.trim() || null));
    }
    if (updates.length === 0) return this.getQualityCheck(id);
    updates.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);
    this.ctx.db.run(`UPDATE manufacturing_quality_checks SET ${updates.join(', ')} WHERE id = ?`, params);
    this.ctx.audit('تحديث فحص جودة', id, { result: input.result });
    return this.getQualityCheck(id);
  }

  private mapQualityCheck(row: any): QualityCheck {
    return {
      id: row.id,
      productionOrderId: row.productionOrderId,
      inspectionType: row.inspectionType,
      result: row.result,
      quantityInspected: Number(row.quantityInspected || 0),
      quantityAccepted: Number(row.quantityAccepted || 0),
      quantityRejected: Number(row.quantityRejected || 0),
      disposition: row.disposition || 'NONE',
      dispositionQty: Number(row.dispositionQty || 0),
      dispositionAt: row.dispositionAt ?? null,
      notes: row.notes ?? null,
      inspectorId: row.inspectorId ?? null,
      branchId: row.branchId ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  public recordQualityDisposition(id: string, disposition: 'ACCEPT' | 'SCRAP' | 'REWORK' | 'RETURN', quantity: number, _notes?: string): QualityCheck {
    this.ctx.guardWrites();
    const actor = this.ctx.require('manufacturing.manage');
    const existing = this.ctx.db.query<any>(`SELECT * FROM manufacturing_quality_checks WHERE id = ?`, [id])[0];
    if (!existing) throw new Error('سجل فحص الجودة غير موجود.');
    if (existing.branchId) this.ctx.branchAccess.requireBranchAccess(existing.branchId, actor);
    if (!['ACCEPT', 'SCRAP', 'REWORK', 'RETURN'].includes(disposition)) throw new Error('قرار المعالجة غير صالح.');
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty < 0) throw new Error('الكمية غير صالحة.');

    const order = this.orders.getOrderInternal(existing.productionOrderId);
    const warehouseId = order?.warehouseId || null;

    // SCRAP reduces finished/ component stock? Here we scrap rejected finished goods from warehouse.
    if (disposition === 'SCRAP' && qty > 0 && warehouseId) {
      const productId = order?.productId;
      if (productId) {
        const stock = this.ctx.db.query<{ quantityM2: number }>(
          `SELECT quantity_m2 AS quantityM2 FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?`,
          [warehouseId, productId]
        )[0];
        const current = Number(stock?.quantityM2 || 0);
        if (current < qty) throw new Error('الرصيد المتاح غير كافٍ للإتلاف.');
        this.ctx.db.run(
          `UPDATE warehouse_stock SET quantity_m2 = quantity_m2 - ?, last_updated = ? WHERE warehouse_id = ? AND product_id = ?`,
          [qty, new Date().toISOString(), warehouseId, productId]
        );
        InventoryLocationStockService.release(this.ctx.db, {
          warehouseId,
          productId,
          quantity: qty,
          actorId: actor.id,
          reason: 'إتلاف (Scrap)',
        });
        const txNumber = this.ctx.db.nextNumber('INV');
        this.ctx.db.run(
          `INSERT INTO inventory_transactions (id, transaction_number, type, product_id, warehouse_id, quantity_m2, boxes_count, unit_cost, total_cost, reference_type, reference_id, notes, performed_by, created_at)
           VALUES (?, ?, 'ADJUSTMENT_SUB', ?, ?, ?, 0, 0, 0, 'QUALITY_DISPOSITION', ?, 'إتلاف (Scrap)', ?, ?)`,
          [`itx_${uuidv4().replace(/-/g, '').slice(0, 12)}`, txNumber, productId, warehouseId, qty, id, actor.id, new Date().toISOString()]
        );
      }
    }

    const now = new Date().toISOString();
    this.ctx.db.run(
      `UPDATE manufacturing_quality_checks SET disposition = ?, disposition_qty = ?, disposition_at = ?, updated_at = ? WHERE id = ?`,
      [disposition, qty, now, now, id]
    );
    this.ctx.audit('قرار معالجة جودة', id, { disposition, quantity: qty });
    return this.getQualityCheck(id);
  }
}
