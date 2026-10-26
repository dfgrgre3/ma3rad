/**
 * BatchService — إدارة دفعات / تشغيلات السيراميك
 *
 * كل دفعة (Batch / Lot) تمثل شحنة واحدة مستلمة تحمل:
 *   • رقم التشغيلة (batch_number) من المصنع
 *   • نغمة اللون (tone_shade) مثل A12 / Shade-3
 *   • العيار / المعايرة (caliber) مثل 0 أو 1 (بالملم)
 *
 * عند البيع يتم الاستهلاك بنظام FIFO (أقدم دفعة أولاً).
 * إذا احتاجت الفاتورة السحب من دفعتين أو أكثر بنغمات مختلفة
 * تُعاد قائمة التعارضات (ToneMixingConflict[]) وتُعرض تحذيراً في POS.
 */

import { DatabaseManager } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import type { ProductBatch, ToneMixingConflict } from '../types';

export type { ProductBatch, ToneMixingConflict };

export interface CreateBatchDTO {
  productId: string;
  warehouseId: string;
  batchNumber: string;
  toneShade: string;
  caliber?: string;
  productionDate?: string;
  receivedDate?: string;
  supplierId?: string;
  costPrice?: number;
  quantityM2: number;
  notes?: string;
}

export class BatchService {
  private db = DatabaseManager.getInstance();

  // ─── Permissions ────────────────────────────────────────────────────────────
  private requireWrite(): void {
    PermissionService.require(AuthService.requireAuth(), 'products.update');
  }

  // ─── Read ────────────────────────────────────────────────────────────────────

  /** كل الدفعات لصنف معين (مع خيار تصفية بالمخزن) */
  public getBatchesForProduct(productId: string, warehouseId?: string): ProductBatch[] {
    let sql = `
      SELECT
        pb.id,
        pb.product_id          AS productId,
        pb.warehouse_id        AS warehouseId,
        w.name                 AS warehouseName,
        pb.batch_number        AS batchNumber,
        pb.tone_shade          AS toneShade,
        pb.caliber,
        pb.production_date     AS productionDate,
        pb.received_date       AS receivedDate,
        pb.supplier_id         AS supplierId,
        s.name                 AS supplierName,
        COALESCE(pb.cost_price, 0)             AS costPrice,
        pb.quantity_m2          AS quantityM2,
        COALESCE(pb.quantity_remaining_m2, 0)  AS quantityRemainingM2,
        pb.notes,
        pb.created_by          AS createdBy,
        pb.created_at          AS createdAt
      FROM product_batches pb
      LEFT JOIN warehouses w ON w.id = pb.warehouse_id
      LEFT JOIN suppliers  s ON s.id = pb.supplier_id
      WHERE pb.product_id = ?
    `;
    const params: unknown[] = [productId];
    if (warehouseId) {
      sql += ` AND pb.warehouse_id = ?`;
      params.push(warehouseId);
    }
    sql += ` ORDER BY pb.created_at ASC, pb.id ASC`;
    return this.db.query<ProductBatch>(sql, params);
  }

  /** دفعة واحدة بمعرفها */
  public getBatchById(id: string): ProductBatch | null {
    const rows = this.db.query<ProductBatch>(
      `SELECT
         pb.id,
         pb.product_id          AS productId,
         pb.warehouse_id        AS warehouseId,
         w.name                 AS warehouseName,
         pb.batch_number        AS batchNumber,
         pb.tone_shade          AS toneShade,
         pb.caliber,
         pb.production_date     AS productionDate,
         pb.received_date       AS receivedDate,
         pb.supplier_id         AS supplierId,
         s.name                 AS supplierName,
         COALESCE(pb.cost_price, 0)            AS costPrice,
         pb.quantity_m2         AS quantityM2,
         COALESCE(pb.quantity_remaining_m2, 0) AS quantityRemainingM2,
         pb.notes,
         pb.created_by          AS createdBy,
         pb.created_at          AS createdAt
       FROM product_batches pb
       LEFT JOIN warehouses w ON w.id = pb.warehouse_id
       LEFT JOIN suppliers  s ON s.id = pb.supplier_id
       WHERE pb.id = ?`,
      [id]
    );
    return rows[0] ?? null;
  }

  /** إجمالي الرصيد المتبقي من كل الدفعات (م²) */
  public getTotalRemainingM2(productId: string, warehouseId?: string): number {
    let sql = `
      SELECT COALESCE(SUM(quantity_remaining_m2), 0) AS total
      FROM product_batches
      WHERE product_id = ?
    `;
    const params: unknown[] = [productId];
    if (warehouseId) { sql += ` AND warehouse_id = ?`; params.push(warehouseId); }
    return Number(this.db.query<{ total: number }>(sql, params)[0]?.total ?? 0);
  }

