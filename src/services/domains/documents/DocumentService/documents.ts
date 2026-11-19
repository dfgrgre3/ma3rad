import { AuthService } from '../../auth/AuthService';
import { PermissionService } from '../../auth/PermissionService';
import { ModuleRegistryService } from '../../config/ModuleRegistryService';
import { localDateString } from '../../../../utils/shared/date';
import type {
  CreateDocumentDTO,
  CreateDocumentVersionDTO,
  DocumentFilters,
  DocumentStatus,
  EnterpriseDocument,
  UpdateDocumentDTO,
} from '../../../../types/documents';
import type { User } from '../../../../types';
import {
  CONFIDENTIALITY,
  DOCUMENT_STATUSES,
  MAX_ATTACHMENT_BYTES,
  MODULE_ID,
  optionalDate,
  optionalText,
  requireText,
  STORAGE_NAME_PATTERN,
} from './validation';
import type { NormalizedVersion } from './validation';
import { mapDocument, mapVersion } from './mapping';
import { newId, nowIso } from './utils';
import { DocumentServiceBase } from './base';

/** Enterprise document registry: CRUD, versions and status lifecycle. */
export abstract class DocumentOperations extends DocumentServiceBase {
  public getDocuments(filters: DocumentFilters = {}): { documents: EnterpriseDocument[]; total: number } {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.documents.documents.view');

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

    return { documents: rows.map((row) => mapDocument(row)), total };
  }

  public getDocument(id: string): EnterpriseDocument {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.documents.documents.view');
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

    const document = mapDocument(row);
    document.versions = this.db.query<any>(
      `SELECT v.*, u.full_name AS createdByName
       FROM enterprise_document_versions v
       LEFT JOIN users u ON u.id = v.created_by
       WHERE v.document_id = ?
       ORDER BY v.version_number DESC`,
      [id]
    ).map((version) => mapVersion(version));
    return document;
  }

  public createDocument(dto: CreateDocumentDTO): EnterpriseDocument {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.documents.documents.create');
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
    PermissionService.require(actor, 'ui.documents.documents.update');
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
    PermissionService.require(actor, 'ui.documents.documents.update');
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
    PermissionService.require(actor, archiving ? 'ui.documents.documents.archive' : 'ui.documents.documents.update');

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
}
