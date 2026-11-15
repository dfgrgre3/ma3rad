'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../lib/db');
const { nowIso } = require('../lib/time');
const { recordAuditEvent } = require('../lib/audit');
const { authenticatePlatformUser, requirePlatformPermission } = require('../middleware/auth');

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
      let sql = 'SELECT * FROM platform_devices WHERE 1=1';
      const params = [];

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
      res.json(devices);
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
  '/detect-clones',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.devices.view', 'platform.devices.update']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const alerts = [];
      const flaggedDevices = [];
      const flaggedLicenses = [];

      const duplicateHwids = await db.all(`
        SELECT hardware_id, COUNT(DISTINCT tenant_id) as tenant_count
        FROM platform_devices
        WHERE status IN ('ACTIVE', 'SUSPENDED')
        GROUP BY hardware_id
        HAVING tenant_count > 1
      `);

      for (const row of duplicateHwids) {
        const hwid = row.hardware_id;
        const devices = await db.all(
          `SELECT * FROM platform_devices WHERE hardware_id = ? AND status IN ('ACTIVE', 'SUSPENDED')`,
          [hwid]
        );
        for (const device of devices) {
          await db.run(
            `UPDATE platform_devices SET clone_suspected = 1, updated_at = ? WHERE id = ?`,
            [nowIso(), device.id]
          );
          flaggedDevices.push(device);
          alerts.push(`اشتباه استنساخ: بصمة العتاد ${hwid} مستخدمة على عدة عملاء`);
        }
      }

      const overLimitLicenses = await db.all(`
        SELECT l.id, l.device_limit, COUNT(d.id) as active_device_count
        FROM platform_licenses l
        LEFT JOIN platform_devices d ON d.license_id = l.id AND d.status = 'ACTIVE'
        WHERE l.status = 'ACTIVE'
        GROUP BY l.id
        HAVING active_device_count > l.device_limit
      `);

      for (const row of overLimitLicenses) {
        const license = await db.get('SELECT * FROM platform_licenses WHERE id = ?', [row.id]);
        if (license) {
          flaggedLicenses.push(license);
          alerts.push(`تجاوز عدد الأجهزة: الترخيص ${license.license_key} مفعل على ${row.active_device_count} أجهزة والحد المسموح ${license.device_limit}`);
        }
      }

      const rapidTransfers = await db.all(`
        SELECT license_id, COUNT(*) as transfer_count
        FROM platform_license_activations
        WHERE action = 'TRANSFER' AND created_at > date('now', '-30 day')
        GROUP BY license_id
        HAVING transfer_count > 3
      `);

      for (const row of rapidTransfers) {
        const license = await db.get('SELECT * FROM platform_licenses WHERE id = ?', [row.license_id]);
        if (license) {
          alerts.push(`نقل سريع للترخيص: ${license.license_key} نُقل ${row.transfer_count} مرة خلال 30 يوماً`);
        }
      }

      const multiHwidLicenses = await db.all(`
        SELECT l.id, l.device_limit, COUNT(DISTINCT d.hardware_id) as distinct_hwids
        FROM platform_licenses l
        JOIN platform_devices d ON d.license_id = l.id AND d.status = 'ACTIVE'
        WHERE l.status = 'ACTIVE'
        GROUP BY l.id
        HAVING distinct_hwids > 1 AND l.device_limit = 1
      `);

      for (const row of multiHwidLicenses) {
        const license = await db.get('SELECT * FROM platform_licenses WHERE id = ?', [row.id]);
        if (license) {
          flaggedLicenses.push(license);
          alerts.push(`ترخيص فردي على أجهزة متعددة: ${license.license_key} مفعل على ${row.distinct_hwids} بصمات عتاد مختلفة`);
        }
      }

      await recordAuditEvent({
        actorId: req.platformUser?.id,
        actorName: req.platformUser?.full_name,
        action: 'CLONE_DETECTION_RUN',
        resourceType: 'platform_devices',
        resourceId: null,
        afterData: { flaggedDevices: flaggedDevices.length, flaggedLicenses: flaggedLicenses.length, alerts: alerts.length },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.json({ devices: flaggedDevices, licenses: flaggedLicenses, alerts });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
