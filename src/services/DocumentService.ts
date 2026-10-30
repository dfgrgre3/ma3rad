import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../database/db';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { BranchAccessService } from './BranchAccessService';
import { ModuleRegistryService } from './ModuleRegistryService';
import { ApprovalService } from './ApprovalService';
import { AuditService } from './AuditService';
import { localDateString } from '../utils/date';
import type { User } from '../types';
import type {
  ContractEffectiveStatus,
  ContractFilters,
  ContractPartyType,
  ContractStatus,
  CreateContractDTO,
  CreateDocumentDTO,
  CreateDocumentVersionDTO,
  DocumentCompanyOption,
  DocumentConfidentiality,
  DocumentFilters,
  DocumentModuleSummary,
  DocumentStatus,
  EnterpriseContract,
  EnterpriseDocument,
  EnterpriseDocumentVersion,
  UpdateContractDTO,
  UpdateDocumentDTO,
} from '../types/documents';

const DOCUMENT_STATUSES: DocumentStatus[] = ['DRAFT', 'ACTIVE', 'ARCHIVED'];
const CONFIDENTIALITY: DocumentConfidentiality[] = ['INTERNAL', 'RESTRICTED', 'CONFIDENTIAL'];
const PARTY_TYPES: ContractPartyType[] = ['CUSTOMER', 'SUPPLIER', 'EMPLOYEE', 'OTHER'];
const CONTRACT_STATUSES: ContractStatus[] = ['DRAFT', 'ACTIVE', 'TERMINATED'];

const NUMBER_PATTERN = /^[A-Z0-9][A-Z0-9_/-]{1,39}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const STORAGE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

const MODULE_ID = 'documents';

function nowIso(): string {
  return new Date().toISOString();
}

function newId(prefix: string): string {
  return `${prefix}_${uuidv4().replace(/-/g, '').slice(0, 20)}`;
}

function requireText(value: unknown, label: string, min = 1, max = 200): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length < min || text.length > max) {
    throw new Error(`${label} مطلوب (${min} إلى ${max} حرفًا).`);
  }
  if (/[\u0000-\u001f]/.test(text)) throw new Error(`${label} يحتوي على رموز غير صالحة.`);
  return text;
}

function optionalText(value: unknown, label: string, max = 2000): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new Error(`${label} غير صالح.`);
  const text = value.trim();
  if (text.length > max) throw new Error(`${label} يتجاوز الحد المسموح (${max} حرفًا).`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) {
    throw new Error(`${label} يحتوي على رموز غير صالحة.`);
  }
  return text || null;
}

function optionalDate(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    throw new Error(`${label} يجب أن يكون تاريخًا بصيغة YYYY-MM-DD.`);
  }
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed)) throw new Error(`${label} غير صالح.`);
  return value;
}

function requiredDate(value: unknown, label: string): string {
  const parsed = optionalDate(value, label);
  if (!parsed) throw new Error(`${label} مطلوب.`);
  return parsed;
}

