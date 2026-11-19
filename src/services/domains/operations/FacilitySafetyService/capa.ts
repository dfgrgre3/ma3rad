import { v4 as uuidv4 } from 'uuid';
import { localDateString } from '../../../../utils/shared/date';
import type { SafetyContext } from './context';
import type {
  CAPAInput,
  CAPAItem,
  CAPAPriority,
  CAPAStatus,
  CAPAType,
} from './types';

/* ========== CAPA ========== */

export function getCAPA(ctx: SafetyContext): CAPAItem[] {
  const actor = ctx.requireView();
  const companyId = ctx.currentCompanyId(actor);
  const scope = ctx.branchAccess.sqlScope('c.branch_id', undefined, actor);
  const rows = ctx.db.query<any>(
    `SELECT c.id, c.capa_code AS capaCode, c.source_type AS sourceType,
            c.source_id AS sourceId,
            CASE c.source_type
              WHEN 'ACCIDENT' THEN (SELECT title FROM facility_accidents WHERE id = c.source_id)
              WHEN 'INSPECTION' THEN (SELECT id FROM facility_inspection_records WHERE id = c.source_id)
              WHEN 'RISK' THEN (SELECT risk_title FROM facility_risk_register WHERE id = c.source_id)
              ELSE c.title
            END AS sourceTitle,
            c.title, c.description, c.action_type AS actionType,
            c.priority, c.assigned_employee_id AS assignedEmployeeId,
            emp.name AS assignedEmployeeName, c.due_date AS dueDate,
            c.status, c.effectiveness_check AS effectivenessCheck,
            c.effectiveness_notes AS effectivenessNotes,
            c.completed_at AS completedAt,
            c.created_by AS createdBy, u.full_name AS createdByName,
            c.created_at AS createdAt, c.updated_at AS updatedAt
     FROM facility_capa c
     LEFT JOIN employees emp ON emp.id = c.assigned_employee_id
     LEFT JOIN users u ON u.id = c.created_by
     WHERE c.company_id = ? AND ${scope.clause}
     ORDER BY c.due_date, c.priority DESC`,
    [companyId, ...scope.params]
  );
  return rows.map((row) => ({
    ...row,
    actionType: row.action_type as CAPAType,
    priority: row.priority as CAPAPriority,
    status: row.status as CAPAStatus,
    effectivenessCheck: Boolean(row.effectiveness_check),
  }));
}

export function createCAPA(ctx: SafetyContext, input: CAPAInput): CAPAItem {
  const actor = ctx.requireManage();
  const _companyId = ctx.currentCompanyId(actor);
  if (!input.title?.trim()) throw new Error('عنوان الإجراء مطلوب.');
  if (!input.description?.trim()) throw new Error('وصف الإجراء مطلوب.');
  const capaCode = `CAPA-${localDateString().slice(0, 7)}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
  const id = `capa_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  ctx.db.run(
    `INSERT INTO facility_capa
       (id, capa_code, source_type, source_id, source_title, title, description,
        action_type, priority, assigned_employee_id, due_date, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?)`,
    [id, capaCode, input.sourceType, input.sourceId, input.sourceTitle,
      input.title.trim(), input.description.trim(), input.actionType,
      input.priority, input.assignedEmployeeId || null,
      input.dueDate || null, actor.id]
  );
  ctx.auditActor(actor, 'إضافة إجراء CAPA', id, {
    capaCode, title: input.title, actionType: input.actionType, priority: input.priority,
  });
  return getCAPAItem(ctx, id)!;
}

function getCAPAItem(ctx: SafetyContext, id: string): CAPAItem | null {
  const items = getCAPA(ctx).filter((i) => i.id === id);
  return items[0] ?? null;
}

export function updateCAPAStatus(ctx: SafetyContext, id: string, status: CAPAStatus, effectivenessNotes?: string | null): CAPAItem {
  const actor = ctx.requireManage();
  const companyId = ctx.currentCompanyId(actor);
  const existing = ctx.db.query<{ id: string; status: CAPAStatus }>(
    'SELECT id, status FROM facility_capa WHERE id = ? AND company_id = ?',
    [id, companyId]
  )[0];
  if (!existing) throw new Error('إجراء CAPA غير موجود.');
  const updates: string[] = [];
  const params: (string | number | null)[] = [];
  const setField = (column: string, value: string | number | null | undefined) => {
    if (value !== undefined) { updates.push(`${column} = ?`); params.push(value); }
  };
  setField('status', status || null);
  setField('effectiveness_notes', effectivenessNotes || null);
  if (status === 'COMPLETED' || status === 'VERIFIED' || status === 'CLOSED') {
    updates.push('completed_at = ?');
    params.push(localDateString());
    if (status === 'VERIFIED') {
      updates.push('effectiveness_check = ?');
      params.push(1);
    }
  }
  if (!updates.length) throw new Error('لا توجد بيانات للتعديل.');
  updates.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);
  ctx.db.run(`UPDATE facility_capa SET ${updates.join(', ')} WHERE id = ?`, params);
  ctx.auditActor(actor, 'تعديل إجراء CAPA', id, { status, effectivenessNotes });
  return getCAPAItem(ctx, id)!;
}
