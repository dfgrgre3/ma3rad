import { v4 as uuidv4 } from 'uuid';
import { localDateString } from '../../../../utils/shared/date';
import { InventoryLocationStockService } from '../../inventory/InventoryLocationStockService';
import type { ManufacturingContext } from './context';
import type { BomsModule } from './boms';
import { assertDate, PRIORITIES } from './shared';
import type {
  CreateProductionOrderDTO,
  CreateProductionOrderFromSalesItemDTO,
  ProductionMaterialStatus,
  ProductionFloorRow,
  ProductionOrder,
  ProductionOrderMaterial,
  ProductionOrderOperation,
  SalesOrderProductionCandidate,
  WipOrder,
} from './types';

/** Production-order lifecycle queries. Extracted verbatim from ManufacturingService. */
export class ProductionOrdersModule {
  private readonly ctx: ManufacturingContext;
  private readonly boms: BomsModule;
  constructor(ctx: ManufacturingContext, boms: BomsModule) { this.ctx = ctx; this.boms = boms; }

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
      `SELECT o.*, p.name AS product_name, b.name AS bom_name, br.name AS branch_name, w.name AS warehouseName, o.warehouse_id AS warehouseId,
              so.order_number AS salesOrderNumber, c.name AS customerName
       FROM production_orders o
       JOIN products p ON p.id = o.product_id
       JOIN bills_of_materials b ON b.id = o.bom_id
       LEFT JOIN branches br ON br.id = o.branch_id
       LEFT JOIN warehouses w ON w.id = o.warehouse_id
       LEFT JOIN orders so ON so.id = o.sales_order_id
       LEFT JOIN customers c ON c.id = o.customer_id
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
      `SELECT po.*, p.name AS product_name, b.name AS bom_name, br.name AS branch_name, w.name AS warehouseName, po.warehouse_id AS warehouseId,
              so.order_number AS salesOrderNumber, c.name AS customerName
       FROM production_orders po
       JOIN products p ON p.id = po.product_id
       JOIN bills_of_materials b ON b.id = po.bom_id
       LEFT JOIN branches br ON br.id = po.branch_id
       LEFT JOIN warehouses w ON w.id = po.warehouse_id
       LEFT JOIN orders so ON so.id = po.sales_order_id
       LEFT JOIN customers c ON c.id = po.customer_id
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

