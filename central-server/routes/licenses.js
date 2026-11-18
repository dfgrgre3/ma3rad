'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../lib/db');
const { nowIso, addMonths } = require('../lib/time');
const {
  signCertificate,
  generateLicenseKey,
  generateActivationCode,
} = require('../lib/signing');
const { recordAuditEvent } = require('../lib/audit');
const { authenticatePlatformUser, requirePlatformPermission, requireTenantScope, getScopedTenantIds, assertTenantAccess, tenantScopePredicate } = require('../middleware/auth');

const router = express.Router();

const auditLicenseChange = (req, action, resourceId, details = {}) => recordAuditEvent({
  actorId: req.platformUser?.id,
  actorName: req.platformUser?.full_name,
  action,
  resourceType: 'platform_licenses',
  resourceId,
  afterData: details,
  ipAddress: req.ip,
  userAgent: req.headers['user-agent'],
});

router.get(
  '/',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.licenses.view', 'platform.licenses.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { search = '', status = '' } = req.query;
      const scoped = await getScopedTenantIds(req);
      if (Array.isArray(scoped) && scoped.length === 0) {
        return res.json([]);
      }
      const scopePredicate = tenantScopePredicate('l.tenant_id', scoped);
      let sql = `
        SELECT l.*, t.name AS tenantName, p.name AS planName
        FROM platform_licenses l
        JOIN platform_tenants t ON t.id = l.tenant_id
        LEFT JOIN platform_plans p ON p.id = l.plan_id
        WHERE 1=1${scopePredicate.clause}
      `;
      const params = [...scopePredicate.params];

      if (search) {
        sql += " AND (t.name LIKE ? OR l.license_key LIKE ? OR COALESCE(l.hardware_id,'') LIKE ?)";
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }
      if (status) {
        sql += ' AND l.status = ?';
        params.push(status);
      }

      sql += ' ORDER BY l.created_at DESC';
      const licenses = await db.all(sql, params);
      res.json(licenses);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/issue',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.licenses.create', 'platform.licenses.manage']),
  requireTenantScope(),
  async (req, res, next) => {
    try {
      const db = getDb();
      const {
        tenantId,
        planId,
        months = 12,
        seats,
        branchesLimit,
        deviceLimit,
        startsAt,
        expiresAt,
        offlineGracePeriodDays,
        couplingMode = 'FULL',
        modules,
        features,
        hardwareId,
        notes,
      } = req.body || {};

      if (!tenantId || !planId) {
        return res.status(400).json({ error: 'tenantId and planId are required' });
      }

      const tenant = await db.get('SELECT * FROM platform_tenants WHERE id = ?', [tenantId]);
      if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

      const plan = await db.get('SELECT * FROM platform_plans WHERE id = ?', [planId]);
      if (!plan) return res.status(404).json({ error: 'Plan not found' });

      const start = startsAt ? new Date(startsAt) : new Date();
      const expires = expiresAt ? new Date(expiresAt) : (plan.billing_cycle === 'LIFETIME' ? null : addMonths(start, months));
      const subscriptionId = `sub_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      const licenseId = `lic_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      const licenseKey = generateLicenseKey();
      const activationCode = generateActivationCode();
      const finalSeats = Math.max(1, seats || plan.seats_limit);
      const finalBranchesLimit = Math.max(1, branchesLimit || plan.branches_limit);
      const finalDeviceLimit = Math.max(1, deviceLimit || plan.devices_limit);
      const finalOfflineGracePeriodDays = offlineGracePeriodDays || plan.offline_grace_period_days;
      const finalModules = modules || JSON.parse(plan.included_modules);
      const finalFeatures = features || JSON.parse(plan.features);

      const certificate = signCertificate({
        licenseKey,
        tenantId,
        planId,
        issuedAt: start.toISOString(),
        expiresAt: expires?.toISOString() ?? null,
        deviceLimit: finalDeviceLimit,
        seats: finalSeats,
        branchesLimit: finalBranchesLimit,
        offlineGracePeriodDays: finalOfflineGracePeriodDays,
        licenseType: plan.billing_cycle === 'LIFETIME' ? 'perpetual' : (plan.billing_cycle === 'YEARLY' ? 'annual' : 'monthly'),
      });

      await db.exec('BEGIN TRANSACTION');
      try {
        await db.run(
          `INSERT INTO platform_subscriptions
            (id, tenant_id, plan_id, status, start_date, end_date, seats, price, discount, billing_cycle, auto_renew, branches_limit)
           VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, ?, 0, ?, 1, ?)`,
          [subscriptionId, tenantId, planId, start.toISOString(), expires?.toISOString() ?? null, finalSeats, plan.price, plan.billing_cycle, finalBranchesLimit]
        );

        await db.run(
          `INSERT INTO platform_licenses
            (id, tenant_id, subscription_id, plan_id, license_key, status, issued_at, starts_at, expires_at,
             seats, device_limit, branches_limit, modules, features, activation_code, certificate, offline_grace_period_days, coupling_mode, notes)
            VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            licenseId, tenantId, subscriptionId, planId, licenseKey,
            start.toISOString(), start.toISOString(), expires?.toISOString() ?? null,
            finalSeats, finalDeviceLimit, finalBranchesLimit,
            JSON.stringify(finalModules), JSON.stringify(finalFeatures),
            activationCode, JSON.stringify(certificate),
            finalOfflineGracePeriodDays, couplingMode, notes,
          ]
        );

        await db.run(
          `UPDATE platform_tenants SET status = 'ACTIVE', plan_id = ?, subscription_started_at = ?,
             subscription_expires_at = ?, seats_limit = ?, branches_limit = ?, devices_limit = ?, updated_at = ?
           WHERE id = ?`,
          [planId, start.toISOString(), expires?.toISOString() ?? null, finalSeats, finalBranchesLimit, finalDeviceLimit, nowIso(), tenantId]
        );

        await db.run(
          `INSERT INTO platform_license_activations
            (id, license_id, tenant_id, device_id, activation_code, mode, action, status, notes)
           VALUES (?, ?, ?, ?, ?, 'ONLINE', 'ACTIVATE', 'SUCCESS', ?)`,
          [`lact_${uuidv4().replace(/-/g, '').slice(0, 12)}`, licenseId, tenantId, hardwareId || null, activationCode, 'إصدار ترخيص من الخادم المركزي']
        );

        await db.run(
          `INSERT INTO platform_license_changes
            (id, license_id, subscription_id, change_type, old_values, new_values, actor_id, actor_name, reason)
           VALUES (?, ?, ?, 'ISSUE', NULL, ?, ?, ?, ?)`,
          [
            `lchg_${uuidv4().replace(/-/g, '').slice(0, 12)}`, licenseId, subscriptionId,
            JSON.stringify({
              licenseKey: '[REDACTED]', tenantId, planId, startsAt: start.toISOString(), expiresAt: expires?.toISOString() ?? null,
              seats: finalSeats, deviceLimit: finalDeviceLimit, branchesLimit: finalBranchesLimit,
              modules: finalModules, features: finalFeatures,
              offlineGracePeriodDays: finalOfflineGracePeriodDays, couplingMode,
            }),
            req.platformUser.id, req.platformUser.full_name, 'إصدار ترخيص جديد من الخادم المركزي',
          ]
        );

        await db.exec('COMMIT');

        const license = await db.get(`
          SELECT l.*, t.name AS tenantName, p.name AS planName
          FROM platform_licenses l
          JOIN platform_tenants t ON t.id = l.tenant_id
          LEFT JOIN platform_plans p ON p.id = l.plan_id
          WHERE l.id = ?
        `, [licenseId]);

        await auditLicenseChange(req, 'LICENSE_ISSUED', licenseId, { tenantId, planId, licenseKey: '[REDACTED]', expiresAt: expires?.toISOString() ?? null });

        res.status(201).json({
          license: {
            ...license,
            certificate: JSON.parse(license.certificate),
          },
          subscription: {
            id: subscriptionId,
            planId,
            status: 'ACTIVE',
            startDate: start.toISOString(),
            endDate: expires?.toISOString() ?? null,
            seats: finalSeats,
            price: plan.price,
            billingCycle: plan.billing_cycle,
            branchesLimit: finalBranchesLimit,
          },
          tenant: {
            id: tenant.id,
            name: tenant.name,
            code: tenant.code,
            status: 'ACTIVE',
          },
        });
        return undefined;
      } catch (err) {
        await db.exec('ROLLBACK');
        throw err;
      }
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:id/renew',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.licenses.update', 'platform.licenses.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { id } = req.params;
      const { months = 12 } = req.body || {};

      const license = await db.get('SELECT * FROM platform_licenses WHERE id = ?', [id]);
      if (!license) return res.status(404).json({ error: 'License not found' });
      if (!(await assertTenantAccess(req, res, license.tenant_id))) return;

      const base = license.expires_at && new Date(license.expires_at) > new Date()
        ? new Date(license.expires_at)
        : new Date();
      const expires = addMonths(base, Math.max(1, months));
      const coupling = license.coupling_mode || 'FULL';

      await db.exec('BEGIN TRANSACTION');
      try {
        await db.run(
          `UPDATE platform_licenses SET status = 'ACTIVE', expires_at = ?, updated_at = ? WHERE id = ?`,
          [expires.toISOString(), nowIso(), id]
        );

        if (coupling === 'FULL' || coupling === 'EXPIRY_ONLY') {
          if (license.subscription_id) {
            await db.run(
              `UPDATE platform_subscriptions SET status = 'ACTIVE', end_date = ?, updated_at = ? WHERE id = ?`,
              [expires.toISOString(), nowIso(), license.subscription_id]
            );
          }
          await db.run(
            `UPDATE platform_tenants SET status = 'ACTIVE', subscription_expires_at = ?, updated_at = ? WHERE id = ?`,
            [expires.toISOString(), nowIso(), license.tenant_id]
          );
        }

        await db.run(
          `INSERT INTO platform_license_activations
            (id, license_id, tenant_id, device_id, activation_code, mode, action, status, notes)
           VALUES (?, ?, ?, ?, ?, 'ONLINE', 'RENEW', 'SUCCESS', ?)`,
          [`lact_${uuidv4().replace(/-/g, '').slice(0, 12)}`, license.id, license.tenant_id, license.hardware_id, license.activation_code, `تجديد ${months} شهر`]
        );

        await db.run(
          `INSERT INTO platform_license_changes
            (id, license_id, subscription_id, change_type, old_values, new_values, actor_id, actor_name, reason)
           VALUES (?, ?, ?, 'RENEW', ?, ?, ?, ?, ?)`,
          [
            `lchg_${uuidv4().replace(/-/g, '').slice(0, 12)}`, license.id, license.subscription_id,
            JSON.stringify({ expiresAt: license.expires_at }), JSON.stringify({ expiresAt: expires.toISOString() }),
            req.platformUser.id, req.platformUser.full_name, `تجديد ${months} شهر`,
          ]
        );

        await db.exec('COMMIT');

        const updated = await db.get('SELECT * FROM platform_licenses WHERE id = ?', [id]);
        await auditLicenseChange(req, 'LICENSE_RENEWED', id, {
          months,
          previousExpiresAt: license.expires_at,
          newExpiresAt: expires.toISOString(),
        });
        res.json({ license: updated, previousExpiresAt: license.expires_at, newExpiresAt: expires.toISOString() });
        return undefined;
      } catch (err) {
        await db.exec('ROLLBACK');
        throw err;
      }
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:id/suspend',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.licenses.update', 'platform.licenses.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { id } = req.params;
      const { reason } = req.body || {};

      const license = await db.get('SELECT * FROM platform_licenses WHERE id = ?', [id]);
      if (!license) return res.status(404).json({ error: 'License not found' });
      if (!(await assertTenantAccess(req, res, license.tenant_id))) return;

      await db.run(
        `UPDATE platform_licenses SET status = 'SUSPENDED', updated_at = ? WHERE id = ?`,
        [nowIso(), id]
      );

      await db.run(
        `INSERT INTO platform_license_activations
          (id, license_id, tenant_id, device_id, activation_code, mode, action, status, notes)
         VALUES (?, ?, ?, ?, ?, 'ONLINE', 'DEACTIVATE', 'SUCCESS', ?)`,
        [`lact_${uuidv4().replace(/-/g, '').slice(0, 12)}`, license.id, license.tenant_id, license.hardware_id, license.activation_code, reason || 'إيقاف الترخيص من الخادم المركزي']
      );

      await db.run(
        `INSERT INTO platform_license_changes
          (id, license_id, subscription_id, change_type, old_values, new_values, actor_id, actor_name, reason)
         VALUES (?, ?, ?, 'SUSPEND', ?, ?, ?, ?, ?)`,
        [
          `lchg_${uuidv4().replace(/-/g, '').slice(0, 12)}`, license.id, license.subscription_id,
          JSON.stringify({ status: license.status }), JSON.stringify({ status: 'SUSPENDED' }),
          req.platformUser.id, req.platformUser.full_name, reason || 'إيقاف من الخادم المركزي',
        ]
      );

      await auditLicenseChange(req, 'LICENSE_SUSPENDED', id, { reason: reason || null });
      res.json({ licenseId: id, status: 'SUSPENDED', suspendedAt: nowIso() });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:id/reactivate',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.licenses.update', 'platform.licenses.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { id } = req.params;
      const { reason } = req.body || {};

      const license = await db.get('SELECT * FROM platform_licenses WHERE id = ?', [id]);
      if (!license) return res.status(404).json({ error: 'License not found' });
      if (!(await assertTenantAccess(req, res, license.tenant_id))) return;
      if (license.status === 'REVOKED') {
        return res.status(400).json({ error: 'Revoked licenses cannot be reactivated' });
      }
      if (license.status === 'ACTIVE') {
        return res.status(400).json({ error: 'License is already active' });
      }

      await db.run(
        `UPDATE platform_licenses SET status = 'ACTIVE', updated_at = ? WHERE id = ?`,
        [nowIso(), id]
      );

      await db.run(
        `INSERT INTO platform_license_activations
          (id, license_id, tenant_id, device_id, activation_code, mode, action, status, notes)
         VALUES (?, ?, ?, ?, ?, 'ONLINE', 'ACTIVATE', 'SUCCESS', ?)`,
        [`lact_${uuidv4().replace(/-/g, '').slice(0, 12)}`, license.id, license.tenant_id, license.hardware_id, license.activation_code, reason || 'إعادة تفعيل الترخيص من الخادم المركزي']
      );

      await db.run(
        `INSERT INTO platform_license_changes
          (id, license_id, subscription_id, change_type, old_values, new_values, actor_id, actor_name, reason)
         VALUES (?, ?, ?, 'REACTIVATE', ?, ?, ?, ?, ?)`,
        [
          `lchg_${uuidv4().replace(/-/g, '').slice(0, 12)}`, license.id, license.subscription_id,
          JSON.stringify({ status: license.status }), JSON.stringify({ status: 'ACTIVE' }),
          req.platformUser.id, req.platformUser.full_name, reason || 'إعادة تفعيل من الخادم المركزي',
        ]
      );

      await auditLicenseChange(req, 'LICENSE_REACTIVATED', id, { reason: reason || null, previousStatus: license.status });
      res.json({ licenseId: id, status: 'ACTIVE', previousStatus: license.status });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:id/revoke',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.licenses.delete', 'platform.licenses.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { id } = req.params;
      const { reason } = req.body || {};

      const license = await db.get('SELECT * FROM platform_licenses WHERE id = ?', [id]);
      if (!license) return res.status(404).json({ error: 'License not found' });
      if (!(await assertTenantAccess(req, res, license.tenant_id))) return;

      await db.run(
        `UPDATE platform_licenses SET status = 'REVOKED', updated_at = ? WHERE id = ?`,
        [nowIso(), id]
      );

      await db.run(
        `INSERT INTO platform_license_activations
          (id, license_id, tenant_id, device_id, activation_code, mode, action, status, notes)
         VALUES (?, ?, ?, ?, ?, 'ONLINE', 'REVOKE', 'SUCCESS', ?)`,
        [`lact_${uuidv4().replace(/-/g, '').slice(0, 12)}`, license.id, license.tenant_id, license.hardware_id, license.activation_code, reason || 'إلغاء الترخيص من الخادم المركزي']
      );

      await db.run(
        `INSERT INTO platform_license_changes
          (id, license_id, subscription_id, change_type, old_values, new_values, actor_id, actor_name, reason)
         VALUES (?, ?, ?, 'REVOKE', ?, ?, ?, ?, ?)`,
        [
          `lchg_${uuidv4().replace(/-/g, '').slice(0, 12)}`, license.id, license.subscription_id,
          JSON.stringify({ status: license.status }), JSON.stringify({ status: 'REVOKED' }),
          req.platformUser.id, req.platformUser.full_name, reason || 'إلغاء من الخادم المركزي',
        ]
      );

      await auditLicenseChange(req, 'LICENSE_REVOKED', id, { reason: reason || null });
      res.json({ licenseId: id, status: 'REVOKED', revokedAt: nowIso() });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:id/transfer',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.licenses.update', 'platform.licenses.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { id } = req.params;
      const { newHardwareId, reason } = req.body || {};

      if (!newHardwareId) {
        return res.status(400).json({ error: 'newHardwareId is required' });
      }

      const license = await db.get('SELECT * FROM platform_licenses WHERE id = ?', [id]);
      if (!license) return res.status(404).json({ error: 'License not found' });
      if (!(await assertTenantAccess(req, res, license.tenant_id))) return;

      await db.run(
        `UPDATE platform_licenses SET hardware_id = ?, transfer_count = transfer_count + 1, updated_at = ? WHERE id = ?`,
        [newHardwareId, nowIso(), id]
      );

      const device = await db.get('SELECT * FROM platform_devices WHERE license_id = ?', [id]);
      if (device) {
        await db.run(
          `UPDATE platform_devices SET hardware_id = ?, updated_at = ? WHERE id = ?`,
          [newHardwareId, nowIso(), device.id]
        );
      } else {
        await db.run(
          `INSERT INTO platform_devices
            (id, tenant_id, license_id, hardware_id, name, os, app_version, ip_address, first_activated_at, last_seen_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [`pdev_${uuidv4().replace(/-/g, '').slice(0, 12)}`, license.tenant_id, id, newHardwareId, null, null, null, null, nowIso(), nowIso()]
        );
      }

      await db.run(
        `INSERT INTO platform_license_activations
          (id, license_id, tenant_id, device_id, activation_code, mode, action, status, notes)
         VALUES (?, ?, ?, ?, ?, 'ONLINE', 'TRANSFER', 'SUCCESS', ?)`,
        [`lact_${uuidv4().replace(/-/g, '').slice(0, 12)}`, license.id, license.tenant_id, newHardwareId, license.activation_code, reason || 'نقل ترخيص إلى جهاز آخر']
      );

      await db.run(
        `INSERT INTO platform_license_changes
          (id, license_id, subscription_id, change_type, old_values, new_values, actor_id, actor_name, reason)
         VALUES (?, ?, ?, 'TRANSFER', ?, ?, ?, ?, ?)`,
        [
          `lchg_${uuidv4().replace(/-/g, '').slice(0, 12)}`, license.id, license.subscription_id,
          JSON.stringify({ hardwareId: license.hardware_id }), JSON.stringify({ hardwareId: newHardwareId }),
          req.platformUser.id, req.platformUser.full_name, reason || 'نقل ترخيص من الخادم المركزي',
        ]
      );

      const updated = await db.get('SELECT * FROM platform_licenses WHERE id = ?', [id]);
      await auditLicenseChange(req, 'LICENSE_TRANSFERRED', id, {
        previousHardwareId: license.hardware_id,
        newHardwareId,
      });
      res.json({
        licenseId: id,
        previousHardwareId: license.hardware_id,
        newHardwareId,
        transferCount: updated.transfer_count,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:id/coupling',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.licenses.update', 'platform.licenses.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { id } = req.params;
      const { couplingMode } = req.body || {};

      if (!['FULL', 'EXPIRY_ONLY', 'NONE'].includes(couplingMode)) {
        return res.status(400).json({ error: 'Invalid coupling mode' });
      }

      const license = await db.get('SELECT * FROM platform_licenses WHERE id = ?', [id]);
      if (!license) return res.status(404).json({ error: 'License not found' });
      if (!(await assertTenantAccess(req, res, license.tenant_id))) return;

      const previousMode = license.coupling_mode || 'FULL';
      await db.run(
        `UPDATE platform_licenses SET coupling_mode = ?, updated_at = ? WHERE id = ?`,
        [couplingMode, nowIso(), id]
      );

      await db.run(
        `INSERT INTO platform_license_changes
          (id, license_id, subscription_id, change_type, old_values, new_values, actor_id, actor_name, reason)
         VALUES (?, ?, ?, 'COUPLING_CHANGE', ?, ?, ?, ?, ?)`,
        [
          `lchg_${uuidv4().replace(/-/g, '').slice(0, 12)}`, license.id, license.subscription_id,
          JSON.stringify({ couplingMode: previousMode }), JSON.stringify({ couplingMode }),
          req.platformUser.id, req.platformUser.full_name, 'تغيير وضع الربط بالاشتراك',
        ]
      );

      await auditLicenseChange(req, 'LICENSE_COUPLING_CHANGED', id, { previousMode, couplingMode });
      res.json({ licenseId: id, couplingMode, previousMode });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
