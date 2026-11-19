import { v4 as uuidv4 } from 'uuid';
import { localDateString } from '../../../../utils/shared/date';
import { InventoryLocationStockService } from '../../inventory/InventoryLocationStockService';
import type { ManufacturingContext } from './context';
import type { BomsModule } from './boms';
import { assertDate, PRIORITIES } from './shared';
import type {
  CreateProductionOrderDTO,
  ProductionMaterialStatus,
  ProductionOrder,
  ProductionOrderMaterial,
  ProductionOrderOperation,
  WipOrder,
} from './types';

/** Production-order lifecycle queries. Extracted verbatim from ManufacturingService. */
export class ProductionOrdersModule {
  constructor(private ctx: ManufacturingContext, private boms: BomsModule) {}

  private decorateOrder(order: ProductionOrder): ProductionOrder {
    return order;
  }

  public loadOrderMaterials(orderId: string): ProductionOrderMaterial[] {
    return this.ctx.db.query<ProductionOrderMaterial>(
      `SELECT m.*, p.name AS product_name
       FROM production_order_materials m
       LEFT JOIN products p ON p.id = m.product_id
       WHERE m.order_id = ?
       ORDER BY m.created_at`,
      [orderId]
    );
  }

  public loadOrderOperations(orderId: string): ProductionOrderOperation[] {
    return this.ctx.db.query<ProductionOrderOperation>(
      `SELECT o.*, w.name AS work_center_name
       FROM production_order_operations o
       LEFT JOIN work_centers w ON w.id = o.work_center_id
       WHERE o.order_id = ?
       ORDER BY o.sequence, o.created_at`,
      [orderId]
    );
  }

  public getOrderInternal(id: string): ProductionOrder | null {
    const rows = this.ctx.db.query<ProductionOrder>(
      `SELECT o.*, p.name AS product_name, b.name AS bom_name, br.name AS branch_name, w.name AS warehouseName, o.warehouse_id AS warehouseId
       FROM production_orders o
       JOIN products p ON p.id = o.product_id
       JOIN bills_of_materials b ON b.id = o.bom_id
       LEFT JOIN branches br ON br.id = o.branch_id
       LEFT JOIN warehouses w ON w.id = o.warehouse_id
       WHERE o.id = ?`,
      [id]
    );
    const order = (rows as unknown as ProductionOrder[])[0];
    if (!order) return null;
    order.materials = this.loadOrderMaterials(id);
    order.operations = this.loadOrderOperations(id);
    return order;
  }

  public getProductionOrders(branchId?: string): ProductionOrder[] {
    const actor = this.ctx.require('manufacturing.view');
    if (branchId) this.ctx.branchAccess.requireBranchAccess(branchId, actor);
    const scope = this.ctx.branchAccess.sqlScope('po.branch_id', undefined, actor);
    const conditions = [scope.clause];
    const params: Array<string> = [...scope.params];
    if (branchId) {
      conditions.push('po.branch_id = ?');
      params.push(branchId);
    }
    const orders = this.ctx.db.query<ProductionOrder>(
      `SELECT po.*, p.name AS product_name, b.name AS bom_name, br.name AS branch_name, w.name AS warehouseName, po.warehouse_id AS warehouseId
       FROM production_orders po
       JOIN products p ON p.id = po.product_id
       JOIN bills_of_materials b ON b.id = po.bom_id
       LEFT JOIN branches br ON br.id = po.branch_id
       LEFT JOIN warehouses w ON w.id = po.warehouse_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY po.created_at DESC`,
      params
    );
    return orders.map((order) => {
      order.materials = this.loadOrderMaterials(order.id);
      order.operations = this.loadOrderOperations(order.id);
      return order;
    });
  }

  public getProductionOrder(id: string): ProductionOrder {
    const actor = this.ctx.require('manufacturing.view');
    const order = this.getOrderInternal(id);
    if (!order) throw new Error('أمر الإنتاج غير موجود.');
    this.ctx.branchAccess.requireBranchAccess(order.branchId, actor);
    return order;
  }

