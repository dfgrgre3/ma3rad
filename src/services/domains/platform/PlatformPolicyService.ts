import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PlatformStaffAuthService } from './PlatformStaffAuthService';
import { PlatformAuthorizationService } from './PlatformAuthorizationService';
import { centralAuditService } from './CentralAuditService';
import type {
  PlatformPolicyDocumentRecord,
  PlatformPolicyDocumentDetail,
  PlatformPolicyDocumentInput,
  PlatformPolicyDocumentStatus,
  PlatformPolicyRetentionConfig,
  PlatformPolicyVersionRecord,
  PlatformPoliciesExportBundle,
} from './platformTypes';
import { nowIso } from './platformUtils';

/** Seed catalog — slug, Arabic title, optional legacy settings key to migrate. */
const POLICY_SEED: Array<{ slug: string; title: string; legacyKey?: 'policy.terms' | 'policy.privacy' }> = [
  { slug: 'terms', title: 'شروط الخدمة (Terms of Service)', legacyKey: 'policy.terms' },
  { slug: 'privacy', title: 'سياسة الخصوصية وحماية البيانات (Privacy Policy)', legacyKey: 'policy.privacy' },
  { slug: 'cookies', title: 'سياسة ملفات تعريف الارتباط (Cookie Policy)' },
  { slug: 'sla', title: 'اتفاقية مستوى الخدمة (SLA)' },
  { slug: 'acceptable-use', title: 'سياسة الاستخدام المقبول (Acceptable Use)' },
  { slug: 'security', title: 'السياسة الأمنية للمنصة (Security Policy)' },
];

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,39}$/;

function clampDays(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(36500, Math.max(0, Math.round(n)));
}

export class PlatformPolicyService {
  private db = DatabaseManager.getInstance();

  private static requirePlatformAccess(modules: string | string[], action?: string) {
    const user = AuthService.getCurrentUser();
    if (!user || !user.isActive) {
      throw new Error('هذه العملية تتطلب جلسة منصة صالحة.');
    }

    if (user.role === 'SUPER_ADMIN') {
      return user;
    }

    const allowedRoles = new Set(['PLATFORM_ADMIN', 'SUPPORT_AGENT', 'OPERATIONS_ENGINEER', 'BILLING_SPECIALIST', 'LICENSE_MANAGER']);
    if (!allowedRoles.has(String(user.role))) {
      throw new Error('هذه العملية متاحة لمستخدمي المنصة المصرح لهم فقط.');
    }

    const permissionsOverride = PlatformStaffAuthService.getCurrentPermissionsOverride();
    const required = Array.isArray(modules) ? modules : [modules];
    const permitted = required.some((moduleKey) => {
      if (action && action.startsWith('platform.')) {
        return PlatformAuthorizationService.canAccessPermission(user.role, action, permissionsOverride);
      }
      return PlatformAuthorizationService.canAccessModule(user.role, moduleKey, permissionsOverride)
        && (!action || PlatformAuthorizationService.canAccessModule(user.role, action, permissionsOverride));
    });

    if (!permitted) {
      throw new Error('لا تملك صلاحية تنفيذ هذه العملية.');
    }

    return user;
  }

  private audit(
    action: string,
    entityType: string,
    entityId: string | null,
    details?: unknown,
    options?: {
      oldValues?: unknown;
      newValues?: unknown;
      errorMessage?: string | null;
    }
  ): void {
    const actor = AuthService.getCurrentUser();
    if (!actor) throw new Error('هذه العملية تتطلب جلسة منصة صالحة.');
    centralAuditService.log(actor, {
      action,
      entityType,
      entityId,
      details,
      oldValues: options?.oldValues,
      newValues: options?.newValues,
      errorMessage: options?.errorMessage,
    });
  }

  // ─── Seeding & mapping ─────────────────────────────────────────────────────

