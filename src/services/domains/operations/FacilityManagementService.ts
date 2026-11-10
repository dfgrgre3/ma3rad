import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { PermissionService } from '../auth/PermissionService';
import { NotificationService } from '../notifications/NotificationService';
import { addLocalDays, localDateString } from '../../../utils/shared/date';

type LocationType = 'BUILDING' | 'FLOOR' | 'ROOM' | 'SHOWROOM' | 'OFFICE' | 'FACTORY' | 'PRODUCTION_AREA' | 'WAREHOUSE' | 'OTHER';
type WorkOrderType = 'PREVENTIVE' | 'CORRECTIVE' | 'PREDICTIVE';
type ContractType = 'LEASE' | 'MAINTENANCE' | 'CLEANING' | 'SECURITY' | 'UTILITY' | 'OTHER';
type SafetyRecordType = 'INSPECTION' | 'INCIDENT' | 'RISK';

type Location = {
  id: string; parentId: string | null; branchId: string; branchName: string; locationType: LocationType;
  name: string; code: string | null; address: string | null; managerUserId: string | null; managerName: string | null;
};
type FacilityAsset = {
  id: string; code: string; name: string; category: string; locationId: string; locationName: string;
  branchId: string; serialNumber: string | null; status: string; responsibleUserId: string | null;
  responsibleName: string | null; warrantyExpiresAt: string | null;
};
type WorkOrder = {
  id: string; workOrderNumber: string; locationId: string; locationName: string; assetId: string | null;
  assetName: string | null; requestType: WorkOrderType; title: string; description: string | null;
  priority: string; status: string; requestedBy: string; requesterName: string; assignedTo: string | null;
  assigneeName: string | null; vendorName: string | null; scheduledDate: string | null; completedDate: string | null;
  laborCost: number; partsCost: number; serviceCost: number; expenseReference: string | null;
  stockIssueReference: string | null; resolutionNotes: string | null; expenseId: string | null;
  expenseDescription: string | null; inventoryTransactionId: string | null; stockTransactionNumber: string | null;
};
type FacilityContract = {
  id: string; contractNumber: string; locationId: string; locationName: string; contractType: ContractType;
  title: string; vendorName: string; startsAt: string | null; endsAt: string | null; nextPaymentDate: string | null;
  paymentAmount: number; paymentCycle: string; status: string; expenseReference: string | null;
};
type SafetyRecord = {
  id: string; locationId: string; locationName: string; assetId: string | null; assetName: string | null;
  recordType: SafetyRecordType; title: string; checklistName: string | null; result: string; riskLevel: string | null;
  observations: string | null; correctiveAction: string | null; dueDate: string | null; closedAt: string | null;
  recordedBy: string; recorderName: string;
};
type BranchOption = { id: string; name: string };
type UserOption = { id: string; fullName: string };
type FixedAssetOption = { id: string; name: string; code: string; branchId: string | null };
type ExpenseOption = { id: string; date: string; description: string; amount: number; recipient: string | null };
type StockIssueOption = { id: string; transactionNumber: string; productName: string; warehouseName: string; quantityM2: number; createdAt: string };
type MaintenanceSchedule = {
  id: string; locationId: string; locationName: string; assetId: string | null; assetName: string | null;
  title: string; description: string | null; intervalDays: number; nextDueDate: string; assignedTo: string | null;
  assigneeName: string | null;
};

export class FacilityManagementService {
  private readonly db = DatabaseManager.getInstance();
  private readonly branchAccess = new BranchAccessService();

