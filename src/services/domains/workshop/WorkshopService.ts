import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { PermissionService } from '../auth/PermissionService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import { round2 } from '../finance/financials';

export type WorkOrderStatus =
  | 'RECEIVED' | 'INSPECTION' | 'WAITING_APPROVAL' | 'APPROVED'
  | 'IN_PROGRESS' | 'READY' | 'DELIVERED' | 'CANCELLED';

export type InspectionStatus = 'OK' | 'NEEDS_REPAIR' | 'NOT_CHECKED';
export type PartStatus = 'REQUESTED' | 'APPROVED' | 'ISSUED' | 'RETURNED';

export interface WorkshopWorkOrder {
  id: string; branchId: string; orderNumber: string; customerId: string | null;
  customerName: string | null; vehiclePlate: string; vehicleMake: string | null;
  vehicleModel: string | null; vehicleYear: number | null; vin: string | null;
  odometerKm: number | null; status: WorkOrderStatus; complaint: string | null;
  diagnosis: string | null; technicianId: string | null; technicianName: string | null;
  promisedDate: string | null; customerSignature: string | null; approvedAt: string | null;
  laborTotal: number; partsTotal: number; grandTotal: number; invoiceId: string | null;
  notes: string | null; createdAt: string; inspectionCount: number; partsCount: number;
}

export interface InspectionItem {
  id: string; workOrderId: string; category: string; itemName: string;
  status: InspectionStatus; notes: string | null; sortOrder: number;
}

export interface WorkOrderPart {
  id: string; workOrderId: string; productId: string | null; partName: string;
  quantity: number; unitPrice: number; status: PartStatus; notes: string | null;
}

export interface CustomerApproval {
  id: string; workOrderId: string; approvedTotal: number;
  signatureData: string | null; approvedByName: string | null; notes: string | null;
  createdAt: string;
}

/** Default technical inspection checklist seeded per work order. */
export const DEFAULT_INSPECTION_CHECKLIST: Array<{ category: string; itemName: string }> = [
  { category: 'المحرك', itemName: 'مستوى وزيت المحرك' },
  { category: 'المحرك', itemName: 'فلتر الزيت' },
  { category: 'المحرك', itemName: 'فلتر الهواء' },
  { category: 'المحرك', itemName: 'حزام التوقيت / السير' },
  { category: 'الكهرباء', itemName: 'البطارية والأقطاب' },
  { category: 'الكهرباء', itemName: 'الدينمو والمارش' },
  { category: 'الكهرباء', itemName: 'المصابيح والإشارات' },
  { category: 'الفرامل', itemName: 'فحمات الفرامل الأمامية' },
  { category: 'الفرامل', itemName: 'فحمات الفرامل الخلفية' },
  { category: 'الفرامل', itemName: 'زيت الفرامل ونقطة الغليان' },
  { category: 'الإطارات', itemName: 'ضغط وإهتراء الإطارات' },
  { category: 'الإطارات', itemName: 'عزم صواميل العجلات' },
  { category: 'التكييف', itemName: 'غاز التكييف وضاغطها' },
  { category: 'التكييف', itemName: 'فلتر المقصورة' },
  { category: 'الشاسيه', itemName: 'المساعدات والمخمدات' },
  { category: 'الشاسيه', itemName: 'القوائم والأذرع' },
  { category: 'نظافة', itemName: 'الفحص الخارجي والدهانات' },
];

const STATUS_FLOW: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  RECEIVED: ['INSPECTION', 'CANCELLED'],
  INSPECTION: ['WAITING_APPROVAL', 'IN_PROGRESS', 'CANCELLED'],
  WAITING_APPROVAL: ['CANCELLED'],
  APPROVED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['READY', 'CANCELLED'],
  READY: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

