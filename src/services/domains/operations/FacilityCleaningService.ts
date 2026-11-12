import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import { NotificationService } from '../notifications/NotificationService';
import { localDateString } from '../../../utils/shared/date';

export type CleaningFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'OTHER';
export type CleaningType = 'GENERAL' | 'DEEP' | 'DISINFECTION' | 'GLASS' | 'CARPET' | 'RESTROOM' | 'OTHER';
export type CleaningTaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED' | 'CANCELLED';
export type TaskItemResult = 'PASS' | 'FAIL' | 'N_A';
export type SupplyType = 'DETERGENT' | 'DISINFECTANT' | 'PAPER_PRODUCTS' | 'TOOLS' | 'PPE' | 'OTHER';
export type SupplyStatus = 'ACTIVE' | 'LOW_STOCK' | 'EXPIRED' | 'RETIRED';
export type SupplyUnit = 'unit' | 'liter' | 'kg' | 'piece' | 'box' | 'OTHER';

export interface CleaningSchedule {
  id: string;
  scheduleCode: string;
  scheduleName: string;
  locationId: string;
  locationName: string;
  branchId: string;
  branchName: string;
  frequency: CleaningFrequency;
  cleaningType: CleaningType;
  assignedWorkerId: string | null;
  assignedWorkerName: string | null;
  startTime: string | null;
  endTime: string | null;
  estimatedDurationMinutes: number;
  isActive: boolean;
  nextDueDate: string | null;
  notes: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface CleaningScheduleInput {
  locationId: string;
  scheduleName: string;
  frequency: CleaningFrequency;
  cleaningType: CleaningType;
  assignedWorkerId?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  estimatedDurationMinutes?: number;
  isActive?: boolean;
  nextDueDate?: string | null;
  notes?: string | null;
}

export interface CleaningChecklistItem {
  id: string;
  cleaningType: CleaningType;
  itemName: string;
  itemDescription: string | null;
  isCritical: boolean;
  sortOrder: number;
  isActive: boolean;
}

export interface CleaningChecklistInput {
  cleaningType: CleaningType;
  itemName: string;
  itemDescription?: string | null;
  isCritical?: boolean;
  sortOrder?: number;
  isActive?: boolean;
}

export interface CleaningTask {
  id: string;
  scheduleId: string;
  scheduleName: string;
  locationId: string;
  locationName: string;
  branchId: string;
  workerId: string;
  workerName: string;
  taskDate: string;
  plannedStart: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  durationMinutes: number;
  status: CleaningTaskStatus;
  qualityScore: number | null;
  beforePhotoPath: string | null;
  afterPhotoPath: string | null;
  notes: string | null;
  items: CleaningTaskItem[];
  createdAt: string;
  updatedAt: string;
}

export interface CleaningTaskInput {
  scheduleId: string;
  locationId: string;
  workerId: string;
  taskDate: string;
  plannedStart?: string | null;
  actualStart?: string | null;
  actualEnd?: string | null;
  status?: CleaningTaskStatus;
  qualityScore?: number | null;
  beforePhotoPath?: string | null;
  afterPhotoPath?: string | null;
  notes?: string | null;
  items: Array<{
    checklistItemId?: string | null;
    itemName: string;
    result: TaskItemResult;
    observation?: string | null;
    correctiveAction?: string | null;
  }>;
}

export interface CleaningTaskItem {
  id: string;
  checklistItemId: string | null;
  itemName: string;
  result: TaskItemResult;
  observation: string | null;
  correctiveAction: string | null;
}

export interface CleaningSupply {
  id: string;
  supplyCode: string;
  supplyName: string;
  supplyType: SupplyType;
  unitOfMeasure: SupplyUnit;
  quantityOnHand: number;
  minimumThreshold: number;
  reorderQuantity: number;
  locationId: string;
  locationName: string;
  branchId: string;
  branchName: string;
  supplierId: string | null;
  supplierName: string | null;
  unitCost: number;
  expiryDate: string | null;
  status: SupplyStatus;
  isLowStock: boolean;
  isExpired: boolean;
  notes: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface CleaningSupplyInput {
  locationId: string;
  supplyName: string;
  supplyType: SupplyType;
  unitOfMeasure?: SupplyUnit;
  quantityOnHand?: number;
  minimumThreshold?: number;
  reorderQuantity?: number;
  supplierId?: string | null;
  unitCost?: number;
  expiryDate?: string | null;
  notes?: string | null;
}

export interface CleaningSupplyUsageInput {
  supplyId: string;
  workerId: string;
  usageDate: string;
  quantityUsed: number;
  purpose?: string | null;
  taskId?: string | null;
}

export interface CleaningSupplyUsage {
  id: string;
  supplyId: string;
  supplyName: string;
  workerId: string;
  workerName: string;
  usageDate: string;
  quantityUsed: number;
  purpose: string | null;
  taskId: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

export interface CleaningStats {
  totalSchedules: number;
  activeSchedules: number;
  pendingTasks: number;
  completedTasks: number;
  skippedTasks: number;
  totalSupplies: number;
  lowStockSupplies: number;
  expiredSupplies: number;
  averageQualityScore: number;
  tasksByStatus: Array<{ status: string; count: number }>;
  suppliesByType: Array<{ type: string; count: number }>;
}

function roundNumber(value: number): number {
  return Math.round(value * 100) / 100;
}

function isValidDate(value: string | null | undefined): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export class FacilityCleaningService {
  private static db = DatabaseManager.getInstance();
  private static branchAccess = new BranchAccessService();
  private static notification = new NotificationService();

  private static requireView() {
    const actor = AuthService.requireAuth();
    PermissionService.requireAny(actor, [
      'operations.view', 'facility_management.view',
    ]);
    return actor;
  }

  private static requireManage() {
    const actor = AuthService.requireAuth();
    ModuleRegistryService.assertModuleEnabled('hr');
    PermissionService.requireAny(actor, [
      'operations.update', 'facility_management.manage',
    ]);
    return actor;
  }

  private static currentCompanyId(actor = AuthService.requireAuth()): string {
    const branchId = this.branchAccess.getCurrentBranchId(actor);
    const row = this.db.query<{ companyId: string | null }>(
      'SELECT company_id AS companyId FROM branches WHERE id = ?',
      [branchId]
    )[0];
    if (!row?.companyId) throw new Error('فرع العمل الحالي غير مرتبط بشركة.');
    return row.companyId;
  }

  /* ========== Cleaning Schedules ========== */

  static getCleaningSchedules(): CleaningSchedule[] {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const scope = this.branchAccess.sqlScope('cs.branch_id', undefined, actor);
    const rows = this.db.query<any>(
      `SELECT cs.id, cs.schedule_code AS scheduleCode, cs.schedule_name AS scheduleName,
              cs.location_id AS locationId, fl.name AS locationName,
              cs.branch_id AS branchId, b.name AS branchName,
              cs.frequency, cs.cleaning_type AS cleaningType,
              cs.assigned_worker_id AS assignedWorkerId, e.name AS assignedWorkerName,
              cs.start_time AS startTime, cs.end_time AS endTime,
              cs.estimated_duration_minutes AS estimatedDurationMinutes,
              cs.is_active AS isActive, cs.next_due_date AS nextDueDate,
              cs.notes, cs.created_by AS createdBy, u.full_name AS createdByName,
              cs.created_at AS createdAt, cs.updated_at AS updatedAt
       FROM facility_cleaning_schedules cs
       JOIN facility_locations fl ON fl.id = cs.location_id
       JOIN branches b ON b.id = cs.branch_id
       LEFT JOIN employees e ON e.id = cs.assigned_worker_id
       LEFT JOIN users u ON u.id = cs.created_by
       WHERE cs.company_id = ? AND ${scope.clause}
       ORDER BY cs.next_due_date, cs.schedule_name`,
      [companyId, ...scope.params]
    );
    return rows.map((row) => ({
      ...row,
      frequency: row.frequency as CleaningFrequency,
      cleaningType: row.cleaning_type as CleaningType,
      isActive: Boolean(row.isActive),
    }));
  }

  static createCleaningSchedule(input: CleaningScheduleInput): CleaningSchedule {
    const actor = this.requireManage();
    const location = this.db.query<{ id: string; name: string; branch_id: string }>(
      'SELECT id, name, branch_id AS branchId FROM facility_locations WHERE id = ?',
      [input.locationId]
    )[0];
    if (!location) throw new Error('الموقع غير موجود.');
    const branch = this.db.query<{ id: string; name: string }>(
      'SELECT id, name FROM branches WHERE id = ?',
      [location.branch_id]
    )[0];
    if (!branch) throw new Error('الفرع غير موجود.');
    if (!input.scheduleName?.trim()) throw new Error('اسم الجدول مطلوب.');
    if (input.assignedWorkerId) {
      const worker = this.db.query<{ id: string; name: string }>(
        'SELECT id, name FROM employees WHERE id = ? AND status != ?',
        [input.assignedWorkerId, 'SUSPENDED']
      )[0];
      if (!worker) throw new Error('العامل غير موجود أو موقوف.');
    }
    const scheduleCode = `CLN-${localDateString().slice(0, 7)}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
    const id = `cln_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO facility_cleaning_schedules
         (id, schedule_code, schedule_name, location_id, branch_id, frequency,
          cleaning_type, assigned_worker_id, start_time, end_time,
          estimated_duration_minutes, is_active, next_due_date, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, scheduleCode, input.scheduleName.trim(), input.locationId, location.branch_id,
        input.frequency, input.cleaningType, input.assignedWorkerId || null,
        input.startTime || null, input.endTime || null,
        input.estimatedDurationMinutes ?? 0, input.isActive !== false ? 1 : 0,
        input.nextDueDate || null, input.notes || null, actor.id]
    );
    this.auditActor(actor, 'إضافة جدول تنظيف', id, {
      scheduleCode, scheduleName: input.scheduleName, cleaningType: input.cleaningType,
    });
    return this.getCleaningSchedule(id)!;
  }

