'use strict';

const { v4: uuidv4 } = require('uuid');
const { getDb } = require('./db');
const { nowIso } = require('./time');
const { recordAuditEvent } = require('./audit');

/**
 * Cross-tenant clone/license-abuse detection.
 *
 * This MUST run server-side: it aggregates platform_devices /
 * platform_licenses across every tenant, so it cannot be scoped to a
 * single tenant session. Both the admin route (POST /admin/devices/
 * detect-clones) and the daily scheduler call this function.
 *
 * @param {object} [options]
 * @param {string|null} [options.actorId]     platform user id (null for SYSTEM)
 * @param {string|null} [options.actorName]   display name for audit
 * @param {string|null} [options.ipAddress]
 * @param {string|null} [options.userAgent]
 * @param {boolean} [options.notifyTenants]   create platform_notifications rows
 * @returns {Promise<{devices: object[], licenses: object[], alerts: string[],
 *   duplicateHwids: object[], overLimitLicenses: object[], suspiciousTransfers: object[]}>}
 */
async function runCloneDetection(options = {}) {
  const {
    actorId = null,
    actorName = null,
    ipAddress = null,
    userAgent = null,
    notifyTenants = false,
  } = options;
  const db = getDb();
  const alerts = [];
  const flaggedDevices = [];
  const flaggedLicenses = [];

  // --- Hardware IDs active on more than one tenant ---
  const duplicateHwids = await db.all(`
    SELECT hardware_id, COUNT(DISTINCT tenant_id) as tenant_count
    FROM platform_devices
    WHERE status IN ('ACTIVE', 'SUSPENDED')
    GROUP BY hardware_id
    HAVING tenant_count > 1
  `);

  const duplicateHwidDetails = [];
  for (const row of duplicateHwids) {
    const hwid = row.hardware_id;
    const devices = await db.all(
      `SELECT * FROM platform_devices WHERE hardware_id = ? AND status IN ('ACTIVE', 'SUSPENDED')`,
      [hwid]
    );
    const tenants = [...new Set(devices.map((d) => d.tenant_id).filter(Boolean))];
    duplicateHwidDetails.push({ hardwareId: hwid, tenantCount: tenants.length, tenants, devices });
    for (const device of devices) {
      await db.run(
        `UPDATE platform_devices SET clone_suspected = 1, updated_at = ? WHERE id = ?`,
        [nowIso(), device.id]
      );
      flaggedDevices.push(device);
      alerts.push(`اشتباه استنساخ: بصمة العتاد ${hwid} مستخدمة على عدة عملاء`);
    }
  }

  // --- Licenses activated beyond their device limit ---
  const overLimitRows = await db.all(`
    SELECT l.id, l.license_key, l.tenant_id, l.device_limit, COUNT(d.id) as active_device_count
    FROM platform_licenses l
    LEFT JOIN platform_devices d ON d.license_id = l.id AND d.status = 'ACTIVE'
    WHERE l.status = 'ACTIVE'
    GROUP BY l.id
    HAVING active_device_count > l.device_limit
  `);

  const overLimitLicenses = [];
  for (const row of overLimitRows) {
    const license = await db.get('SELECT * FROM platform_licenses WHERE id = ?', [row.id]);
    if (license) {
      flaggedLicenses.push(license);
      overLimitLicenses.push({
        licenseId: license.id,
        licenseKey: license.license_key,
        tenantId: license.tenant_id,
        deviceCount: row.active_device_count,
        deviceLimit: license.device_limit,
      });
      alerts.push(`تجاوز عدد الأجهزة: الترخيص ${license.license_key || license.id} مفعل على ${row.active_device_count} أجهزة والحد المسموح ${license.device_limit}`);
    }
  }

  // --- Licenses transferred too often within 30 days ---
  const rapidTransfers = await db.all(`
    SELECT a.license_id, COUNT(*) as transfer_count
    FROM platform_license_activations a
    WHERE a.action = 'TRANSFER' AND a.created_at > date('now', '-30 day')
    GROUP BY a.license_id
    HAVING transfer_count > 3
  `);

  const suspiciousTransfers = [];
  for (const row of rapidTransfers) {
    const license = await db.get(
      `SELECT l.*, t.name AS tenant_name FROM platform_licenses l
       LEFT JOIN platform_tenants t ON t.id = l.tenant_id WHERE l.id = ?`,
      [row.license_id]
    );
    if (license) {
      flaggedLicenses.push(license);
      suspiciousTransfers.push({
        licenseId: license.id,
        licenseKey: license.license_key,
        tenantId: license.tenant_id,
        tenantName: license.tenant_name ?? null,
        transferCount: row.transfer_count,
      });
      alerts.push(`نقل سريع للترخيص: ${license.license_key || license.id} نُقل ${row.transfer_count} مرة خلال 30 يوماً`);
    }
  }

  // --- Single-seat licenses spread over multiple hardware IDs ---
  const multiHwidRows = await db.all(`
    SELECT l.id, l.license_key, l.device_limit, COUNT(DISTINCT d.hardware_id) as distinct_hwids
    FROM platform_licenses l
    JOIN platform_devices d ON d.license_id = l.id AND d.status = 'ACTIVE'
    WHERE l.status = 'ACTIVE'
    GROUP BY l.id
    HAVING distinct_hwids > 1 AND l.device_limit = 1
  `);

  for (const row of multiHwidRows) {
    const license = await db.get('SELECT * FROM platform_licenses WHERE id = ?', [row.id]);
    if (license) {
      if (!flaggedLicenses.some((l) => l.id === license.id)) flaggedLicenses.push(license);
      alerts.push(`ترخيص فردي على أجهزة متعددة: ${license.license_key || license.id} مفعل على ${row.distinct_hwids} بصمات عتاد مختلفة`);
    }
  }

  await recordAuditEvent({
    actorType: actorId ? 'PLATFORM' : 'SYSTEM',
    actorId,
    actorName,
    action: 'CLONE_DETECTION_RUN',
    resourceType: 'platform_devices',
    resourceId: null,
    afterData: {
      flaggedDevices: flaggedDevices.length,
      flaggedLicenses: flaggedLicenses.length,
      alerts: alerts.length,
      duplicateHwids: duplicateHwidDetails.length,
      overLimitLicenses: overLimitLicenses.length,
      suspiciousTransfers: suspiciousTransfers.length,
    },
    ipAddress,
    userAgent,
  });

  if (notifyTenants) {
    await notifyAffectedTenants({ duplicateHwidDetails, overLimitLicenses, suspiciousTransfers });
  }

  return {
    devices: flaggedDevices,
    licenses: flaggedLicenses,
    alerts,
    duplicateHwids: duplicateHwidDetails,
    overLimitLicenses,
    suspiciousTransfers,
  };
}