  private mapDocument(row: any): PlatformPolicyDocumentRecord {
    return {
      id: String(row.id),
      slug: String(row.slug),
      title: String(row.title),
      status: String(row.status) as PlatformPolicyDocumentStatus,
      draftContent: String(row.draft_content ?? ''),
      draftChangeSummary: row.draft_change_summary ?? null,
      draftUpdatedBy: row.draft_updated_by ?? null,
      draftUpdatedAt: row.draft_updated_at ?? null,
      submittedBy: row.submitted_by ?? null,
      submittedAt: row.submitted_at ?? null,
      currentVersionId: row.current_version_id ?? null,
      currentVersion: row.current_version != null ? Number(row.current_version) : null,
      publishedAt: row.published_at ?? null,
      publishedBy: row.published_by ?? null,
      reviewNote: row.review_note ?? null,
      createdBy: row.created_by ?? null,
      createdAt: String(row.created_at ?? ''),
      updatedAt: String(row.updated_at ?? ''),
    };
  }

  private mapVersion(row: any): PlatformPolicyVersionRecord {
    return {
      id: String(row.id),
      documentId: String(row.document_id),
      version: Number(row.version),
      title: String(row.title),
      content: String(row.content ?? ''),
      changeSummary: row.change_summary ?? null,
      createdBy: row.created_by ?? null,
      createdByName: row.created_by_name ?? null,
      createdAt: String(row.created_at ?? ''),
      approvedBy: row.approved_by ?? null,
      approvedByName: row.approved_by_name ?? null,
      approvedAt: row.approved_at ?? null,
      isCurrent: Number(row.is_current) === 1,
    };
  }

  private getSettingValue(key: string): string {
    const row = this.db.query<{ value: string }>('SELECT value FROM platform_settings WHERE key = ?', [key])[0];
    return row?.value ?? '';
  }

