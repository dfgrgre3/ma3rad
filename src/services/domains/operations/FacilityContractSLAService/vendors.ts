import { v4 as uuidv4 } from 'uuid';
import {
  branchAccess,
  currentCompanyId,
  db,
  requireManage,
  requireView,
  auditActor,
} from './shared';
import type {
  FacilityServiceCategory,
  FacilityServiceVendor,
  FacilityServiceVendorInput,
} from './types';

export function getServiceVendors(category?: FacilityServiceCategory): FacilityServiceVendor[] {
  const actor = requireView();
  const companyId = currentCompanyId(actor);
  const conditions: string[] = ['fsv.company_id = ?'];
  const params: (string | number)[] = [companyId];
  if (category) {
    conditions.push('fsv.service_categories = ?');
    params.push(category);
  }
  const scope = branchAccess.sqlScope('fsv.branch_id', undefined, actor);
  conditions.push(scope.clause);
  params.push(...scope.params);

  const rows = db.query<any>(
    `SELECT fsv.id, fsv.supplier_id AS supplierId, s.name AS supplierName,
            fsv.company_id AS companyId, fsv.service_categories AS serviceCategories,
            fsv.contact_name AS contactName, fsv.contact_phone AS contactPhone,
            fsv.contact_email AS contactEmail, fsv.tax_number AS taxNumber,
            fsv.commercial_record AS commercialRecord, fsv.address,
            fsv.payment_terms_days AS paymentTermsDays, fsv.rating,
            fsv.total_contracts AS totalContracts, fsv.active_contracts AS activeContracts,
            fsv.is_preferred AS isPreferred, fsv.is_active AS isActive,
            fsv.notes, fsv.created_by AS createdBy, u.full_name AS createdByName,
            fsv.created_at AS createdAt, fsv.updated_at AS updatedAt
     FROM facility_service_vendors fsv
     JOIN suppliers s ON s.id = fsv.supplier_id
     LEFT JOIN users u ON u.id = fsv.created_by
     WHERE fsv.company_id = ? AND ${conditions.slice(1).join(' AND ')}
     ORDER BY fsv.is_preferred DESC, fsv.rating DESC, s.name`,
    params
  );
  return rows.map((row) => ({
    ...row,
    serviceCategories: row.serviceCategories ? [row.serviceCategories] : [],
    isActive: Boolean(row.isActive),
    isPreferred: Boolean(row.isPreferred),
  }));
}

export function createServiceVendor(input: FacilityServiceVendorInput): FacilityServiceVendor {
  const actor = requireManage();
  const companyId = currentCompanyId(actor);
  const supplier = db.query<{ id: string; name: string }>(
    'SELECT id, name FROM suppliers WHERE id = ?',
    [input.supplierId]
  )[0];
  if (!supplier) throw new Error('المورد غير موجود.');
  if (!input.serviceCategories || !input.serviceCategories.length) {
    throw new Error('يجب تحديد فئة خدمة واحدة على الأقل.');
  }

  const id = `fsv_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO facility_service_vendors
       (id, supplier_id, company_id, service_categories, contact_name,
        contact_phone, contact_email, tax_number, commercial_record, address,
        payment_terms_days, rating, total_contracts, active_contracts,
        is_preferred, is_active, notes, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, ?, ?)`,
    [id, input.supplierId, companyId, input.serviceCategories[0],
      input.contactName || null, input.contactPhone || null, input.contactEmail || null,
      input.taxNumber || null, input.commercialRecord || null, input.address || null,
      input.paymentTermsDays ?? 30, input.isPreferred ? 1 : 0,
      input.isActive !== false ? 1 : 0, input.notes || null, actor.id, now, now]
  );
  auditActor(actor, 'إضافة مورد خدمة منشأة', id, {
    supplierId: input.supplierId, supplierName: supplier.name,
    serviceCategories: input.serviceCategories,
  });
  return getServiceVendor(id)!;
}

export function getServiceVendor(vendorId: string): FacilityServiceVendor | null {
  const actor = requireView();
  const companyId = currentCompanyId(actor);
  const scope = branchAccess.sqlScope('fsv.branch_id', undefined, actor);
  const row = db.query<any>(
    `SELECT fsv.id, fsv.supplier_id AS supplierId, s.name AS supplierName,
            fsv.company_id AS companyId, fsv.service_categories AS serviceCategories,
            fsv.contact_name AS contactName, fsv.contact_phone AS contactPhone,
            fsv.contact_email AS contactEmail, fsv.tax_number AS taxNumber,
            fsv.commercial_record AS commercialRecord, fsv.address,
            fsv.payment_terms_days AS paymentTermsDays, fsv.rating,
            fsv.total_contracts AS totalContracts, fsv.active_contracts AS activeContracts,
            fsv.is_preferred AS isPreferred, fsv.is_active AS isActive,
            fsv.notes, fsv.created_by AS createdBy, u.full_name AS createdByName,
            fsv.created_at AS createdAt, fsv.updated_at AS updatedAt
     FROM facility_service_vendors fsv
     JOIN suppliers s ON s.id = fsv.supplier_id
     LEFT JOIN users u ON u.id = fsv.created_by
     WHERE fsv.id = ? AND fsv.company_id = ? AND ${scope.clause}`,
    [vendorId, companyId, ...scope.params]
  )[0];
  if (!row) return null;
  return {
    ...row,
    serviceCategories: row.serviceCategories ? [row.serviceCategories] : [],
    isActive: Boolean(row.isActive),
    isPreferred: Boolean(row.isPreferred),
  };
}

export function updateServiceVendor(vendorId: string, input: Partial<FacilityServiceVendorInput>): FacilityServiceVendor {
  const actor = requireManage();
  const companyId = currentCompanyId(actor);
  const vendor = db.query<{ id: string }>(
    'SELECT id FROM facility_service_vendors WHERE id = ? AND company_id = ?',
    [vendorId, companyId]
  )[0];
  if (!vendor) throw new Error('المورد غير موجود.');
  const updates: string[] = [];
  const params: (string | number | null)[] = [];
  const setField = (column: string, value: string | number | null | undefined) => {
    if (value !== undefined) { updates.push(`${column} = ?`); params.push(value); }
  };
  setField('service_categories', input.serviceCategories?.[0] || null);
  setField('contact_name', input.contactName || null);
  setField('contact_phone', input.contactPhone || null);
  setField('contact_email', input.contactEmail || null);
  setField('tax_number', input.taxNumber || null);
  setField('commercial_record', input.commercialRecord || null);
  setField('address', input.address || null);
  setField('payment_terms_days', input.paymentTermsDays !== undefined ? input.paymentTermsDays : undefined);
  setField('is_preferred', input.isPreferred !== undefined ? (input.isPreferred ? 1 : 0) : undefined);
  setField('is_active', input.isActive !== undefined ? (input.isActive ? 1 : 0) : undefined);
  setField('notes', input.notes || null);
  if (!updates.length) throw new Error('لا توجد بيانات للتعديل.');
  updates.push('updated_at = CURRENT_TIMESTAMP');
  params.push(vendorId);
  db.run(`UPDATE facility_service_vendors SET ${updates.join(', ')} WHERE id = ?`, params);
  auditActor(actor, 'تعديل مورد خدمة منشأة', vendorId, input);
  return getServiceVendor(vendorId)!;
}
