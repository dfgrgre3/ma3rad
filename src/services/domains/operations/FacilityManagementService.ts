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
  archivedAt: string | null; version: number;
};
type FacilityAsset = {
  id: string; code: string; name: string; category: string; locationId: string; locationName: string;
  branchId: string; serialNumber: string | null; status: string; responsibleUserId: string | null;
  responsibleName: string | null; responsibleEmployeeId: string | null; responsibleEmployeeName: string | null;
  warrantyExpiresAt: string | null; notes: string | null;
  purchaseDate: string | null; supplier: string | null; purchasePrice: number; installationDate: string | null;
  usefulLifeMonths: number; depreciationRate: number; replacementDate: string | null; qrCode: string | null;
  archivedAt: string | null; version: number;
};
type WorkOrder = {
  id: string; workOrderNumber: string; locationId: string; locationName: string; assetId: string | null;
  assetName: string | null; requestType: WorkOrderType; title: string; description: string | null;
  priority: string; status: string; requestedBy: string; requesterName: string; requestedEmployeeId: string | null;
  requestedEmployeeName: string | null; assignedTo: string | null; assigneeName: string | null;
  assignedEmployeeId: string | null; assignedEmployeeName: string | null; vendorName: string | null;
  scheduledDate: string | null; completedDate: string | null;
  laborCost: number; partsCost: number; serviceCost: number; expenseReference: string | null;
  stockIssueReference: string | null; resolutionNotes: string | null; expenseId: string | null;
  expenseDescription: string | null; inventoryTransactionId: string | null; stockTransactionNumber: string | null;
  workHours: number; qualityChecked: boolean; qualityCheckedBy: string | null; qualityCheckedAt: string | null;
  reopenedAt: string | null; reopenedBy: string | null; reopenReason: string | null;
  responseTimeMinutes: number; resolutionTimeMinutes: number; slaTargetMinutes: number; slaMet: boolean;
  archivedAt: string | null; version: number;
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
type EmployeeOption = { id: string; fullName: string; branchId: string; hasUserAccount: boolean };
type FixedAssetOption = { id: string; name: string; code: string; branchId: string | null };
type ExpenseOption = { id: string; date: string; description: string; amount: number; recipient: string | null };
type StockIssueOption = { id: string; transactionNumber: string; productName: string; warehouseName: string; quantityM2: number; createdAt: string };
type MaintenanceSchedule = {
  id: string; locationId: string; locationName: string; assetId: string | null; assetName: string | null;
  title: string; description: string | null; intervalDays: number; nextDueDate: string; assignedTo: string | null;
  assigneeName: string | null;
};
type WorkOrderLog = {
  id: string; workOrderId: string; action: string; oldValues: string | null; newValues: string | null;
  actorId: string; actorName: string; createdAt: string;
};
type WorkOrderAttachment = {
  id: string; workOrderId: string; fileName: string; mimeType: string | null; fileSize: number | null;
  storagePath: string; uploadedBy: string; uploadedAt: string;
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

  getEmployees(): EmployeeOption[] {
    this.actor();
    return this.db.query<EmployeeOption>(`
      SELECT e.id, e.name AS fullName, e.branch_id AS branchId,
        CASE WHEN u.id IS NOT NULL THEN 1 ELSE 0 END AS hasUserAccount
      FROM employees e
      LEFT JOIN users u ON u.id = e.id
      WHERE e.status != 'SUSPENDED'
      ORDER BY e.name
    `);
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
        fl.manager_user_id AS managerUserId, u.full_name AS managerName,
        fl.archived_at AS archivedAt, fl.version
      FROM facility_locations fl
      JOIN branches b ON b.id = fl.branch_id
      LEFT JOIN users u ON u.id = fl.manager_user_id
      WHERE ${scope.clause} ORDER BY b.name, fl.name
    `, scope.params);
  }

  getAssets(): FacilityAsset[] {
    const scope = this.scope('fa.branch_id');
    return this.db.query<FacilityAsset>(`
      SELECT fa.id, fa.code, fa.name, fa.category, fa.location_id AS locationId,
        fl.name AS locationName, fa.branch_id AS branchId, fa.serial_number AS serialNumber,
        fa.status, fa.responsible_user_id AS responsibleUserId, u.full_name AS responsibleName,
        fa.responsible_employee_id AS responsibleEmployeeId, e.full_name AS responsibleEmployeeName,
        fa.warranty_expires_at AS warrantyExpiresAt,
        fa.purchase_date AS purchaseDate, fa.supplier, fa.purchase_price AS purchasePrice,
        fa.installation_date AS installationDate, fa.useful_life_months AS usefulLifeMonths,
        fa.depreciation_rate AS depreciationRate, fa.replacement_date AS replacementDate,
        fa.qr_code AS qrCode, fa.archived_at AS archivedAt, fa.version
      FROM facility_assets fa
      JOIN facility_locations fl ON fl.id = fa.location_id
      LEFT JOIN users u ON u.id = fa.responsible_user_id
      LEFT JOIN employees e ON e.id = fa.responsible_employee_id
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
        wo.requested_employee_id AS requestedEmployeeId, reqEmp.full_name AS requestedEmployeeName,
        wo.assigned_to AS assignedTo, assignee.full_name AS assigneeName,
        wo.assigned_employee_id AS assignedEmployeeId, assEmp.full_name AS assignedEmployeeName,
        wo.vendor_name AS vendorName, wo.scheduled_date AS scheduledDate, wo.completed_date AS completedDate,
        wo.labor_cost AS laborCost, wo.parts_cost AS partsCost, wo.service_cost AS serviceCost,
        wo.expense_reference AS expenseReference, wo.stock_issue_reference AS stockIssueReference,
        wo.resolution_notes AS resolutionNotes, wo.expense_id AS expenseId,
        e.description AS expenseDescription, wo.inventory_transaction_id AS inventoryTransactionId,
        it.transaction_number AS stockTransactionNumber,
        wo.work_hours AS workHours, wo.quality_checked AS qualityChecked,
        wo.quality_checked_by AS qualityCheckedBy, wo.quality_checked_at AS qualityCheckedAt,
        wo.reopened_at AS reopenedAt, wo.reopened_by AS reopenedBy, wo.reopen_reason AS reopenReason,
        wo.response_time_minutes AS responseTimeMinutes,
        wo.resolution_time_minutes AS resolutionTimeMinutes,
        wo.sla_target_minutes AS slaTargetMinutes, wo.sla_met AS slaMet,
        wo.archived_at AS archivedAt, wo.version
      FROM facility_work_orders wo
      JOIN facility_locations fl ON fl.id = wo.location_id
      LEFT JOIN facility_assets fa ON fa.id = wo.asset_id
      LEFT JOIN users requester ON requester.id = wo.requested_by
      LEFT JOIN employees reqEmp ON reqEmp.id = wo.requested_employee_id
      LEFT JOIN users assignee ON assignee.id = wo.assigned_to
      LEFT JOIN employees assEmp ON assEmp.id = wo.assigned_employee_id
      LEFT JOIN expenses e ON e.id = wo.expense_id
      LEFT JOIN inventory_transactions it ON it.id = wo.inventory_transaction_id
      WHERE ${scope.clause} ORDER BY CASE wo.priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 ELSE 2 END,
        COALESCE(wo.scheduled_date, date(wo.created_at))
    `, scope.params);
  }

  getWorkOrderHistory(workOrderId: string): WorkOrderLog[] {
    const scope = this.scope('fl.branch_id');
    return this.db.query<WorkOrderLog>(`
      SELECT l.id, l.work_order_id AS workOrderId, l.action, l.old_values AS oldValues,
        l.new_values AS newValues, l.actor_id AS actorId, l.actor_name AS actorName, l.created_at AS createdAt
      FROM facility_work_order_logs l
      JOIN facility_work_orders wo ON wo.id = l.work_order_id
      JOIN facility_locations fl ON fl.id = wo.location_id
      WHERE l.work_order_id = ? AND ${scope.clause}
      ORDER BY l.created_at DESC
    `, [workOrderId, ...scope.params]);
  }

  getWorkOrderAttachments(workOrderId: string): WorkOrderAttachment[] {
    const scope = this.scope('fl.branch_id');
    return this.db.query<WorkOrderAttachment>(`
      SELECT a.id, a.work_order_id AS workOrderId, a.file_name AS fileName, a.mime_type AS mimeType,
        a.file_size AS fileSize, a.storage_path AS storagePath,
        a.uploaded_by AS uploadedBy, a.uploaded_at AS uploadedAt
      FROM facility_work_order_attachments a
      JOIN facility_work_orders wo ON wo.id = a.work_order_id
      JOIN facility_locations fl ON fl.id = wo.location_id
      WHERE a.work_order_id = ? AND ${scope.clause}
      ORDER BY a.uploaded_at DESC
    `, [workOrderId, ...scope.params]);
  }

  getAssetMaintenanceLogs(assetId: string): Array<{
    id: string; assetId: string; workOrderId: string; maintenanceDate: string; cost: number;
    description: string | null; technicianId: string | null; technicianName: string | null;
  }> {
    const scope = this.scope('fl.branch_id');
    return this.db.query(`
      SELECT l.id, l.asset_id AS assetId, l.work_order_id AS workOrderId,
        l.maintenance_date AS maintenanceDate, l.cost, l.description,
        l.technician_id AS technicianId, l.technician_name AS technicianName
      FROM facility_asset_maintenance_logs l
      JOIN facility_work_orders wo ON wo.id = l.work_order_id
      JOIN facility_assets fa ON fa.id = l.asset_id
      JOIN facility_locations fl ON fl.id = fa.location_id
      WHERE l.asset_id = ? AND ${scope.clause}
      ORDER BY l.maintenance_date DESC
    `, [assetId, ...scope.params]);
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

  createAsset(input: { locationId: string; fixedAssetId?: string; code: string; name: string; category: string; serialNumber?: string; responsibleUserId?: string; responsibleEmployeeId?: string; warrantyExpiresAt?: string; notes?: string }) {
    const actor = this.requireManage();
    const scope = this.branchAccess.sqlScope('fl.branch_id', undefined, actor, true);
    const location = this.db.query<{ id: string; branchId: string }>(`SELECT fl.id, fl.branch_id AS branchId FROM facility_locations fl WHERE fl.id = ? AND fl.is_active = 1 AND ${scope.clause}`, [input.locationId, ...scope.params])[0];
    if (!location) throw new Error('الموقع غير متاح ضمن الفروع المصرح بها.');
    if (input.fixedAssetId) {
      const fixedAsset = this.db.query<{ id: string }>('SELECT id FROM fixed_assets WHERE id = ? AND (branch_id = ? OR branch_id IS NULL)', [input.fixedAssetId, location.branchId]);
      if (!fixedAsset.length) throw new Error('الأصل الثابت غير تابع لهذا الفرع.');
    }
    if (input.responsibleEmployeeId) {
      const employee = this.db.query<{ id: string; branchId: string }>('SELECT id, branch_id AS branchId FROM employees WHERE id = ? AND status != ?', [input.responsibleEmployeeId, 'SUSPENDED']);
      if (!employee.length) throw new Error('الموظف غير موجود.');
      if (employee[0].branchId !== location.branchId) throw new Error('الموظف لا يتبع فرع الأصل.');
    }
    this.db.run(`INSERT INTO facility_assets (id, code, name, category, location_id, branch_id, fixed_asset_id, serial_number, responsible_user_id, responsible_employee_id, warranty_expires_at, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [uuidv4(), input.code.trim(), input.name.trim(), input.category || 'EQUIPMENT', location.id, location.branchId, input.fixedAssetId || null, input.serialNumber || null, input.responsibleUserId || null, input.responsibleEmployeeId || null, input.warrantyExpiresAt || null, input.notes || null, actor.id]);
  }

  createWorkOrder(input: { locationId: string; assetId?: string; requestType: WorkOrderType; title: string; description?: string; priority: string; assignedTo?: string; assignedEmployeeId?: string; vendorName?: string; scheduledDate?: string; nextMaintenanceDate?: string; repeatIntervalDays?: number; laborCost?: number; partsCost?: number; serviceCost?: number; expenseId?: string; inventoryTransactionId?: string; requestedEmployeeId?: string }) {
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
    if (input.requestedEmployeeId) {
      const employee = this.db.query<{ id: string; branchId: string }>('SELECT id, branch_id AS branchId FROM employees WHERE id = ? AND status != ?', [input.requestedEmployeeId, 'SUSPENDED']);
      if (!employee.length) throw new Error('الموظف الطالب غير موجود.');
      if (employee[0].branchId !== location.branchId) throw new Error('الموظف الطالب لا يتبع الفرع المختار.');
    }
    if (input.assignedEmployeeId) {
      const employee = this.db.query<{ id: string; branchId: string }>('SELECT id, branch_id AS branchId FROM employees WHERE id = ? AND status != ?', [input.assignedEmployeeId, 'SUSPENDED']);
      if (!employee.length) throw new Error('الموظف المسند إليه غير موجود.');
      if (employee[0].branchId !== location.branchId) throw new Error('الموظف المسند إليه لا يتبع الفرع المختار.');
    }
    const intervalDays = Number(input.repeatIntervalDays || 0);
    if (intervalDays && (input.requestType !== 'PREVENTIVE' || !Number.isInteger(intervalDays) || intervalDays < 1 || !input.nextMaintenanceDate)) {
      throw new Error('الجدولة المتكررة تتطلب صيانة وقائية وموعداً تالياً وفترة صحيحة بالأيام.');
    }
    const count = this.db.query<{ count: number }>('SELECT COUNT(*) AS count FROM facility_work_orders')[0]?.count || 0;
    const number = `FM-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;
    const workOrderId = uuidv4();
    this.db.executeTransaction((sqliteDb) => {
      sqliteDb.run(`INSERT INTO facility_work_orders (id, work_order_number, location_id, asset_id, request_type, title, description, priority, requested_by, requested_employee_id, assigned_to, assigned_employee_id, vendor_name, scheduled_date, next_maintenance_date, labor_cost, parts_cost, service_cost, expense_id, inventory_transaction_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [workOrderId, number, input.locationId, input.assetId || null, input.requestType, input.title.trim(), input.description || null, input.priority, actor.id, input.requestedEmployeeId || null, input.assignedTo || null, input.assignedEmployeeId || null, input.vendorName || null, input.scheduledDate || null, input.nextMaintenanceDate || null, Math.max(0, Number(input.laborCost || 0)), Math.max(0, Number(input.partsCost || 0)), Math.max(0, Number(input.serviceCost || 0)), input.expenseId || null, input.inventoryTransactionId || null]);
      if (intervalDays) {
        sqliteDb.run(`INSERT INTO facility_maintenance_schedules (id, location_id, asset_id, title, description, interval_days, next_due_date, assigned_to, assigned_employee_id, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [uuidv4(), input.locationId, input.assetId || null, input.title.trim(), input.description || null, intervalDays, input.nextMaintenanceDate, input.assignedTo || null, input.assignedEmployeeId || null, actor.id]);
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

  /* ========== المواقع: تعديل وأرشفة ========== */

  updateLocation(input: { id: string; name?: string; code?: string; address?: string; managerUserId?: string; locationType?: LocationType; parentId?: string | null }) {
    const actor = this.requireManage();
    const scope = this.branchAccess.sqlScope('fl.branch_id', undefined, actor, true);
    const existing = this.db.query<{ id: string; branchId: string; version: number }>(`
      SELECT fl.id, fl.branch_id AS branchId, fl.version
      FROM facility_locations fl WHERE fl.id = ? AND ${scope.clause}
    `, [input.id, ...scope.params]);
    if (!existing.length) throw new Error('الموقع غير متاح.');
    const location = existing[0];
    if (input.managerUserId) {
      const manager = this.db.query<{ id: string }>('SELECT id FROM users WHERE id = ? AND is_active = 1', [input.managerUserId]);
      if (!manager.length) throw new Error('المسؤول المحدد غير نشط أو غير موجود.');
    }
    const updates: string[] = [];
    const params: (string | number | null)[] = [];
    if (input.name !== undefined) { updates.push('name = ?'); params.push(input.name.trim()); }
    if (input.code !== undefined) { updates.push('code = ?'); params.push(input.code || null); }
    if (input.address !== undefined) { updates.push('address = ?'); params.push(input.address || null); }
    if (input.managerUserId !== undefined) { updates.push('manager_user_id = ?'); params.push(input.managerUserId || null); }
    if (input.locationType !== undefined) { updates.push('location_type = ?'); params.push(input.locationType); }
    if (input.parentId !== undefined) { updates.push('parent_id = ?'); params.push(input.parentId || null); }
    if (!updates.length) throw new Error('لا توجد بيانات للتعديل.');
    updates.push('version = version + 1', 'updated_at = CURRENT_TIMESTAMP');
    params.push(location.id);
    this.db.run(`UPDATE facility_locations SET ${updates.join(', ')} WHERE id = ?`, params);
    this.db.run(`
      INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
      VALUES (?, ?, ?, ?, 'FACILITY_LOCATION', ?, ?)
    `, [`aud_${uuidv4().replace(/-/g, '').slice(0, 12)}`, actor.id, actor.fullName, 'تعديل موقع', input.id,
      JSON.stringify({ name: input.name, code: input.code, address: input.address, managerUserId: input.managerUserId })]);
  }

  archiveLocation(id: string) {
    this.toggleLocationArchive(id, true);
  }

  restoreLocation(id: string) {
    this.toggleLocationArchive(id, false);
  }

  private toggleLocationArchive(id: string, archive: boolean) {
    const actor = this.requireManage();
    const scope = this.branchAccess.sqlScope('fl.branch_id', undefined, actor, true);
    const existing = this.db.query<{ id: string }>(`
      SELECT fl.id FROM facility_locations fl WHERE fl.id = ? AND ${scope.clause}
    `, [id, ...scope.params]);
    if (!existing.length) throw new Error('الموقع غير متاح.');
    this.db.run(`
      UPDATE facility_locations SET archived_at = ?, archived_by = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [archive ? localDateString() : null, archive ? actor.id : null, id]);
    this.db.run(`
      INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
      VALUES (?, ?, ?, ?, 'FACILITY_LOCATION', ?, ?)
    `, [`aud_${uuidv4().replace(/-/g, '').slice(0, 12)}`, actor.id, actor.fullName,
      archive ? 'أرشفة موقع' : 'إعادة موقع من الأرشفة', id, JSON.stringify({ archived: archive })]);
  }

  /* ========== الأصول: تعديل وأرشفة ونقل ========== */

  updateAsset(input: { id: string; name?: string; code?: string; category?: string; serialNumber?: string;
    responsibleUserId?: string | null; responsibleEmployeeId?: string | null; warrantyExpiresAt?: string; notes?: string; purchaseDate?: string;
    supplier?: string; purchasePrice?: number; installationDate?: string; usefulLifeMonths?: number;
    depreciationRate?: number; replacementDate?: string; qrCode?: string }) {
    const actor = this.requireManage();
    const scope = this.branchAccess.sqlScope('fa.branch_id', undefined, actor, true);
    const existing = this.db.query<{ id: string; branchId: string; version: number }>(`
      SELECT fa.id, fa.branch_id AS branchId, fa.version
      FROM facility_assets fa WHERE fa.id = ? AND ${scope.clause}
    `, [input.id, ...scope.params]);
    if (!existing.length) throw new Error('الأصل غير متاح.');
    const asset = existing[0];
    if (input.responsibleEmployeeId !== undefined) {
      const employee = this.db.query<{ id: string; branchId: string }>('SELECT id, branch_id AS branchId FROM employees WHERE id = ? AND status != ?', [input.responsibleEmployeeId, 'SUSPENDED']);
      if (!employee.length) throw new Error('الموظف غير موجود.');
      if (employee[0].branchId !== asset.branchId) throw new Error('الموظف لا يتبع فرع الأصل.');
    }
    const updates: string[] = [];
    const params: (string | number | null)[] = [];
    const setField = (column: string, value: string | number | null | undefined) => {
      if (value !== undefined) { updates.push(`${column} = ?`); params.push(value); }
    };
    setField('name', input.name?.trim() || null);
    setField('code', input.code?.trim() || null);
    setField('category', input.category || null);
    setField('serial_number', input.serialNumber || null);
    setField('responsible_user_id', input.responsibleUserId || null);
    setField('responsible_employee_id', input.responsibleEmployeeId || null);
    setField('warranty_expires_at', input.warrantyExpiresAt || null);
    setField('notes', input.notes || null);
    setField('purchase_date', input.purchaseDate || null);
    setField('supplier', input.supplier || null);
    setField('purchase_price', input.purchasePrice !== undefined ? input.purchasePrice : undefined);
    setField('installation_date', input.installationDate || null);
    setField('useful_life_months', input.usefulLifeMonths !== undefined ? input.usefulLifeMonths : undefined);
    setField('depreciation_rate', input.depreciationRate !== undefined ? input.depreciationRate : undefined);
    setField('replacement_date', input.replacementDate || null);
    setField('qr_code', input.qrCode || null);
    if (!updates.length) throw new Error('لا توجد بيانات للتعديل.');
    updates.push('version = version + 1', 'updated_at = CURRENT_TIMESTAMP');
    params.push(asset.id);
    this.db.run(`UPDATE facility_assets SET ${updates.join(', ')} WHERE id = ?`, params);
    this.db.run(`
      INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
      VALUES (?, ?, ?, ?, 'FACILITY_ASSET', ?, ?)
    `, [`aud_${uuidv4().replace(/-/g, '').slice(0, 12)}`, actor.id, actor.fullName, 'تعديل أصل تشغيلي', input.id,
      JSON.stringify({ name: input.name, code: input.code, status: input.category, responsibleUserId: input.responsibleUserId })]);
  }

  archiveAsset(id: string) {
    this.toggleAssetArchive(id, true);
  }

  restoreAsset(id: string) {
    this.toggleAssetArchive(id, false);
  }

  retireAsset(id: string, reason?: string) {
    const actor = this.requireManage();
    const scope = this.branchAccess.sqlScope('fa.branch_id', undefined, actor, true);
    const existing = this.db.query<{ id: string; status: string }>(`
      SELECT fa.id, fa.status FROM facility_assets fa WHERE fa.id = ? AND ${scope.clause}
    `, [id, ...scope.params]);
    if (!existing.length) throw new Error('الأصل غير متاح.');
    if (existing[0].status === 'RETIRED') throw new Error('الأصل مستبعد مسبقاً.');
    this.db.run(`
      UPDATE facility_assets SET status = 'RETIRED', archived_at = ?, archived_by = ?,
        version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `, [localDateString(), actor.id, id]);
    this.db.run(`
      INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
      VALUES (?, ?, ?, ?, 'FACILITY_ASSET', ?, ?)
    `, [`aud_${uuidv4().replace(/-/g, '').slice(0, 12)}`, actor.id, actor.fullName, 'استبعاد أصل تشغيلي', id,
      JSON.stringify({ reason, retiredAt: localDateString() })]);
  }

  private toggleAssetArchive(id: string, archive: boolean) {
    const actor = this.requireManage();
    const scope = this.branchAccess.sqlScope('fa.branch_id', undefined, actor, true);
    const existing = this.db.query<{ id: string; status: string }>(`
      SELECT fa.id, fa.status FROM facility_assets fa WHERE fa.id = ? AND ${scope.clause}
    `, [id, ...scope.params]);
    if (!existing.length) throw new Error('الأصل غير متاح.');
    if (archive && existing[0].status === 'RETIRED') throw new Error('لا يمكن أرشفة أصل مستبعد.');
    this.db.run(`
      UPDATE facility_assets SET archived_at = ?, archived_by = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [archive ? localDateString() : null, archive ? actor.id : null, id]);
    this.db.run(`
      INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
      VALUES (?, ?, ?, ?, 'FACILITY_ASSET', ?, ?)
    `, [`aud_${uuidv4().replace(/-/g, '').slice(0, 12)}`, actor.id, actor.fullName,
      archive ? 'أرشفة أصل' : 'إعادة أصل من الأرشفة', id, JSON.stringify({ archived: archive })]);
  }

  transferAsset(input: { assetId: string; toLocationId: string; reason?: string }) {
    const actor = this.requireManage();
    const scope = this.branchAccess.sqlScope('fa.branch_id', undefined, actor, true);
    const asset = this.db.query<{ id: string; branchId: string; locationId: string }>(`
      SELECT fa.id, fa.branch_id AS branchId, fa.location_id AS locationId
      FROM facility_assets fa WHERE fa.id = ? AND ${scope.clause}
    `, [input.assetId, ...scope.params]);
    if (!asset.length) throw new Error('الأصل غير متاح.');
    const toLocation = this.db.query<{ id: string; branchId: string }>(`
      SELECT fl.id, fl.branch_id AS branchId FROM facility_locations fl WHERE fl.id = ? AND fl.is_active = 1 AND ${scope.clause}
    `, [input.toLocationId, ...scope.params]);
    if (!toLocation.length) throw new Error('الوجهة غير صالحة.');
    this.db.executeTransaction((sqliteDb) => {
      sqliteDb.run(`UPDATE facility_assets SET location_id = ?, branch_id = ?, version = version + 1,
        updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [input.toLocationId, toLocation[0].branchId, input.assetId]);
      sqliteDb.run(`INSERT INTO facility_asset_transfers (id, asset_id, from_location_id, to_location_id,
        from_branch_id, to_branch_id, transferred_by, reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [uuidv4(), input.assetId, asset[0].locationId, input.toLocationId,
        asset[0].branchId, toLocation[0].branchId, actor.id, input.reason || null]);
    });
    this.db.run(`
      INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
      VALUES (?, ?, ?, ?, 'FACILITY_ASSET', ?, ?)
    `, [`aud_${uuidv4().replace(/-/g, '').slice(0, 12)}`, actor.id, actor.fullName, 'نقل أصل تشغيلي', input.assetId,
      JSON.stringify({ toLocationId: input.toLocationId, reason: input.reason })]);
  }

  /* ========== أوامر العمل: دورة الحياة الكاملة ========== */

  updateWorkOrder(input: { id: string; title?: string; description?: string; priority?: string;
    scheduledDate?: string; vendorName?: string;
    laborCost?: number; partsCost?: number; serviceCost?: number; expenseId?: string | null;
    inventoryTransactionId?: string | null; requestedEmployeeId?: string | null;
    assignedEmployeeId?: string | null; assignedTo?: string | null }) {
    const actor = this.requireManage();
    const scope = this.branchAccess.sqlScope('fl.branch_id', undefined, actor, true);
    const existing = this.db.query<{ id: string; status: string; version: number; branchId: string }>(`
      SELECT wo.id, wo.status, wo.version, fl.branch_id AS branchId FROM facility_work_orders wo
      JOIN facility_locations fl ON fl.id = wo.location_id WHERE wo.id = ? AND ${scope.clause}
    `, [input.id, ...scope.params]);
    if (!existing.length) throw new Error('أمر العمل غير متاح.');
    const wo = existing[0];
    if (['COMPLETED', 'CANCELLED'].includes(wo.status)) throw new Error('لا يمكن تعديل أمر عمل مكتمل أو ملغي.');
    if (input.requestedEmployeeId !== undefined) {
      const employee = this.db.query<{ id: string; branchId: string }>('SELECT id, branch_id AS branchId FROM employees WHERE id = ? AND status != ?', [input.requestedEmployeeId, 'SUSPENDED']);
      if (!employee.length) throw new Error('الموظف الطالب غير موجود.');
      if (employee[0].branchId !== wo.branchId) throw new Error('الموظف الطالب لا يتبع فرع أمر العمل.');
    }
    if (input.assignedEmployeeId !== undefined) {
      const employee = this.db.query<{ id: string; branchId: string }>('SELECT id, branch_id AS branchId FROM employees WHERE id = ? AND status != ?', [input.assignedEmployeeId, 'SUSPENDED']);
      if (!employee.length) throw new Error('الموظف المسند إليه غير موجود.');
      if (employee[0].branchId !== wo.branchId) throw new Error('الموظف المسند إليه لا يتبع فرع أمر العمل.');
    }
    const updates: string[] = [];
    const params: (string | number | null)[] = [];
    const setField = (column: string, value: string | number | null | undefined) => {
      if (value !== undefined) { updates.push(`${column} = ?`); params.push(value); }
    };
    setField('title', input.title?.trim() || null);
    setField('description', input.description || null);
    setField('priority', input.priority || null);
    setField('scheduled_date', input.scheduledDate || null);
    setField('vendor_name', input.vendorName || null);
    setField('labor_cost', input.laborCost !== undefined ? Math.max(0, input.laborCost) : undefined);
    setField('parts_cost', input.partsCost !== undefined ? Math.max(0, input.partsCost) : undefined);
    setField('service_cost', input.serviceCost !== undefined ? Math.max(0, input.serviceCost) : undefined);
    setField('expense_id', input.expenseId);
    setField('inventory_transaction_id', input.inventoryTransactionId);
    setField('requested_employee_id', input.requestedEmployeeId);
    setField('assigned_employee_id', input.assignedEmployeeId);
    setField('assigned_to', input.assignedTo);
    if (!updates.length) throw new Error('لا توجد بيانات للتعديل.');
    updates.push('version = version + 1', 'updated_at = CURRENT_TIMESTAMP');
    params.push(wo.id);
    this.db.run(`UPDATE facility_work_orders SET ${updates.join(', ')} WHERE id = ?`, params);
    this.logWorkOrderAction(wo.id, 'UPDATED', null, JSON.stringify({
      title: input.title, description: input.description, priority: input.priority,
      laborCost: input.laborCost, partsCost: input.partsCost, serviceCost: input.serviceCost,
      requestedEmployeeId: input.requestedEmployeeId, assignedEmployeeId: input.assignedEmployeeId,
      assignedTo: input.assignedTo,
    }), actor);
  }

  approveWorkOrder(id: string) {
    this.updateWorkOrderStatus(id, 'APPROVED');
  }

  startWorkOrder(id: string) {
    const actor = this.requireManage();
    const scope = this.branchAccess.sqlScope('fl.branch_id', undefined, actor, true);
    const existing = this.db.query<{ id: string; status: string; createdAt: string }>(`
      SELECT wo.id, wo.status, wo.created_at AS createdAt FROM facility_work_orders wo
      JOIN facility_locations fl ON fl.id = wo.location_id WHERE wo.id = ? AND ${scope.clause}
    `, [id, ...scope.params]);
    if (!existing.length) throw new Error('أمر العمل غير متاح.');
    if (existing[0].status !== 'APPROVED') throw new Error('يجب اعتماد الأمر قبل بدء التنفيذ.');
    const started = localDateString();
    const responseMinutes = Math.max(0, Math.ceil((Date.parse(`${started}T00:00:00`) - Date.parse(`${existing[0].createdAt}T00:00:00`)) / 60000));
    this.db.run(`
      UPDATE facility_work_orders SET status = 'IN_PROGRESS', response_time_minutes = ?,
        version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `, [responseMinutes, id]);
    this.logWorkOrderAction(id, 'STARTED', null, JSON.stringify({ startedAt: started, responseTimeMinutes: responseMinutes }), actor);
  }

  assignTechnician(input: { workOrderId: string; employeeId: string | null }) {
    const actor = this.requireManage();
    const scope = this.branchAccess.sqlScope('fl.branch_id', undefined, actor, true);
    const wo = this.db.query<{ id: string; status: string; assignedTo: string | null; branchId: string }>(`
      SELECT wo.id, wo.status, wo.assigned_to AS assignedTo, fl.branch_id AS branchId FROM facility_work_orders wo
      JOIN facility_locations fl ON fl.id = wo.location_id WHERE wo.id = ? AND ${scope.clause}
    `, [input.workOrderId, ...scope.params]);
    if (!wo.length) throw new Error('أمر العمل غير متاح.');
    if (['COMPLETED', 'CANCELLED'].includes(wo[0].status)) throw new Error('لا يمكن إسناد أمر عمل مكتمل أو ملغي.');
    let userId: string | null = null;
    if (input.employeeId) {
      const employee = this.db.query<{ id: string; branchId: string; userId: string | null }>(
        'SELECT id, branch_id AS branchId, user_id AS userId FROM employees WHERE id = ? AND status != ?',
        [input.employeeId, 'SUSPENDED']
      );
      if (!employee.length) throw new Error('الموظف غير موجود.');
      if (employee[0].branchId !== wo[0].branchId) throw new Error('الموظف لا يتبع فرع أمر العمل.');
      userId = employee[0].userId || null;
    }
    const oldAssignee = wo[0].assignedTo;
    this.db.run(`
      UPDATE facility_work_orders SET assigned_to = ?, assigned_employee_id = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `, [userId, input.employeeId || null, input.workOrderId]);
    this.logWorkOrderAction(input.workOrderId, input.employeeId ? 'ASSIGNED' : 'UNASSIGNED',
      JSON.stringify({ previous: oldAssignee }), JSON.stringify({ assignedTo: input.employeeId, assignedUserId: userId }), actor);
  }

  completeWorkOrder(input: { id: string; resolutionNotes?: string; qualityCheck: boolean;
    qualityResult?: 'PASS' | 'FAIL'; laborHours?: number; qualityCheckedBy?: string }) {
    const actor = this.requireManage();
    const scope = this.branchAccess.sqlScope('fl.branch_id', undefined, actor, true);
    const existing = this.db.query<{ id: string; status: string; createdAt: string; scheduledDate: string | null; slaTargetMinutes: number }>(`
      SELECT wo.id, wo.status, wo.created_at AS createdAt, wo.scheduled_date AS scheduledDate,
        wo.sla_target_minutes AS slaTargetMinutes FROM facility_work_orders wo
      JOIN facility_locations fl ON fl.id = wo.location_id WHERE wo.id = ? AND ${scope.clause}
    `, [input.id, ...scope.params]);
    if (!existing.length) throw new Error('أمر العمل غير متاح.');
    if (existing[0].status === 'COMPLETED') throw new Error('الأمر مكتمل مسبقاً.');
    if (existing[0].status === 'CANCELLED') throw new Error('لا يمكن إكمال أمر ملغي.');
    const completed = localDateString();
    let resolutionMinutes = 0;
    if (existing[0].createdAt) {
      resolutionMinutes = Math.max(0, Math.ceil((Date.parse(`${completed}T00:00:00`) - Date.parse(`${existing[0].createdAt}T00:00:00`)) / 60000));
    }
    let slaMet = false;
    const params: (string | number | null)[] = [
      'COMPLETED', input.resolutionNotes || null, completed,
      input.qualityCheck ? 1 : 0, input.qualityCheckedBy || null, completed,
      input.laborHours !== undefined ? Math.max(0, input.laborHours) : null,
      resolutionMinutes, input.id
    ];
    if (existing[0].slaTargetMinutes && existing[0].slaTargetMinutes > 0) {
      slaMet = resolutionMinutes <= existing[0].slaTargetMinutes;
      params.splice(7, 0, existing[0].slaTargetMinutes, slaMet ? 1 : 0);
    }
    this.db.run(`
      UPDATE facility_work_orders SET status = ?, resolution_notes = ?, completed_date = ?,
        quality_checked = ?, quality_checked_by = ?, quality_checked_at = ?,
        work_hours = COALESCE(work_hours, 0) + COALESCE(?, 0),
        resolution_time_minutes = ?, ${existing[0].slaTargetMinutes && existing[0].slaTargetMinutes > 0
          ? 'sla_target_minutes = ?, sla_met = ?,' : ''
        } version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `, params);
    this.logWorkOrderAction(input.id, 'COMPLETED', null, JSON.stringify({
      resolutionNotes: input.resolutionNotes, qualityCheck: input.qualityCheck,
      qualityResult: input.qualityResult, laborHours: input.laborHours, resolutionTimeMinutes: resolutionMinutes,
      slaMet,
    }), actor);
  }

  reopenWorkOrder(input: { id: string; reason: string }) {
    const actor = this.requireManage();
    const scope = this.branchAccess.sqlScope('fl.branch_id', undefined, actor, true);
    const existing = this.db.query<{ id: string; status: string }>(`
      SELECT wo.id, wo.status FROM facility_work_orders wo
      JOIN facility_locations fl ON fl.id = wo.location_id WHERE wo.id = ? AND ${scope.clause}
    `, [input.id, ...scope.params]);
    if (!existing.length) throw new Error('أمر العمل غير متاح.');
    if (existing[0].status !== 'COMPLETED' && existing[0].status !== 'CANCELLED') {
      throw new Error('يمكن إعادة فتح أوامر العمل المكتملة أو الملغاة فقط.');
    }
    this.db.run(`
      UPDATE facility_work_orders SET status = 'OPEN', reopened_at = ?, reopened_by = ?,
        reopen_reason = ?, completed_date = NULL, quality_checked = 0,
        version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `, [localDateString(), actor.id, input.reason, input.id]);
    this.logWorkOrderAction(input.id, 'REOPENED', null, JSON.stringify({ reason: input.reason }), actor);
  }

  cancelWorkOrder(id: string, reason?: string) {
    const actor = this.requireManage();
    const scope = this.branchAccess.sqlScope('fl.branch_id', undefined, actor, true);
    const existing = this.db.query<{ id: string; status: string }>(`
      SELECT wo.id, wo.status FROM facility_work_orders wo
      JOIN facility_locations fl ON fl.id = wo.location_id WHERE wo.id = ? AND ${scope.clause}
    `, [id, ...scope.params]);
    if (!existing.length) throw new Error('أمر العمل غير متاح.');
    if (existing[0].status === 'COMPLETED') throw new Error('لا يمكن إلغاء أمر عمل مكتمل.');
    this.db.run(`
      UPDATE facility_work_orders SET status = 'CANCELLED', version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `, [id]);
    this.logWorkOrderAction(id, 'STATUS_CHANGED', null, JSON.stringify({ newStatus: 'CANCELLED', reason }), actor);
  }

  addWorkOrderAttachment(input: { workOrderId: string; fileName: string; mimeType: string | null;
    fileSize: number | null; storagePath: string }) {
    const actor = this.requireManage();
    const scope = this.branchAccess.sqlScope('fl.branch_id', undefined, actor, true);
    const wo = this.db.query<{ id: string }>(`
      SELECT wo.id FROM facility_work_orders wo JOIN facility_locations fl ON fl.id = wo.location_id WHERE wo.id = ? AND ${scope.clause}
    `, [input.workOrderId, ...scope.params]);
    if (!wo.length) throw new Error('أمر العمل غير متاح.');
    this.db.run(`INSERT INTO facility_work_order_attachments (id, work_order_id, file_name, mime_type, file_size, storage_path, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)`, [uuidv4(), input.workOrderId, input.fileName, input.mimeType, input.fileSize, input.storagePath, actor.id]);
    this.logWorkOrderAction(input.workOrderId, 'ATTACHMENT_ADDED', null, JSON.stringify({
      fileName: input.fileName, mimeType: input.mimeType, fileSize: input.fileSize,
    }), actor);
  }

  removeWorkOrderAttachment(attachmentId: string) {
    const actor = this.requireManage();
    const scope = this.branchAccess.sqlScope('fl.branch_id', undefined, actor, true);
    const attachment = this.db.query<{ id: string; workOrderId: string }>(`
      SELECT a.id, a.work_order_id AS workOrderId FROM facility_work_order_attachments a
      JOIN facility_work_orders wo ON wo.id = a.work_order_id
      JOIN facility_locations fl ON fl.id = wo.location_id WHERE a.id = ? AND ${scope.clause}
    `, [attachmentId, ...scope.params]);
    if (!attachment.length) throw new Error('المرفق غير متاح.');
    this.db.run('DELETE FROM facility_work_order_attachments WHERE id = ?', [attachmentId]);
    this.logWorkOrderAction(attachment[0].workOrderId, 'ATTACHMENT_REMOVED', null, JSON.stringify({ attachmentId }), actor);
  }

  private logWorkOrderAction(workOrderId: string, action: string, oldValues: string | null, newValues: string | null, actor: { id: string; fullName: string }) {
    this.db.run(`
      INSERT INTO facility_work_order_logs (id, work_order_id, action, old_values, new_values, actor_id, actor_name)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [`log_${uuidv4().replace(/-/g, '').slice(0, 14)}`, workOrderId, action, oldValues, newValues, actor.id, actor.fullName]);
  }

  /* ========== التنبيهات المجدولة (بدلاً من التنبيهات عند تحميل الصفحة) ========== */

  runFacilityRemindersForActor(actorId: string, actorName: string, branchScope: string, scopeParams: string[]): void {
    const today = localDateString();
    const inSevenDays = localDateString(addLocalDays(new Date(), 7));
    const notifications = new NotificationService();
    const candidates = this.db.query<{ id: string; title: string; dueDate: string; kind: string }>(`
      SELECT fc.id, fc.title, fc.next_payment_date AS dueDate, 'دفعة' AS kind
      FROM facility_contracts fc JOIN facility_locations fl ON fl.id = fc.location_id
      WHERE fc.status = 'ACTIVE' AND fc.next_payment_date BETWEEN ? AND ? AND ${branchScope}
      UNION ALL
      SELECT fc.id, fc.title, fc.ends_at AS dueDate, 'انتهاء عقد' AS kind
      FROM facility_contracts fc JOIN facility_locations fl ON fl.id = fc.location_id
      WHERE fc.status = 'ACTIVE' AND fc.ends_at BETWEEN ? AND ? AND ${branchScope}
      UNION ALL
      SELECT ms.id, ms.title, ms.next_due_date AS dueDate, 'صيانة وقائية' AS kind
      FROM facility_maintenance_schedules ms JOIN facility_locations fl ON fl.id = ms.location_id
      WHERE ms.is_active = 1 AND ms.next_due_date BETWEEN ? AND ? AND ${branchScope}
    `, [today, inSevenDays, ...scopeParams, today, inSevenDays, ...scopeParams, today, inSevenDays, ...scopeParams]);

    for (const candidate of candidates) {
      const daysLeft = Math.max(0, Math.ceil((Date.parse(`${candidate.dueDate}T00:00:00`) - Date.parse(`${today}T00:00:00`)) / 86400000));
      const referenceId = `${candidate.id}:${candidate.kind}:${candidate.dueDate}`;
      const exists = this.db.query<{ id: string }>(`
        SELECT id FROM notifications WHERE user_id = ? AND reference_type = 'FACILITY_DUE' AND reference_id = ? LIMIT 1
      `, [actorId, referenceId]);
      if (!exists.length) {
        notifications.createNotification('SYSTEM', `استحقاق منشأة خلال ${daysLeft} يوم`, `${candidate.kind}: ${candidate.title}، الموعد ${candidate.dueDate}`, actorId, 'FACILITY_DUE', referenceId);
      }
    }
  }
}
