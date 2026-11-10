import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import { localDateString } from '../../../utils/shared/date';
import type { User } from '../../../types/auth/identity';
import type {
  CreateEmployeeDocumentDTO,
  EmployeeDocument,
  EmployeeDocumentAuditEntry,
  EmployeeDocumentFilters,
  EmployeeDocumentSummary,
  EmployeeDocumentVersion,
  EmployeeDocumentVersionInput,
  HrDocumentType,
  UpdateEmployeeDocumentDTO,
} from '../../../types/hr/document';

const DOCUMENT_TYPES: HrDocumentType[] = ['IDENTITY', 'CONTRACT', 'CERTIFICATE', 'MEDICAL', 'EDUCATION', 'OTHER'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CONFIDENTIALITY = ['INTERNAL', 'RESTRICTED', 'CONFIDENTIAL'] as const;

function assertDate(value: string | null | undefined, label: string): void {
  if (!value) return;
  const match = DATE_PATTERN.exec(value);
  if (!match) {
    throw new Error(`${label} غير صالح. استخدم الصيغة YYYY-MM-DD.`);
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`${label} غير صالح. استخدم الصيغة YYYY-MM-DD.`);
  }
}

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00`);
  parsed.setDate(parsed.getDate() + days);
  return localDateString(parsed);
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

  private canSeeConfidentiality(actor: User, confidentiality: string): boolean {
    if (confidentiality === 'INTERNAL') {
      return PermissionService.canAny(actor, [
        'hr.documents.view', 'hr.documents.manage',
        'hr.documents.restricted.view', 'hr.documents.confidential.view',
      ]);
    }
    if (confidentiality === 'RESTRICTED') {
      return PermissionService.canAny(actor, [
        'hr.documents.manage', 'hr.documents.restricted.view', 'hr.documents.confidential.view',
      ]);
    }
    return PermissionService.canAny(actor, ['hr.documents.manage', 'hr.documents.confidential.view']);
  }

  private confidentialityCondition(actor: User): { clause: string; params: string[] } {
    const levels: string[] = [];
    if (PermissionService.canAny(actor, [
      'hr.documents.view', 'hr.documents.manage',
      'hr.documents.restricted.view', 'hr.documents.confidential.view',
    ])) levels.push('INTERNAL');
    if (PermissionService.canAny(actor, [
      'hr.documents.manage', 'hr.documents.restricted.view', 'hr.documents.confidential.view',
    ])) levels.push('RESTRICTED');
    if (PermissionService.canAny(actor, ['hr.documents.manage', 'hr.documents.confidential.view'])) levels.push('CONFIDENTIAL');
    return {
      clause: levels.length ? `d.confidentiality IN (${levels.map(() => '?').join(', ')})` : '1 = 0',
      params: levels,
    };
  }

  private documentSelect(): string {
    return `SELECT d.id, d.employee_id AS employeeId, e.name AS employeeName,
       d.branch_id AS branchId, b.name AS branchName, d.document_type AS documentType,
       d.title, d.document_number AS documentNumber, d.issued_at AS issuedAt,
       d.expires_at AS expiresAt, d.status, d.confidentiality, d.notes,
       d.created_by AS createdBy, creator.full_name AS createdByName,
       d.created_at AS createdAt, d.updated_at AS updatedAt,
       d.updated_by AS updatedBy, editor.full_name AS updatedByName,
       (SELECT COUNT(*) FROM employee_document_versions vc WHERE vc.document_id = d.id) AS versionCount,
       v.id AS latestVersionId, v.version_number AS latestVersionNumber,
       v.file_name AS latestFileName, v.mime_type AS latestMimeType,
       v.file_size AS latestFileSize, uploader.full_name AS latestUploaderName
       FROM employee_documents d
       JOIN employees e ON e.id = d.employee_id
       LEFT JOIN branches b ON b.id = d.branch_id
       LEFT JOIN users editor ON editor.id = d.updated_by
       LEFT JOIN users creator ON creator.id = d.created_by
       LEFT JOIN employee_document_versions v ON v.document_id = d.id
         AND v.version_number = (SELECT MAX(vm.version_number)
           FROM employee_document_versions vm WHERE vm.document_id = d.id)
       LEFT JOIN users uploader ON uploader.id = v.created_by`;
  }

  private decorate(document: EmployeeDocument): EmployeeDocument {
    if (document.status !== 'ACTIVE' || !document.expiresAt) {
      return { ...document, effectiveStatus: document.status };
    }
    const today = localDateString();
    if (document.expiresAt < today) return { ...document, effectiveStatus: 'EXPIRED' };
    const cutoff = addDays(today, 30);
    if (document.expiresAt <= cutoff) {
      return { ...document, effectiveStatus: 'EXPIRING' };
    }
    return { ...document, effectiveStatus: 'ACTIVE' };
  }

  private queryDocument(actor: User, id: string): EmployeeDocument | null {
    const scope = this.branchAccess.sqlScope('d.branch_id', undefined, actor);
    const row = this.db.query<EmployeeDocument>(
      `${this.documentSelect()}
       WHERE d.id = ? AND ${scope.clause}`,
      [id, ...scope.params]
    )[0];
    return row && this.canSeeConfidentiality(actor, row.confidentiality)
      ? this.decorate(row)
      : null;
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

  private validateVersionInput(input: EmployeeDocumentVersionInput): EmployeeDocumentVersionInput {
    const fileName = input.fileName?.trim();
    if (!fileName || fileName.length > 255 || fileName.includes('/') || fileName.includes('\\')
      || Array.from(fileName).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
      throw new Error('اسم الملف غير صالح.');
    }
    const mimeType = input.mimeType?.toLowerCase();
    const allowedMimeTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (!mimeType || !allowedMimeTypes.includes(mimeType)) throw new Error('يسمح فقط بملفات PDF والصور المدعومة.');
    if (!Number.isInteger(input.fileSize) || input.fileSize <= 0 || input.fileSize > 25 * 1024 * 1024) {
      throw new Error('حجم الملف غير صالح أو يتجاوز 25 ميجابايت.');
    }
    if (!/^[a-f0-9]{64}$/i.test(input.checksum || '')) throw new Error('بصمة الملف غير صالحة.');
    if (!/^hrdoc_[a-f0-9]{32}\.(pdf|png|jpg|jpeg|webp|gif)$/i.test(input.storageName || '')) {
      throw new Error('معرّف الملف المخزن غير صالح.');
    }
    const extension = fileName.split('.').pop()?.toLowerCase();
    const expectedExtensions: Record<string, string[]> = {
      'application/pdf': ['pdf'],
      'image/png': ['png'],
      'image/jpeg': ['jpg', 'jpeg'],
      'image/webp': ['webp'],
      'image/gif': ['gif'],
    };
    if (!extension || !expectedExtensions[mimeType]?.includes(extension)
      || !input.storageName.toLowerCase().endsWith(`.${extension}`)) {
      throw new Error('امتداد الملف لا يطابق نوع محتواه.');
    }
    return { ...input, fileName, mimeType, checksum: input.checksum.toLowerCase() };
  }

  public getDocuments(filters: EmployeeDocumentFilters = {}): EmployeeDocument[] {
    const actor = AuthService.requireAuth();
    PermissionService.requireAny(actor, ['hr.documents.view', 'hr.documents.manage']);
    const scope = this.branchAccess.sqlScope('d.branch_id', undefined, actor);
    const confidentiality = this.confidentialityCondition(actor);
    const conditions = [scope.clause, confidentiality.clause];
    const params: Array<string | number> = [...scope.params, ...confidentiality.params];

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
      `${this.documentSelect()}
       WHERE ${conditions.join(' AND ')}
       ORDER BY CASE WHEN d.expires_at IS NULL THEN 1 ELSE 0 END, d.expires_at, d.created_at DESC`,
      params
    ).map((row) => this.decorate(row));
  }

  public getDocument(id: string): EmployeeDocument {
    const actor = AuthService.requireAuth();
    PermissionService.requireAny(actor, ['hr.documents.view', 'hr.documents.manage']);
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
    const attachment = input.attachment ? this.validateVersionInput(input.attachment) : null;

    const employee = this.requireEmployeeBranch(input.employeeId, actor);
    const id = `empdoc_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();
    this.db.executeTransaction((tx) => {
      tx.run(
        `INSERT INTO employee_documents (
           id, employee_id, branch_id, document_type, title, document_number, issued_at,
           expires_at, status, confidentiality, notes, created_by, created_at, updated_at, updated_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?)`,
        [
          id, input.employeeId, employee.branchId, documentType, input.title.trim(),
          input.documentNumber?.trim() || null, input.issuedAt || null, input.expiresAt || null,
          confidentiality, input.notes?.trim() || null, actor.id, now, now, actor.id,
        ]
      );
      if (attachment) {
        tx.run(
          `INSERT INTO employee_document_versions
           (id, document_id, version_number, file_name, mime_type, file_size, checksum,
            storage_name, notes, created_by, created_at)
           VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            `empdocv_${uuidv4().replace(/-/g, '').slice(0, 16)}`, id, attachment.fileName,
            attachment.mimeType, attachment.fileSize, attachment.checksum, attachment.storageName,
            input.attachmentNotes?.trim() || null, actor.id, now,
          ]
        );
      }
    });
    this.audit('إضافة مستند موظف', id, { employeeId: input.employeeId, title: input.title.trim(), documentType });
    if (attachment) this.audit('رفع نسخة مستند موظف', id, {
      fileName: attachment.fileName, fileSize: attachment.fileSize, checksum: attachment.checksum,
    });
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

    const fields: Array<[keyof UpdateEmployeeDocumentDTO, string, unknown]> = [
      ['documentType', 'document_type', patch.documentType],
      ['title', 'title', patch.title?.trim()],
      ['documentNumber', 'document_number', patch.documentNumber?.trim() || null],
      ['issuedAt', 'issued_at', patch.issuedAt],
      ['expiresAt', 'expires_at', patch.expiresAt],
      ['confidentiality', 'confidentiality', patch.confidentiality],
      ['notes', 'notes', patch.notes?.trim() || null],
    ];
    const changes = fields.filter(([key]) => patch[key] !== undefined);
    if (changes.length) {
      this.db.run(
        `UPDATE employee_documents SET
           ${changes.map(([, column]) => `${column} = ?`).join(', ')},
           updated_at = ?, updated_by = ?
         WHERE id = ?`,
        [...changes.map(([, , value]) => value), new Date().toISOString(), actor.id, id]
      );
    }
    this.audit('تعديل مستند موظف', id, { previous: existing, changes: patch });
    return this.requireDocument(actor, id);
  }

  public archiveDocument(id: string, note?: string): EmployeeDocument {
    this.guardWrites();
    const actor = this.require('hr.documents.manage');
    const existing = this.requireDocument(actor, id);
    if (existing.status === 'ARCHIVED') throw new Error('المستند مؤرشف بالفعل.');

    this.db.run(
      `UPDATE employee_documents SET status = 'ARCHIVED', notes = ?, updated_at = ?, updated_by = ? WHERE id = ?`,
      [note?.trim() || existing.notes, new Date().toISOString(), actor.id, id]
    );
    this.audit('أرشفة مستند موظف', id, { note: note || null });
    return this.requireDocument(actor, id);
  }

  public addVersion(documentId: string, input: EmployeeDocumentVersionInput, notes?: string | null): EmployeeDocumentVersion {
    this.guardWrites();
    const actor = this.require('hr.documents.manage');
    const document = this.requireDocument(actor, documentId);
    if (document.status === 'ARCHIVED') throw new Error('لا يمكن إضافة نسخة إلى مستند مؤرشف.');
    const attachment = this.validateVersionInput(input);

    const id = `empdocv_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();
    const versionNumber = this.db.executeTransaction((tx) => {
      const currentVersion = tx.query<{ versionNumber: number }>(
        `SELECT COALESCE(MAX(version_number), 0) AS versionNumber
         FROM employee_document_versions WHERE document_id = ?`,
        [documentId]
      )[0]?.versionNumber || 0;
      const next = currentVersion + 1;
      tx.run(
        `INSERT INTO employee_document_versions
         (id, document_id, version_number, file_name, mime_type, file_size, checksum,
          storage_name, notes, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, documentId, next, attachment.fileName, attachment.mimeType, attachment.fileSize,
          attachment.checksum, attachment.storageName,
          notes?.trim() || null, actor.id, now,
        ]
      );
      tx.run(
        'UPDATE employee_documents SET updated_at = ?, updated_by = ? WHERE id = ?',
        [now, actor.id, documentId]
      );
      return next;
    });
    this.audit('رفع نسخة مستند موظف', documentId, {
      versionId: id, versionNumber, fileName: attachment.fileName,
      fileSize: attachment.fileSize, checksum: attachment.checksum,
    });
    return this.db.query<EmployeeDocumentVersion>(
      `SELECT v.id, v.document_id AS documentId, v.version_number AS versionNumber,
       v.file_name AS fileName, v.mime_type AS mimeType, v.file_size AS fileSize,
       v.checksum, v.storage_name AS storageName, v.notes, v.created_by AS createdBy,
       u.full_name AS createdByName, v.created_at AS createdAt
       FROM employee_document_versions v LEFT JOIN users u ON u.id = v.created_by
       WHERE v.id = ?`,
      [id]
    )[0];
  }

  public getVersions(documentId: string): EmployeeDocumentVersion[] {
    const actor = AuthService.requireAuth();
    PermissionService.requireAny(actor, ['hr.documents.view', 'hr.documents.manage']);
    this.requireDocument(actor, documentId);
    return this.db.query<EmployeeDocumentVersion>(
      `SELECT v.id, v.document_id AS documentId, v.version_number AS versionNumber,
       v.file_name AS fileName, v.mime_type AS mimeType, v.file_size AS fileSize,
       v.checksum, v.storage_name AS storageName, v.notes, v.created_by AS createdBy,
       u.full_name AS createdByName, v.created_at AS createdAt
       FROM employee_document_versions v LEFT JOIN users u ON u.id = v.created_by
       WHERE v.document_id = ? ORDER BY v.version_number DESC`,
      [documentId]
    );
  }

  public getAuditHistory(documentId: string): EmployeeDocumentAuditEntry[] {
    const actor = AuthService.requireAuth();
    PermissionService.requireAny(actor, ['hr.documents.view', 'hr.documents.manage']);
    this.requireDocument(actor, documentId);
    return this.db.query<EmployeeDocumentAuditEntry>(
      `SELECT id, user_name AS userName, action, old_values AS oldValues,
       new_values AS newValues, created_at AS createdAt
       FROM audit_logs WHERE module = 'HR' AND record_id = ?
       ORDER BY created_at DESC LIMIT 100`,
      [documentId]
    );
  }

  public getVersionForAccess(
    documentId: string,
    versionId: string,
    action: 'OPEN' | 'DOWNLOAD',
  ): EmployeeDocumentVersion {
    const actor = AuthService.requireAuth();
    PermissionService.requireAny(actor, action === 'DOWNLOAD'
      ? ['hr.documents.download', 'ui.hr.documents.documents.download', 'hr.documents.manage']
      : ['hr.documents.view', 'hr.documents.manage']);
    this.requireDocument(actor, documentId);
    const version = this.db.query<EmployeeDocumentVersion>(
      `SELECT v.id, v.document_id AS documentId, v.version_number AS versionNumber,
       v.file_name AS fileName, v.mime_type AS mimeType, v.file_size AS fileSize,
       v.checksum, v.storage_name AS storageName, v.notes, v.created_by AS createdBy,
       u.full_name AS createdByName, v.created_at AS createdAt
       FROM employee_document_versions v LEFT JOIN users u ON u.id = v.created_by
       WHERE v.id = ? AND v.document_id = ?`,
      [versionId, documentId]
    )[0];
    if (!version) throw new Error('نسخة المستند غير موجودة.');
    this.audit(action === 'OPEN' ? 'فتح نسخة مستند موظف' : 'تنزيل نسخة مستند موظف',
      documentId, { versionId, versionNumber: version.versionNumber });
    return version;
  }

  public isVersionStorageAttached(storageName: string): boolean {
    const actor = this.require('hr.documents.manage');
    const scope = this.branchAccess.sqlScope('d.branch_id', undefined, actor);
    return this.db.query<{ id: string }>(
      `SELECT v.id FROM employee_document_versions v
       JOIN employee_documents d ON d.id = v.document_id
       WHERE v.storage_name = ? AND ${scope.clause} LIMIT 1`,
      [storageName, ...scope.params]
    ).length > 0;
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