  private actor() {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'operations.view');
    return actor;
  }

  private requireManage() {
    const actor = this.actor();
    PermissionService.require(actor, 'operations.update');
    return actor;
  }

  private scope(branchExpression: string) {
    const actor = this.actor();
    const scope = this.branchAccess.sqlScope(branchExpression, undefined, actor, true);
    return scope;
  }

  getBranches(): BranchOption[] {
    const scope = this.scope('b.id');
    return this.db.query<BranchOption>(
      `SELECT b.id, b.name FROM branches b WHERE ${scope.clause} AND b.is_active = 1 ORDER BY b.name`, scope.params
    );
  }

  getUsers(): UserOption[] {
    this.actor();
    return this.db.query<UserOption>(`SELECT id, full_name AS fullName FROM users WHERE is_active = 1 ORDER BY full_name`);
  }

  getFixedAssets(): FixedAssetOption[] {
    const scope = this.scope('fa.branch_id');
    return this.db.query<FixedAssetOption>(`
      SELECT fa.id, fa.name, fa.code, fa.branch_id AS branchId
      FROM fixed_assets fa WHERE fa.status = 'ACTIVE' AND ${scope.clause}
      ORDER BY fa.name
    `, scope.params);
  }

  getExpenses(): ExpenseOption[] {
    const scope = this.scope('e.branch_id');
    return this.db.query<ExpenseOption>(`
      SELECT e.id, e.date, e.description, e.amount, e.recipient
      FROM expenses e WHERE ${scope.clause}
      ORDER BY e.date DESC, e.created_at DESC LIMIT 200
    `, scope.params);
  }

  getStockIssueTransactions(): StockIssueOption[] {
    const scope = this.scope('w.branch_id');
    return this.db.query<StockIssueOption>(`
      SELECT it.id, it.transaction_number AS transactionNumber, p.name AS productName,
        w.name AS warehouseName, ABS(it.quantity_m2) AS quantityM2, it.created_at AS createdAt
      FROM inventory_transactions it
      JOIN warehouses w ON w.id = it.warehouse_id
      JOIN products p ON p.id = it.product_id
      WHERE ${scope.clause} AND it.quantity_m2 < 0 AND it.type IN ('ADJUSTMENT_SUB', 'DAMAGE')
      ORDER BY it.created_at DESC LIMIT 200
    `, scope.params);
  }

  getMaintenanceSchedules(): MaintenanceSchedule[] {
    const scope = this.scope('fl.branch_id');
    return this.db.query<MaintenanceSchedule>(`
      SELECT ms.id, ms.location_id AS locationId, fl.name AS locationName,
        ms.asset_id AS assetId, fa.name AS assetName, ms.title, ms.description,
        ms.interval_days AS intervalDays, ms.next_due_date AS nextDueDate,
        ms.assigned_to AS assignedTo, u.full_name AS assigneeName
      FROM facility_maintenance_schedules ms
      JOIN facility_locations fl ON fl.id = ms.location_id
      LEFT JOIN facility_assets fa ON fa.id = ms.asset_id
      LEFT JOIN users u ON u.id = ms.assigned_to
      WHERE ${scope.clause} AND ms.is_active = 1
      ORDER BY ms.next_due_date, ms.title
    `, scope.params);
  }

  runFacilityReminders(): void {
    const actor = this.actor();
    const today = localDateString();
    const inSevenDays = localDateString(addLocalDays(new Date(), 7));
    const notifications = new NotificationService();
    const locationScope = this.branchAccess.sqlScope('fl.branch_id', undefined, actor, true);
    const candidates = this.db.query<{ id: string; title: string; dueDate: string; kind: string }>(`
      SELECT fc.id, fc.title, fc.next_payment_date AS dueDate, 'دفعة' AS kind
      FROM facility_contracts fc JOIN facility_locations fl ON fl.id = fc.location_id
      WHERE fc.status = 'ACTIVE' AND fc.next_payment_date BETWEEN ? AND ? AND ${locationScope.clause}
      UNION ALL
      SELECT fc.id, fc.title, fc.ends_at AS dueDate, 'انتهاء عقد' AS kind
      FROM facility_contracts fc JOIN facility_locations fl ON fl.id = fc.location_id
      WHERE fc.status = 'ACTIVE' AND fc.ends_at BETWEEN ? AND ? AND ${locationScope.clause}
      UNION ALL
      SELECT ms.id, ms.title, ms.next_due_date AS dueDate, 'صيانة وقائية' AS kind
      FROM facility_maintenance_schedules ms JOIN facility_locations fl ON fl.id = ms.location_id
      WHERE ms.is_active = 1 AND ms.next_due_date BETWEEN ? AND ? AND ${locationScope.clause}
    `, [today, inSevenDays, ...locationScope.params, today, inSevenDays, ...locationScope.params, today, inSevenDays, ...locationScope.params]);

    for (const candidate of candidates) {
      const daysLeft = Math.max(0, Math.ceil((Date.parse(`${candidate.dueDate}T00:00:00`) - Date.parse(`${today}T00:00:00`)) / 86400000));
      const referenceId = `${candidate.id}:${candidate.kind}:${candidate.dueDate}`;
      const exists = this.db.query<{ id: string }>(`
        SELECT id FROM notifications WHERE user_id = ? AND reference_type = 'FACILITY_DUE' AND reference_id = ? LIMIT 1
      `, [actor.id, referenceId]);
      if (!exists.length) {
        notifications.createNotification('SYSTEM', `استحقاق منشأة خلال ${daysLeft} يوم`, `${candidate.kind}: ${candidate.title}، الموعد ${candidate.dueDate}`, actor.id, 'FACILITY_DUE', referenceId);
      }
    }
  }

  getLocations(): Location[] {
    const scope = this.scope('fl.branch_id');
    return this.db.query<Location>(`
      SELECT fl.id, fl.parent_id AS parentId, fl.branch_id AS branchId, b.name AS branchName,
        fl.location_type AS locationType, fl.name, fl.code, fl.address,
        fl.manager_user_id AS managerUserId, u.full_name AS managerName
      FROM facility_locations fl
      JOIN branches b ON b.id = fl.branch_id
      LEFT JOIN users u ON u.id = fl.manager_user_id
      WHERE ${scope.clause} AND fl.is_active = 1 ORDER BY b.name, fl.name
    `, scope.params);
  }

  getAssets(): FacilityAsset[] {
    const scope = this.scope('fa.branch_id');
    return this.db.query<FacilityAsset>(`
      SELECT fa.id, fa.code, fa.name, fa.category, fa.location_id AS locationId,
        fl.name AS locationName, fa.branch_id AS branchId, fa.serial_number AS serialNumber,
        fa.status, fa.responsible_user_id AS responsibleUserId, u.full_name AS responsibleName,
        fa.warranty_expires_at AS warrantyExpiresAt
      FROM facility_assets fa
      JOIN facility_locations fl ON fl.id = fa.location_id
      LEFT JOIN users u ON u.id = fa.responsible_user_id
      WHERE ${scope.clause} ORDER BY fa.status, fa.name
    `, scope.params);
  }

  getWorkOrders(): WorkOrder[] {
    const scope = this.scope('fl.branch_id');
    return this.db.query<WorkOrder>(`
      SELECT wo.id, wo.work_order_number AS workOrderNumber, wo.location_id AS locationId,
        fl.name AS locationName, wo.asset_id AS assetId, fa.name AS assetName,
        wo.request_type AS requestType, wo.title, wo.description, wo.priority, wo.status,
        wo.requested_by AS requestedBy, requester.full_name AS requesterName,
        wo.assigned_to AS assignedTo, assignee.full_name AS assigneeName, wo.vendor_name AS vendorName,
        wo.scheduled_date AS scheduledDate, wo.completed_date AS completedDate,
        wo.labor_cost AS laborCost, wo.parts_cost AS partsCost, wo.service_cost AS serviceCost,
        wo.expense_reference AS expenseReference, wo.stock_issue_reference AS stockIssueReference,
        wo.resolution_notes AS resolutionNotes, wo.expense_id AS expenseId,
        e.description AS expenseDescription, wo.inventory_transaction_id AS inventoryTransactionId,
        it.transaction_number AS stockTransactionNumber
      FROM facility_work_orders wo
      JOIN facility_locations fl ON fl.id = wo.location_id
      LEFT JOIN facility_assets fa ON fa.id = wo.asset_id
      LEFT JOIN users requester ON requester.id = wo.requested_by
      LEFT JOIN users assignee ON assignee.id = wo.assigned_to
      LEFT JOIN expenses e ON e.id = wo.expense_id
      LEFT JOIN inventory_transactions it ON it.id = wo.inventory_transaction_id
      WHERE ${scope.clause} ORDER BY CASE wo.priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 ELSE 2 END,
        COALESCE(wo.scheduled_date, date(wo.created_at))
    `, scope.params);
  }

  getContracts(): FacilityContract[] {
    const scope = this.scope('fl.branch_id');
    return this.db.query<FacilityContract>(`
      SELECT fc.id, fc.contract_number AS contractNumber, fc.location_id AS locationId,
        fl.name AS locationName, fc.contract_type AS contractType, fc.title, fc.vendor_name AS vendorName,
        fc.starts_at AS startsAt, fc.ends_at AS endsAt, fc.next_payment_date AS nextPaymentDate,
        fc.payment_amount AS paymentAmount, fc.payment_cycle AS paymentCycle, fc.status,
        fc.expense_reference AS expenseReference
      FROM facility_contracts fc JOIN facility_locations fl ON fl.id = fc.location_id
      WHERE ${scope.clause} ORDER BY COALESCE(fc.next_payment_date, fc.ends_at), fc.title
    `, scope.params);
  }

  getSafetyRecords(): SafetyRecord[] {
    const scope = this.scope('fl.branch_id');
    return this.db.query<SafetyRecord>(`
      SELECT sr.id, sr.location_id AS locationId, fl.name AS locationName,
        sr.asset_id AS assetId, fa.name AS assetName, sr.record_type AS recordType, sr.title,
        sr.checklist_name AS checklistName, sr.result, sr.risk_level AS riskLevel,
        sr.observations, sr.corrective_action AS correctiveAction, sr.due_date AS dueDate,
        sr.closed_at AS closedAt, sr.recorded_by AS recordedBy, u.full_name AS recorderName
      FROM facility_safety_records sr
      JOIN facility_locations fl ON fl.id = sr.location_id
      LEFT JOIN facility_assets fa ON fa.id = sr.asset_id
      JOIN users u ON u.id = sr.recorded_by
      WHERE ${scope.clause} ORDER BY CASE sr.result WHEN 'FAIL' THEN 0 WHEN 'OBSERVATION' THEN 1 ELSE 2 END,
        COALESCE(sr.due_date, sr.created_at) DESC
    `, scope.params);
  }

  createLocation(input: { branchId: string; parentId?: string; locationType: LocationType; name: string; code?: string; address?: string; managerUserId?: string }) {
    const actor = this.requireManage();
    const scope = this.branchAccess.sqlScope('b.id', undefined, actor, true);
    const allowed = this.db.query<{ id: string }>(`SELECT b.id FROM branches b WHERE b.id = ? AND ${scope.clause}`, [input.branchId, ...scope.params]);
    if (!allowed.length) throw new Error('لا تملك صلاحية على هذا الفرع.');
    if (input.parentId) {
      const parent = this.db.query<{ id: string }>(`SELECT id FROM facility_locations WHERE id = ? AND branch_id = ? AND is_active = 1`, [input.parentId, input.branchId]);
      if (!parent.length) throw new Error('يجب أن يكون الموقع الأعلى ضمن الفرع نفسه.');
    }
    this.db.run(`INSERT INTO facility_locations (id, parent_id, branch_id, location_type, name, code, address, manager_user_id, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [uuidv4(), input.parentId || null, input.branchId, input.locationType, input.name.trim(), input.code || null, input.address || null, input.managerUserId || null, actor.id]);
  }

  createAsset(input: { locationId: string; fixedAssetId?: string; code: string; name: string; category: string; serialNumber?: string; responsibleUserId?: string; warrantyExpiresAt?: string; notes?: string }) {
    const actor = this.requireManage();
    const scope = this.branchAccess.sqlScope('fl.branch_id', undefined, actor, true);
    const location = this.db.query<{ id: string; branchId: string }>(`SELECT fl.id, fl.branch_id AS branchId FROM facility_locations fl WHERE fl.id = ? AND fl.is_active = 1 AND ${scope.clause}`, [input.locationId, ...scope.params])[0];
    if (!location) throw new Error('الموقع غير متاح ضمن الفروع المصرح بها.');
    if (input.fixedAssetId) {
      const fixedAsset = this.db.query<{ id: string }>('SELECT id FROM fixed_assets WHERE id = ? AND (branch_id = ? OR branch_id IS NULL)', [input.fixedAssetId, location.branchId]);
      if (!fixedAsset.length) throw new Error('الأصل الثابت غير تابع لهذا الفرع.');
    }
    this.db.run(`INSERT INTO facility_assets (id, code, name, category, location_id, branch_id, fixed_asset_id, serial_number, responsible_user_id, warranty_expires_at, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [uuidv4(), input.code.trim(), input.name.trim(), input.category || 'EQUIPMENT', location.id, location.branchId, input.fixedAssetId || null, input.serialNumber || null, input.responsibleUserId || null, input.warrantyExpiresAt || null, input.notes || null, actor.id]);
  }

  createWorkOrder(input: { locationId: string; assetId?: string; requestType: WorkOrderType; title: string; description?: string; priority: string; assignedTo?: string; vendorName?: string; scheduledDate?: string; nextMaintenanceDate?: string; repeatIntervalDays?: number; laborCost?: number; partsCost?: number; serviceCost?: number; expenseId?: string; inventoryTransactionId?: string }) {
    const actor = this.requireManage();
    const scope = this.branchAccess.sqlScope('fl.branch_id', undefined, actor, true);
    const location = this.db.query<{ id: string; branchId: string }>(`SELECT fl.id, fl.branch_id AS branchId FROM facility_locations fl WHERE fl.id = ? AND ${scope.clause}`, [input.locationId, ...scope.params])[0];
    if (!location) throw new Error('الموقع غير متاح ضمن الفروع المصرح بها.');
    if (input.assetId) {
      const asset = this.db.query<{ id: string }>('SELECT id FROM facility_assets WHERE id = ? AND location_id = ?', [input.assetId, input.locationId]);
      if (!asset.length) throw new Error('الأصل المحدد لا يتبع الموقع المختار.');
    }
    if (input.expenseId) {
      const expense = this.db.query<{ id: string }>('SELECT id FROM expenses WHERE id = ? AND branch_id = ?', [input.expenseId, location.branchId]);
      if (!expense.length) throw new Error('المصروف المحدد لا يتبع الفرع المختار.');
    }
    if (input.inventoryTransactionId) {
      const transaction = this.db.query<{ id: string }>(`
        SELECT it.id FROM inventory_transactions it JOIN warehouses w ON w.id = it.warehouse_id
        WHERE it.id = ? AND w.branch_id = ? AND it.quantity_m2 < 0 AND it.type IN ('ADJUSTMENT_SUB', 'DAMAGE')
      `, [input.inventoryTransactionId, location.branchId]);
      if (!transaction.length) throw new Error('حركة الصرف المحددة لا تتبع الفرع أو ليست حركة صرف.');
    }
    const intervalDays = Number(input.repeatIntervalDays || 0);
    if (intervalDays && (input.requestType !== 'PREVENTIVE' || !Number.isInteger(intervalDays) || intervalDays < 1 || !input.nextMaintenanceDate)) {
      throw new Error('الجدولة المتكررة تتطلب صيانة وقائية وموعداً تالياً وفترة صحيحة بالأيام.');
    }
    const count = this.db.query<{ count: number }>('SELECT COUNT(*) AS count FROM facility_work_orders')[0]?.count || 0;
    const number = `FM-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;
    const workOrderId = uuidv4();
    this.db.executeTransaction((sqliteDb) => {
      sqliteDb.run(`INSERT INTO facility_work_orders (id, work_order_number, location_id, asset_id, request_type, title, description, priority, requested_by, assigned_to, vendor_name, scheduled_date, next_maintenance_date, labor_cost, parts_cost, service_cost, expense_id, inventory_transaction_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [workOrderId, number, input.locationId, input.assetId || null, input.requestType, input.title.trim(), input.description || null, input.priority, actor.id, input.assignedTo || null, input.vendorName || null, input.scheduledDate || null, input.nextMaintenanceDate || null, Math.max(0, Number(input.laborCost || 0)), Math.max(0, Number(input.partsCost || 0)), Math.max(0, Number(input.serviceCost || 0)), input.expenseId || null, input.inventoryTransactionId || null]);
      if (intervalDays) {
        sqliteDb.run(`INSERT INTO facility_maintenance_schedules (id, location_id, asset_id, title, description, interval_days, next_due_date, assigned_to, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [uuidv4(), input.locationId, input.assetId || null, input.title.trim(), input.description || null, intervalDays, input.nextMaintenanceDate, input.assignedTo || null, actor.id]);
      }
    });
  }

  createDueScheduleWorkOrder(scheduleId: string): void {
    const actor = this.requireManage();
    const scope = this.branchAccess.sqlScope('fl.branch_id', undefined, actor, true);
    const schedule = this.db.query<MaintenanceSchedule & { branchId: string }>(`
      SELECT ms.id, ms.location_id AS locationId, fl.name AS locationName, fl.branch_id AS branchId,
        ms.asset_id AS assetId, fa.name AS assetName, ms.title, ms.description,
        ms.interval_days AS intervalDays, ms.next_due_date AS nextDueDate,
        ms.assigned_to AS assignedTo, u.full_name AS assigneeName
      FROM facility_maintenance_schedules ms
      JOIN facility_locations fl ON fl.id = ms.location_id
      LEFT JOIN facility_assets fa ON fa.id = ms.asset_id
      LEFT JOIN users u ON u.id = ms.assigned_to
      WHERE ms.id = ? AND ms.is_active = 1 AND ${scope.clause}
    `, [scheduleId, ...scope.params])[0];
    if (!schedule) throw new Error('جدول الصيانة غير متاح.');
    const today = localDateString();
    if (schedule.nextDueDate > today) throw new Error('موعد الصيانة الوقائية لم يحن بعد.');
    const count = this.db.query<{ count: number }>('SELECT COUNT(*) AS count FROM facility_work_orders')[0]?.count || 0;
    const number = `FM-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;
    const orderId = uuidv4();
    this.db.executeTransaction((sqliteDb) => {
      sqliteDb.run(`INSERT INTO facility_work_orders (id, work_order_number, location_id, asset_id, request_type, title, description, priority, status, requested_by, assigned_to, scheduled_date, maintenance_schedule_id, schedule_due_date)
        VALUES (?, ?, ?, ?, 'PREVENTIVE', ?, ?, 'NORMAL', 'OPEN', ?, ?, ?, ?, ?)`, [orderId, number, schedule.locationId, schedule.assetId, schedule.title, schedule.description, actor.id, schedule.assignedTo, schedule.nextDueDate, schedule.id, schedule.nextDueDate]);
      const nextDue = localDateString(addLocalDays(new Date(`${schedule.nextDueDate}T00:00:00`), schedule.intervalDays));
      sqliteDb.run(`UPDATE facility_maintenance_schedules SET next_due_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [nextDue, schedule.id]);
    });
  }

  updateWorkOrderStatus(id: string, status: 'APPROVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED', resolutionNotes?: string) {
    const actor = this.requireManage();
    const scope = this.branchAccess.sqlScope('fl.branch_id', undefined, actor, true);
    const result = this.db.query<{ id: string }>(`SELECT wo.id FROM facility_work_orders wo JOIN facility_locations fl ON fl.id = wo.location_id WHERE wo.id = ? AND ${scope.clause}`, [id, ...scope.params]);
    if (!result.length) throw new Error('أمر العمل غير متاح.');
    this.db.run(`UPDATE facility_work_orders SET status = ?, resolution_notes = COALESCE(?, resolution_notes),
      completed_date = CASE WHEN ? = 'COMPLETED' THEN date('now') ELSE completed_date END, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [status, resolutionNotes || null, status, id]);
  }

  createContract(input: { locationId: string; contractType: ContractType; title: string; vendorName: string; startsAt?: string; endsAt?: string; nextPaymentDate?: string; paymentAmount?: number; paymentCycle: string; expenseReference?: string }) {
    const actor = this.requireManage();
    const scope = this.branchAccess.sqlScope('fl.branch_id', undefined, actor, true);
    const location = this.db.query<{ id: string }>(`SELECT fl.id FROM facility_locations fl WHERE fl.id = ? AND ${scope.clause}`, [input.locationId, ...scope.params])[0];
    if (!location) throw new Error('الموقع غير متاح ضمن الفروع المصرح بها.');
    const count = this.db.query<{ count: number }>('SELECT COUNT(*) AS count FROM facility_contracts')[0]?.count || 0;
    const number = `FC-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;
    this.db.run(`INSERT INTO facility_contracts (id, contract_number, location_id, contract_type, title, vendor_name, starts_at, ends_at, next_payment_date, payment_amount, payment_cycle, expense_reference, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [uuidv4(), number, input.locationId, input.contractType, input.title.trim(), input.vendorName.trim(), input.startsAt || null, input.endsAt || null, input.nextPaymentDate || null, Math.max(0, Number(input.paymentAmount || 0)), input.paymentCycle, input.expenseReference || null, actor.id]);
  }

  createSafetyRecord(input: { locationId: string; assetId?: string; recordType: SafetyRecordType; title: string; checklistName?: string; result: string; riskLevel?: string; observations?: string; correctiveAction?: string; dueDate?: string }) {
    const actor = this.requireManage();
    const scope = this.branchAccess.sqlScope('fl.branch_id', undefined, actor, true);
    const location = this.db.query<{ id: string }>(`SELECT fl.id FROM facility_locations fl WHERE fl.id = ? AND ${scope.clause}`, [input.locationId, ...scope.params])[0];
    if (!location) throw new Error('الموقع غير متاح ضمن الفروع المصرح بها.');
    if (input.assetId) {
      const asset = this.db.query<{ id: string }>('SELECT id FROM facility_assets WHERE id = ? AND location_id = ?', [input.assetId, input.locationId]);
      if (!asset.length) throw new Error('الأصل المحدد لا يتبع الموقع المختار.');
    }
    this.db.run(`INSERT INTO facility_safety_records (id, location_id, asset_id, record_type, title, checklist_name, result, risk_level, observations, corrective_action, due_date, recorded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [uuidv4(), input.locationId, input.assetId || null, input.recordType, input.title.trim(), input.checklistName || null, input.result, input.riskLevel || null, input.observations || null, input.correctiveAction || null, input.dueDate || null, actor.id]);
  }

  closeSafetyRecord(id: string) {
    const actor = this.requireManage();
    const scope = this.branchAccess.sqlScope('fl.branch_id', undefined, actor, true);
    const result = this.db.query<{ id: string }>(`SELECT sr.id FROM facility_safety_records sr JOIN facility_locations fl ON fl.id = sr.location_id WHERE sr.id = ? AND ${scope.clause}`, [id, ...scope.params]);
    if (!result.length) throw new Error('سجل السلامة غير متاح.');
    this.db.run(`UPDATE facility_safety_records SET result = 'CLOSED', closed_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
  }
}