  // ─── Write ───────────────────────────────────────────────────────────────────

  /** إنشاء دفعة جديدة عند استلام شحنة سيراميك */
  public createBatch(data: CreateBatchDTO): ProductBatch {
    this.requireWrite();
    const actor = AuthService.requireAuth();

    if (!data.batchNumber?.trim()) throw new Error('رقم الدفعة / التشغيلة مطلوب.');
    if (!data.toneShade?.trim()) throw new Error('نغمة اللون (Shade) مطلوبة.');
    if (!data.quantityM2 || data.quantityM2 <= 0) throw new Error('الكمية يجب أن تكون أكبر من صفر.');

    // منع تكرار رقم الدفعة لنفس الصنف في نفس المخزن
    const dup = this.db.query<{ id: string }>(
      `SELECT id FROM product_batches WHERE product_id = ? AND batch_number = ? AND warehouse_id = ?`,
      [data.productId, data.batchNumber.trim(), data.warehouseId]
    );
    if (dup.length > 0) {
      throw new Error(`رقم الدفعة "${data.batchNumber}" مسجل بالفعل لهذا الصنف في نفس المخزن.`);
    }

    const id = `batch_${uuidv4().substring(0, 8)}`;
    const qtyM2 = Math.max(0, Number(data.quantityM2) || 0);

    this.db.run(
      `INSERT INTO product_batches
         (id, product_id, warehouse_id, batch_number, tone_shade, caliber,
          production_date, received_date, supplier_id, cost_price,
          quantity_m2, quantity_remaining_m2, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.productId,
        data.warehouseId,
        data.batchNumber.trim(),
        data.toneShade.trim(),
        data.caliber?.trim() || '0',
        data.productionDate || null,
        data.receivedDate   || null,
        data.supplierId     || null,
        Number(data.costPrice) || 0,
        qtyM2,
        qtyM2,                         // remaining = total on first entry
        data.notes?.trim()  || null,
        actor.id,
      ]
    );

    return this.getBatchById(id)!;
  }

  /** تعديل بيانات دفعة موجودة */
  public updateBatch(
    id: string,
    updates: Partial<{
      toneShade: string;
      caliber: string;
      productionDate: string;
      receivedDate: string;
      supplierId: string;
      costPrice: number;
      quantityM2: number;
      quantityRemainingM2: number;
      notes: string;
    }>
  ): void {
    this.requireWrite();
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.toneShade            !== undefined) { fields.push('tone_shade = ?');            values.push(updates.toneShade); }
    if (updates.caliber              !== undefined) { fields.push('caliber = ?');               values.push(updates.caliber); }
    if (updates.productionDate       !== undefined) { fields.push('production_date = ?');       values.push(updates.productionDate || null); }
    if (updates.receivedDate         !== undefined) { fields.push('received_date = ?');         values.push(updates.receivedDate || null); }
    if (updates.supplierId           !== undefined) { fields.push('supplier_id = ?');           values.push(updates.supplierId || null); }
    if (updates.costPrice            !== undefined) { fields.push('cost_price = ?');            values.push(Number(updates.costPrice) || 0); }
    if (updates.quantityM2           !== undefined) { fields.push('quantity_m2 = ?');           values.push(Math.max(0, Number(updates.quantityM2) || 0)); }
    if (updates.quantityRemainingM2  !== undefined) { fields.push('quantity_remaining_m2 = ?'); values.push(Math.max(0, Number(updates.quantityRemainingM2) || 0)); }
    if (updates.notes                !== undefined) { fields.push('notes = ?');                 values.push(updates.notes?.trim() || null); }

    if (fields.length === 0) return;
    values.push(id);
    this.db.run(`UPDATE product_batches SET ${fields.join(', ')} WHERE id = ?`, values);
  }

  /** حذف دفعة (يُرفض إذا كان لا يزال بها رصيد) */
  public deleteBatch(id: string): void {
    this.requireWrite();
    const batch = this.getBatchById(id);
    if (!batch) throw new Error('الدفعة غير موجودة.');
    if ((batch.quantityRemainingM2 ?? 0) > 0.001) {
      throw new Error(`لا يمكن حذف الدفعة "${batch.batchNumber}" — يوجد رصيد متبقٍ ${batch.quantityRemainingM2.toFixed(2)} م². أفرّغها أولاً.`);
    }
    this.db.run(`DELETE FROM product_batches WHERE id = ?`, [id]);
  }

  // ─── Tone-Mixing Analysis ────────────────────────────────────────────────────

  /**
   * يتحقق إذا كانت الكميات المطلوبة في السلة ستستهلك من دفعتين أو أكثر
   * بنغمات ألوان أو عيارات مختلفة لنفس الصنف.
   *
   * @returns قائمة الأصناف التي ستحتوي على تعارض خلط نغمات
   */
  public checkToneMixing(
    items: Array<{
      productId: string;
      productName: string;
      warehouseId: string;
      quantityM2: number;
    }>
  ): ToneMixingConflict[] {
    const conflicts: ToneMixingConflict[] = [];

    for (const item of items) {
      const batches = this.db.query<{
        id: string;
        batchNumber: string;
        toneShade: string;
        caliber: string;
        quantityRemainingM2: number;
      }>(
        `SELECT
           id,
           batch_number             AS batchNumber,
           tone_shade               AS toneShade,
           caliber,
           quantity_remaining_m2    AS quantityRemainingM2
         FROM product_batches
         WHERE product_id = ? AND warehouse_id = ? AND quantity_remaining_m2 > 0.001
         ORDER BY created_at ASC, id ASC`,
        [item.productId, item.warehouseId]
      );

      // لا توجد دفعات مسجلة لهذا الصنف → التتبع غير مفعَّل → لا تحذير
      if (batches.length === 0) continue;

      // محاكاة سحب FIFO
      let remaining = item.quantityM2;
      const used: ToneMixingConflict['batches'] = [];

      for (const b of batches) {
        if (remaining <= 0.001) break;
        const take = Math.min(remaining, b.quantityRemainingM2);
        if (take > 0.001) {
          used.push({
            batchNumber: b.batchNumber,
            toneShade:   b.toneShade,
            caliber:     b.caliber,
            requiredM2:  Math.round(take * 100) / 100,
          });
          remaining -= take;
        }
      }

      if (used.length < 2) continue; // دفعة واحدة فقط → لا خلط

      const tones    = new Set(used.map((b) => b.toneShade));
      const calibers = new Set(used.map((b) => b.caliber));

      if (tones.size > 1 || calibers.size > 1) {
        conflicts.push({
          productId:   item.productId,
          productName: item.productName,
          batches:     used,
        });
      }
    }

    return conflicts;
  }

  // ─── Stock Deduction / Restoration ──────────────────────────────────────────

  /**
   * يستهلك من الدفعات بنظام FIFO عند تأكيد فاتورة البيع.
   * إذا لا توجد دفعات مسجلة للصنف → no-op (التتبع اختياري).
   */
  public deductFromBatches(
    productId: string,
    warehouseId: string,
    quantityM2: number
  ): { tracked: boolean; deductedM2: number; allocations: Array<{ batchId: string; quantityM2: number }> } {
    const batches = this.db.query<{ id: string; quantityRemainingM2: number }>(
      `SELECT id, quantity_remaining_m2 AS quantityRemainingM2
       FROM product_batches
       WHERE product_id = ? AND warehouse_id = ?
       ORDER BY created_at ASC, id ASC`,
      [productId, warehouseId]
    );

    let remaining = quantityM2;
    const initialQuantity = quantityM2;
    if (batches.length === 0) return { tracked: false, deductedM2: 0, allocations: [] };
    const allocations: Array<{ batchId: string; quantityM2: number }> = [];
    for (const batch of batches) {
      if (remaining <= 0.001) break;
      const deduct = Math.min(remaining, batch.quantityRemainingM2);
      if (deduct <= 0) continue;
      this.db.run(
        `UPDATE product_batches
         SET quantity_remaining_m2 = MAX(0, quantity_remaining_m2 - ?)
         WHERE id = ?`,
        [deduct, batch.id]
      );
      allocations.push({ batchId: batch.id, quantityM2: deduct });
      remaining -= deduct;
    }
    if (remaining > 0.001) {
      throw new Error(`Insufficient tracked batch quantity for product ${productId}: short ${remaining.toFixed(3)} m².`);
    }
    return { tracked: true, deductedM2: initialQuantity - remaining, allocations };
  }

  /** Return stock to the exact lots consumed by the original invoice line. */
  public restoreForSaleReturn(input: {
    returnItemId: string;
    invoiceId: string;
    productId: string;
    warehouseId: string;
    quantityM2: number;
    costPrice: number;
    performedBy: string;
    reason: string;
  }): void {
    let remaining = input.quantityM2;
    const allocations = this.db.query<{
      id: string;
      batchId: string;
      quantityM2: number;
      returnedM2: number;
    }>(`
      SELECT a.id, a.batch_id AS batchId, a.quantity_m2 AS quantityM2,
        a.returned_m2 AS returnedM2
      FROM sales_invoice_batch_allocations a
      JOIN sales_invoice_items sii ON sii.id = a.invoice_item_id
      JOIN product_batches b ON b.id = a.batch_id
      WHERE sii.invoice_id = ? AND sii.product_id = ?
        AND a.quantity_m2 - a.returned_m2 > 0.001
      ORDER BY b.created_at ASC, b.id ASC, a.created_at ASC, a.id ASC
    `, [input.invoiceId, input.productId]);

    for (const allocation of allocations) {
      if (remaining <= 0.001) break;
      const available = Math.max(0, allocation.quantityM2 - allocation.returnedM2);
      const restore = Math.min(remaining, available);
      if (restore <= 0) continue;
      this.db.run(
        `UPDATE product_batches
         SET quantity_remaining_m2 = MIN(quantity_m2, quantity_remaining_m2 + ?)
         WHERE id = ?`,
        [restore, allocation.batchId]
      );
      this.db.run(
        `UPDATE sales_invoice_batch_allocations SET returned_m2 = returned_m2 + ? WHERE id = ?`,
        [restore, allocation.id]
      );
      this.db.run(`
        INSERT INTO sales_return_batch_allocations
          (id, return_item_id, sale_allocation_id, batch_id, quantity_m2, is_pending)
        VALUES (?, ?, ?, ?, ?, 0)
      `, [`rba_${uuidv4().substring(0, 8)}`, input.returnItemId, allocation.id, allocation.batchId, restore]);
      remaining -= restore;
    }

    if (remaining > 0.001) {
      const pendingBatchId = `batch_ret_${uuidv4().substring(0, 10)}`;
      this.db.run(`
        INSERT INTO product_batches (
          id, product_id, warehouse_id, batch_number, tone_shade, caliber,
          cost_price, quantity_m2, quantity_remaining_m2, notes, created_by
        ) VALUES (?, ?, ?, ?, 'RETURN-PENDING', 'غير محدد', ?, ?, ?, ?, ?)
      `, [
        pendingBatchId, input.productId, input.warehouseId,
        `RET-${input.returnItemId.slice(-8)}`, input.costPrice, remaining, remaining,
        `مرتجع لم يمكن ربطه بدفعة البيع الأصلية. السبب: ${input.reason}`,
        input.performedBy,
      ]);
      this.db.run(`
        INSERT INTO sales_return_batch_allocations
          (id, return_item_id, sale_allocation_id, batch_id, quantity_m2, is_pending)
        VALUES (?, ?, NULL, ?, ?, 1)
      `, [`rba_${uuidv4().substring(0, 8)}`, input.returnItemId, pendingBatchId, remaining]);
    }
  }

  /** Reverse a sale using its original batch allocations; legacy sales get a distinct pending lot. */
  public restoreForInvoiceVoid(input: {
    invoiceId: string;
    productId: string;
    warehouseId: string;
    quantityM2: number;
    costPrice: number;
    performedBy: string;
    reason: string;
  }): void {
    let remaining = input.quantityM2;
    const allocations = this.db.query<{
      id: string;
      batchId: string;
      quantityM2: number;
      returnedM2: number;
    }>(`
      SELECT a.id, a.batch_id AS batchId, a.quantity_m2 AS quantityM2,
        a.returned_m2 AS returnedM2
      FROM sales_invoice_batch_allocations a
      JOIN sales_invoice_items sii ON sii.id = a.invoice_item_id
      JOIN product_batches b ON b.id = a.batch_id
      WHERE sii.invoice_id = ? AND sii.product_id = ?
        AND a.quantity_m2 - a.returned_m2 > 0.001
      ORDER BY b.created_at ASC, b.id ASC, a.created_at ASC, a.id ASC
    `, [input.invoiceId, input.productId]);

    for (const allocation of allocations) {
      if (remaining <= 0.001) break;
      const restore = Math.min(remaining, allocation.quantityM2 - allocation.returnedM2);
      if (restore <= 0) continue;
      this.db.run(
        'UPDATE product_batches SET quantity_remaining_m2 = MIN(quantity_m2, quantity_remaining_m2 + ?) WHERE id = ?',
        [restore, allocation.batchId]
      );
      this.db.run(
        'UPDATE sales_invoice_batch_allocations SET returned_m2 = returned_m2 + ? WHERE id = ?',
        [restore, allocation.id]
      );
      remaining -= restore;
    }

    if (remaining > 0.001) {
      const pendingBatchId = `batch_void_${uuidv4().substring(0, 10)}`;
      this.db.run(`
        INSERT INTO product_batches (
          id, product_id, warehouse_id, batch_number, tone_shade, caliber,
          cost_price, quantity_m2, quantity_remaining_m2, notes, created_by
        ) VALUES (?, ?, ?, ?, 'RETURN-PENDING', 'غير محدد', ?, ?, ?, ?, ?)
      `, [
        pendingBatchId, input.productId, input.warehouseId,
        `VOID-${input.invoiceId.slice(-8)}`, input.costPrice, remaining, remaining,
        `مرتجع إلغاء فاتورة بلا تخصيص دفعات أصلي. السبب: ${input.reason}`,
        input.performedBy,
      ]);
    }
  }

}