function toEpochDay(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function effectiveContractStatus(row: { status: ContractStatus; startDate: string; endDate: string; renewalNoticeDays: number }, today: string): ContractEffectiveStatus {
  if (row.status === 'TERMINATED') return 'TERMINATED';
  if (row.status === 'DRAFT') return 'DRAFT';
  if (row.endDate < today) return 'EXPIRED';
  if (row.startDate > today) return 'SCHEDULED';
  const days = toEpochDay(row.endDate) - toEpochDay(today);
  return days <= Number(row.renewalNoticeDays || 0) ? 'EXPIRING' : 'ACTIVE';
}

function daysBetween(from: string, to: string): number {
  return toEpochDay(to) - toEpochDay(from);
}

interface NormalizedVersion {
  fileName: string;
  mimeType: string | null;
  fileSize: number | null;
  checksum: string | null;
  storageName: string | null;
  notes: string | null;
}

/**
 * Central document and contract registry.
 *
 * Security and integrity rules enforced here (not only in the UI):
 * - `documents.view/create/update/archive` and `contracts.*` permissions;
 * - explicit company ownership plus branch filtering derived from the user's
 *   accessible branches, so records cannot leak between legal entities;
 * - module lifecycle guard for every mutation;
 * - immutable version rows: a version is only ever appended, never rewritten;
 * - append-only event history and audit entries for material actions.
 */
export class DocumentService {
  private db = DatabaseManager.getInstance();
  private access = new BranchAccessService();

  // ─── Scope helpers ─────────────────────────────────────────────────────────

  private companyScope(alias: string, actor: User): { clause: string; params: string[] } {
    const companies = this.access.getAccessibleCompanyIds(actor);
    if (companies === null) return { clause: '1 = 1', params: [] };
    if (!companies.length) return { clause: '1 = 0', params: [] };
    return {
      clause: `${alias}.company_id IN (${companies.map(() => '?').join(', ')})`,
      params: companies,
    };
  }

  private branchScope(alias: string, actor: User): { clause: string; params: string[] } {
    const selected = this.access.sqlScope(`${alias}.branch_id`, undefined, actor);
    return {
      clause: `(${alias}.branch_id IS NULL OR ${selected.clause})`,
      params: selected.params,
    };
  }

  private assertCompany(companyId: string, actor: User): void {
    const company = this.db.query<{ id: string; isActive: number }>(
      'SELECT id, is_active AS isActive FROM companies WHERE id = ?',
      [companyId]
    )[0];
    if (!company) throw new Error('الشركة المحددة غير موجودة.');
    if (Number(company.isActive) !== 1) throw new Error('لا يمكن تسجيل مستندات أو عقود على شركة معطلة.');
    this.access.requireCompanyAccess(companyId, actor);
  }

  private assertBranch(branchId: string | null | undefined, companyId: string, actor: User): string | null {
    if (!branchId) return null;
    const branch = this.db.query<{ id: string; companyId: string | null; isActive: number }>(
      'SELECT id, company_id AS companyId, is_active AS isActive FROM branches WHERE id = ?',
      [branchId]
    )[0];
    if (!branch) throw new Error('الفرع المحدد غير موجود.');
    if (Number(branch.isActive) !== 1) throw new Error('لا يمكن ربط المستند بفرع معطل.');
    if ((branch.companyId || null) !== companyId) {
      throw new Error('الفرع لا يتبع الشركة المحددة.');
    }
    this.access.requireBranchAccess(branchId, actor);
    return branchId;
  }

  private assertUser(userId: string | null | undefined): string | null {
    if (!userId) return null;
    const user = this.db.query<{ id: string; isActive: number }>(
      'SELECT id, is_active AS isActive FROM users WHERE id = ?',
      [userId]
    )[0];
    if (!user) throw new Error('المستخدم المسؤول غير موجود.');
    if (Number(user.isActive) !== 1) throw new Error('لا يمكن إسناد المستند لمستخدم معطل.');
    return userId;
  }

  private recordEvent(
    entityType: 'DOCUMENT' | 'CONTRACT',
    entityId: string,
    action: string,
    actor: User,
    details?: Record<string, unknown>
  ): void {
    this.db.run(
      `INSERT INTO enterprise_document_events
         (id, entity_type, entity_id, action, actor_id, actor_name, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId('dev'),
        entityType,
        entityId,
        action,
        actor.id,
        actor.fullName,
        details ? JSON.stringify(details) : null,
        nowIso(),
      ]
    );
  }

  private audit(action: string, module: string, recordId: string, actor: User, before?: unknown, after?: unknown): void {
    try {
      new AuditService().log({
        userId: actor.id,
        userName: actor.fullName,
        action,
        module,
        recordId,
        oldValues: before === undefined ? undefined : JSON.stringify(before),
        newValues: after === undefined ? undefined : JSON.stringify(after),
      });
    } catch {
      // Audit must never block a validated business transaction.
    }
  }

  // ─── Company options ───────────────────────────────────────────────────────

  /** Companies the current user may file documents against. Does not require `companies.view`. */
  public getCompanyOptions(): DocumentCompanyOption[] {
    const actor = AuthService.requireAuth();
    if (!PermissionService.can(actor, 'documents.view') && !PermissionService.can(actor, 'contracts.view')) {
      throw new Error('ليس لديك صلاحية الوصول إلى المستندات أو العقود.');
    }
    const companies = this.access.getAccessibleCompanyIds(actor);
    const filter =
      companies === null
        ? { clause: '1 = 1', params: [] as string[] }
        : companies.length
          ? { clause: `c.id IN (${companies.map(() => '?').join(', ')})`, params: companies }
          : { clause: '1 = 0', params: [] as string[] };
    return this.db.query<DocumentCompanyOption>(
      `SELECT c.id, c.code, c.name
       FROM companies c
       WHERE c.is_active = 1 AND ${filter.clause}
       ORDER BY c.name`,
      filter.params
    );
  }

  // ─── Documents ─────────────────────────────────────────────────────────────

  public getDocuments(filters: DocumentFilters = {}): { documents: EnterpriseDocument[]; total: number } {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'documents.view');

    const conditions: string[] = [];
    const params: Array<string | number> = [];
    const company = this.companyScope('d', actor);
    const branch = this.branchScope('d', actor);
    conditions.push(company.clause, branch.clause);
    params.push(...company.params, ...branch.params);

    if (filters.companyId) {
      this.access.requireCompanyAccess(filters.companyId, actor);
      conditions.push('d.company_id = ?');
      params.push(filters.companyId);
    }
    if (filters.branchId) {
      this.access.requireBranchAccess(filters.branchId, actor);
      conditions.push('d.branch_id = ?');
      params.push(filters.branchId);
    }
    if (filters.status && filters.status !== 'ALL') {
      if (!DOCUMENT_STATUSES.includes(filters.status)) throw new Error('حالة المستند غير صالحة.');
      conditions.push('d.status = ?');
      params.push(filters.status);
    }
    if (filters.category) {
      conditions.push('d.category = ?');
      params.push(filters.category);
    }
    if (filters.search) {
      const term = `%${filters.search.trim()}%`;
      conditions.push('(d.title LIKE ? OR d.document_number LIKE ? OR d.description LIKE ?)');
      params.push(term, term, term);
    }
    if (filters.expiringWithinDays !== undefined) {
      const days = Math.max(0, Math.min(Math.trunc(Number(filters.expiringWithinDays)) || 0, 3650));
      const today = localDateString();
      const limit = new Date(`${today}T00:00:00Z`);
      limit.setUTCDate(limit.getUTCDate() + days);
      conditions.push('d.expires_at IS NOT NULL AND d.expires_at >= ? AND d.expires_at <= ?');
      params.push(today, limit.toISOString().slice(0, 10));
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const total = Number(this.db.query<{ total: number }>(
      `SELECT COUNT(*) AS total FROM enterprise_documents d ${where}`,
      params
    )[0]?.total || 0);

    const page = Math.max(1, Math.trunc(Number(filters.page)) || 1);
    const pageSize = Math.max(1, Math.min(Math.trunc(Number(filters.pageSize)) || 50, 200));
    const rows = this.db.query<any>(
      `SELECT d.*, c.name AS companyName, b.name AS branchName,
              u.full_name AS ownerName
       FROM enterprise_documents d
       JOIN companies c ON c.id = d.company_id
       LEFT JOIN branches b ON b.id = d.branch_id
       LEFT JOIN users u ON u.id = d.owner_user_id
       ${where}
       ORDER BY d.updated_at DESC, d.id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize]
    );

    return { documents: rows.map((row) => this.mapDocument(row)), total };
  }

  public getDocument(id: string): EnterpriseDocument {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'documents.view');
    const row = this.db.query<any>(
      `SELECT d.*, c.name AS companyName, b.name AS branchName,
              u.full_name AS ownerName
       FROM enterprise_documents d
       JOIN companies c ON c.id = d.company_id
       LEFT JOIN branches b ON b.id = d.branch_id
       LEFT JOIN users u ON u.id = d.owner_user_id
       WHERE d.id = ?`,
      [id]
    )[0];
    if (!row) throw new Error('المستند غير موجود.');
    this.access.requireCompanyAccess(row.company_id, actor);
    if (row.branch_id) this.access.requireBranchAccess(row.branch_id, actor);

    const document = this.mapDocument(row);
    document.versions = this.db.query<any>(
      `SELECT v.*, u.full_name AS createdByName
       FROM enterprise_document_versions v
       LEFT JOIN users u ON u.id = v.created_by
       WHERE v.document_id = ?
       ORDER BY v.version_number DESC`,
      [id]
    ).map((version) => this.mapVersion(version));
    return document;
  }

  public createDocument(dto: CreateDocumentDTO): EnterpriseDocument {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'documents.create');
    ModuleRegistryService.assertModuleEnabled(MODULE_ID);

    if (!dto.companyId) throw new Error('الشركة مطلوبة.');
    this.assertCompany(dto.companyId, actor);
    const branchId = this.assertBranch(dto.branchId, dto.companyId, actor);
    const title = requireText(dto.title, 'عنوان المستند', 2, 200);
    const category = requireText(dto.category || 'GENERAL', 'تصنيف المستند', 2, 60).toUpperCase();
    const description = optionalText(dto.description, 'وصف المستند', 4000);
    const confidentiality = dto.confidentiality || 'INTERNAL';
    if (!CONFIDENTIALITY.includes(confidentiality)) throw new Error('درجة السرية غير صالحة.');
    const expiresAt = optionalDate(dto.expiresAt, 'تاريخ انتهاء المستند');
    const ownerUserId = this.assertUser(dto.ownerUserId);
    const initialVersion = dto.initialVersion ? this.normalizeVersion(dto.initialVersion) : null;

    const documentNumber = dto.documentNumber
      ? this.normalizeNumber(dto.documentNumber, 'رقم المستند')
      : null;

    const id = newId('doc');
    const now = nowIso();

    this.db.executeTransaction((tx) => {
      const number = documentNumber || tx.nextNumber('DOC');
      this.assertUniqueDocumentNumber(dto.companyId, number);
      tx.run(
        `INSERT INTO enterprise_documents
           (id, company_id, branch_id, document_number, title, category, description, status,
            confidentiality, owner_user_id, current_version, expires_at, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, 0, ?, ?, ?, ?)`,
        [
          id,
          dto.companyId,
          branchId,
          number,
          title,
          category,
          description,
          confidentiality,
          ownerUserId,
          expiresAt,
          actor.id,
          now,
          now,
        ]
      );
      if (initialVersion) {
        this.insertVersion(id, 1, initialVersion, actor);
        tx.run('UPDATE enterprise_documents SET current_version = 1 WHERE id = ?', [id]);
      }
      this.recordEvent('DOCUMENT', id, 'CREATED', actor, { documentNumber: number, title, category });
    });

    this.audit('إضافة مستند', 'DOCUMENTS', id, actor, undefined, {
      documentNumber: documentNumber || '(auto)',
      title,
      companyId: dto.companyId,
    });
    return this.getDocument(id);
  }

  public updateDocument(id: string, patch: UpdateDocumentDTO): EnterpriseDocument {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'documents.update');
    ModuleRegistryService.assertModuleEnabled(MODULE_ID);

    const before = this.getDocument(id);
    if (before.status === 'ARCHIVED') {
      throw new Error('لا يمكن تعديل مستند مؤرشف. استعده أولًا.');
    }

    const next = {
      title: patch.title === undefined ? before.title : requireText(patch.title, 'عنوان المستند', 2, 200),
      category: patch.category === undefined
        ? before.category
        : requireText(patch.category, 'تصنيف المستند', 2, 60).toUpperCase(),
      description: patch.description === undefined
        ? before.description
        : optionalText(patch.description, 'وصف المستند', 4000),
      confidentiality: patch.confidentiality === undefined ? before.confidentiality : patch.confidentiality,
      ownerUserId: patch.ownerUserId === undefined ? before.ownerUserId : this.assertUser(patch.ownerUserId),
      expiresAt: patch.expiresAt === undefined ? before.expiresAt : optionalDate(patch.expiresAt, 'تاريخ انتهاء المستند'),
    };
    if (!CONFIDENTIALITY.includes(next.confidentiality)) throw new Error('درجة السرية غير صالحة.');

    this.db.executeTransaction((tx) => {
      tx.run(
        `UPDATE enterprise_documents SET
           title = ?, category = ?, description = ?, confidentiality = ?,
           owner_user_id = ?, expires_at = ?, updated_at = ?
         WHERE id = ?`,
        [
          next.title,
          next.category,
          next.description,
          next.confidentiality,
          next.ownerUserId,
          next.expiresAt,
          nowIso(),
          id,
        ]
      );
      this.recordEvent('DOCUMENT', id, 'UPDATED', actor, {
        before: {
          title: before.title,
          category: before.category,
          confidentiality: before.confidentiality,
          ownerUserId: before.ownerUserId,
          expiresAt: before.expiresAt,
        },
        after: next,
      });
    });

    this.audit('تعديل مستند', 'DOCUMENTS', id, actor, before, next);
    return this.getDocument(id);
  }

  public addDocumentVersion(id: string, dto: CreateDocumentVersionDTO): EnterpriseDocument {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'documents.update');
    ModuleRegistryService.assertModuleEnabled(MODULE_ID);

    const document = this.getDocument(id);
    if (document.status === 'ARCHIVED') {
      throw new Error('لا يمكن إضافة نسخة إلى مستند مؤرشف. استعده أولًا.');
    }
    const version = this.normalizeVersion(dto);

    this.db.executeTransaction((tx) => {
      const max = Number(tx.query<{ max: number | null }>(
        'SELECT MAX(version_number) AS max FROM enterprise_document_versions WHERE document_id = ?',
        [id]
      )[0]?.max || 0);
      const nextVersion = Math.max(max, document.currentVersion) + 1;
      this.insertVersion(id, nextVersion, version, actor);
      tx.run('UPDATE enterprise_documents SET current_version = ?, updated_at = ? WHERE id = ?', [
        nextVersion,
        nowIso(),
        id,
      ]);
      this.recordEvent('DOCUMENT', id, 'VERSION_ADDED', actor, {
        versionNumber: nextVersion,
        fileName: version.fileName,
      });
    });

    this.audit('إضافة نسخة مستند', 'DOCUMENTS', id, actor, { currentVersion: document.currentVersion }, {
      fileName: version.fileName,
    });
    return this.getDocument(id);
  }

  public setDocumentStatus(id: string, status: DocumentStatus): EnterpriseDocument {
    const actor = AuthService.requireAuth();
    if (!DOCUMENT_STATUSES.includes(status)) throw new Error('حالة المستند غير صالحة.');
    ModuleRegistryService.assertModuleEnabled(MODULE_ID);
    const before = this.getDocument(id);
    if (before.status === status) return before;

    const allowed: Record<DocumentStatus, DocumentStatus[]> = {
      DRAFT: ['ACTIVE', 'ARCHIVED'],
      ACTIVE: ['ARCHIVED'],
      ARCHIVED: ['ACTIVE'],
    };
    if (!allowed[before.status].includes(status)) {
      throw new Error(`لا يمكن الانتقال من حالة ${before.status} إلى ${status}.`);
    }

    const archiving = status === 'ARCHIVED' || before.status === 'ARCHIVED';
    PermissionService.require(actor, archiving ? 'documents.archive' : 'documents.update');

    this.db.executeTransaction((tx) => {
      tx.run('UPDATE enterprise_documents SET status = ?, updated_at = ? WHERE id = ?', [status, nowIso(), id]);
      this.recordEvent('DOCUMENT', id, status === 'ARCHIVED' ? 'ARCHIVED' : 'STATUS_CHANGED', actor, {
        from: before.status,
        to: status,
      });
    });
    this.audit(status === 'ARCHIVED' ? 'أرشفة مستند' : 'تغيير حالة مستند', 'DOCUMENTS', id, actor, {
      status: before.status,
    }, { status });
    return this.getDocument(id);
  }

  private assertUniqueDocumentNumber(companyId: string, number: string): void {
    const existing = this.db.query<{ id: string }>(
      'SELECT id FROM enterprise_documents WHERE company_id = ? AND document_number = ?',
      [companyId, number]
    )[0];
    if (existing) throw new Error(`رقم المستند ${number} مستخدم بالفعل في هذه الشركة.`);
  }

  private normalizeNumber(value: string, label: string): string {
    const number = String(value || '').trim().toUpperCase();
    if (!NUMBER_PATTERN.test(number)) {
      throw new Error(`${label} يجب أن يكون 2 إلى 40 حرفًا إنجليزيًا أو رقميًا (A-Z, 0-9, -, _, /).`);
    }
    return number;
  }

  private normalizeVersion(dto: CreateDocumentVersionDTO): NormalizedVersion {
    const fileName = requireText(dto.fileName, 'اسم الملف', 1, 255);
    const mimeType = optionalText(dto.mimeType, 'نوع الملف', 120);
    const notes = optionalText(dto.notes, 'ملاحظات النسخة', 2000);
    let fileSize: number | null = null;
    if (dto.fileSize !== undefined && dto.fileSize !== null) {
      const size = Number(dto.fileSize);
      if (!Number.isFinite(size) || size < 0 || size > MAX_ATTACHMENT_BYTES || !Number.isInteger(size)) {
        throw new Error('حجم الملف غير صالح أو يتجاوز 25 ميجابايت.');
      }
      fileSize = size;
    }
    let checksum: string | null = null;
    if (dto.checksum) {
      checksum = String(dto.checksum).trim().toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(checksum)) throw new Error('بصمة الملف (SHA-256) غير صالحة.');
    }
    let storageName: string | null = null;
    if (dto.storageName) {
      storageName = String(dto.storageName).trim();
      if (!STORAGE_NAME_PATTERN.test(storageName) || storageName.includes('..')) {
        throw new Error('مسار تخزين الملف غير صالح.');
      }
    }
    if (storageName && fileSize === null) {
      throw new Error('بيانات الملف غير مكتملة: الحجم مطلوب مع الملف المرفق.');
    }
    return { fileName, mimeType, fileSize, checksum, storageName, notes };
  }

  private insertVersion(documentId: string, versionNumber: number, version: NormalizedVersion, actor: User): void {
    this.db.run(
      `INSERT INTO enterprise_document_versions
         (id, document_id, version_number, file_name, mime_type, file_size, checksum, storage_name, notes, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId('dver'),
        documentId,
        versionNumber,
        version.fileName,
        version.mimeType,
        version.fileSize,
        version.checksum,
        version.storageName,
        version.notes,
        actor.id,
        nowIso(),
      ]
    );
  }

  private mapDocument(row: any): EnterpriseDocument {
    return {
      id: row.id,
      companyId: row.company_id ?? row.companyId,
      companyName: row.companyName ?? row.company_name ?? null,
      branchId: row.branch_id ?? row.branchId ?? null,
      branchName: row.branchName ?? row.branch_name ?? null,
      documentNumber: row.document_number ?? row.documentNumber,
      title: row.title,
      category: row.category,
      description: row.description ?? null,
      status: row.status,
      confidentiality: row.confidentiality,
      ownerUserId: row.owner_user_id ?? row.ownerUserId ?? null,
      ownerName: row.ownerName ?? row.owner_name ?? null,
      currentVersion: Number(row.current_version ?? row.currentVersion ?? 0),
      expiresAt: row.expires_at ?? row.expiresAt ?? null,
      createdBy: row.created_by ?? row.createdBy ?? null,
      createdAt: row.created_at ?? row.createdAt,
      updatedAt: row.updated_at ?? row.updatedAt,
    };
  }

  private mapVersion(row: any): EnterpriseDocumentVersion {
    return {
      id: row.id,
      documentId: row.document_id ?? row.documentId,
      versionNumber: Number(row.version_number ?? row.versionNumber),
      fileName: row.file_name ?? row.fileName,
      mimeType: row.mime_type ?? row.mimeType ?? null,
      fileSize: row.file_size === null || row.file_size === undefined ? null : Number(row.file_size),
      checksum: row.checksum ?? null,
      storageName: row.storage_name ?? row.storageName ?? null,
      notes: row.notes ?? null,
      createdBy: row.created_by ?? row.createdBy ?? null,
      createdByName: row.createdByName ?? row.created_by_name ?? null,
      createdAt: row.created_at ?? row.createdAt,
    };
  }

  // ─── Contracts ─────────────────────────────────────────────────────────────

  public getContracts(filters: ContractFilters = {}): { contracts: EnterpriseContract[]; total: number } {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'contracts.view');
    const today = localDateString();

    const conditions: string[] = [];
    const params: Array<string | number> = [];
    const company = this.companyScope('ct', actor);
    const branch = this.branchScope('ct', actor);
    conditions.push(company.clause, branch.clause);
    params.push(...company.params, ...branch.params);

    if (filters.companyId) {
      this.access.requireCompanyAccess(filters.companyId, actor);
      conditions.push('ct.company_id = ?');
      params.push(filters.companyId);
    }
    if (filters.partyType) {
      if (!PARTY_TYPES.includes(filters.partyType)) throw new Error('نوع الطرف غير صالح.');
      conditions.push('ct.party_type = ?');
      params.push(filters.partyType);
    }
    if (filters.search) {
      const term = `%${filters.search.trim()}%`;
      conditions.push('(ct.title LIKE ? OR ct.contract_number LIKE ? OR ct.party_name LIKE ?)');
      params.push(term, term, term);
    }
    if (filters.status && filters.status !== 'ALL') {
      const status = filters.status;
      if (status === 'DRAFT' || status === 'TERMINATED') {
        conditions.push('ct.status = ?');
        params.push(status);
      } else if (status === 'EXPIRED') {
        conditions.push("ct.status = 'ACTIVE' AND ct.end_date < ?");
        params.push(today);
      } else if (status === 'SCHEDULED') {
        conditions.push("ct.status = 'ACTIVE' AND ct.start_date > ?");
        params.push(today);
      } else if (status === 'ACTIVE' || status === 'EXPIRING') {
        conditions.push("ct.status = 'ACTIVE' AND ct.start_date <= ? AND ct.end_date >= ?");
        params.push(today, today);
        const comparator = status === 'EXPIRING' ? '<=' : '>';
        conditions.push(`ct.end_date ${comparator} date(?, '+' || ct.renewal_notice_days || ' days')`);
        params.push(today);
      } else {
        throw new Error('حالة العقد غير صالحة.');
      }
    }
    if (filters.expiringWithinDays !== undefined) {
      const days = Math.max(0, Math.min(Math.trunc(Number(filters.expiringWithinDays)) || 0, 3650));
      const limit = new Date(`${today}T00:00:00Z`);
      limit.setUTCDate(limit.getUTCDate() + days);
      conditions.push("ct.status = 'ACTIVE' AND ct.end_date >= ? AND ct.end_date <= ?");
      params.push(today, limit.toISOString().slice(0, 10));
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const total = Number(this.db.query<{ total: number }>(
      `SELECT COUNT(*) AS total FROM enterprise_contracts ct ${where}`,
      params
    )[0]?.total || 0);

    const page = Math.max(1, Math.trunc(Number(filters.page)) || 1);
    const pageSize = Math.max(1, Math.min(Math.trunc(Number(filters.pageSize)) || 50, 200));
    const rows = this.db.query<any>(
      `SELECT ct.*, c.name AS companyName, u.full_name AS ownerName, d.title AS documentTitle
       FROM enterprise_contracts ct
       JOIN companies c ON c.id = ct.company_id
       LEFT JOIN users u ON u.id = ct.owner_user_id
       LEFT JOIN enterprise_documents d ON d.id = ct.document_id
       ${where}
       ORDER BY ct.end_date ASC, ct.id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize]
    );

    return { contracts: rows.map((row) => this.mapContract(row, today)), total };
  }

  public getContract(id: string): EnterpriseContract {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'contracts.view');
    const row = this.db.query<any>(
      `SELECT ct.*, c.name AS companyName, u.full_name AS ownerName, d.title AS documentTitle
       FROM enterprise_contracts ct
       JOIN companies c ON c.id = ct.company_id
       LEFT JOIN users u ON u.id = ct.owner_user_id
       LEFT JOIN enterprise_documents d ON d.id = ct.document_id
       WHERE ct.id = ?`,
      [id]
    )[0];
    if (!row) throw new Error('العقد غير موجود.');
    this.access.requireCompanyAccess(row.company_id, actor);
    if (row.branch_id) this.access.requireBranchAccess(row.branch_id, actor);
    return this.mapContract(row, localDateString());
  }

  public createContract(dto: CreateContractDTO): EnterpriseContract {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'contracts.create');
    ModuleRegistryService.assertModuleEnabled(MODULE_ID);

    if (!dto.companyId) throw new Error('الشركة مطلوبة.');
    this.assertCompany(dto.companyId, actor);
    const branchId = this.assertBranch(dto.branchId, dto.companyId, actor);
    const title = requireText(dto.title, 'عنوان العقد', 2, 200);
    const partyName = requireText(dto.partyName, 'اسم الطرف', 2, 200);
    const partyType = dto.partyType || 'OTHER';
    if (!PARTY_TYPES.includes(partyType)) throw new Error('نوع الطرف غير صالح.');
    const startDate = requiredDate(dto.startDate, 'تاريخ بداية العقد');
    const endDate = requiredDate(dto.endDate, 'تاريخ نهاية العقد');
    if (endDate <= startDate) throw new Error('تاريخ نهاية العقد يجب أن يكون بعد تاريخ البداية.');
    const value = dto.value === undefined ? 0 : Number(dto.value);
    if (!Number.isFinite(value) || value < 0) throw new Error('قيمة العقد غير صالحة.');
    const currency = (dto.currency || this.defaultCurrency(dto.companyId)).toUpperCase();
    if (!CURRENCY_PATTERN.test(currency)) throw new Error('عملة العقد يجب أن تكون 3 أحرف (مثال: EGP).');
    const renewalNoticeDays = dto.renewalNoticeDays === undefined ? 30 : Number(dto.renewalNoticeDays);
    if (!Number.isInteger(renewalNoticeDays) || renewalNoticeDays < 0 || renewalNoticeDays > 3650) {
      throw new Error('مدة التنبيه قبل التجديد يجب أن تكون بين 0 و3650 يومًا.');
    }
    const ownerUserId = this.assertUser(dto.ownerUserId);
    const documentId = this.assertContractDocument(dto.documentId, dto.companyId, actor);
    const notes = optionalText(dto.notes, 'ملاحظات العقد', 4000);
    const contractNumberInput = dto.contractNumber ? this.normalizeNumber(dto.contractNumber, 'رقم العقد') : null;

    const id = newId('ctr');
    const now = nowIso();
    let number = contractNumberInput || '';

    this.db.executeTransaction((tx) => {
      number = contractNumberInput || tx.nextNumber('CTR');
      const existing = tx.query<{ id: string }>(
        'SELECT id FROM enterprise_contracts WHERE company_id = ? AND contract_number = ?',
        [dto.companyId, number]
      )[0];
      if (existing) throw new Error(`رقم العقد ${number} مستخدم بالفعل في هذه الشركة.`);

      tx.run(
        `INSERT INTO enterprise_contracts
           (id, company_id, branch_id, contract_number, title, party_type, party_id, party_name,
            start_date, end_date, value, currency, status, auto_renew, renewal_notice_days,
            owner_user_id, document_id, notes, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          dto.companyId,
          branchId,
          number,
          title,
          partyType,
          dto.partyId || null,
          partyName,
          startDate,
          endDate,
          value,
          currency,
          dto.autoRenew ? 1 : 0,
          renewalNoticeDays,
          ownerUserId,
          documentId,
          notes,
          actor.id,
          now,
          now,
        ]
      );
      this.recordEvent('CONTRACT', id, 'CREATED', actor, { contractNumber: number, title, partyName });
    });

    this.audit('إضافة عقد', 'CONTRACTS', id, actor, undefined, {
      contractNumber: number,
      title,
      partyName,
      startDate,
      endDate,
      value,
    });
    return this.getContract(id);
  }

  public updateContract(id: string, patch: UpdateContractDTO): EnterpriseContract {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'contracts.update');
    ModuleRegistryService.assertModuleEnabled(MODULE_ID);
    const before = this.getContract(id);
    if (before.status === 'TERMINATED') throw new Error('لا يمكن تعديل عقد منتهٍ أو مفسوخ.');

    const startDate = patch.startDate === undefined ? before.startDate : requiredDate(patch.startDate, 'تاريخ بداية العقد');
    const endDate = patch.endDate === undefined ? before.endDate : requiredDate(patch.endDate, 'تاريخ نهاية العقد');
    if (endDate <= startDate) throw new Error('تاريخ نهاية العقد يجب أن يكون بعد تاريخ البداية.');
    const value = patch.value === undefined ? before.value : Number(patch.value);
    if (!Number.isFinite(value) || value < 0) throw new Error('قيمة العقد غير صالحة.');
    const currency = (patch.currency === undefined ? before.currency : String(patch.currency)).toUpperCase();
    if (!CURRENCY_PATTERN.test(currency)) throw new Error('عملة العقد يجب أن تكون 3 أحرف (مثال: EGP).');
    const renewalNoticeDays = patch.renewalNoticeDays === undefined ? before.renewalNoticeDays : Number(patch.renewalNoticeDays);
    if (!Number.isInteger(renewalNoticeDays) || renewalNoticeDays < 0 || renewalNoticeDays > 3650) {
      throw new Error('مدة التنبيه قبل التجديد يجب أن تكون بين 0 و3650 يومًا.');
    }
    const partyType = patch.partyType === undefined ? before.partyType : patch.partyType;
    if (!PARTY_TYPES.includes(partyType)) throw new Error('نوع الطرف غير صالح.');

    const next = {
      title: patch.title === undefined ? before.title : requireText(patch.title, 'عنوان العقد', 2, 200),
      partyType,
      partyId: patch.partyId === undefined ? before.partyId : (patch.partyId || null),
      partyName: patch.partyName === undefined ? before.partyName : requireText(patch.partyName, 'اسم الطرف', 2, 200),
      startDate,
      endDate,
      value,
      currency,
      autoRenew: patch.autoRenew === undefined ? before.autoRenew : Boolean(patch.autoRenew),
      renewalNoticeDays,
      ownerUserId: patch.ownerUserId === undefined ? before.ownerUserId : this.assertUser(patch.ownerUserId),
      documentId: patch.documentId === undefined
        ? before.documentId
        : this.assertContractDocument(patch.documentId, before.companyId, actor),
      notes: patch.notes === undefined ? before.notes : optionalText(patch.notes, 'ملاحظات العقد', 4000),
    };

    this.db.executeTransaction((tx) => {
      tx.run(
        `UPDATE enterprise_contracts SET
           title = ?, party_type = ?, party_id = ?, party_name = ?, start_date = ?, end_date = ?,
           value = ?, currency = ?, auto_renew = ?, renewal_notice_days = ?, owner_user_id = ?,
           document_id = ?, notes = ?, updated_at = ?
         WHERE id = ?`,
        [
          next.title,
          next.partyType,
          next.partyId,
          next.partyName,
          next.startDate,
          next.endDate,
          next.value,
          next.currency,
          next.autoRenew ? 1 : 0,
          next.renewalNoticeDays,
          next.ownerUserId,
          next.documentId,
          next.notes,
          nowIso(),
          id,
        ]
      );
      this.recordEvent('CONTRACT', id, 'UPDATED', actor, {
        before: {
          title: before.title,
          partyName: before.partyName,
          startDate: before.startDate,
          endDate: before.endDate,
          value: before.value,
          currency: before.currency,
        },
        after: next,
      });
    });
    this.audit('تعديل عقد', 'CONTRACTS', id, actor, before, next);
    return this.getContract(id);
  }

  public activateContract(id: string, effectiveFrom?: string): EnterpriseContract {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'contracts.update');
    ModuleRegistryService.assertModuleEnabled(MODULE_ID);
    const contract = this.getContract(id);
    if (contract.status !== 'DRAFT') throw new Error('يمكن تفعيل العقود المسودة فقط.');
    const today = localDateString();
    if (contract.endDate < today) throw new Error('لا يمكن تفعيل عقد انتهت مدته. حدّث تاريخ النهاية أولًا.');
    const startDate = effectiveFrom ? requiredDate(effectiveFrom, 'تاريخ سريان العقد') : contract.startDate;
    if (startDate >= contract.endDate) throw new Error('تاريخ السريان يجب أن يكون قبل تاريخ نهاية العقد.');

    this.db.executeTransaction((tx) => {
      tx.run(
        "UPDATE enterprise_contracts SET status = 'ACTIVE', start_date = ?, updated_at = ? WHERE id = ?",
        [startDate, nowIso(), id]
      );
      this.recordEvent('CONTRACT', id, 'ACTIVATED', actor, { startDate });
    });
    this.audit('تفعيل عقد', 'CONTRACTS', id, actor, { status: contract.status }, { status: 'ACTIVE', startDate });
    return this.getContract(id);
  }

  public requestActivationApproval(id: string, kind: 'DOCUMENT' | 'CONTRACT'): { approvalId: string; requestNumber: string } {
    const actor = AuthService.requireAuth();
    if (kind === 'DOCUMENT') {
      PermissionService.require(actor, 'documents.update');
    } else {
      PermissionService.require(actor, 'contracts.update');
    }
    ModuleRegistryService.assertModuleEnabled(MODULE_ID);
    ModuleRegistryService.assertModuleEnabled('approvals');

    let branchId: string | null = null;
    let title = '';
    if (kind === 'DOCUMENT') {
      const document = this.getDocument(id);
      if (!document) throw new Error('المستند غير موجود.');
      if (document.status !== 'DRAFT') throw new Error('يمكن طلب اعتماد المستندات المسودة فقط.');
      branchId = (document as any).branchId ?? null;
      title = `تفعيل مستند: ${document.title}`;
    } else {
      const contract = this.getContract(id);
      if (!contract) throw new Error('العقد غير موجود.');
      if (contract.status !== 'DRAFT') throw new Error('يمكن طلب اعتماد العقود المسودة فقط.');
      branchId = (contract as any).branchId ?? null;
      title = `تفعيل عقد: ${contract.title}`;
    }

    const approvals = new ApprovalService();
    const request = approvals.createRequest({
      requestType: 'OTHER',
      referenceType: kind,
      referenceId: id,
      title,
      description: `طلب اعتماد تفعيل ${kind === 'DOCUMENT' ? 'مستند' : 'عقد'} (${id})`,
      priority: 'NORMAL',
      branchId: branchId || undefined,
    });
    return { approvalId: request.id, requestNumber: request.requestNumber };
  }

  public terminateContract(id: string, reason: string): EnterpriseContract {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'contracts.terminate');
    ModuleRegistryService.assertModuleEnabled(MODULE_ID);
    const contract = this.getContract(id);
    if (contract.status !== 'ACTIVE') throw new Error('يمكن فسخ العقود السارية فقط.');
    const terminationReason = requireText(reason, 'سبب الفسخ', 3, 500);

    this.db.executeTransaction((tx) => {
      tx.run(
        `UPDATE enterprise_contracts
         SET status = 'TERMINATED', terminated_at = ?, termination_reason = ?, updated_at = ?
         WHERE id = ?`,
        [nowIso(), terminationReason, nowIso(), id]
      );
      this.recordEvent('CONTRACT', id, 'TERMINATED', actor, { reason: terminationReason });
    });
    this.audit('فسخ عقد', 'CONTRACTS', id, actor,
      { status: contract.status },
      { status: 'TERMINATED', reason: terminationReason });
    return this.getContract(id);
  }

  /** Extend a contract. Never rewrites or deletes the previous term; the event keeps it. */
  public renewContract(id: string, newEndDate: string, newValue?: number): EnterpriseContract {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'contracts.update');
    ModuleRegistryService.assertModuleEnabled(MODULE_ID);
    const contract = this.getContract(id);
    if (contract.status === 'TERMINATED') throw new Error('لا يمكن تجديد عقد مفسوخ.');
    const endDate = requiredDate(newEndDate, 'تاريخ النهاية الجديد');
    if (endDate <= contract.endDate) {
      throw new Error('تاريخ النهاية الجديد يجب أن يكون بعد تاريخ النهاية الحالي.');
    }
    const value = newValue === undefined ? contract.value : Number(newValue);
    if (!Number.isFinite(value) || value < 0) throw new Error('قيمة العقد غير صالحة.');

    this.db.executeTransaction((tx) => {
      tx.run(
        'UPDATE enterprise_contracts SET end_date = ?, value = ?, updated_at = ? WHERE id = ?',
        [endDate, value, nowIso(), id]
      );
      this.recordEvent('CONTRACT', id, 'RENEWED', actor, {
        fromEndDate: contract.endDate,
        toEndDate: endDate,
        fromValue: contract.value,
        toValue: value,
      });
    });
    this.audit('تجديد عقد', 'CONTRACTS', id, actor,
      { endDate: contract.endDate, value: contract.value },
      { endDate, value });
    return this.getContract(id);
  }

  private assertContractDocument(documentId: string | null | undefined, companyId: string, actor: User): string | null {
    if (!documentId) return null;
    const document = this.db.query<{ id: string; companyId: string }>(
      'SELECT id, company_id AS companyId FROM enterprise_documents WHERE id = ?',
      [documentId]
    )[0];
    if (!document) throw new Error('المستند المرتبط غير موجود.');
    if (document.companyId !== companyId) throw new Error('لا يمكن ربط عقد بمستند يتبع شركة أخرى.');
    this.access.requireCompanyAccess(document.companyId, actor);
    return documentId;
  }

  private defaultCurrency(companyId: string): string {
    const row = this.db.query<{ currency: string | null }>(
      'SELECT currency FROM companies WHERE id = ?',
      [companyId]
    )[0];
    const currency = (row?.currency || '').toUpperCase();
    if (CURRENCY_PATTERN.test(currency)) return currency;
    const setting = this.db.query<{ value: string }>(
      "SELECT value FROM system_settings WHERE key = 'currency'"
    )[0]?.value;
    const fallback = (setting || 'EGP').toUpperCase();
    return CURRENCY_PATTERN.test(fallback) ? fallback : 'EGP';
  }

  private mapContract(row: any, today: string): EnterpriseContract {
    const startDate = row.start_date ?? row.startDate;
    const endDate = row.end_date ?? row.endDate;
    const status = row.status as ContractStatus;
    const renewalNoticeDays = Number(row.renewal_notice_days ?? row.renewalNoticeDays ?? 30);
    const effectiveStatus = effectiveContractStatus({ status, startDate, endDate, renewalNoticeDays }, today);
    return {
      id: row.id,
      companyId: row.company_id ?? row.companyId,
      companyName: row.companyName ?? null,
      branchId: row.branch_id ?? row.branchId ?? null,
      contractNumber: row.contract_number ?? row.contractNumber,
      title: row.title,
      partyType: row.party_type ?? row.partyType,
      partyId: row.party_id ?? row.partyId ?? null,
      partyName: row.party_name ?? row.partyName,
      startDate,
      endDate,
      value: Number(row.value || 0),
      currency: row.currency,
      status,
      effectiveStatus,
      autoRenew: Number(row.auto_renew ?? (row.autoRenew ? 1 : 0)) === 1,
      renewalNoticeDays,
      ownerUserId: row.owner_user_id ?? row.ownerUserId ?? null,
      ownerName: row.ownerName ?? null,
      documentId: row.document_id ?? row.documentId ?? null,
      documentTitle: row.documentTitle ?? null,
      notes: row.notes ?? null,
      terminatedAt: row.terminated_at ?? row.terminatedAt ?? null,
      terminationReason: row.termination_reason ?? row.terminationReason ?? null,
      createdBy: row.created_by ?? row.createdBy ?? null,
      createdAt: row.created_at ?? row.createdAt,
      updatedAt: row.updated_at ?? row.updatedAt,
      daysToExpiry: status === 'TERMINATED' ? null : daysBetween(today, endDate),
    };
  }

  // ─── Shared reporting ──────────────────────────────────────────────────────

  public getSummary(): DocumentModuleSummary {
    const actor = AuthService.requireAuth();
    const canDocuments = PermissionService.can(actor, 'documents.view');
    const canContracts = PermissionService.can(actor, 'contracts.view');
    if (!canDocuments && !canContracts) {
      throw new Error('ليس لديك صلاحية الوصول إلى المستندات أو العقود.');
    }
    const today = localDateString();
    const in30 = new Date(`${today}T00:00:00Z`);
    in30.setUTCDate(in30.getUTCDate() + 30);
    const in30String = in30.toISOString().slice(0, 10);
    const summary: DocumentModuleSummary = {
      documents: 0,
      activeDocuments: 0,
      archivedDocuments: 0,
      expiringDocuments: 0,
      contracts: 0,
      activeContracts: 0,
      expiringContracts: 0,
    };

    if (canDocuments) {
      const docScope = this.companyScope('d', actor);
      const docBranch = this.branchScope('d', actor);
      const row = this.db.query<any>(
        `SELECT COUNT(*) AS documents,
                SUM(CASE WHEN d.status = 'ACTIVE' THEN 1 ELSE 0 END) AS activeDocuments,
                SUM(CASE WHEN d.status = 'ARCHIVED' THEN 1 ELSE 0 END) AS archivedDocuments,
                SUM(CASE WHEN d.status <> 'ARCHIVED' AND d.expires_at IS NOT NULL
                          AND d.expires_at >= ? AND d.expires_at <= ? THEN 1 ELSE 0 END) AS expiringDocuments
         FROM enterprise_documents d
         WHERE ${docScope.clause} AND ${docBranch.clause}`,
        [today, in30String, ...docScope.params, ...docBranch.params]
      )[0];
      summary.documents = Number(row?.documents || 0);
      summary.activeDocuments = Number(row?.activeDocuments || 0);
      summary.archivedDocuments = Number(row?.archivedDocuments || 0);
      summary.expiringDocuments = Number(row?.expiringDocuments || 0);
    }

    if (canContracts) {
      const contractScope = this.companyScope('ct', actor);
      const contractBranch = this.branchScope('ct', actor);
      const row = this.db.query<any>(
        `SELECT COUNT(*) AS contracts,
                SUM(CASE WHEN ct.status = 'ACTIVE' AND ct.start_date <= ? AND ct.end_date >= ? THEN 1 ELSE 0 END) AS activeContracts,
                SUM(CASE WHEN ct.status = 'ACTIVE' AND ct.end_date >= ? AND ct.end_date <= ? THEN 1 ELSE 0 END) AS expiringContracts
         FROM enterprise_contracts ct
         WHERE ${contractScope.clause} AND ${contractBranch.clause}`,
        [today, today, today, in30String, ...contractScope.params, ...contractBranch.params]
      )[0];
      summary.contracts = Number(row?.contracts || 0);
      summary.activeContracts = Number(row?.activeContracts || 0);
      summary.expiringContracts = Number(row?.expiringContracts || 0);
    }

    return summary;
  }

  public getEvents(entityType: 'DOCUMENT' | 'CONTRACT', entityId: string): Array<{
    id: string;
    action: string;
    actorName: string | null;
    details: string | null;
    createdAt: string;
  }> {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, entityType === 'DOCUMENT' ? 'documents.view' : 'contracts.view');
    if (entityType === 'DOCUMENT') this.getDocument(entityId);
    else this.getContract(entityId);
    return this.db.query<any>(
      `SELECT id, action, actor_name AS actorName, details, created_at AS createdAt
       FROM enterprise_document_events
       WHERE entity_type = ? AND entity_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 200`,
      [entityType, entityId]
    );
  }

  /** Exposed for tests and UI diagnostics. */
  public static isSupportedContractStatus(value: string): value is ContractEffectiveStatus {
    return ['DRAFT', 'SCHEDULED', 'ACTIVE', 'EXPIRING', 'EXPIRED', 'TERMINATED'].includes(value)
      || CONTRACT_STATUSES.includes(value as ContractStatus);
  }
}
