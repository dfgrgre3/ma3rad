import { v4 as uuidv4 } from 'uuid';
import type { User } from '../../../../types/auth/identity';
import type {
  EmployeeLifecycleEvent,
  EmployeeTransfer,
  OrgServiceDeps,
} from './types';
import { audit, requireDepartment } from './context';

export function transferEmployee(
  deps: OrgServiceDeps,
  actor: User,
  input: {
    employeeId: string;
    toBranchId?: string | null;
    toDepartmentId?: string | null;
    toJobTitle?: string | null;
    toGradeId?: string | null;
    transferDate: string;
    reason?: string;
  }
): EmployeeTransfer {
  const { db, branchAccess } = deps;
  const employee = db.query<any>(`
    SELECT id, branch_id AS branchId, department_id AS departmentId, role AS jobTitle, job_grade_id AS gradeId
    FROM employees WHERE id = ?
  `, [input.employeeId])[0];
  if (!employee) throw new Error('الموظف غير موجود.');
  const id = `trf_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  const toBranchId = input.toBranchId || employee.branchId;
  const toDepartmentId = input.toDepartmentId || employee.departmentId;
  if (input.toDepartmentId) requireDepartment(deps, input.toDepartmentId, actor);
  if (toBranchId) branchAccess.requireBranchAccess(toBranchId, actor);
  db.executeTransaction((txnDb) => {
    txnDb.run(
      `INSERT INTO employee_transfers
         (id, employee_id, from_branch_id, to_branch_id, from_department_id, to_department_id,
          from_job_title, to_job_title, from_grade_id, to_grade_id, transfer_date, reason,
          approved_by, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.employeeId, employee.branchId, toBranchId, employee.departmentId, toDepartmentId,
       employee.jobTitle, input.toJobTitle || employee.jobTitle, employee.gradeId, input.toGradeId || employee.gradeId,
       input.transferDate, input.reason?.trim() || null, actor.id, actor.id]
    );
    txnDb.run(
      `UPDATE employees SET branch_id = ?, department_id = ?, role = COALESCE(?, role),
         job_title = COALESCE(?, job_title), job_grade_id = COALESCE(?, job_grade_id), updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [toBranchId, toDepartmentId, input.toJobTitle || null, input.toJobTitle || null,
       input.toGradeId || null, input.employeeId]
    );
    txnDb.run(
      `INSERT INTO employee_lifecycle_events
         (id, employee_id, event_type, event_date, from_value, to_value, notes, actor_id)
       VALUES (?, ?, 'TRANSFER', ?, ?, ?, ?, ?)`,
      [`ev_${uuidv4().replace(/-/g, '').slice(0, 16)}`, input.employeeId, input.transferDate,
       `${employee.branchId || ''}/${employee.departmentId || ''}`,
       `${toBranchId || ''}/${toDepartmentId || ''}`, input.reason?.trim() || null, actor.id]
    );
    txnDb.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
       VALUES (?, ?, ?, 'نقل موظف', 'HR', ?, ?)`,
      [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, input.employeeId,
       JSON.stringify({ toBranchId, toDepartmentId, toJobTitle: input.toJobTitle })]
    );
  });
  return {
    id,
    employeeId: input.employeeId,
    fromBranchId: employee.branchId || null,
    toBranchId: toBranchId || null,
    fromDepartmentId: employee.departmentId || null,
    toDepartmentId: toDepartmentId || null,
    fromJobTitle: employee.jobTitle || null,
    toJobTitle: input.toJobTitle || employee.jobTitle || null,
    transferDate: input.transferDate,
    reason: input.reason?.trim() || null,
    status: 'APPROVED',
    approvedBy: actor.id,
    createdAt: new Date().toISOString(),
  };
}

export function getTransfers(deps: OrgServiceDeps, employeeId?: string): EmployeeTransfer[] {
  const { db } = deps;
  const params: any[] = [];
  let where = '1 = 1';
  if (employeeId) {
    where = 'et.employee_id = ?';
    params.push(employeeId);
  }
  return db.query<any>(`
    SELECT et.id, et.employee_id AS employeeId, et.from_branch_id AS fromBranchId,
      et.to_branch_id AS toBranchId, et.from_department_id AS fromDepartmentId,
      et.to_department_id AS toDepartmentId, et.from_job_title AS fromJobTitle,
      et.to_job_title AS toJobTitle, et.transfer_date AS transferDate,
      et.reason, et.status, et.approved_by AS approvedBy, et.created_at AS createdAt
    FROM employee_transfers et
    WHERE ${where}
    ORDER BY et.transfer_date DESC, et.created_at DESC
  `, params).map((row) => ({
    id: row.id,
    employeeId: row.employeeId,
    fromBranchId: row.fromBranchId || null,
    toBranchId: row.toBranchId || null,
    fromDepartmentId: row.fromDepartmentId || null,
    toDepartmentId: row.toDepartmentId || null,
    fromJobTitle: row.fromJobTitle || null,
    toJobTitle: row.toJobTitle || null,
    transferDate: row.transferDate,
    reason: row.reason || null,
    status: row.status,
    approvedBy: row.approvedBy || null,
    createdAt: row.createdAt,
  }));
}

export function addLifecycleEvent(
  deps: OrgServiceDeps,
  actor: User,
  input: {
    employeeId: string; eventType: string; eventDate: string;
    fromValue?: string | null; toValue?: string | null; notes?: string;
  }
): EmployeeLifecycleEvent {
  const { db } = deps;
  const id = `ev_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  db.run(
    `INSERT INTO employee_lifecycle_events
       (id, employee_id, event_type, event_date, from_value, to_value, notes, actor_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.employeeId, input.eventType, input.eventDate,
     input.fromValue || null, input.toValue || null, input.notes?.trim() || null, actor.id]
  );
  audit(deps, actor, 'حدث دورة حياة موظف', id, { employeeId: input.employeeId, eventType: input.eventType });
  return {
    id,
    employeeId: input.employeeId,
    eventType: input.eventType,
    eventDate: input.eventDate,
    fromValue: input.fromValue || null,
    toValue: input.toValue || null,
    notes: input.notes?.trim() || null,
    actorId: actor.id,
    createdAt: new Date().toISOString(),
  };
}

export function getLifecycleEvents(deps: OrgServiceDeps, employeeId: string): EmployeeLifecycleEvent[] {
  const { db } = deps;
  return db.query<any>(`
    SELECT id, employee_id AS employeeId, event_type AS eventType, event_date AS eventDate,
      from_value AS fromValue, to_value AS toValue, notes, actor_id AS actorId, created_at AS createdAt
    FROM employee_lifecycle_events
    WHERE employee_id = ?
    ORDER BY event_date DESC, created_at DESC
  `, [employeeId]).map((row) => ({
    id: row.id,
    employeeId: row.employeeId,
    eventType: row.eventType,
    eventDate: row.eventDate,
    fromValue: row.fromValue || null,
    toValue: row.toValue || null,
    notes: row.notes || null,
    actorId: row.actorId || null,
    createdAt: row.createdAt,
  }));
}
