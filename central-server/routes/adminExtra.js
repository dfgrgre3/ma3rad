'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../lib/db');
const { recordAuditEvent } = require('../lib/audit');
const {
  authenticatePlatformUser,
  requirePlatformPermission,
  getScopedTenantIds,
  assertTenantAccess,
  tenantScopePredicate,
} = require('../middleware/auth');
const { nowIso } = require('../lib/time');

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
      const { key, name, description, isEnabled, rolloutPercentage, targetTenants } = req.body || {};
      if (!key || !name) return res.status(400).json({ error: 'key and name are required' });
      const id = `ff_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      await db.run(
        `INSERT INTO platform_feature_flags (id, key, name, description, is_enabled, rollout_percentage, target_tenants, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, key, name, description || null, isEnabled ? 1 : 0, rolloutPercentage || 0, JSON.stringify(targetTenants || []), nowIso(), nowIso()]
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
      const { name, description, isEnabled, rolloutPercentage, targetTenants } = req.body || {};
      const updates = [];
      const params = [];
      if (name !== undefined) { updates.push('name = ?'); params.push(name); }
      if (description !== undefined) { updates.push('description = ?'); params.push(description); }
      if (isEnabled !== undefined) { updates.push('is_enabled = ?'); params.push(isEnabled ? 1 : 0); }
      if (rolloutPercentage !== undefined) { updates.push('rollout_percentage = ?'); params.push(rolloutPercentage); }
      if (targetTenants !== undefined) { updates.push('target_tenants = ?'); params.push(JSON.stringify(targetTenants)); }
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
router.get(
  '/admin/admin-control/staff',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.admincontrol.view', 'platform.admincontrol.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { search, role } = req.query;
      let query = 'SELECT * FROM platform_staff_extended WHERE deleted_at IS NULL';
      const params = [];
      if (search) { query += ' AND (full_name LIKE ? OR email LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
      if (role) { query += ' AND role = ?'; params.push(role); }
      query += ' ORDER BY created_at DESC';
      const staff = await db.all(query, params);
      res.json({ data: staff, requestId: req.requestId });
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
      const { fullName, email, phone, role, permissions } = req.body || {};
      if (!fullName || !email) return res.status(400).json({ error: 'fullName and email are required' });
      const id = `staff_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      const userId = `user_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      await db.run(
        `INSERT INTO platform_users (id, email, full_name, phone, role, is_active, created_at)
         VALUES (?, ?, ?, ?, ?, 1, ?)`,
        [userId, email, fullName, phone || null, role || 'SUPPORT_AGENT', nowIso()]
      );
      await db.run(
        `INSERT INTO platform_staff_extended (id, user_id, full_name, email, phone, role, is_active, permissions, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
        [id, userId, fullName, email, phone || null, role || 'SUPPORT_AGENT', permissions ? JSON.stringify(permissions) : null, nowIso(), nowIso()]
      );
      const staff = await db.get('SELECT * FROM platform_staff_extended WHERE id = ?', [id]);
      await recordAuditEvent({ actorId: req.platformUser?.id, action: 'STAFF_CREATED', resourceType: 'platform_staff_extended', resourceId: id, afterData: { email, role }, ipAddress: req.ip });
      res.status(201).json({ data: staff, requestId: req.requestId });
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
      const { fullName, email, phone, role, permissions, isActive } = req.body || {};
      const updates = [];
      const params = [];
      if (fullName !== undefined) { updates.push('full_name = ?'); params.push(fullName); }
      if (email !== undefined) { updates.push('email = ?'); params.push(email); }
      if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
      if (role !== undefined) { updates.push('role = ?'); params.push(role); }
      if (permissions !== undefined) { updates.push('permissions = ?'); params.push(JSON.stringify(permissions)); }
      if (isActive !== undefined) { updates.push('is_active = ?'); params.push(isActive ? 1 : 0); }
      if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
      updates.push('updated_at = ?'); params.push(nowIso());
      params.push(id);
      await db.run(`UPDATE platform_staff_extended SET ${updates.join(', ')} WHERE id = ?`, params);
      const staff = await db.get('SELECT * FROM platform_staff_extended WHERE id = ?', [id]);
      res.json({ data: staff, requestId: req.requestId });
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
      await db.run('UPDATE platform_staff_extended SET deleted_at = ? WHERE id = ?', [nowIso(), req.params.id]);
      await recordAuditEvent({ actorId: req.platformUser?.id, action: 'STAFF_DELETED', resourceType: 'platform_staff_extended', resourceId: req.params.id, ipAddress: req.ip });
      res.json({ data: { deleted: true }, requestId: req.requestId });
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



module.exports = router;
