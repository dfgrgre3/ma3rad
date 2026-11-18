'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../lib/db');
const { nowIso, addMonths } = require('../lib/time');
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

module.exports = router;
