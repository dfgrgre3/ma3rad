'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../lib/db');
const { recordAuditEvent } = require('../lib/audit');
const { invalidatePermissionsCache } = require('../identity');
const {
  authenticatePlatformUser,
  requirePlatformPermission,
  getScopedTenantIds,
  assertTenantAccess,
  tenantScopePredicate,
} = require('../middleware/auth');
const { nowIso } = require('../lib/time');
const { normalizeBanTarget, isLoopbackTarget } = require('../middleware/ipBan');

const router = express.Router();

// ── Dashboard Overview ─────────────────────────────────────────────────────
router.get(
  '/admin/overview',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.dashboard.view', 'platform.tenants.view']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const scoped = await getScopedTenantIds(req);
      // LIMITED staff with no assigned tenants get empty aggregates (fail closed).
      const scope = (column) => {
        const p = tenantScopePredicate(column, scoped);
        return p.deny ? { clause: ' AND 1=0', params: [] } : { clause: p.clause, params: p.params };
      };
      const tenantScope = scope('id');
      const tenantIdScope = scope('tenant_id');
      const [tenants, licenses, subscriptions, invoices, payments, releases] = await Promise.all([
        db.all(`SELECT status, COUNT(*) as count FROM platform_tenants WHERE 1=1${tenantScope.clause} GROUP BY status`, tenantScope.params),
        db.all(`SELECT status, COUNT(*) as count FROM platform_licenses WHERE 1=1${tenantIdScope.clause} GROUP BY status`, tenantIdScope.params),
        db.all(`SELECT status, COUNT(*) as count FROM platform_subscriptions WHERE 1=1${tenantIdScope.clause} GROUP BY status`, tenantIdScope.params),
        db.all(`SELECT status, COUNT(*) as count, SUM(total) as total FROM platform_invoices WHERE 1=1${tenantIdScope.clause} GROUP BY status`, tenantIdScope.params),
        db.all(`SELECT method, COUNT(*) as count, SUM(amount) as total FROM platform_payments WHERE 1=1${tenantIdScope.clause} GROUP BY method`, tenantIdScope.params),
        db.all('SELECT channel, status, version, released_at, created_at FROM platform_releases ORDER BY created_at DESC LIMIT 5'),
      ]);

      const tenantStats = { total: 0, active: 0, trial: 0, suspended: 0, expired: 0, cancelled: 0 };
      for (const row of tenants) {
        tenantStats.total += row.count;
        if (row.status === 'ACTIVE') tenantStats.active = row.count;
        else if (row.status === 'TRIAL') tenantStats.trial = row.count;
        else if (row.status === 'SUSPENDED') tenantStats.suspended = row.count;
        else if (row.status === 'EXPIRED') tenantStats.expired = row.count;
        else if (row.status === 'CANCELLED') tenantStats.cancelled = row.count;
      }

      const licenseStats = { total: 0, active: 0, revoked: 0, expired: 0, suspended: 0 };
      for (const row of licenses) {
        licenseStats.total += row.count;
        if (row.status === 'ACTIVE' || row.status === 'ISSUED' || row.status === 'TRIAL') licenseStats.active += row.count;
        else if (row.status === 'REVOKED') licenseStats.revoked += row.count;
        else if (row.status === 'EXPIRED') licenseStats.expired += row.count;
        else if (row.status === 'SUSPENDED') licenseStats.suspended += row.count;
      }

      const subscriptionStats = { total: 0, active: 0, cancelled: 0, trial: 0, expired: 0, suspended: 0 };
      for (const row of subscriptions) {
        subscriptionStats.total += row.count;
        if (row.status === 'ACTIVE') subscriptionStats.active = row.count;
        else if (row.status === 'CANCELLED') subscriptionStats.cancelled = row.count;
        else if (row.status === 'TRIAL') subscriptionStats.trial = row.count;
        else if (row.status === 'EXPIRED') subscriptionStats.expired = row.count;
        else if (row.status === 'SUSPENDED') subscriptionStats.suspended = row.count;
      }

      const invoiceStats = { total: 0, paid: 0, pending: 0, overdue: 0, revenue: 0, draft: 0 };
      for (const row of invoices) {
        invoiceStats.total += row.count || 0;
        if (row.status === 'PAID') { invoiceStats.paid += row.count; invoiceStats.revenue += row.total || 0; }
        else if (row.status === 'SENT' || row.status === 'PARTIAL') invoiceStats.pending += row.count;
        else if (row.status === 'OVERDUE') invoiceStats.overdue += row.count;
        else if (row.status === 'DRAFT') invoiceStats.draft += row.count;
      }

      const paymentStats = { total: 0, byMethod: {} };
      for (const row of payments) {
        paymentStats.total += row.count || 0;
        paymentStats.byMethod[row.method] = { count: row.count, total: row.total };
      }

      // Enhanced overview data for SuperAdminDashboard
      const revenueScope = scope('s.tenant_id');
      const [recentTenants, expiringLicenses, expiringSubs, recentPayments, moduleUsage, revenueByPlan, alerts, revenueThisMonthRow, mrrRow, expiringTenantsRow] = await Promise.all([
        db.all(`SELECT * FROM platform_tenants WHERE 1=1${tenantScope.clause} ORDER BY created_at DESC LIMIT 5`, tenantScope.params),
        db.all(`SELECT * FROM platform_licenses WHERE status = 'ACTIVE' AND expires_at < datetime('now', '+30 days')${tenantIdScope.clause} ORDER BY expires_at ASC LIMIT 5`, tenantIdScope.params),
        db.all(`SELECT * FROM platform_subscriptions WHERE status = 'ACTIVE' AND end_date < datetime('now', '+30 days')${tenantIdScope.clause} ORDER BY end_date ASC LIMIT 5`, tenantIdScope.params),
        db.all(`SELECT * FROM platform_payments WHERE 1=1${tenantIdScope.clause} ORDER BY created_at DESC LIMIT 5`, tenantIdScope.params),
        db.all('SELECT module_code, COUNT(*) as licenseCount FROM platform_plan_modules GROUP BY module_code'),
        db.all(`SELECT p.name as planName, SUM(s.price) as revenue, COUNT(*) as tenants FROM platform_subscriptions s JOIN platform_plans p ON p.id = s.plan_id WHERE s.status = 'ACTIVE'${revenueScope.clause} GROUP BY p.name`, revenueScope.params),
        db.all("SELECT * FROM platform_emergency_events WHERE status = 'ACTIVE' ORDER BY created_at DESC LIMIT 10"),
        db.get(`SELECT COALESCE(SUM(amount), 0) AS total FROM platform_payments WHERE substr(paid_at, 1, 7) = strftime('%Y-%m', 'now')${tenantIdScope.clause}`, tenantIdScope.params),
        db.get(`SELECT COALESCE(SUM(CASE s.billing_cycle
            WHEN 'MONTHLY' THEN s.price
            WHEN 'QUARTERLY' THEN s.price / 3.0
            WHEN 'YEARLY' THEN s.price / 12.0
            ELSE 0 END), 0) AS mrr
          FROM platform_subscriptions s
          WHERE s.status = 'ACTIVE'${revenueScope.clause}`, revenueScope.params),
        db.get(`SELECT COUNT(*) AS c FROM platform_tenants WHERE subscription_expires_at IS NOT NULL AND subscription_expires_at < datetime('now', '+30 days') AND subscription_expires_at > datetime('now')${tenantScope.clause}`, tenantScope.params),
      ]);

      // Emergency events may name affected tenants — limited-scope staff only
      // see events that affect their tenants (or platform-wide events).
      const visibleAlerts = Array.isArray(scoped)
        ? alerts.filter((a) => {
            let affected = [];
            try { affected = JSON.parse(a.affected_tenants || '[]'); } catch { affected = []; }
            if (!Array.isArray(affected) || affected.length === 0) return true;
            const allowed = new Set(scoped.map(String));
            return affected.some((t) => allowed.has(String(t)));
          })
        : alerts;

      const billing = {
        revenueTotal: invoiceStats.revenue,
        revenueThisMonth: Number(revenueThisMonthRow?.total) || 0,
        invoicedTotal: invoiceStats.total,
        outstanding: invoiceStats.pending,
        overdueInvoices: invoiceStats.overdue,
        mrr: Number(mrrRow?.mrr) || 0,
        invoicesTotal: invoiceStats.total,
        paidInvoices: invoiceStats.paid,
        draftInvoices: invoiceStats.draft,
      };

      res.json({
        data: {
          tenants: { ...tenantStats, expiringSoon: Number(expiringTenantsRow?.c) || 0 },
          licenses: { ...licenseStats, expiringSoon: expiringLicenses.length, expired: licenseStats.expired, suspended: licenseStats.suspended },
          subscriptions: { ...subscriptionStats, trial: subscriptionStats.trial, expired: subscriptionStats.expired, expiringSoon: expiringSubs.length },
          billing,
          devices: { boundLicenses: licenseStats.active, unboundLicenses: 0, devicesLimit: 0 },
          branches: { totalLimit: 0, installationBranches: 0 },
          releases,
          moduleUsage: moduleUsage.map(m => ({ moduleCode: m.module_code, licenseCount: m.licenseCount })),
          revenueByPlan,
          alerts: visibleAlerts.map(a => ({ id: a.id, type: a.event_type, message: a.title, severity: a.severity, createdAt: a.created_at })),
          recentTenants,
          expiringLicenses,
          expiringSubscriptions: expiringSubs,
          recentPayments,
          recentAudit: [],
          currentInstallation: { companyName: 'CeramiSys', currency: 'SAR', users: 0, products: 0, invoices: 0, customers: 0 },
          businessPerformance: {},
          customerMetrics: {},
          subscriptionMetrics: {},
          licenseMetrics: {},
          operationsMetrics: {},
          alertDetails: visibleAlerts,
          generatedAt: nowIso(),
        },
        requestId: req.requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── Platform Settings ──────────────────────────────────────────────────────
router.get(
  '/admin/settings',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.settings.view', 'platform.settings.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const rows = await db.all('SELECT key, value, updated_at, updated_by FROM platform_settings ORDER BY key');
      const settings = {};
      for (const row of rows) settings[row.key] = row.value;
      res.json({ data: settings, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/admin/settings',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.settings.update', 'platform.settings.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const updates = req.body || {};
      for (const [key, value] of Object.entries(updates)) {
        await db.run(
          `INSERT INTO platform_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
          [key, String(value), nowIso(), req.platformUser?.id]
        );
      }
      await recordAuditEvent({
        actorId: req.platformUser?.id,
        actorName: req.platformUser?.full_name,
        action: 'SETTINGS_UPDATED',
        resourceType: 'platform_settings',
        afterData: { keys: Object.keys(updates) },
        ipAddress: req.ip,
      });
      res.json({ data: { updated: Object.keys(updates).length }, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

// ── Product Modules & Feature Flags ────────────────────────────────────────
router.get(
  '/admin/modules',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.product.view', 'platform.product.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const modules = await db.all('SELECT * FROM platform_modules ORDER BY sort_order, name');
      res.json({ data: modules, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/admin/modules',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.product.create', 'platform.product.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { code, name, description, category, isActive, sortOrder } = req.body || {};
      if (!code || !name) return res.status(400).json({ error: 'code and name are required' });
      const id = `mod_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      await db.run(
        `INSERT INTO platform_modules (id, code, name, description, category, is_active, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, code, name, description || null, category || null, isActive ? 1 : 0, sortOrder || 0, nowIso(), nowIso()]
      );
      const module = await db.get('SELECT * FROM platform_modules WHERE id = ?', [id]);
      res.status(201).json({ data: module, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/admin/modules/:id',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.product.update', 'platform.product.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { name, description, category, isActive, sortOrder } = req.body || {};
      const updates = [];
      const params = [];
      if (name !== undefined) { updates.push('name = ?'); params.push(name); }
      if (description !== undefined) { updates.push('description = ?'); params.push(description); }
      if (category !== undefined) { updates.push('category = ?'); params.push(category); }
      if (isActive !== undefined) { updates.push('is_active = ?'); params.push(isActive ? 1 : 0); }
      if (sortOrder !== undefined) { updates.push('sort_order = ?'); params.push(sortOrder); }
      if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
      updates.push('updated_at = ?'); params.push(nowIso());
      params.push(req.params.id);
      await db.run(`UPDATE platform_modules SET ${updates.join(', ')} WHERE id = ?`, params);
      const module = await db.get('SELECT * FROM platform_modules WHERE id = ?', [req.params.id]);
      res.json({ data: module, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/admin/feature-flags',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.product.view', 'platform.product.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const flags = await db.all('SELECT * FROM platform_feature_flags ORDER BY key');
      res.json({ data: flags, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/admin/feature-flags',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.product.create', 'platform.product.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { key, name, description, isEnabled, rolloutPercentage, targetTenants, pagePaths } = req.body || {};
      if (!key || !name) return res.status(400).json({ error: 'key and name are required' });
      const id = `ff_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      await db.run(
        `INSERT INTO platform_feature_flags (id, key, name, description, is_enabled, rollout_percentage, target_tenants, page_paths, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, key, name, description || null, isEnabled ? 1 : 0, rolloutPercentage || 0, JSON.stringify(targetTenants || []), JSON.stringify(pagePaths || []), nowIso(), nowIso()]
      );
      const flag = await db.get('SELECT * FROM platform_feature_flags WHERE id = ?', [id]);
      res.status(201).json({ data: flag, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/admin/feature-flags/:id',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.product.update', 'platform.product.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { name, description, isEnabled, rolloutPercentage, targetTenants, pagePaths } = req.body || {};
      const updates = [];
      const params = [];
      if (name !== undefined) { updates.push('name = ?'); params.push(name); }
      if (description !== undefined) { updates.push('description = ?'); params.push(description); }
      if (isEnabled !== undefined) { updates.push('is_enabled = ?'); params.push(isEnabled ? 1 : 0); }
      if (rolloutPercentage !== undefined) { updates.push('rollout_percentage = ?'); params.push(rolloutPercentage); }
      if (targetTenants !== undefined) { updates.push('target_tenants = ?'); params.push(JSON.stringify(targetTenants)); }
      if (pagePaths !== undefined) { updates.push('page_paths = ?'); params.push(JSON.stringify(pagePaths)); }
      if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
      updates.push('updated_at = ?'); params.push(nowIso());
      params.push(req.params.id);
      await db.run(`UPDATE platform_feature_flags SET ${updates.join(', ')} WHERE id = ?`, params);
      const flag = await db.get('SELECT * FROM platform_feature_flags WHERE id = ?', [req.params.id]);
      res.json({ data: flag, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  '/admin/feature-flags/:id',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.product.delete', 'platform.product.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const flag = await db.get('SELECT * FROM platform_feature_flags WHERE id = ?', [req.params.id]);
      if (!flag) return res.status(404).json({ error: 'Feature flag not found' });
      await db.run('DELETE FROM platform_feature_flags WHERE id = ?', [req.params.id]);
      await recordAuditEvent({
        actorId: req.platformUser?.id,
        action: 'FEATURE_FLAG_DELETED',
        resourceType: 'platform_feature_flags',
        resourceId: req.params.id,
        beforeData: { key: flag.key, name: flag.name },
        ipAddress: req.ip,
      });
      res.json({ data: { deleted: true }, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

// ── Feature flag overrides (per TENANT / PLAN / STAGING_GROUP) ─────────────
const OVERRIDE_TARGET_TYPES = ['TENANT', 'PLAN', 'STAGING_GROUP'];

function mapFlagOverrideRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    featureId: row.feature_flag_id,
    targetType: row.target_type,
    targetId: row.target_id,
    targetName: row.target_name ?? null,
    isEnabled: Boolean(row.is_enabled),
    customRolloutPercent: row.custom_rollout_percent ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getFlagOverrideRows(db, flagId) {
  return db.all(
    `SELECT o.*, t.name AS target_name
     FROM platform_feature_flag_overrides o
     LEFT JOIN platform_tenants t ON o.target_type = 'TENANT' AND t.id = o.target_id
     WHERE o.feature_flag_id = ?
     ORDER BY o.created_at ASC`,
    [flagId]
  );
}

router.get(
  '/admin/feature-flags/:id/overrides',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.product.view', 'platform.product.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const flag = await db.get('SELECT id FROM platform_feature_flags WHERE id = ?', [req.params.id]);
      if (!flag) return res.status(404).json({ error: 'Feature flag not found' });
      const rows = await getFlagOverrideRows(db, flag.id);
      // Resolve PLAN target names (and fall back for STAGING_GROUP) in a second pass.
      const planIds = [...new Set(rows.filter((r) => r.target_type === 'PLAN').map((r) => r.target_id))];
      const planNames = new Map();
      if (planIds.length) {
        const plans = await db.all(
          `SELECT id, name FROM platform_plans WHERE id IN (${planIds.map(() => '?').join(',')})`,
          planIds
        );
        for (const p of plans) planNames.set(p.id, p.name);
      }
      const data = rows.map((row) => {
        let targetName = row.target_name ?? null;
        if (row.target_type === 'PLAN') targetName = planNames.get(row.target_id) ?? null;
        if (row.target_type === 'STAGING_GROUP') targetName = row.target_id;
        return mapFlagOverrideRow({ ...row, target_name: targetName });
      });
      res.json({ data, meta: { total: data.length }, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/admin/feature-flags/:id/overrides',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.product.update', 'platform.product.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const flag = await db.get('SELECT id FROM platform_feature_flags WHERE id = ?', [req.params.id]);
      if (!flag) return res.status(404).json({ error: 'Feature flag not found' });
      const { targetType, targetId, isEnabled, customRolloutPercent } = req.body || {};
      if (!OVERRIDE_TARGET_TYPES.includes(targetType)) {
        return res.status(400).json({ error: `targetType must be one of ${OVERRIDE_TARGET_TYPES.join(', ')}` });
      }
      if (!targetId || !String(targetId).trim()) {
        return res.status(400).json({ error: 'targetId is required' });
      }
      if (typeof isEnabled !== 'boolean') {
        return res.status(400).json({ error: 'isEnabled must be a boolean' });
      }
      let percent = null;
      if (customRolloutPercent !== undefined && customRolloutPercent !== null) {
        const parsed = Number(customRolloutPercent);
        if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
          return res.status(400).json({ error: 'customRolloutPercent must be an integer between 0 and 100' });
        }
        percent = parsed;
      }
      const id = `ffo_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      const now = nowIso();
      await db.run(
        `INSERT INTO platform_feature_flag_overrides
          (id, feature_flag_id, target_type, target_id, is_enabled, custom_rollout_percent, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(feature_flag_id, target_type, target_id)
         DO UPDATE SET is_enabled = excluded.is_enabled,
                       custom_rollout_percent = excluded.custom_rollout_percent,
                       updated_at = excluded.updated_at`,
        [id, flag.id, targetType, String(targetId).trim(), isEnabled ? 1 : 0, percent, now, now]
      );
      const row = await db.get(
        'SELECT * FROM platform_feature_flag_overrides WHERE feature_flag_id = ? AND target_type = ? AND target_id = ?',
        [flag.id, targetType, String(targetId).trim()]
      );
      await recordAuditEvent({
        actorId: req.platformUser?.id,
        action: 'FEATURE_FLAG_OVERRIDE_UPSERTED',
        resourceType: 'platform_feature_flag_overrides',
        resourceId: row.id,
        afterData: { featureFlagId: flag.id, targetType, targetId: String(targetId).trim(), isEnabled, customRolloutPercent: percent },
        ipAddress: req.ip,
      });
      res.json({ data: mapFlagOverrideRow(row), requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  '/admin/feature-flags/:id/overrides/:overrideId',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.product.delete', 'platform.product.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const row = await db.get(
        'SELECT * FROM platform_feature_flag_overrides WHERE id = ? AND feature_flag_id = ?',
        [req.params.overrideId, req.params.id]
      );
      if (!row) return res.status(404).json({ error: 'Override not found' });
      await db.run('DELETE FROM platform_feature_flag_overrides WHERE id = ?', [row.id]);
      await recordAuditEvent({
        actorId: req.platformUser?.id,
        action: 'FEATURE_FLAG_OVERRIDE_DELETED',
        resourceType: 'platform_feature_flag_overrides',
        resourceId: row.id,
        beforeData: { featureFlagId: row.feature_flag_id, targetType: row.target_type, targetId: row.target_id },
        ipAddress: req.ip,
      });
      res.json({ data: { deleted: true }, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

// ── Staff Sessions, Devices & Invites ──────────────────────────────────────
router.get(
  '/admin/staff/sessions',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.staff.view', 'platform.staff.manage_sessions']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const sessions = await db.all(
        `SELECT s.*, u.full_name as staff_name, u.email as staff_email
         FROM platform_staff_sessions s
         LEFT JOIN platform_users u ON u.id = s.staff_id
         WHERE s.is_active = 1
         ORDER BY s.last_activity_at DESC`
      );
      res.json({ data: sessions, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  '/admin/staff/sessions/:id',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.staff.manage_sessions']),
  async (req, res, next) => {
    try {
      const db = getDb();
      await db.run('UPDATE platform_staff_sessions SET is_active = 0 WHERE id = ?', [req.params.id]);
      await recordAuditEvent({
        actorId: req.platformUser?.id,
        action: 'STAFF_SESSION_REVOKED',
        resourceType: 'platform_staff_sessions',
        resourceId: req.params.id,
        ipAddress: req.ip,
      });
      res.json({ data: { revoked: true }, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/admin/staff/devices',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.staff.view', 'platform.staff.manage_devices']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const devices = await db.all(
        `SELECT d.*, u.full_name as staff_name, u.email as staff_email
         FROM platform_staff_devices d
         LEFT JOIN platform_users u ON u.id = d.staff_id
         ORDER BY d.last_seen_at DESC`
      );
      res.json({ data: devices, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  '/admin/staff/devices/:id',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.staff.manage_devices']),
  async (req, res, next) => {
    try {
      const db = getDb();
      await db.run('DELETE FROM platform_staff_devices WHERE id = ?', [req.params.id]);
      await recordAuditEvent({
        actorId: req.platformUser?.id,
        action: 'STAFF_DEVICE_REVOKED',
        resourceType: 'platform_staff_devices',
        resourceId: req.params.id,
        ipAddress: req.ip,
      });
      res.json({ data: { revoked: true }, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/admin/staff/invites',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.staff.view', 'platform.staff.manage_invites']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const invites = await db.all(
        `SELECT i.*, u.full_name as invited_by_name
         FROM platform_staff_invites i
         LEFT JOIN platform_users u ON u.id = i.invited_by
         ORDER BY i.created_at DESC`
      );
      res.json({ data: invites, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/admin/staff/invites',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.staff.create', 'platform.staff.manage_invites']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { email, fullName, phone, role, expiresInDays = 7 } = req.body || {};
      if (!email || !fullName) return res.status(400).json({ error: 'email and fullName are required' });
      const id = `inv_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      const token = uuidv4().replace(/-/g, '');
      const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
      await db.run(
        `INSERT INTO platform_staff_invites (id, email, full_name, phone, role, token_hash, expires_at, invited_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, email, fullName, phone || null, role || 'SUPPORT_AGENT', token, expiresAt, req.platformUser?.id, nowIso()]
      );
      const invite = await db.get('SELECT * FROM platform_staff_invites WHERE id = ?', [id]);
      await recordAuditEvent({
        actorId: req.platformUser?.id,
        action: 'STAFF_INVITE_CREATED',
        resourceType: 'platform_staff_invites',
        resourceId: id,
        afterData: { email, role },
        ipAddress: req.ip,
      });
      res.status(201).json({ data: { ...invite, token }, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  '/admin/staff/invites/:id',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.staff.manage_invites']),
  async (req, res, next) => {
    try {
      const db = getDb();
      await db.run('UPDATE platform_staff_invites SET revoked_at = ? WHERE id = ?', [nowIso(), req.params.id]);
      await recordAuditEvent({
        actorId: req.platformUser?.id,
        action: 'STAFF_INVITE_REVOKED',
        resourceType: 'platform_staff_invites',
        resourceId: req.params.id,
        ipAddress: req.ip,
      });
      res.json({ data: { revoked: true }, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

// ── Security Center ────────────────────────────────────────────────────────
router.get(
  '/admin/security/overview',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.security.view', 'platform.security.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const [events, apiKeys, activeSessions, failedLogins] = await Promise.all([
        db.all('SELECT severity, COUNT(*) as count FROM platform_security_events WHERE created_at > datetime("now", "-24 hours") GROUP BY severity'),
        db.all('SELECT COUNT(*) as count FROM platform_api_keys WHERE is_active = 1'),
        db.all('SELECT COUNT(*) as count FROM platform_staff_sessions WHERE is_active = 1'),
        db.all('SELECT COUNT(*) as count FROM platform_login_attempts WHERE success = 0 AND created_at > datetime("now", "-24 hours")'),
      ]);
      res.json({
        data: {
          events24h: events,
          activeApiKeys: apiKeys[0]?.count || 0,
          activeSessions: activeSessions[0]?.count || 0,
          failedLogins24h: failedLogins[0]?.count || 0,
        },
        requestId: req.requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/admin/security/events',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.security.view', 'platform.security.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { severity, eventType, limit = 100 } = req.query;
      let query = 'SELECT * FROM platform_security_events WHERE 1=1';
      const params = [];
      if (severity) { query += ' AND severity = ?'; params.push(severity); }
      if (eventType) { query += ' AND event_type = ?'; params.push(eventType); }
      query += ' ORDER BY created_at DESC LIMIT ?';
      params.push(Number(limit));
      const events = await db.all(query, params);
      res.json({ data: events, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/admin/security/api-keys',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.security.view', 'platform.security.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const keys = await db.all('SELECT id, name, prefix, scopes, is_active, last_used_at, expires_at, created_at, revoked_at FROM platform_api_keys ORDER BY created_at DESC');
      res.json({ data: keys, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/admin/security/api-keys',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.security.create', 'platform.security.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { name, scopes, expiresInDays } = req.body || {};
      if (!name) return res.status(400).json({ error: 'name is required' });
      const id = `key_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      const key = `pk_${uuidv4().replace(/-/g, '')}`;
      const keyHash = require('crypto').createHash('sha256').update(key).digest('hex');
      const prefix = key.slice(0, 12);
      const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString() : null;
      await db.run(
        `INSERT INTO platform_api_keys (id, name, key_hash, prefix, scopes, is_active, expires_at, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
        [id, name, keyHash, prefix, JSON.stringify(scopes || []), expiresAt, req.platformUser?.id, nowIso()]
      );
      const apiKey = await db.get('SELECT id, name, prefix, scopes, is_active, expires_at, created_at FROM platform_api_keys WHERE id = ?', [id]);
      res.status(201).json({ data: { ...apiKey, key }, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  '/admin/security/api-keys/:id',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.security.delete', 'platform.security.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      await db.run('UPDATE platform_api_keys SET is_active = 0, revoked_at = ? WHERE id = ?', [nowIso(), req.params.id]);
      await recordAuditEvent({
        actorId: req.platformUser?.id,
        action: 'API_KEY_REVOKED',
        resourceType: 'platform_api_keys',
        resourceId: req.params.id,
        ipAddress: req.ip,
      });
      res.json({ data: { revoked: true }, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

// ── Signing Keys ───────────────────────────────────────────────────────────
router.get(
  '/admin/security/signing-keys',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.security.view', 'platform.security.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { getKeyId } = require('../lib/signing');
      const keys = await db.all(
        'SELECT id, key_id AS keyId, is_active AS isActive, created_at AS createdAt, expires_at AS expiresAt FROM platform_signing_keys ORDER BY created_at DESC'
      );
      res.json({ data: { keys, currentKeyId: getKeyId() }, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/admin/security/signing-keys/rotate',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.security.update', 'platform.security.manage']),
  async (req, res, next) => {
    try {
      const { rotateSigningKey, getKeyId } = require('../lib/signing');
      const rotated = await rotateSigningKey();
      await recordAuditEvent({
        actorId: req.platformUser?.id,
        actorName: req.platformUser?.full_name,
        action: 'SIGNING_KEY_ROTATED',
        resourceType: 'platform_signing_keys',
        resourceId: rotated.keyId,
        afterData: { keyId: rotated.keyId, publicKey: rotated.publicKey },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      res.json({ data: { keyId: rotated.keyId, currentKeyId: getKeyId() }, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

// ── IP Bans ────────────────────────────────────────────────────────────────
// A ban blocks every /api/v1 request from the address (see middleware/ipBan.js),
// which cuts the whole device off from the central platform until lifted.
router.get(
  '/admin/security/ip-bans',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.security.view', 'platform.security.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { active } = req.query;
      let query = 'SELECT * FROM platform_ip_bans WHERE 1=1';
      const params = [];
      if (active === '1' || active === 'true') {
        query += ' AND is_active = 1 AND (expires_at IS NULL OR expires_at > ?)';
        params.push(nowIso());
      }
      query += ' ORDER BY is_active DESC, created_at DESC';
      const bans = await db.all(query, params);
      res.json({ data: bans, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/admin/security/ip-bans',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.security.update', 'platform.security.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { ipAddress, ip, reason, expiresAt } = req.body || {};
      const target = normalizeBanTarget(ipAddress || ip || '');
      if (!target) {
        return res.status(400).json({ error: 'ipAddress must be a valid IPv4/IPv6 address or IPv4 CIDR' });
      }
      if (isLoopbackTarget(target)) {
        return res.status(400).json({ error: 'Loopback addresses cannot be banned' });
      }

      let expiresIso = null;
      if (expiresAt) {
        const parsed = new Date(expiresAt);
        if (Number.isNaN(parsed.getTime())) {
          return res.status(400).json({ error: 'expiresAt must be a valid date' });
        }
        expiresIso = parsed.toISOString();
      }

      const existing = await db.get(
        'SELECT id FROM platform_ip_bans WHERE ip_address = ? AND is_active = 1',
        [target]
      );
      if (existing) {
        return res.status(409).json({ error: 'This address already has an active ban' });
      }

      const id = `ipban_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      await db.run(
        `INSERT INTO platform_ip_bans (id, ip_address, reason, is_active, expires_at, banned_by, banned_by_name, created_at, updated_at)
         VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)`,
        [id, target, reason || null, expiresIso, req.platformUser?.id || null, req.platformUser?.full_name || null, nowIso(), nowIso()]
      );
      const ban = await db.get('SELECT * FROM platform_ip_bans WHERE id = ?', [id]);

      await recordAuditEvent({
        actorId: req.platformUser?.id,
        actorName: req.platformUser?.full_name,
        action: 'IP_BANNED',
        resourceType: 'platform_ip_bans',
        resourceId: id,
        afterData: { ipAddress: target, reason: reason || null, expiresAt: expiresIso },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.status(201).json({ data: ban, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/admin/security/ip-bans/:id/lift',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.security.update', 'platform.security.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const ban = await db.get('SELECT * FROM platform_ip_bans WHERE id = ?', [req.params.id]);
      if (!ban) return res.status(404).json({ error: 'IP ban not found' });
      if (!ban.is_active) {
        return res.status(409).json({ error: 'This ban is already lifted' });
      }

      await db.run(
        `UPDATE platform_ip_bans SET is_active = 0, lifted_at = ?, lifted_by = ?, updated_at = ? WHERE id = ?`,
        [nowIso(), req.platformUser?.id || null, nowIso(), ban.id]
      );

      await recordAuditEvent({
        actorId: req.platformUser?.id,
        actorName: req.platformUser?.full_name,
        action: 'IP_BAN_LIFTED',
        resourceType: 'platform_ip_bans',
        resourceId: ban.id,
        beforeData: { ipAddress: ban.ip_address, reason: ban.reason },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      const updated = await db.get('SELECT * FROM platform_ip_bans WHERE id = ?', [ban.id]);
      res.json({ data: updated, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

// ── Analytics ──────────────────────────────────────────────────────────────
router.get(
  '/admin/analytics/events',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.analytics.view', 'platform.analytics.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { eventType, tenantId, limit = 100 } = req.query;
      let query = 'SELECT * FROM platform_analytics_events WHERE 1=1';
      const params = [];
      if (eventType) { query += ' AND event_type = ?'; params.push(eventType); }
      if (tenantId) { query += ' AND tenant_id = ?'; params.push(tenantId); }
      query += ' ORDER BY created_at DESC LIMIT ?';
      params.push(Number(limit));
      const events = await db.all(query, params);
      res.json({ data: events, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/admin/analytics/summary',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.analytics.view', 'platform.analytics.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const [eventTypes, tenantActivity, dailyEvents] = await Promise.all([
        db.all('SELECT event_type, COUNT(*) as count FROM platform_analytics_events GROUP BY event_type ORDER BY count DESC'),
        db.all('SELECT tenant_id, COUNT(*) as count FROM platform_analytics_events WHERE tenant_id IS NOT NULL GROUP BY tenant_id ORDER BY count DESC LIMIT 10'),
        db.all(`SELECT DATE(created_at) as date, COUNT(*) as count FROM platform_analytics_events WHERE created_at > datetime("now", "-30 days") GROUP BY DATE(created_at) ORDER BY date`),
      ]);
      res.json({
        data: { eventTypes, tenantActivity, dailyEvents },
        requestId: req.requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── Emergency Center ───────────────────────────────────────────────────────
router.get(
  '/admin/emergency/events',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.emergency.view', 'platform.emergency.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const events = await db.all('SELECT * FROM platform_emergency_events ORDER BY created_at DESC');
      res.json({ data: events, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/admin/emergency/events',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.emergency.create', 'platform.emergency.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { title, description, severity, affectedTenants } = req.body || {};
      if (!title) return res.status(400).json({ error: 'title is required' });
      const id = `em_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      await db.run(
        `INSERT INTO platform_emergency_events (id, title, description, severity, status, affected_tenants, created_by, created_at)
         VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?)`,
        [id, title, description || null, severity || 'MEDIUM', JSON.stringify(affectedTenants || []), req.platformUser?.id, nowIso()]
      );
      const event = await db.get('SELECT * FROM platform_emergency_events WHERE id = ?', [id]);
      await recordAuditEvent({
        actorId: req.platformUser?.id,
        action: 'EMERGENCY_EVENT_CREATED',
        resourceType: 'platform_emergency_events',
        resourceId: id,
        afterData: { title, severity },
        ipAddress: req.ip,
      });
      res.status(201).json({ data: event, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/admin/emergency/events/:id',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.emergency.update', 'platform.emergency.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { status, actionsTaken, resolvedAt } = req.body || {};
      const updates = [];
      const params = [];
      if (status !== undefined) { updates.push('status = ?'); params.push(status); }
      if (actionsTaken !== undefined) { updates.push('actions_taken = ?'); params.push(actionsTaken); }
      if (resolvedAt !== undefined) { updates.push('resolved_at = ?'); params.push(resolvedAt); }
      if (status === 'RESOLVED') { updates.push('resolved_at = ?'); params.push(nowIso()); }
      if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
      params.push(req.params.id);
      await db.run(`UPDATE platform_emergency_events SET ${updates.join(', ')} WHERE id = ?`, params);
      const event = await db.get('SELECT * FROM platform_emergency_events WHERE id = ?', [req.params.id]);
      res.json({ data: event, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

// ── Sync Monitor ───────────────────────────────────────────────────────────
router.get(
  '/admin/sync/events',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.sync.view', 'platform.sync.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { tenantId, status, limit = 100 } = req.query;
      let query = 'SELECT * FROM platform_sync_events WHERE 1=1';
      const params = [];
      if (tenantId) { query += ' AND tenant_id = ?'; params.push(tenantId); }
      if (status) { query += ' AND status = ?'; params.push(status); }
      query += ' ORDER BY created_at DESC LIMIT ?';
      params.push(Number(limit));
      const events = await db.all(query, params);
      res.json({ data: events, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/admin/sync/status',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.sync.view', 'platform.sync.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const [pending, processing, completed, failed] = await Promise.all([
        db.all('SELECT COUNT(*) as count FROM platform_sync_events WHERE status = ?' , ['PENDING']),
        db.all('SELECT COUNT(*) as count FROM platform_sync_events WHERE status = ?' , ['PROCESSING']),
        db.all('SELECT COUNT(*) as count FROM platform_sync_events WHERE status = ?' , ['COMPLETED']),
        db.all('SELECT COUNT(*) as count FROM platform_sync_events WHERE status = ?' , ['FAILED']),
      ]);
      res.json({
        data: {
          pending: pending[0]?.count || 0,
          processing: processing[0]?.count || 0,
          completed: completed[0]?.count || 0,
          failed: failed[0]?.count || 0,
        },
        requestId: req.requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── Branding ───────────────────────────────────────────────────────────────
router.get(
  '/admin/branding',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.branding.view', 'platform.branding.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const branding = await db.get('SELECT * FROM platform_branding WHERE id = ?', ['default']);
      res.json({ data: branding || {}, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/admin/branding',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.branding.update', 'platform.branding.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { logoUrl, primaryColor, secondaryColor, fontFamily, customCss, loginBgUrl, invoiceTemplate } = req.body || {};
      await db.run(
        `INSERT INTO platform_branding (id, logo_url, primary_color, secondary_color, font_family, custom_css, login_bg_url, invoice_template, updated_at, updated_by)
         VALUES ('default', ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET logo_url = excluded.logo_url, primary_color = excluded.primary_color, secondary_color = excluded.secondary_color, font_family = excluded.font_family, custom_css = excluded.custom_css, login_bg_url = excluded.login_bg_url, invoice_template = excluded.invoice_template, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
        [logoUrl || null, primaryColor || null, secondaryColor || null, fontFamily || null, customCss || null, loginBgUrl || null, invoiceTemplate || null, nowIso(), req.platformUser?.id]
      );
      const branding = await db.get('SELECT * FROM platform_branding WHERE id = ?', ['default']);
      res.json({ data: branding, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

// ── Customization ──────────────────────────────────────────────────────────
router.get(
  '/admin/customization',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.customization.view', 'platform.customization.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { tenantId, pageKey } = req.query;
      let query = 'SELECT * FROM platform_customization WHERE 1=1';
      const params = [];
      if (tenantId) { query += ' AND tenant_id = ?'; params.push(tenantId); }
      if (pageKey) { query += ' AND page_key = ?'; params.push(pageKey); }
      query += ' ORDER BY page_key, custom_order';
      const items = await db.all(query, params);
      res.json({ data: items, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/admin/customization',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.customization.update', 'platform.customization.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { tenantId, pageKey, elementKey, isVisible, customLabel, customOrder, metadata } = req.body || {};
      if (!pageKey || !elementKey) return res.status(400).json({ error: 'pageKey and elementKey are required' });
      const id = `cust_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      await db.run(
        `INSERT INTO platform_customization (id, tenant_id, page_key, element_key, is_visible, custom_label, custom_order, metadata, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT DO NOTHING`,
        [id, tenantId || null, pageKey, elementKey, isVisible ? 1 : 0, customLabel || null, customOrder || null, metadata ? JSON.stringify(metadata) : null, nowIso()]
      );
      const item = await db.get('SELECT * FROM platform_customization WHERE id = ?', [id]);
      res.json({ data: item, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

// ── App Configuration ──────────────────────────────────────────────────────
router.get(
  '/admin/app-config',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.appconfig.view', 'platform.appconfig.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const configs = await db.all('SELECT * FROM platform_app_config ORDER BY config_key');
      res.json({ data: configs, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/admin/app-config',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.appconfig.update', 'platform.appconfig.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { configKey, configValue, description, isActive } = req.body || {};
      if (!configKey || configValue === undefined) return res.status(400).json({ error: 'configKey and configValue are required' });
      const id = `cfg_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      await db.run(
        `INSERT INTO platform_app_config (id, config_key, config_value, description, is_active, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(config_key) DO UPDATE SET config_value = excluded.config_value, description = excluded.description, is_active = excluded.is_active, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
        [id, configKey, String(configValue), description || null, isActive ? 1 : 1, nowIso(), req.platformUser?.id]
      );
      const config = await db.get('SELECT * FROM platform_app_config WHERE config_key = ?', [configKey]);
      res.json({ data: config, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

// ── Activity Settings ──────────────────────────────────────────────────────
router.get(
  '/admin/activity-settings',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.activity.view', 'platform.activity.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const settings = await db.all('SELECT * FROM platform_activity_settings ORDER BY activity_type');
      res.json({ data: settings, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/admin/activity-settings',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.activity.update', 'platform.activity.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { activityType, isEnabled, settings } = req.body || {};
      if (!activityType) return res.status(400).json({ error: 'activityType is required' });
      const id = `act_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      await db.run(
        `INSERT INTO platform_activity_settings (id, activity_type, is_enabled, settings, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT DO NOTHING`,
        [id, activityType, isEnabled ? 1 : 0, settings ? JSON.stringify(settings) : null, nowIso()]
      );
      const item = await db.get('SELECT * FROM platform_activity_settings WHERE id = ?', [id]);
      res.json({ data: item, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

// ── Integration Providers ──────────────────────────────────────────────────
router.get(
  '/admin/integrations/providers',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.integrations.view', 'platform.integrations.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const [payments, sms] = await Promise.all([
        db.all('SELECT id, provider_code, provider_name, is_enabled, config, updated_at FROM platform_payment_providers ORDER BY provider_name'),
        db.all('SELECT id, provider_code, provider_name, is_enabled, sender_id, daily_quota, updated_at FROM platform_sms_providers ORDER BY provider_name'),
      ]);
      res.json({ data: { payments, sms }, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/admin/integrations/providers',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.integrations.update', 'platform.integrations.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { type, providerCode, providerName, isEnabled, config, senderId, dailyQuota } = req.body || {};
      if (!type || !providerCode) return res.status(400).json({ error: 'type and providerCode are required' });
      const table = type === 'payment' ? 'platform_payment_providers' : 'platform_sms_providers';
      const id = `${type === 'payment' ? 'pay' : 'sms'}_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      if (type === 'payment') {
        await db.run(
          `INSERT INTO platform_payment_providers (id, provider_code, provider_name, is_enabled, config, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(provider_code) DO UPDATE SET provider_name = excluded.provider_name, is_enabled = excluded.is_enabled, config = excluded.config, updated_at = excluded.updated_at`,
          [id, providerCode, providerName || providerCode, isEnabled ? 1 : 0, config ? JSON.stringify(config) : null, nowIso()]
        );
      } else {
        await db.run(
          `INSERT INTO platform_sms_providers (id, provider_code, provider_name, is_enabled, sender_id, config, daily_quota, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(provider_code) DO UPDATE SET provider_name = excluded.provider_name, is_enabled = excluded.is_enabled, sender_id = excluded.sender_id, config = excluded.config, daily_quota = excluded.daily_quota, updated_at = excluded.updated_at`,
          [id, providerCode, providerName || providerCode, isEnabled ? 1 : 0, senderId || null, config ? JSON.stringify(config) : null, dailyQuota || 5000, nowIso()]
        );
      }
      res.json({ data: { updated: true }, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

// ── Admin Control ──────────────────────────────────────────────────────────
router.get(
  '/admin/admin-control/actions',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.admincontrol.view', 'platform.admincontrol.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const actions = await db.all('SELECT * FROM platform_admin_actions ORDER BY created_at DESC LIMIT 100');
      res.json({ data: actions, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/admin/admin-control/actions',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.admincontrol.create', 'platform.admincontrol.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { actionType, targetType, targetId, details } = req.body || {};
      if (!actionType) return res.status(400).json({ error: 'actionType is required' });
      const id = `act_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      await db.run(
        `INSERT INTO platform_admin_actions (id, action_type, target_type, target_id, details, status, executed_by, created_at)
         VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
        [id, actionType, targetType || null, targetId || null, details ? JSON.stringify(details) : null, req.platformUser?.id, nowIso()]
      );
      const action = await db.get('SELECT * FROM platform_admin_actions WHERE id = ?', [id]);
      await recordAuditEvent({
        actorId: req.platformUser?.id,
        action: 'ADMIN_ACTION_CREATED',
        resourceType: 'platform_admin_actions',
        resourceId: id,
        afterData: { actionType, targetType, targetId },
        ipAddress: req.ip,
      });
      res.status(201).json({ data: action, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

// ── System & Platform Health ───────────────────────────────────────────────
router.get(
  '/admin/system-health',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.health.view', 'platform.health.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const metrics = await db.all(
        `SELECT metric_name, metric_value, metric_unit, status, details, recorded_at
         FROM platform_health_metrics
         WHERE recorded_at > datetime("now", "-1 hour")
         ORDER BY recorded_at DESC`
      );
      const latest = {};
      for (const m of metrics) {
        if (!latest[m.metric_name]) latest[m.metric_name] = m;
      }
      res.json({ data: Object.values(latest), requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/admin/system-health',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.health.report', 'platform.health.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { metricName, metricValue, metricUnit, status, details } = req.body || {};
      if (!metricName) return res.status(400).json({ error: 'metricName is required' });
      const id = `hm_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      await db.run(
        `INSERT INTO platform_health_metrics (id, metric_name, metric_value, metric_unit, status, details, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, metricName, Number(metricValue) || 0, metricUnit || null, status || 'OK', details ? JSON.stringify(details) : null, nowIso()]
      );
      res.status(201).json({ data: { id }, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

// ── Analytics (Complex Metrics) ───────────────────────────────────────────
router.get(
  '/admin/analytics/business-performance',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.analytics.view', 'platform.analytics.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { period = '30d' } = req.query;
      const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const [revenue, tenants, licenses, invoices] = await Promise.all([
        db.all('SELECT SUM(amount) as total FROM platform_payments WHERE created_at > ?', [since]),
        db.all('SELECT COUNT(*) as count FROM platform_tenants WHERE created_at > ?', [since]),
        db.all('SELECT COUNT(*) as count FROM platform_licenses WHERE created_at > ?', [since]),
        db.all('SELECT COUNT(*) as count, SUM(total) as total FROM platform_invoices WHERE created_at > ?', [since]),
      ]);
      res.json({
        data: {
          period,
          revenue: revenue[0]?.total || 0,
          newTenants: tenants[0]?.count || 0,
          newLicenses: licenses[0]?.count || 0,
          invoices: invoices[0]?.count || 0,
          invoiceTotal: invoices[0]?.total || 0,
        },
        requestId: req.requestId,
      });
    } catch (err) { next(err); }
  }
);

router.get(
  '/admin/analytics/customer-metrics',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.analytics.view', 'platform.analytics.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { period = '30d' } = req.query;
      const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const [total, active, trial, churned] = await Promise.all([
        db.all('SELECT COUNT(*) as count FROM platform_tenants'),
        db.all("SELECT COUNT(*) as count FROM platform_tenants WHERE status = 'ACTIVE'"),
        db.all("SELECT COUNT(*) as count FROM platform_tenants WHERE status = 'TRIAL'"),
        db.all("SELECT COUNT(*) as count FROM platform_tenants WHERE status = 'CANCELLED' AND updated_at > ?", [since]),
      ]);
      res.json({
        data: {
          total: total[0]?.count || 0,
          active: active[0]?.count || 0,
          trial: trial[0]?.count || 0,
          churned: churned[0]?.count || 0,
          churnRate: total[0]?.count ? ((churned[0]?.count || 0) / total[0].count * 100).toFixed(2) : 0,
        },
        requestId: req.requestId,
      });
    } catch (err) { next(err); }
  }
);

router.get(
  '/admin/analytics/license-metrics',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.analytics.view', 'platform.analytics.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const [total, active, revoked, expiring] = await Promise.all([
        db.all('SELECT COUNT(*) as count FROM platform_licenses'),
        db.all("SELECT COUNT(*) as count FROM platform_licenses WHERE status = 'ACTIVE'"),
        db.all("SELECT COUNT(*) as count FROM platform_licenses WHERE status = 'REVOKED'"),
        db.all("SELECT COUNT(*) as count FROM platform_licenses WHERE status = 'ACTIVE' AND expires_at < datetime('now', '+30 days')"),
      ]);
      res.json({
        data: {
          total: total[0]?.count || 0,
          active: active[0]?.count || 0,
          revoked: revoked[0]?.count || 0,
          expiringSoon: expiring[0]?.count || 0,
        },
        requestId: req.requestId,
      });
    } catch (err) { next(err); }
  }
);

router.get(
  '/admin/analytics/subscription-metrics',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.analytics.view', 'platform.analytics.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const [total, active, cancelled, mrr] = await Promise.all([
        db.all('SELECT COUNT(*) as count FROM platform_subscriptions'),
        db.all("SELECT COUNT(*) as count FROM platform_subscriptions WHERE status = 'ACTIVE'"),
        db.all("SELECT COUNT(*) as count FROM platform_subscriptions WHERE status = 'CANCELLED'"),
        db.all("SELECT SUM(p.price) as total FROM platform_subscriptions s JOIN platform_plans p ON p.id = s.plan_id WHERE s.status = 'ACTIVE'"),
      ]);
      res.json({
        data: {
          total: total[0]?.count || 0,
          active: active[0]?.count || 0,
          cancelled: cancelled[0]?.count || 0,
          mrr: mrr[0]?.total || 0,
        },
        requestId: req.requestId,
      });
    } catch (err) { next(err); }
  }
);

router.get(
  '/admin/analytics/operations-metrics',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.analytics.view', 'platform.analytics.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const [jobs, backups, errors] = await Promise.all([
        db.all('SELECT status, COUNT(*) as count FROM platform_ops_jobs GROUP BY status'),
        db.all('SELECT status, COUNT(*) as count FROM platform_backups GROUP BY status'),
        db.all('SELECT status, COUNT(*) as count FROM platform_error_reports GROUP BY status'),
      ]);
      res.json({ data: { jobs, backups, errors }, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

// ── Tenant Branding (versioned) ───────────────────────────────────────────
router.get(
  '/admin/branding/tenant/:tenantId',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.branding.view', 'platform.branding.manage']),
  async (req, res, next) => {
    try {
      if (!(await assertTenantAccess(req, res, req.params.tenantId))) return;
      const db = getDb();
      const branding = await db.get(
        'SELECT * FROM platform_tenant_branding WHERE tenant_id = ? ORDER BY version DESC LIMIT 1',
        [req.params.tenantId]
      );
      res.json({ data: branding || null, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

router.get(
  '/admin/branding/platform',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.branding.view', 'platform.branding.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const branding = await db.get('SELECT * FROM platform_branding WHERE id = ?', ['default']);
      res.json({ data: branding || {}, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

router.put(
  '/admin/branding/tenant/:tenantId',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.branding.update', 'platform.branding.manage']),
  async (req, res, next) => {
    try {
      if (!(await assertTenantAccess(req, res, req.params.tenantId))) return;
      const db = getDb();
      const { tenantId } = req.params;
      const b = req.body || {};
      const latest = await db.get('SELECT MAX(version) as maxVersion FROM platform_tenant_branding WHERE tenant_id = ?', [tenantId]);
      const nextVersion = (latest?.maxVersion || 0) + 1;
      const id = `brand_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      await db.run(
        `INSERT INTO platform_tenant_branding (id, tenant_id, version, company_name, logo_url, logo_dark_url, favicon_url, primary_color, secondary_color, accent_color, font_family, invoice_template, login_background_url, login_welcome_title, login_welcome_subtitle, email_header_logo, email_footer_text, custom_subdomain, allowed_customizations, created_at, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, tenantId, nextVersion, b.companyName || null, b.logoUrl || null, b.logoDarkUrl || null, b.faviconUrl || null, b.primaryColor || null, b.secondaryColor || null, b.accentColor || null, b.fontFamily || null, b.invoiceTemplate || null, b.loginBackgroundUrl || null, b.loginWelcomeTitle || null, b.loginWelcomeSubtitle || null, b.emailHeaderLogo || null, b.emailFooterText || null, b.customSubdomain || null, b.allowedCustomizations ? JSON.stringify(b.allowedCustomizations) : null, nowIso(), nowIso(), req.platformUser?.id]
      );
      const branding = await db.get('SELECT * FROM platform_tenant_branding WHERE id = ?', [id]);
      await recordAuditEvent({ actorId: req.platformUser?.id, tenantId, action: 'TENANT_BRANDING_UPDATED', resourceType: 'platform_tenant_branding', resourceId: id, afterData: { version: nextVersion }, ipAddress: req.ip });
      res.status(201).json({ data: branding, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

router.get(
  '/admin/branding/tenant/:tenantId/versions',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.branding.view', 'platform.branding.manage']),
  async (req, res, next) => {
    try {
      if (!(await assertTenantAccess(req, res, req.params.tenantId))) return;
      const db = getDb();
      const versions = await db.all(
        'SELECT id, version, created_at, updated_at, updated_by FROM platform_tenant_branding WHERE tenant_id = ? ORDER BY version DESC',
        [req.params.tenantId]
      );
      res.json({ data: versions, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

router.post(
  '/admin/branding/tenant/:tenantId/rollback/:version',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.branding.update', 'platform.branding.manage']),
  async (req, res, next) => {
    try {
      if (!(await assertTenantAccess(req, res, req.params.tenantId))) return;
      const db = getDb();
      const { tenantId, version } = req.params;
      const source = await db.get('SELECT * FROM platform_tenant_branding WHERE tenant_id = ? AND version = ?', [tenantId, Number(version)]);
      if (!source) return res.status(404).json({ error: 'Version not found' });
      const latest = await db.get('SELECT MAX(version) as maxVersion FROM platform_tenant_branding WHERE tenant_id = ?', [tenantId]);
      const nextVersion = (latest?.maxVersion || 0) + 1;
      const id = `brand_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      await db.run(
        `INSERT INTO platform_tenant_branding (id, tenant_id, version, company_name, logo_url, logo_dark_url, favicon_url, primary_color, secondary_color, accent_color, font_family, invoice_template, login_background_url, login_welcome_title, login_welcome_subtitle, email_header_logo, email_footer_text, custom_subdomain, allowed_customizations, created_at, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, tenantId, nextVersion, source.company_name, source.logo_url, source.logo_dark_url, source.favicon_url, source.primary_color, source.secondary_color, source.accent_color, source.font_family, source.invoice_template, source.login_background_url, source.login_welcome_title, source.login_welcome_subtitle, source.email_header_logo, source.email_footer_text, source.custom_subdomain, source.allowed_customizations, nowIso(), nowIso(), req.platformUser?.id]
      );
      const branding = await db.get('SELECT * FROM platform_tenant_branding WHERE id = ?', [id]);
      res.json({ data: branding, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

// ── Tenant UI Customization (versioned) ───────────────────────────────────
router.get(
  '/admin/customization/ui-profiles',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.customization.view', 'platform.customization.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const profiles = await db.all('SELECT * FROM platform_ui_profiles ORDER BY name');
      res.json({ data: profiles, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

router.get(
  '/admin/customization/tenant/:tenantId',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.customization.view', 'platform.customization.manage']),
  async (req, res, next) => {
    try {
      if (!(await assertTenantAccess(req, res, req.params.tenantId))) return;
      const db = getDb();
      const ui = await db.get(
        'SELECT * FROM platform_tenant_ui_customization WHERE tenant_id = ? ORDER BY version DESC LIMIT 1',
        [req.params.tenantId]
      );
      res.json({ data: ui || null, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

router.put(
  '/admin/customization/tenant/:tenantId',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.customization.update', 'platform.customization.manage']),
  async (req, res, next) => {
    try {
      if (!(await assertTenantAccess(req, res, req.params.tenantId))) return;
      const db = getDb();
      const { tenantId } = req.params;
      const { profileId, hiddenPages, hiddenActions, customLabels, formFieldRules } = req.body || {};
      const latest = await db.get('SELECT MAX(version) as maxVersion FROM platform_tenant_ui_customization WHERE tenant_id = ?', [tenantId]);
      const nextVersion = (latest?.maxVersion || 0) + 1;
      const id = `ui_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      await db.run(
        `INSERT INTO platform_tenant_ui_customization (id, tenant_id, version, profile_id, hidden_pages, hidden_actions, custom_labels, form_field_rules, created_at, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, tenantId, nextVersion, profileId || null, hiddenPages ? JSON.stringify(hiddenPages) : null, hiddenActions ? JSON.stringify(hiddenActions) : null, customLabels ? JSON.stringify(customLabels) : null, formFieldRules ? JSON.stringify(formFieldRules) : null, nowIso(), nowIso(), req.platformUser?.id]
      );
      const ui = await db.get('SELECT * FROM platform_tenant_ui_customization WHERE id = ?', [id]);
      res.status(201).json({ data: ui, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

router.get(
  '/admin/customization/tenant/:tenantId/versions',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.customization.view', 'platform.customization.manage']),
  async (req, res, next) => {
    try {
      if (!(await assertTenantAccess(req, res, req.params.tenantId))) return;
      const db = getDb();
      const versions = await db.all(
        'SELECT id, version, created_at, updated_at, updated_by FROM platform_tenant_ui_customization WHERE tenant_id = ? ORDER BY version DESC',
        [req.params.tenantId]
      );
      res.json({ data: versions, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

router.post(
  '/admin/customization/tenant/:tenantId/rollback/:version',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.customization.update', 'platform.customization.manage']),
  async (req, res, next) => {
    try {
      if (!(await assertTenantAccess(req, res, req.params.tenantId))) return;
      const db = getDb();
      const { tenantId, version } = req.params;
      const source = await db.get('SELECT * FROM platform_tenant_ui_customization WHERE tenant_id = ? AND version = ?', [tenantId, Number(version)]);
      if (!source) return res.status(404).json({ error: 'Version not found' });
      const latest = await db.get('SELECT MAX(version) as maxVersion FROM platform_tenant_ui_customization WHERE tenant_id = ?', [tenantId]);
      const nextVersion = (latest?.maxVersion || 0) + 1;
      const id = `ui_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      await db.run(
        `INSERT INTO platform_tenant_ui_customization (id, tenant_id, version, profile_id, hidden_pages, hidden_actions, custom_labels, form_field_rules, created_at, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, tenantId, nextVersion, source.profile_id, source.hidden_pages, source.hidden_actions, source.custom_labels, source.form_field_rules, nowIso(), nowIso(), req.platformUser?.id]
      );
      const ui = await db.get('SELECT * FROM platform_tenant_ui_customization WHERE id = ?', [id]);
      res.json({ data: ui, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

// ── Tenant App Configuration (versioned + templates + rollouts) ───────────
router.get(
  '/admin/app-config/templates',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.appconfig.view', 'platform.appconfig.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const templates = await db.all('SELECT * FROM platform_config_templates WHERE is_active = 1 ORDER BY name');
      res.json({ data: templates, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

router.get(
  '/admin/app-config/rollouts',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.appconfig.view', 'platform.appconfig.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const rollouts = await db.all('SELECT * FROM platform_config_rollouts ORDER BY created_at DESC');
      res.json({ data: rollouts, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

router.post(
  '/admin/app-config/rollouts',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.appconfig.create', 'platform.appconfig.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { templateId, targetTenants } = req.body || {};
      if (!templateId) return res.status(400).json({ error: 'templateId is required' });
      const id = `roll_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      await db.run(
        `INSERT INTO platform_config_rollouts (id, template_id, status, target_tenants, created_by, created_at)
         VALUES (?, ?, 'DRAFT', ?, ?, ?)`,
        [id, templateId, JSON.stringify(targetTenants || []), req.platformUser?.id, nowIso()]
      );
      const rollout = await db.get('SELECT * FROM platform_config_rollouts WHERE id = ?', [id]);
      res.status(201).json({ data: rollout, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

router.post(
  '/admin/app-config/rollouts/:id/start',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.appconfig.update', 'platform.appconfig.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      await db.run('UPDATE platform_config_rollouts SET status = ?, started_at = ? WHERE id = ?', ['IN_PROGRESS', nowIso(), req.params.id]);
      const rollout = await db.get('SELECT * FROM platform_config_rollouts WHERE id = ?', [req.params.id]);
      res.json({ data: rollout, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

router.get(
  '/admin/app-config/tenant/:tenantId',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.appconfig.view', 'platform.appconfig.manage']),
  async (req, res, next) => {
    try {
      if (!(await assertTenantAccess(req, res, req.params.tenantId))) return;
      const db = getDb();
      const config = await db.get(
        'SELECT * FROM platform_tenant_config WHERE tenant_id = ? ORDER BY version DESC LIMIT 1',
        [req.params.tenantId]
      );
      res.json({ data: config || null, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

router.put(
  '/admin/app-config/tenant/:tenantId',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.appconfig.update', 'platform.appconfig.manage']),
  async (req, res, next) => {
    try {
      if (!(await assertTenantAccess(req, res, req.params.tenantId))) return;
      const db = getDb();
      const { tenantId } = req.params;
      const { templateId, configPayload } = req.body || {};
      const latest = await db.get('SELECT MAX(version) as maxVersion FROM platform_tenant_config WHERE tenant_id = ?', [tenantId]);
      const nextVersion = (latest?.maxVersion || 0) + 1;
      const id = `cfg_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      await db.run(
        `INSERT INTO platform_tenant_config (id, tenant_id, version, template_id, config_payload, created_at, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, tenantId, nextVersion, templateId || null, JSON.stringify(configPayload || {}), nowIso(), nowIso(), req.platformUser?.id]
      );
      const config = await db.get('SELECT * FROM platform_tenant_config WHERE id = ?', [id]);
      res.status(201).json({ data: config, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

router.get(
  '/admin/app-config/tenant/:tenantId/versions',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.appconfig.view', 'platform.appconfig.manage']),
  async (req, res, next) => {
    try {
      if (!(await assertTenantAccess(req, res, req.params.tenantId))) return;
      const db = getDb();
      const versions = await db.all(
        'SELECT id, version, template_id, created_at, updated_at, updated_by FROM platform_tenant_config WHERE tenant_id = ? ORDER BY version DESC',
        [req.params.tenantId]
      );
      res.json({ data: versions, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

router.post(
  '/admin/app-config/tenant/:tenantId/rollback/:version',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.appconfig.update', 'platform.appconfig.manage']),
  async (req, res, next) => {
    try {
      if (!(await assertTenantAccess(req, res, req.params.tenantId))) return;
      const db = getDb();
      const { tenantId, version } = req.params;
      const source = await db.get('SELECT * FROM platform_tenant_config WHERE tenant_id = ? AND version = ?', [tenantId, Number(version)]);
      if (!source) return res.status(404).json({ error: 'Version not found' });
      const latest = await db.get('SELECT MAX(version) as maxVersion FROM platform_tenant_config WHERE tenant_id = ?', [tenantId]);
      const nextVersion = (latest?.maxVersion || 0) + 1;
      const id = `cfg_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      await db.run(
        `INSERT INTO platform_tenant_config (id, tenant_id, version, template_id, config_payload, created_at, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, tenantId, nextVersion, source.template_id, source.config_payload, nowIso(), nowIso(), req.platformUser?.id]
      );
      const config = await db.get('SELECT * FROM platform_tenant_config WHERE id = ?', [id]);
      res.json({ data: config, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

router.get(
  '/admin/app-config/rollouts/:id/acks',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.appconfig.view', 'platform.appconfig.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const acks = await db.all('SELECT * FROM platform_config_acks WHERE rollout_id = ? ORDER BY acked_at DESC', [req.params.id]);
      res.json({ data: acks, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

// ── Tenant Activity Settings (versioned) ──────────────────────────────────
router.get(
  '/admin/activity/tenant/:tenantId',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.activity.view', 'platform.activity.manage']),
  async (req, res, next) => {
    try {
      if (!(await assertTenantAccess(req, res, req.params.tenantId))) return;
      const db = getDb();
      const activity = await db.get(
        'SELECT * FROM platform_tenant_activity WHERE tenant_id = ? ORDER BY version DESC LIMIT 1',
        [req.params.tenantId]
      );
      res.json({ data: activity || null, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

router.put(
  '/admin/activity/tenant/:tenantId',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.activity.update', 'platform.activity.manage']),
  async (req, res, next) => {
    try {
      if (!(await assertTenantAccess(req, res, req.params.tenantId))) return;
      const db = getDb();
      const { tenantId } = req.params;
      const { activityId, enabledModules, customTerminology } = req.body || {};
      const latest = await db.get('SELECT MAX(version) as maxVersion FROM platform_tenant_activity WHERE tenant_id = ?', [tenantId]);
      const nextVersion = (latest?.maxVersion || 0) + 1;
      const id = `act_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      await db.run(
        `INSERT INTO platform_tenant_activity (id, tenant_id, version, activity_id, enabled_modules, custom_terminology, created_at, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, tenantId, nextVersion, activityId, enabledModules ? JSON.stringify(enabledModules) : null, customTerminology ? JSON.stringify(customTerminology) : null, nowIso(), nowIso(), req.platformUser?.id]
      );
      const activity = await db.get('SELECT * FROM platform_tenant_activity WHERE id = ?', [id]);
      res.status(201).json({ data: activity, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

router.get(
  '/admin/activity/tenant/:tenantId/versions',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.activity.view', 'platform.activity.manage']),
  async (req, res, next) => {
    try {
      if (!(await assertTenantAccess(req, res, req.params.tenantId))) return;
      const db = getDb();
      const versions = await db.all(
        'SELECT id, version, activity_id, created_at, updated_at, updated_by FROM platform_tenant_activity WHERE tenant_id = ? ORDER BY version DESC',
        [req.params.tenantId]
      );
      res.json({ data: versions, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

router.post(
  '/admin/activity/tenant/:tenantId/rollback/:version',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.activity.update', 'platform.activity.manage']),
  async (req, res, next) => {
    try {
      if (!(await assertTenantAccess(req, res, req.params.tenantId))) return;
      const db = getDb();
      const { tenantId, version } = req.params;
      const source = await db.get('SELECT * FROM platform_tenant_activity WHERE tenant_id = ? AND version = ?', [tenantId, Number(version)]);
      if (!source) return res.status(404).json({ error: 'Version not found' });
      const latest = await db.get('SELECT MAX(version) as maxVersion FROM platform_tenant_activity WHERE tenant_id = ?', [tenantId]);
      const nextVersion = (latest?.maxVersion || 0) + 1;
      const id = `act_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      await db.run(
        `INSERT INTO platform_tenant_activity (id, tenant_id, version, activity_id, enabled_modules, custom_terminology, created_at, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, tenantId, nextVersion, source.activity_id, source.enabled_modules, source.custom_terminology, nowIso(), nowIso(), req.platformUser?.id]
      );
      const activity = await db.get('SELECT * FROM platform_tenant_activity WHERE id = ?', [id]);
      res.json({ data: activity, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

// ── Admin Control (Staff & Tenant Users) ──────────────────────────────────
// Staff accounts live exclusively in `platform_users` (the same table used by
// /admin/staff and platform authentication). `platform_staff_extended` is a
// legacy shadow table kept for historical rows only — it is no longer read or
// written by these endpoints.

const OWNER_ROLE_CODES = new Set(['SUPER_ADMIN', 'OWNER']);
const isOwnerActor = (user) => OWNER_ROLE_CODES.has(String(user?.role || ''));

function parseJsonArraySafe(value) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string' && value) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : null;
    } catch {
      return null;
    }
  }
  return null;
}

const STAFF_SELECT = `
  SELECT u.id, u.username, u.full_name, u.email, u.phone, u.role, u.permissions,
         u.is_active, u.last_login_at, u.must_change_password, u.failed_login_attempts,
         u.locked_until, u.data_scope, u.created_at, u.updated_at,
         (SELECT m.enabled FROM platform_mfa m WHERE m.user_id = u.id LIMIT 1) AS mfa_enabled
    FROM platform_users u`;

function mapPlatformUserRow(row) {
  return {
    id: row.id,
    userId: row.id,
    username: row.username ?? null,
    fullName: row.full_name ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    role: row.role,
    isActive: Boolean(row.is_active),
    mustChangePassword: Boolean(row.must_change_password),
    mfaEnabled: Boolean(row.mfa_enabled),
    dataScope: row.data_scope ?? 'ALL',
    failedLoginAttempts: Number(row.failed_login_attempts ?? 0),
    lockedUntil: row.locked_until ?? null,
    lastLoginAt: row.last_login_at ?? null,
    permissionsOverride: parseJsonArraySafe(row.permissions),
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

async function countActiveOwners(db, excludeUserId = null) {
  const row = await db.get(
    `SELECT COUNT(*) AS c FROM platform_users
      WHERE role IN ('SUPER_ADMIN','OWNER') AND is_active = 1 AND deleted_at IS NULL
        AND id <> ?`,
    [excludeUserId ?? '']
  );
  return Number(row?.c ?? 0);
}

function sanitizeUsernameCandidate(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/^[-_.]+|[-_.]+$/g, '')
    .slice(0, 24);
}

async function ensureUniqueUsername(db, base) {
  const root = base || `staff${Date.now().toString(36)}`;
  let candidate = root;
  let index = 2;
  while (await db.get('SELECT 1 FROM platform_users WHERE username = ?', [candidate])) {
    const suffix = String(index);
    candidate = `${root.slice(0, Math.max(1, 24 - suffix.length))}${suffix}`;
    index += 1;
  }
  return candidate;
}

async function syncStaffGrants(db, userId, permissions) {
  const granted = Array.isArray(permissions) ? permissions.filter((p) => typeof p === 'string' && p) : [];
  await db.run(`DELETE FROM platform_user_permissions WHERE user_id = ? AND effect = 'GRANT'`, [userId]);
  for (const code of granted) {
    if (code === '*') continue;
    await db.run(
      `INSERT OR IGNORE INTO platform_user_permissions (user_id, permission_code, effect) VALUES (?, ?, 'GRANT')`,
      [userId, code]
    );
  }
  return granted;
}

router.get(
  '/admin/admin-control/staff',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.admincontrol.view', 'platform.admincontrol.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { search, role } = req.query;
      let query = `${STAFF_SELECT} WHERE u.deleted_at IS NULL`;
      const params = [];
      if (search) {
        query += ' AND (u.full_name LIKE ? OR u.email LIKE ? OR u.username LIKE ?)';
        const like = `%${String(search)}%`;
        params.push(like, like, like);
      }
      if (role) { query += ' AND u.role = ?'; params.push(role); }
      query += ' ORDER BY u.created_at DESC';
      const staff = await db.all(query, params);
      res.json({ data: staff.map(mapPlatformUserRow), requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

router.get(
  '/admin/admin-control/staff-roles',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.admincontrol.view', 'platform.admincontrol.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const roles = await db.all('SELECT code, name, description FROM platform_roles ORDER BY name');
      res.json({ data: roles, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

router.post(
  '/admin/admin-control/staff',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.admincontrol.create', 'platform.admincontrol.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { username, fullName, email, phone, role = 'SUPPORT_AGENT', permissions = [], password } = req.body || {};
      if (!fullName || !email) return res.status(400).json({ error: 'fullName and email are required' });

      const actor = req.platformUser;
      const owner = isOwnerActor(actor);
      const targetRole = String(role || 'SUPPORT_AGENT').toUpperCase();
      if (OWNER_ROLE_CODES.has(targetRole) && !owner) {
        return res.status(403).json({ error: 'Only the platform owner can create or upgrade to a super admin account' });
      }
      if (OWNER_ROLE_CODES.has(targetRole)) {
        const existingOwner = await db.get(
          `SELECT id FROM platform_users
            WHERE role IN ('SUPER_ADMIN','OWNER') AND deleted_at IS NULL AND is_active = 1
            LIMIT 1`
        );
        if (existingOwner) {
          return res.status(409).json({ error: 'A platform owner account already exists; a second owner cannot be created' });
        }
      }
      const requestedPerms = Array.isArray(permissions) ? permissions : [];
      if (requestedPerms.includes('*') && !owner) {
        return res.status(403).json({ error: 'Wildcard permission cannot be granted' });
      }

      const emailKey = String(email).trim().toLowerCase();
      const existing = await db.get(
        'SELECT 1 FROM platform_users WHERE username = ? OR (email IS NOT NULL AND LOWER(email) = ?) LIMIT 1',
        [sanitizeUsernameCandidate(username || emailKey.split('@')[0]), emailKey]
      );
      if (existing) return res.status(400).json({ error: 'A staff account with this username or email already exists' });

      const finalUsername = await ensureUniqueUsername(
        db,
        sanitizeUsernameCandidate(username || emailKey.split('@')[0]) || `staff${Date.now().toString(36)}`
      );
      const generatedPassword = !password;
      const plainPassword = password || crypto.randomBytes(12).toString('base64url');
      if (String(plainPassword).length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }
      const passwordHash = await bcrypt.hash(String(plainPassword), 10);
      const id = `usr_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      const now = nowIso();

      await db.run(
        `INSERT INTO platform_users
           (id, username, password_hash, full_name, email, phone, role, permissions,
            is_active, must_change_password, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
        [id, finalUsername, passwordHash, String(fullName).trim(), emailKey,
         phone || null, targetRole, JSON.stringify(requestedPerms),
         generatedPassword ? 1 : 0, now, now]
      );
      const roleRow = await db.get('SELECT code FROM platform_roles WHERE code = ?', [targetRole]);
      if (roleRow) {
        await db.run('INSERT OR IGNORE INTO platform_user_roles (user_id, role_code) VALUES (?, ?)', [id, targetRole]);
      }
      await syncStaffGrants(db, id, requestedPerms);
      invalidatePermissionsCache(id);

      const created = await db.get(`${STAFF_SELECT} WHERE u.id = ?`, [id]);
      await recordAuditEvent({
        actorId: actor?.id,
        actorName: actor?.full_name,
        action: 'STAFF_CREATED',
        resourceType: 'platform_users',
        resourceId: id,
        afterData: { username: finalUsername, email: emailKey, role: targetRole },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      res.status(201).json({
        data: { ...mapPlatformUserRow(created), ...(generatedPassword ? { temporaryPassword: plainPassword } : {}) },
        requestId: req.requestId,
      });
    } catch (err) { next(err); }
  }
);

router.put(
  '/admin/admin-control/staff/:id',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.admincontrol.update', 'platform.admincontrol.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { id } = req.params;
      const actor = req.platformUser;
      const existing = await db.get(`${STAFF_SELECT} WHERE u.id = ? AND u.deleted_at IS NULL`, [id]);
      if (!existing) return res.status(404).json({ error: 'Staff member not found' });

      const { fullName, email, phone, role, permissions, isActive, password } = req.body || {};
      const owner = isOwnerActor(actor);
      const selfEdit = actor?.id === id;

      if (selfEdit && isActive === false) {
        return res.status(400).json({ error: 'You cannot deactivate your own account' });
      }
      if (role !== undefined && OWNER_ROLE_CODES.has(String(role).toUpperCase()) && !owner) {
        return res.status(403).json({ error: 'Only the platform owner can grant the owner role' });
      }
      if (selfEdit && role !== undefined && String(role).toUpperCase() !== String(existing.role).toUpperCase()
          && OWNER_ROLE_CODES.has(String(existing.role).toUpperCase())) {
        return res.status(400).json({ error: 'You cannot change your own owner role' });
      }
      if (isActive === false && OWNER_ROLE_CODES.has(String(existing.role).toUpperCase())
          && (await countActiveOwners(db, id)) === 0) {
        return res.status(409).json({ error: 'Cannot deactivate the last active platform owner' });
      }
      if (Array.isArray(permissions) && permissions.includes('*') && !owner) {
        return res.status(403).json({ error: 'Wildcard permission cannot be granted' });
      }

      const updates = [];
      const params = [];
      if (fullName !== undefined) { updates.push('full_name = ?'); params.push(String(fullName).trim() || null); }
      if (email !== undefined) { updates.push('email = ?'); params.push(String(email).trim().toLowerCase() || null); }
      if (phone !== undefined) { updates.push('phone = ?'); params.push(phone || null); }
      if (role !== undefined) { updates.push('role = ?'); params.push(String(role).toUpperCase()); }
      if (isActive !== undefined) { updates.push('is_active = ?'); params.push(isActive ? 1 : 0); }
      if (password !== undefined) {
        if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
        updates.push('password_hash = ?');
        params.push(await bcrypt.hash(String(password), 10));
        updates.push('must_change_password = 0');
      }
      const now = nowIso();
      if (updates.length) {
        updates.push('updated_at = ?'); params.push(now, id);
        await db.run(`UPDATE platform_users SET ${updates.join(', ')} WHERE id = ?`, params);
      }

      if (role !== undefined) {
        const nextRole = String(role).toUpperCase();
        await db.run('DELETE FROM platform_user_roles WHERE user_id = ?', [id]);
        const roleRow = await db.get('SELECT code FROM platform_roles WHERE code = ?', [nextRole]);
        if (roleRow) {
          await db.run('INSERT OR IGNORE INTO platform_user_roles (user_id, role_code) VALUES (?, ?)', [id, nextRole]);
        }
      }
      if (Array.isArray(permissions)) {
        const granted = await syncStaffGrants(db, id, permissions);
        await db.run('UPDATE platform_users SET permissions = ?, updated_at = ? WHERE id = ?', [JSON.stringify(granted), now, id]);
      }
      invalidatePermissionsCache(id);
      // Deactivating or changing credentials must kill live sessions.
      if (isActive === false || password !== undefined) {
        await db.run('DELETE FROM platform_sessions WHERE user_id = ?', [id]);
      }

      const staff = await db.get(`${STAFF_SELECT} WHERE u.id = ?`, [id]);
      await recordAuditEvent({
        actorId: actor?.id,
        actorName: actor?.full_name,
        action: 'STAFF_UPDATED',
        resourceType: 'platform_users',
        resourceId: id,
        afterData: { fullName, email, role, isActive, permissions: Array.isArray(permissions) ? permissions : undefined, passwordChanged: password !== undefined },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      res.json({ data: mapPlatformUserRow(staff), requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

router.delete(
  '/admin/admin-control/staff/:id',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.admincontrol.delete', 'platform.admincontrol.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { id } = req.params;
      const actor = req.platformUser;
      const existing = await db.get(`${STAFF_SELECT} WHERE u.id = ? AND u.deleted_at IS NULL`, [id]);
      if (!existing) return res.status(404).json({ error: 'Staff member not found' });
      if (actor?.id === id) return res.status(400).json({ error: 'You cannot delete your own account' });
      if (OWNER_ROLE_CODES.has(String(existing.role).toUpperCase()) && (await countActiveOwners(db, id)) === 0) {
        return res.status(409).json({ error: 'Cannot delete the last active platform owner' });
      }

      const now = nowIso();
      await db.run('UPDATE platform_users SET is_active = 0, deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);
      await db.run('DELETE FROM platform_sessions WHERE user_id = ?', [id]);
      invalidatePermissionsCache(id);
      await recordAuditEvent({
        actorId: actor?.id,
        actorName: actor?.full_name,
        action: 'STAFF_DELETED',
        resourceType: 'platform_users',
        resourceId: id,
        ipAddress: req.ip,
      });
      res.json({ data: { deleted: true }, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

// ── Cross-tenant user directory (super-admin monitoring) ────────────────────
router.get(
  '/admin/tenant-users',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.tenants.view', 'platform.tenants.manage', 'platform.admincontrol.view', 'platform.admincontrol.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { tenantId = '', provisioningStatus = '', status = '', search = '' } = req.query;
      const scoped = await getScopedTenantIds(req);
      const scope = tenantScopePredicate('u.tenant_id', scoped);
      if (scope.deny) return res.json({ data: [], requestId: req.requestId });

      let sql = `SELECT u.*, t.name AS tenant_name, t.code AS tenant_code
                   FROM platform_tenant_users u
                   JOIN platform_tenants t ON t.id = u.tenant_id
                  WHERE 1=1${scope.clause}`;
      const params = [...scope.params];
      if (tenantId) { sql += ' AND u.tenant_id = ?'; params.push(String(tenantId)); }
      if (provisioningStatus) { sql += ' AND u.provisioning_status = ?'; params.push(String(provisioningStatus)); }
      if (status) { sql += ' AND u.status = ?'; params.push(String(status)); }
      if (search) {
        sql += ' AND (u.full_name LIKE ? OR u.username LIKE ? OR u.email LIKE ?)';
        const like = `%${String(search)}%`;
        params.push(like, like, like);
      }
      sql += ' ORDER BY t.name ASC, u.created_at DESC LIMIT 1000';
      const rows = await db.all(sql, params);
      res.json({
        data: rows.map((row) => ({
          id: row.id,
          tenantId: row.tenant_id,
          tenantName: row.tenant_name,
          tenantCode: row.tenant_code,
          username: row.username ?? null,
          fullName: row.full_name,
          email: row.email ?? null,
          phone: row.phone ?? null,
          role: row.role,
          status: row.status,
          isActive: row.status === 'ACTIVE',
          provisioningStatus: row.provisioning_status ?? 'NOT_REQUESTED',
          provisioningMode: row.provisioning_mode ?? null,
          identityUserId: row.identity_user_id ?? null,
          inviteExpiresAt: row.invite_expires_at ?? null,
          provisionedAt: row.provisioned_at ?? null,
          lastError: row.last_error ?? null,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })),
        requestId: req.requestId,
      });
    } catch (err) { next(err); }
  }
);

router.get(
  '/admin/admin-control/tenant-users/:tenantId',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.admincontrol.view', 'platform.admincontrol.manage']),
  async (req, res, next) => {
    try {
      if (!(await assertTenantAccess(req, res, req.params.tenantId))) return;
      const db = getDb();
      const users = await db.all('SELECT * FROM platform_tenant_users WHERE tenant_id = ? ORDER BY created_at DESC', [req.params.tenantId]);
      res.json({ data: users, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

router.post(
  '/admin/admin-control/tenant-users/:tenantId',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.admincontrol.create', 'platform.admincontrol.manage']),
  async (req, res, next) => {
    try {
      if (!(await assertTenantAccess(req, res, req.params.tenantId))) return;
      const db = getDb();
      const { tenantId } = req.params;
      const { username, fullName, email, phone, role } = req.body || {};
      if (!username || !fullName) return res.status(400).json({ error: 'username and fullName are required' });
      const id = `tu_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      await db.run(
        `INSERT INTO platform_tenant_users (id, tenant_id, username, full_name, email, phone, role, is_active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        [id, tenantId, username, fullName, email || null, phone || null, role || 'USER', nowIso()]
      );
      const user = await db.get('SELECT * FROM platform_tenant_users WHERE id = ?', [id]);
      res.status(201).json({ data: user, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

router.put(
  '/admin/admin-control/tenant-users/:tenantId/:userId',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.admincontrol.update', 'platform.admincontrol.manage']),
  async (req, res, next) => {
    try {
      if (!(await assertTenantAccess(req, res, req.params.tenantId))) return;
      const db = getDb();
      const { tenantId, userId } = req.params;
      const { fullName, email, phone, role, isActive } = req.body || {};
      const updates = [];
      const params = [];
      if (fullName !== undefined) { updates.push('full_name = ?'); params.push(fullName); }
      if (email !== undefined) { updates.push('email = ?'); params.push(email); }
      if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
      if (role !== undefined) { updates.push('role = ?'); params.push(role); }
      if (isActive !== undefined) { updates.push('is_active = ?'); params.push(isActive ? 1 : 0); }
      if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
      params.push(tenantId, userId);
      await db.run(`UPDATE platform_tenant_users SET ${updates.join(', ')} WHERE tenant_id = ? AND id = ?`, params);
      const user = await db.get('SELECT * FROM platform_tenant_users WHERE tenant_id = ? AND id = ?', [tenantId, userId]);
      res.json({ data: user, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

router.delete(
  '/admin/admin-control/tenant-users/:tenantId/:userId',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.admincontrol.delete', 'platform.admincontrol.manage']),
  async (req, res, next) => {
    try {
      if (!(await assertTenantAccess(req, res, req.params.tenantId))) return;
      const db = getDb();
      await db.run('DELETE FROM platform_tenant_users WHERE tenant_id = ? AND id = ?', [req.params.tenantId, req.params.userId]);
      res.json({ data: { deleted: true }, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

// ── Unified Users Hub (overview / search / detail) ─────────────────────────
// One place that aggregates every kind of user the platform manages:
// platform staff (platform_users) and tenant directory users
// (platform_tenant_users) with their provisioning pipeline state.

const USERS_READ_PERMISSION = ['platform.admincontrol.view', 'platform.admincontrol.manage', 'platform.tenants.view'];

router.get(
  '/admin/admin-control/users/overview',
  authenticatePlatformUser,
  requirePlatformPermission(USERS_READ_PERMISSION),
  async (req, res, next) => {
    try {
      const db = getDb();
      const scoped = await getScopedTenantIds(req);
      const scope = tenantScopePredicate('u.tenant_id', scoped);
      const jobScope = tenantScopePredicate('j.tenant_id', scoped);
      const empty = {
        staff: { total: 0, active: 0, inactive: 0, locked: 0, mustChangePassword: 0, byRole: {} },
        tenantUsers: { total: 0, byStatus: {}, byProvisioning: {}, byOrigin: {}, newLast7Days: 0 },
        provisioning: { pending: 0, failed: 0 },
        recentEvents: [],
      };
      if (scope.deny) return res.json({ data: empty, requestId: req.requestId });

      const now = nowIso();
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const [staffAgg, staffRoles, tuStatus, tuProv, tuOrigin, tuNew, provJobs, recentEvents] = await Promise.all([
        db.get(
          `SELECT COUNT(*) AS total,
                  COALESCE(SUM(is_active),0) AS active,
                  COALESCE(SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END),0) AS inactive,
                  COALESCE(SUM(CASE WHEN locked_until IS NOT NULL AND locked_until > ? THEN 1 ELSE 0 END),0) AS locked,
                  COALESCE(SUM(must_change_password),0) AS must_change
             FROM platform_users WHERE deleted_at IS NULL`,
          [now]
        ),
        db.all(`SELECT role, COUNT(*) AS c FROM platform_users WHERE deleted_at IS NULL GROUP BY role`),
        db.all(`SELECT u.status AS k, COUNT(*) AS c FROM platform_tenant_users u WHERE 1=1${scope.clause} GROUP BY u.status`, scope.params),
        db.all(`SELECT u.provisioning_status AS k, COUNT(*) AS c FROM platform_tenant_users u WHERE 1=1${scope.clause} GROUP BY u.provisioning_status`, scope.params),
        db.all(`SELECT u.origin AS k, COUNT(*) AS c FROM platform_tenant_users u WHERE 1=1${scope.clause} GROUP BY u.origin`, scope.params),
        db.get(`SELECT COUNT(*) AS c FROM platform_tenant_users u WHERE u.created_at >= ?${scope.clause}`, [sevenDaysAgo, ...scope.params]),
        db.all(
          `SELECT j.status AS k, COUNT(*) AS c FROM platform_tenant_provisioning_jobs j WHERE j.status IN ('PENDING','CLAIMED','FAILED')${jobScope.clause} GROUP BY j.status`,
          jobScope.params
        ),
        (async () => {
          // Staff events carry tenant_id NULL; tenant events are scope-filtered.
          let eventScope = '';
          const eventParams = [];
          if (Array.isArray(scoped)) {
            if (!scoped.length) return [];
            eventScope = ` AND (tenant_id IS NULL OR tenant_id IN (${scoped.map(() => '?').join(',')}))`;
            eventParams.push(...scoped);
          }
          return db.all(
            `SELECT id, actor_name, action, resource_type, resource_id, tenant_id, created_at
               FROM platform_audit_events
              WHERE resource_type IN ('platform_users','platform_tenant_users')${eventScope}
              ORDER BY created_at DESC LIMIT 15`,
            eventParams
          );
        })(),
      ]);

      const byRole = {};
      for (const r of staffRoles) byRole[String(r.role)] = Number(r.c);
      const toMap = (rows) => Object.fromEntries(rows.map((r) => [String(r.k ?? 'UNKNOWN'), Number(r.c)]));
      const provMap = Object.fromEntries(provJobs.map((r) => [String(r.k), Number(r.c)]));

      res.json({
        data: {
          staff: {
            total: Number(staffAgg?.total ?? 0),
            active: Number(staffAgg?.active ?? 0),
            inactive: Number(staffAgg?.inactive ?? 0),
            locked: Number(staffAgg?.locked ?? 0),
            mustChangePassword: Number(staffAgg?.must_change ?? 0),
            byRole,
          },
          tenantUsers: {
            total: tuStatus.reduce((a, r) => a + Number(r.c), 0),
            byStatus: toMap(tuStatus),
            byProvisioning: toMap(tuProv),
            byOrigin: toMap(tuOrigin),
            newLast7Days: Number(tuNew?.c ?? 0),
          },
          provisioning: {
            pending: (provMap.PENDING ?? 0) + (provMap.CLAIMED ?? 0),
            failed: provMap.FAILED ?? 0,
          },
          recentEvents,
        },
        requestId: req.requestId,
      });
    } catch (err) { next(err); }
  }
);

router.get(
  '/admin/admin-control/users/search',
  authenticatePlatformUser,
  requirePlatformPermission(USERS_READ_PERMISSION),
  async (req, res, next) => {
    try {
      const db = getDb();
      const q = String(req.query.q || '').trim();
      if (q.length < 2) {
        return res.json({ data: { staff: [], tenantUsers: [] }, requestId: req.requestId });
      }
      const like = `%${q}%`;
      const scoped = await getScopedTenantIds(req);
      const scope = tenantScopePredicate('u.tenant_id', scoped);
      if (scope.deny) {
        return res.json({ data: { staff: [], tenantUsers: [] }, requestId: req.requestId });
      }

      const [staffRows, tenantRows] = await Promise.all([
        db.all(
          `${STAFF_SELECT}
            WHERE u.deleted_at IS NULL
              AND (u.username LIKE ? OR u.full_name LIKE ? OR u.email LIKE ?)
            ORDER BY u.created_at DESC LIMIT 10`,
          [like, like, like]
        ),
        db.all(
          `SELECT u.id, u.tenant_id, u.username, u.full_name, u.email, u.phone, u.role, u.status,
                  u.provisioning_status, u.provisioning_mode, u.identity_user_id, u.origin,
                  u.is_active, u.created_at, u.updated_at,
                  t.name AS tenant_name, t.code AS tenant_code
             FROM platform_tenant_users u
             JOIN platform_tenants t ON t.id = u.tenant_id
            WHERE (u.full_name LIKE ? OR u.username LIKE ? OR u.email LIKE ?)${scope.clause}
            ORDER BY u.created_at DESC LIMIT 20`,
          [like, like, like, ...scope.params]
        ),
      ]);

      res.json({
        data: {
          staff: staffRows.map(mapPlatformUserRow),
          tenantUsers: tenantRows.map((row) => ({
            id: row.id,
            tenantId: row.tenant_id,
            tenantName: row.tenant_name,
            tenantCode: row.tenant_code,
            username: row.username ?? null,
            fullName: row.full_name,
            email: row.email ?? null,
            phone: row.phone ?? null,
            role: row.role,
            status: row.status,
            isActive: row.status === 'ACTIVE',
            provisioningStatus: row.provisioning_status ?? 'NOT_REQUESTED',
            provisioningMode: row.provisioning_mode ?? null,
            identityUserId: row.identity_user_id ?? null,
            origin: row.origin ?? 'PLATFORM',
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          })),
        },
        requestId: req.requestId,
      });
    } catch (err) { next(err); }
  }
);

router.get(
  '/admin/admin-control/users/tenant/:userId',
  authenticatePlatformUser,
  requirePlatformPermission(USERS_READ_PERMISSION),
  async (req, res, next) => {
    try {
      const db = getDb();
      const user = await db.get('SELECT * FROM platform_tenant_users WHERE id = ?', [req.params.userId]);
      if (!user) return res.status(404).json({ error: 'Tenant user not found' });
      if (!(await assertTenantAccess(req, res, user.tenant_id))) return;

      const [tenant, jobs, events] = await Promise.all([
        db.get('SELECT id, name, code, status FROM platform_tenants WHERE id = ?', [user.tenant_id]),
        db.all(
          `SELECT id, event, status, attempts, max_attempts, last_error, claimed_by_device_id,
                  result_identity_user_id, created_at, updated_at, completed_at
             FROM platform_tenant_provisioning_jobs
            WHERE tenant_user_id = ?
            ORDER BY created_at DESC LIMIT 50`,
          [user.id]
        ),
        db.all(
          `SELECT id, actor_name, action, resource_type, created_at
             FROM platform_audit_events
            WHERE resource_id = ? OR (tenant_id = ? AND resource_type = 'platform_tenant_users')
            ORDER BY created_at DESC LIMIT 25`,
          [user.id, user.tenant_id]
        ),
      ]);

      res.json({
        data: {
          user: {
            id: user.id,
            tenantId: user.tenant_id,
            username: user.username ?? null,
            fullName: user.full_name,
            email: user.email ?? null,
            phone: user.phone ?? null,
            role: user.role,
            status: user.status,
            notes: user.notes ?? null,
            provisioningStatus: user.provisioning_status ?? 'NOT_REQUESTED',
            provisioningMode: user.provisioning_mode ?? null,
            identityUserId: user.identity_user_id ?? null,
            scope: user.scope ?? null,
            origin: user.origin ?? 'PLATFORM',
            isActive: Boolean(user.is_active),
            inviteExpiresAt: user.invite_expires_at ?? null,
            provisionedAt: user.provisioned_at ?? null,
            lastError: user.last_error ?? null,
            createdAt: user.created_at,
            updatedAt: user.updated_at,
          },
          tenant,
          jobs,
          events,
        },
        requestId: req.requestId,
      });
    } catch (err) { next(err); }
  }
);

router.get(
  '/admin/admin-control/users/staff/:id',
  authenticatePlatformUser,
  requirePlatformPermission(USERS_READ_PERMISSION),
  async (req, res, next) => {
    try {
      const db = getDb();
      const user = await db.get(`${STAFF_SELECT} WHERE u.id = ? AND u.deleted_at IS NULL`, [req.params.id]);
      if (!user) return res.status(404).json({ error: 'Staff member not found' });

      const [roleRows, grantRows, denyRows, sessions, logins] = await Promise.all([
        db.all('SELECT role_code FROM platform_user_roles WHERE user_id = ?', [user.id]),
        db.all(
          `SELECT p.code, p.module, p.action, p.name
             FROM platform_user_permissions up
             JOIN platform_permissions p ON p.code = up.permission_code
            WHERE up.user_id = ? AND up.effect = 'GRANT'
            ORDER BY p.module, p.code`,
          [user.id]
        ),
        db.all(
          `SELECT p.code, p.name
             FROM platform_user_permissions up
             JOIN platform_permissions p ON p.code = up.permission_code
            WHERE up.user_id = ? AND up.effect = 'DENY'
            ORDER BY p.code`,
          [user.id]
        ),
        db.get('SELECT COUNT(*) AS c FROM platform_sessions WHERE user_id = ?', [user.id]),
        db.all(
          `SELECT username, success, failure_reason, ip_address, created_at
             FROM platform_login_attempts
            WHERE user_id = ?
            ORDER BY created_at DESC LIMIT 15`,
          [user.id]
        ),
      ]);

      res.json({
        data: {
          staff: mapPlatformUserRow(user),
          roles: roleRows.map((r) => r.role_code),
          grants: grantRows,
          denies: denyRows,
          activeSessions: Number(sessions?.c ?? 0),
          recentLogins: logins,
        },
        requestId: req.requestId,
      });
    } catch (err) { next(err); }
  }
);



module.exports = router;
