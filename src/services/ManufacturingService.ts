import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../database/db';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { BranchAccessService } from './BranchAccessService';
import { ModuleRegistryService } from './ModuleRegistryService';
import { localDateString } from '../utils/date';
import type { User } from '../types/identity';

export type BomStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
export type ProductionOrderStatus = 'PLANNED' | 'RELEASED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type ProductionPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type ProductionMaterialStatus = 'PENDING' | 'ISSUED' | 'CONSUMED' | 'SHORTAGE';
export type ProductionOperationStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';

export interface WorkCenter {
  id: string;
  code: string;
  name: string;
  description: string | null;
  costPerHour: number;
  capacityPerDay: number;
  branchId: string;
  isActive: number;
  createdAt: string;
  updatedAt: string;
}

export interface BomItem {
  id: string;
  bomId: string;
  componentProductId: string;
  componentName?: string;
  quantity: number;
  unit: string;
  notes: string | null;
  createdAt: string;
}

export interface BillOfMaterials {
  id: string;
  productId: string;
  productName?: string;
  name: string;
  version: string;
  status: BomStatus;
  notes: string | null;
  items: BomItem[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductionOrderMaterial {
  id: string;
  orderId: string;
  productId: string;
  productName?: string;
  plannedQty: number;
  consumedQty: number;
  status: ProductionMaterialStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ProductionOrderOperation {
  id: string;
  orderId: string;
  workCenterId: string;
  workCenterName?: string;
  sequence: number;
  plannedMinutes: number;
  actualMinutes: number;
  status: ProductionOperationStatus;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductionOrder {
  id: string;
  orderNumber: string;
  productId: string;
  productName?: string;
  bomId: string;
  bomName?: string;
  quantity: number;
  status: ProductionOrderStatus;
  priority: ProductionPriority;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  branchId: string;
  branchName?: string | null;
  warehouseId: string | null;
  warehouseName?: string | null;
  materials: ProductionOrderMaterial[];
  operations: ProductionOrderOperation[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QualityCheck {
  id: string;
  productionOrderId: string;
  inspectionType: 'INCOMING' | 'IN_PROCESS' | 'FINAL';
  result: 'PASS' | 'FAIL' | 'PENDING' | 'CONDITIONAL';
  quantityInspected: number;
  quantityAccepted: number;
  quantityRejected: number;
  disposition: 'NONE' | 'ACCEPT' | 'SCRAP' | 'REWORK' | 'RETURN';
  dispositionQty: number;
  dispositionAt: string | null;
  notes: string | null;
  inspectorId: string | null;
  branchId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateQualityCheckDTO {
  productionOrderId: string;
  inspectionType?: 'INCOMING' | 'IN_PROCESS' | 'FINAL';
  result?: 'PASS' | 'FAIL' | 'PENDING' | 'CONDITIONAL';
  quantityInspected?: number;
  quantityAccepted?: number;
  quantityRejected?: number;
  notes?: string;
}

export interface UpdateQualityCheckDTO {
  inspectionType?: 'INCOMING' | 'IN_PROCESS' | 'FINAL';
  result?: 'PASS' | 'FAIL' | 'PENDING' | 'CONDITIONAL';
  quantityInspected?: number;
  quantityAccepted?: number;
  quantityRejected?: number;
  notes?: string | null;
}
export interface MaintenanceRecord {
  id: string;
  workCenterId: string | null;
  equipmentName: string;
  maintenanceType: 'PREVENTIVE' | 'CORRECTIVE' | 'PREDICTIVE';
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  scheduledDate: string | null;
  completedDate: string | null;
  cost: number;
  notes: string | null;
  performedBy: string | null;
  branchId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMaintenanceDTO {
  workCenterId?: string;
  equipmentName: string;
  maintenanceType?: 'PREVENTIVE' | 'CORRECTIVE' | 'PREDICTIVE';
  scheduledDate?: string;
  notes?: string;
  branchId?: string;
}

export interface UpdateMaintenanceDTO {
  status?: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  completedDate?: string;
  cost?: number;
  notes?: string | null;
  maintenanceType?: 'PREVENTIVE' | 'CORRECTIVE' | 'PREDICTIVE';
}
export interface WipOrder {
  orderId: string;
  orderNumber: string;
  productName: string;
  quantity: number;
  status: ProductionOrderStatus;
  branchId: string;
  materialCost: number;
  finishedProductCostPrice: number;
}
export interface CreateWorkCenterDTO {

  code: string;
  name: string;
  description?: string;
  costPerHour?: number;
  capacityPerDay?: number;
  branchId?: string;
}

export interface CreateBomDTO {
  productId: string;
  name: string;
  version?: string;
  notes?: string;
  items: Array<{ componentProductId: string; quantity: number; unit?: string; notes?: string }>;
}

export interface CreateProductionOrderDTO {
  productId: string;
  bomId: string;
  quantity: number;
  priority?: ProductionPriority;
  startDate?: string;
  dueDate?: string;
  branchId?: string;
  warehouseId?: string;
  operations?: Array<{ workCenterId: string; plannedMinutes: number }>;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const BOM_STATUSES: BomStatus[] = ['DRAFT', 'ACTIVE', 'ARCHIVED'];
const ORDER_STATUSES: ProductionOrderStatus[] = ['PLANNED', 'RELEASED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const PRIORITIES: ProductionPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

function assertDate(value: string | undefined | null, label: string): void {
  if (!value) return;
  if (!DATE_PATTERN.test(value) || Number.isNaN(new Date(`${value}T00:00:00`).getTime())) {
    throw new Error(`${label} غير صالح. استخدم الصيغة YYYY-MM-DD.`);
  }
}

export class ManufacturingService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();

  private require(permission: string): User {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, permission);
    return actor;
  }

  private guardWrites(): void {
    ModuleRegistryService.assertModuleEnabled('manufacturing');
  }

  private decorateOrder(order: ProductionOrder): ProductionOrder {
    return order;
  }

  private loadOrderMaterials(orderId: string): ProductionOrderMaterial[] {
    return this.db.query<ProductionOrderMaterial>(
      `SELECT m.*, p.name AS product_name
       FROM production_order_materials m
       LEFT JOIN products p ON p.id = m.product_id
       WHERE m.order_id = ?
       ORDER BY m.created_at`,
      [orderId]
    );
  }

  private loadOrderOperations(orderId: string): ProductionOrderOperation[] {
    return this.db.query<ProductionOrderOperation>(
      `SELECT o.*, w.name AS work_center_name
       FROM production_order_operations o
       LEFT JOIN work_centers w ON w.id = o.work_center_id
       WHERE o.order_id = ?
       ORDER BY o.sequence, o.created_at`,
      [orderId]
    );
  }

  private getOrderInternal(id: string): ProductionOrder | null {
    const rows = this.db.query<ProductionOrder>(
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

  public getWorkCenters(branchId?: string): WorkCenter[] {
    const actor = this.require('manufacturing.view');
    if (branchId) this.branchAccess.requireBranchAccess(branchId, actor);
    const scope = this.branchAccess.sqlScope('wc.branch_id', undefined, actor);
    const conditions = [scope.clause];
    const params: Array<string> = [...scope.params];
    if (branchId) {
      conditions.push('wc.branch_id = ?');
      params.push(branchId);
    }
    return this.db.query<WorkCenter>(
      `SELECT * FROM work_centers wc WHERE ${conditions.join(' AND ')} ORDER BY wc.code`,
      params
    );
  }

  public createWorkCenter(input: CreateWorkCenterDTO): WorkCenter {
    this.guardWrites();
    const actor = this.require('manufacturing.manage');
    if (!input.code?.trim()) throw new Error('رمز مركز العمل مطلوب.');
    if (!input.name?.trim()) throw new Error('اسم مركز العمل مطلوب.');
    const branchId = input.branchId || this.branchAccess.getDefaultAccessibleBranchId(actor);
    this.branchAccess.requireBranchAccess(branchId, actor);

    const id = `wc_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO work_centers (id, code, name, description, cost_per_hour, capacity_per_day, branch_id, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        id, input.code.trim().toUpperCase(), input.name.trim(), input.description?.trim() || null,
        input.costPerHour ?? 0, input.capacityPerDay ?? 0, branchId, now, now,
      ]
    );
    this.audit('إضافة مركز عمل', id, { code: input.code.trim(), name: input.name.trim(), branchId });
    return this.db.query<WorkCenter>(`SELECT * FROM work_centers WHERE id = ?`, [id])[0];
  }

  public getBoms(productId?: string): BillOfMaterials[] {
    const actor = this.require('manufacturing.view');
    const conditions: string[] = [];
    const params: Array<string> = [];
    if (productId) {
      conditions.push('b.product_id = ?');
      params.push(productId);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const boms = this.db.query<BillOfMaterials>(
      `SELECT b.*, p.name AS product_name
       FROM bills_of_materials b
       JOIN products p ON p.id = b.product_id
       ${where}
       ORDER BY b.created_at DESC`,
      params
    );
    return boms.map((bom) => ({
      ...bom,
      items: this.db.query<BomItem>(
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
    const actor = this.require('manufacturing.view');
    const bom = this.db.query<BillOfMaterials>(
      `SELECT b.*, p.name AS product_name
       FROM bills_of_materials b
       JOIN products p ON p.id = b.product_id
       WHERE b.id = ?`,
      [id]
    )[0];
    if (!bom) throw new Error('BOM غير موجود.');
    bom.items = this.db.query<BomItem>(
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
    this.guardWrites();
    const actor = this.require('manufacturing.manage');
    if (!input.productId) throw new Error('يجب اختيار المنتج المصنّع.');
    const product = this.db.query<{ id: string }>(`SELECT id FROM products WHERE id = ?`, [input.productId])[0];
    if (!product) throw new Error('المنتج المحدد غير موجود.');
    if (!input.name?.trim()) throw new Error('اسم BOM مطلوب.');
    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new Error('يجب إضافة مكوّن واحد على الأقل إلى BOM.');
    }
    for (const item of input.items) {
      if (!(item.quantity > 0)) throw new Error('كمية المكوّن يجب أن تكون أكبر من صفر.');
      const component = this.db.query<{ id: string }>(`SELECT id FROM products WHERE id = ?`, [item.componentProductId])[0];
      if (!component) throw new Error('أحد مكوّنات BOM غير موجود.');
    }

    const id = `bom_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = new Date().toISOString();
    this.db.executeTransaction((db) => {
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
    this.guardWrites();
    const actor = this.require('manufacturing.manage');
    const bom = this.getBom(id);
    if (bom.status !== 'DRAFT') throw new Error('لا يمكن تفعيل BOM إلا إذا كان مسودة.');
    if (bom.items.length === 0) throw new Error('لا يمكن تفعيل BOM بدون مكوّنات.');

    this.db.run(
      `UPDATE bills_of_materials SET status = 'ACTIVE', updated_at = ? WHERE id = ?`,
      [new Date().toISOString(), id]
    );
    this.audit('تفعيل BOM', id, { productId: bom.productId });
    return this.getBom(id);
  }

  public archiveBom(id: string): BillOfMaterials {
    this.guardWrites();
    const actor = this.require('manufacturing.manage');
    const bom = this.getBom(id);
    this.db.run(
      `UPDATE bills_of_materials SET status = 'ARCHIVED', updated_at = ? WHERE id = ?`,
      [new Date().toISOString(), id]
    );
    this.audit('أرشفة BOM', id, { productId: bom.productId });
    return this.getBom(id);
  }

  public getProductionOrders(branchId?: string): ProductionOrder[] {
    const actor = this.require('manufacturing.view');
    if (branchId) this.branchAccess.requireBranchAccess(branchId, actor);
    const scope = this.branchAccess.sqlScope('po.branch_id', undefined, actor);
    const conditions = [scope.clause];
    const params: Array<string> = [...scope.params];
    if (branchId) {
      conditions.push('po.branch_id = ?');
      params.push(branchId);
    }
    const orders = this.db.query<ProductionOrder>(
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
    const actor = this.require('manufacturing.view');
    const order = this.getOrderInternal(id);
    if (!order) throw new Error('أمر الإنتاج غير موجود.');
    this.branchAccess.requireBranchAccess(order.branchId, actor);
    return order;
  }

  public createProductionOrder(input: CreateProductionOrderDTO): ProductionOrder {
    this.guardWrites();
    const actor = this.require('manufacturing.manage');
    if (!input.productId) throw new Error('يجب اختيار المنتج.');
    if (!input.bomId) throw new Error('يجب اختيار BOM.');
    if (!(input.quantity > 0)) throw new Error('كمية الإنتاج يجب أن تكون أكبر من صفر.');
    assertDate(input.startDate, 'تاريخ البدء');
    assertDate(input.dueDate, 'تاريخ الاستحقاق');
    if (input.startDate && input.dueDate && input.dueDate < input.startDate) {
      throw new Error('تاريخ الاستحقاق يجب أن يكون بعد تاريخ البدء.');
    }

    const product = this.db.query<{ id: string }>(`SELECT id FROM products WHERE id = ?`, [input.productId])[0];
    if (!product) throw new Error('المنتج المحدد غير موجود.');
    const bom = this.getBom(input.bomId);
    if (bom.productId !== input.productId) throw new Error('BOM لا يتبع المنتج المحدد.');
    if (bom.status !== 'ACTIVE') throw new Error('يجب تفعيل BOM قبل إنشاء أمر الإنتاج.');
    const priority = input.priority || 'MEDIUM';
    if (!PRIORITIES.includes(priority)) throw new Error('أولوية أمر الإنتاج غير صالحة.');

    const branchId = input.branchId || this.branchAccess.getDefaultAccessibleBranchId(actor);
    this.branchAccess.requireBranchAccess(branchId, actor);

    let warehouseId: string | null | undefined = input.warehouseId;
    if (warehouseId) {
      const warehouseBranch = this.branchAccess.requireWarehouseAccess(warehouseId, actor);
      if (warehouseBranch !== branchId) throw new Error('المخزن لا يتبع الفرع المحدد.');
    } else {
      warehouseId = this.db.query<{ id: string }>(
        `SELECT id FROM warehouses WHERE branch_id = ? ORDER BY is_default DESC, id ASC LIMIT 1`,
        [branchId]
      )[0]?.id || null;
    }
    if (!warehouseId) throw new Error('لا يوجد مخزن مرتبط بالفرع.');

    const id = `po_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const orderNumber = this.db.nextNumber ? this.db.nextNumber('PO') : `PO-${Date.now()}`;
    const now = new Date().toISOString();
    this.db.executeTransaction((db) => {
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
        const workCenter = this.db.query<{ id: string }>(`SELECT id FROM work_centers WHERE id = ?`, [operation.workCenterId])[0];
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
    this.guardWrites();
    const actor = this.require('manufacturing.manage');
    const order = this.getProductionOrder(id);
    if (order.status !== 'PLANNED') throw new Error('لا يمكن إصدار أمر إنتاج إلا إذا كان مخططاً.');
    this.db.run(
      `UPDATE production_orders SET status = 'RELEASED', updated_at = ? WHERE id = ?`,
      [new Date().toISOString(), id]
    );
    this.audit('إصدار أمر إنتاج', id, {});
    return this.getProductionOrder(id);
  }

  public startOrder(id: string): ProductionOrder {
    this.guardWrites();
    const actor = this.require('manufacturing.manage');
    const order = this.getProductionOrder(id);
    if (order.status !== 'RELEASED') throw new Error('لا يمكن بدء أمر إنتاج إلا بعد إصداره.');
    const now = new Date().toISOString();
    this.db.run(
      `UPDATE production_orders SET status = 'IN_PROGRESS', start_date = COALESCE(start_date, ?), updated_at = ? WHERE id = ?`,
      [localDateString(), now, id]
    );
    this.db.run(
      `UPDATE production_order_operations SET status = 'IN_PROGRESS', started_at = ?, updated_at = ? WHERE order_id = ? AND status = 'PENDING'`,
      [now, now, id]
    );
    this.audit('بدء أمر إنتاج', id, {});
    return this.getProductionOrder(id);
  }

  public completeOperation(operationId: string, actualMinutes: number): ProductionOrderOperation {
    this.guardWrites();
    const actor = this.require('manufacturing.manage');
    const operation = this.db.query<ProductionOrderOperation>(
      `SELECT * FROM production_order_operations WHERE id = ?`,
      [operationId]
    )[0];
    if (!operation) throw new Error('العملية غير موجودة.');
    const order = this.getProductionOrder(operation.orderId);
    if (order.status !== 'IN_PROGRESS') throw new Error('لا يمكن إكمال عملية إلا أثناء تنفيذ الأمر.');
    if (!Number.isFinite(actualMinutes) || actualMinutes < 0) throw new Error('الوقت الفعلي يجب أن يكون رقماً غير سالب.');

    const now = new Date().toISOString();
    this.db.run(
      `UPDATE production_order_operations SET status = 'COMPLETED', actual_minutes = ?, completed_at = ?, updated_at = ? WHERE id = ?`,
      [actualMinutes, now, now, operationId]
    );
    this.audit('إكمال عملية إنتاج', operationId, { actualMinutes });
    return this.db.query<ProductionOrderOperation>(
      `SELECT o.*, w.name AS work_center_name
       FROM production_order_operations o
       LEFT JOIN work_centers w ON w.id = o.work_center_id
       WHERE o.id = ?`,
      [operationId]
    )[0];
  }

  public consumeMaterial(materialId: string, quantity: number): ProductionOrderMaterial {
    this.guardWrites();
    const actor = this.require('manufacturing.manage');
    const material = this.db.query<ProductionOrderMaterial>(
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
    this.db.run(
      `UPDATE production_order_materials SET consumed_qty = ?, status = ?, updated_at = ? WHERE id = ?`,
      [consumed, status, new Date().toISOString(), materialId]
    );
    this.audit('صرف مواد إنتاج', materialId, { quantity, consumed });
    return this.db.query<ProductionOrderMaterial>(
      `SELECT m.*, p.name AS product_name
       FROM production_order_materials m
       LEFT JOIN products p ON p.id = m.product_id
       WHERE m.id = ?`,
      [materialId]
    )[0];
  }

  public completeOrder(id: string): ProductionOrder {
    this.guardWrites();
    const actor = this.require('manufacturing.manage');
    const order = this.getProductionOrder(id);
    if (order.status !== 'IN_PROGRESS') throw new Error('لا يمكن إكمال أمر إنتاج إلا أثناء تنفيذه.');
    const now = new Date().toISOString();
    const warehouseId = order.warehouseId;
    if (!warehouseId) throw new Error('أمر الإنتاج غير مرتبط بمخزن.');
    this.db.executeTransaction((db) => {
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

  public createQualityCheck(input: CreateQualityCheckDTO): QualityCheck {
    this.guardWrites();
    const actor = this.require('manufacturing.manage');
    if (!input?.productionOrderId) throw new Error('أمر الإنتاج مطلوب.');
    const order = this.getOrderInternal(input.productionOrderId);
    if (!order) throw new Error('أمر الإنتاج غير موجود.');
    this.branchAccess.requireBranchAccess(order.branchId, actor);

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
    this.db.run(
      `INSERT INTO manufacturing_quality_checks
        (id, production_order_id, inspection_type, result, quantity_inspected, quantity_accepted, quantity_rejected, notes, inspector_id, branch_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.productionOrderId, inspectionType, result, inspected, accepted, rejected, notes, actor.id, order.branchId, now, now]
    );
    this.audit('إضافة فحص جودة', id, { productionOrderId: input.productionOrderId, result });
    return this.getQualityCheck(id);
  }

  public getQualityCheck(id: string): QualityCheck {
    const actor = this.require('manufacturing.view');
    const row = this.db.query<any>(
      `SELECT * FROM manufacturing_quality_checks WHERE id = ?`,
      [id]
    )[0];
    if (!row) throw new Error('سجل فحص الجودة غير موجود.');
    if (row.branchId) this.branchAccess.requireBranchAccess(row.branchId, actor);
    return this.mapQualityCheck(row);
  }

  public getQualityChecks(productionOrderId?: string): QualityCheck[] {
    const actor = this.require('manufacturing.view');
    const conditions: string[] = [];
    const params: Array<string> = [];
    if (productionOrderId) {
      const order = this.getOrderInternal(productionOrderId);
      if (!order) throw new Error('أمر الإنتاج غير موجود.');
      this.branchAccess.requireBranchAccess(order.branchId, actor);
      conditions.push('q.production_order_id = ?');
      params.push(productionOrderId);
    }
    const scope = this.branchAccess.sqlScope('q.branch_id', undefined, actor);
    conditions.push(scope.clause);
    params.push(...scope.params);
    const rows = this.db.query<any>(
      `SELECT q.* FROM manufacturing_quality_checks q
       ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
       ORDER BY q.created_at DESC`,
      params
    );
    return rows.map((row) => this.mapQualityCheck(row));
  }

  public updateQualityCheck(id: string, input: UpdateQualityCheckDTO): QualityCheck {
    this.guardWrites();
    const actor = this.require('manufacturing.manage');
    const existing = this.db.query<any>(
      `SELECT * FROM manufacturing_quality_checks WHERE id = ?`,
      [id]
    )[0];
    if (!existing) throw new Error('سجل فحص الجودة غير موجود.');
    if (existing.branchId) this.branchAccess.requireBranchAccess(existing.branchId, actor);

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
    this.db.run(`UPDATE manufacturing_quality_checks SET ${updates.join(', ')} WHERE id = ?`, params);
    this.audit('تحديث فحص جودة', id, { result: input.result });
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

  public createMaintenance(input: CreateMaintenanceDTO): MaintenanceRecord {
    this.guardWrites();
    const actor = this.require('manufacturing.manage');
    if (!input?.equipmentName?.trim()) throw new Error('اسم المعدة مطلوب.');
    let branchId = input.branchId;
    if (input.workCenterId) {
      const wc = this.db.query<any>(`SELECT branch_id AS branchId FROM work_centers WHERE id = ?`, [input.workCenterId])[0];
      if (!wc) throw new Error('مركز العمل غير موجود.');
      if (branchId && branchId !== wc.branchId) throw new Error('مركز العمل لا يتبع هذا الفرع.');
      branchId = branchId || wc.branchId;
    }
    branchId = branchId || this.branchAccess.getDefaultAccessibleBranchId(actor);
    this.branchAccess.requireBranchAccess(branchId, actor);

    const maintenanceType = input.maintenanceType || 'PREVENTIVE';
    if (!['PREVENTIVE', 'CORRECTIVE', 'PREDICTIVE'].includes(maintenanceType)) {
      throw new Error('نوع الصيانة غير صالح.');
    }
    if (input.scheduledDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.scheduledDate)) throw new Error('تاريخ الجدولة غير صالح.');
    }

    const id = `mnt_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = new Date().toISOString();
    const notes = input.notes === undefined ? null : (input.notes?.trim() || null);
    this.db.run(
      `INSERT INTO manufacturing_maintenance
        (id, work_center_id, equipment_name, maintenance_type, status, scheduled_date, cost, notes, performed_by, branch_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'SCHEDULED', ?, 0, ?, ?, ?, ?, ?)`,
      [id, input.workCenterId || null, input.equipmentName.trim(), maintenanceType, input.scheduledDate || null, notes, actor.id, branchId, now, now]
    );
    this.audit('جدولة صيانة', id, { equipmentName: input.equipmentName.trim(), maintenanceType });
    return this.getMaintenance(id);
  }

  public getMaintenance(id: string): MaintenanceRecord {
    const actor = this.require('manufacturing.view');
    const row = this.db.query<any>(`SELECT * FROM manufacturing_maintenance WHERE id = ?`, [id])[0];
    if (!row) throw new Error('سجل الصيانة غير موجود.');
    if (row.branchId) this.branchAccess.requireBranchAccess(row.branchId, actor);
    return this.mapMaintenance(row);
  }

  public getMaintenanceRecords(filters?: { status?: string; workCenterId?: string }): MaintenanceRecord[] {
    const actor = this.require('manufacturing.view');
    const conditions: string[] = [];
    const params: Array<string> = [];
    if (filters?.status) {
      conditions.push('m.status = ?');
      params.push(filters.status);
    }
    if (filters?.workCenterId) {
      conditions.push('m.work_center_id = ?');
      params.push(filters.workCenterId);
    }
    const scope = this.branchAccess.sqlScope('m.branch_id', undefined, actor);
    conditions.push(scope.clause);
    params.push(...scope.params);
    const rows = this.db.query<any>(
      `SELECT m.* FROM manufacturing_maintenance m
       ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
       ORDER BY m.created_at DESC`,
      params
    );
    return rows.map((row) => this.mapMaintenance(row));
  }

  public updateMaintenance(id: string, input: UpdateMaintenanceDTO): MaintenanceRecord {
    this.guardWrites();
    const actor = this.require('manufacturing.manage');
    const existing = this.db.query<any>(`SELECT * FROM manufacturing_maintenance WHERE id = ?`, [id])[0];
    if (!existing) throw new Error('سجل الصيانة غير موجود.');
    if (existing.branchId) this.branchAccess.requireBranchAccess(existing.branchId, actor);

    const updates: string[] = [];
    const params: Array<any> = [];
    if (input.maintenanceType !== undefined) {
      if (!['PREVENTIVE', 'CORRECTIVE', 'PREDICTIVE'].includes(input.maintenanceType)) throw new Error('نوع الصيانة غير صالح.');
      updates.push('maintenance_type = ?'); params.push(input.maintenanceType);
    }
    if (input.status !== undefined) {
      if (!['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(input.status)) throw new Error('حالة الصيانة غير صالحة.');
      updates.push('status = ?'); params.push(input.status);
      if (input.status === 'COMPLETED' && !input.completedDate) {
        updates.push('completed_date = ?'); params.push(new Date().toISOString().slice(0, 10));
      }
    }
    if (input.completedDate !== undefined) {
      if (input.completedDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.completedDate)) throw new Error('تاريخ الإكمال غير صالح.');
      updates.push('completed_date = ?'); params.push(input.completedDate || null);
    }
    if (input.cost !== undefined) {
      const v = Number(input.cost);
      if (!Number.isFinite(v) || v < 0) throw new Error('التكلفة غير صالحة.');
      updates.push('cost = ?'); params.push(v);
    }
    if (input.notes !== undefined) {
      updates.push('notes = ?');
      params.push(input.notes === null ? null : (input.notes?.trim() || null));
    }
    if (updates.length === 0) return this.getMaintenance(id);
    updates.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);
    this.db.run(`UPDATE manufacturing_maintenance SET ${updates.join(', ')} WHERE id = ?`, params);
    this.audit('تحديث صيانة', id, { status: input.status });
    return this.getMaintenance(id);
  }

  private mapMaintenance(row: any): MaintenanceRecord {
    return {
      id: row.id,
      workCenterId: row.workCenterId ?? null,
      equipmentName: row.equipmentName,
      maintenanceType: row.maintenanceType,
      status: row.status,
      scheduledDate: row.scheduledDate ?? null,
      completedDate: row.completedDate ?? null,
      cost: Number(row.cost || 0),
      notes: row.notes ?? null,
      performedBy: row.performedBy ?? null,
      branchId: row.branchId ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  public getWipValuation(): { orders: WipOrder[]; totalMaterialCost: number; totalQuantity: number } {
    const actor = this.require('manufacturing.view');
    const scope = this.branchAccess.sqlScope('o.branch_id', undefined, actor);
    const rows = this.db.query<any>(
      `SELECT o.id, o.order_number AS orderNumber, o.product_id AS productId, p.name AS productName,
              o.quantity, o.status, o.branch_id AS branchId, p.cost_price AS finishedProductCostPrice
       FROM production_orders o
       JOIN products p ON p.id = o.product_id
       WHERE o.status IN ('RELEASED', 'IN_PROGRESS') AND ${scope.clause}
       ORDER BY o.created_at DESC`,
      scope.params
    );
    const orders: WipOrder[] = rows.map((row) => {
      const materials = this.db.query<any>(
        `SELECT m.planned_qty AS plannedQty, pr.cost_price AS costPrice
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

  public recordQualityDisposition(id: string, disposition: 'ACCEPT' | 'SCRAP' | 'REWORK' | 'RETURN', quantity: number, notes?: string): QualityCheck {
    this.guardWrites();
    const actor = this.require('manufacturing.manage');
    const existing = this.db.query<any>(`SELECT * FROM manufacturing_quality_checks WHERE id = ?`, [id])[0];
    if (!existing) throw new Error('سجل فحص الجودة غير موجود.');
    if (existing.branchId) this.branchAccess.requireBranchAccess(existing.branchId, actor);
    if (!['ACCEPT', 'SCRAP', 'REWORK', 'RETURN'].includes(disposition)) throw new Error('قرار المعالجة غير صالح.');
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty < 0) throw new Error('الكمية غير صالحة.');

    const order = this.getOrderInternal(existing.productionOrderId);
    const warehouseId = order?.warehouseId || null;

    // SCRAP reduces finished/ component stock? Here we scrap rejected finished goods from warehouse.
    if (disposition === 'SCRAP' && qty > 0 && warehouseId) {
      const productId = order?.productId;
      if (productId) {
        const stock = this.db.query<{ quantityM2: number }>(
          `SELECT quantity_m2 AS quantityM2 FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?`,
          [warehouseId, productId]
        )[0];
        const current = Number(stock?.quantityM2 || 0);
        if (current < qty) throw new Error('الرصيد المتاح غير كافٍ للإتلاف.');
        this.db.run(
          `UPDATE warehouse_stock SET quantity_m2 = quantity_m2 - ?, last_updated = ? WHERE warehouse_id = ? AND product_id = ?`,
          [qty, new Date().toISOString(), warehouseId, productId]
        );
        const txNumber = this.db.nextNumber('INV');
        this.db.run(
          `INSERT INTO inventory_transactions (id, transaction_number, type, product_id, warehouse_id, quantity_m2, boxes_count, unit_cost, total_cost, reference_type, reference_id, notes, performed_by, created_at)
           VALUES (?, ?, 'ADJUSTMENT_SUB', ?, ?, ?, 0, 0, 0, 'QUALITY_DISPOSITION', ?, 'إتلاف (Scrap)', ?, ?)`,
          [`itx_${uuidv4().replace(/-/g, '').slice(0, 12)}`, txNumber, productId, warehouseId, qty, id, actor.id, new Date().toISOString()]
        );
      }
    }

    const now = new Date().toISOString();
    this.db.run(
      `UPDATE manufacturing_quality_checks SET disposition = ?, disposition_qty = ?, disposition_at = ?, updated_at = ? WHERE id = ?`,
      [disposition, qty, now, now, id]
    );
    this.audit('قرار معالجة جودة', id, { disposition, quantity: qty });
    return this.getQualityCheck(id);
  }

  public cancelOrder(id: string, reason?: string): ProductionOrder {
    this.guardWrites();
    const actor = this.require('manufacturing.manage');
    const order = this.getProductionOrder(id);
    if (order.status === 'COMPLETED' || order.status === 'CANCELLED') {
      throw new Error('لا يمكن إلغاء أمر إنتاج مكتمل أو ملغى بالفعل.');
    }
    this.db.run(
      `UPDATE production_orders SET status = 'CANCELLED', updated_at = ? WHERE id = ?`,
      [new Date().toISOString(), id]
    );
    this.audit('إلغاء أمر إنتاج', id, { reason: reason || null });
    return this.getProductionOrder(id);
  }

  private audit(action: string, recordId: string, values?: unknown): void {
    const actor = AuthService.requireAuth();
    this.db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
       VALUES (?, ?, ?, ?, 'MANUFACTURING', ?, ?)`,
      [
        `aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, action, recordId,
        values === undefined ? null : JSON.stringify(values),
      ]
    );
  }
}