  /** Live production-floor snapshot for released/in-progress orders. */
  public getProductionFloor(): ProductionFloorRow[] {
    const actor = this.ctx.require('manufacturing.view');
    const scope = this.ctx.branchAccess.sqlScope('po.branch_id', undefined, actor);
    const orders = this.ctx.db.query<ProductionOrder>(
      `SELECT po.*, po.operation_shift_id AS operationShiftId, p.name AS product_name, b.name AS bom_name,
              br.name AS branch_name, w.name AS warehouseName, po.warehouse_id AS warehouseId,
              so.order_number AS salesOrderNumber, c.name AS customerName
       FROM production_orders po
       JOIN products p ON p.id = po.product_id
       JOIN bills_of_materials b ON b.id = po.bom_id
       LEFT JOIN branches br ON br.id = po.branch_id
       LEFT JOIN warehouses w ON w.id = po.warehouse_id
       LEFT JOIN orders so ON so.id = po.sales_order_id
       LEFT JOIN customers c ON c.id = po.customer_id
       WHERE po.status IN ('RELEASED', 'IN_PROGRESS') AND ${scope.clause}
       ORDER BY po.due_date IS NULL, po.due_date, po.created_at`,
      scope.params
    );
    return orders.map((order) => {
      const operations = this.loadOrderOperations(order.id);
      const materials = this.loadOrderMaterials(order.id);
      const opsCompleted = operations.filter((op) => op.status === 'COMPLETED').length;
      const opsInProgress = operations.filter((op) => op.status === 'IN_PROGRESS').length;
      const currentOp = operations.find((op) => op.status === 'IN_PROGRESS')
        || operations.find((op) => op.status === 'PENDING')
        || null;
      const materialsPlannedQty = materials.reduce((sum, row) => sum + Number(row.plannedQty || 0), 0);
      const materialsConsumedQty = materials.reduce((sum, row) => sum + Number(row.consumedQty || 0), 0);
      const progressPercent = operations.length > 0
        ? Math.round((opsCompleted / operations.length) * 100)
        : materialsPlannedQty > 0
          ? Math.round(Math.min(1, materialsConsumedQty / materialsPlannedQty) * 100)
          : 0;
      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        productName: order.productName,
        quantity: order.quantity,
        status: order.status,
        priority: order.priority,
        dueDate: order.dueDate,
        branchName: order.branchName,
        warehouseName: order.warehouseName,
        salesOrderNumber: order.salesOrderNumber,
        customerName: order.customerName,
        operationShiftId: (order as any).operationShiftId || null,
        opsTotal: operations.length,
        opsCompleted,
        opsInProgress,
        currentOperation: currentOp
          ? {
              workCenterName: currentOp.workCenterName,
              sequence: currentOp.sequence,
              plannedMinutes: currentOp.plannedMinutes,
              status: currentOp.status,
            }
          : null,
        materialsTotal: materials.length,
        materialsPlannedQty,
        materialsConsumedQty,
        materialsShort: materials.filter((row) => row.status === 'SHORTAGE').length,
        progressPercent,
      };
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

    // Optional make-to-order link back to the sales order / order item.
    let salesOrderId = input.salesOrderId?.trim() || null;
    const orderItemId = input.orderItemId?.trim() || null;
    let customerId = input.customerId?.trim() || null;
    if (salesOrderId) {
      const salesOrder = this.ctx.db.query<{ id: string; customerId: string; branchId: string | null; status: string }>(
        `SELECT id, customer_id AS customerId, branch_id AS branchId, status FROM orders WHERE id = ?`,
        [salesOrderId]
      )[0];
      if (!salesOrder) throw new Error('أمر البيع المحدد غير موجود.');
      if (salesOrder.status === 'CANCELLED') throw new Error('لا يمكن إنتاج أمر بيع ملغى.');
      if (salesOrder.branchId && salesOrder.branchId !== branchId) {
        throw new Error('أمر البيع لا يتبع الفرع المحدد.');
      }
      customerId = customerId || salesOrder.customerId || null;
    }
    if (orderItemId) {
      const item = this.ctx.db.query<{ id: string; orderId: string }>(
        `SELECT id, order_id AS orderId FROM order_items WHERE id = ?`,
        [orderItemId]
      )[0];
      if (!item) throw new Error('عنصر أمر البيع المحدد غير موجود.');
      if (salesOrderId && item.orderId !== salesOrderId) {
        throw new Error('عنصر أمر البيع لا يتبع أمر البيع المحدد.');
      }
      salesOrderId = salesOrderId || item.orderId;
      if (!salesOrderId) throw new Error('تعذر تحديد أمر البيع لعنصر الإنتاج.');
      const linked = this.ctx.db.query<{ id: string }>(
        `SELECT id FROM production_orders WHERE order_item_id = ? AND status != 'CANCELLED'`,
        [orderItemId]
      )[0];
      if (linked) throw new Error('يوجد أمر إنتاج نشط مرتبط بهذا العنصر بالفعل.');
    }
    const notes = input.notes === undefined ? null : (input.notes?.trim() || null);

    const id = `po_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const orderNumber = this.ctx.db.nextNumber ? this.ctx.db.nextNumber('PO') : `PO-${Date.now()}`;
    const now = new Date().toISOString();
    this.ctx.db.executeFinancialTransaction((db) => {
      db.run(
        `INSERT INTO production_orders (id, order_number, product_id, bom_id, quantity, status, priority, start_date, due_date, branch_id, warehouse_id, sales_order_id, order_item_id, customer_id, notes, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'PLANNED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, orderNumber, input.productId, input.bomId, input.quantity, priority, input.startDate || null, input.dueDate || null, branchId, warehouseId, salesOrderId, orderItemId, customerId, notes, actor.id, now, now]
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
    const created = this.getProductionOrder(id);
    if (created.salesOrderId) this.syncLinkedSalesOrderStatus(created.salesOrderId);
    return created;
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
    const started = this.getProductionOrder(id);
    if (started.salesOrderId) this.syncLinkedSalesOrderStatus(started.salesOrderId);
    return started;
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
    const completedOrder = this.getProductionOrder(id);
    if (completedOrder.salesOrderId) this.syncLinkedSalesOrderStatus(completedOrder.salesOrderId);
    return completedOrder;
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
    const cancelledOrder = this.getProductionOrder(id);
    if (cancelledOrder.salesOrderId) this.syncLinkedSalesOrderStatus(cancelledOrder.salesOrderId);
    return cancelledOrder;
  }

  /**
   * Production coverage progress for a sales order: only items whose product
   * has a BOM (i.e. manufactured items) are counted; stock items are ignored.
   */
  public getSalesOrderProductionProgress(salesOrderId: string): {
    salesOrderId: string;
    totalItems: number;
    producedItems: number;
    inProductionItems: number;
    pendingItems: number;
    allCompleted: boolean;
    coveragePercent: number;
  } {
    const actor = this.ctx.require('manufacturing.view');
    const order = this.ctx.db.query<{ branchId: string | null }>(
      `SELECT branch_id AS branchId FROM orders WHERE id = ?`, [salesOrderId]
    )[0];
    if (!order) throw new Error('أمر البيع غير موجود.');
    if (order.branchId) this.ctx.branchAccess.requireBranchAccess(order.branchId, actor);
    return this.computeSalesOrderProductionProgress(salesOrderId);
  }

  private computeSalesOrderProductionProgress(salesOrderId: string): {
    salesOrderId: string;
    totalItems: number;
    producedItems: number;
    inProductionItems: number;
    pendingItems: number;
    allCompleted: boolean;
    coveragePercent: number;
  } {
    const items = this.ctx.db.query<{ orderItemId: string; statuses: string | null }>(
      `SELECT oi.id AS orderItemId,
              (SELECT GROUP_CONCAT(po.status, ',') FROM production_orders po
                WHERE po.order_item_id = oi.id AND po.status != 'CANCELLED') AS statuses
       FROM order_items oi
       WHERE oi.order_id = ?
         AND (
           EXISTS (SELECT 1 FROM bills_of_materials b WHERE b.product_id = oi.product_id)
           OR EXISTS (SELECT 1 FROM production_orders po2 WHERE po2.order_item_id = oi.id AND po2.status != 'CANCELLED')
         )`,
      [salesOrderId]
    );
    const ACTIVE = new Set(['PLANNED', 'RELEASED', 'IN_PROGRESS']);
    let producedItems = 0;
    let inProductionItems = 0;
    let pendingItems = 0;
    for (const item of items) {
      const statuses = (item.statuses || '').split(',').filter(Boolean);
      const hasActive = statuses.some((status) => ACTIVE.has(status));
      const hasCompleted = statuses.includes('COMPLETED');
      if (hasCompleted && !hasActive) producedItems += 1;
      else if (hasActive || hasCompleted) inProductionItems += 1;
      else pendingItems += 1;
    }
    const totalItems = items.length;
    const done = producedItems + inProductionItems;
    return {
      salesOrderId,
      totalItems,
      producedItems,
      inProductionItems,
      pendingItems,
      allCompleted: totalItems > 0 && producedItems === totalItems,
      coveragePercent: totalItems > 0 ? Math.round((done / totalItems) * 100) : 0,
    };
  }

  /**
   * Reflect manufacturing progress onto the linked sales order status:
   *  - all manufactured items produced → READY (جاهز)
   *  - some progress                  → PROCESSING (قيد التجهيز)
   *  - production fully cancelled     → back to CONFIRMED
   * Only forward transitions are applied; COMPLETED/CANCELLED orders are untouched.
   */
  private syncLinkedSalesOrderStatus(salesOrderId: string): void {
    const progress = this.computeSalesOrderProductionProgress(salesOrderId);
    const order = this.ctx.db.query<{ status: string }>(
      `SELECT status FROM orders WHERE id = ?`, [salesOrderId]
    )[0];
    // COMPLETED/CANCELLED are terminal; READY already implies produced output.
    if (!order || ['COMPLETED', 'CANCELLED', 'READY'].includes(order.status)) return;
    let next: string | null = null;
    if (progress.totalItems > 0 && progress.allCompleted) {
      next = 'READY';
    } else if (progress.producedItems + progress.inProductionItems > 0) {
      if (['PENDING', 'CONFIRMED', 'PARTIAL'].includes(order.status)) next = 'PROCESSING';
    } else if (order.status === 'PROCESSING') {
      next = 'CONFIRMED';
    }
    if (next && next !== order.status) {
      this.ctx.db.run(
        `UPDATE orders SET status = ?, updated_at = ? WHERE id = ?`,
        [next, new Date().toISOString(), salesOrderId]
      );
      this.ctx.audit('تحديث حالة أمر البيع من الإنتاج', salesOrderId, { status: next, coveragePercent: progress.coveragePercent });
    }
  }

  /**
   * Sales order items whose product has an ACTIVE BOM and are not yet covered
   * by a non-cancelled production order (make-to-order candidates).
   */
  public getSalesOrderProductionCandidates(): SalesOrderProductionCandidate[] {
    const actor = this.ctx.require('manufacturing.view');
    const scope = this.ctx.branchAccess.sqlScope('so.branch_id', undefined, actor);
    return this.ctx.db.query<SalesOrderProductionCandidate>(
      `SELECT oi.id AS orderItemId, oi.order_id AS salesOrderId, so.order_number AS salesOrderNumber,
              so.customer_id AS customerId, c.name AS customerName,
              oi.product_id AS productId, oi.product_name AS productName, oi.quantity_m2 AS quantity,
              p.sell_unit AS unit,
              bom.bomId, bom.bomName
       FROM order_items oi
       JOIN orders so ON so.id = oi.order_id
       LEFT JOIN customers c ON c.id = so.customer_id
       JOIN products p ON p.id = oi.product_id
       JOIN (
         SELECT b.product_id, b.id AS bomId, b.name AS bomName
         FROM bills_of_materials b
         WHERE b.status = 'ACTIVE'
           AND b.id = (
             SELECT b2.id FROM bills_of_materials b2
             WHERE b2.product_id = b.product_id AND b2.status = 'ACTIVE'
             ORDER BY b2.updated_at DESC, b2.created_at DESC
             LIMIT 1
           )
       ) bom ON bom.product_id = oi.product_id
       LEFT JOIN production_orders po ON po.order_item_id = oi.id AND po.status != 'CANCELLED'
       WHERE po.id IS NULL
         AND so.status NOT IN ('CANCELLED', 'COMPLETED')
         AND ${scope.clause}
       ORDER BY so.date DESC, oi.id`,
      scope.params
    );
  }

  /** Create a production order from a sales order item (make-to-order). */
  public createProductionOrderFromSalesItem(
    orderItemId: string,
    input: CreateProductionOrderFromSalesItemDTO = {}
  ): ProductionOrder {
    this.ctx.guardWrites();
    this.ctx.require('manufacturing.manage');
    const item = this.ctx.db.query<any>(
      `SELECT oi.id AS orderItemId, oi.order_id AS salesOrderId, oi.product_id AS productId,
              oi.quantity_m2 AS quantity, so.customer_id AS customerId, so.branch_id AS branchId,
              so.status AS orderStatus
       FROM order_items oi
       JOIN orders so ON so.id = oi.order_id
       WHERE oi.id = ?`,
      [orderItemId]
    )[0];
    if (!item) throw new Error('عنصر أمر البيع غير موجود.');
    if (item.orderStatus === 'CANCELLED') throw new Error('لا يمكن إنتاج عنصر من أمر بيع ملغى.');

    const existing = this.ctx.db.query<{ id: string }>(
      `SELECT id FROM production_orders WHERE order_item_id = ? AND status != 'CANCELLED'`,
      [orderItemId]
    )[0];
    if (existing) throw new Error('يوجد أمر إنتاج نشط مرتبط بهذا العنصر بالفعل.');

    let bomId = input.bomId;
    if (!bomId) {
      bomId = this.ctx.db.query<{ id: string }>(
        `SELECT id FROM bills_of_materials
         WHERE product_id = ? AND status = 'ACTIVE'
         ORDER BY updated_at DESC, created_at DESC LIMIT 1`,
        [item.productId]
      )[0]?.id;
      if (!bomId) throw new Error('لا توجد قائمة مواد (BOM) نشطة للمنتج المحدد.');
    }

    const quantity = input.quantity ?? Number(item.quantity);
    return this.createProductionOrder({
      productId: item.productId,
      bomId,
      quantity,
      priority: input.priority,
      startDate: input.startDate,
      dueDate: input.dueDate,
      branchId: input.branchId || item.branchId || undefined,
      warehouseId: input.warehouseId,
      operations: input.operations,
      salesOrderId: item.salesOrderId,
      orderItemId: item.orderItemId,
      customerId: item.customerId,
      notes: input.notes,
    });
  }
}