  public createProductionOrder(input: CreateProductionOrderDTO): ProductionOrder {
    this.ctx.guardWrites();
    const actor = this.ctx.require('manufacturing.manage');
    if (!input.productId) throw new Error('يجب اختيار المنتج.');
    if (!input.bomId) throw new Error('يجب اختيار BOM.');
    if (!(input.quantity > 0)) throw new Error('كمية الإنتاج يجب أن تكون أكبر من صفر.');
    assertDate(input.startDate, 'تاريخ البدء');
    assertDate(input.dueDate, 'تاريخ الاستحقاق');
    if (input.startDate && input.dueDate && input.dueDate < input.startDate) {
      throw new Error('تاريخ الاستحقاق يجب أن يكون بعد تاريخ البدء.');
    }

    const product = this.ctx.db.query<{ id: string }>(`SELECT id FROM products WHERE id = ?`, [input.productId])[0];
    if (!product) throw new Error('المنتج المحدد غير موجود.');
    const bom = this.boms.getBom(input.bomId);
    if (bom.productId !== input.productId) throw new Error('BOM لا يتبع المنتج المحدد.');
    if (bom.status !== 'ACTIVE') throw new Error('يجب تفعيل BOM قبل إنشاء أمر الإنتاج.');
    const priority = input.priority || 'MEDIUM';
    if (!PRIORITIES.includes(priority)) throw new Error('أولوية أمر الإنتاج غير صالحة.');

    const branchId = input.branchId || this.ctx.branchAccess.getDefaultAccessibleBranchId(actor);
    this.ctx.branchAccess.requireBranchAccess(branchId, actor);

    let warehouseId: string | null | undefined = input.warehouseId;
    if (warehouseId) {
      const warehouseBranch = this.ctx.branchAccess.requireWarehouseAccess(warehouseId, actor);
      if (warehouseBranch !== branchId) throw new Error('المخزن لا يتبع الفرع المحدد.');
    } else {
      warehouseId = this.ctx.db.query<{ id: string }>(
        `SELECT id FROM warehouses WHERE branch_id = ? ORDER BY is_default DESC, id ASC LIMIT 1`,
        [branchId]
      )[0]?.id || null;
    }
    if (!warehouseId) throw new Error('لا يوجد مخزن مرتبط بالفرع.');

    const id = `po_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const orderNumber = this.ctx.db.nextNumber ? this.ctx.db.nextNumber('PO') : `PO-${Date.now()}`;
    const now = new Date().toISOString();
    this.ctx.db.executeFinancialTransaction((db) => {
      db.run(
        `INSERT INTO production_orders (id, order_number, product_id, bom_id, quantity, status, priority, start_date, due_date, branch_id, warehouse_id, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'PLANNED', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, orderNumber, input.productId, input.bomId, input.quantity, priority, input.startDate || null, input.dueDate || null, branchId, warehouseId, actor.id, now, now]
      );
      for (const item of bom.items) {
        db.run(
          `INSERT INTO production_order_materials (id, order_id, product_id, planned_qty, consumed_qty, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, 0, 'PENDING', ?, ?)`,
          [
            `pom_${uuidv4().replace(/-/g, '').slice(0, 12)}`, id, item.componentProductId,
            item.quantity * input.quantity, now, now,
          ]
        );
      }
      const operations = input.operations || [];
      operations.forEach((operation, index) => {
        const workCenter = this.ctx.db.query<{ id: string }>(`SELECT id FROM work_centers WHERE id = ?`, [operation.workCenterId])[0];
        if (!workCenter) throw new Error('مركز العمل المحدد غير موجود.');
        db.run(
          `INSERT INTO production_order_operations (id, order_id, work_center_id, sequence, planned_minutes, actual_minutes, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 0, 'PENDING', ?, ?)`,
          [
            `pop_${uuidv4().replace(/-/g, '').slice(0, 12)}`, id, operation.workCenterId,
            index, operation.plannedMinutes || 0, now, now,
          ]
        );
      });
      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
         VALUES (?, ?, ?, 'إنشاء أمر إنتاج', 'MANUFACTURING', ?, ?)`,
        [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id, JSON.stringify({ productId: input.productId, bomId: input.bomId, quantity: input.quantity })]
      );
    });
    return this.getProductionOrder(id);
  }

  public releaseOrder(id: string): ProductionOrder {
    this.ctx.guardWrites();
    this.ctx.require('manufacturing.manage');
    const order = this.getProductionOrder(id);
    if (order.status !== 'PLANNED') throw new Error('لا يمكن إصدار أمر إنتاج إلا إذا كان مخططاً.');
    this.ctx.db.run(
      `UPDATE production_orders SET status = 'RELEASED', updated_at = ? WHERE id = ?`,
      [new Date().toISOString(), id]
    );
    this.ctx.audit('إصدار أمر إنتاج', id, {});
    return this.getProductionOrder(id);
  }

  /** Link a released production order to an operations shift without starting it. */
  public assignOrderToShift(orderId: string, operationShiftId: string | null): ProductionOrder {
    this.ctx.guardWrites();
    this.ctx.require('manufacturing.manage');
    const order = this.getProductionOrder(orderId);
    if (operationShiftId) {
      const shift = this.ctx.db.query<{ branchId: string; status: string }>(
        'SELECT branch_id AS branchId, status FROM operation_shifts WHERE id = ?',
        [operationShiftId]
      )[0];
      if (!shift) throw new Error('وردية التشغيل غير موجودة.');
      if (shift.branchId !== order.branchId) throw new Error('وردية التشغيل لا تتبع فرع أمر الإنتاج.');
      if (!['OPEN', 'HANDOVER_PENDING'].includes(shift.status)) {
        throw new Error('يمكن ربط أمر الإنتاج بوردية تشغيل مفتوحة فقط.');
      }
    }
    this.ctx.db.run(
      'UPDATE production_orders SET operation_shift_id = ?, updated_at = ? WHERE id = ?',
      [operationShiftId, new Date().toISOString(), orderId]
    );
    this.ctx.audit('ربط أمر إنتاج بوردية تشغيل', orderId, { operationShiftId });
    return this.getProductionOrder(orderId);
  }

  public startOrder(id: string, operationShiftId?: string | null): ProductionOrder {
    this.ctx.guardWrites();
    this.ctx.require('manufacturing.manage');
    const order = this.getProductionOrder(id);
    if (order.status !== 'RELEASED') throw new Error('لا يمكن بدء أمر إنتاج إلا بعد إصداره.');
    if (operationShiftId != null) this.assignOrderToShift(id, operationShiftId);
    const now = new Date().toISOString();
    this.ctx.db.run(
      `UPDATE production_orders SET status = 'IN_PROGRESS', start_date = COALESCE(start_date, ?), updated_at = ? WHERE id = ?`,
      [localDateString(), now, id]
    );
    this.ctx.db.run(
      `UPDATE production_order_operations SET status = 'IN_PROGRESS', started_at = ?, updated_at = ? WHERE order_id = ? AND status = 'PENDING'`,
      [now, now, id]
    );
    this.ctx.audit('بدء أمر إنتاج', id, {});
    return this.getProductionOrder(id);
  }

  public completeOperation(operationId: string, actualMinutes: number): ProductionOrderOperation {
    this.ctx.guardWrites();
    this.ctx.require('manufacturing.manage');
    const operation = this.ctx.db.query<ProductionOrderOperation>(
      `SELECT * FROM production_order_operations WHERE id = ?`,
      [operationId]
    )[0];
    if (!operation) throw new Error('العملية غير موجودة.');
    const order = this.getProductionOrder(operation.orderId);
    if (order.status !== 'IN_PROGRESS') throw new Error('لا يمكن إكمال عملية إلا أثناء تنفيذ الأمر.');
    if (!Number.isFinite(actualMinutes) || actualMinutes < 0) throw new Error('الوقت الفعلي يجب أن يكون رقماً غير سالب.');

    const now = new Date().toISOString();
    this.ctx.db.run(
      `UPDATE production_order_operations SET status = 'COMPLETED', actual_minutes = ?, completed_at = ?, updated_at = ? WHERE id = ?`,
      [actualMinutes, now, now, operationId]
    );
    this.ctx.audit('إكمال عملية إنتاج', operationId, { actualMinutes });
    return this.ctx.db.query<ProductionOrderOperation>(
      `SELECT o.*, w.name AS work_center_name
       FROM production_order_operations o
       LEFT JOIN work_centers w ON w.id = o.work_center_id
       WHERE o.id = ?`,
      [operationId]
    )[0];
  }

  public consumeMaterial(materialId: string, quantity: number): ProductionOrderMaterial {
    this.ctx.guardWrites();
    this.ctx.require('manufacturing.manage');
    const material = this.ctx.db.query<ProductionOrderMaterial>(
      `SELECT * FROM production_order_materials WHERE id = ?`,
      [materialId]
    )[0];
    if (!material) throw new Error('مادة أمر الإنتاج غير موجودة.');
    const order = this.getProductionOrder(material.orderId);
    if (order.status !== 'IN_PROGRESS' && order.status !== 'RELEASED') {
      throw new Error('لا يمكن صرف مواد إلا أثناء تنفيذ أو إصدار الأمر.');
    }
    if (!Number.isFinite(quantity) || quantity < 0) throw new Error('كمية الصرف يجب أن تكون رقماً غير سالب.');
    const consumed = Math.min(material.plannedQty, material.consumedQty + quantity);
    const status: ProductionMaterialStatus = consumed >= material.plannedQty ? 'CONSUMED' : 'ISSUED';
    this.ctx.db.run(
      `UPDATE production_order_materials SET consumed_qty = ?, status = ?, updated_at = ? WHERE id = ?`,
      [consumed, status, new Date().toISOString(), materialId]
    );
    this.ctx.audit('صرف مواد إنتاج', materialId, { quantity, consumed });
    return this.ctx.db.query<ProductionOrderMaterial>(
      `SELECT m.*, p.name AS product_name
       FROM production_order_materials m
       LEFT JOIN products p ON p.id = m.product_id
       WHERE m.id = ?`,
      [materialId]
    )[0];
  }

  public completeOrder(id: string): ProductionOrder {
    this.ctx.guardWrites();
    const actor = this.ctx.require('manufacturing.manage');
    const order = this.getProductionOrder(id);
    if (order.status !== 'IN_PROGRESS') throw new Error('لا يمكن إكمال أمر إنتاج إلا أثناء تنفيذه.');
    const now = new Date().toISOString();
    const warehouseId = order.warehouseId;
    if (!warehouseId) throw new Error('أمر الإنتاج غير مرتبط بمخزن.');
    this.ctx.db.executeFinancialTransaction((db) => {
      // Consume planned materials from stock.
      for (const material of order.materials) {
        const stock = db.query<{ quantityM2: number }>(
          `SELECT quantity_m2 AS quantityM2 FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?`,
          [warehouseId, material.productId]
        )[0];
        const current = Number(stock?.quantityM2 || 0);
        if (current < material.plannedQty) {
          throw new Error(`الرصيد المتاح من ${material.productName || material.productId} غير كافٍ للإنتاج.`);
        }
        db.run(
          `UPDATE warehouse_stock SET quantity_m2 = quantity_m2 - ?, last_updated = ? WHERE warehouse_id = ? AND product_id = ?`,
          [material.plannedQty, now, warehouseId, material.productId]
        );
        InventoryLocationStockService.release(db, {
          warehouseId,
          productId: material.productId,
          quantity: material.plannedQty,
          actorId: actor.id,
          reason: 'صرف مواد إنتاج',
        });
        const txNumber = db.nextNumber('INV');
        db.run(
          `INSERT INTO inventory_transactions (id, transaction_number, type, product_id, warehouse_id, quantity_m2, boxes_count, unit_cost, total_cost, reference_type, reference_id, notes, performed_by, created_at)
           VALUES (?, ?, 'ADJUSTMENT_SUB', ?, ?, ?, 0, 0, 0, 'PRODUCTION_ORDER', ?, 'صرف مواد إنتاج', ?, ?)`,
          [`itx_${uuidv4().replace(/-/g, '').slice(0, 12)}`, txNumber, material.productId, warehouseId, material.plannedQty, id, actor.id, now]
        );
      }

      // Receive finished product into stock.
      db.run(
        `INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, last_updated)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(warehouse_id, product_id) DO UPDATE SET quantity_m2 = quantity_m2 + ?, last_updated = ?`,
        [`ws_${uuidv4().replace(/-/g, '').slice(0, 12)}`, warehouseId, order.productId, order.quantity, now, order.quantity, now]
      );
      InventoryLocationStockService.receive(db, {
        warehouseId,
        productId: order.productId,
        quantity: order.quantity,
        actorId: actor.id,
        reason: 'استلام منتج مصنّع',
      });
      const finishedTxNumber = db.nextNumber('INV');
      db.run(
        `INSERT INTO inventory_transactions (id, transaction_number, type, product_id, warehouse_id, quantity_m2, boxes_count, unit_cost, total_cost, reference_type, reference_id, notes, performed_by, created_at)
         VALUES (?, ?, 'ADJUSTMENT_ADD', ?, ?, ?, 0, 0, 0, 'PRODUCTION_ORDER', ?, 'استلام منتج مصنّع', ?, ?)`,
        [`itx_${uuidv4().replace(/-/g, '').slice(0, 12)}`, finishedTxNumber, order.productId, warehouseId, order.quantity, id, actor.id, now]
      );

      db.run(
        `UPDATE production_order_materials SET consumed_qty = planned_qty, status = 'CONSUMED', updated_at = ? WHERE order_id = ?`,
        [now, id]
      );
      db.run(
        `UPDATE production_order_operations SET status = 'COMPLETED', completed_at = COALESCE(completed_at, ?), actual_minutes = COALESCE(NULLIF(actual_minutes,0), planned_minutes), updated_at = ? WHERE order_id = ? AND status != 'SKIPPED'`,
        [now, now, id]
      );
      db.run(
        `UPDATE production_orders SET status = 'COMPLETED', completed_at = ?, updated_at = ? WHERE id = ?`,
        [now, now, id]
      );
      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
         VALUES (?, ?, ?, 'إكمال أمر إنتاج', 'MANUFACTURING', ?, ?)`,
        [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id, JSON.stringify({ quantity: order.quantity, warehouseId })]
      );
    });
    return this.getProductionOrder(id);
  }

  public getWipValuation(): { orders: WipOrder[]; totalMaterialCost: number; totalQuantity: number } {
    const actor = this.ctx.require('manufacturing.view');
    const scope = this.ctx.branchAccess.sqlScope('o.branch_id', undefined, actor);
    const rows = this.ctx.db.query<any>(
      `SELECT o.id, o.order_number AS orderNumber, o.product_id AS productId, p.name AS productName,
              o.quantity, o.status, o.branch_id AS branchId, p.cost_price / 100.0 AS finishedProductCostPrice
       FROM production_orders o
       JOIN products p ON p.id = o.product_id
       WHERE o.status IN ('RELEASED', 'IN_PROGRESS') AND ${scope.clause}
       ORDER BY o.created_at DESC`,
      scope.params
    );
    const orders: WipOrder[] = rows.map((row) => {
      const materials = this.ctx.db.query<any>(
        `SELECT m.planned_qty AS plannedQty, pr.cost_price / 100.0 AS costPrice
         FROM production_order_materials m
         JOIN products pr ON pr.id = m.product_id
         WHERE m.order_id = ?`,
        [row.id]
      );
      const materialCost = materials.reduce((sum, m) => sum + (Number(m.plannedQty) || 0) * (Number(m.costPrice) || 0), 0);
      return {
        orderId: row.id,
        orderNumber: row.orderNumber,
        productName: row.productName,
        quantity: Number(row.quantity) || 0,
        status: row.status,
        branchId: row.branchId,
        materialCost: Math.round(materialCost * 100) / 100,
        finishedProductCostPrice: Number(row.finishedProductCostPrice) || 0,
      };
    });
    const totalMaterialCost = Math.round(orders.reduce((s, o) => s + o.materialCost, 0) * 100) / 100;
    const totalQuantity = orders.reduce((s, o) => s + o.quantity, 0);
    return { orders, totalMaterialCost, totalQuantity };
  }

  public cancelOrder(id: string, reason?: string): ProductionOrder {
    this.ctx.guardWrites();
    this.ctx.require('manufacturing.manage');
    const order = this.getProductionOrder(id);
    if (order.status === 'COMPLETED' || order.status === 'CANCELLED') {
      throw new Error('لا يمكن إلغاء أمر إنتاج مكتمل أو ملغى بالفعل.');
    }
    this.ctx.db.run(
      `UPDATE production_orders SET status = 'CANCELLED', updated_at = ? WHERE id = ?`,
      [new Date().toISOString(), id]
    );
    this.ctx.audit('إلغاء أمر إنتاج', id, { reason: reason || null });
    return this.getProductionOrder(id);
  }
}