  private resolveUserName(userId: string | null | undefined): string | null {
    if (!userId) return null;
    try {
      const row = this.db.query<{ full_name: string }>('SELECT full_name FROM users WHERE id = ?', [userId])[0];
      return row?.full_name ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Lazily seeds the six standard policy documents. Legacy `policy.terms` /
   * `policy.privacy` settings (pre-versioning storage) are migrated into
   * published v1 snapshots so previously saved content stays live.
   */
  private ensureSeeded(): void {
    const count = Number(
      this.db.query<{ c: number }>('SELECT COUNT(*) AS c FROM platform_policy_documents')[0]?.c ?? 0
    );
    if (count > 0) return;

    const now = nowIso();
    for (const seed of POLICY_SEED) {
      const id = `poldoc_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      const legacyContent = seed.legacyKey ? this.getSettingValue(seed.legacyKey) : '';
      const hasLegacy = Boolean(legacyContent && legacyContent.trim());

      this.db.run(
        `INSERT INTO platform_policy_documents
          (id, slug, title, status, draft_content, draft_change_summary, draft_updated_by, draft_updated_at,
           submitted_by, submitted_at, current_version_id, published_at, published_by, review_note,
           created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'system', ?, ?)`,
        [id, seed.slug, seed.title, hasLegacy ? 'PUBLISHED' : 'DRAFT', legacyContent || '', now, now]
      );

      if (hasLegacy) {
        const versionId = `polver_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
        this.db.run(
          `INSERT INTO platform_policy_versions
            (id, document_id, version, title, content, change_summary, created_by, created_by_name,
             created_at, approved_by, approved_by_name, approved_at, is_current)
           VALUES (?, ?, 1, ?, ?, 'ترحيل من الإعدادات القديمة', 'system', 'النظام', ?, 'system', 'النظام', ?, 1)`,
          [versionId, id, seed.title, legacyContent, now, now]
        );
        this.db.run('UPDATE platform_policy_documents SET current_version_id = ? WHERE id = ?', [versionId, id]);
      }
    }
  }

  private getDocumentRow(slug: string): any | undefined {
    return this.db.query<any>('SELECT * FROM platform_policy_documents WHERE slug = ?', [slug])[0];
  }

  private requireDocument(slug: string): any {
    const row = this.getDocumentRow(slug);
    if (!row) throw new Error('مستند السياسة غير موجود.');
    return row;
  }

  private listVersionsForDocument(documentId: string): PlatformPolicyVersionRecord[] {
    return this.db
      .query<any>('SELECT * FROM platform_policy_versions WHERE document_id = ? ORDER BY version DESC', [documentId])
      .map((row) => this.mapVersion(row));
  }

  // ─── Documents ─────────────────────────────────────────────────────────────

  public listPolicyDocuments(): PlatformPolicyDocumentRecord[] {
    PlatformPolicyService.requirePlatformAccess('policies', 'platform.policies.view');
    this.ensureSeeded();
    return this.db
      .query<any>(
        `SELECT d.*,
                (SELECT v.version FROM platform_policy_versions v
                  WHERE v.document_id = d.id AND v.is_current = 1 LIMIT 1) AS current_version
           FROM platform_policy_documents d
          ORDER BY d.created_at ASC`
      )
      .map((row) => this.mapDocument(row));
  }

  public getPolicyDocument(slug: string): PlatformPolicyDocumentDetail {
    PlatformPolicyService.requirePlatformAccess('policies', 'platform.policies.view');
    this.ensureSeeded();
    const row = this.requireDocument(slug);
    const doc = this.mapDocument(row);
    const versions = this.listVersionsForDocument(doc.id);
    const current = versions.find((v) => v.isCurrent) ?? versions[0] ?? null;
    return {
      ...doc,
      currentVersion: current?.version ?? null,
      publishedContent: current?.content ?? null,
      publishedTitle: current?.title ?? null,
      versions,
    };
  }

  public savePolicyDraft(input: PlatformPolicyDocumentInput): PlatformPolicyDocumentDetail {
    this.ensureSeeded();
    const isNew = !input.slug || !this.getDocumentRow(input.slug);
    PlatformPolicyService.requirePlatformAccess(
      'policies',
      isNew ? 'platform.policies.create' : 'platform.policies.update'
    );

    const actor = AuthService.getCurrentUser()!;
    const now = nowIso();
    const content = String(input.content ?? '');
    const changeSummary = input.changeSummary?.trim() || null;

    if (isNew) {
      const slug = String(input.slug ?? '').trim().toLowerCase();
      if (!SLUG_PATTERN.test(slug)) {
        throw new Error('معرّف السياسة غير صالح — استخدم أحرفاً لاتينية صغيرة وأرقاماً وشرطات فقط.');
      }
      const title = String(input.title ?? '').trim();
      if (!title) throw new Error('عنوان السياسة مطلوب.');
      const id = `poldoc_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      this.db.run(
        `INSERT INTO platform_policy_documents
          (id, slug, title, status, draft_content, draft_change_summary, draft_updated_by, draft_updated_at,
           created_by, created_at, updated_at)
         VALUES (?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?)`,
        [id, slug, title, content, changeSummary, actor.id, now, actor.id, now, now]
      );
      this.audit('إنشاء مسودة سياسة', 'PLATFORM_POLICY', id, { slug, title }, { newValues: { slug, title } });
      return this.getPolicyDocument(slug);
    }

    const existing = this.requireDocument(String(input.slug));
    const title = input.title !== undefined ? String(input.title).trim() : String(existing.title);
    if (!title) throw new Error('عنوان السياسة مطلوب.');

    const wasPending = String(existing.status) === 'PENDING_APPROVAL';
    // A published document whose draft diverges from the live snapshot drops
    // back to DRAFT so it can re-enter the approval workflow.
    let nextStatus = String(existing.status);
    if (wasPending) {
      nextStatus = 'DRAFT';
    } else if (nextStatus === 'PUBLISHED' && existing.current_version_id) {
      const published = this.db.query<any>(
        'SELECT content FROM platform_policy_versions WHERE id = ?',
        [existing.current_version_id]
      )[0];
      if (published && String(published.content ?? '') !== content) {
        nextStatus = 'DRAFT';
      }
    }
    const clearSubmission = wasPending ? null : existing.submitted_by;
    const clearSubmittedAt = wasPending ? null : existing.submitted_at;
    this.db.run(
      `UPDATE platform_policy_documents
          SET title = ?, draft_content = ?, draft_change_summary = ?, draft_updated_by = ?, draft_updated_at = ?,
              status = ?, submitted_by = ?, submitted_at = ?, review_note = NULL, updated_at = ?
        WHERE id = ?`,
      [title, content, changeSummary, actor.id, now, nextStatus, clearSubmission, clearSubmittedAt, now, existing.id]
    );
    this.audit(
      wasPending ? 'تعديل مسودة سياسة قيد الاعتماد' : 'حفظ مسودة سياسة',
      'PLATFORM_POLICY',
      String(existing.id),
      { slug: existing.slug },
      { oldValues: { status: existing.status }, newValues: { status: wasPending ? 'DRAFT' : existing.status } }
    );
    return this.getPolicyDocument(String(existing.slug));
  }

  public submitPolicyForApproval(slug: string): PlatformPolicyDocumentDetail {
    PlatformPolicyService.requirePlatformAccess('policies', 'platform.policies.update');
    this.ensureSeeded();
    const row = this.requireDocument(slug);
    if (String(row.status) !== 'DRAFT') {
      throw new Error('لا يمكن تقديم هذه السياسة — حالتها الحالية لا تسمح بذلك.');
    }

    const published = row.current_version_id
      ? this.db.query<any>('SELECT content FROM platform_policy_versions WHERE id = ?', [row.current_version_id])[0]
      : null;
    const draft = String(row.draft_content ?? '');
    if (!draft.trim()) throw new Error('لا يمكن تقديم مسودة فارغة.');
    if (published && String(published.content ?? '') === draft) {
      throw new Error('لا توجد تغييرات عن النسخة المنشورة حالياً.');
    }

    const actor = AuthService.getCurrentUser()!;
    const now = nowIso();
    this.db.run(
      `UPDATE platform_policy_documents
          SET status = 'PENDING_APPROVAL', submitted_by = ?, submitted_at = ?, updated_at = ?
        WHERE id = ?`,
      [actor.id, now, now, row.id]
    );
    this.audit('تقديم سياسة للاعتماد', 'PLATFORM_POLICY', String(row.id), { slug }, { newValues: { status: 'PENDING_APPROVAL' } });
    return this.getPolicyDocument(slug);
  }

  public approvePolicyPublish(slug: string): PlatformPolicyDocumentDetail {
    PlatformPolicyService.requirePlatformAccess('policies', 'platform.policies.approve');
    this.ensureSeeded();
    const row = this.requireDocument(slug);
    if (String(row.status) !== 'PENDING_APPROVAL') {
      throw new Error('لا يمكن نشر هذه السياسة — يجب أن تكون بانتظار الاعتماد أولاً.');
    }

    const actor = AuthService.getCurrentUser()!;
    if (actor.role !== 'SUPER_ADMIN' && row.submitted_by && String(row.submitted_by) === String(actor.id)) {
      throw new Error('لا يمكنك اعتماد سياسة قدّمتها بنفسك — يتطلب مستخدماً آخر بصلاحية الاعتماد.');
    }

    const now = nowIso();
    const nextVersion = Number(
      this.db.query<{ v: number }>(
        'SELECT COALESCE(MAX(version), 0) AS v FROM platform_policy_versions WHERE document_id = ?',
        [row.id]
      )[0]?.v ?? 0
    ) + 1;
    const versionId = `polver_${uuidv4().replace(/-/g, '').slice(0, 12)}`;

    this.db.run('UPDATE platform_policy_versions SET is_current = 0 WHERE document_id = ?', [row.id]);
    this.db.run(
      `INSERT INTO platform_policy_versions
        (id, document_id, version, title, content, change_summary, created_by, created_by_name,
         created_at, approved_by, approved_by_name, approved_at, is_current)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        versionId,
        row.id,
        nextVersion,
        String(row.title),
        String(row.draft_content ?? ''),
        row.draft_change_summary ?? null,
        row.draft_updated_by ?? row.submitted_by ?? actor.id,
        this.resolveUserName(row.draft_updated_by ?? row.submitted_by),
        now,
        actor.id,
        actor.fullName ?? null,
        now,
      ]
    );
    this.db.run(
      `UPDATE platform_policy_documents
          SET status = 'PUBLISHED', current_version_id = ?, published_at = ?, published_by = ?,
              submitted_by = NULL, submitted_at = NULL, updated_at = ?
        WHERE id = ?`,
      [versionId, now, actor.id, now, row.id]
    );
    this.audit('اعتماد ونشر سياسة', 'PLATFORM_POLICY', String(row.id), { slug, version: nextVersion });
    return this.getPolicyDocument(slug);
  }