  private static getCleaningSchedule(id: string): CleaningSchedule | null {
    const schedules = this.getCleaningSchedules().filter((s) => s.id === id);
    return schedules[0] ?? null;
  }

  static updateCleaningSchedule(id: string, input: Partial<CleaningScheduleInput>): CleaningSchedule {
    const actor = this.requireManage();
    const schedule = this.db.query<{ id: string }>(
      'SELECT id FROM facility_cleaning_schedules WHERE id = ? AND company_id = ?',
      [id, companyId]
    )[0];
    if (!schedule) throw new Error('جدول التنظيف غير موجود.');
    const updates: string[] = [];
    const params: (string | number | null)[] = [];
    const setField = (column: string, value: string | number | null | undefined) => {
      if (value !== undefined) { updates.push(`${column} = ?`); params.push(value); }
    };
    setField('schedule_name', input.scheduleName?.trim() || null);
    setField('frequency', input.frequency || null);
    setField('cleaning_type', input.cleaningType || null);
    setField('assigned_worker_id', input.assignedWorkerId || null);
    setField('start_time', input.startTime || null);
    setField('end_time', input.endTime || null);
    setField('estimated_duration_minutes', input.estimatedDurationMinutes !== undefined ? input.estimatedDurationMinutes : undefined);
    setField('is_active', input.isActive !== undefined ? (input.isActive ? 1 : 0) : undefined);
    setField('next_due_date', input.nextDueDate || null);
    setField('notes', input.notes || null);
    if (!updates.length) throw new Error('لا توجد بيانات للتعديل.');
    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);
    this.db.run(`UPDATE facility_cleaning_schedules SET ${updates.join(', ')} WHERE id = ?`, params);
    this.auditActor(actor, 'تعديل جدول تنظيف', id, input);
    return this.getCleaningSchedule(id)!;
  }

