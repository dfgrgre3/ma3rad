'use strict';

/**
 * Tenant-facing API — read-only access to a customer's own platform data.
 *
 * Mounted at /api/v1/tenant/v1 and authenticated exclusively by tenant-scoped
 * API keys (platform_api_keys.tenant_id). Every query is hard-scoped to
 * req.apiKey.tenantId — a key can never reach another tenant's rows.
 *
 * Response shape follows the shared envelope (res.json payload → data).
 */

const express = require('express');
const { getDb } = require('../lib/db');
const { authenticateApiKey, requireApiScope } = require('../lib/apiKeyAuth');
const { parseJsonArray } = require('../lib/entitlements');

const router = express.Router();

router.use(authenticateApiKey);
router.use(requireApiScope('read'));

function mapTenant(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    businessType: row.business_type ?? null,
    status: row.status,
    planId: row.plan_id ?? null,
    subscriptionStartedAt: row.subscription_started_at ?? null,
    subscriptionExpiresAt: row.subscription_expires_at ?? null,
    seatsLimit: Number(row.seats_limit) || 1,
    branchesLimit: Number(row.branches_limit) || 1,
    devicesLimit: Number(row.devices_limit) || 1,
    createdAt: row.created_at,
  };
}

function mapSubscription(row) {
  if (!row) return null;
  return {
    id: row.id,
    planId: row.plan_id,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date ?? null,
    seats: Number(row.seats) || 1,
    billingCycle: row.billing_cycle,
    autoRenew: Boolean(row.auto_renew),
    createdAt: row.created_at,
  };
}

function mapLicense(row) {
  if (!row) return null;
  return {
    id: row.id,
    licenseKey: row.license_key,
    status: row.status,
    issuedAt: row.issued_at,
    startsAt: row.starts_at ?? null,
    expiresAt: row.expires_at ?? null,
    seats: Number(row.seats) || 1,
    deviceLimit: Number(row.device_limit) || 1,
    modules: parseJsonArray(row.modules),
    features: parseJsonArray(row.features),
  };
}

function mapDevice(row) {
  return {
    id: row.id,
    name: row.name ?? null,
    hardwareId: row.hardware_id ?? null,
    status: row.status,
    firstActivatedAt: row.first_activated_at ?? null,
    lastSeenAt: row.last_seen_at ?? null,
  };
}

/** GET /api/v1/tenant/v1/me — tenant identity and plan summary. */
router.get('/me', async (req, res, next) => {
  try {
    const db = getDb();
    const tenant = await db.get('SELECT * FROM platform_tenants WHERE id = ?', [req.apiKey.tenantId]);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    const plan = tenant.plan_id
      ? await db.get('SELECT id, code, name, billing_cycle AS billingCycle FROM platform_plans WHERE id = ?', [tenant.plan_id])
      : null;
    res.json({ tenant: mapTenant(tenant), plan, apiKey: { id: req.apiKey.id, name: req.apiKey.name, scopes: req.apiKey.scopes } });
  } catch (err) {
    next(err);
  }
});

/** GET /api/v1/tenant/v1/subscription — current subscription state. */
router.get('/subscription', async (req, res, next) => {
  try {
    const db = getDb();
    const subscription = await db.get(
      `SELECT * FROM platform_subscriptions
       WHERE tenant_id = ? AND status IN ('TRIAL','ACTIVE','PAST_DUE')
       ORDER BY created_at DESC LIMIT 1`,
      [req.apiKey.tenantId]
    );
    const plan = subscription?.plan_id
      ? await db.get('SELECT id, code, name, billing_cycle AS billingCycle, price FROM platform_plans WHERE id = ?', [subscription.plan_id])
      : null;
    res.json({ subscription: mapSubscription(subscription), plan });
  } catch (err) {
    next(err);
  }
});

