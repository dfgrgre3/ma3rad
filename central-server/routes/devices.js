'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../lib/db');
const { nowIso } = require('../lib/time');
const { recordAuditEvent } = require('../lib/audit');
const { authenticatePlatformUser, requirePlatformPermission, getScopedTenantIds, assertTenantAccess, tenantScopePredicate } = require('../middleware/auth');
const { runCloneDetection } = require('../lib/cloneDetection');
const { hashDeviceCredential } = require('../lib/deviceAuth');

const router = express.Router();

const auditDeviceChange = (req, action, resourceId, details = {}) => recordAuditEvent({
  actorId: req.platformUser?.id,
  actorName: req.platformUser?.full_name,
  action,
  resourceType: 'platform_devices',
  resourceId,
  afterData: details,
  ipAddress: req.ip,
  userAgent: req.headers['user-agent'],
});

router.get(
  '/',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.devices.view']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { tenantId, status } = req.query;
      const scoped = await getScopedTenantIds(req);
      if (Array.isArray(scoped) && scoped.length === 0) {
        return res.json([]);
      }
      // A scoped staff member may only query their own tenants; asking for
      // another tenant (or none) must not widen visibility.
      if (tenantId && Array.isArray(scoped) && !scoped.includes(String(tenantId))) {
        return res.status(403).json({ error: 'Tenant is outside your data scope' });
      }
      const scopePredicate = tenantScopePredicate('tenant_id', scoped);
      let sql = 'SELECT * FROM platform_devices WHERE 1=1';
      const params = [...scopePredicate.params];

      if (scopePredicate.clause) {
        sql += scopePredicate.clause;
      }
      if (tenantId) {
        sql += ' AND tenant_id = ?';
        params.push(tenantId);
      }
      if (status) {
        sql += ' AND status = ?';
        params.push(status);
      }

      sql += ' ORDER BY last_seen_at DESC, created_at DESC';
      const devices = await db.all(sql, params);
      // The credential hash is server-side secret material; never serialize it.
      res.json(devices.map(({ credential_hash, ...device }) => device));
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:id/suspend',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.devices.update']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { id } = req.params;
      const { reason } = req.body || {};

      const device = await db.get('SELECT * FROM platform_devices WHERE id = ?', [id]);
      if (!device) return res.status(404).json({ error: 'Device not found' });
      if (!(await assertTenantAccess(req, res, device.tenant_id))) return;

      await db.run(
        `UPDATE platform_devices SET status = 'SUSPENDED', updated_at = ? WHERE id = ?`,
        [nowIso(), id]
      );

      if (device.license_id) {
        await db.run(
          `UPDATE platform_licenses SET status = 'SUSPENDED', updated_at = ? WHERE id = ? AND status = 'ACTIVE'`,
          [nowIso(), device.license_id]
        );
      }

      await db.run(
        `INSERT INTO platform_license_activations
          (id, license_id, tenant_id, device_id, activation_code, mode, action, status, notes)
         VALUES (?, ?, ?, ?, ?, 'ONLINE', 'DEACTIVATE', 'SUCCESS', ?)`,
        [
          `lact_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
          device.license_id,
          device.tenant_id,
          device.hardware_id,
          device.license_id
            ? (await db.get('SELECT activation_code FROM platform_licenses WHERE id = ?', [device.license_id]))?.activation_code || null
            : null,
          reason || 'إيقاف الجهاز عن بُعد',
        ]
      );

      await auditDeviceChange(req, 'DEVICE_SUSPENDED', id, { reason: reason || null, previousStatus: device.status });
      res.json({ deviceId: id, status: 'SUSPENDED', previousStatus: device.status });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:id/activate',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.devices.update']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { id } = req.params;
      const { reason } = req.body || {};

      const device = await db.get('SELECT * FROM platform_devices WHERE id = ?', [id]);
      if (!device) return res.status(404).json({ error: 'Device not found' });
      if (!(await assertTenantAccess(req, res, device.tenant_id))) return;
      if (device.status === 'REVOKED') {
        return res.status(400).json({ error: 'Revoked devices cannot be reactivated' });
      }
      if (device.status === 'ACTIVE') {
        return res.status(400).json({ error: 'Device is already active' });
      }
      // A released/offline device without a license cannot be reactivated into
      // service — it must be reassigned to a license first.
      if (!device.license_id) {
        return res.status(400).json({ error: 'Device has no linked license; reassign it first' });
      }

      await db.run(
        `UPDATE platform_devices SET status = 'ACTIVE', updated_at = ? WHERE id = ?`,
        [nowIso(), id]
      );

      if (device.license_id) {
        const license = await db.get('SELECT activation_code FROM platform_licenses WHERE id = ?', [device.license_id]);
        await db.run(
          `INSERT INTO platform_license_activations
            (id, license_id, tenant_id, device_id, activation_code, mode, action, status, notes)
           VALUES (?, ?, ?, ?, ?, 'ONLINE', 'ACTIVATE', 'SUCCESS', ?)`,
          [
            `lact_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
            device.license_id,
            device.tenant_id,
            device.hardware_id,
            license?.activation_code || null,
            reason || 'إعادة تفعيل الجهاز عن بُعد',
          ]
        );
      }

      await auditDeviceChange(req, 'DEVICE_ACTIVATED', id, { reason: reason || null, previousStatus: device.status });
      const updated = await db.get('SELECT * FROM platform_devices WHERE id = ?', [id]);
      res.json({ device: updated });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:id/release',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.devices.update']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { id } = req.params;
      const { reason } = req.body || {};

      const device = await db.get('SELECT * FROM platform_devices WHERE id = ?', [id]);
      if (!device) return res.status(404).json({ error: 'Device not found' });
      if (!(await assertTenantAccess(req, res, device.tenant_id))) return;

      if (device.license_id) {
        await db.run(
          `UPDATE platform_licenses SET hardware_id = NULL, activated_at = NULL, updated_at = ? WHERE id = ?`,
          [nowIso(), device.license_id]
        );

        await db.run(
          `INSERT INTO platform_license_activations
            (id, license_id, tenant_id, device_id, activation_code, mode, action, status, notes)
           VALUES (?, ?, ?, ?, ?, 'ONLINE', 'DEACTIVATE', 'SUCCESS', ?)`,
          [
            `lact_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
            device.license_id,
            device.tenant_id,
            device.hardware_id,
            (await db.get('SELECT activation_code FROM platform_licenses WHERE id = ?', [device.license_id]))?.activation_code || null,
            reason || 'تحرير الجهاز عن بُعد',
          ]
        );
      }

      await db.run(
        `UPDATE platform_devices SET status = 'OFFLINE', license_id = NULL, updated_at = ? WHERE id = ?`,
        [nowIso(), id]
      );

      await auditDeviceChange(req, 'DEVICE_RELEASED', id, { reason: reason || null, previousStatus: device.status });
      res.json({ deviceId: id, status: 'OFFLINE', previousStatus: device.status });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:id/revoke',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.devices.update']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { id } = req.params;
      const { reason } = req.body || {};

      const device = await db.get('SELECT * FROM platform_devices WHERE id = ?', [id]);
      if (!device) return res.status(404).json({ error: 'Device not found' });
      if (!(await assertTenantAccess(req, res, device.tenant_id))) return;

      await db.run(
        `UPDATE platform_devices SET status = 'REVOKED', clone_suspected = 1, updated_at = ? WHERE id = ?`,
        [nowIso(), id]
      );

      if (device.license_id) {
        await db.run(
          `UPDATE platform_licenses SET status = 'REVOKED', updated_at = ? WHERE id = ?`,
          [nowIso(), device.license_id]
        );

        await db.run(
          `INSERT INTO platform_license_activations
            (id, license_id, tenant_id, device_id, activation_code, mode, action, status, notes)
           VALUES (?, ?, ?, ?, ?, 'ONLINE', 'REVOKE', 'SUCCESS', ?)`,
          [
            `lact_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
            device.license_id,
            device.tenant_id,
            device.hardware_id,
            (await db.get('SELECT activation_code FROM platform_licenses WHERE id = ?', [device.license_id]))?.activation_code || null,
            reason || 'إلغاء الجهاز عن بُعد (اشتباه استنساخ)',
          ]
        );
      }

      await auditDeviceChange(req, 'DEVICE_REVOKED', id, { reason: reason || null, previousStatus: device.status });
      res.json({ deviceId: id, status: 'REVOKED', previousStatus: device.status });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:id/reassign',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.devices.update']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { id } = req.params;
      const { licenseId, reason } = req.body || {};

      if (!licenseId) {
        return res.status(400).json({ error: 'licenseId is required' });
      }

      const device = await db.get('SELECT * FROM platform_devices WHERE id = ?', [id]);
      if (!device) return res.status(404).json({ error: 'Device not found' });
      if (!(await assertTenantAccess(req, res, device.tenant_id))) return;

      const license = await db.get('SELECT * FROM platform_licenses WHERE id = ?', [licenseId]);
      if (!license) return res.status(404).json({ error: 'License not found' });
      if (license.tenant_id !== device.tenant_id) {
        return res.status(400).json({ error: 'Cannot move a device to a license of another tenant' });
      }
      if (!(await assertTenantAccess(req, res, license.tenant_id))) return;

      // Respect the target license device limit.
      const activeCount = await db.get(
        `SELECT COUNT(*) AS c FROM platform_devices WHERE license_id = ? AND status = 'ACTIVE'`,
        [licenseId]
      );
      if (device.license_id !== licenseId && Number(activeCount?.c ?? 0) >= Number(license.device_limit ?? 0)) {
        return res.status(400).json({ error: 'Target license device limit reached' });
      }

      await db.run(
        `UPDATE platform_devices SET license_id = ?, status = 'ACTIVE', updated_at = ? WHERE id = ?`,
        [licenseId, nowIso(), id]
      );

      await db.run(
        `INSERT INTO platform_license_activations
          (id, license_id, tenant_id, device_id, activation_code, mode, action, status, notes)
         VALUES (?, ?, ?, ?, ?, 'ONLINE', 'TRANSFER', 'SUCCESS', ?)`,
        [
          `lact_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
          licenseId,
          device.tenant_id,
          device.hardware_id,
          license.activation_code || null,
          reason || 'نقل الجهاز إلى ترخيص آخر',
        ]
      );

      await auditDeviceChange(req, 'DEVICE_REASSIGNED', id, { licenseId, previousLicenseId: device.license_id });
      const updated = await db.get('SELECT * FROM platform_devices WHERE id = ?', [id]);
      res.json({ device: updated });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:id/clone-flag',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.devices.update']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { id } = req.params;
      const { suspected = true } = req.body || {};

      const device = await db.get('SELECT * FROM platform_devices WHERE id = ?', [id]);
      if (!device) return res.status(404).json({ error: 'Device not found' });
      if (!(await assertTenantAccess(req, res, device.tenant_id))) return;

      await db.run(
        `UPDATE platform_devices SET clone_suspected = ?, updated_at = ? WHERE id = ?`,
        [suspected ? 1 : 0, nowIso(), id]
      );

      await auditDeviceChange(req, suspected ? 'DEVICE_MARKED_CLONE' : 'DEVICE_CLONE_CLEARED', id, { suspected: Boolean(suspected) });
      const updated = await db.get('SELECT * FROM platform_devices WHERE id = ?', [id]);
      res.json({ device: updated });
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  '/:id',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.devices.update', 'platform.devices.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { id } = req.params;

      const device = await db.get('SELECT * FROM platform_devices WHERE id = ?', [id]);
      if (!device) return res.status(404).json({ error: 'Device not found' });
      if (!(await assertTenantAccess(req, res, device.tenant_id))) return;

      await db.run('DELETE FROM platform_devices WHERE id = ?', [id]);
      await auditDeviceChange(req, 'DEVICE_DELETED', id, { hardwareId: device.hardware_id, licenseId: device.license_id });
      res.json({ deviceId: id, deleted: true });
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/:id/credential',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.devices.update']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { id } = req.params;
      const { credential } = req.body || {};

      if (typeof credential !== 'string' || credential.trim().length < 16 || credential.length > 4096) {
        return res.status(400).json({ error: 'credential must be the device secret string (16-4096 chars)' });
      }

      const device = await db.get('SELECT * FROM platform_devices WHERE id = ?', [id]);
      if (!device) return res.status(404).json({ error: 'Device not found' });
      if (!(await assertTenantAccess(req, res, device.tenant_id))) return;

      // Only the SHA-256 is stored; the raw credential is never persisted or logged.
      await db.run(
        `UPDATE platform_devices SET credential_hash = ?, updated_at = ? WHERE id = ?`,
        [hashDeviceCredential(credential.trim()), nowIso(), id]
      );

      await auditDeviceChange(req, 'DEVICE_CREDENTIAL_ENROLLED', id, { rotated: Boolean(device.credential_hash) });
      res.json({ deviceId: id, credentialEnrolled: true });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/detect-clones',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.devices.view', 'platform.devices.update']),
  async (req, res, next) => {
    try {
      const scoped = await getScopedTenantIds(req);
      if (Array.isArray(scoped)) {
        return res.status(403).json({ error: 'Clone detection requires full tenant scope' });
      }

      const result = await runCloneDetection({
        actorId: req.platformUser?.id,
        actorName: req.platformUser?.full_name,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.json({
        devices: result.devices,
        licenses: result.licenses,
        alerts: result.alerts,
        duplicateHwids: result.duplicateHwids,
        overLimitLicenses: result.overLimitLicenses,
        suspiciousTransfers: result.suspiciousTransfers,
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