  /* ========== Cleaning Checklists ========== */

  static getCleaningChecklists(cleaningType?: CleaningType): CleaningChecklistItem[] {
    const actor = this.requireView();
    const conditions: string[] = ['1=1'];
    const params: (string | number)[] = [];
    if (cleaningType) {
      conditions.push('cleaning_type = ?');
      params.push(cleaningType);
    }
    const scope = this.branchAccess.sqlScope('1', undefined, actor);
    conditions.push(scope.clause);
    params.push(...scope.params);

    return this.db.query<any>(
      `SELECT id, cleaning_type AS cleaningType, item_name AS itemName,
              item_description AS itemDescription, is_critical AS isCritical,
              sort_order AS sortOrder, is_active AS isActive
       FROM facility_cleaning_checklists
       WHERE ${conditions.join(' AND ')}
       ORDER BY cleaning_type, sort_order`,
      params
    ).map((row) => ({
      ...row,
      cleaningType: row.cleaning_type as CleaningType,
      isCritical: Boolean(row.is_critical),
      isActive: Boolean(row.is_active),
    }));
  }

  static createCleaningChecklist(input: CleaningChecklistInput): CleaningChecklistItem {
    const actor = this.requireManage();
    if (!input.itemName?.trim()) throw new Error('اسم البند مطلوب.');
    const id = `clci_${uuidv4().replace(/-/g, '').slice(0, 14)}`;
    this.db.run(
      `INSERT INTO facility_cleaning_checklists
         (id, cleaning_type, item_name, item_description, is_critical, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, input.cleaningType, input.itemName.trim(), input.itemDescription || null,
        input.isCritical ? 1 : 0, input.sortOrder ?? 0, input.isActive !== false ? 1 : 0]
    );
    this.auditActor(actor, 'إضافة بند قائمة تنظيف', id, {
      cleaningType: input.cleaningType, itemName: input.itemName,
    });
    return this.getCleaningChecklist(id)!;
  }

  private static getCleaningChecklist(id: string): CleaningChecklistItem | null {
    const items = this.getCleaningChecklists().filter((i) => i.id === id);
    return items[0] ?? null;
  }

  /* ========== Cleaning Tasks ========== */

  static getCleaningTasks(options: {
    scheduleId?: string;
    workerId?: string;
    from?: string;
    to?: string;
    status?: CleaningTaskStatus;
    limit?: number;
  }): CleaningTask[] {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const conditions: string[] = ['ct.company_id = ?'];
    const params: (string | number)[] = [companyId];
    if (options.scheduleId) {
      conditions.push('ct.schedule_id = ?');
      params.push(options.scheduleId);
    }
    if (options.workerId) {
      conditions.push('ct.worker_id = ?');
      params.push(options.workerId);
    }
    if (options.from) {
      conditions.push('ct.task_date >= ?');
      params.push(options.from);
    }
    if (options.to) {
      conditions.push('ct.task_date <= ?');
      params.push(options.to);
    }
    if (options.status) {
      conditions.push('ct.status = ?');
      params.push(options.status);
    }
    const scope = this.branchAccess.sqlScope('ct.branch_id', undefined, actor);
    conditions.push(scope.clause);
    params.push(...scope.params);

    const rows = this.db.query<any>(
      `SELECT ct.id, ct.schedule_id AS scheduleId, sc.schedule_name AS scheduleName,
              ct.location_id AS locationId, fl.name AS locationName,
              ct.branch_id AS branchId, b.name AS branchName,
              ct.worker_id AS workerId, e.name AS workerName,
              ct.task_date AS taskDate, ct.planned_start AS plannedStart,
              ct.actual_start AS actualStart, ct.actual_end AS actualEnd,
              ct.duration_minutes AS durationMinutes, ct.status,
              ct.quality_score AS qualityScore, ct.before_photo_path AS beforePhotoPath,
              ct.after_photo_path AS afterPhotoPath, ct.notes,
              ct.created_at AS createdAt, ct.updated_at AS updatedAt
       FROM facility_cleaning_tasks ct
       JOIN facility_cleaning_schedules sc ON sc.id = ct.schedule_id
       JOIN facility_locations fl ON fl.id = ct.location_id
       JOIN branches b ON b.id = ct.branch_id
       JOIN employees e ON e.id = ct.worker_id
       WHERE ct.company_id = ? AND ${conditions.slice(1).join(' AND ')}
       ORDER BY ct.task_date DESC, ct.schedule_name`,
      params
    );
    return rows.map((row) => ({
      ...row,
      status: row.status as CleaningTaskStatus,
      items: this.getCleaningTaskItems(row.id),
    }));
  }

  private static getCleaningTaskItems(taskId: string): CleaningTaskItem[] {
    return this.db.query<any>(
      `SELECT id, checklist_item_id AS checklistItemId, item_name AS itemName,
              result, observation, corrective_action AS correctiveAction
       FROM facility_cleaning_task_items
       WHERE task_id = ?
       ORDER BY id`,
      [taskId]
    );
  }

  static createCleaningTask(input: CleaningTaskInput): CleaningTask {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const schedule = this.db.query<{ id: string; location_id: string; branch_id: string; worker_id: string }>(
      `SELECT cs.id, cs.location_id AS locationId, cs.branch_id AS branchId, cs.assigned_worker_id AS workerId
       FROM facility_cleaning_schedules cs
       WHERE cs.id = ? AND cs.company_id = ?`,
      [input.scheduleId, companyId]
    )[0];
    if (!schedule) throw new Error('جدول التنظيف غير موجود.');
    const worker = this.db.query<{ id: string; name: string }>(
      'SELECT id, name FROM employees WHERE id = ? AND status != ?',
      [input.workerId, 'SUSPENDED']
    )[0];
    if (!worker) throw new Error('العامل غير موجود أو موقوف.');
    if (!isValidDate(input.taskDate)) throw new Error('تاريخ المهمة غير صالح.');
    const id = `clnt_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    const status = input.status ?? 'PENDING';
    const actualEnd = input.actualEnd || null;
    const durationMinutes = input.actualStart && actualEnd
      ? Math.max(0, Math.round((Date.parse(`${actualEnd}T00:00:00`) - Date.parse(`${input.actualStart}T00:00:00`)) / 60000))
      : 0;
    this.db.executeTransaction((db) => {
      db.run(
        `INSERT INTO facility_cleaning_tasks
           (id, schedule_id, location_id, branch_id, worker_id, task_date,
            planned_start, actual_start, actual_end, duration_minutes, status,
            quality_score, before_photo_path, after_photo_path, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, input.scheduleId, schedule.location_id, schedule.branch_id,
          input.workerId, input.taskDate, input.plannedStart || null,
          input.actualStart || null, actualEnd, durationMinutes, status,
          input.qualityScore || null, input.beforePhotoPath || null,
          input.afterPhotoPath || null, input.notes || null, actor.id]
      );
      for (const item of input.items) {
        if (!item.itemName?.trim()) continue;
        db.run(
          `INSERT INTO facility_cleaning_task_items
             (id, task_id, checklist_item_id, item_name, result,
              observation, corrective_action)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [`clnti_${uuidv4().replace(/-/g, '').slice(0, 14)}`, id,
            item.checklistItemId || null, item.itemName.trim(), item.result,
            item.observation || null, item.correctiveAction || null]
        );
      }
      this.auditDB(db, actor, 'إضافة مهمة تنظيف', id, {
        scheduleId: input.scheduleId, workerId: input.workerId, taskDate: input.taskDate, status,
      });
    });
    return this.getCleaningTask(id)!;
  }

