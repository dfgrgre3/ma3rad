import { v4 as uuidv4 } from 'uuid';
import { localDateString, addLocalDays } from '../../../../utils/shared/date';
import type { SafetyContext } from './context';
import { isValidDate } from './helpers';
import type {
  PPEAssignment,
  PPEAssignmentInput,
  PPEAssignmentStatus,
  PPEInventory,
  PPEInventoryInput,
  PPEStatus,
  PPEType,
} from './types';

/* ========== PPE Inventory ========== */

export function getPPEInventory(ctx: SafetyContext): PPEInventory[] {
  const actor = ctx.requireView();
  const companyId = ctx.currentCompanyId(actor);
  const scope = ctx.branchAccess.sqlScope('ppi.branch_id', undefined, actor);
  const today = localDateString();
  const _inThirtyDays = localDateString(addLocalDays(new Date(), 30));
  const rows = ctx.db.query<any>(
    `SELECT ppi.id, ppi.ppe_code AS ppeCode, ppi.ppe_name AS ppeName,
            ppi.location_id AS locationId, fl.name AS locationName,
            ppi.branch_id AS branchId, b.name AS branchName,
            ppi.ppe_type AS ppeType, ppi.quantity_total AS quantityTotal,
            ppi.quantity_available AS quantityAvailable,
            ppi.quantity_in_use AS quantityInUse, ppi.size, ppi.manufacturer,
            ppi.model, ppi.expiry_date AS expiryDate, ppi.status,
            ppi.notes, ppi.created_by AS createdBy, u.full_name AS createdByName,
            ppi.created_at AS createdAt, ppi.updated_at AS updatedAt
     FROM facility_ppe_inventory ppi
     JOIN facility_locations fl ON fl.id = ppi.location_id
     JOIN branches b ON b.id = ppi.branch_id
     LEFT JOIN users u ON u.id = ppi.created_by
     WHERE ppi.company_id = ? AND ${scope.clause}
     ORDER BY ppi.ppe_name`,
    [companyId, ...scope.params]
  );
  return rows.map((row) => ({
    ...row,
    ppeType: row.ppe_type as PPEType,
    status: row.status as PPEStatus,
    isExpired: row.expiry_date ? row.expiry_date <= today : false,
    createdByName: row.created_by_name || null,
  }));
}

