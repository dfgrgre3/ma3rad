import { v4 as uuidv4 } from 'uuid';
import { localDateString } from '../../../../utils/shared/date';
import { postLedgerEntry } from '../../../../database/repositories/ledger';
import { InventoryLocationStockService } from '../../inventory/InventoryLocationStockService';
import { InventoryCostingService } from '../../inventory/InventoryCostingService';
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
  UpdateProductionOrderDTO,
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
      `SELECT o.*, w.name AS work_center_name, emp.full_name AS operator_name
       FROM production_order_operations o
       LEFT JOIN work_centers w ON w.id = o.work_center_id
       LEFT JOIN employees emp ON emp.id = o.operator_id
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
    const actor = this.ctx.requireAny(['manufacturing.view', 'manufacturing.orders.view']);
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
    const actor = this.ctx.requireAny(['manufacturing.view', 'manufacturing.orders.view', 'manufacturing.orders.execute']);
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
       ORDER BY CASE po.priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
                po.due_date IS NULL, po.due_date, po.created_at`,
      scope.params
    );
    const heldByOrder = new Map<string, number>();
    for (const row of this.ctx.db.query<{ orderId: string; qty: number }>(
      `SELECT production_order_id AS orderId, COALESCE(SUM(quantity_m2), 0) AS qty
       FROM production_qc_holds WHERE status = 'HELD' GROUP BY production_order_id`
    )) {
      heldByOrder.set(row.orderId, Number(row.qty || 0));
    }
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
        producedQty: Number((order as any).producedQty || 0),
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
        qcHeldQty: heldByOrder.get(order.id) || 0,
      };
    });
  }

  public getProductionOrder(id: string): ProductionOrder {
    const actor = this.ctx.requireAny(['manufacturing.view', 'manufacturing.orders.view', 'manufacturing.orders.execute', 'manufacturing.quality.view']);
    const order = this.getOrderInternal(id);
    if (!order) throw new Error('أمر الإنتاج غير موجود.');
    this.ctx.branchAccess.requireBranchAccess(order.branchId, actor);
    return order;
  }

  public createProductionOrder(input: CreateProductionOrderDTO): ProductionOrder {
    this.ctx.guardWrites();
    const actor = this.ctx.requireAny(['manufacturing.manage', 'manufacturing.orders.create']);
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
    const approvalStatus = input.requiresApproval ? 'PENDING' : 'NONE';

    const id = `po_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const orderNumber = this.ctx.db.nextNumber ? this.ctx.db.nextNumber('PO') : `PO-${Date.now()}`;
    const now = new Date().toISOString();
    this.ctx.db.executeFinancialTransaction((db) => {
      db.run(
        `INSERT INTO production_orders (id, order_number, product_id, bom_id, quantity, status, priority, start_date, due_date, branch_id, warehouse_id, sales_order_id, order_item_id, customer_id, notes, approval_status, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'PLANNED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, orderNumber, input.productId, input.bomId, input.quantity, priority, input.startDate || null, input.dueDate || null, branchId, warehouseId, salesOrderId, orderItemId, customerId, notes, approvalStatus, actor.id, now, now]
      );
      // Multi-level BOM explosion: components with their own ACTIVE BOM are
      // recursively broken down into leaf materials, aggregated per product
      // and expressed in each component's base stock unit.
      const requirements = this.boms.getBomLeafRequirements(input.bomId, input.quantity);
      for (const requirement of requirements) {
        db.run(
          `INSERT INTO production_order_materials (id, order_id, product_id, planned_qty, consumed_qty, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, 0, 'PENDING', ?, ?)`,
          [
            `pom_${uuidv4().replace(/-/g, '').slice(0, 12)}`, id, requirement.componentProductId,
            requirement.quantity, now, now,
          ]
        );
      }
      const inputOps = input.operations || [];
      // Routing fallback: when the caller did not pass explicit operations,
      // auto-generate them from the BOM routing template (minutes per unit).
      const opRows = inputOps.length > 0
        ? inputOps.map((operation) => ({ workCenterId: operation.workCenterId, plannedMinutes: operation.plannedMinutes || 0 }))
        : this.boms.loadBomOperations(input.bomId).map((operation) => ({
            workCenterId: operation.workCenterId,
            plannedMinutes: Math.round((Number(operation.minutesPerUnit) || 0) * input.quantity * 100) / 100,
          }));
      opRows.forEach((operation, index) => {
        const workCenter = this.ctx.db.query<{ id: string; branchId: string | null }>(
          `SELECT id, branch_id AS branchId FROM work_centers WHERE id = ?`, [operation.workCenterId]
        )[0];
        if (!workCenter) throw new Error('مركز العمل المحدد غير موجود.');
        if (workCenter.branchId && workCenter.branchId !== branchId) {
          throw new Error('مركز العمل لا يتبع فرع أمر الإنتاج.');
        }
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
    const actor = this.ctx.requireAny(['manufacturing.manage', 'manufacturing.orders.create']);
    const order = this.getProductionOrder(id);
    if (order.status !== 'PLANNED') throw new Error('لا يمكن إصدار أمر إنتاج إلا إذا كان مخططاً.');
    if (order.approvalStatus === 'PENDING') throw new Error('أمر الإنتاج بانتظار الاعتماد.');
    if (order.approvalStatus === 'REJECTED') throw new Error('أمر الإنتاج مرفوض — أعد طلب الاعتماد أولاً.');
    const now = new Date().toISOString();
    this.ctx.db.executeFinancialTransaction((db) => {
      db.run(
        `UPDATE production_orders SET status = 'RELEASED', updated_at = ? WHERE id = ?`,
        [now, id]
      );
      this.reserveMaterialsForOrder(db, order, now);
      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
         VALUES (?, ?, ?, 'إصدار أمر إنتاج', 'MANUFACTURING', ?, ?)`,
        [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id, JSON.stringify({ reserved: true })]
      );
    });
    this.ctx.audit('إصدار أمر إنتاج', id, {});
    return this.getProductionOrder(id);
  }

  /**
   * Edit scheduling fields of a PLANNED order: priority, dates and notes.
   * Product/BOM/quantity are immutable once planned — cancel and recreate to
   * change the production basis (materials are already exploded from them).
   */
  public updateProductionOrder(id: string, input: UpdateProductionOrderDTO): ProductionOrder {
    this.ctx.guardWrites();
    this.ctx.requireAny(['manufacturing.manage', 'manufacturing.orders.create']);
    const order = this.getProductionOrder(id);
    if (order.status !== 'PLANNED') throw new Error('لا يمكن تعديل أمر إنتاج إلا إذا كان مخططاً.');
    if (order.approvalStatus === 'PENDING') throw new Error('أمر الإنتاج بانتظار الاعتماد — لا يمكن تعديله الآن.');

    const updates: string[] = [];
    const params: Array<any> = [];
    if (input.priority !== undefined) {
      if (!PRIORITIES.includes(input.priority)) throw new Error('أولوية أمر الإنتاج غير صالحة.');
      updates.push('priority = ?'); params.push(input.priority);
    }
    const effectiveStart = input.startDate !== undefined ? input.startDate : order.startDate;
    const effectiveDue = input.dueDate !== undefined ? input.dueDate : order.dueDate;
    if (input.startDate !== undefined || input.dueDate !== undefined) {
      assertDate(effectiveStart, 'تاريخ البدء');
      assertDate(effectiveDue, 'تاريخ الاستحقاق');
      if (effectiveStart && effectiveDue && effectiveDue < effectiveStart) {
        throw new Error('تاريخ الاستحقاق يجب أن يكون بعد تاريخ البدء.');
      }
      updates.push('start_date = ?'); params.push(effectiveStart || null);
      updates.push('due_date = ?'); params.push(effectiveDue || null);
    }
    if (input.notes !== undefined) {
      updates.push('notes = ?'); params.push(input.notes?.trim() || null);
    }
    if (updates.length === 0) return order;
    updates.push('updated_at = ?'); params.push(new Date().toISOString());
    params.push(id);
    this.ctx.db.run(`UPDATE production_orders SET ${updates.join(', ')} WHERE id = ?`, params);
    this.ctx.audit('تعديل أمر إنتاج', id, { fields: Object.keys(input) });
    return this.getProductionOrder(id);
  }

  /** Send a planned order for approval (or re-request after rejection). */
  public requestOrderApproval(id: string): ProductionOrder {
    this.ctx.guardWrites();
    this.ctx.requireAny(['manufacturing.manage', 'manufacturing.orders.create']);
    const order = this.getProductionOrder(id);
    if (order.status !== 'PLANNED') throw new Error('لا يمكن طلب اعتماد إلا لأمر مخطط.');
    if (order.approvalStatus === 'APPROVED') throw new Error('أمر الإنتاج معتمد بالفعل.');
    if (order.approvalStatus === 'PENDING') throw new Error('طلب الاعتماد موجود بالفعل.');
    this.ctx.db.run(
      `UPDATE production_orders SET approval_status = 'PENDING', rejection_reason = NULL, updated_at = ? WHERE id = ?`,
      [new Date().toISOString(), id]
    );
    this.ctx.audit('طلب اعتماد أمر إنتاج', id, {});
    return this.getProductionOrder(id);
  }

  /** Approve a pending order. The approver must differ from the creator. */
  public approveProductionOrder(id: string): ProductionOrder {
    this.ctx.guardWrites();
    const actor = this.ctx.requireAny(['manufacturing.manage', 'manufacturing.orders.approve']);
    const order = this.getProductionOrder(id);
    if (order.status !== 'PLANNED') throw new Error('لا يمكن اعتماد إلا أمراً مخططاً.');
    if (order.approvalStatus !== 'PENDING') throw new Error('لا يوجد طلب اعتماد بانتظار القرار.');
    if (order.createdBy && order.createdBy === actor.id) {
      throw new Error('لا يمكن اعتماد أمر إنتاج أنشأته بنفسك.');
    }
    const now = new Date().toISOString();
    this.ctx.db.run(
      `UPDATE production_orders SET approval_status = 'APPROVED', approved_by = ?, approved_at = ?, updated_at = ? WHERE id = ?`,
      [actor.id, now, now, id]
    );
    this.ctx.audit('اعتماد أمر إنتاج', id, { approvedBy: actor.id });
    return this.getProductionOrder(id);
  }

  /** Reject a pending approval request with a reason. */
  public rejectProductionOrder(id: string, reason?: string): ProductionOrder {
    this.ctx.guardWrites();
    this.ctx.requireAny(['manufacturing.manage', 'manufacturing.orders.approve']);
    const order = this.getProductionOrder(id);
    if (order.status !== 'PLANNED') throw new Error('لا يمكن رفض إلا أمراً مخططاً.');
    if (order.approvalStatus !== 'PENDING') throw new Error('لا يوجد طلب اعتماد بانتظار القرار.');
    this.ctx.db.run(
      `UPDATE production_orders SET approval_status = 'REJECTED', rejection_reason = ?, updated_at = ? WHERE id = ?`,
      [(reason || '').trim() || null, new Date().toISOString(), id]
    );
    this.ctx.audit('رفض أمر إنتاج', id, { reason: reason || null });
    return this.getProductionOrder(id);
  }

  /**
   * Reserve available stock for a released order's material requirements.
   * Reservations live on warehouse_stock.reserved_m2 so other orders cannot
   * consume them; issuing later draws the reservation down first.
   */
  private reserveMaterialsForOrder(db: any, order: ProductionOrder, now: string): void {
    if (!order.warehouseId) return;
    const atpLeft = new Map<string, number>();
    const productReserves = new Map<string, number>();
    for (const material of order.materials) {
      const need = Math.round((material.plannedQty - material.consumedQty - (material.reservedQty || 0)) * 1e6) / 1e6;
      if (need <= 0) continue;
      if (!atpLeft.has(material.productId)) {
        const stock: any = db.query(
          `SELECT quantity_m2 AS quantityM2, reserved_m2 AS reservedM2 FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?`,
          [order.warehouseId, material.productId]
        )[0];
        const onHand = Number(stock?.quantityM2 || 0);
        const reserved = Number(stock?.reservedM2 || 0);
        atpLeft.set(material.productId, Math.max(0, onHand - reserved));
      }
      const take = Math.min(need, atpLeft.get(material.productId)!);
      if (take <= 0) continue;
      atpLeft.set(material.productId, atpLeft.get(material.productId)! - take);
      productReserves.set(material.productId, (productReserves.get(material.productId) || 0) + take);
      db.run(
        `UPDATE production_order_materials SET reserved_qty = reserved_qty + ?, updated_at = ? WHERE id = ?`,
        [take, now, material.id]
      );
    }
    for (const [productId, total] of productReserves) {
      db.run(
        `UPDATE warehouse_stock SET reserved_m2 = reserved_m2 + ?, last_updated = ? WHERE warehouse_id = ? AND product_id = ?`,
        [total, now, order.warehouseId, productId]
      );
    }
  }

  /** Release all remaining material reservations of an order (cancel path). */
  private releaseMaterialReservations(db: any, order: ProductionOrder, now: string): void {
    if (!order.warehouseId) return;
    const productReleases = new Map<string, number>();
    for (const material of order.materials) {
      const reserved = Math.round((Number(material.reservedQty) || 0) * 1e6) / 1e6;
      if (reserved <= 0) continue;
      productReleases.set(material.productId, (productReleases.get(material.productId) || 0) + reserved);
      db.run(
        `UPDATE production_order_materials SET reserved_qty = 0, updated_at = ? WHERE id = ?`,
        [now, material.id]
      );
    }
    for (const [productId, total] of productReleases) {
      db.run(
        `UPDATE warehouse_stock SET reserved_m2 = MAX(0, reserved_m2 - ?), last_updated = ? WHERE warehouse_id = ? AND product_id = ?`,
        [total, now, order.warehouseId, productId]
      );
    }
  }

  /**
   * Issue `qty` of a material from stock, consuming this order's reservation
   * first and releasing the reserved share from warehouse_stock.reserved_m2.
   * Must run inside a financial transaction.
   */
  private issueMaterialStock(db: any, actorId: string, order: ProductionOrder, material: ProductionOrderMaterial, qty: number, now: string, reason: string): void {
    const warehouseId = order.warehouseId!;
    const reservedUsed = Math.min(Number(material.reservedQty || 0), qty);
    const stock: any = db.query(
      `SELECT quantity_m2 AS quantityM2, reserved_m2 AS reservedM2 FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?`,
      [warehouseId, material.productId]
    )[0];
    const onHand = Number(stock?.quantityM2 || 0);
    const reservedTotal = Number(stock?.reservedM2 || 0);
    // Usable = unreserved stock + this order's own reservation share.
    // Physical stock is a hard ceiling: a reservation can never cover units
    // that are no longer on the shelf.
    if (onHand + 1e-6 < qty || onHand - reservedTotal + reservedUsed + 1e-6 < qty) {
      throw new Error(`الرصيد المتاح من ${material.productName || material.productId} غير كافٍ للصرف.`);
    }
    // Freeze the actual issue cost on the immutable transaction: FIFO layer
    // cost when the FIFO costing method is active, otherwise the product's
    // current cost price. computeOrderCost reads these stored values so later
    // price changes never rewrite history. planFifo reconciles layers against
    // warehouse_stock.quantity_m2, so it must run BEFORE the stock decrement.
    const fifoEnabled = InventoryCostingService.costingMethod(db) === 'FIFO';
    const fifoPlan = fifoEnabled
      ? InventoryCostingService.planFifo(db, material.productId, warehouseId, qty)
      : null;
    const unitCost = fifoPlan?.unitCost ?? (Number(
      db.query(`SELECT cost_price AS costPrice FROM products WHERE id = ?`, [material.productId])[0]?.costPrice || 0
    ) / 100);
    const totalCost = fifoPlan ? fifoPlan.totalCost : qty * unitCost;
    db.run(
      `UPDATE warehouse_stock SET quantity_m2 = quantity_m2 - ?, reserved_m2 = MAX(0, reserved_m2 - ?), last_updated = ? WHERE warehouse_id = ? AND product_id = ?`,
      [qty, reservedUsed, now, warehouseId, material.productId]
    );
    InventoryLocationStockService.release(db, {
      warehouseId,
      productId: material.productId,
      quantity: qty,
      actorId,
      reason,
    });
    const txId = `itx_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const txNumber = db.nextNumber('INV');
    db.run(
      `INSERT INTO inventory_transactions (id, transaction_number, type, product_id, warehouse_id, quantity_m2, boxes_count, unit_cost, total_cost, reference_type, reference_id, notes, performed_by, created_at)
       VALUES (?, ?, 'ADJUSTMENT_SUB', ?, ?, ?, 0, ROUND(?*100), ROUND(?*100), 'PRODUCTION_ORDER', ?, ?, ?, ?)`,
      [txId, txNumber, material.productId, warehouseId, qty, unitCost, totalCost, order.id, reason, actorId, now]
    );
    if (fifoPlan) InventoryCostingService.consumeFifo(db, txId, fifoPlan);
    // Lot genealogy: record which cost layers (→ GRN / supplier / raw batch)
    // fed this issue so finished batches can be traced back to suppliers.
    if (fifoPlan) {
      for (const allocation of fifoPlan.allocations) {
        const layer: any = db.query(
          `SELECT batch_id AS batchId, goods_receipt_id AS goodsReceiptId,
                  purchase_invoice_id AS purchaseId, supplier_id AS supplierId
           FROM inventory_cost_layers WHERE id = ?`,
          [allocation.layerId]
        )[0];
        db.run(
          `INSERT INTO material_issue_lots
            (id, production_order_id, order_material_id, inventory_transaction_id,
             component_product_id, quantity, unit_cost, cost_layer_id,
             goods_receipt_id, purchase_id, supplier_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            `mil_${uuidv4().replace(/-/g, '').slice(0, 12)}`, order.id, material.id, txId,
            material.productId, allocation.quantity, allocation.unitCost, allocation.layerId,
            layer?.goodsReceiptId || null, layer?.purchaseId || null, layer?.supplierId || null, now,
          ]
        );
      }
    } else {
      db.run(
        `INSERT INTO material_issue_lots
          (id, production_order_id, order_material_id, inventory_transaction_id,
           component_product_id, quantity, unit_cost, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `mil_${uuidv4().replace(/-/g, '').slice(0, 12)}`, order.id, material.id, txId,
          material.productId, qty, unitCost, now,
        ]
      );
    }
    // Automatic cost transfer: materials leave inventory (1104) into
    // work-in-process (1205) at the frozen issue value. Idempotent per
    // transaction id; skipped for zero-value issues.
    if (totalCost > 0.004) {
      postLedgerEntry(db.getDatabase(), {
        date: localDateString(),
        description: `صرف مواد لأمر إنتاج ${order.orderNumber}: ${material.productName || material.productId}`,
        referenceType: 'PRODUCTION_ISSUE',
        referenceId: txId,
        createdBy: actorId,
        branchId: order.branchId || null,
        lines: [
          { accountCode: '1205', debit: totalCost, credit: 0 },
          { accountCode: '1104', debit: 0, credit: totalCost },
        ],
      });
    }
    if (reservedUsed > 0) {
      db.run(
        `UPDATE production_order_materials SET reserved_qty = MAX(0, reserved_qty - ?), updated_at = ? WHERE id = ?`,
        [reservedUsed, now, material.id]
      );
    }
  }

  /** Link a released production order to an operations shift without starting it. */
  public assignOrderToShift(orderId: string, operationShiftId: string | null): ProductionOrder {
    this.ctx.guardWrites();
    this.ctx.requireAny(['manufacturing.manage', 'manufacturing.orders.execute']);
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
    this.ctx.requireAny(['manufacturing.manage', 'manufacturing.orders.execute']);
    const order = this.getProductionOrder(id);
    if (order.status !== 'RELEASED') throw new Error('لا يمكن بدء أمر إنتاج إلا بعد إصداره.');
    if (operationShiftId != null) this.assignOrderToShift(id, operationShiftId);
    const now = new Date().toISOString();
    this.ctx.db.run(
      `UPDATE production_orders SET status = 'IN_PROGRESS', start_date = COALESCE(start_date, ?), updated_at = ? WHERE id = ?`,
      [localDateString(), now, id]
    );
    // Only the first pending operation enters IN_PROGRESS; the rest start
    // one-by-one through startOperation as the sequence advances.
    this.ctx.db.run(
      `UPDATE production_order_operations SET status = 'IN_PROGRESS', started_at = COALESCE(started_at, ?), updated_at = ?
       WHERE id = (
         SELECT id FROM production_order_operations
         WHERE order_id = ? AND status = 'PENDING'
         ORDER BY sequence, created_at LIMIT 1
       )`,
      [now, now, id]
    );
    this.ctx.audit('بدء أمر إنتاج', id, {});
    const started = this.getProductionOrder(id);
    if (started.salesOrderId) this.syncLinkedSalesOrderStatus(started.salesOrderId);
    return started;
  }

  /**
   * Start a single pending operation. Sequence is enforced: every earlier
   * operation must be COMPLETED or SKIPPED first. Starting the next pending
   * operation is also done automatically when the previous one completes.
   */
  public startOperation(operationId: string): ProductionOrderOperation {
    this.ctx.guardWrites();
    this.ctx.requireAny(['manufacturing.manage', 'manufacturing.orders.execute']);
    const operation = this.ctx.db.query<ProductionOrderOperation>(
      `SELECT * FROM production_order_operations WHERE id = ?`,
      [operationId]
    )[0];
    if (!operation) throw new Error('العملية غير موجودة.');
    const order = this.getProductionOrder(operation.orderId);
    if (order.status !== 'IN_PROGRESS') throw new Error('لا يمكن تشغيل عملية إلا أثناء تنفيذ الأمر.');
    if (operation.status !== 'PENDING') throw new Error('العملية ليست بانتظار التشغيل.');
    const blockers = this.ctx.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM production_order_operations
       WHERE order_id = ? AND sequence < ? AND status NOT IN ('COMPLETED', 'SKIPPED')`,
      [operation.orderId, operation.sequence]
    )[0];
    if (Number(blockers?.count || 0) > 0) {
      throw new Error('يجب إكمال العمليات السابقة أولاً.');
    }
    const now = new Date().toISOString();
    this.ctx.db.run(
      `UPDATE production_order_operations SET status = 'IN_PROGRESS', started_at = COALESCE(started_at, ?), updated_at = ? WHERE id = ?`,
      [now, now, operationId]
    );
    this.ctx.audit('تشغيل عملية إنتاج', operationId, {});
    return this.getOperation(operationId);
  }

  /** Skip a pending operation (e.g. not required for this batch). */
  public skipOperation(operationId: string, reason?: string): ProductionOrderOperation {
    this.ctx.guardWrites();
    this.ctx.requireAny(['manufacturing.manage', 'manufacturing.orders.execute']);
    const operation = this.ctx.db.query<ProductionOrderOperation>(
      `SELECT * FROM production_order_operations WHERE id = ?`,
      [operationId]
    )[0];
    if (!operation) throw new Error('العملية غير موجودة.');
    const order = this.getProductionOrder(operation.orderId);
    if (order.status !== 'IN_PROGRESS') throw new Error('لا يمكن تخطي عملية إلا أثناء تنفيذ الأمر.');
    if (operation.status !== 'PENDING') throw new Error('يمكن تخطي العمليات بانتظار التشغيل فقط.');
    const now = new Date().toISOString();
    this.ctx.db.run(
      `UPDATE production_order_operations SET status = 'SKIPPED', completed_at = ?, updated_at = ? WHERE id = ?`,
      [now, now, operationId]
    );
    this.advanceNextOperation(operation.orderId, now);
    this.ctx.audit('تخطي عملية إنتاج', operationId, { reason: reason || null });
    return this.getOperation(operationId);
  }

  private advanceNextOperation(orderId: string, now: string): void {
    this.ctx.db.run(
      `UPDATE production_order_operations SET status = 'IN_PROGRESS', started_at = COALESCE(started_at, ?), updated_at = ?
       WHERE id = (
         SELECT id FROM production_order_operations
         WHERE order_id = ? AND status = 'PENDING'
         ORDER BY sequence, created_at LIMIT 1
       )`,
      [now, now, orderId]
    );
  }

  private getOperation(operationId: string): ProductionOrderOperation {
    return this.ctx.db.query<ProductionOrderOperation>(
      `SELECT o.*, w.name AS work_center_name, emp.full_name AS operator_name
       FROM production_order_operations o
       LEFT JOIN work_centers w ON w.id = o.work_center_id
       LEFT JOIN employees emp ON emp.id = o.operator_id
       WHERE o.id = ?`,
      [operationId]
    )[0];
  }

  /** Assign (or clear) the operator responsible for an operation. */
  public setOperationOperator(operationId: string, employeeId: string | null): ProductionOrderOperation {
    this.ctx.guardWrites();
    this.ctx.requireAny(['manufacturing.manage', 'manufacturing.orders.execute']);
    const operation = this.ctx.db.query<ProductionOrderOperation>(
      `SELECT * FROM production_order_operations WHERE id = ?`,
      [operationId]
    )[0];
    if (!operation) throw new Error('العملية غير موجودة.');
    if (employeeId) {
      const employee = this.ctx.db.query<{ id: string }>(`SELECT id FROM employees WHERE id = ?`, [employeeId])[0];
      if (!employee) throw new Error('الموظف المحدد غير موجود.');
    }
    this.ctx.db.run(
      `UPDATE production_order_operations SET operator_id = ?, updated_at = ? WHERE id = ?`,
      [employeeId || null, new Date().toISOString(), operationId]
    );
    this.ctx.audit('تعيين مشغل عملية إنتاج', operationId, { employeeId: employeeId || null });
    return this.getOperation(operationId);
  }

  public completeOperation(operationId: string, actualMinutes: number): ProductionOrderOperation {
    this.ctx.guardWrites();
    const actor = this.ctx.requireAny(['manufacturing.manage', 'manufacturing.orders.execute']);
    const operation = this.ctx.db.query<ProductionOrderOperation>(
      `SELECT * FROM production_order_operations WHERE id = ?`,
      [operationId]
    )[0];
    if (!operation) throw new Error('العملية غير موجودة.');
    const order = this.getProductionOrder(operation.orderId);
    if (order.status !== 'IN_PROGRESS') throw new Error('لا يمكن إكمال عملية إلا أثناء تنفيذ الأمر.');
    if (operation.status !== 'IN_PROGRESS') throw new Error('يجب تشغيل العملية قبل إكمالها.');
    if (!Number.isFinite(actualMinutes) || actualMinutes < 0) throw new Error('الوقت الفعلي يجب أن يكون رقماً غير سالب.');

    const now = new Date().toISOString();
    this.ctx.db.executeFinancialTransaction((db) => {
      db.run(
        `UPDATE production_order_operations SET status = 'COMPLETED', actual_minutes = ?, completed_at = ?, updated_at = ? WHERE id = ?`,
        [actualMinutes, now, now, operationId]
      );
      // Job-ticket labor log: per-operator minutes keyed by work date so they
      // reconcile against HR attendance punches in the labor summary.
      if (operation.operatorId && actualMinutes > 0) {
        db.run(
          `INSERT INTO production_operation_labor (id, operation_id, employee_id, work_date, minutes, source, created_at)
           VALUES (?, ?, ?, ?, ?, 'OPERATION', ?)`,
          [`pol_${uuidv4().replace(/-/g, '').slice(0, 12)}`, operationId, operation.operatorId, localDateString(), actualMinutes, now]
        );
      }
      db.run(
        `UPDATE production_order_operations SET status = 'IN_PROGRESS', started_at = COALESCE(started_at, ?), updated_at = ?
         WHERE id = (
           SELECT id FROM production_order_operations
           WHERE order_id = ? AND status = 'PENDING'
           ORDER BY sequence, created_at LIMIT 1
         )`,
        [now, now, operation.orderId]
      );
      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
         VALUES (?, ?, ?, 'إكمال عملية إنتاج', 'MANUFACTURING', ?, ?)`,
        [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, operationId, JSON.stringify({ actualMinutes })]
      );
    });
    this.ctx.audit('إكمال عملية إنتاج', operationId, { actualMinutes });
    return this.getOperation(operationId);
  }

  /**
   * Issue materials to production: deducts the issued quantity from the
   * order warehouse immediately (stock + bin allocation + immutable inventory
   * transaction) and accumulates it on the material line. Completion later
   * only issues the remaining proportional share, so actual consumption —
   * not the plan — drives stock and cost.
   */
  public consumeMaterial(materialId: string, quantity: number): ProductionOrderMaterial {
    this.ctx.guardWrites();
    const actor = this.ctx.requireAny(['manufacturing.manage', 'manufacturing.orders.execute']);
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
    const issueQty = Math.round((consumed - material.consumedQty) * 1e6) / 1e6;
    const status: ProductionMaterialStatus = consumed >= material.plannedQty ? 'CONSUMED' : 'ISSUED';
    if (!order.warehouseId) throw new Error('أمر الإنتاج غير مرتبط بمخزن.');
    const now = new Date().toISOString();
    this.ctx.db.executeFinancialTransaction((db) => {
      if (issueQty > 0) {
        this.issueMaterialStock(db, actor.id, order, material, issueQty, now, 'صرف مواد إنتاج');
      }
      db.run(
        `UPDATE production_order_materials SET consumed_qty = ?, status = ?, updated_at = ? WHERE id = ?`,
        [consumed, status, now, materialId]
      );
      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
         VALUES (?, ?, ?, 'صرف مواد إنتاج', 'MANUFACTURING', ?, ?)`,
        [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, materialId, JSON.stringify({ quantity: issueQty, consumed })]
      );
    });
    return this.ctx.db.query<ProductionOrderMaterial>(
      `SELECT m.*, p.name AS product_name
       FROM production_order_materials m
       LEFT JOIN products p ON p.id = m.product_id
       WHERE m.id = ?`,
      [materialId]
    )[0];
  }

  /**
   * Receive produced output for an order. When `outputQuantity` is omitted the
   * remaining order quantity is received (full completion, legacy behaviour).
   * A smaller quantity performs a partial receipt: materials are issued
   * proportionally to the cumulative produced share and the order stays
   * IN_PROGRESS until produced_qty reaches the ordered quantity.
   */
  public completeOrder(id: string, outputQuantity?: number): ProductionOrder {
    this.ctx.guardWrites();
    const actor = this.ctx.requireAny(['manufacturing.manage', 'manufacturing.orders.execute']);
    const order = this.getProductionOrder(id);
    if (order.status !== 'IN_PROGRESS') throw new Error('لا يمكن إكمال أمر إنتاج إلا أثناء تنفيذه.');
    const orderedQty = Number(order.quantity) || 0;
    const alreadyProduced = Number((order as any).producedQty || 0);
    const remaining = Math.round((orderedQty - alreadyProduced) * 1e6) / 1e6;
    if (remaining <= 0) throw new Error('تم إنتاج الكمية المطلوبة بالكامل.');
    const batchQty = outputQuantity === undefined ? remaining : Number(outputQuantity);
    if (!Number.isFinite(batchQty) || batchQty <= 0) throw new Error('كمية الإنتاج يجب أن تكون أكبر من صفر.');
    if (batchQty - remaining > 1e-6) throw new Error('كمية الإنتاج تتجاوز الكمية المتبقية من الأمر.');
    const effectiveBatch = Math.min(batchQty, remaining);
    const newProduced = Math.round((alreadyProduced + effectiveBatch) * 1e6) / 1e6;
    const fullyProduced = newProduced >= orderedQty - 1e-6;
    const now = new Date().toISOString();
    const warehouseId = order.warehouseId;
    if (!warehouseId) throw new Error('أمر الإنتاج غير مرتبط بمخزن.');
    this.ctx.db.executeFinancialTransaction((db) => {
      // Issue materials proportionally to cumulative produced share:
      // target consumed = planned × (produced / ordered). Manual issuances
      // already deducted their share, so only the positive delta is issued.
      for (const material of order.materials) {
        const targetConsumed = orderedQty > 0
          ? Math.round(material.plannedQty * (newProduced / orderedQty) * 1e6) / 1e6
          : material.plannedQty;
        const issueQty = Math.round(Math.max(0, targetConsumed - material.consumedQty) * 1e6) / 1e6;
        if (issueQty <= 0) continue;
        this.issueMaterialStock(db, actor.id, order, material, issueQty, now, 'صرف مواد إنتاج');
        const newConsumed = Math.round((material.consumedQty + issueQty) * 1e6) / 1e6;
        db.run(
          `UPDATE production_order_materials SET consumed_qty = ?, status = ?, updated_at = ? WHERE id = ?`,
          [newConsumed, newConsumed >= material.plannedQty - 1e-6 ? 'CONSUMED' : 'ISSUED', now, material.id]
        );
      }

      // Receipt unit cost = cumulative actual material cost issued to the
      // order ÷ cumulative produced qty (frozen transaction costs, not the
      // current product price). Falls back to cost_price for legacy orders.
      const issuedCost = Number(db.query<{ cost: number }>(
        `SELECT COALESCE(SUM(total_cost), 0) / 100.0 AS cost
         FROM inventory_transactions
         WHERE reference_type = 'PRODUCTION_ORDER' AND reference_id = ? AND type = 'ADJUSTMENT_SUB'`,
        [id]
      )[0]?.cost || 0);
      const fallbackUnitCost = Number(
        db.query<{ costPrice: number }>(`SELECT cost_price AS costPrice FROM products WHERE id = ?`, [order.productId])[0]?.costPrice || 0
      ) / 100;
      const receiptUnitCost = issuedCost > 0 && newProduced > 0
        ? Math.round((issuedCost / newProduced) * 10000) / 10000
        : fallbackUnitCost;

      // Lot/batch traceability: every production receipt is recorded as a
      // product batch linked back to the production order.
      const batchCount = db.query<{ count: number }>(
        `SELECT COUNT(*) AS count FROM product_batches WHERE production_order_id = ?`, [id]
      )[0];
      const batchNumber = `${order.orderNumber}-B${Number(batchCount?.count || 0) + 1}`;
      const batchId = `pb_${uuidv4().replace(/-/g, '').slice(0, 12)}`;

      // Receive produced output into stock.
      db.run(
        `INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, last_updated)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(warehouse_id, product_id) DO UPDATE SET quantity_m2 = quantity_m2 + ?, last_updated = ?`,
        [`ws_${uuidv4().replace(/-/g, '').slice(0, 12)}`, warehouseId, order.productId, effectiveBatch, now, effectiveBatch, now]
      );
      InventoryLocationStockService.receive(db, {
        warehouseId,
        productId: order.productId,
        quantity: effectiveBatch,
        actorId: actor.id,
        reason: 'استلام منتج مصنّع',
      });
      const finishedTxId = `itx_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      const finishedTxNumber = db.nextNumber('INV');
      db.run(
        `INSERT INTO inventory_transactions (id, transaction_number, type, product_id, warehouse_id, quantity_m2, boxes_count, unit_cost, total_cost, reference_type, reference_id, notes, performed_by, created_at)
         VALUES (?, ?, 'ADJUSTMENT_ADD', ?, ?, ?, 0, ROUND(?*100), ROUND(?*100), 'PRODUCTION_ORDER', ?, ?, ?, ?)`,
        [finishedTxId, finishedTxNumber, order.productId, warehouseId, effectiveBatch,
         receiptUnitCost, effectiveBatch * receiptUnitCost,
         fullyProduced ? 'استلام منتج مصنّع' : 'استلام إنتاج جزئي', id, actor.id, now]
      );
      // Automatic cost transfer: WIP (1205) converts to finished-goods
      // inventory (1104) at the cumulative actual issue cost per unit.
      const receiptValue = Math.round(effectiveBatch * receiptUnitCost * 100) / 100;
      if (receiptValue > 0.004) {
        postLedgerEntry(db.getDatabase(), {
          date: localDateString(),
          description: `استلام إنتاج ${order.orderNumber}: ${effectiveBatch} وحدة`,
          referenceType: 'PRODUCTION_RECEIPT',
          referenceId: finishedTxId,
          createdBy: actor.id,
          branchId: order.branchId || null,
          lines: [
            { accountCode: '1104', debit: receiptValue, credit: 0 },
            { accountCode: '1205', debit: 0, credit: receiptValue },
          ],
        });
      }
      if (InventoryCostingService.costingMethod(db) === 'FIFO') {
        InventoryCostingService.addLayer(db, {
          productId: order.productId,
          warehouseId,
          sourceTransactionId: finishedTxId,
          sourceType: 'PRODUCTION_ORDER',
          sourceId: id,
          batchId,
          date: localDateString(),
          quantity: effectiveBatch,
          unitCost: receiptUnitCost,
        });
      }

      db.run(
        `INSERT INTO product_batches
          (id, product_id, warehouse_id, batch_number, tone_shade, caliber,
           production_date, received_date, quantity_m2, quantity_remaining_m2,
           production_order_id, created_by, created_at)
         VALUES (?, ?, ?, ?, '', '0', ?, ?, ?, ?, ?, ?, ?)`,
        [
          batchId, order.productId, warehouseId,
          batchNumber, now.slice(0, 10), now.slice(0, 10), effectiveBatch, effectiveBatch,
          id, actor.id, now,
        ]
      );
      // Link every not-yet-attributed material issue of this order to the
      // produced batch — issues are proportional to cumulative output, so
      // each receipt batch claims the issues recorded since the previous one.
      db.run(
        `UPDATE material_issue_lots SET produced_batch_id = ?
         WHERE production_order_id = ? AND produced_batch_id IS NULL`,
        [batchId, id]
      );

      // QC gate: BOMs flagged requires_final_qc park the received quantity in
      // production_qc_holds — it leaves sellable stock and batch availability
      // until a FINAL quality disposition accepts it.
      const requiresQc = Number(
        db.query<{ requiresFinalQc: number }>(
          `SELECT requires_final_qc AS requiresFinalQc FROM bills_of_materials WHERE id = ?`, [order.bomId]
        )[0]?.requiresFinalQc || 0
      ) === 1;
      if (requiresQc) {
        this.holdOutputForQuality(db, actor.id, order, effectiveBatch, batchId, receiptUnitCost, now);
      }

      db.run(
        `UPDATE production_orders SET produced_qty = ?, updated_at = ? WHERE id = ?`,
        [newProduced, now, id]
      );

      if (fullyProduced) {
        // Any leftover reservation (reserved but never issued) goes back to
        // the available pool now that the order is fully consumed.
        this.releaseMaterialReservations(db, order, now);
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
          [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id, JSON.stringify({ quantity: orderedQty, producedQty: newProduced, warehouseId })]
        );
      } else {
        db.run(
          `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
           VALUES (?, ?, ?, 'استلام إنتاج جزئي', 'MANUFACTURING', ?, ?)`,
          [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id, JSON.stringify({ batchQty: effectiveBatch, producedQty: newProduced, orderedQty, warehouseId })]
        );
      }
    });
    const completedOrder = this.getProductionOrder(id);
    if (completedOrder.salesOrderId) this.syncLinkedSalesOrderStatus(completedOrder.salesOrderId);
    return completedOrder;
  }

  /**
   * Move just-received output out of sellable stock into a QC hold. The
   * warehouse balance, bin allocation, batch availability and FIFO layer all
   * reflect that the quantity is pending final inspection; a quality
   * ACCEPT disposition releases it back through QualityModule.
   * Must run inside a financial transaction.
   */
  private holdOutputForQuality(
    db: any, actorId: string, order: ProductionOrder,
    quantity: number, batchId: string, unitCost: number, now: string
  ): void {
    const warehouseId = order.warehouseId!;
    const fifoEnabled = InventoryCostingService.costingMethod(db) === 'FIFO';
    db.run(
      `UPDATE warehouse_stock SET quantity_m2 = quantity_m2 - ?, last_updated = ? WHERE warehouse_id = ? AND product_id = ?`,
      [quantity, now, warehouseId, order.productId]
    );
    InventoryLocationStockService.release(db, {
      warehouseId,
      productId: order.productId,
      quantity,
      actorId,
      reason: 'حجر جودة بانتظار الفحص النهائي',
    });
    db.run(
      `UPDATE product_batches SET quantity_remaining_m2 = MAX(0, quantity_remaining_m2 - ?) WHERE id = ?`,
      [quantity, batchId]
    );
    if (fifoEnabled) {
      const holdTxId = `itx_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      db.run(
        `INSERT INTO inventory_transactions (id, transaction_number, type, product_id, warehouse_id, quantity_m2, boxes_count, unit_cost, total_cost, reference_type, reference_id, notes, performed_by, created_at)
         VALUES (?, ?, 'ADJUSTMENT_SUB', ?, ?, ?, 0, ROUND(?*100), ROUND(?*100), 'PRODUCTION_QC_HOLD', ?, 'حجر جودة بانتظار الفحص النهائي', ?, ?)`,
        [holdTxId, db.nextNumber('INV'), order.productId, warehouseId, quantity,
         unitCost, quantity * unitCost, order.id, actorId, now]
      );
      // Consume the cost layers of THIS production batch only — a generic
      // planFifo would eat the oldest layers of unrelated stock while the
      // physical units held belong to this receipt.
      const layers = db.query(
        `SELECT id, quantity_remaining AS qty, unit_cost / 100.0 AS unitCost
         FROM inventory_cost_layers
         WHERE product_id = ? AND warehouse_id = ? AND batch_id = ? AND quantity_remaining > 0.009
         ORDER BY received_at, created_at, rowid`,
        [order.productId, warehouseId, batchId]
      );
      let needed = quantity;
      const allocations: Array<{ layerId: string; quantity: number; unitCost: number }> = [];
      for (const layer of layers) {
        if (needed <= 0.009) break;
        const take = Math.min(Number(layer.qty), needed);
        if (take <= 0) continue;
        allocations.push({ layerId: layer.id, quantity: take, unitCost: Number(layer.unitCost) });
        needed = Math.round((needed - take) * 1e6) / 1e6;
      }
      if (needed > 0.009) {
        // Batch layers short (e.g. rows created before batch tagging): fall
        // back to the oldest remaining layers of the product. planFifo is
        // deliberately not used here — it reconciles layers against
        // warehouse_stock, which this hold has just decremented.
        const rest = db.query(
          `SELECT id, quantity_remaining AS qty, unit_cost / 100.0 AS unitCost
           FROM inventory_cost_layers
           WHERE product_id = ? AND warehouse_id = ? AND quantity_remaining > 0.009
           ORDER BY received_at, created_at, rowid`,
          [order.productId, warehouseId]
        );
        for (const layer of rest) {
          if (needed <= 0.009) break;
          const take = Math.min(Number(layer.qty), needed);
          if (take <= 0) continue;
          allocations.push({ layerId: layer.id, quantity: take, unitCost: Number(layer.unitCost) });
          needed = Math.round((needed - take) * 1e6) / 1e6;
        }
      }
      if (allocations.length > 0) {
        const planTotal = allocations.reduce((s, a) => s + a.quantity * a.unitCost, 0);
        InventoryCostingService.consumeFifo(db, holdTxId, {
          quantity,
          totalCost: Math.round(planTotal * 100) / 100,
          unitCost: quantity > 0 ? Math.round((planTotal / quantity) * 100) / 100 : 0,
          allocations,
        });
      }
    }
    db.run(
      `INSERT INTO production_qc_holds
        (id, production_order_id, product_batch_id, warehouse_id, product_id,
         quantity_m2, unit_cost, total_cost, status, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'HELD', ?, ?)`,
      [
        `hld_${uuidv4().replace(/-/g, '').slice(0, 12)}`, order.id, batchId, warehouseId, order.productId,
        quantity, Math.round(unitCost * 100), Math.round(quantity * unitCost * 100), actorId, now,
      ]
    );
  }

  /** QC-held quantities per order (HELD only) for inspection screens. */
  public getQcHeldQuantity(orderId: string): number {
    this.ctx.requireAny(['manufacturing.view', 'manufacturing.quality.view', 'manufacturing.orders.view']);
    const row = this.ctx.db.query<{ qty: number }>(
      `SELECT COALESCE(SUM(quantity_m2), 0) AS qty FROM production_qc_holds WHERE production_order_id = ? AND status = 'HELD'`,
      [orderId]
    )[0];
    return Number(row?.qty || 0);
  }

  /**
   * Create a PLANNED rework order for `quantity` units rejected from
   * `sourceOrderId`. Copies product/BOM/branch/warehouse/priority, scales the
   * source routing minutes to the rework quantity, and links back through
   * rework_of_order_id + source_quality_check_id. The source order is NOT
   * reopened — this order is the production vehicle for the rejected output,
   * and its own receipt passes through the same QC gate when the BOM
   * requires final inspection. Safe to call inside a financial transaction.
   */
  public createReworkOrder(
    sourceOrderId: string,
    quantity: number,
    options?: { qualityCheckId?: string; notes?: string }
  ): ProductionOrder {
    this.ctx.guardWrites();
    const actor = this.ctx.requireAny(['manufacturing.manage', 'manufacturing.orders.create', 'manufacturing.quality.manage', 'manufacturing.disposition.manage']);
    const source = this.getOrderInternal(sourceOrderId);
    if (!source) throw new Error('أمر الإنتاج الأصلي غير موجود.');
    if (source.status === 'CANCELLED') throw new Error('لا يمكن إنشاء إعادة عمل لأمر إنتاج ملغى.');
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error('كمية إعادة العمل يجب أن تكون أكبر من صفر.');
    }
    const bom = this.ctx.db.query<{ id: string }>(
      `SELECT id FROM bills_of_materials WHERE id = ?`, [source.bomId]
    )[0];
    if (!bom) throw new Error('قائمة مواد أمر الإنتاج الأصلي غير موجودة.');

    const sourceQty = Number(source.quantity) || 0;
    const scale = sourceQty > 0 ? quantity / sourceQty : 1;
    const requirements = this.boms.getBomLeafRequirements(source.bomId, quantity);
    const opRows = source.operations.length > 0
      ? source.operations.map((op) => ({
          workCenterId: op.workCenterId,
          plannedMinutes: Math.round((Number(op.plannedMinutes) || 0) * scale * 100) / 100,
        }))
      : this.boms.loadBomOperations(source.bomId).map((op) => ({
          workCenterId: op.workCenterId,
          plannedMinutes: Math.round((Number(op.minutesPerUnit) || 0) * quantity * 100) / 100,
        }));

    const id = `po_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const orderNumber = this.ctx.db.nextNumber('PO');
    const now = new Date().toISOString();
    const notes = [
      `إعادة عمل للأمر ${source.orderNumber}`,
      options?.notes?.trim() || null,
    ].filter(Boolean).join(' — ') || null;
    this.ctx.db.executeFinancialTransaction((db) => {
      db.run(
        `INSERT INTO production_orders
          (id, order_number, product_id, bom_id, quantity, status, priority, start_date, due_date,
           branch_id, warehouse_id, sales_order_id, order_item_id, customer_id, notes,
           approval_status, rework_of_order_id, source_quality_check_id, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'PLANNED', ?, NULL, NULL, ?, ?, NULL, NULL, ?, ?, 'NONE', ?, ?, ?, ?, ?)`,
        [
          id, orderNumber, source.productId, source.bomId, quantity, source.priority,
          source.branchId, source.warehouseId, source.customerId, notes,
          source.id, options?.qualityCheckId || null, actor.id, now, now,
        ]
      );
      for (const requirement of requirements) {
        db.run(
          `INSERT INTO production_order_materials (id, order_id, product_id, planned_qty, consumed_qty, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, 0, 'PENDING', ?, ?)`,
          [
            `pom_${uuidv4().replace(/-/g, '').slice(0, 12)}`, id, requirement.componentProductId,
            requirement.quantity, now, now,
          ]
        );
      }
      opRows.forEach((operation, index) => {
        const workCenter = db.query<{ id: string }>(
          `SELECT id FROM work_centers WHERE id = ?`, [operation.workCenterId]
        )[0];
        if (!workCenter) throw new Error('مركز العمل المحدد في التوجيه الأصلي غير موجود.');
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
         VALUES (?, ?, ?, 'إنشاء أمر إعادة عمل', 'MANUFACTURING', ?, ?)`,
        [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id,
         JSON.stringify({ sourceOrderId: source.id, quantity, qualityCheckId: options?.qualityCheckId || null })]
      );
    });
    this.ctx.audit('إنشاء أمر إعادة عمل', id, { sourceOrderId: source.id, quantity });
    return this.getProductionOrder(id);
  }

  /** Rework orders spawned from a given production order. */
  public getReworkOrders(sourceOrderId: string): ProductionOrder[] {
    const actor = this.ctx.requireAny(['manufacturing.view', 'manufacturing.orders.view', 'manufacturing.orders.create', 'manufacturing.quality.view']);
    const source = this.getOrderInternal(sourceOrderId);
    if (!source) throw new Error('أمر الإنتاج غير موجود.');
    this.ctx.branchAccess.requireBranchAccess(source.branchId, actor);
    const orders = this.ctx.db.query<ProductionOrder>(
      `SELECT po.*, p.name AS product_name, b.name AS bom_name, br.name AS branch_name, w.name AS warehouseName, po.warehouse_id AS warehouseId
       FROM production_orders po
       JOIN products p ON p.id = po.product_id
       JOIN bills_of_materials b ON b.id = po.bom_id
       LEFT JOIN branches br ON br.id = po.branch_id
       LEFT JOIN warehouses w ON w.id = po.warehouse_id
       WHERE po.rework_of_order_id = ?
       ORDER BY po.created_at`,
      [sourceOrderId]
    );
    return orders.map((order) => {
      order.materials = this.loadOrderMaterials(order.id);
      order.operations = this.loadOrderOperations(order.id);
      return order;
    });
  }

  public getWipValuation(): { orders: WipOrder[]; totalMaterialCost: number; totalQuantity: number } {
    const actor = this.ctx.requireAny(['manufacturing.view', 'manufacturing.wip.view']);
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
    this.ctx.requireAny(['manufacturing.manage', 'manufacturing.orders.execute']);
    const order = this.getProductionOrder(id);
    if (order.status === 'COMPLETED' || order.status === 'CANCELLED') {
      throw new Error('لا يمكن إلغاء أمر إنتاج مكتمل أو ملغى بالفعل.');
    }
    const now = new Date().toISOString();
    this.ctx.db.executeFinancialTransaction((db) => {
      this.releaseMaterialReservations(db, order, now);
      db.run(
        `UPDATE production_orders SET status = 'CANCELLED', updated_at = ? WHERE id = ?`,
        [now, id]
      );
    });
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
    const actor = this.ctx.requireAny(['manufacturing.view', 'manufacturing.orders.view']);
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
  /** Public wrapper used by quality dispositions (e.g. REWORK reopens orders). */
  public syncSalesOrderStatus(salesOrderId: string): void {
    this.syncLinkedSalesOrderStatus(salesOrderId);
  }

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
    const actor = this.ctx.requireAny(['manufacturing.view', 'manufacturing.orders.view', 'manufacturing.orders.create']);
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
    this.ctx.requireAny(['manufacturing.manage', 'manufacturing.orders.create']);
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
      requiresApproval: input.requiresApproval,
    });
  }
}
