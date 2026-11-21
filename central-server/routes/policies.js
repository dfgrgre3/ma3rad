'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../lib/db');
const { nowIso } = require('../lib/time');
const { authenticatePlatformUser, requirePlatformPermission, hasAnyPermission } = require('../middleware/auth');
const { recordAuditEvent } = require('../lib/audit');

const router = express.Router();

// Seed catalog — mirrors PlatformPolicyService POLICY_SEED on the desktop side.
const POLICY_SEED = [
  { slug: 'terms', title: 'شروط الخدمة (Terms of Service)', legacyKey: 'policy.terms' },
  { slug: 'privacy', title: 'سياسة الخصوصية وحماية البيانات (Privacy Policy)', legacyKey: 'policy.privacy' },
  { slug: 'cookies', title: 'سياسة ملفات تعريف الارتباط (Cookie Policy)' },
  { slug: 'sla', title: 'اتفاقية مستوى الخدمة (SLA)' },
  { slug: 'acceptable-use', title: 'سياسة الاستخدام المقبول (Acceptable Use)' },
  { slug: 'security', title: 'السياسة الأمنية للمنصة (Security Policy)' },
];

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,39}$/;

const clampDays = (value, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(36500, Math.max(0, Math.round(n)));
};

const mapDocument = (row, currentVersion = null) => ({
  id: String(row.id),
  slug: String(row.slug),
  title: String(row.title),
  status: String(row.status),
  draftContent: String(row.draft_content ?? ''),
  draftChangeSummary: row.draft_change_summary ?? null,
  draftUpdatedBy: row.draft_updated_by ?? null,
  draftUpdatedAt: row.draft_updated_at ?? null,
  submittedBy: row.submitted_by ?? null,
  submittedAt: row.submitted_at ?? null,
  currentVersionId: row.current_version_id ?? null,
  currentVersion,
  publishedAt: row.published_at ?? null,
  publishedBy: row.published_by ?? null,
  reviewNote: row.review_note ?? null,
  createdBy: row.created_by ?? null,
  createdAt: String(row.created_at ?? ''),
  updatedAt: String(row.updated_at ?? ''),
});

const mapVersion = (row) => ({
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
});