  public rejectPolicy(slug: string, reviewNote?: string): PlatformPolicyDocumentDetail {
    PlatformPolicyService.requirePlatformAccess('policies', 'platform.policies.approve');
    this.ensureSeeded();
    const row = this.requireDocument(slug);
    if (String(row.status) !== 'PENDING_APPROVAL') {
      throw new Error('لا يمكن رفض هذه السياسة — ليست بانتظار الاعتماد.');
    }
    const now = nowIso();
    this.db.run(
      `UPDATE platform_policy_documents
          SET status = 'DRAFT', submitted_by = NULL, submitted_at = NULL, review_note = ?, updated_at = ?
        WHERE id = ?`,
      [reviewNote?.trim() || null, now, row.id]
    );
    this.audit('رفض سياسة مقدمة', 'PLATFORM_POLICY', String(row.id), { slug }, { newValues: { status: 'DRAFT', reviewNote } });
    return this.getPolicyDocument(slug);
  }

  public listPolicyVersions(slug: string): PlatformPolicyVersionRecord[] {
    PlatformPolicyService.requirePlatformAccess('policies', 'platform.policies.view');
    this.ensureSeeded();
    const row = this.requireDocument(slug);
    return this.listVersionsForDocument(String(row.id));
  }

  public restorePolicyVersion(slug: string, version: number): PlatformPolicyDocumentDetail {
    PlatformPolicyService.requirePlatformAccess('policies', 'platform.policies.update');
    this.ensureSeeded();
    const row = this.requireDocument(slug);
    const target = this.db.query<any>(
      'SELECT * FROM platform_policy_versions WHERE document_id = ? AND version = ?',
      [row.id, version]
    )[0];
    if (!target) throw new Error('الإصدار المطلوب غير موجود.');

    const actor = AuthService.getCurrentUser()!;
    const now = nowIso();
    this.db.run(
      `UPDATE platform_policy_documents
          SET title = ?, draft_content = ?, draft_change_summary = ?, draft_updated_by = ?, draft_updated_at = ?,
              status = 'DRAFT', submitted_by = NULL, submitted_at = NULL, review_note = NULL, updated_at = ?
        WHERE id = ?`,
      [
        String(target.title),
        String(target.content ?? ''),
        `استرجاع من الإصدار #${version}`,
        actor.id,
        now,
        now,
        row.id,
      ]
    );
    this.audit('استرجاع إصدار سياسة كمسودة', 'PLATFORM_POLICY', String(row.id), { slug, version });
    return this.getPolicyDocument(slug);
  }

