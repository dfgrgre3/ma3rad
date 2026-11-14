import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { postLedgerEntry } from '../../../database/repositories/ledger';
import { localDateString } from '../../../utils/shared/date';
import { conversionFactor, fromBaseQuantity } from '../../../utils/products/uom';
import type { UomProduct } from '../../../utils/products/uom_part01';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { InventoryCostingService } from './InventoryCostingService';
import { InventoryLocationStockService } from './InventoryLocationStockService';
import { InventoryServicePart13 } from './InventoryServicePart13';
import { StockTrackedProductPolicy } from './StockTrackedProductPolicy';
import { ApprovalPolicyService } from '../approvals/ApprovalPolicyService';
import { ApprovalRequestService } from '../approvals/ApprovalRequestService';
import { registerApprovalEffect, registerApprovalRejectionEffect } from '../approvals/ApprovalEffectRegistry';
import { ModuleRegistryService } from '../config/ModuleRegistryService';

type AdjustmentType = 'ADD' | 'SUBTRACT' | 'DAMAGE' | 'OPENING_BALANCE';
type AdjustmentSign = 1 | -1;

interface AdjustmentProduct extends UomProduct {
  id: string;
  name: string;
  costPrice: number;
}

interface AdjustmentHeader {
  id: string;
  adjustmentNumber: string;
  warehouseId: string;
  adjustmentType: AdjustmentType;
  reason: string;
  status: string;
  approvalStatus: string | null;
  createdBy: string;
  approvedBy: string | null;
}

export class InventoryServicePart14 extends InventoryServicePart13 {
  public transferStock(
    fromWarehouseId: string,
    toWarehouseId: string,
    productId: string,
    quantityM2: number,
    notes = '',
    _performedBy = 'usr_admin'
  ): void {
    this.createTransferRequest({
      fromWarehouseId,
      toWarehouseId,
      items: [{ productId, quantityM2, notes }],
      notes,
    });
  }

  public transferWarehouseStock(fromWarehouseId: string, toWarehouseId: string, notes = ''): number {
    const transferId = this.requestWarehouseStockTransfer(fromWarehouseId, toWarehouseId, notes);
    return Number(this.db.query<{ count: number }>(
      'SELECT COUNT(*) AS count FROM stock_transfer_items WHERE transfer_id = ?',
      [transferId]
    )[0]?.count || 0);
  }

  public requestWarehouseStockTransfer(fromWarehouseId: string, toWarehouseId: string, notes?: string): string {
    this.assertInventoryModuleEnabled();
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'inventory.transfer');
    this.branchAccess.requireWarehouseAuthorization(fromWarehouseId, actor);
    this.branchAccess.requireWarehouseAuthorization(toWarehouseId, actor);
    if (fromWarehouseId === toWarehouseId) throw new Error('لا يمكن التحويل لنفس المخزن.');

    const branchScope = this.branchAccess.warehouseBranchScope('w', undefined, actor);
    const companyScope = this.branchAccess.companyScope('w.company_id', actor);
    const stockRows = this.db.query<{ productId: string; quantityM2: number; reservedM2: number }>(`
      SELECT ws.product_id AS productId, ws.quantity_m2 AS quantityM2,
        COALESCE(ws.reserved_m2, 0) AS reservedM2
      FROM warehouse_stock ws
      JOIN warehouses w ON w.id = ws.warehouse_id
      WHERE w.id = ? AND ${branchScope.clause} AND ${companyScope.clause}
    `, [fromWarehouseId, ...branchScope.params, ...companyScope.params]);
    if (!stockRows.length || stockRows.every((row) => Number(row.quantityM2) === 0)) {
      throw new Error('لا يوجد رصيد لنقله من المخزن المحدد.');
    }

    const items = stockRows.map((row) => {
      const quantityM2 = Number(row.quantityM2) || 0;
      const reservedM2 = Number(row.reservedM2) || 0;
      if (quantityM2 < 0) throw new Error('لا يمكن نقل مخزن يحتوي على رصيد سالب.');
      if (reservedM2 > 0) throw new Error('ألغِ حجوزات المخزن قبل إنشاء طلب نقل الرصيد.');
      return { productId: row.productId, quantityM2, notes };
    }).filter((item) => item.quantityM2 > 0);

