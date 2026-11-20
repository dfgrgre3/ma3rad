import type { ManufacturingContext } from './context';
import type { ProductionOrdersModule } from './productionOrders';
import type { MaterialTraceability, OrderTraceability } from './types';

/**
 * Lot genealogy queries. material_issue_lots records which FIFO cost layer
 * (→ goods receipt / supplier / raw batch) fed each production issue, and
 * which produced batch consumed it — giving both forward traceability
 * (finished batch → raw supplier) and backward traceability
 * (raw receipt/GRN → finished batches → customers).
 */
export class TraceabilityModule {
  private readonly ctx: ManufacturingContext;
  private readonly orders: ProductionOrdersModule;
  constructor(ctx: ManufacturingContext, orders: ProductionOrdersModule) {
    this.ctx = ctx;
    this.orders = orders;
  }

  /** Everything needed to trace one production order end-to-end. */
  public getOrderTraceability(orderId: string): OrderTraceability {
    const actor = this.ctx.requireAny(['manufacturing.view', 'manufacturing.orders.view', 'manufacturing.quality.view']);
    const order = this.orders.getOrderInternal(orderId);
    if (!order) throw new Error('أمر الإنتاج غير موجود.');
    this.ctx.branchAccess.requireBranchAccess(order.branchId, actor);

    const producedBatches = this.ctx.db.query<any>(
      `SELECT id, batch_number AS batchNumber, quantity_m2 AS quantity,
              quantity_remaining_m2 AS quantityRemaining,
              production_date AS productionDate, received_date AS receivedDate
       FROM product_batches WHERE production_order_id = ? ORDER BY created_at`,
      [orderId]
    );

    const materials = this.ctx.db.query<any>(
      `SELECT mil.component_product_id AS componentProductId,
              p.name AS componentName,
              SUM(mil.quantity) AS quantity,
              MAX(mil.supplier_id) AS supplierId,
              MAX(s.name) AS supplierName,
              MAX(mil.goods_receipt_id) AS goodsReceiptId,
              MAX(mil.purchase_id) AS purchaseId,
              MAX(mil.produced_batch_id) AS producedBatchId,
              MAX(pb.batch_number) AS producedBatchNumber
       FROM material_issue_lots mil
       JOIN products p ON p.id = mil.component_product_id
       LEFT JOIN suppliers s ON s.id = mil.supplier_id
       LEFT JOIN product_batches pb ON pb.id = mil.produced_batch_id
       WHERE mil.production_order_id = ?
       GROUP BY mil.component_product_id, mil.supplier_id, mil.goods_receipt_id, mil.purchase_id, mil.produced_batch_id
       ORDER BY componentName`,
      [orderId]
    );

    // Operators: everyone assigned to an operation, with logged labor minutes.
    const operatorRows = this.ctx.db.query<any>(
      `SELECT op.operator_id AS employeeId, emp.full_name AS name,
              COALESCE(SUM(l.minutes), 0) AS minutes
       FROM production_order_operations op
       JOIN employees emp ON emp.id = op.operator_id
       LEFT JOIN production_operation_labor l ON l.operation_id = op.id AND l.employee_id = op.operator_id
       WHERE op.order_id = ? AND op.operator_id IS NOT NULL
       GROUP BY op.operator_id`,
      [orderId]
    );

    const qualityChecks = this.ctx.db.query<any>(
      `SELECT id, inspection_type AS inspectionType, result,
              quantity_inspected AS quantityInspected, quantity_accepted AS quantityAccepted,
              quantity_rejected AS quantityRejected, disposition, disposition_qty AS dispositionQty
       FROM manufacturing_quality_checks WHERE production_order_id = ? ORDER BY created_at`,
      [orderId]
    );

    const reworkOrders = this.orders.getReworkOrders(orderId).map((row) => ({
      id: row.id, orderNumber: row.orderNumber, quantity: row.quantity, status: row.status,
    }));

    const sales = order.salesOrderId
      ? this.ctx.db.query<{ orderNumber: string; customerName: string | null }>(
        `SELECT so.order_number AS orderNumber, c.name AS customerName
         FROM orders so LEFT JOIN customers c ON c.id = so.customer_id WHERE so.id = ?`,
        [order.salesOrderId]
      )[0]
      : null;

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      productId: order.productId,
      productName: order.productName || '',
      quantity: Number(order.quantity) || 0,
      producedQty: Number((order as any).producedQty || 0),
      status: order.status,
      branchId: order.branchId,
      warehouseId: order.warehouseId || null,
      salesOrderId: order.salesOrderId || null,
      salesOrderNumber: sales?.orderNumber || order.salesOrderNumber || null,
      customerName: sales?.customerName || order.customerName || null,
      producedBatches: producedBatches.map((row) => ({
        id: row.id, batchNumber: row.batchNumber,
        quantity: Number(row.quantity) || 0, quantityRemaining: Number(row.quantityRemaining) || 0,
        productionDate: row.productionDate || null, receivedDate: row.receivedDate || null,
      })),
      materials: materials.map((row) => ({
        componentProductId: row.componentProductId,
        componentName: row.componentName || row.componentProductId,
        quantity: Number(row.quantity) || 0,
        supplierId: row.supplierId || null,
        supplierName: row.supplierName || null,
        goodsReceiptId: row.goodsReceiptId || null,
        purchaseId: row.purchaseId || null,
        producedBatchId: row.producedBatchId || null,
        producedBatchNumber: row.producedBatchNumber || null,
      })),
      operators: operatorRows.map((row) => ({
        employeeId: row.employeeId,
        name: row.name || row.employeeId,
        minutes: Number(row.minutes) || 0,
      })),
      qualityChecks: qualityChecks.map((row) => ({
        id: row.id, inspectionType: row.inspectionType, result: row.result,
        quantityInspected: Number(row.quantityInspected) || 0,
        quantityAccepted: Number(row.quantityAccepted) || 0,
        quantityRejected: Number(row.quantityRejected) || 0,
        disposition: row.disposition || 'NONE',
        dispositionQty: Number(row.dispositionQty) || 0,
      })),
      reworkOrders,
    };
  }

  /**
   * Backward traceability: given a raw-material identifier — a goods receipt
   * id, a purchase id, a supplier id, or a raw product_batches id — list the
   * finished production batches that consumed it, with their orders and
   * customers.
   */
  public getMaterialTraceability(filter: {
    goodsReceiptId?: string;
    purchaseId?: string;
    supplierId?: string;
    productBatchId?: string;
  }): MaterialTraceability[] {
    const actor = this.ctx.requireAny(['manufacturing.view', 'manufacturing.orders.view', 'manufacturing.quality.view']);

    // Resolve a raw product_batches id to the cost layers tagged with it.
    let layerIds: string[] = [];
    if (filter.productBatchId) {
      layerIds = this.ctx.db.query<{ id: string }>(
        `SELECT id FROM inventory_cost_layers WHERE batch_id = ?`,
        [filter.productBatchId]
      ).map((row) => row.id);
      if (layerIds.length === 0) return [];
    }

    const conditions: string[] = ['mil.produced_batch_id IS NOT NULL'];
    const params: string[] = [];
    if (filter.goodsReceiptId) { conditions.push('mil.goods_receipt_id = ?'); params.push(filter.goodsReceiptId); }
    if (filter.purchaseId) { conditions.push('mil.purchase_id = ?'); params.push(filter.purchaseId); }
    if (filter.supplierId) { conditions.push('mil.supplier_id = ?'); params.push(filter.supplierId); }
    if (layerIds.length > 0) {
      conditions.push(`mil.cost_layer_id IN (${layerIds.map(() => '?').join(',')})`);
      params.push(...layerIds);
    }
    if (conditions.length === 1 && layerIds.length === 0) {
      throw new Error('حدد سند استلام أو مشتريات أو مورد أو تشغيلة خامة للتتبع.');
    }

    const rows = this.ctx.db.query<any>(
      `SELECT mil.component_product_id AS componentProductId,
              p.name AS componentName,
              MAX(mil.goods_receipt_id) AS goodsReceiptId,
              MAX(mil.supplier_id) AS supplierId,
              MAX(s.name) AS supplierName,
              pb.id AS batchId, pb.batch_number AS batchNumber,
              pb.quantity_m2 AS quantity, pb.production_date AS producedDate,
              fp.name AS productName,
              po.id AS orderId, po.order_number AS orderNumber,
              c.name AS customerName
       FROM material_issue_lots mil
       JOIN products p ON p.id = mil.component_product_id
       LEFT JOIN suppliers s ON s.id = mil.supplier_id
       JOIN product_batches pb ON pb.id = mil.produced_batch_id
       JOIN production_orders po ON po.id = mil.production_order_id
       JOIN products fp ON fp.id = po.product_id
       LEFT JOIN customers c ON c.id = po.customer_id
       WHERE ${conditions.join(' AND ')}
       GROUP BY pb.id, po.id
       ORDER BY pb.production_date DESC`,
      params
    );

    // Branch-scope the results per order: rows outside the actor's scope are
    // skipped rather than leaked through the aggregate query.
    const grouped = new Map<string, MaterialTraceability>();
    for (const row of rows) {
      const orderBranch = this.ctx.db.query<{ branchId: string | null }>(
        `SELECT branch_id AS branchId FROM production_orders WHERE id = ?`, [row.orderId]
      )[0];
      if (orderBranch?.branchId) {
        try { this.ctx.branchAccess.requireBranchAccess(orderBranch.branchId, actor); }
        catch { continue; }
      }
      const key = `${row.componentProductId}|${row.goodsReceiptId || ''}|${row.supplierId || ''}`;
      const entry: MaterialTraceability = grouped.get(key) || {
        componentProductId: row.componentProductId,
        componentName: row.componentName || row.componentProductId,
        goodsReceiptId: row.goodsReceiptId || null,
        supplierId: row.supplierId || null,
        supplierName: row.supplierName || null,
        producedBatches: [],
      };
      entry.producedBatches.push({
        batchId: row.batchId,
        batchNumber: row.batchNumber,
        productName: row.productName || '',
        orderId: row.orderId,
        orderNumber: row.orderNumber,
        customerName: row.customerName || null,
        quantity: Number(row.quantity) || 0,
        producedDate: row.producedDate || null,
      });
      grouped.set(key, entry);
    }
    return [...grouped.values()];
  }
}