export function createPPEInventory(ctx: SafetyContext, input: PPEInventoryInput): PPEInventory {
  const actor = ctx.requireManage();
  const _companyId = ctx.currentCompanyId(actor);
  const location = ctx.db.query<{ id: string; name: string; branch_id: string }>(
    'SELECT id, name, branch_id AS branchId FROM facility_locations WHERE id = ?',
    [input.locationId]
  )[0];
  if (!location) throw new Error('الموقع غير موجود.');
  if (!input.ppeName?.trim()) throw new Error('اسم معدات الوقاية مطلوب.');
  if (Number(input.quantityTotal) < 0) throw new Error('الكمية الإجمالية يجب أن تكون غير سالبة.');
  const ppeCode = `PPE-${localDateString().slice(0, 7)}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
  const id = `ppe_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  ctx.db.run(
    `INSERT INTO facility_ppe_inventory
       (id, ppe_code, ppe_name, location_id, branch_id, ppe_type,
        quantity_total, quantity_available, quantity_in_use, size,
        manufacturer, model, expiry_date, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, ppeCode, input.ppeName.trim(), input.locationId, location.branch_id,
      input.ppeType, Math.max(0, Number(input.quantityTotal)),
      Math.max(0, Number(input.quantityTotal)), 0,
      input.size || null, input.manufacturer || null, input.model || null,
      input.expiryDate || null, input.notes || null, actor.id]
  );
  ctx.auditActor(actor, 'إضافة مخزون معدات وقاية', id, {
    ppeCode, ppeName: input.ppeName, ppeType: input.ppeType,
  });
  return getPPEInventoryItem(ctx, id)!;
}

function getPPEInventoryItem(ctx: SafetyContext, id: string): PPEInventory | null {
  const items = getPPEInventory(ctx).filter((i) => i.id === id);
  return items[0] ?? null;
}

export function assignPPE(ctx: SafetyContext, input: PPEAssignmentInput): PPEAssignment {
  const actor = ctx.requireManage();
  const companyId = ctx.currentCompanyId(actor);
  const inventory = ctx.db.query<{ id: string; quantity_available: number; quantity_in_use: number }>(
    'SELECT id, quantity_available, quantity_in_use FROM facility_ppe_inventory WHERE id = ? AND company_id = ?',
    [input.ppeInventoryId, companyId]
  )[0];
  if (!inventory) throw new Error('مخزون معدات الوقاية غير موجود.');
  if (inventory.quantity_available <= 0) throw new Error('لا توجد كميات متاحة للإسناد.');
  const employee = ctx.db.query<{ id: string; name: string }>(
    'SELECT id, name FROM employees WHERE id = ?',
    [input.employeeId]
  )[0];
  if (!employee) throw new Error('الموظف غير موجود.');
  if (!isValidDate(input.assignedDate)) throw new Error('تاريخ الإسناد غير صالح.');
  const id = `ppea_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  ctx.db.executeTransaction((db) => {
    db.run(
      `INSERT INTO facility_ppe_assignments
         (id, ppe_inventory_id, employee_id, employee_name, assigned_date,
          status, assigned_by)
       VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?)`,
      [id, input.ppeInventoryId, input.employeeId, employee.name,
        input.assignedDate, actor.id]
    );
    db.run(
      `UPDATE facility_ppe_inventory
       SET quantity_available = quantity_available - 1,
           quantity_in_use = quantity_in_use + 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [input.ppeInventoryId]
    );
    ctx.auditDB(db, actor, 'إسناد معدات وقاية', id, {
      ppeInventoryId: input.ppeInventoryId, employeeId: input.employeeId,
    });
  });
  return getPPEAssignment(ctx, id)!;
}

function getPPEAssignment(ctx: SafetyContext, id: string): PPEAssignment | null {
  const assignments = getPPEAssignments(ctx).filter((a) => a.id === id);
  return assignments[0] ?? null;
}

export function getPPEAssignments(ctx: SafetyContext): PPEAssignment[] {
  const actor = ctx.requireView();
  const companyId = ctx.currentCompanyId(actor);
  const scope = ctx.branchAccess.sqlScope('ppa.branch_id', undefined, actor);
  return ctx.db.query<any>(
    `SELECT ppa.id, ppa.ppe_inventory_id AS ppeInventoryId,
            ppi.ppe_name AS ppeName, ppi.ppe_code AS ppeCode,
            ppa.employee_id AS employeeId, e.name AS employeeName,
            ppa.assigned_date AS assignedDate, ppa.return_date AS returnDate,
            ppa.status, ppa.condition_at_return AS conditionAtReturn,
            ppa.notes, ppa.assigned_by AS assignedBy,
            u.full_name AS assignedByName, ppa.assigned_at AS assignedAt
     FROM facility_ppe_assignments ppa
     JOIN facility_ppe_inventory ppi ON ppi.id = ppa.ppe_inventory_id
     JOIN employees e ON e.id = ppa.employee_id
     LEFT JOIN users u ON u.id = ppa.assigned_by
     WHERE ppi.company_id = ? AND ${scope.clause}
     ORDER BY ppa.assigned_at DESC`,
    [companyId, ...scope.params]
  ).map((row) => ({
    ...row,
    status: row.status as PPEAssignmentStatus,
    assignedByName: row.assigned_by_name || null,
  }));
}

export function returnPPE(ctx: SafetyContext, assignmentId: string, conditionAtReturn?: string | null): PPEAssignment {
  const actor = ctx.requireManage();
  const companyId = ctx.currentCompanyId(actor);
  const assignment = ctx.db.query<any>(
    `SELECT ppa.id, ppa.ppe_inventory_id AS ppeInventoryId, ppa.status
     FROM facility_ppe_assignments ppa
     JOIN facility_ppe_inventory ppi ON ppi.id = ppa.ppe_inventory_id
     WHERE ppa.id = ? AND ppi.company_id = ?`,
    [assignmentId, companyId]
  )[0];
  if (!assignment) throw new Error('إسناد معدات الوقاية غير موجود.');
  if (assignment.status === 'RETURNED') throw new Error('المعدات مرتجعة مسبقاً.');
  ctx.db.executeTransaction((db) => {
    db.run(
      `UPDATE facility_ppe_assignments
       SET status = 'RETURNED', return_date = ?,
           condition_at_return = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [localDateString(), conditionAtReturn || null, assignmentId]
    );
    db.run(
      `UPDATE facility_ppe_inventory
       SET quantity_available = quantity_available + 1,
           quantity_in_use = quantity_in_use - 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [assignment.ppeInventoryId]
    );
    ctx.auditDB(db, actor, 'إرجاع معدات وقاية', assignmentId, {
      conditionAtReturn,
    });
  });
  return getPPEAssignment(ctx, assignmentId)!;
}
