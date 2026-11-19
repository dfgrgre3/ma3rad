import { v4 as uuidv4 } from 'uuid';
import { localDateString } from '../../../../utils/shared/date';
import type { User } from '../../../../types/auth/identity';
import type {
  EmployeeCustodyItem,
  EmployeeOnboardingTask,
  OrgServiceDeps,
} from './types';
import { audit } from './context';

function mapOnboardingTask(row: any): EmployeeOnboardingTask {
  return {
    id: row.id,
    employeeId: row.employeeId,
    taskName: row.taskName,
    category: row.category,
    dueDate: row.dueDate || null,
    status: row.status,
    completedAt: row.completedAt || null,
    completedBy: row.completedBy || null,
    notes: row.notes || null,
    createdAt: row.createdAt,
  };
}

export function getOnboardingTasks(deps: OrgServiceDeps, employeeId: string): EmployeeOnboardingTask[] {
  const { db } = deps;
  return db.query<any>(`
    SELECT id, employee_id AS employeeId, task_name AS taskName, category, due_date AS dueDate,
      status, completed_at AS completedAt, completed_by AS completedBy, notes, created_at AS createdAt
    FROM employee_onboarding_tasks WHERE employee_id = ? ORDER BY created_at
  `, [employeeId]).map(mapOnboardingTask);
}

