import { v4 as uuidv4 } from 'uuid';
import { localDateString } from '../../../../utils/shared/date';
import type { SafetyContext } from './context';
import { isValidDate } from './helpers';
import type {
  InspectionChecklist,
  InspectionChecklistInput,
  InspectionChecklistItem,
  InspectionRecord,
  InspectionRecordInput,
  InspectionRecordItem,
  InspectionResult,
} from './types';

/* ========== Inspection Checklists ========== */

export function getInspectionChecklists(ctx: SafetyContext): InspectionChecklist[] {
  const actor = ctx.requireView();
  const companyId = ctx.currentCompanyId(actor);
  const scope = ctx.branchAccess.sqlScope('ic.branch_id', undefined, actor);
  const rows = ctx.db.query<any>(
    `SELECT ic.id, ic.checklist_code AS checklistCode, ic.checklist_name AS checklistName,
            ic.category, ic.applicable_location_types AS applicableLocationTypes,
            ic.is_active AS isActive,
            COUNT(ici.id) AS itemCount,
            ic.created_by AS createdBy, u.full_name AS createdByName,
            ic.created_at AS createdAt, ic.updated_at AS updatedAt
     FROM facility_inspection_checklists ic
     LEFT JOIN facility_inspection_checklist_items ici ON ici.checklist_id = ic.id AND ici.is_active = 1
     LEFT JOIN users u ON u.id = ic.created_by
     WHERE ic.company_id = ? AND ${scope.clause}
     GROUP BY ic.id
     ORDER BY ic.checklist_name`,
    [companyId, ...scope.params]
  );
  return rows.map((row) => ({
    ...row,
    isActive: Boolean(row.isActive),
    itemCount: Number(row.itemCount) || 0,
  }));
}

export function createInspectionChecklist(ctx: SafetyContext, input: InspectionChecklistInput): InspectionChecklist {
  const actor = ctx.requireManage();
  const _companyId = ctx.currentCompanyId(actor);
  if (!input.checklistName?.trim()) throw new Error('اسم قائمة التفتيش مطلوب.');
  if (!input.items || !input.items.length) throw new Error('يجب إضافة بند واحد على الأقل.');
  const checklistCode = `CHK-${localDateString().slice(0, 7)}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
  const id = `chk_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  const now = new Date().toISOString();
  ctx.db.executeTransaction((db) => {
    db.run(
      `INSERT INTO facility_inspection_checklists
         (id, checklist_code, checklist_name, category, applicable_location_types,
          is_active, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, checklistCode, input.checklistName.trim(), input.category,
        input.applicableLocationTypes || 'ALL',
        input.isActive !== false ? 1 : 0, actor.id, now, now]
    );
    for (const item of input.items) {
      if (!item.itemCode?.trim() || !item.itemName?.trim()) continue;
      db.run(
        `INSERT INTO facility_inspection_checklist_items
           (id, checklist_id, item_code, item_name, item_description,
            is_critical, sort_order, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [`chki_${uuidv4().replace(/-/g, '').slice(0, 14)}`, id, item.itemCode.trim(),
          item.itemName.trim(), item.itemDescription || null,
          item.isCritical ? 1 : 0, item.sortOrder ?? 0, 1]
      );
    }
    ctx.auditDB(db, actor, 'إضافة قائمة تفتيش', id, {
      checklistName: input.checklistName, itemCount: input.items.length,
    });
  });
  return getInspectionChecklist(ctx, id)!;
}

function getInspectionChecklist(ctx: SafetyContext, id: string): InspectionChecklist | null {
  const lists = getInspectionChecklists(ctx).filter((l) => l.id === id);
  return lists[0] ?? null;
}

export function getInspectionChecklistItems(ctx: SafetyContext, checklistId: string): InspectionChecklistItem[] {
  const actor = ctx.requireView();
  const companyId = ctx.currentCompanyId(actor);
  const scope = ctx.branchAccess.sqlScope('ic.branch_id', undefined, actor);
  return ctx.db.query<any>(
    `SELECT ici.id, ici.item_code AS itemCode, ici.item_name AS itemName,
            ici.item_description AS itemDescription, ici.is_critical AS isCritical,
            ici.sort_order AS sortOrder, ici.is_active AS isActive
     FROM facility_inspection_checklist_items ici
     JOIN facility_inspection_checklists ic ON ic.id = ici.checklist_id
     WHERE ici.checklist_id = ? AND ic.company_id = ? AND ${scope.clause}
     ORDER BY ici.sort_order`,
    [checklistId, companyId, ...scope.params]
  ).map((row) => ({
    ...row,
    isCritical: Boolean(row.isCritical),
    isActive: Boolean(row.isActive),
  }));
}

/* ========== Inspection Records ========== */