  private static getCleaningTask(id: string): CleaningTask | null {
    const tasks = this.getCleaningTasks({ limit: 1000 }).filter((t) => t.id === id);
    return tasks[0] ?? null;
  }

  static updateCleaningTaskStatus(id: string, status: CleaningTaskStatus, qualityScore?: number | null): CleaningTask {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const task = this.db.query<{ id: string }>(
      'SELECT id FROM facility_cleaning_tasks WHERE id = ? AND company_id = ?',
      [id, companyId]
    )[0];
    if (!task) throw new Error('مهمة التنظيف غير موجودة.');
    const updates: string[] = [];
    const params: (string | number | null)[] = [];
    const setField = (column: string, value: string | number | null | undefined) => {
      if (value !== undefined) { updates.push(`${column} = ?`); params.push(value); }
    };
    setField('status', status || null);
    setField('quality_score', qualityScore !== undefined ? qualityScore : undefined);
    if (status === 'COMPLETED') {
      updates.push('actual_end = COALESCE(actual_end, ?)');
      params.push(localDateString());
    }
    if (!updates.length) throw new Error('لا توجد بيانات للتعديل.');
    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);
    this.db.run(`UPDATE facility_cleaning_tasks SET ${updates.join(', ')} WHERE id = ?`, params);
    this.auditActor(actor, 'تعديل حالة مهمة تنظيف', id, { status, qualityScore });
    return this.getCleaningTask(id)!;
  }