const audit = (req, action, resourceId, afterData, beforeData) =>
  recordAuditEvent({
    actorId: req.platformUser?.id,
    actorName: req.platformUser?.full_name,
    action,
    resourceType: 'platform_policy_documents',
    resourceId,
    afterData,
    beforeData: beforeData ?? undefined,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

const deny = async (req, res, permission) => {
  await recordAuditEvent({
    actorId: req.platformUser?.id,
    actorName: req.platformUser?.full_name,
    action: 'ACCESS_DENIED',
    resourceType: 'permission',
    resourceId: permission,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });
  return res.status(403).json({ error: 'Insufficient platform permissions' });
};

async function getSettingValue(db, key) {
  const row = await db.get('SELECT value FROM platform_settings WHERE key = ?', [key]);
  return row?.value ?? '';
}

async function resolveUserName(db, userId) {
  if (!userId) return null;
  try {
    const row = await db.get('SELECT full_name FROM platform_users WHERE id = ?', [userId]);
    return row?.full_name ?? null;
  } catch {
    return null;
  }
}

/** Lazily seeds the six standard policy documents (idempotent). */
async function ensureSeeded(db) {
  const countRow = await db.get('SELECT COUNT(*) AS c FROM platform_policy_documents');
  if (Number(countRow?.c ?? 0) > 0) return;

  const now = nowIso();
  for (const seed of POLICY_SEED) {
    const id = `poldoc_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const legacyContent = seed.legacyKey ? await getSettingValue(db, seed.legacyKey) : '';
    const hasLegacy = Boolean(legacyContent && String(legacyContent).trim());

    await db.run(
      `INSERT INTO platform_policy_documents
        (id, slug, title, status, draft_content, draft_change_summary, draft_updated_by, draft_updated_at,
         submitted_by, submitted_at, current_version_id, published_at, published_by, review_note,
         created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'system', ?, ?)`,
      [id, seed.slug, seed.title, hasLegacy ? 'PUBLISHED' : 'DRAFT', hasLegacy ? legacyContent : '', now, now]
    );

    if (hasLegacy) {
      const versionId = `polver_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      await db.run(
        `INSERT INTO platform_policy_versions
          (id, document_id, version, title, content, change_summary, created_by, created_by_name,
           created_at, approved_by, approved_by_name, approved_at, is_current)
         VALUES (?, ?, 1, ?, ?, 'ترحيل من الإعدادات القديمة', 'system', 'النظام', ?, 'system', 'النظام', ?, 1)`,
        [versionId, id, seed.title, legacyContent, now, now]
      );
      await db.run('UPDATE platform_policy_documents SET current_version_id = ? WHERE id = ?', [versionId, id]);
    }
  }
}

async function listVersions(db, documentId) {
  const rows = await db.all(
    'SELECT * FROM platform_policy_versions WHERE document_id = ? ORDER BY version DESC',
    [documentId]
  );
  return rows.map(mapVersion);
}

async function getDocumentBySlug(db, slug) {
  return db.get('SELECT * FROM platform_policy_documents WHERE slug = ?', [slug]);
}

async function currentVersionNumber(db, documentId) {
  const row = await db.get(
    'SELECT version FROM platform_policy_versions WHERE document_id = ? AND is_current = 1 LIMIT 1',
    [documentId]
  );
  return row ? Number(row.version) : null;
}

async function toDetail(db, row) {
  const versions = await listVersions(db, String(row.id));
  const current = versions.find((v) => v.isCurrent) ?? versions[0] ?? null;
  return {
    ...mapDocument(row, current?.version ?? null),
    publishedContent: current?.content ?? null,
    publishedTitle: current?.title ?? null,
    versions,
  };
}

// ─── Retention defaults (mirrors PlatformPolicyService) ─────────────────────

const defaultRetention = () => ({
  auditRetentionDays: 365,
  backupRetentionDays: 90,
  syncLogRetentionDays: 30,
  softDeleteGraceDays: 30,
});

async function getRetention(db) {
  const raw = await getSettingValue(db, 'policy.retention');
  let stored = {};
  if (raw) {
    try { stored = JSON.parse(raw); } catch { stored = {}; }
  }
  const defaults = defaultRetention();
  const pick = (key, fallback) => {
    const n = Number(stored[key]);
    return Number.isFinite(n) ? clampDays(n, fallback) : fallback;
  };
  const result = {
    auditRetentionDays: pick('auditRetentionDays', defaults.auditRetentionDays),
    backupRetentionDays: pick('backupRetentionDays', defaults.backupRetentionDays),
    syncLogRetentionDays: pick('syncLogRetentionDays', defaults.syncLogRetentionDays),
    softDeleteGraceDays: pick('softDeleteGraceDays', defaults.softDeleteGraceDays),
  };
  for (const key of ['notificationLogRetentionDays', 'supportTicketRetentionDays', 'errorReportRetentionDays']) {
    if (stored[key] != null && Number.isFinite(Number(stored[key]))) {
      result[key] = clampDays(stored[key], 0);
    }
  }
  return result;
}

// ─── Documents ───────────────────────────────────────────────────────────────

router.get(
  '/',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.policies.view']),
  async (req, res, next) => {
    try {
      const db = getDb();
      await ensureSeeded(db);
      const rows = await db.all(
        `SELECT d.*,
                (SELECT v.version FROM platform_policy_versions v
                  WHERE v.document_id = d.id AND v.is_current = 1 LIMIT 1) AS current_version
           FROM platform_policy_documents d
          ORDER BY d.created_at ASC`
      );
      res.json(rows.map((row) => mapDocument(row, row.current_version != null ? Number(row.current_version) : null)));
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/documents',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.policies.view']),
  async (req, res, next) => {
    try {
      const db = getDb();
      await ensureSeeded(db);
      const rows = await db.all(
        `SELECT d.*,
                (SELECT v.version FROM platform_policy_versions v
                  WHERE v.document_id = d.id AND v.is_current = 1 LIMIT 1) AS current_version
           FROM platform_policy_documents d
          ORDER BY d.created_at ASC`
      );
      res.json(rows.map((row) => mapDocument(row, row.current_version != null ? Number(row.current_version) : null)));
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/documents/:slug',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.policies.view']),
  async (req, res, next) => {
    try {
      const db = getDb();
      await ensureSeeded(db);
      const row = await getDocumentBySlug(db, String(req.params.slug));
      if (!row) return res.status(404).json({ error: 'Policy document not found' });
      res.json(await toDetail(db, row));
    } catch (err) {
      next(err);
    }
  }
);

// PUT /documents/:slug — upsert draft. Existing slug requires policies.update;
// a new slug requires policies.create.
router.put(
  '/documents/:slug',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.policies.update', 'platform.policies.create']),
  async (req, res, next) => {
    try {
      const db = getDb();
      await ensureSeeded(db);
      const slug = String(req.params.slug || '').trim().toLowerCase();
      const body = req.body || {};
      const existing = await getDocumentBySlug(db, slug);

      if (existing) {
        if (!(await hasAnyPermission(req, ['platform.policies.update']))) {
          return deny(req, res, 'platform.policies.update');
        }
      } else {
        if (!SLUG_PATTERN.test(slug)) {
          return res.status(400).json({ error: 'Invalid policy slug — lowercase letters, digits and dashes only' });
        }
        if (!(await hasAnyPermission(req, ['platform.policies.create']))) {
          return deny(req, res, 'platform.policies.create');
        }
      }

      const actor = req.platformUser;
      const now = nowIso();
      const content = body.content !== undefined ? String(body.content ?? '') : (existing ? String(existing.draft_content ?? '') : '');
      const changeSummary = body.changeSummary !== undefined
        ? (String(body.changeSummary ?? '').trim() || null)
        : (existing ? existing.draft_change_summary ?? null : null);

      if (!existing) {
        const title = String(body.title ?? '').trim();
        if (!title) return res.status(400).json({ error: 'title is required' });
        const id = `poldoc_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
        await db.run(
          `INSERT INTO platform_policy_documents
            (id, slug, title, status, draft_content, draft_change_summary, draft_updated_by, draft_updated_at,
             created_by, created_at, updated_at)
           VALUES (?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?)`,
          [id, slug, title, content, changeSummary, actor?.id ?? null, now, actor?.id ?? null, now, now]
        );
        await audit(req, 'POLICY_DRAFT_CREATED', id, { slug, title });
        const created = await getDocumentBySlug(db, slug);
        return res.json(await toDetail(db, created));
      }

      const title = body.title !== undefined ? String(body.title ?? '').trim() : String(existing.title);
      if (!title) return res.status(400).json({ error: 'title is required' });

      const wasPending = String(existing.status) === 'PENDING_APPROVAL';
      // A published document whose draft diverges from the live snapshot drops
      // back to DRAFT so it can re-enter the approval workflow.
      let nextStatus = String(existing.status);
      if (wasPending) {
        nextStatus = 'DRAFT';
      } else if (nextStatus === 'PUBLISHED' && existing.current_version_id) {
        const published = await db.get('SELECT content FROM platform_policy_versions WHERE id = ?', [existing.current_version_id]);
        if (published && String(published.content ?? '') !== content) {
          nextStatus = 'DRAFT';
        }
      }
      await db.run(
        `UPDATE platform_policy_documents
            SET title = ?, draft_content = ?, draft_change_summary = ?, draft_updated_by = ?, draft_updated_at = ?,
                status = ?, submitted_by = ?, submitted_at = ?, review_note = NULL, updated_at = ?
          WHERE id = ?`,
        [
          title,
          content,
          changeSummary,
          actor?.id ?? null,
          now,
          nextStatus,
          wasPending ? null : existing.submitted_by,
          wasPending ? null : existing.submitted_at,
          now,
          existing.id,
        ]
      );
      await audit(req, wasPending ? 'POLICY_DRAFT_EDITED_WHILE_PENDING' : 'POLICY_DRAFT_SAVED', String(existing.id), {
        slug,
        revertedToDraft: wasPending,
      });
      const updated = await getDocumentBySlug(db, slug);
      res.json(await toDetail(db, updated));
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/documents/:slug/submit',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.policies.update']),
  async (req, res, next) => {
    try {
      const db = getDb();
      await ensureSeeded(db);
      const row = await getDocumentBySlug(db, String(req.params.slug));
      if (!row) return res.status(404).json({ error: 'Policy document not found' });
      if (String(row.status) !== 'DRAFT') {
        return res.status(409).json({ error: 'Policy is not in DRAFT status' });
      }

      const published = row.current_version_id
        ? await db.get('SELECT content FROM platform_policy_versions WHERE id = ?', [row.current_version_id])
        : null;
      const draft = String(row.draft_content ?? '');
      if (!draft.trim()) return res.status(400).json({ error: 'Cannot submit an empty draft' });
      if (published && String(published.content ?? '') === draft) {
        return res.status(400).json({ error: 'No changes compared to the published version' });
      }

      const now = nowIso();
      await db.run(
        `UPDATE platform_policy_documents
            SET status = 'PENDING_APPROVAL', submitted_by = ?, submitted_at = ?, updated_at = ?
          WHERE id = ?`,
        [req.platformUser?.id ?? null, now, now, row.id]
      );
      await audit(req, 'POLICY_SUBMITTED_FOR_APPROVAL', String(row.id), { slug: row.slug });
      res.json(await toDetail(db, await getDocumentBySlug(db, String(req.params.slug))));
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/documents/:slug/approve',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.policies.approve']),
  async (req, res, next) => {
    try {
      const db = getDb();
      await ensureSeeded(db);
      const row = await getDocumentBySlug(db, String(req.params.slug));
      if (!row) return res.status(404).json({ error: 'Policy document not found' });
      if (String(row.status) !== 'PENDING_APPROVAL') {
        return res.status(409).json({ error: 'Policy is not pending approval' });
      }
      if (req.platformUser?.role !== 'SUPER_ADMIN' && row.submitted_by && String(row.submitted_by) === String(req.platformUser?.id)) {
        return res.status(403).json({ error: 'Self-approval is not allowed — another approver is required' });
      }

      const now = nowIso();
      const maxRow = await db.get(
        'SELECT COALESCE(MAX(version), 0) AS v FROM platform_policy_versions WHERE document_id = ?',
        [row.id]
      );
      const nextVersion = Number(maxRow?.v ?? 0) + 1;
      const versionId = `polver_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      const authorId = row.draft_updated_by ?? row.submitted_by ?? req.platformUser?.id ?? null;

      await db.run('UPDATE platform_policy_versions SET is_current = 0 WHERE document_id = ?', [row.id]);
      await db.run(
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
          authorId,
          await resolveUserName(db, authorId),
          now,
          req.platformUser?.id ?? null,
          req.platformUser?.full_name ?? null,
          now,
        ]
      );
      await db.run(
        `UPDATE platform_policy_documents
            SET status = 'PUBLISHED', current_version_id = ?, published_at = ?, published_by = ?,
                submitted_by = NULL, submitted_at = NULL, updated_at = ?
          WHERE id = ?`,
        [versionId, now, req.platformUser?.id ?? null, now, row.id]
      );
      await audit(req, 'POLICY_PUBLISHED', String(row.id), { slug: row.slug, version: nextVersion });
      res.json(await toDetail(db, await getDocumentBySlug(db, String(req.params.slug))));
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/documents/:slug/reject',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.policies.approve']),
  async (req, res, next) => {
    try {
      const db = getDb();
      await ensureSeeded(db);
      const row = await getDocumentBySlug(db, String(req.params.slug));
      if (!row) return res.status(404).json({ error: 'Policy document not found' });
      if (String(row.status) !== 'PENDING_APPROVAL') {
        return res.status(409).json({ error: 'Policy is not pending approval' });
      }
      const reviewNote = req.body?.reviewNote !== undefined ? String(req.body.reviewNote ?? '').trim() || null : null;
      const now = nowIso();
      await db.run(
        `UPDATE platform_policy_documents
            SET status = 'DRAFT', submitted_by = NULL, submitted_at = NULL, review_note = ?, updated_at = ?
          WHERE id = ?`,
        [reviewNote, now, row.id]
      );
      await audit(req, 'POLICY_REJECTED', String(row.id), { slug: row.slug, reviewNote });
      res.json(await toDetail(db, await getDocumentBySlug(db, String(req.params.slug))));
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/documents/:slug/versions',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.policies.view']),
  async (req, res, next) => {
    try {
      const db = getDb();
      await ensureSeeded(db);
      const row = await getDocumentBySlug(db, String(req.params.slug));
      if (!row) return res.status(404).json({ error: 'Policy document not found' });
      res.json(await listVersions(db, String(row.id)));
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/documents/:slug/restore',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.policies.update']),
  async (req, res, next) => {
    try {
      const db = getDb();
      await ensureSeeded(db);
      const row = await getDocumentBySlug(db, String(req.params.slug));
      if (!row) return res.status(404).json({ error: 'Policy document not found' });
      const version = Number(req.body?.version);
      if (!Number.isInteger(version) || version < 1) {
        return res.status(400).json({ error: 'version must be a positive integer' });
      }
      const target = await db.get(
        'SELECT * FROM platform_policy_versions WHERE document_id = ? AND version = ?',
        [row.id, version]
      );
      if (!target) return res.status(404).json({ error: 'Policy version not found' });

      const now = nowIso();
      await db.run(
        `UPDATE platform_policy_documents
            SET title = ?, draft_content = ?, draft_change_summary = ?, draft_updated_by = ?, draft_updated_at = ?,
                status = 'DRAFT', submitted_by = NULL, submitted_at = NULL, review_note = NULL, updated_at = ?
          WHERE id = ?`,
        [
          String(target.title),
          String(target.content ?? ''),
          `استرجاع من الإصدار #${version}`,
          req.platformUser?.id ?? null,
          now,
          now,
          row.id,
        ]
      );
      await audit(req, 'POLICY_VERSION_RESTORED', String(row.id), { slug: row.slug, version });
      res.json(await toDetail(db, await getDocumentBySlug(db, String(req.params.slug))));
    } catch (err) {
      next(err);
    }
  }
);

// ─── Retention ───────────────────────────────────────────────────────────────

router.get(
  '/retention',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.policies.view']),
  async (req, res, next) => {
    try {
      const db = getDb();
      res.json(await getRetention(db));
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/retention',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.policies.update']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const body = req.body || {};
      const current = await getRetention(db);
      const merged = {
        auditRetentionDays: clampDays(body.auditRetentionDays ?? current.auditRetentionDays, current.auditRetentionDays),
        backupRetentionDays: clampDays(body.backupRetentionDays ?? current.backupRetentionDays, current.backupRetentionDays),
        syncLogRetentionDays: clampDays(body.syncLogRetentionDays ?? current.syncLogRetentionDays, current.syncLogRetentionDays),
        softDeleteGraceDays: clampDays(body.softDeleteGraceDays ?? current.softDeleteGraceDays, current.softDeleteGraceDays),
        notificationLogRetentionDays: body.notificationLogRetentionDays !== undefined
          ? clampDays(body.notificationLogRetentionDays, 0)
          : current.notificationLogRetentionDays,
        supportTicketRetentionDays: body.supportTicketRetentionDays !== undefined
          ? clampDays(body.supportTicketRetentionDays, 0)
          : current.supportTicketRetentionDays,
        errorReportRetentionDays: body.errorReportRetentionDays !== undefined
          ? clampDays(body.errorReportRetentionDays, 0)
          : current.errorReportRetentionDays,
      };
      const now = nowIso();
      const upsert = async (key, value) => {
        await db.run(
          `INSERT INTO platform_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
          [key, String(value), now, req.platformUser?.id ?? null]
        );
      };
      await upsert('policy.retention', JSON.stringify(merged));
      await upsert('policy.updated_at', now);
      await audit(req, 'POLICY_RETENTION_UPDATED', null, merged, current);
      res.json(merged);
    } catch (err) {
      next(err);
    }
  }
);

// ─── Export ──────────────────────────────────────────────────────────────────

router.get(
  '/export',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.policies.export']),
  async (req, res, next) => {
    try {
      const db = getDb();
      await ensureSeeded(db);
      const rows = await db.all(
        `SELECT d.*,
                (SELECT v.version FROM platform_policy_versions v
                  WHERE v.document_id = d.id AND v.is_current = 1 LIMIT 1) AS current_version
           FROM platform_policy_documents d
          ORDER BY d.created_at ASC`
      );
      const documents = [];
      for (const row of rows) {
        const detail = await toDetail(db, row);
        documents.push({
          slug: detail.slug,
          title: detail.title,
          status: detail.status,
          currentVersion: detail.currentVersion,
          publishedContent: detail.publishedContent,
          draftContent: detail.draftContent,
          publishedAt: detail.publishedAt,
        });
      }
      res.json({
        exportedAt: nowIso(),
        exportedBy: req.platformUser?.full_name ? `${req.platformUser.full_name} (${req.platformUser.username})` : null,
        documents,
        retention: await getRetention(db),
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
