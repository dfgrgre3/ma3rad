import { v4 as uuidv4 } from 'uuid';
import { localDateString } from '../../../../utils/shared/date';
import { postLedgerEntry } from '../../../../database/repositories/ledger';
import { InventoryLocationStockService } from '../../inventory/InventoryLocationStockService';
import { InventoryCostingService } from '../../inventory/InventoryCostingService';
import type { ManufacturingContext } from './context';
import type { ProductionOrdersModule } from './productionOrders';
import type {
  CreateQualityCheckDTO,
  QualityCheck,
  QualityDefectCode,
  QualityCheckDefectInput,
  UpdateQualityCheckDTO,
} from './types';

/** Manufacturing quality-check queries. Extracted verbatim from ManufacturingService. */
export class QualityModule {
  private readonly ctx: ManufacturingContext;
  private readonly orders: ProductionOrdersModule;
  constructor(ctx: ManufacturingContext, orders: ProductionOrdersModule) { this.ctx = ctx; this.orders = orders; }

  public createQualityCheck(input: CreateQualityCheckDTO): QualityCheck {
    this.ctx.guardWrites();
    const actor = this.ctx.requireAny(['manufacturing.manage', 'manufacturing.quality.manage']);
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
    const optionalQty = (value: number | undefined) => {
      if (value === undefined || value === null) return null;
      const v = Number(value);
      if (!Number.isFinite(v) || v < 0) throw new Error('قيمة خطة المعاينة غير صالحة.');
      return v;
    };
    this.ctx.db.executeFinancialTransaction((db) => {
      db.run(
        `INSERT INTO manufacturing_quality_checks
          (id, production_order_id, inspection_type, result, quantity_inspected, quantity_accepted, quantity_rejected,
           sample_size, accept_number, reject_number, notes, inspector_id, branch_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, input.productionOrderId, inspectionType, result, inspected, accepted, rejected,
          optionalQty(input.sampleSize), optionalQty(input.acceptNumber), optionalQty(input.rejectNumber),
          notes, actor.id, order.branchId, now, now]
      );
      this.insertCheckDefects(db, id, input.defects);
    });
    this.ctx.audit('إضافة فحص جودة', id, { productionOrderId: input.productionOrderId, result });
    return this.getQualityCheck(id);
  }

  private insertCheckDefects(
    db: { run: (sql: string, params?: any[]) => void },
    checkId: string,
    defects?: QualityCheckDefectInput[]
  ): void {
    if (!defects?.length) return;
    const seen = new Set<string>();
    for (const defect of defects) {
      const qty = Number(defect.quantity);
      if (!defect.defectCodeId || seen.has(defect.defectCodeId)) continue;
      if (!Number.isFinite(qty) || qty <= 0) throw new Error('كمية العيب غير صالحة.');
      const code = this.ctx.db.query<{ id: string }>(
        `SELECT id FROM manufacturing_defect_codes WHERE id = ? AND is_active = 1`,
        [defect.defectCodeId]
      )[0];
      if (!code) throw new Error('كود العيب غير موجود أو غير نشط.');
      seen.add(defect.defectCodeId);
      db.run(
        `INSERT INTO manufacturing_quality_check_defects (id, quality_check_id, defect_code_id, quantity, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [`mqcd_${uuidv4().replace(/-/g, '').slice(0, 12)}`, checkId, defect.defectCodeId, qty, new Date().toISOString()]
      );
    }
  }

  private loadCheckDefects(checkIds: string[]): Map<string, QualityCheck['defects']> {
    const map = new Map<string, QualityCheck['defects']>();
    if (checkIds.length === 0) return map;
    const placeholders = checkIds.map(() => '?').join(',');
    const rows = this.ctx.db.query<any>(
      `SELECT d.quality_check_id AS checkId, d.defect_code_id AS defectCodeId, d.quantity,
              dc.code AS defectCode, dc.name AS defectName
       FROM manufacturing_quality_check_defects d
       JOIN manufacturing_defect_codes dc ON dc.id = d.defect_code_id
       WHERE d.quality_check_id IN (${placeholders})
       ORDER BY dc.code`,
      checkIds
    );
    for (const row of rows) {
      const list = map.get(row.checkId) || [];
      list.push({
        defectCodeId: row.defectCodeId,
        defectCode: row.defectCode,
        defectName: row.defectName,
        quantity: Number(row.quantity) || 0,
      });
      map.set(row.checkId, list);
    }
    return map;
  }

  /** Defect-code catalog for quality inspections (branch-scoped). */
  public getDefectCodes(includeInactive = false): QualityDefectCode[] {
    const actor = this.ctx.requireAny(['manufacturing.view', 'manufacturing.quality.view']);
    const scope = this.ctx.branchAccess.sqlScope('d.branch_id', undefined, actor);
    const rows = this.ctx.db.query<any>(
      `SELECT d.* FROM manufacturing_defect_codes d
       WHERE ${scope.clause} ${includeInactive ? '' : 'AND d.is_active = 1'}
       ORDER BY d.code`,
      scope.params
    );
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      branchId: row.branchId ?? null,
      isActive: Number(row.isActive ?? 1) === 1,
      createdAt: row.createdAt,
    }));
  }

  public createDefectCode(input: { code: string; name: string; branchId?: string }): QualityDefectCode {
    this.ctx.guardWrites();
    const actor = this.ctx.requireAny(['manufacturing.manage', 'manufacturing.quality.manage']);
    const code = (input.code || '').trim();
    const name = (input.name || '').trim();
    if (!code || !name) throw new Error('رمز العيب واسمها مطلوبان.');
    const branchId = input.branchId || this.ctx.branchAccess.getDefaultAccessibleBranchId(actor);
    this.ctx.branchAccess.requireBranchAccess(branchId, actor);
    const id = `mqdc_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    this.ctx.db.run(
      `INSERT INTO manufacturing_defect_codes (id, code, name, branch_id, is_active, created_at)
       VALUES (?, ?, ?, ?, 1, ?)`,
      [id, code, name, branchId, new Date().toISOString()]
    );
    this.ctx.audit('إضافة كود عيب جودة', id, { code, name });
    return this.getDefectCodes(true).find((row) => row.id === id)!;
  }

  public deactivateDefectCode(id: string): void {
    this.ctx.guardWrites();
    const actor = this.ctx.requireAny(['manufacturing.manage', 'manufacturing.quality.manage']);
    const row = this.ctx.db.query<any>(`SELECT branch_id AS branchId FROM manufacturing_defect_codes WHERE id = ?`, [id])[0];
    if (!row) throw new Error('كود العيب غير موجود.');
    if (row.branchId) this.ctx.branchAccess.requireBranchAccess(row.branchId, actor);
    this.ctx.db.run(`UPDATE manufacturing_defect_codes SET is_active = 0 WHERE id = ?`, [id]);
    this.ctx.audit('إيقاف كود عيب جودة', id, null);
  }

  public getQualityCheck(id: string): QualityCheck {
    const actor = this.ctx.requireAny(['manufacturing.view', 'manufacturing.quality.view']);
    const row = this.ctx.db.query<any>(
      `SELECT * FROM manufacturing_quality_checks WHERE id = ?`,
      [id]
    )[0];
    if (!row) throw new Error('سجل فحص الجودة غير موجود.');
    if (row.branchId) this.ctx.branchAccess.requireBranchAccess(row.branchId, actor);
    const check = this.mapQualityCheck(row);
    check.defects = this.loadCheckDefects([id]).get(id) || [];
    return check;
  }

  public getQualityChecks(productionOrderId?: string): QualityCheck[] {
    const actor = this.ctx.requireAny(['manufacturing.view', 'manufacturing.quality.view']);
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
    const defects = this.loadCheckDefects(rows.map((row) => row.id));
    return rows.map((row) => {
      const check = this.mapQualityCheck(row);
      check.defects = defects.get(row.id) || [];
      return check;
    });
  }

  public updateQualityCheck(id: string, input: UpdateQualityCheckDTO): QualityCheck {
    this.ctx.guardWrites();
    const actor = this.ctx.requireAny(['manufacturing.manage', 'manufacturing.quality.manage']);
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
    for (const [field, column] of [
      ['sampleSize', 'sample_size'],
      ['acceptNumber', 'accept_number'],
      ['rejectNumber', 'reject_number'],
    ] as const) {
      const value = input[field];
      if (value === undefined) continue;
      if (value === null) { updates.push(`${column} = ?`); params.push(null); continue; }
      const v = Number(value);
      if (!Number.isFinite(v) || v < 0) throw new Error('قيمة خطة المعاينة غير صالحة.');
      updates.push(`${column} = ?`); params.push(v);
    }
    if (input.notes !== undefined) {
      updates.push('notes = ?');
      params.push(input.notes === null ? null : (input.notes?.trim() || null));
    }
    const hasDefectUpdate = input.defects !== undefined;
    if (updates.length === 0 && !hasDefectUpdate) return this.getQualityCheck(id);
    if (updates.length > 0) {
      updates.push('updated_at = ?');
      params.push(new Date().toISOString());
      params.push(id);
      this.ctx.db.run(`UPDATE manufacturing_quality_checks SET ${updates.join(', ')} WHERE id = ?`, params);
    }
    if (hasDefectUpdate) {
      this.ctx.db.executeFinancialTransaction((db) => {
        db.run(`DELETE FROM manufacturing_quality_check_defects WHERE quality_check_id = ?`, [id]);
        this.insertCheckDefects(db, id, input.defects);
      });
    }
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
      sampleSize: row.sampleSize === null || row.sampleSize === undefined ? null : Number(row.sampleSize),
      acceptNumber: row.acceptNumber === null || row.acceptNumber === undefined ? null : Number(row.acceptNumber),
      rejectNumber: row.rejectNumber === null || row.rejectNumber === undefined ? null : Number(row.rejectNumber),
      disposition: row.disposition || 'NONE',
      dispositionQty: Number(row.dispositionQty || 0),
      dispositionAt: row.dispositionAt ?? null,
      notes: row.notes ?? null,
      inspectorId: row.inspectorId ?? null,
      branchId: row.branchId ?? null,
      defects: [],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  public recordQualityDisposition(id: string, disposition: 'ACCEPT' | 'SCRAP' | 'REWORK' | 'RETURN', quantity: number, _notes?: string): QualityCheck {
    this.ctx.guardWrites();
    const actor = this.ctx.requireAny(['manufacturing.manage', 'manufacturing.quality.manage']);
    const existing = this.ctx.db.query<any>(`SELECT * FROM manufacturing_quality_checks WHERE id = ?`, [id])[0];
    if (!existing) throw new Error('سجل فحص الجودة غير موجود.');
    if (existing.branchId) this.ctx.branchAccess.requireBranchAccess(existing.branchId, actor);
    if (!['ACCEPT', 'SCRAP', 'REWORK', 'RETURN'].includes(disposition)) throw new Error('قرار المعالجة غير صالح.');
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty < 0) throw new Error('الكمية غير صالحة.');

    const order = this.orders.getOrderInternal(existing.productionOrderId);
    const warehouseId = order?.warehouseId || null;
    const productId = order?.productId || null;
    const now = new Date().toISOString();

    this.ctx.db.executeFinancialTransaction((db) => {
      // QC-gated receipts sit in production_qc_holds, not in sellable stock.
      // ACCEPT releases them back; SCRAP/REWORK consume the hold first and
      // only touch warehouse_stock for any quantity that was never held.
      const holds = (qty > 0 && warehouseId && productId && order)
        ? db.query<any>(
          `SELECT * FROM production_qc_holds WHERE production_order_id = ? AND status = 'HELD' ORDER BY created_at, id`,
          [order.id]
        )
        : [];

      const releaseHoldToStock = (hold: any, take: number): void => {
        db.run(
          `INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, last_updated)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(warehouse_id, product_id) DO UPDATE SET quantity_m2 = quantity_m2 + ?, last_updated = ?`,
          [`ws_${uuidv4().replace(/-/g, '').slice(0, 12)}`, warehouseId, order!.productId, take, now, take, now]
        );
        InventoryLocationStockService.receive(db, {
          warehouseId: warehouseId!,
          productId: order!.productId,
          quantity: take,
          actorId: actor.id,
          reason: `قبول جودة — إفراج من الحجر (${id})`,
        });
        const unitCost = Number(hold.unitCost || 0) / 100;
        const txId = `itx_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
        db.run(
          `INSERT INTO inventory_transactions (id, transaction_number, type, product_id, warehouse_id, quantity_m2, boxes_count, unit_cost, total_cost, reference_type, reference_id, notes, performed_by, created_at)
           VALUES (?, ?, 'ADJUSTMENT_ADD', ?, ?, ?, 0, ROUND(?*100), ROUND(?*100), 'QUALITY_ACCEPT', ?, 'قبول جودة — إفراج من الحجر', ?, ?)`,
          [txId, db.nextNumber('INV'), order!.productId, warehouseId, take, unitCost, take * unitCost, hold.id, actor.id, now]
        );
        if (InventoryCostingService.costingMethod(db) === 'FIFO') {
          InventoryCostingService.addLayer(db, {
            productId: order!.productId,
            warehouseId: warehouseId!,
            sourceTransactionId: txId,
            sourceType: 'QUALITY_ACCEPT',
            sourceId: hold.id,
            batchId: hold.productBatchId || undefined,
            date: localDateString(),
            quantity: take,
            unitCost,
          });
        }
        if (hold.productBatchId) {
          db.run(
            `UPDATE product_batches SET quantity_remaining_m2 = MIN(quantity_m2, quantity_remaining_m2 + ?) WHERE id = ?`,
            [take, hold.productBatchId]
          );
        }
      };

      const consumeHold = (hold: any, take: number, status: 'ACCEPTED' | 'SCRAPPED' | 'REWORKED'): number => {
        const remaining = Math.round((Number(hold.quantityM2) - take) * 1e6) / 1e6;
        db.run(
          `UPDATE production_qc_holds SET quantity_m2 = ?, total_cost = ROUND(?*100), status = ?, resolved_at = ? WHERE id = ?`,
          [Math.max(0, remaining), take * Number(hold.unitCost || 0), remaining <= 1e-6 ? status : 'HELD', remaining <= 1e-6 ? now : null, hold.id]
        );
        return take * (Number(hold.unitCost || 0) / 100);
      };

      /** Draw up to `amount` from HELD rows; returns { consumed, value }. */
      const drawFromHolds = (amount: number, onTake: (hold: any, take: number) => number): { consumed: number; value: number } => {
        let remaining = amount;
        let value = 0;
        for (const hold of holds) {
          if (remaining <= 1e-6) break;
          const take = Math.min(Number(hold.quantityM2), remaining);
          if (take <= 0) continue;
          value += onTake(hold, take);
          remaining = Math.round((remaining - take) * 1e6) / 1e6;
        }
        return { consumed: Math.round((amount - remaining) * 1e6) / 1e6, value: Math.round(value * 100) / 100 };
      };

      if (disposition === 'ACCEPT' && qty > 0 && order) {
        drawFromHolds(qty, (hold, take) => {
          releaseHoldToStock(hold, take);
          return consumeHold(hold, take, 'ACCEPTED');
        });
      }

      // SCRAP reduces finished-goods stock and posts the write-off value to
      // the ledger: Dr 5201 (Damage Loss) / Cr 1104 (Inventory).
      if (disposition === 'SCRAP' && qty > 0 && warehouseId && productId) {
        const held = drawFromHolds(qty, (hold, take) => consumeHold(hold, take, 'SCRAPPED'));
        const remainder = Math.round((qty - held.consumed) * 1e6) / 1e6;
        if (remainder > 1e-6) {
          const stock = db.query<{ quantityM2: number }>(
            `SELECT quantity_m2 AS quantityM2 FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?`,
            [warehouseId, productId]
          )[0];
          const current = Number(stock?.quantityM2 || 0);
          if (current < remainder) throw new Error('الرصيد المتاح غير كافٍ للإتلاف.');
          db.run(
            `UPDATE warehouse_stock SET quantity_m2 = quantity_m2 - ?, last_updated = ? WHERE warehouse_id = ? AND product_id = ?`,
            [remainder, now, warehouseId, productId]
          );
          InventoryLocationStockService.release(db, {
            warehouseId,
            productId,
            quantity: remainder,
            actorId: actor.id,
            reason: 'إتلاف (Scrap)',
          });
          const txNumber = db.nextNumber('INV');
          db.run(
            `INSERT INTO inventory_transactions (id, transaction_number, type, product_id, warehouse_id, quantity_m2, boxes_count, unit_cost, total_cost, reference_type, reference_id, notes, performed_by, created_at)
             VALUES (?, ?, 'ADJUSTMENT_SUB', ?, ?, ?, 0, 0, 0, 'QUALITY_DISPOSITION', ?, 'إتلاف (Scrap)', ?, ?)`,
            [`itx_${uuidv4().replace(/-/g, '').slice(0, 12)}`, txNumber, productId, warehouseId, remainder, id, actor.id, now]
          );
          const unitCost = Number(
            db.query<{ costPrice: number }>(`SELECT cost_price AS costPrice FROM products WHERE id = ?`, [productId])[0]?.costPrice || 0
          ) / 100;
          held.value += remainder * unitCost;
        }
        const scrapValue = Math.round(held.value * 100) / 100;
        if (scrapValue > 0) {
          postLedgerEntry(db.getDatabase(), {
            date: localDateString(),
            description: `إتلاف جودة - فحص ${id}: ${qty} وحدة`,
            referenceType: 'QUALITY_SCRAP',
            referenceId: id,
            createdBy: actor.id,
            branchId: order?.branchId || null,
            lines: [
              { accountCode: '5201', debit: scrapValue, credit: 0 },
              { accountCode: '1104', debit: 0, credit: scrapValue },
            ],
          });
        }
      }

      // REWORK pulls the rejected quantity off the finished-goods shelf (or
      // consumes the QC hold) and spawns a linked rework production order —
      // the rejected units are NOT written off and the source order keeps its
      // produced_qty. Unlike SCRAP there is no loss posting.
      // QC-held quantities are consumed from the hold instead of the shelf.
      if (disposition === 'REWORK' && qty > 0 && warehouseId && productId && order) {
        const held = drawFromHolds(qty, (hold, take) => consumeHold(hold, take, 'REWORKED'));
        const remainder = Math.round((qty - held.consumed) * 1e6) / 1e6;
        if (remainder > 1e-6) {
          const stock = db.query<{ quantityM2: number }>(
            `SELECT quantity_m2 AS quantityM2 FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?`,
            [warehouseId, productId]
          )[0];
          const current = Number(stock?.quantityM2 || 0);
          if (current < remainder) throw new Error('الرصيد المتاح غير كافٍ لسحب كمية إعادة العمل.');
          db.run(
            `UPDATE warehouse_stock SET quantity_m2 = quantity_m2 - ?, last_updated = ? WHERE warehouse_id = ? AND product_id = ?`,
            [remainder, now, warehouseId, productId]
          );
          InventoryLocationStockService.release(db, {
            warehouseId,
            productId,
            quantity: remainder,
            actorId: actor.id,
            reason: 'إعادة عمل (Rework)',
          });
          const txNumber = db.nextNumber('INV');
          db.run(
            `INSERT INTO inventory_transactions (id, transaction_number, type, product_id, warehouse_id, quantity_m2, boxes_count, unit_cost, total_cost, reference_type, reference_id, notes, performed_by, created_at)
             VALUES (?, ?, 'ADJUSTMENT_SUB', ?, ?, ?, 0, 0, 0, 'QUALITY_REWORK', ?, 'إعادة عمل (Rework)', ?, ?)`,
            [`itx_${uuidv4().replace(/-/g, '').slice(0, 12)}`, txNumber, productId, warehouseId, remainder, id, actor.id, now]
          );
          const reworkUnitCost = Number(
            db.query<{ costPrice: number }>(`SELECT cost_price AS costPrice FROM products WHERE id = ?`, [productId])[0]?.costPrice || 0
          ) / 100;
          held.value += remainder * reworkUnitCost;
        }
        // Reworked units return to work-in-process at their frozen hold cost:
        // Dr 1205 (WIP) / Cr 1104 (inventory) — the linked rework order will
        // re-issue materials and post its own receipt transfer.
        const reworkValue = Math.round(held.value * 100) / 100;
        if (reworkValue > 0.004) {
          postLedgerEntry(db.getDatabase(), {
            date: localDateString(),
            description: `إعادة عمل جودة - فحص ${id}: ${qty} وحدة تعود للتشغيل`,
            referenceType: 'QUALITY_REWORK',
            referenceId: `${id}:REWORK`,
            createdBy: actor.id,
            branchId: order?.branchId || existing.branchId || null,
            lines: [
              { accountCode: '1205', debit: reworkValue, credit: 0 },
              { accountCode: '1104', debit: 0, credit: reworkValue },
            ],
          });
        }
        // The rework order is the production vehicle for the rejected qty —
        // created inside this transaction (savepoint) so disposition and
        // re-order stay atomic. The source order is not reopened.
        this.orders.createReworkOrder(order.id, qty, { qualityCheckId: id });
      }

      db.run(
        `UPDATE manufacturing_quality_checks SET disposition = ?, disposition_qty = ?, disposition_at = ?, updated_at = ? WHERE id = ?`,
        [disposition, qty, now, now, id]
      );
    });
    this.ctx.audit('قرار معالجة جودة', id, { disposition, quantity: qty });
    const updated = this.getQualityCheck(id);
    if (updated.productionOrderId && disposition === 'REWORK') {
      const linked = this.orders.getOrderInternal(updated.productionOrderId);
      if (linked?.salesOrderId) this.orders.syncSalesOrderStatus(linked.salesOrderId);
    }
    return updated;
  }
}