/**
 * Insert in-app notifications for every tenant touched by a detection.
 * De-duplicated: skips tenants that already received the same subject in
 * the last 24 hours so the daily job cannot spam.
 */
async function notifyAffectedTenants({ duplicateHwidDetails, overLimitLicenses, suspiciousTransfers }) {
  const db = getDb();
  const now = nowIso();
  const notifications = [];

  const push = async (tenantId, subject, message) => {
    if (!tenantId) return;
    const existing = await db.get(
      `SELECT id FROM platform_notifications
       WHERE tenant_id = ? AND subject = ? AND created_at > datetime('now', '-1 day')
       LIMIT 1`,
      [tenantId, subject]
    );
    if (existing) return;

    const notificationId = `ntf_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const deliveryId = `ntfd_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    await db.run(
      `INSERT INTO platform_notifications (id, tenant_id, audience, channel, template_id, subject, payload, status, attempts, last_error, created_at, updated_at)
       VALUES (?, ?, 'ALL', 'IN_APP', NULL, ?, ?, 'SENT', 1, NULL, ?, ?)`,
      [notificationId, tenantId, subject, JSON.stringify({ message }), now, now]
    );
    await db.run(
      `INSERT INTO platform_notification_deliveries (id, notification_id, channel, recipient, status, provider, external_id, error, created_at, updated_at)
       VALUES (?, ?, 'IN_APP', '*', 'SENT', 'IN_APP', NULL, NULL, ?, ?)`,
      [deliveryId, notificationId, now, now]
    );
    notifications.push(notificationId);
  };

  for (const group of duplicateHwidDetails) {
    for (const tenantId of group.tenants) {
      await push(
        tenantId,
        'CLONE_DETECTED',
        `تم رصد استخدام بصمة جهاز واحدة (${group.hardwareId}) على أكثر من عميل. يرجى مراجعة الأجهزة المرخصة.`
      );
    }
  }

  for (const over of overLimitLicenses) {
    await push(
      over.tenantId,
      'LICENSE_OVER_DEVICE_LIMIT',
      `الترخيص ${over.licenseKey} مفعل على ${over.deviceCount} أجهزة بينما الحد المسموح ${over.deviceLimit}.`
    );
  }

  for (const transfer of suspiciousTransfers) {
    await push(
      transfer.tenantId,
      'SUSPICIOUS_LICENSE_TRANSFER',
      `الترخيص ${transfer.licenseKey || transfer.licenseId} تم نقله ${transfer.transferCount} مرات خلال 30 يوماً.`
    );
  }

  return notifications.length;
}

module.exports = { runCloneDetection };
