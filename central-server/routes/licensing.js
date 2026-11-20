'use strict';

/**
 * Device licensing channel — /api/v1/licensing/*.
 *
 * These endpoints are called by the desktop app through the secured Electron
 * bridge BEFORE any device credential exists, so they cannot use
 * `authenticateDevice` (which requires the credential they issue). Instead:
 *
 *   POST /activate   — activation code + tenant account credentials → enrolls
 *                      the device in platform_devices and returns a one-time
 *                      deviceCredential (only its SHA-256 is stored).
 *   POST /validate   — deviceId + deviceCredential (injected into the body by
 *                      the desktop bridge) → 200 when the device may run.
 *   POST /heartbeat  — same auth → refreshes last_seen/app_version.
 *
 * Entitlement resolution (plan → license → tenant overrides) is shared with
 * module package delivery via lib/entitlements, so what a device can activate
 * for is exactly what it can download.
 */

const express = require('express');
const crypto = require('node:crypto');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { getDb } = require('../lib/db');
const { nowIso } = require('../lib/time');
const { recordAuditEvent, recordLoginAttempt } = require('../lib/audit');
const { findDevice, credentialMatches, hashDeviceCredential } = require('../lib/deviceAuth');
const { countRecentFailures, LOGIN_WINDOW_MINUTES, ACTIVATION_IP_MAX_FAILURES, ACTIVATION_USERNAME_MAX_FAILURES } = require('../lib/rateLimit');

const router = express.Router();

const DEVICE_ID_MAX = 200;
const TENANT_ACTIVE_STATUSES = new Set(['TRIAL', 'ACTIVE']);
// Failure reasons recorded for /activate attempts; counters are scoped to
// these so tenant-account guessing never locks out platform staff logins.
const ACTIVATION_FAILURE_REASONS = ['ACTIVATION_FAILED', 'ACTIVATION_RATE_LIMITED'];

/** Count failed activation attempts in the sliding login window. */
function countActivationFailures(scope) {
  return countRecentFailures({ ...scope, failureReasons: ACTIVATION_FAILURE_REASONS, windowMinutes: LOGIN_WINDOW_MINUTES });
}