  // ─── Retention ─────────────────────────────────────────────────────────────

  private defaultRetention(): PlatformPolicyRetentionConfig {
    return {
      auditRetentionDays: 365,
      backupRetentionDays: 90,
      syncLogRetentionDays: 30,
      softDeleteGraceDays: 30,
    };
  }

  public getRetentionPolicy(): PlatformPolicyRetentionConfig {
    PlatformPolicyService.requirePlatformAccess('policies', 'platform.policies.view');
    const raw = this.getSettingValue('policy.retention');
    let stored: Record<string, unknown> = {};
    if (raw) {
      try {
        stored = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        stored = {};
      }
    }
    const defaults = this.defaultRetention();
    return {
      auditRetentionDays: clampDays(stored.auditRetentionDays, defaults.auditRetentionDays),
      backupRetentionDays: clampDays(stored.backupRetentionDays, defaults.backupRetentionDays),
      syncLogRetentionDays: clampDays(stored.syncLogRetentionDays, defaults.syncLogRetentionDays),
      softDeleteGraceDays: clampDays(stored.softDeleteGraceDays, defaults.softDeleteGraceDays),
      notificationLogRetentionDays: stored.notificationLogRetentionDays != null
        ? clampDays(stored.notificationLogRetentionDays, 0)
        : undefined,
      supportTicketRetentionDays: stored.supportTicketRetentionDays != null
        ? clampDays(stored.supportTicketRetentionDays, 0)
        : undefined,
      errorReportRetentionDays: stored.errorReportRetentionDays != null
        ? clampDays(stored.errorReportRetentionDays, 0)
        : undefined,
    };
  }