export function createOnboardingChecklist(
  deps: OrgServiceDeps,
  actor: User,
  employeeId: string,
  tasks?: string[]
): EmployeeOnboardingTask[] {
  const { db } = deps;
  const employee = db.query<{ id: string }>('SELECT id FROM employees WHERE id = ?', [employeeId])[0];
  if (!employee) throw new Error('الموظف غير موجود.');
  const defaultTasks = tasks && tasks.length ? tasks : [
    'استلام مستندات التعيين',
    'فتح ملف الموظف',
    'تسليم بطاقة/صلاحيات النظام',
    'تسليم العهد والمعدات',
    'شرح سياسات المنشأة',
    'إدخال في أنظمة الحضور والرواتب',
  ];
  const created: EmployeeOnboardingTask[] = [];
  for (const taskName of defaultTasks) {
    const id = `onb_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    db.run(
      `INSERT INTO employee_onboarding_tasks (id, employee_id, task_name, category, due_date)
       VALUES (?, ?, ?, 'ONBOARDING', ?)`,
      [id, employeeId, taskName, null]
    );
    created.push(getOnboardingTasks(deps, employeeId).find((row) => row.id === id)!);
  }
  db.run(
    `INSERT INTO employee_lifecycle_events (id, employee_id, event_type, event_date, notes, actor_id)
     VALUES (?, ?, 'ONBOARDING', ?, ?, ?)`,
    [`ev_${uuidv4().replace(/-/g, '').slice(0, 16)}`, employeeId, localDateString(), 'إنشاء قائمة تأهيل', actor.id]
  );
  return created;
}

export function completeOnboardingTask(deps: OrgServiceDeps, actor: User, taskId: string, notes?: string): void {
  const { db } = deps;
  db.run(
    `UPDATE employee_onboarding_tasks
     SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP, completed_by = ?, notes = COALESCE(?, notes)
     WHERE id = ?`,
    [actor.id, notes?.trim() || null, taskId]
  );
}

export function cancelOnboardingTask(deps: OrgServiceDeps, actor: User, taskId: string): void {
  const { db } = deps;
  db.run(`UPDATE employee_onboarding_tasks SET status = 'CANCELLED' WHERE id = ?`, [taskId]);
  audit(deps, actor, 'إلغاء مهمة تأهيل', taskId, {});
}

export function getOnboardingReport(
  deps: OrgServiceDeps
): Array<{ employeeId: string; total: number; completed: number; pending: number; overdue: number }> {
  const { db } = deps;
  const today = localDateString();
  const rows = db.query<any>(`
    SELECT employee_id AS employeeId,
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status = 'PENDING' AND (due_date IS NULL OR due_date <= ?) THEN 1 ELSE 0 END) AS overdue
    FROM employee_onboarding_tasks
    GROUP BY employee_id
  `, [today]);
  return rows.map((row) => ({
    employeeId: row.employeeId,
    total: Number(row.total) || 0,
    completed: Number(row.completed) || 0,
    pending: Number(row.pending) || 0,
    overdue: Number(row.overdue) || 0,
  }));
}

function mapCustodyItem(row: any): EmployeeCustodyItem {
  return {
    id: row.id,
    employeeId: row.employeeId,
    itemName: row.itemName,
    itemType: row.itemType,
    serialNumber: row.serialNumber || null,
    assignedAt: row.assignedAt,
    returnedAt: row.returnedAt || null,
    status: row.status,
    notes: row.notes || null,
    createdAt: row.createdAt,
  };
}

export function getCustodyItems(deps: OrgServiceDeps, employeeId: string): EmployeeCustodyItem[] {
  const { db } = deps;
  return db.query<any>(`
    SELECT id, employee_id AS employeeId, item_name AS itemName, item_type AS itemType,
      serial_number AS serialNumber, assigned_at AS assignedAt, returned_at AS returnedAt,
      status, notes, created_at AS createdAt
    FROM employee_custody_items WHERE employee_id = ? ORDER BY assigned_at DESC
  `, [employeeId]).map(mapCustodyItem);
}

export function assignCustodyItem(
  deps: OrgServiceDeps,
  actor: User,
  input: {
    employeeId: string; itemName: string; itemType?: string; serialNumber?: string; notes?: string;
  }
): EmployeeCustodyItem {
  const { db } = deps;
  const id = `cus_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  const assignedAt = localDateString();
  db.run(
    `INSERT INTO employee_custody_items (id, employee_id, item_name, item_type, serial_number, assigned_at, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, input.employeeId, input.itemName.trim(), input.itemType || 'EQUIPMENT',
     input.serialNumber?.trim() || null, assignedAt, input.notes?.trim() || null]
  );
  db.run(
    `INSERT INTO employee_lifecycle_events (id, employee_id, event_type, event_date, to_value, notes, actor_id)
     VALUES (?, ?, 'CUSTODY_ASSIGN', ?, ?, ?, ?)`,
    [`ev_${uuidv4().replace(/-/g, '').slice(0, 16)}`, input.employeeId, assignedAt,
     input.itemName.trim(), input.notes?.trim() || null, actor.id]
  );
  return getCustodyItems(deps, input.employeeId).find((row) => row.id === id)!;
}

export function returnCustodyItem(
  deps: OrgServiceDeps,
  actor: User,
  id: string,
  status: 'RETURNED' | 'LOST' = 'RETURNED',
  notes?: string
): void {
  const { db } = deps;
  const item = db.query<{ employeeId: string; itemName: string }>(
    'SELECT employee_id AS employeeId, item_name AS itemName FROM employee_custody_items WHERE id = ?',
    [id]
  )[0];
  if (!item) throw new Error('عنصر العهدة غير موجود.');
  db.run(
    `UPDATE employee_custody_items SET status = ?, returned_at = ?, notes = COALESCE(?, notes) WHERE id = ?`,
    [status, localDateString(), notes?.trim() || null, id]
  );
  db.run(
    `INSERT INTO employee_lifecycle_events (id, employee_id, event_type, event_date, from_value, to_value, notes, actor_id)
     VALUES (?, ?, 'CUSTODY_RETURN', ?, ?, ?, ?, ?)`,
    [`ev_${uuidv4().replace(/-/g, '').slice(0, 16)}`, item.employeeId, localDateString(),
     item.itemName, status, notes?.trim() || null, actor.id]
  );
  audit(deps, actor, 'إرجاع عهدة', id, { status });
}