function parseExpiresAt(value) {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

/** Latest usable license for the tenant, preferring ACTIVE over ISSUED. */
async function resolveTenantLicense(db, tenantId) {
  return db.get(
    `SELECT * FROM platform_licenses
     WHERE tenant_id = ? AND status IN ('ACTIVE','ISSUED')
     ORDER BY CASE status WHEN 'ACTIVE' THEN 0 ELSE 1 END, created_at DESC
     LIMIT 1`,
    [tenantId]
  );
}

/** planId the tenant effectively runs on: license → tenant.plan_id → subscription. */
async function resolveTenantPlanId(db, tenant, license) {
  if (license?.plan_id) return license.plan_id;
  if (tenant.plan_id) return tenant.plan_id;
  const sub = await db.get(
    `SELECT plan_id FROM platform_subscriptions
     WHERE tenant_id = ? AND status IN ('TRIAL','ACTIVE','PAST_DUE')
     ORDER BY created_at DESC LIMIT 1`,
    [tenant.id]
  );
  return sub?.plan_id || null;
}

function licenseExpired(license) {
  const expires = parseExpiresAt(license?.expires_at);
  return expires !== null && expires <= Date.now();
}

/** Effective device ceiling: the strictest limit among tenant/license/plan. */
async function deviceLimitFor(db, tenant, license, planId) {
  const limits = [Number(tenant.devices_limit) || 1];
  if (license?.device_limit) limits.push(Number(license.device_limit));
  if (planId) {
    const plan = await db.get('SELECT devices_limit FROM platform_plans WHERE id = ?', [planId]);
    if (plan?.devices_limit) limits.push(Number(plan.devices_limit));
  }
  return Math.min(...limits.filter((n) => Number.isFinite(n) && n > 0));
}

async function countActiveDevices(db, tenantId) {
  const row = await db.get(
    `SELECT COUNT(*) AS c FROM platform_devices WHERE tenant_id = ? AND status = 'ACTIVE'`,
    [tenantId]
  );
  return Number(row?.c || 0);
}

/** Shared device check for validate/heartbeat: resolves req-style body fields. */
async function requireValidDevice(db, deviceId, deviceCredential) {
  if (!deviceId || !deviceCredential) return { error: 'Device authentication required', status: 401 };
  const device = await findDevice(String(deviceId).trim());
  if (!device) return { error: 'Unknown device', status: 401 };
  if (device.status !== 'ACTIVE') return { error: `Device is ${device.status}`, status: 403 };
  if (!credentialMatches(device, deviceCredential)) return { error: 'Invalid device credential', status: 401 };
  const tenant = await db.get('SELECT * FROM platform_tenants WHERE id = ?', [device.tenant_id]);
  if (!tenant || !TENANT_ACTIVE_STATUSES.has(tenant.status)) {
    return { error: 'Tenant subscription is not active', status: 403 };
  }
  const license = await resolveTenantLicense(db, device.tenant_id);
  if (licenseExpired(license)) return { error: 'License expired', status: 403 };
  return { device, tenant, license };
}

/**
 * POST /api/v1/licensing/activate
 * Body: { activationCode, account, password, phone?, deviceId, deviceName?,
 *         os?, appVersion?, deviceRole? }
 * Response includes `deviceCredential` — the desktop bridge extracts it,
 * stores it encrypted, and never returns it to the renderer.
 */
router.post('/activate', async (req, res, next) => {
  try {
    const db = getDb();
    const {
      activationCode = '', account = '', password = '', phone = '',
      deviceId = '', deviceName = '', os = '', appVersion = '',
    } = req.body || {};

    const code = String(activationCode).trim().toUpperCase();
    const accountName = String(account).trim();
    const hwid = String(deviceId).trim();
    if (!code || !accountName || !password || !hwid) {
      return res.status(400).json({ error: 'activationCode, account, password and deviceId are required' });
    }
    if (hwid.length > DEVICE_ID_MAX) {
      return res.status(400).json({ error: 'deviceId is too long' });
    }

    // Brute-force guard: activation verifies account credentials before any
    // device credential exists, so failed guesses are counted per IP and per
    // account — same sliding-window convention as the platform login route.
    const ipAddress = req.ip || null;
    const userAgent = String(req.headers['user-agent'] || '').slice(0, 300);
    const recordFailure = (reason) => recordLoginAttempt({
      username: accountName, success: false, failureReason: reason, ipAddress, userAgent,
    });

    if ((await countActivationFailures({ ipAddress })) >= ACTIVATION_IP_MAX_FAILURES) {
      await recordFailure('ACTIVATION_RATE_LIMITED');
      return res.status(429).json({ error: 'Too many activation attempts from this IP. Try again later.', code: 'IP_RATE_LIMITED' });
    }
    if ((await countActivationFailures({ username: accountName })) >= ACTIVATION_USERNAME_MAX_FAILURES) {
      await recordFailure('ACTIVATION_RATE_LIMITED');
      return res.status(429).json({ error: 'Too many activation attempts for this account. Try again later.', code: 'USERNAME_RATE_LIMITED' });
    }

    // The activation code identifies the tenant account; username/email +
    // password prove the client actually holds the credentials the admin issued.
    const accountRow = await db.get(
      'SELECT * FROM platform_tenant_accounts WHERE UPPER(activation_code) = ? LIMIT 1',
      [code]
    );
    const identityMatches = accountRow && (
      accountName.toLowerCase() === String(accountRow.username || '').toLowerCase()
      || (accountRow.email && accountName.toLowerCase() === String(accountRow.email).toLowerCase())
    );
    if (!identityMatches || Number(accountRow.is_active) !== 1) {
      await recordFailure('ACTIVATION_FAILED');
      return res.status(401).json({ error: 'Invalid activation credentials' });
    }
    if (!(await bcrypt.compare(String(password), String(accountRow.password_hash || '')))) {
      await recordFailure('ACTIVATION_FAILED');
      return res.status(401).json({ error: 'Invalid activation credentials' });
    }

    const tenant = await db.get('SELECT * FROM platform_tenants WHERE id = ?', [accountRow.tenant_id]);
    if (!tenant || !TENANT_ACTIVE_STATUSES.has(tenant.status)) {
      return res.status(403).json({ error: 'Tenant subscription is not active' });
    }

    const license = await resolveTenantLicense(db, tenant.id);
    const planId = await resolveTenantPlanId(db, tenant, license);
    if (!planId) {
      return res.status(403).json({ error: 'No active plan or license for this tenant' });
    }
    if (licenseExpired(license)) {
      return res.status(403).json({ error: 'License expired' });
    }

    // Enroll or re-activate the device. A hardware id already bound to another
    // tenant is rejected — device credentials never cross tenants.
    let device = await findDevice(hwid);
    if (device && device.tenant_id !== tenant.id) {
      return res.status(409).json({ error: 'This device is registered to another tenant' });
    }
    if (device && device.status !== 'ACTIVE' && device.status !== 'OFFLINE') {
      return res.status(403).json({ error: `Device is ${device.status}` });
    }
    if (!device) {
      const limit = await deviceLimitFor(db, tenant, license, planId);
      if ((await countActiveDevices(db, tenant.id)) >= limit) {
        return res.status(403).json({ error: 'Device limit reached for this license' });
      }
    }

    const credential = crypto.randomBytes(32).toString('base64url');
    const credentialHash = hashDeviceCredential(credential);
    const now = nowIso();
    const ip = ipAddress;

    if (device) {
      await db.run(
        `UPDATE platform_devices
         SET name = COALESCE(?, name), os = COALESCE(?, os), app_version = COALESCE(?, app_version),
             ip_address = ?, license_id = COALESCE(license_id, ?), status = 'ACTIVE',
             last_seen_at = ?, credential_hash = ?, updated_at = ?
         WHERE id = ?`,
        [deviceName || null, os || null, appVersion || null, ip, license?.id || null,
         now, credentialHash, now, device.id]
      );
    } else {
      device = {
        id: `dev_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
      };
      await db.run(
        `INSERT INTO platform_devices
          (id, tenant_id, license_id, hardware_id, name, os, app_version, ip_address,
           status, first_activated_at, last_seen_at, credential_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?)`,
        [device.id, tenant.id, license?.id || null, hwid, deviceName || 'Desktop',
         os || null, appVersion || null, ip, now, now, credentialHash, now, now]
      );
    }

    await db.run('UPDATE platform_tenant_accounts SET last_activated_at = ?, updated_at = ? WHERE id = ?', [now, now, accountRow.id]);

    if (license?.id) {
      await db.run(
        `INSERT INTO platform_license_activations
          (id, license_id, tenant_id, device_id, activation_code, mode, action, status, ip_address, notes)
         VALUES (?, ?, ?, ?, ?, 'ONLINE', 'ACTIVATE', 'SUCCESS', ?, ?)`,
        [`lact_${uuidv4().replace(/-/g, '').slice(0, 12)}`, license.id, tenant.id, device.id,
         code, ip, `Activated via desktop app (${appVersion || 'unknown'})`]
      );
    }

    await recordAuditEvent({
      actorType: 'TENANT',
      actorId: accountRow.id,
      actorName: accountRow.username,
      tenantId: tenant.id,
      action: 'DEVICE_ACTIVATED',
      resourceType: 'platform_devices',
      resourceId: device.id,
      afterData: { username: accountRow.username, deviceName: deviceName || null, hardwareId: hwid },
      ipAddress: ip,
      userAgent,
    });

    await recordLoginAttempt({ username: accountName, userId: accountRow.id, success: true, ipAddress, userAgent });

    res.json({
      deviceCredential: credential,
      tenantId: tenant.id,
      tenantName: tenant.name,
      planId,
      deviceId: device.id,
      localAccount: {
        username: accountRow.username,
        fullName: accountRow.full_name || accountRow.username,
        role: 'admin',
        phone: phone || null,
      },
      message: 'Device activated',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/licensing/validate
 * Body: { deviceId, deviceCredential } — the bridge injects the stored
 * credential into the body, so no header auth is needed here.
 */
router.post('/validate', async (req, res, next) => {
  try {
    const { deviceId = '', deviceCredential = '' } = req.body || {};
    const result = await requireValidDevice(getDb(), deviceId, deviceCredential);
    if (result.error) return res.status(result.status).json({ error: result.error });
    await getDb().run('UPDATE platform_devices SET last_seen_at = ? WHERE id = ?', [nowIso(), result.device.id]);
    res.json({ valid: true, tenantId: result.tenant.id });
  } catch (err) {
    next(err);
  }
});

/** POST /api/v1/licensing/heartbeat — liveness + version telemetry. */
router.post('/heartbeat', async (req, res, next) => {
  try {
    const { deviceId = '', deviceCredential = '', appVersion = '', os = '' } = req.body || {};
    const result = await requireValidDevice(getDb(), deviceId, deviceCredential);
    if (result.error) return res.status(result.status).json({ error: result.error });
    const now = nowIso();
    await getDb().run(
      'UPDATE platform_devices SET last_seen_at = ?, app_version = COALESCE(?, app_version), os = COALESCE(?, os) WHERE id = ?',
      [now, appVersion || null, os || null, result.device.id]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