/** GET /api/v1/tenant/v1/licenses — issued licenses with module/feature sets. */
router.get('/licenses', async (req, res, next) => {
  try {
    const db = getDb();
    const rows = await db.all('SELECT * FROM platform_licenses WHERE tenant_id = ? ORDER BY created_at DESC', [req.apiKey.tenantId]);
    res.json({ licenses: rows.map(mapLicense) });
  } catch (err) {
    next(err);
  }
});

/** GET /api/v1/tenant/v1/usage — seats/devices/branches consumption vs limits. */
router.get('/usage', async (req, res, next) => {
  try {
    const db = getDb();
    const tenantId = req.apiKey.tenantId;
    const [tenant, devicesUsed, branchRow, licenseRows] = await Promise.all([
      db.get('SELECT * FROM platform_tenants WHERE id = ?', [tenantId]),
      db.get(
        "SELECT COUNT(*) AS c FROM platform_devices WHERE tenant_id = ? AND status = 'ACTIVE'",
        [tenantId]
      ),
      db.get("SELECT COUNT(*) AS c FROM platform_tenant_branches WHERE tenant_id = ? AND status != 'CLOSED'", [tenantId]),
      db.all('SELECT modules FROM platform_licenses WHERE tenant_id = ?', [tenantId]),
    ]);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    const moduleSet = new Set();
    for (const row of licenseRows || []) {
      for (const code of parseJsonArray(row.modules)) moduleSet.add(code);
    }
    res.json({
      usage: {
        seatsLimit: Number(tenant.seats_limit) || 1,
        devicesLimit: Number(tenant.devices_limit) || 1,
        devicesUsed: Number(devicesUsed?.c) || 0,
        branchesLimit: Number(tenant.branches_limit) || 1,
        branchesUsed: Number(branchRow?.c) || 0,
        modulesCount: moduleSet.size,
      },
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/v1/tenant/v1/devices — registered devices (no credentials). */
router.get('/devices', async (req, res, next) => {
  try {
    const db = getDb();
    const rows = await db.all('SELECT * FROM platform_devices WHERE tenant_id = ? ORDER BY last_seen_at DESC', [req.apiKey.tenantId]);
    res.json({ devices: rows.map(mapDevice) });
  } catch (err) {
    next(err);
  }
});

/** GET /api/v1/tenant/v1/entitlements — effective modules/features for the tenant. */
router.get('/entitlements', async (req, res, next) => {
  try {
    const db = getDb();
    const tenantId = req.apiKey.tenantId;
    const sub = await db.get(
      `SELECT plan_id AS planId FROM platform_subscriptions
       WHERE tenant_id = ? AND status IN ('TRIAL','ACTIVE','PAST_DUE')
       ORDER BY created_at DESC LIMIT 1`,
      [tenantId]
    );
    const plan = sub?.planId
      ? await db.get('SELECT included_modules AS includedModules, features AS planFeatures FROM platform_plans WHERE id = ?', [sub.planId])
      : null;
    const moduleOverrides = await db.all(
      `SELECT code, is_enabled AS isEnabled FROM platform_tenant_overrides WHERE tenant_id = ? AND kind = 'MODULE'`,
      [tenantId]
    );
    const featureOverrides = await db.all(
      `SELECT code, is_enabled AS isEnabled FROM platform_tenant_overrides WHERE tenant_id = ? AND kind = 'FEATURE'`,
      [tenantId]
    );
    const modules = new Set(parseJsonArray(plan?.includedModules));
    for (const row of moduleOverrides) {
      const code = String(row.code || '');
      if (!code) continue;
      if (row.isEnabled) modules.add(code);
      else modules.delete(code);
    }
    const features = new Set(parseJsonArray(plan?.planFeatures));
    for (const row of featureOverrides) {
      const code = String(row.code || '');
      if (!code) continue;
      if (row.isEnabled) features.add(code);
      else features.delete(code);
    }
    res.json({ planId: sub?.planId ?? null, modules: [...modules], features: [...features] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