    if (!items.length) throw new Error('لا يوجد رصيد موجب لنقله من المخزن المحدد.');
    return this.createTransferRequest({
      fromWarehouseId,
      toWarehouseId,
      items,
      notes,
    });
  }

  public createAdjustment(input: {
    warehouseId: string;
    productId: string;
    type: AdjustmentType;
    quantity: number;
    reason: string;
    notes?: string;
  }): string {
    this.assertInventoryModuleEnabled();
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'inventory.adjust');
    this.branchAccess.requireWarehouseAccess(input.warehouseId, actor);
    const policy = new ApprovalPolicyService().assertCanExecute('inventory.adjustment.create', actor);
    if (actor.role !== 'ADMIN' && policy.mode === 'APPROVAL') ModuleRegistryService.assertModuleEnabled('approvals');
    if (policy.mode === 'DISABLED') throw new Error('تم تعطيل إنشاء تسويات المخزون بواسطة سياسة الموافقات.');
    const requiresApproval = actor.role !== 'ADMIN' && (
      policy.mode === 'APPROVAL' || (policy.maxValue != null && input.quantity > policy.maxValue)
    );

    if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
      throw new Error('يجب أن تكون كمية التسوية أكبر من صفر.');
    }
    if (!input.reason.trim()) throw new Error('سبب التسوية مطلوب.');
    const product = this.getAdjustmentProduct(this.db, input.productId);
    if (!product) throw new Error('الصنف المحدد غير موجود.');
    StockTrackedProductPolicy.assertStockTracked(this.db, input.productId, 'التسويات المخزنية');
    const adjustmentId = `adj_${uuidv4().substring(0, 8)}`;
    const date = localDateString();

    this.db.executeTransaction((txDb) => {
      const currentProduct = this.getAdjustmentProduct(txDb, input.productId);
      if (!currentProduct) throw new Error('الصنف المحدد غير موجود.');
      this.validateAdjustmentStock(txDb, input.warehouseId, input.productId, input.type, input.quantity);

      const adjustmentNumber = txDb.nextNumber('ADJ');
      txDb.run(`
        INSERT INTO stock_adjustments (
          id, adjustment_number, warehouse_id, date, adjustment_type, reason,
          status, approval_status, total_quantity_m2, total_value, notes, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING_APPROVAL', 'PENDING', ?, 0, ?, ?, CURRENT_TIMESTAMP)
      `, [
        adjustmentId, adjustmentNumber, input.warehouseId, date, input.type,
        input.reason.trim(), input.quantity, input.notes?.trim() || null, actor.id,
      ]);
      txDb.run(`
        INSERT INTO stock_adjustment_items (
          id, adjustment_id, product_id, product_name, quantity_m2, boxes_count, unit_cost, total_value, notes
        ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?)
      `, [
        `adji_${uuidv4().substring(0, 8)}`, adjustmentId, currentProduct.id,
        currentProduct.name, input.quantity, input.notes?.trim() || null,
      ]);
      const adjustmentNumberForApproval = adjustmentNumber;
      if (requiresApproval) {
        const existing = txDb.query<{ id: string }>(
          `SELECT id FROM approval_requests WHERE reference_type = 'STOCK_ADJUSTMENT' AND reference_id = ? AND request_type = 'STOCK_ADJUSTMENT'`,
          [adjustmentId]
        )[0];
        if (existing) throw new Error('طلب موافقة هذه التسوية موجود بالفعل.');
        const approval = new ApprovalRequestService();
        approval.createInventoryAdjustmentRequest({
          id: adjustmentId,
          adjustmentNumber: adjustmentNumberForApproval,
          warehouseId: input.warehouseId,
          productName: currentProduct.name,
          productId: currentProduct.id,
          quantity: input.quantity,
          reason: input.reason.trim(),
          branchId: txDb.query<{ branchId: string | null }>('SELECT branch_id AS branchId FROM warehouses WHERE id = ?', [input.warehouseId])[0]?.branchId ?? null,
          expiresAfterHours: policy.expiresAfterHours,
        }, actor, txDb);
      }
      this.recordPostedAdjustmentAudit(txDb, actor.id, actor.fullName, adjustmentId, 'CREATE', null, {
        status: 'PENDING_APPROVAL',
        type: input.type,
        productId: input.productId,
        quantity: input.quantity,
        warehouseId: input.warehouseId,
      });
      if (!requiresApproval) this.approveAndPostAdjustmentInTransaction(txDb, adjustmentId, actor, true, true);
    });

    return adjustmentId;
  }

  public approveAndPostAdjustmentInTransaction(db: DatabaseManager, adjustmentId: string, actor: ReturnType<typeof AuthService.requireAuth>, approve: boolean, trustedDirectExecution = false): string {
    const current = this.getAdjustmentHeader(db, adjustmentId);
    if (!current || current.status !== 'PENDING_APPROVAL' || current.approvalStatus !== 'PENDING') throw new Error('حالة التسوية لا تسمح بالاعتماد أو الترحيل.');
    this.branchAccess.requireWarehouseAccess(current.warehouseId, actor);
    if (approve && !trustedDirectExecution && current.createdBy === actor.id && actor.role !== 'ADMIN') throw new Error('لا يمكن لمنشئ التسوية اعتمادها.');
    if (!approve) {
      db.run(`UPDATE stock_adjustments SET approval_status = 'REJECTED', status = 'REJECTED' WHERE id = ? AND approval_status = 'PENDING'`, [adjustmentId]);
      this.recordPostedAdjustmentAudit(db, actor.id, actor.fullName, adjustmentId, 'REJECT', null, { approvalStatus: 'REJECTED' });
      return 'تم رفض إضافة المخزون دون تغيير الرصيد.';
    }
    db.run(`UPDATE stock_adjustments SET approval_status = 'APPROVED', approved_by = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ? AND approval_status = 'PENDING'`, [actor.id, adjustmentId]);
    this.postAdjustmentInTransaction(db, adjustmentId, actor);
    return 'تم اعتماد إضافة المخزون وترحيلها فعليًا.';
  }

  private postAdjustmentInTransaction(txDb: DatabaseManager, adjustmentId: string, actor: ReturnType<typeof AuthService.requireAuth>): void {
    const current = this.getAdjustmentHeader(txDb, adjustmentId);
    if (!current || current.status !== 'PENDING_APPROVAL' || current.approvalStatus !== 'APPROVED') throw new Error('حالة التسوية لا تسمح بالترحيل.');
    const items = txDb.query<{ id: string; productId: string; quantity: number }>(
      `SELECT id, product_id AS productId, quantity_m2 AS quantity FROM stock_adjustment_items WHERE adjustment_id = ?`, [adjustmentId]);
    if (!items.length) throw new Error('لا تحتوي التسوية على بنود.');
    let totalValue = 0;
    for (const item of items) {
      const product = this.getAdjustmentProduct(txDb, item.productId);
      if (!product) throw new Error(`الصنف ${item.productId} غير موجود.`);
      this.validateAdjustmentStock(txDb, current.warehouseId, item.productId, current.adjustmentType, item.quantity);
      const sign: AdjustmentSign = current.adjustmentType === 'ADD' || current.adjustmentType === 'OPENING_BALANCE' ? 1 : -1;
      const fifoEnabled = InventoryCostingService.costingMethod(txDb) === 'FIFO';
      const fifoPlan = fifoEnabled && sign < 0 ? InventoryCostingService.planFifo(txDb, item.productId, current.warehouseId, item.quantity) : null;
      const unitCost = Number(fifoPlan?.unitCost ?? product.costPrice ?? 0);
      const itemValue = Math.round(Math.abs(item.quantity * unitCost) * 100) / 100;
      const boxFactor = conversionFactor(product.baseUnit, 'BOX', product);
      const boxesCount = boxFactor === null ? 0 : Number(fromBaseQuantity(item.quantity, 'BOX', product).toFixed(2));
      const transactionId = `tx_${uuidv4().substring(0, 8)}`;
      const transactionNumber = txDb.nextNumber('TX-ADJ');
      const transactionType = sign > 0 ? 'ADJUSTMENT_ADD' : current.adjustmentType === 'DAMAGE' ? 'DAMAGE' : 'ADJUSTMENT_SUB';
      this.applyPostedAdjustmentStock(txDb, item.productId, current.warehouseId, item.quantity * sign, actor.id);
      txDb.run(`INSERT INTO inventory_transactions (
        id, transaction_number, type, product_id, warehouse_id, quantity_m2, boxes_count,
        unit_cost, total_cost, reference_type, reference_id, notes, performed_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ADJUSTMENT', ?, ?, ?, CURRENT_TIMESTAMP)`, [
        transactionId, transactionNumber, transactionType, item.productId, current.warehouseId,
        item.quantity * sign, boxesCount * sign, unitCost, itemValue, adjustmentId,
        `تسوية مخزنية (${current.reason})`, actor.id,
      ]);
      txDb.run(`UPDATE stock_adjustment_items SET boxes_count = ?, unit_cost = ?, total_value = ? WHERE id = ?`, [boxesCount, unitCost, itemValue, item.id]);
      if (fifoPlan) InventoryCostingService.consumeFifo(txDb, transactionId, fifoPlan);
      else if (fifoEnabled && sign > 0) InventoryCostingService.addLayer(txDb, {
        productId: item.productId, warehouseId: current.warehouseId, sourceTransactionId: transactionId,
        sourceType: 'INVENTORY_ADJUSTMENT', sourceId: adjustmentId, date: localDateString(), quantity: item.quantity, unitCost,
      });
      if (itemValue > 0) postLedgerEntry(txDb.getDatabase(), {
        date: localDateString(), description: `Inventory adjustment ${current.adjustmentNumber}: ${current.reason}`,
        referenceType: 'INVENTORY_ADJUSTMENT', referenceId: adjustmentId, createdBy: actor.id,
        lines: sign > 0 ? [
          { accountCode: '1104', debit: itemValue, credit: 0 }, { accountCode: '5201', debit: 0, credit: itemValue },
        ] : [
          { accountCode: '5201', debit: itemValue, credit: 0 }, { accountCode: '1104', debit: 0, credit: itemValue },
        ],
      });
      totalValue += itemValue;
    }
    txDb.run(`UPDATE stock_adjustments SET status = 'POSTED', total_value = ?, posted_by = ?, posted_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'PENDING_APPROVAL' AND approval_status = 'APPROVED'`, [Math.round(totalValue * 100) / 100, actor.id, adjustmentId]);
    this.recordPostedAdjustmentAudit(txDb, actor.id, actor.fullName, adjustmentId, 'POST', { status: 'PENDING_APPROVAL', approvalStatus: 'APPROVED' }, { status: 'POSTED', totalValue: Math.round(totalValue * 100) / 100, postedBy: actor.id });
  }

  public approveAdjustment(adjustmentId: string): void {
    this.assertInventoryModuleEnabled();
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'inventory.adjustment.approve');
    const adjustment = this.getAdjustmentHeader(this.db, adjustmentId);
    const centralRequest = this.db.query<{ id: string }>(`SELECT id FROM approval_requests WHERE reference_type = 'STOCK_ADJUSTMENT' AND reference_id = ? AND request_type = 'STOCK_ADJUSTMENT' AND status = 'PENDING'`, [adjustmentId])[0];
    if (centralRequest) throw new Error('Use the approvals inbox to decide this inventory request.');
    if (!adjustment) throw new Error('طلب التسوية غير موجود.');
    this.branchAccess.requireWarehouseAccess(adjustment.warehouseId, actor);
    if (adjustment.status !== 'PENDING_APPROVAL' || adjustment.approvalStatus === 'APPROVED') {
      throw new Error('التسوية ليست بانتظار الاعتماد.');
    }
    if (adjustment.createdBy === actor.id) throw new Error('لا يمكن لمنشئ التسوية اعتمادها.');

    this.db.executeTransaction((txDb) => {
      const current = this.getAdjustmentHeader(txDb, adjustmentId);
      if (!current || current.status !== 'PENDING_APPROVAL' || current.approvalStatus === 'APPROVED') {
        throw new Error('تم تحديث حالة التسوية؛ أعد تحميلها.');
      }
      if (current.createdBy === actor.id) throw new Error('لا يمكن لمنشئ التسوية اعتمادها.');
      txDb.run(`
        UPDATE stock_adjustments
        SET approval_status = 'APPROVED', approved_by = ?, approved_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'PENDING_APPROVAL' AND approved_by IS NULL
      `, [actor.id, adjustmentId]);
      this.recordPostedAdjustmentAudit(txDb, actor.id, actor.fullName, adjustmentId, 'APPROVE', null, {
        approvalStatus: 'APPROVED',
        approvedBy: actor.id,
      });
    });
  }

  public postAdjustment(adjustmentId: string): void {
    this.assertInventoryModuleEnabled();
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'inventory.adjustment.post');
    const adjustment = this.getAdjustmentHeader(this.db, adjustmentId);
    const centralRequest = this.db.query<{ id: string }>(`SELECT id FROM approval_requests WHERE reference_type = 'STOCK_ADJUSTMENT' AND reference_id = ? AND request_type = 'STOCK_ADJUSTMENT'`, [adjustmentId])[0];
    if (centralRequest) throw new Error('This adjustment is controlled by the approvals inbox and cannot be posted manually.');
    if (!adjustment) throw new Error('طلب التسوية غير موجود.');
    this.branchAccess.requireWarehouseAccess(adjustment.warehouseId, actor);
    if (adjustment.status !== 'PENDING_APPROVAL' || adjustment.approvalStatus !== 'APPROVED') {
      throw new Error('يجب اعتماد التسوية قبل ترحيلها.');
    }

    this.db.executeTransaction((txDb) => {
      const current = this.getAdjustmentHeader(txDb, adjustmentId);
      if (!current || current.status !== 'PENDING_APPROVAL' || current.approvalStatus !== 'APPROVED') {
        throw new Error('تم تحديث حالة التسوية؛ أعد تحميلها.');
      }
      const items = txDb.query<{
        id: string;
        productId: string;
        quantity: number;
      }>(`
        SELECT id, product_id AS productId, quantity_m2 AS quantity
        FROM stock_adjustment_items
        WHERE adjustment_id = ?
      `, [adjustmentId]);
      if (!items.length) throw new Error('لا تحتوي التسوية على بنود.');

      let totalValue = 0;
      for (const item of items) {
        const product = this.getAdjustmentProduct(txDb, item.productId);
        if (!product) throw new Error(`الصنف ${item.productId} لم يعد موجوداً.`);
        this.validateAdjustmentStock(txDb, current.warehouseId, item.productId, current.adjustmentType, item.quantity);
        const sign: AdjustmentSign = current.adjustmentType === 'ADD' || current.adjustmentType === 'OPENING_BALANCE' ? 1 : -1;
        const fifoEnabled = InventoryCostingService.costingMethod(txDb) === 'FIFO';
        const fifoPlan = fifoEnabled && sign < 0
          ? InventoryCostingService.planFifo(txDb, item.productId, current.warehouseId, item.quantity)
          : null;
        const unitCost = Number(fifoPlan?.unitCost ?? product.costPrice ?? 0);
        const itemValue = Math.round(Math.abs(item.quantity * unitCost) * 100) / 100;
        const boxFactor = conversionFactor(product.baseUnit, 'BOX', product);
        const boxesCount = boxFactor === null
          ? 0
          : Number(fromBaseQuantity(item.quantity, 'BOX', product).toFixed(2));
        const transactionId = `tx_${uuidv4().substring(0, 8)}`;
        const transactionNumber = txDb.nextNumber('TX-ADJ');
        const transactionType = sign > 0
          ? 'ADJUSTMENT_ADD'
          : current.adjustmentType === 'DAMAGE' ? 'DAMAGE' : 'ADJUSTMENT_SUB';

        this.applyPostedAdjustmentStock(txDb, item.productId, current.warehouseId, item.quantity * sign, actor.id);
        txDb.run(`
          INSERT INTO inventory_transactions (
            id, transaction_number, type, product_id, warehouse_id,
            quantity_m2, boxes_count, unit_cost, total_cost, reference_type,
            reference_id, notes, performed_by, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ADJUSTMENT', ?, ?, ?, CURRENT_TIMESTAMP)
        `, [
          transactionId, transactionNumber, transactionType, item.productId, current.warehouseId,
          item.quantity * sign, boxesCount * sign, unitCost, itemValue, adjustmentId,
          `تسوية مخزنية (${current.reason})`, actor.id,
        ]);
        txDb.run(`
          UPDATE stock_adjustment_items
          SET boxes_count = ?, unit_cost = ?, total_value = ?
          WHERE id = ?
        `, [boxesCount, unitCost, itemValue, item.id]);

        if (fifoPlan) {
          InventoryCostingService.consumeFifo(txDb, transactionId, fifoPlan);
        } else if (fifoEnabled && sign > 0) {
          InventoryCostingService.addLayer(txDb, {
            productId: item.productId,
            warehouseId: current.warehouseId,
            sourceTransactionId: transactionId,
            sourceType: 'INVENTORY_ADJUSTMENT',
            sourceId: adjustmentId,
            date: localDateString(),
            quantity: item.quantity,
            unitCost,
          });
        }
        if (itemValue > 0) {
          postLedgerEntry(txDb.getDatabase(), {
            date: localDateString(),
            description: `Inventory adjustment ${current.adjustmentNumber}: ${current.reason}`,
            referenceType: 'INVENTORY_ADJUSTMENT',
            referenceId: adjustmentId,
            createdBy: actor.id,
            lines: sign > 0
              ? [
                { accountCode: '1104', debit: itemValue, credit: 0 },
                { accountCode: '5201', debit: 0, credit: itemValue },
              ]
              : [
                { accountCode: '5201', debit: itemValue, credit: 0 },
                { accountCode: '1104', debit: 0, credit: itemValue },
              ],
          });
        }
        totalValue += itemValue;
      }

      txDb.run(`
        UPDATE stock_adjustments
        SET status = 'POSTED', total_value = ?, posted_by = ?, posted_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'PENDING_APPROVAL' AND approval_status = 'APPROVED'
      `, [Math.round(totalValue * 100) / 100, actor.id, adjustmentId]);
      this.recordPostedAdjustmentAudit(txDb, actor.id, actor.fullName, adjustmentId, 'POST', {
        status: 'PENDING_APPROVAL',
        approvalStatus: 'APPROVED',
      }, {
        status: 'POSTED',
        totalValue: Math.round(totalValue * 100) / 100,
        postedBy: actor.id,
      });
    });
  }

  public adjustStock(
    productId: string,
    warehouseId: string,
    actualQuantityM2: number,
    reason: string,
    _performedBy = 'usr_admin'
  ): void {
    this.assertInventoryModuleEnabled();
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'inventory.adjust');
    StockTrackedProductPolicy.assertStockTracked(this.db, productId, 'التسويات المخزنية');
    const currentStock = this.getProductStock(productId, warehouseId);
    const currentQuantity = Number(currentStock?.quantityM2 || 0);
    if (!Number.isFinite(actualQuantityM2) || actualQuantityM2 < 0) {
      throw new Error('Adjusted stock cannot be negative.');
    }
    const diff = Number((actualQuantityM2 - currentQuantity).toFixed(3));
    if (diff === 0) return;
    this.createAdjustment({
      productId,
      warehouseId,
      type: diff > 0 ? 'ADD' : 'SUBTRACT',
      quantity: Math.abs(diff),
      reason,
    });
  }

  private getAdjustmentProduct(db: DatabaseManager, productId: string): AdjustmentProduct | undefined {
    return db.query<AdjustmentProduct>(`
      SELECT id, name, cost_price AS costPrice, product_type AS productType,
        base_unit AS baseUnit, custom_unit AS customUnit, sell_unit AS sellUnit,
        meters_per_box AS metersPerBox, pieces_per_box AS piecesPerBox
      FROM products WHERE id = ?
    `, [productId])[0];
  }

  private getAdjustmentHeader(db: DatabaseManager, adjustmentId: string): AdjustmentHeader | undefined {
    return db.query<AdjustmentHeader>(`
      SELECT id, adjustment_number AS adjustmentNumber, warehouse_id AS warehouseId,
        adjustment_type AS adjustmentType, reason, status,
        approval_status AS approvalStatus, created_by AS createdBy, approved_by AS approvedBy
      FROM stock_adjustments WHERE id = ?
    `, [adjustmentId])[0];
  }

  private validateAdjustmentStock(
    db: DatabaseManager,
    warehouseId: string,
    productId: string,
    type: AdjustmentType,
    quantity: number
  ): void {
    if (type === 'ADD' || type === 'OPENING_BALANCE') return;
    const stock = db.query<{ quantity: number; reserved: number }>(`
      SELECT quantity_m2 AS quantity, reserved_m2 AS reserved
      FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?
    `, [warehouseId, productId])[0];
    const available = Number(stock?.quantity || 0) - Number(stock?.reserved || 0);
    if (available < quantity) {
      throw new Error(`لا يمكن خفض الرصيد دون الكمية المتاحة بعد الحجوزات (${available}).`);
    }
  }

  private applyPostedAdjustmentStock(
    db: DatabaseManager,
    productId: string,
    warehouseId: string,
    delta: number,
    actorId: string,
  ): void {
    const stock = db.query<{ id: string }>(
      'SELECT id FROM warehouse_stock WHERE product_id = ? AND warehouse_id = ?',
      [productId, warehouseId]
    )[0];
    if (stock) {
      db.run(`
        UPDATE warehouse_stock
        SET quantity_m2 = quantity_m2 + ?, last_updated = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [delta, stock.id]);
      InventoryLocationStockService.applyDelta(db, { warehouseId, productId, quantity: delta, actorId }, delta > 0 ? 'ASSIGN' : 'RELEASE');
      return;
    }
    if (delta < 0) throw new Error('لا يوجد رصيد كافٍ في المخزن لترحيل التسوية.');
    db.run(`
      INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2)
      VALUES (?, ?, ?, ?, 0)
    `, [`stk_${uuidv4().substring(0, 8)}`, warehouseId, productId, delta]);
    InventoryLocationStockService.receive(db, { warehouseId, productId, quantity: delta, actorId });
  }

  private recordPostedAdjustmentAudit(
    db: DatabaseManager,
    userId: string,
    userName: string,
    adjustmentId: string,
    action: string,
    oldValues: Record<string, unknown> | null,
    newValues: Record<string, unknown>
  ): void {
    db.run(`
      INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, old_values, new_values)
      VALUES (?, ?, ?, ?, 'INVENTORY_ADJUSTMENT', ?, ?, ?)
    `, [
      `aud_${uuidv4().substring(0, 8)}`,
      userId,
      userName,
      action,
      adjustmentId,
      oldValues ? JSON.stringify(oldValues) : null,
      JSON.stringify(newValues),
    ]);
  }
}

registerApprovalEffect('STOCK_ADJUSTMENT', (request, actor, db) => {
  if (request.referenceType !== 'STOCK_ADJUSTMENT' || !request.referenceId) throw new Error('مرجع تسوية المخزون غير صالح.');
  const inventory = new InventoryServicePart14();
  return inventory.approveAndPostAdjustmentInTransaction(db, request.referenceId, actor, true);
});

registerApprovalRejectionEffect('STOCK_ADJUSTMENT', (request, actor, db) => {
  if (request.referenceType !== 'STOCK_ADJUSTMENT' || !request.referenceId) throw new Error('مرجع تسوية المخزون غير صالح.');
  return new InventoryServicePart14().approveAndPostAdjustmentInTransaction(db, request.referenceId, actor, false);
});
