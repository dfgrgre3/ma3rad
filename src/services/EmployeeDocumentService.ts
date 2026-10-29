import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../database/db';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { BranchAccessService } from './BranchAccessService';
import { ModuleRegistryService } from './ModuleRegistryService';
import { localDateString } from '../utils/date';
import type { User } from '../types/identity';
import type {
  CreateEmployeeDocumentDTO,
  EmployeeDocument,
  EmployeeDocumentFilters,
  EmployeeDocumentSummary,
  HrDocumentType,
  UpdateEmployeeDocumentDTO,
} from '../types/hrDocument';

const DOCUMENT_TYPES: HrDocumentType[] = ['IDENTITY', 'CONTRACT', 'CERTIFICATE', 'MEDICAL', 'EDUCATION', 'OTHER'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CONFIDENTIALITY = ['INTERNAL', 'RESTRICTED', 'CONFIDENTIAL'] as const;

function assertDate(value: string | null | undefined, label: string): void {
  if (!value) return;
  if (!DATE_PATTERN.test(value) || Number.isNaN(new Date(`${value}T00:00:00`).getTime())) {
    throw new Error(`${label} غير صالح. استخدم الصيغة YYYY-MM-DD.`);
  }
}

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00`);
  parsed.setDate(parsed.getDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export class EmployeeDocumentService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();

  private require(permission: string): User {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, permission);
    return actor;
  }

  private guardWrites(): void {
    ModuleRegistryService.assertModuleEnabled('hr');
  }

  private decorate(document: EmployeeDocument): EmployeeDocument {
    if (document.status !== 'ACTIVE' || !document.expiresAt) {
      return { ...document, effectiveStatus: document.status };
    }
    const today = localDateString();
    if (document.expiresAt < today) return { ...document, effectiveStatus: 'EXPIRED' };
    const cutoff = new Date(`${today}T00:00:00`);
    cutoff.setDate(cutoff.getDate() + 30);
    if (document.expiresAt <= cutoff.toISOString().slice(0, 10)) {
      return { ...document, effectiveStatus: 'EXPIRING' };
    }
    return { ...document, effectiveStatus: 'ACTIVE' };
  }

  private queryDocument(actor: User, id: string): EmployeeDocument | null {
    const scope = this.branchAccess.sqlScope('d.branch_id', undefined, actor);
    const row = this.db.query<EmployeeDocument>(
      `SELECT d.*, e.name AS employee_name, b.name AS branch_name
       FROM employee_documents d
       JOIN employees e ON e.id = d.employee_id
       LEFT JOIN branches b ON b.id = d.branch_id
       WHERE d.id = ? AND ${scope.clause}`,
      [id, ...scope.params]
    )[0];
    return row ? this.decorate(row) : null;
  }

  private requireDocument(actor: User, id: string): EmployeeDocument {
    const document = this.queryDocument(actor, id);
    if (!document) throw new Error('مستند الموظف غير موجود أو ليس لديك صلاحية الوصول إليه.');
    return document;
  }

  private requireEmployeeBranch(employeeId: string, actor: User): { branchId: string; name: string } {
    const employee = this.db.query<{ branchId: string | null; name: string }>(
      `SELECT branch_id AS branchId, name FROM employees WHERE id = ?`,
      [employeeId]
    )[0];
    if (!employee) throw new Error('الموظف المحدد غير موجود.');
    if (!employee.branchId) throw new Error('الموظف غير مرتبط بفرع.');
    this.branchAccess.requireBranchAccess(employee.branchId, actor);
    return { branchId: employee.branchId, name: employee.name };
  }

  public getDocuments(filters: EmployeeDocumentFilters = {}): EmployeeDocument[] {
    const actor = this.require('hr.documents.view');
    const scope = this.branchAccess.sqlScope('d.branch_id', undefined, actor);
    const conditions = [scope.clause];
    const params: Array<string | number> = [...scope.params];

    if (filters.employeeId) {
      conditions.push('d.employee_id = ?');
      params.push(filters.employeeId);
    }
    if (filters.documentType && filters.documentType !== 'ALL') {
      conditions.push('d.document_type = ?');
      params.push(filters.documentType);
    }
    if (filters.status && filters.status !== 'ALL') {
      conditions.push('d.status = ?');
      params.push(filters.status);
    }
    if (filters.expiringWithinDays !== undefined) {
      const cutoff = addDays(localDateString(), filters.expiringWithinDays);
      conditions.push("d.status = 'ACTIVE' AND d.expires_at IS NOT NULL AND d.expires_at <= ?");
      params.push(cutoff);
    }

    return this.db.query<EmployeeDocument>(
      `SELECT d.*, e.name AS employee_name, b.name AS branch_name
       FROM employee_documents d
       JOIN employees e ON e.id = d.employee_id
       LEFT JOIN branches b ON b.id = d.branch_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY CASE WHEN d.expires_at IS NULL THEN 1 ELSE 0 END, d.expires_at, d.created_at DESC`,
      params
    ).map((row) => this.decorate(row));
  }

  public getDocument(id: string): EmployeeDocument {
    const actor = this.require('hr.documents.view');
    return this.requireDocument(actor, id);
  }

  public createDocument(input: CreateEmployeeDocumentDTO): EmployeeDocument {
    this.guardWrites();
    const actor = this.require('hr.documents.manage');
    if (!input.employeeId) throw new Error('يجب اختيار الموظف.');
    if (!input.title?.trim()) throw new Error('عنوان المستند مطلوب.');
    const documentType = input.documentType || 'OTHER';
    if (!DOCUMENT_TYPES.includes(documentType)) throw new Error('نوع المستند غير صالح.');
    const confidentiality = input.confidentiality || 'INTERNAL';
    if (!CONFIDENTIALITY.includes(confidentiality)) throw new Error('مستوى السرية غير صالح.');
    assertDate(input.issuedAt, 'تاريخ الإصدار');
    assertDate(input.expiresAt, 'تاريخ الانتهاء');
    if (input.issuedAt && input.expiresAt && input.expiresAt < input.issuedAt) {
      throw new Error('تاريخ الانتهاء يجب أن يكون بعد تاريخ الإصدار.');
    }

    const employee = this.requireEmployeeBranch(input.employeeId, actor);
    const id = `empdoc_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO employee_documents (
         id, employee_id, branch_id, document_type, title, document_number, issued_at,
         expires_at, status, confidentiality, notes, created_by, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?)`,
      [
        id, input.employeeId, employee.branchId, documentType, input.title.trim(),
        input.documentNumber?.trim() || null, input.issuedAt || null, input.expiresAt || null,
        confidentiality, input.notes?.trim() || null, actor.id, now, now,
      ]
    );
    this.audit('إضافة مستند موظف', id, { employeeId: input.employeeId, title: input.title.trim(), documentType });
    return this.requireDocument(actor, id);
  }

  public updateDocument(id: string, patch: UpdateEmployeeDocumentDTO): EmployeeDocument {
    this.guardWrites();
    const actor = this.require('hr.documents.manage');
    const existing = this.requireDocument(actor, id);
    if (existing.status === 'ARCHIVED') throw new Error('لا يمكن تعديل مستند مؤرشف.');

    if (patch.documentType && !DOCUMENT_TYPES.includes(patch.documentType)) throw new Error('نوع المستند غير صالح.');
    if (patch.title !== undefined && !patch.title.trim()) throw new Error('عنوان المستند مطلوب.');
    if (patch.confidentiality && !CONFIDENTIALITY.includes(patch.confidentiality)) throw new Error('مستوى السرية غير صالح.');
    assertDate(patch.issuedAt, 'تاريخ الإصدار');
    assertDate(patch.expiresAt, 'تاريخ الانتهاء');

    const issuedAt = patch.issuedAt === undefined ? existing.issuedAt : patch.issuedAt;
    const expiresAt = patch.expiresAt === undefined ? existing.expiresAt : patch.expiresAt;
    if (issuedAt && expiresAt && expiresAt < issuedAt) {
      throw new Error('تاريخ الانتهاء يجب أن يكون بعد تاريخ الإصدار.');
    }

    this.db.run(
      `UPDATE employee_documents SET
         document_type = COALESCE(?, document_type),
         title = COALESCE(?, title),
         document_number = COALESCE(?, document_number),
         issued_at = COALESCE(?, issued_at),
         expires_at = COALESCE(?, expires_at),
         confidentiality = COALESCE(?, confidentiality),
         notes = COALESCE(?, notes),
         updated_at = ?
       WHERE id = ?`,
      [
        patch.documentType ?? null, patch.title?.trim() || null, patch.documentNumber?.trim() || null,
        patch.issuedAt ?? null, patch.expiresAt ?? null, patch.confidentiality ?? null,
        patch.notes?.trim() || null, new Date().toISOString(), id,
      ]
    );
    this.audit('تعديل مستند موظف', id, patch);
    return this.requireDocument(actor, id);
  }

  public archiveDocument(id: string, note?: string): EmployeeDocument {
    this.guardWrites();
    const actor = this.require('hr.documents.manage');
    const existing = this.requireDocument(actor, id);
    if (existing.status === 'ARCHIVED') throw new Error('المستند مؤرشف بالفعل.');

    this.db.run(
      `UPDATE employee_documents SET status = 'ARCHIVED', notes = COALESCE(?, notes), updated_at = ? WHERE id = ?`,
      [note?.trim() || existing.notes, new Date().toISOString(), id]
    );
    this.audit('أرشفة مستند موظف', id, { note: note || null });
    return this.requireDocument(actor, id);
  }

  public getSummary(employeeId?: string): EmployeeDocumentSummary {
    const rows = this.getDocuments(employeeId ? { employeeId } : {});
    const summary: EmployeeDocumentSummary = { active: 0, expiring: 0, expired: 0, archived: 0 };
    for (const row of rows) {
      if (row.status === 'ARCHIVED') summary.archived += 1;
      else if (row.effectiveStatus === 'EXPIRED') summary.expired += 1;
      else if (row.expiresAt && row.expiresAt <= addDays(localDateString(), 30)) summary.expiring += 1;
      else summary.active += 1;
    }
    return summary;
  }

  private audit(action: string, recordId: string, values?: unknown): void {
    const actor = AuthService.requireAuth();
    this.db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
       VALUES (?, ?, ?, ?, 'HR', ?, ?)`,
      [
        `aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, action, recordId,
        values === undefined ? null : JSON.stringify(values),
      ]
    );
  }
}