  /* ========== Cleaning Supplies ========== */

  static getCleaningSupplies(): CleaningSupply[] {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const scope = this.branchAccess.sqlScope('cs.branch_id', undefined, actor);
    const today = localDateString();
    const rows = this.db.query<any>(
      `SELECT cs.id, cs.supply_code AS supplyCode, cs.supply_name AS supplyName,
              cs.supply_type AS supplyType, cs.unit_of_measure AS unitOfMeasure,
              cs.quantity_on_hand AS quantityOnHand, cs.minimum_threshold AS minimumThreshold,
              cs.reorder_quantity AS reorderQuantity, cs.location_id AS locationId,
              fl.name AS locationName, cs.branch_id AS branchId, b.name AS branchName,
              cs.supplier_id AS supplierId, s.name AS supplierName,
              cs.unit_cost AS unitCost, cs.expiry_date AS expiryDate, cs.status,
              cs.notes, cs.created_by AS createdBy, u.full_name AS createdByName,
              cs.created_at AS createdAt, cs.updated_at AS updatedAt
       FROM facility_cleaning_supplies cs
       JOIN facility_locations fl ON fl.id = cs.location_id
       JOIN branches b ON b.id = cs.branch_id
       LEFT JOIN suppliers s ON s.id = cs.supplier_id
       LEFT JOIN users u ON u.id = cs.created_by
       WHERE cs.company_id = ? AND ${scope.clause}
       ORDER BY cs.supply_name`,
      [companyId, ...scope.params]
    );
    return rows.map((row) => ({
      ...row,
      supplyType: row.supply_type as SupplyType,
      unitOfMeasure: row.unit_of_measure as SupplyUnit,
      status: row.status as SupplyStatus,
      isLowStock: row.quantity_on_hand <= row.minimum_threshold,
      isExpired: row.expiry_date ? row.expiry_date <= today : false,
      supplierName: row.supplier_name || null,
      createdByName: row.created_by_name || null,
    }));
  }