export function getInspectionRecords(ctx: SafetyContext): InspectionRecord[] {
  const actor = ctx.requireView();
  const companyId = ctx.currentCompanyId(actor);
  const scope = ctx.branchAccess.sqlScope('ir.branch_id', undefined, actor);
  const rows = ctx.db.query<any>(
    `SELECT ir.id, ir.checklist_id AS checklistId, ic.checklist_name AS checklistName,
            ir.location_id AS locationId, fl.name AS locationName,
            ir.branch_id AS branchId, b.name AS branchName,
            ir.asset_id AS assetId, fa.name AS assetName,
            ir.inspection_date AS inspectionDate, ir.inspector_id AS inspectorId,
            e.name AS inspectorName, ir.overall_result AS overallResult,
            ir.total_items AS totalItems, ir.passed_items AS passedItems,
            ir.failed_items AS failedItems, ir.observations,
            ir.next_inspection_date AS nextInspectionDate, ir.status,
            ir.created_at AS createdAt, ir.updated_at AS updatedAt
     FROM facility_inspection_records ir
     JOIN facility_inspection_checklists ic ON ic.id = ir.checklist_id
     JOIN facility_locations fl ON fl.id = ir.location_id
     JOIN branches b ON b.id = ir.branch_id
     LEFT JOIN facility_assets fa ON fa.id = ir.asset_id
     LEFT JOIN employees e ON e.id = ir.inspector_id
     WHERE ir.company_id = ? AND ${scope.clause}
     ORDER BY ir.inspection_date DESC`,
    [companyId, ...scope.params]
  );
  return rows.map((row) => ({
    ...row,
    overallResult: row.overall_result as InspectionResult,
    status: row.status as 'OPEN' | 'CLOSED',
    items: getInspectionRecordItems(ctx, row.id),
  }));
}

function getInspectionRecordItems(ctx: SafetyContext, recordId: string): InspectionRecordItem[] {
  return ctx.db.query<any>(
    `SELECT id, checklist_item_id AS checklistItemId, item_name AS itemName,
            result, observation, corrective_action AS correctiveAction,
            due_date AS dueDate
     FROM facility_inspection_record_items
     WHERE inspection_record_id = ?
     ORDER BY id`,
    [recordId]
  );
}

export function createInspectionRecord(ctx: SafetyContext, input: InspectionRecordInput): InspectionRecord {
  const actor = ctx.requireManage();
  const companyId = ctx.currentCompanyId(actor);
  const checklist = ctx.db.query<{ id: string }>(
    'SELECT id FROM facility_inspection_checklists WHERE id = ? AND company_id = ?',
    [input.checklistId, companyId]
  )[0];
  if (!checklist) throw new Error('قائمة التفتيش غير موجودة.');
  const location = ctx.db.query<{ id: string; name: string; branch_id: string }>(
    'SELECT id, name, branch_id AS branchId FROM facility_locations WHERE id = ?',
    [input.locationId]
  )[0];
  if (!location) throw new Error('الموقع غير موجود.');
  if (input.assetId) {
    const asset = ctx.db.query<{ id: string }>(
      'SELECT id FROM facility_assets WHERE id = ? AND location_id = ?',
      [input.assetId, input.locationId]
    )[0];
    if (!asset) throw new Error('الأصل المحدد لا يتبع الموقع المختار.');
  }
  if (!isValidDate(input.inspectionDate)) throw new Error('تاريخ التفتيش غير صالح.');
  const items = input.items;
  const totalItems = items.length;
  const passedItems = items.filter((i) => i.result === 'PASS').length;
  const failedItems = items.filter((i) => i.result === 'FAIL').length;
  let overallResult: InspectionResult = input.overallResult;
  if (failedItems > 0) overallResult = 'FAIL';
  else if (items.some((i) => i.result === 'N_A') && passedItems === 0) overallResult = 'OBSERVATION';
  const id = `insp_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  ctx.db.executeTransaction((db) => {
    db.run(
      `INSERT INTO facility_inspection_records
         (id, checklist_id, location_id, branch_id, asset_id, inspection_date,
          inspector_id, inspector_name, overall_result, total_items, passed_items,
          failed_items, observations, next_inspection_date, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?)`,
      [id, input.checklistId, input.locationId, location.branch_id,
        input.assetId || null, input.inspectionDate, input.inspectorId,
        '', overallResult, totalItems, passedItems, failedItems,
        input.observations || null, input.nextInspectionDate || null, actor.id]
    );
    for (const item of items) {
      db.run(
        `INSERT INTO facility_inspection_record_items
           (id, inspection_record_id, checklist_item_id, item_name, result,
            observation, corrective_action, due_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [`inspi_${uuidv4().replace(/-/g, '').slice(0, 14)}`, id,
          item.checklistItemId, item.itemName, item.result,
          item.observation || null, item.correctiveAction || null, item.dueDate || null]
      );
    }
    ctx.auditDB(db, actor, 'إضافة سجل تفتيش', id, {
      checklistId: input.checklistId, locationId: input.locationId,
      overallResult, totalItems, passedItems, failedItems,
    });
  });
  return getInspectionRecord(ctx, id)!;
}

function getInspectionRecord(ctx: SafetyContext, id: string): InspectionRecord | null {
  const records = getInspectionRecords(ctx).filter((r) => r.id === id);
  return records[0] ?? null;
}

export function closeInspectionRecord(ctx: SafetyContext, id: string): InspectionRecord {
  const actor = ctx.requireManage();
  const companyId = ctx.currentCompanyId(actor);
  const existing = ctx.db.query<{ id: string; status: string }>(
    'SELECT id, status FROM facility_inspection_records WHERE id = ? AND company_id = ?',
    [id, companyId]
  )[0];
  if (!existing) throw new Error('سجل التفتيش غير موجود.');
  if (existing.status === 'CLOSED') throw new Error('سجل التفتيش مغلق مسبقاً.');
  ctx.db.run(
    `UPDATE facility_inspection_records SET status = 'CLOSED', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [id]
  );
  ctx.auditActor(actor, 'إغلاق سجل تفتيش', id, {});
  return getInspectionRecord(ctx, id)!;
}
