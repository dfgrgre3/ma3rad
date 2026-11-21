'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../lib/db');
const { nowIso, addMonths, addDays } = require('../lib/time');
const { signCertificate, generateLicenseKey, generateActivationCode } = require('../lib/signing');
const { recordAuditEvent } = require('../lib/audit');
const { authenticatePlatformUser, requirePlatformPermission, getScopedTenantIds, assertTenantAccess, tenantScopePredicate } = require('../middleware/auth');

const router = express.Router();

const OPEN_SUBSCRIPTION_STATUSES = ['ACTIVE', 'TRIAL', 'PAST_DUE', 'SUSPENDED'];

function mapSubscription(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name ?? null,
    tenantCode: row.tenant_code ?? null,
    planId: row.plan_id,
    planName: row.plan_name ?? null,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date ?? null,
    seats: Number(row.seats) || 1,
    price: Number(row.price) || 0,
    discount: Number(row.discount) || 0,
    billingCycle: row.billing_cycle,
    autoRenew: Boolean(row.auto_renew),
    branchesLimit: Number(row.branches_limit) || 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const auditSubscription = (req, action, resourceId, details = {}) => recordAuditEvent({
  actorId: req.platformUser?.id,
  actorName: req.platformUser?.full_name,
  action,
  resourceType: 'platform_subscriptions',
  resourceId,
  afterData: details,
  ipAddress: req.ip,
  userAgent: req.headers['user-agent'],
});

async function findOpenSubscription(db, tenantId) {
  return db.get(
    `SELECT * FROM platform_subscriptions
     WHERE tenant_id = ? AND status IN (${OPEN_SUBSCRIPTION_STATUSES.map(() => '?').join(',')})
     ORDER BY created_at DESC LIMIT 1`,
    [tenantId, ...OPEN_SUBSCRIPTION_STATUSES]
  );
}

router.get(
  '/',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.subscriptions.view']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { status = '', planId = '', search = '' } = req.query;
      const scoped = await getScopedTenantIds(req);
      if (Array.isArray(scoped) && scoped.length === 0) {
        return res.json({ data: [], meta: { total: 0 } });
      }
      const scopePredicate = tenantScopePredicate('s.tenant_id', scoped);
      let sql = `
        SELECT s.*, t.name AS tenant_name, t.code AS tenant_code, p.name AS plan_name
        FROM platform_subscriptions s
        JOIN platform_tenants t ON t.id = s.tenant_id
        LEFT JOIN platform_plans p ON p.id = s.plan_id
        WHERE 1=1${scopePredicate.clause}
      `;
      const params = [...scopePredicate.params];
      if (status) { sql += ' AND s.status = ?'; params.push(status); }
      if (planId) { sql += ' AND s.plan_id = ?'; params.push(planId); }
      if (search) {
        sql += ' AND (t.name LIKE ? OR t.code LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
      }
      sql += ' ORDER BY s.created_at DESC';
      const rows = await db.all(sql, params);
      const data = rows.map(mapSubscription);
      res.json({ data, meta: { total: data.length } });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:tenantId/renew',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.subscriptions.update']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { tenantId } = req.params;
      const months = Math.max(1, Math.min(60, Number(req.body?.months) || 12));

      const tenant = await db.get('SELECT * FROM platform_tenants WHERE id = ?', [tenantId]);
      if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
      if (!(await assertTenantAccess(req, res, tenantId))) return;

      const sub = await findOpenSubscription(db, tenantId);
      if (!sub) return res.status(400).json({ error: 'No open subscription for this tenant' });

      const now = nowIso();
      const base = sub.end_date && new Date(sub.end_date) > new Date() ? new Date(sub.end_date) : new Date();
      const newEnd = addMonths(base, months);

      await db.exec('BEGIN TRANSACTION');
      try {
        await db.run('UPDATE platform_subscriptions SET end_date = ?, updated_at = ? WHERE id = ?', [newEnd.toISOString(), now, sub.id]);
        await db.run(
          `UPDATE platform_licenses SET expires_at = ?, updated_at = ?
           WHERE subscription_id = ? AND status IN ('ACTIVE','ISSUED','SUSPENDED')`,
          [newEnd.toISOString(), now, sub.id]
        );
        await db.run('UPDATE platform_tenants SET subscription_expires_at = ?, updated_at = ? WHERE id = ?', [newEnd.toISOString(), now, tenantId]);
        await db.exec('COMMIT');
      } catch (err) {
        await db.exec('ROLLBACK');
        throw err;
      }

      await auditSubscription(req, 'SUBSCRIPTION_RENEWED', sub.id, { tenantId, months, previousEndDate: sub.end_date, newEndDate: newEnd.toISOString() });
      res.json({ data: { subscriptionId: sub.id, endDate: newEnd.toISOString() }, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:tenantId/cancel',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.subscriptions.delete']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { tenantId } = req.params;
      const { reason } = req.body || {};

      const tenant = await db.get('SELECT * FROM platform_tenants WHERE id = ?', [tenantId]);
      if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
      if (!(await assertTenantAccess(req, res, tenantId))) return;

      const now = nowIso();
      await db.exec('BEGIN TRANSACTION');
      try {
        await db.run(
          `UPDATE platform_subscriptions SET status = 'CANCELLED', auto_renew = 0, updated_at = ?
           WHERE tenant_id = ? AND status IN (${OPEN_SUBSCRIPTION_STATUSES.map(() => '?').join(',')})`,
          [now, tenantId, ...OPEN_SUBSCRIPTION_STATUSES]
        );
        await db.run(
          `UPDATE platform_licenses SET status = 'REVOKED', updated_at = ?
           WHERE tenant_id = ? AND status IN ('ACTIVE','ISSUED','SUSPENDED','TRIAL')`,
          [now, tenantId]
        );
        await db.run(`UPDATE platform_tenants SET status = 'CANCELLED', updated_at = ? WHERE id = ?`, [now, tenantId]);
        await db.exec('COMMIT');
      } catch (err) {
        await db.exec('ROLLBACK');
        throw err;
      }

      await auditSubscription(req, 'SUBSCRIPTION_CANCELLED', tenantId, { tenantId, reason: reason || null });
      res.json({ data: { tenantId, status: 'CANCELLED' }, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:tenantId/change-plan',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.subscriptions.update']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { tenantId } = req.params;
      const { planId, months = 12, seats, reason } = req.body || {};

      if (!planId) return res.status(400).json({ error: 'planId is required' });

      const tenant = await db.get('SELECT * FROM platform_tenants WHERE id = ?', [tenantId]);
      if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
      if (!(await assertTenantAccess(req, res, tenantId))) return;

      const plan = await db.get('SELECT * FROM platform_plans WHERE id = ? AND is_active = 1', [planId]);
      if (!plan) return res.status(404).json({ error: 'Plan not found or inactive' });

      const now = nowIso();
      const start = new Date();
      const planCycle = ['MONTHLY', 'QUARTERLY', 'YEARLY', 'LIFETIME'].includes(plan.billing_cycle) ? plan.billing_cycle : 'YEARLY';
      const expires = planCycle === 'LIFETIME' ? null : addMonths(start, Math.max(1, Math.min(60, Number(months) || 12)));
      const finalSeats = Math.max(1, Number(seats) || plan.seats_limit);
      const finalBranchesLimit = Math.max(1, plan.branches_limit);
      const finalDeviceLimit = Math.max(1, plan.devices_limit);

      const subscriptionId = `sub_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      const licenseId = `lic_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      const licenseKey = generateLicenseKey();
      const activationCode = generateActivationCode();
      const previousPlanId = tenant.plan_id || null;

      const certificate = signCertificate({
        licenseKey,
        tenantId,
        planId,
        issuedAt: start.toISOString(),
        expiresAt: expires?.toISOString() ?? null,
        deviceLimit: finalDeviceLimit,
        seats: finalSeats,
        branchesLimit: finalBranchesLimit,
        offlineGracePeriodDays: plan.offline_grace_period_days,
        licenseType: planCycle === 'LIFETIME' ? 'perpetual' : (planCycle === 'YEARLY' ? 'annual' : 'monthly'),
      });

      await db.exec('BEGIN TRANSACTION');
      try {
        await db.run(
          `UPDATE platform_subscriptions SET status = 'CANCELLED', auto_renew = 0, updated_at = ?
           WHERE tenant_id = ? AND status IN (${OPEN_SUBSCRIPTION_STATUSES.map(() => '?').join(',')})`,
          [now, tenantId, ...OPEN_SUBSCRIPTION_STATUSES]
        );
        await db.run(
          `UPDATE platform_licenses SET status = 'REVOKED', updated_at = ?
           WHERE tenant_id = ? AND status IN ('ACTIVE','ISSUED','SUSPENDED','TRIAL')`,
          [now, tenantId]
        );

        await db.run(
          `INSERT INTO platform_subscriptions
            (id, tenant_id, plan_id, status, start_date, end_date, seats, price, discount, billing_cycle, auto_renew, branches_limit)
           VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, ?, 0, ?, 1, ?)`,
          [subscriptionId, tenantId, planId, start.toISOString(), expires?.toISOString() ?? null, finalSeats, plan.price, planCycle, finalBranchesLimit]
        );

        let modules = [];
        let features = [];
        try { modules = JSON.parse(plan.included_modules || '[]'); } catch { modules = []; }
        try { features = JSON.parse(plan.features || '[]'); } catch { features = []; }

        await db.run(
          `INSERT INTO platform_licenses
            (id, tenant_id, subscription_id, plan_id, license_key, status, issued_at, starts_at, expires_at,
             seats, device_limit, branches_limit, modules, features, activation_code, certificate, offline_grace_period_days, coupling_mode, notes)
           VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'FULL', ?)`,
          [
            licenseId, tenantId, subscriptionId, planId, licenseKey,
            start.toISOString(), start.toISOString(), expires?.toISOString() ?? null,
            finalSeats, finalDeviceLimit, finalBranchesLimit,
            JSON.stringify(modules), JSON.stringify(features),
            activationCode, JSON.stringify(certificate),
            plan.offline_grace_period_days,
            `تغيير باقة إلى ${plan.name}${reason ? `: ${reason}` : ''}`,
          ]
        );

        await db.run(
          `UPDATE platform_tenants SET status = 'ACTIVE', plan_id = ?, subscription_started_at = ?,
             subscription_expires_at = ?, seats_limit = ?, branches_limit = ?, devices_limit = ?, updated_at = ?
           WHERE id = ?`,
          [planId, start.toISOString(), expires?.toISOString() ?? null, finalSeats, finalBranchesLimit, finalDeviceLimit, now, tenantId]
        );

        await db.exec('COMMIT');
      } catch (err) {
        await db.exec('ROLLBACK');
        throw err;
      }

      await auditSubscription(req, 'SUBSCRIPTION_PLAN_CHANGED', subscriptionId, {
        tenantId, previousPlanId, newPlanId: planId, months: expires ? Number(months) || 12 : null,
        reason: reason || null,
      });

      res.status(201).json({
        data: {
          subscriptionId,
          licenseId,
          planId,
          previousPlanId,
          startDate: start.toISOString(),
          endDate: expires?.toISOString() ?? null,
          status: 'ACTIVE',
        },
        requestId: req.requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

const OPEN_STATUSES_FOR_UPDATE = ['ACTIVE', 'TRIAL', 'PAST_DUE', 'SUSPENDED'];

const clampInt = (value, fallback, min, max) => {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
};

async function recordSubscriptionChange(db, req, subscriptionId, changeType, oldValues, newValues, reason) {
  try {
    await db.run(
      `INSERT INTO platform_subscription_changes
        (id, subscription_id, change_type, old_values, new_values, actor_id, actor_name, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `sch_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
        subscriptionId,
        changeType,
        oldValues == null ? null : JSON.stringify(oldValues),
        newValues == null ? null : JSON.stringify(newValues),
        req.platformUser?.id ?? 'system',
        req.platformUser?.full_name ?? null,
        reason ?? null,
        nowIso(),
      ]
    );
  } catch {
    // Change log is best-effort.
  }
}

const CHANGE_TYPE_LABELS = {
  CREATE: 'إنشاء',
  RENEW: 'تجديد',
  SUSPEND: 'إيقاف',
  CANCEL: 'إلغاء',
  EXPIRE: 'انتهاء',
  PLAN_CHANGE: 'تغيير باقة',
  LIMIT_CHANGE: 'تغيير حدود',
  SEATS_CHANGE: 'تغيير مقاعد',
  BRANCHES_CHANGE: 'تغيير فروع',
};

router.post(
  '/',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.subscriptions.create', 'platform.subscriptions.manage', 'platform.subscriptions.update']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const body = req.body || {};
      const { tenantId, planId } = body;
      if (!tenantId || !planId) {
        return res.status(400).json({ error: 'tenantId and planId are required' });
      }

      const tenant = await db.get('SELECT * FROM platform_tenants WHERE id = ?', [tenantId]);
      if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
      if (!(await assertTenantAccess(req, res, tenantId))) return;

      const plan = await db.get('SELECT * FROM platform_plans WHERE id = ? AND is_active = 1', [planId]);
      if (!plan) return res.status(404).json({ error: 'Plan not found or inactive' });

      const isTrial = body.isTrial === true || body.isTrial === 1 || body.isTrial === '1';
      const now = nowIso();
      const start = body.startDate ? new Date(body.startDate) : new Date();
      if (Number.isNaN(start.getTime())) return res.status(400).json({ error: 'Invalid startDate' });

      let end = null;
      if (body.endDate) {
        const parsedEnd = new Date(body.endDate);
        if (Number.isNaN(parsedEnd.getTime())) return res.status(400).json({ error: 'Invalid endDate' });
        end = parsedEnd;
      } else if (isTrial) {
        end = addDays(start, Math.max(1, plan.trial_days || 14));
      } else {
        end = addMonths(start, 12);
      }

      const status = isTrial ? 'TRIAL' : (['ACTIVE', 'PAST_DUE', 'SUSPENDED'].includes(String(body.status).toUpperCase()) ? String(body.status).toUpperCase() : 'ACTIVE');
      const seats = clampInt(body.seats ?? plan.seats_limit, plan.seats_limit || 1, 1, 100000);
      const branchesLimit = clampInt(body.branchesLimit ?? plan.branches_limit, plan.branches_limit || 1, 1, 10000);
      const deviceLimit = Math.max(1, Number(plan.devices_limit) || 1);
      const price = isTrial ? 0 : Number(body.price ?? plan.price) || 0;
      const autoRenew = isTrial ? 1 : (body.autoRenew === false || body.autoRenew === 0 || body.autoRenew === '0' ? 0 : 1);
      const planCycle = ['MONTHLY', 'QUARTERLY', 'YEARLY', 'LIFETIME'].includes(plan.billing_cycle) ? plan.billing_cycle : 'YEARLY';
      const effectiveEnd = planCycle === 'LIFETIME' && !body.endDate ? null : end.toISOString();

      const subscriptionId = `sub_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      const licenseId = `lic_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      const licenseKey = generateLicenseKey();
      const activationCode = generateActivationCode();
      const certificate = signCertificate({
        licenseKey,
        tenantId,
        planId,
        issuedAt: start.toISOString(),
        expiresAt: effectiveEnd,
        deviceLimit,
        seats,
        branchesLimit,
        offlineGracePeriodDays: plan.offline_grace_period_days,
        licenseType: planCycle === 'LIFETIME' ? 'perpetual' : (planCycle === 'YEARLY' ? 'annual' : 'monthly'),
      });

      let modules = [];
      let features = [];
      try { modules = JSON.parse(plan.included_modules || '[]'); } catch { modules = []; }
      try { features = JSON.parse(plan.features || '[]'); } catch { features = []; }

      await db.exec('BEGIN TRANSACTION');
      try {
        await db.run(
          `INSERT INTO platform_subscriptions
            (id, tenant_id, plan_id, status, start_date, end_date, seats, price, discount, billing_cycle, auto_renew, branches_limit)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
          [subscriptionId, tenantId, planId, status, start.toISOString(), effectiveEnd, seats, price, planCycle, autoRenew, branchesLimit]
        );

        await db.run(
          `INSERT INTO platform_licenses
            (id, tenant_id, subscription_id, plan_id, license_key, status, issued_at, starts_at, expires_at,
             seats, device_limit, branches_limit, modules, features, activation_code, certificate, offline_grace_period_days, coupling_mode, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'FULL', ?)`,
          [
            licenseId, tenantId, subscriptionId, planId, licenseKey,
            'ACTIVE',
            start.toISOString(), start.toISOString(), effectiveEnd,
            seats, deviceLimit, branchesLimit,
            JSON.stringify(modules), JSON.stringify(features),
            activationCode, JSON.stringify(certificate),
            plan.offline_grace_period_days,
            isTrial ? 'اشتراك تجريبي' : 'اشتراك جديد',
          ]
        );

        await db.run(
          `UPDATE platform_tenants SET status = 'ACTIVE', plan_id = ?, subscription_started_at = ?,
             subscription_expires_at = ?, seats_limit = ?, branches_limit = ?, devices_limit = ?, updated_at = ?
           WHERE id = ?`,
          [planId, start.toISOString(), effectiveEnd, seats, branchesLimit, deviceLimit, now, tenantId]
        );

        await db.exec('COMMIT');
      } catch (err) {
        await db.exec('ROLLBACK');
        throw err;
      }

      await recordSubscriptionChange(db, req, subscriptionId, 'CREATE', null, {
        tenantId, planId, status, isTrial, startDate: start.toISOString(), endDate: effectiveEnd,
      }, isTrial ? 'إنشاء اشتراك تجريبي' : 'إنشاء اشتراك');
      await auditSubscription(req, isTrial ? 'TRIAL_CREATED' : 'SUBSCRIPTION_CREATED', subscriptionId, {
        tenantId, planId, status, seats, price, endDate: effectiveEnd,
      });

      res.status(201).json({
        data: {
          subscriptionId,
          licenseId,
          tenantId,
          planId,
          status,
          startDate: start.toISOString(),
          endDate: effectiveEnd,
        },
        requestId: req.requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/trial',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.subscriptions.create', 'platform.subscriptions.manage', 'platform.subscriptions.update']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const body = req.body || {};
      const tenantId = body.tenantId;
      const planId = body.planId;
      if (!tenantId || !planId) {
        return res.status(400).json({ error: 'tenantId and planId are required' });
      }
      const tenant = await db.get('SELECT * FROM platform_tenants WHERE id = ?', [tenantId]);
      if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
      if (!(await assertTenantAccess(req, res, tenantId))) return;

      const plan = await db.get('SELECT * FROM platform_plans WHERE id = ? AND is_active = 1', [planId]);
      if (!plan) return res.status(404).json({ error: 'Plan not found or inactive' });

      const trialDays = clampInt(body.trialDays ?? plan.trial_days, plan.trial_days || 14, 1, 365);
      const now = nowIso();
      const start = new Date();
      const end = addDays(start, trialDays);
      const seats = clampInt(body.seats ?? plan.seats_limit, plan.seats_limit || 1, 1, 100000);
      const branchesLimit = clampInt(body.branchesLimit ?? plan.branches_limit, plan.branches_limit || 1, 1, 10000);
      const deviceLimit = Math.max(1, Number(plan.devices_limit) || 1);
      const planCycle = ['MONTHLY', 'QUARTERLY', 'YEARLY', 'LIFETIME'].includes(plan.billing_cycle) ? plan.billing_cycle : 'YEARLY';

      const subscriptionId = `sub_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      const licenseId = `lic_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      const licenseKey = generateLicenseKey();
      const activationCode = generateActivationCode();
      const certificate = signCertificate({
        licenseKey,
        tenantId,
        planId,
        issuedAt: start.toISOString(),
        expiresAt: end.toISOString(),
        deviceLimit,
        seats,
        branchesLimit,
        offlineGracePeriodDays: plan.offline_grace_period_days,
        licenseType: 'trial',
      });

      let modules = [];
      let features = [];
      try { modules = JSON.parse(plan.included_modules || '[]'); } catch { modules = []; }
      try { features = JSON.parse(plan.features || '[]'); } catch { features = []; }

      await db.exec('BEGIN TRANSACTION');
      try {
        await db.run(
          `INSERT INTO platform_subscriptions
            (id, tenant_id, plan_id, status, start_date, end_date, seats, price, discount, billing_cycle, auto_renew, branches_limit)
           VALUES (?, ?, ?, 'TRIAL', ?, ?, ?, 0, 0, ?, 1, ?)`,
          [subscriptionId, tenantId, planId, start.toISOString(), end.toISOString(), seats, planCycle, branchesLimit]
        );
        await db.run(
          `INSERT INTO platform_licenses
            (id, tenant_id, subscription_id, plan_id, license_key, status, issued_at, starts_at, expires_at,
             seats, device_limit, branches_limit, modules, features, activation_code, certificate, offline_grace_period_days, coupling_mode, notes)
           VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'FULL', 'اشتراك تجريبي')`,
          [
            licenseId, tenantId, subscriptionId, planId, licenseKey,
            start.toISOString(), start.toISOString(), end.toISOString(),
            seats, deviceLimit, branchesLimit,
            JSON.stringify(modules), JSON.stringify(features),
            activationCode, JSON.stringify(certificate),
            plan.offline_grace_period_days,
          ]
        );
        await db.run(
          `UPDATE platform_tenants SET status = 'ACTIVE', plan_id = ?, subscription_started_at = ?,
             subscription_expires_at = ?, seats_limit = ?, branches_limit = ?, devices_limit = ?, updated_at = ?
           WHERE id = ?`,
          [planId, start.toISOString(), end.toISOString(), seats, branchesLimit, deviceLimit, now, tenantId]
        );
        await db.exec('COMMIT');
      } catch (err) {
        await db.exec('ROLLBACK');
        throw err;
      }

      await recordSubscriptionChange(db, req, subscriptionId, 'CREATE', null, {
        tenantId, planId, trial: true, trialDays, startDate: start.toISOString(), endDate: end.toISOString(),
      }, 'إنشاء اشتراك تجريبي');
      await auditSubscription(req, 'TRIAL_CREATED', subscriptionId, { tenantId, planId, trialDays, endDate: end.toISOString() });

      res.status(201).json({
        data: {
          subscriptionId,
          licenseId,
          tenantId,
          planId,
          status: 'TRIAL',
          startDate: start.toISOString(),
          endDate: end.toISOString(),
        },
        requestId: req.requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:tenantId/suspend',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.subscriptions.update', 'platform.subscriptions.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { tenantId } = req.params;
      const { reason } = req.body || {};

      const tenant = await db.get('SELECT * FROM platform_tenants WHERE id = ?', [tenantId]);
      if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
      if (!(await assertTenantAccess(req, res, tenantId))) return;

      const subs = await db.all(
        `SELECT id FROM platform_subscriptions WHERE tenant_id = ? AND status IN ('ACTIVE','TRIAL','PAST_DUE')`,
        [tenantId]
      );
      if (subs.length === 0) return res.status(400).json({ error: 'No open subscription to suspend' });

      const now = nowIso();
      await db.exec('BEGIN TRANSACTION');
      try {
        await db.run(
          `UPDATE platform_subscriptions SET status = 'SUSPENDED', updated_at = ?
           WHERE tenant_id = ? AND status IN ('ACTIVE','TRIAL','PAST_DUE')`,
          [now, tenantId]
        );
        await db.run(
          `UPDATE platform_licenses SET status = 'SUSPENDED', updated_at = ?
           WHERE tenant_id = ? AND status IN ('ACTIVE','ISSUED','TRIAL')`,
          [now, tenantId]
        );
        await db.exec('COMMIT');
      } catch (err) {
        await db.exec('ROLLBACK');
        throw err;
      }

      for (const sub of subs) {
        await recordSubscriptionChange(db, req, sub.id, 'SUSPEND', { status: 'ACTIVE' }, { status: 'SUSPENDED' }, reason);
      }
      await auditSubscription(req, 'SUBSCRIPTION_SUSPENDED', tenantId, { tenantId, reason: reason || null, count: subs.length });
      res.json({ data: { tenantId, status: 'SUSPENDED', affectedSubscriptions: subs.length }, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:tenantId/resume',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.subscriptions.update', 'platform.subscriptions.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { tenantId } = req.params;

      const tenant = await db.get('SELECT * FROM platform_tenants WHERE id = ?', [tenantId]);
      if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
      if (!(await assertTenantAccess(req, res, tenantId))) return;

      const subs = await db.all(
        `SELECT id FROM platform_subscriptions WHERE tenant_id = ? AND status = 'SUSPENDED'`,
        [tenantId]
      );
      if (subs.length === 0) return res.status(400).json({ error: 'No suspended subscription to resume' });

      const now = nowIso();
      await db.exec('BEGIN TRANSACTION');
      try {
        await db.run(
          `UPDATE platform_subscriptions SET status = 'ACTIVE', updated_at = ?
           WHERE tenant_id = ? AND status = 'SUSPENDED'`,
          [now, tenantId]
        );
        await db.run(
          `UPDATE platform_licenses SET status = 'ACTIVE', updated_at = ?
           WHERE tenant_id = ? AND status = 'SUSPENDED'`,
          [now, tenantId]
        );
        await db.exec('COMMIT');
      } catch (err) {
        await db.exec('ROLLBACK');
        throw err;
      }

      for (const sub of subs) {
        await recordSubscriptionChange(db, req, sub.id, 'SUSPEND', { status: 'SUSPENDED' }, { status: 'ACTIVE' }, 'إعادة تفعيل');
      }
      await auditSubscription(req, 'SUBSCRIPTION_RESUMED', tenantId, { tenantId, count: subs.length });
      res.json({ data: { tenantId, status: 'ACTIVE', affectedSubscriptions: subs.length }, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/:tenantId',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.subscriptions.update', 'platform.subscriptions.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { tenantId } = req.params;
      const body = req.body || {};

      const tenant = await db.get('SELECT * FROM platform_tenants WHERE id = ?', [tenantId]);
      if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
      if (!(await assertTenantAccess(req, res, tenantId))) return;

      const subs = await db.all(
        `SELECT id, seats, branches_limit, auto_renew FROM platform_subscriptions
         WHERE tenant_id = ? AND status IN (${OPEN_STATUSES_FOR_UPDATE.map(() => '?').join(',')})`,
        [tenantId, ...OPEN_STATUSES_FOR_UPDATE]
      );
      if (subs.length === 0) return res.status(400).json({ error: 'No open subscription to update' });

      const updates = [];
      const params = [];
      const changes = [];
      const now = nowIso();

      if (body.autoRenew !== undefined) {
        const autoRenew = body.autoRenew === true || body.autoRenew === 1 || body.autoRenew === '1' ? 1 : 0;
        updates.push('auto_renew = ?');
        params.push(autoRenew);
        changes.push({ field: 'autoRenew', oldValue: Boolean(subs[0].auto_renew), newValue: Boolean(autoRenew) });
      }
      if (body.seats !== undefined || body.branchesLimit !== undefined) {
        const seats = body.seats !== undefined ? clampInt(body.seats, subs[0].seats, 1, 100000) : null;
        const branchesLimit = body.branchesLimit !== undefined ? clampInt(body.branchesLimit, subs[0].branches_limit, 1, 10000) : null;
        if (seats !== null) { updates.push('seats = ?'); params.push(seats); changes.push({ field: 'seats', oldValue: subs[0].seats, newValue: seats }); }
        if (branchesLimit !== null) { updates.push('branches_limit = ?'); params.push(branchesLimit); changes.push({ field: 'branchesLimit', oldValue: subs[0].branches_limit, newValue: branchesLimit }); }
      }
      if (updates.length === 0) {
        return res.status(400).json({ error: 'No updatable fields provided' });
      }

      updates.push('updated_at = ?');
      params.push(now, tenantId, ...OPEN_STATUSES_FOR_UPDATE);

      await db.exec('BEGIN TRANSACTION');
      try {
        await db.run(
          `UPDATE platform_subscriptions SET ${updates.join(', ')}
           WHERE tenant_id = ? AND status IN (${OPEN_STATUSES_FOR_UPDATE.map(() => '?').join(',')})`,
          params
        );
        if (body.seats !== undefined || body.branchesLimit !== undefined) {
          const seats = body.seats !== undefined ? clampInt(body.seats, subs[0].seats, 1, 100000) : subs[0].seats;
          const branchesLimit = body.branchesLimit !== undefined ? clampInt(body.branchesLimit, subs[0].branches_limit, 1, 10000) : subs[0].branches_limit;
          await db.run(
            `UPDATE platform_licenses SET seats = ?, branches_limit = ?, updated_at = ?
             WHERE tenant_id = ? AND status IN ('ACTIVE','ISSUED','SUSPENDED','TRIAL')`,
            [seats, branchesLimit, now, tenantId]
          );
          await db.run(
            `UPDATE platform_tenants SET seats_limit = ?, branches_limit = ?, updated_at = ? WHERE id = ?`,
            [seats, branchesLimit, now, tenantId]
          );
        }
        await db.exec('COMMIT');
      } catch (err) {
        await db.exec('ROLLBACK');
        throw err;
      }

      for (const sub of subs) {
        const changeType = body.seats !== undefined || body.branchesLimit !== undefined ? 'SEATS_CHANGE' : 'LIMIT_CHANGE';
        await recordSubscriptionChange(db, req, sub.id, changeType,
          { seats: sub.seats, branchesLimit: sub.branches_limit, autoRenew: Boolean(sub.auto_renew) },
          { seats: body.seats !== undefined ? clampInt(body.seats, sub.seats, 1, 100000) : sub.seats, branchesLimit: body.branchesLimit !== undefined ? clampInt(body.branchesLimit, sub.branches_limit, 1, 10000) : sub.branches_limit, autoRenew: body.autoRenew !== undefined ? (body.autoRenew === true || body.autoRenew === 1 || body.autoRenew === '1') : Boolean(sub.auto_renew) },
          body.reason || null);
      }
      await auditSubscription(req, 'SUBSCRIPTION_SETTINGS_UPDATED', tenantId, { tenantId, changes });
      res.json({ data: { tenantId, updated: true, changes }, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/:tenantId/history',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.subscriptions.view']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { tenantId } = req.params;
      const limit = clampInt(req.query.limit, 50, 1, 200);

      const tenant = await db.get('SELECT id FROM platform_tenants WHERE id = ?', [tenantId]);
      if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
      if (!(await assertTenantAccess(req, res, tenantId))) return;

      const rows = await db.all(
        `SELECT c.id, c.subscription_id, c.change_type, c.old_values, c.new_values,
                c.actor_name, c.reason, c.created_at
         FROM platform_subscription_changes c
         JOIN platform_subscriptions s ON s.id = c.subscription_id
         WHERE s.tenant_id = ?
         ORDER BY c.created_at DESC
         LIMIT ?`,
        [tenantId, limit]
      );

      const data = rows.map((row) => ({
        id: row.id,
        subscriptionId: row.subscription_id,
        changeType: row.change_type,
        changeTypeLabel: CHANGE_TYPE_LABELS[row.change_type] ?? row.change_type,
        oldValues: row.old_values ?? null,
        newValues: row.new_values ?? null,
        actorName: row.actor_name ?? null,
        reason: row.reason ?? null,
        createdAt: row.created_at,
      }));
      res.json({ data, meta: { total: data.length } });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