export class WorkshopService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();

  private currentBranchId(): string {
    try { return this.branchAccess.getCurrentBranchId(); } catch { return ''; }
  }

  private requireView() {
    ModuleRegistryService.assertModuleEnabled('operations');
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'operations.view');
    return actor;
  }

  private requireManage() {
    ModuleRegistryService.assertModuleEnabled('operations');
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'operations.update');
    return actor;
  }

  // ── Work orders ─────────────────────────────────────────────────────────

  public getWorkOrders(filters?: { status?: WorkOrderStatus; customerId?: string; branchId?: string }): WorkshopWorkOrder[] {
    this.requireView();
    const where: string[] = [];
    const params: unknown[] = [];
    if (filters?.status) { where.push('wo.status = ?'); params.push(filters.status); }
    if (filters?.customerId) { where.push('wo.customer_id = ?'); params.push(filters.customerId); }
    if (filters?.branchId) { where.push('wo.branch_id = ?'); params.push(filters.branchId); }
    return this.db.query<any>(
      `SELECT wo.id, wo.branch_id AS branchId, wo.order_number AS orderNumber,
              wo.customer_id AS customerId, c.name AS customerName,
              wo.vehicle_plate AS vehiclePlate, wo.vehicle_make AS vehicleMake,
              wo.vehicle_model AS vehicleModel, wo.vehicle_year AS vehicleYear, wo.vin,
              wo.odometer_km AS odometerKm, wo.status, wo.complaint, wo.diagnosis,
              wo.technician_id AS technicianId, e.full_name AS technicianName,
              wo.promised_date AS promisedDate, wo.customer_signature AS customerSignature,
              wo.approved_at AS approvedAt, wo.labor_total AS laborTotal,
              wo.parts_total AS partsTotal, wo.grand_total AS grandTotal,
              wo.invoice_id AS invoiceId, wo.notes, wo.created_at AS createdAt,
              (SELECT COUNT(*) FROM workshop_inspection_items wi WHERE wi.work_order_id = wo.id) AS inspectionCount,
              (SELECT COUNT(*) FROM workshop_work_order_parts wp WHERE wp.work_order_id = wo.id) AS partsCount
       FROM workshop_work_orders wo
       LEFT JOIN customers c ON c.id = wo.customer_id
       LEFT JOIN employees e ON e.id = wo.technician_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY wo.created_at DESC`,
      params
    ).map((r) => ({ ...r, laborTotal: round2(r.laborTotal), partsTotal: round2(r.partsTotal), grandTotal: round2(r.grandTotal) }));
  }

  public getWorkOrderById(id: string): WorkshopWorkOrder | null {
    return this.getWorkOrders().find((o) => o.id === id) ?? null;
  }

  public createWorkOrder(input: {
    branchId: string; customerId?: string; vehiclePlate: string; vehicleMake?: string;
    vehicleModel?: string; vehicleYear?: number; vin?: string; odometerKm?: number;
    complaint?: string; technicianId?: string; promisedDate?: string; notes?: string;
    seedInspection?: boolean;
  }): WorkshopWorkOrder {
    this.requireManage();
    const actor = AuthService.requireAuth();
    const number = `WO-${Date.now().toString(36).toUpperCase()}-${uuidv4().slice(0, 4).toUpperCase()}`;
    const id = uuidv4();
    this.db.executeTransaction(() => {
      this.db.run(
        `INSERT INTO workshop_work_orders (id, branch_id, order_number, customer_id, vehicle_plate,
           vehicle_make, vehicle_model, vehicle_year, vin, odometer_km, complaint, technician_id,
           promised_date, notes, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, input.branchId || this.currentBranchId(), number, input.customerId || null, input.vehiclePlate,
         input.vehicleMake ?? null, input.vehicleModel ?? null, input.vehicleYear ?? null,
         input.vin || null, input.odometerKm ?? null, input.complaint || null,
         input.technicianId || null, input.promisedDate || null, input.notes || null, actor.id]
      );
      if (input.seedInspection !== false) {
        DEFAULT_INSPECTION_CHECKLIST.forEach((item, idx) => {
          this.db.run(
            `INSERT INTO workshop_inspection_items (id, work_order_id, category, item_name, status, sort_order)
             VALUES (?,?,?,?,?,?)`,
            [uuidv4(), id, item.category, item.itemName, 'NOT_CHECKED', idx]
          );
        });
      }
    });
    return this.getWorkOrderById(id)!;
  }

  public updateWorkOrder(id: string, patch: {
    complaint?: string; diagnosis?: string; technicianId?: string; promisedDate?: string;
    notes?: string; laborTotal?: number; odometerKm?: number;
  }): void {
    this.requireManage();
    const sets: string[] = [];
    const params: unknown[] = [];
    const map: Record<string, string> = {
      complaint: 'complaint', diagnosis: 'diagnosis', technicianId: 'technician_id',
      promisedDate: 'promised_date', notes: 'notes', laborTotal: 'labor_total', odometerKm: 'odometer_km',
    };
    for (const [key, col] of Object.entries(map)) {
      const v = (patch as any)[key];
      if (v !== undefined) { sets.push(`${col}=?`); params.push(v); }
    }
    if (!sets.length) return;
    sets.push('updated_at=CURRENT_TIMESTAMP');
    params.push(id);
    this.db.run(`UPDATE workshop_work_orders SET ${sets.join(', ')} WHERE id=?`, params);
    this.recalculateTotals(id);
  }

  public transitionStatus(id: string, status: WorkOrderStatus): void {
    this.requireManage();
    const order = this.getWorkOrderById(id);
    if (!order) throw new Error('أمر العمل غير موجود.');
    const allowed = STATUS_FLOW[order.status];
    if (!allowed.includes(status)) {
      throw new Error(`لا يمكن الانتقال من ${order.status} إلى ${status}.`);
    }
    this.db.run(`UPDATE workshop_work_orders SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, [status, id]);
  }

  public recalculateTotals(id: string): void {
    const parts = this.db.query<any>(
      `SELECT COALESCE(SUM(quantity*unit_price),0) AS t FROM workshop_work_order_parts WHERE work_order_id=? AND status != 'RETURNED'`,
      [id]
    )[0];
    const order = this.db.query<any>(`SELECT labor_total AS l FROM workshop_work_orders WHERE id=?`, [id])[0];
    const partsTotal = round2(Number(parts?.t ?? 0));
    const laborTotal = round2(Number(order?.l ?? 0));
    this.db.run(`UPDATE workshop_work_orders SET parts_total=?, grand_total=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [partsTotal, round2(laborTotal + partsTotal), id]);
  }

  // ── Inspection checklist ────────────────────────────────────────────────

  public getInspectionItems(workOrderId: string): InspectionItem[] {
    this.requireView();
    return this.db.query<any>(
      `SELECT id, work_order_id AS workOrderId, category, item_name AS itemName,
              status, notes, sort_order AS sortOrder
       FROM workshop_inspection_items WHERE work_order_id=? ORDER BY sort_order, item_name`,
      [workOrderId]
    );
  }

  public saveInspectionItem(input: { id?: string; workOrderId: string; category?: string; itemName: string; status?: InspectionStatus; notes?: string; sortOrder?: number }): InspectionItem {
    this.requireManage();
    const id = input.id || uuidv4();
    if (input.id) {
      this.db.run(
        `UPDATE workshop_inspection_items SET category=?, item_name=?, status=?, notes=? WHERE id=?`,
        [input.category ?? 'GENERAL', input.itemName, input.status ?? 'OK', input.notes ?? null, id]
      );
    } else {
      this.db.run(
        `INSERT INTO workshop_inspection_items (id, work_order_id, category, item_name, status, notes, sort_order)
         VALUES (?,?,?,?,?,?,?)`,
        [id, input.workOrderId, input.category ?? 'GENERAL', input.itemName, input.status ?? 'OK', input.notes ?? null, input.sortOrder ?? 0]
      );
    }
    return this.getInspectionItems(input.workOrderId).find((i) => i.id === id)!;
  }

  public deleteInspectionItem(id: string): void {
    this.requireManage();
    this.db.run(`DELETE FROM workshop_inspection_items WHERE id=?`, [id]);
  }

  // ── Parts ───────────────────────────────────────────────────────────────

  public getWorkOrderParts(workOrderId: string): WorkOrderPart[] {
    this.requireView();
    return this.db.query<any>(
      `SELECT id, work_order_id AS workOrderId, product_id AS productId, part_name AS partName,
              quantity, unit_price AS unitPrice, status, notes
       FROM workshop_work_order_parts WHERE work_order_id=? ORDER BY created_at`,
      [workOrderId]
    ).map((r) => ({ ...r, unitPrice: round2(r.unitPrice) }));
  }

  public addPart(input: { workOrderId: string; productId?: string; partName: string; quantity?: number; unitPrice?: number; notes?: string }): WorkOrderPart {
    this.requireManage();
    const id = uuidv4();
    this.db.run(
      `INSERT INTO workshop_work_order_parts (id, work_order_id, product_id, part_name, quantity, unit_price, notes)
       VALUES (?,?,?,?,?,?,?)`,
      [id, input.workOrderId, input.productId || null, input.partName, input.quantity ?? 1, input.unitPrice ?? 0, input.notes || null]
    );
    this.recalculateTotals(input.workOrderId);
    return this.getWorkOrderParts(input.workOrderId).find((p) => p.id === id)!;
  }

  public updatePartStatus(partId: string, status: PartStatus): void {
    this.requireManage();
    const part = this.db.query<any>(`SELECT work_order_id AS woId FROM workshop_work_order_parts WHERE id=?`, [partId])[0];
    this.db.run(`UPDATE workshop_work_order_parts SET status=? WHERE id=?`, [status, partId]);
    if (part) this.recalculateTotals(part.woId);
  }

  // ── Customer approval / signature ───────────────────────────────────────

  public approveWorkOrder(workOrderId: string, input: { signatureData?: string; approvedByName: string; notes?: string }): CustomerApproval {
    this.requireManage();
    const order = this.getWorkOrderById(workOrderId);
    if (!order) throw new Error('أمر العمل غير موجود.');
    if (!['INSPECTION', 'WAITING_APPROVAL'].includes(order.status)) {
      throw new Error('لا يمكن اعتماد الأمر في هذه المرحلة — يجب إتمام الفحص أولاً.');
    }
    if (!input.approvedByName?.trim()) throw new Error('اسم الموافق مطلوب.');
    const actor = AuthService.requireAuth();
    const id = uuidv4();
    this.db.executeTransaction(() => {
      this.db.run(
        `INSERT INTO workshop_customer_approvals (id, work_order_id, approved_total, signature_data, approved_by_name, notes)
         VALUES (?,?,?,?,?,?)`,
        [id, workOrderId, order.grandTotal, input.signatureData ?? null, input.approvedByName.trim(), input.notes ?? null]
      );
      this.db.run(
        `UPDATE workshop_work_orders SET status='APPROVED', approved_at=CURRENT_TIMESTAMP, approved_by=?, customer_signature=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        [actor.id, input.signatureData ?? null, workOrderId]
      );
    });
    return this.getApprovals(workOrderId).find((a) => a.id === id)!;
  }

  public getApprovals(workOrderId: string): CustomerApproval[] {
    this.requireView();
    return this.db.query<any>(
      `SELECT id, work_order_id AS workOrderId, approved_total AS approvedTotal,
              signature_data AS signatureData, approved_by_name AS approvedByName,
              notes, created_at AS createdAt
       FROM workshop_customer_approvals WHERE work_order_id=? ORDER BY created_at DESC`,
      [workOrderId]
    ).map((r) => ({ ...r, approvedTotal: round2(r.approvedTotal) }));
  }

  // ── Dashboard ───────────────────────────────────────────────────────────

  public getDashboardStats(branchId?: string): {
    openOrders: number; inProgress: number; waitingApproval: number; ready: number;
    deliveredThisMonth: number; revenueThisMonth: number;
  } {
    this.requireView();
    const month = new Date().toISOString().slice(0, 7);
    const row = (sql: string, params: unknown[] = []) => Number(this.db.query<any>(sql, params)[0]?.c ?? 0);
    const b = branchId ? 'AND branch_id=?' : '';
    const bp = branchId ? [branchId] : [];
    return {
      openOrders: row(`SELECT COUNT(*) c FROM workshop_work_orders WHERE status IN ('RECEIVED','INSPECTION') ${b}`, bp),
      inProgress: row(`SELECT COUNT(*) c FROM workshop_work_orders WHERE status IN ('APPROVED','IN_PROGRESS') ${b}`, bp),
      waitingApproval: row(`SELECT COUNT(*) c FROM workshop_work_orders WHERE status='WAITING_APPROVAL' ${b}`, bp),
      ready: row(`SELECT COUNT(*) c FROM workshop_work_orders WHERE status='READY' ${b}`, bp),
      deliveredThisMonth: row(`SELECT COUNT(*) c FROM workshop_work_orders WHERE status='DELIVERED' AND strftime('%Y-%m', created_at)=? ${b}`, [month, ...bp]),
      revenueThisMonth: round2(Number(this.db.query<any>(
        `SELECT COALESCE(SUM(grand_total),0) t FROM workshop_work_orders WHERE status='DELIVERED' AND strftime('%Y-%m', created_at)=? ${b}`,
        [month, ...bp]
      )[0]?.t ?? 0)),
    };
  }
}