  static createCleaningSupply(input: CleaningSupplyInput): CleaningSupply {
    const actor = this.requireManage();
    const location = this.db.query<{ id: string; name: string; branch_id: string }>(
      'SELECT id, name, branch_id AS branchId FROM facility_locations WHERE id = ?',
      [input.locationId]
    )[0];
    if (!location) throw new Error('الموقع غير موجود.');
    if (!input.supplyName?.trim()) throw new Error('اسم مستلزمات التنظيف مطلوب.');
    if (Number(input.quantityOnHand || 0) < 0) throw new Error('الكمية يجب أن تكون غير سالبة.');
    const supplyCode = `SPLY-${localDateString().slice(0, 7)}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
    const id = `sply_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO facility_cleaning_supplies
         (id, supply_code, supply_name, supply_type, unit_of_measure,
          quantity_on_hand, minimum_threshold, reorder_quantity, location_id,
          branch_id, supplier_id, unit_cost, expiry_date, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, supplyCode, input.supplyName.trim(), input.supplyType,
        input.unitOfMeasure ?? 'unit', Math.max(0, Number(input.quantityOnHand || 0)),
        Math.max(0, Number(input.minimumThreshold || 0)),
        Math.max(0, Number(input.reorderQuantity || 0)), input.locationId,
        location.branch_id, input.supplierId || null,
        input.unitCost ?? 0, input.expiryDate || null, input.notes || null, actor.id]
    );
    this.auditActor(actor, 'إضافة مستلزمات تنظيف', id, {
      supplyCode, supplyName: input.supplyName, supplyType: input.supplyType,
    });
    return this.getCleaningSupply(id)!;
  }

  private static getCleaningSupply(id: string): CleaningSupply | null {
    const supplies = this.getCleaningSupplies().filter((s) => s.id === id);
    return supplies[0] ?? null;
  }

  static updateCleaningSupplyStock(id: string, quantityOnHand: number): CleaningSupply {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const supply = this.db.query<{ id: string; minimumThreshold: number }>(
      'SELECT id, minimum_threshold AS minimumThreshold FROM facility_cleaning_supplies WHERE id = ? AND company_id = ?',
      [id, companyId]
    )[0];
    if (!supply) throw new Error('المستلزمات غير موجودة.');
    if (Number(quantityOnHand) < 0) throw new Error('الكمية يجب أن تكون غير سالبة.');
    const status = quantityOnHand <= supply.minimumThreshold ? 'LOW_STOCK' : 'ACTIVE';
    this.db.run(
      `UPDATE facility_cleaning_supplies SET quantity_on_hand = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [Math.max(0, Number(quantityOnHand)), status, id]
    );
    this.auditActor(actor, 'تعديل كمية مستلزمات تنظيف', id, { quantityOnHand, status });
    return this.getCleaningSupply(id)!;
  }

  static recordSupplyUsage(input: CleaningSupplyUsageInput): CleaningSupplyUsage {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const supply = this.db.query<{ id: string; supplyName: string; quantityOnHand: number }>(
      'SELECT id, supply_name AS supplyName, quantity_on_hand AS quantityOnHand FROM facility_cleaning_supplies WHERE id = ? AND company_id = ?',
      [input.supplyId, companyId]
    )[0];
    if (!supply) throw new Error('المستلزمات غير موجودة.');
    if (Number(input.quantityUsed) <= 0) throw new Error('الكمية المستخدمة يجب أن تكون أكبر من صفر.');
    if (Number(input.quantityUsed) > supply.quantityOnHand) {
      throw new Error('الكمية المستخدمة تتجاوز الكمية المتوفرة.');
    }
    const worker = this.db.query<{ id: string; name: string }>(
      'SELECT id, name FROM employees WHERE id = ?',
      [input.workerId]
    )[0];
    if (!worker) throw new Error('العامل غير موجود.');
    if (!isValidDate(input.usageDate)) throw new Error('تاريخ الاستخدام غير صالح.');
    const id = `spu_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.executeTransaction((db) => {
      db.run(
        `INSERT INTO facility_cleaning_supply_usage
           (id, supply_id, worker_id, worker_name, usage_date, quantity_used,
            purpose, task_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, input.supplyId, input.workerId, worker.name, input.usageDate,
          Number(input.quantityUsed), input.purpose || null, input.taskId || null, actor.id]
      );
      db.run(
        `UPDATE facility_cleaning_supplies
         SET quantity_on_hand = quantity_on_hand - ?,
             status = CASE WHEN quantity_on_hand - ? <= minimum_threshold THEN 'LOW_STOCK' ELSE status END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [Number(input.quantityUsed), Number(input.quantityUsed), input.supplyId]
      );
      this.auditDB(db, actor, 'تسجيل استخدام مستلزمات تنظيف', id, {
        supplyId: input.supplyId, workerId: input.workerId, quantityUsed: input.quantityUsed,
      });
    });
    return this.getSupplyUsage(id)!;
  }

  private static getSupplyUsage(id: string): CleaningSupplyUsage | null {
    const usages = this.getSupplyUsages().filter((u) => u.id === id);
    return usages[0] ?? null;
  }

  static getSupplyUsages(): CleaningSupplyUsage[] {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const scope = this.branchAccess.sqlScope('csu.branch_id', undefined, actor);
    return this.db.query<any>(
      `SELECT csu.id, csu.supply_id AS supplyId, cs.supply_name AS supplyName,
              csu.worker_id AS workerId, e.name AS workerName,
              csu.usage_date AS usageDate, csu.quantity_used AS quantityUsed,
              csu.purpose, csu.task_id AS taskId,
              csu.created_by AS createdBy, u.full_name AS createdByName,
              csu.created_at AS createdAt
       FROM facility_cleaning_supply_usage csu
       JOIN facility_cleaning_supplies cs ON cs.id = csu.supply_id
       JOIN employees e ON e.id = csu.worker_id
       LEFT JOIN users u ON u.id = csu.created_by
       WHERE cs.company_id = ? AND ${scope.clause}
       ORDER BY csu.usage_date DESC`,
      [companyId, ...scope.params]
    ).map((row) => ({
      ...row,
      createdByName: row.created_by_name || null,
    }));
  }

  /* ========== Stats ========== */

  static getCleaningStats(): CleaningStats {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const scope = this.branchAccess.sqlScope('ct.branch_id', undefined, actor);
    const totalSchedules = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM facility_cleaning_schedules WHERE company_id = ?`,
      [companyId]
    )[0]?.count ?? 0;
    const activeSchedules = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM facility_cleaning_schedules WHERE company_id = ? AND is_active = 1`,
      [companyId]
    )[0]?.count ?? 0;
    const tasksByStatus = this.db.query<any>(
      `SELECT status, COUNT(*) AS count FROM facility_cleaning_tasks WHERE company_id = ? AND ${scope.clause} GROUP BY status`,
      [companyId, ...scope.params]
    );
    const pendingTasks = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM facility_cleaning_tasks WHERE company_id = ? AND status = 'PENDING' AND ${scope.clause}`,
      [companyId, ...scope.params]
    )[0]?.count ?? 0;
    const completedTasks = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM facility_cleaning_tasks WHERE company_id = ? AND status = 'COMPLETED' AND ${scope.clause}`,
      [companyId, ...scope.params]
    )[0]?.count ?? 0;
    const skippedTasks = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM facility_cleaning_tasks WHERE company_id = ? AND status = 'SKIPPED' AND ${scope.clause}`,
      [companyId, ...scope.params]
    )[0]?.count ?? 0;
    const totalSupplies = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM facility_cleaning_supplies WHERE company_id = ?`,
      [companyId]
    )[0]?.count ?? 0;
    const lowStockSupplies = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM facility_cleaning_supplies WHERE company_id = ? AND quantity_on_hand <= minimum_threshold`,
      [companyId]
    )[0]?.count ?? 0;
    const expiredSupplies = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM facility_cleaning_supplies WHERE company_id = ? AND expiry_date <= ? AND status != 'RETIRED'`,
      [companyId, localDateString()]
    )[0]?.count ?? 0;
    const avgQuality = this.db.query<{ avg: number }>(
      `SELECT AVG(quality_score) AS avg FROM facility_cleaning_tasks WHERE company_id = ? AND quality_score IS NOT NULL AND ${scope.clause}`,
      [companyId, ...scope.params]
    )[0]?.avg ?? 0;
    const suppliesByType = this.db.query<any>(
      `SELECT supply_type AS type, COUNT(*) AS count FROM facility_cleaning_supplies WHERE company_id = ? GROUP BY supply_type`,
      [companyId]
    );
    return {
      totalSchedules: Number(totalSchedules),
      activeSchedules: Number(activeSchedules),
      pendingTasks: Number(pendingTasks),
      completedTasks: Number(completedTasks),
      skippedTasks: Number(skippedTasks),
      totalSupplies: Number(totalSupplies),
      lowStockSupplies: Number(lowStockSupplies),
      expiredSupplies: Number(expiredSupplies),
      averageQualityScore: roundNumber(Number(avgQuality) || 0),
      tasksByStatus: tasksByStatus.map((row) => ({ status: row.status, count: Number(row.count) })),
      suppliesByType: suppliesByType.map((row) => ({ type: row.type, count: Number(row.count) })),
    };
  }

  /* ========== Helpers ========== */

  private static auditActor(actor: { id: string; fullName: string }, action: string, recordId: string, values: object): void {
    this.db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
       VALUES (?, ?, ?, ?, 'OPERATIONS', ?, ?)`,
      [`aud_${uuidv4().replace(/-/g, '').slice(0, 12)}`, actor.id, actor.fullName, action, recordId,
        JSON.stringify(values)]
    );
  }

  private static auditDB(db: any, actor: { id: string; fullName: string }, action: string, recordId: string, values: object): void {
    db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
       VALUES (?, ?, ?, ?, 'OPERATIONS', ?, ?)`,
      [`aud_${uuidv4().replace(/-/g, '').slice(0, 12)}`, actor.id, actor.fullName, action, recordId,
        JSON.stringify(values)]
    );
  }
}