  public saveRetentionPolicy(input: Partial<PlatformPolicyRetentionConfig>): PlatformPolicyRetentionConfig {
    PlatformPolicyService.requirePlatformAccess('policies', 'platform.policies.update');
    const current = this.getRetentionPolicy();
    const merged: PlatformPolicyRetentionConfig = {
      auditRetentionDays: clampDays(input.auditRetentionDays ?? current.auditRetentionDays, current.auditRetentionDays),
      backupRetentionDays: clampDays(input.backupRetentionDays ?? current.backupRetentionDays, current.backupRetentionDays),
      syncLogRetentionDays: clampDays(input.syncLogRetentionDays ?? current.syncLogRetentionDays, current.syncLogRetentionDays),
      softDeleteGraceDays: clampDays(input.softDeleteGraceDays ?? current.softDeleteGraceDays, current.softDeleteGraceDays),
      notificationLogRetentionDays: input.notificationLogRetentionDays !== undefined
        ? clampDays(input.notificationLogRetentionDays, 0)
        : current.notificationLogRetentionDays,
      supportTicketRetentionDays: input.supportTicketRetentionDays !== undefined
        ? clampDays(input.supportTicketRetentionDays, 0)
        : current.supportTicketRetentionDays,
      errorReportRetentionDays: input.errorReportRetentionDays !== undefined
        ? clampDays(input.errorReportRetentionDays, 0)
        : current.errorReportRetentionDays,
    };

    const now = nowIso();
    const upsert = (key: string, value: string) => {
      const existing = this.db.query<any>('SELECT 1 FROM platform_settings WHERE key = ?', [key])[0];
      if (existing) {
        this.db.run('UPDATE platform_settings SET value = ?, updated_at = ? WHERE key = ?', [value, now, key]);
      } else {
        this.db.run('INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, ?)', [key, value, now]);
      }
    };
    upsert('policy.retention', JSON.stringify(merged));
    upsert('policy.updated_at', now);

    this.audit('حفظ قواعد الاحتفاظ بالبيانات', 'PLATFORM_POLICY_RETENTION', null, {
      oldValues: current,
      newValues: merged,
    });
    return merged;
  }

  // ─── Export ────────────────────────────────────────────────────────────────

  public exportPoliciesBundle(): PlatformPoliciesExportBundle {
    PlatformPolicyService.requirePlatformAccess('policies', 'platform.policies.export');
    this.ensureSeeded();
    const actor = AuthService.getCurrentUser();
    const documents = this.listPolicyDocuments().map((doc) => {
      const detail = this.getPolicyDocument(doc.slug);
      return {
        slug: doc.slug,
        title: doc.title,
        status: doc.status,
        currentVersion: doc.currentVersion,
        publishedContent: detail.publishedContent,
        draftContent: doc.draftContent,
        publishedAt: doc.publishedAt,
      };
    });
    return {
      exportedAt: nowIso(),
      exportedBy: actor ? `${actor.fullName} (${actor.username})` : null,
      documents,
      retention: this.getRetentionPolicy(),
    };
  }
}

export const platformPolicyService = new PlatformPolicyService();
