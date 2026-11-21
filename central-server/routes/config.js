'use strict';

const express = require('express');
const { getDb } = require('../lib/db');
const { nowIso } = require('../lib/time');
const { authenticatePlatformUser, requirePlatformPermission, getScopedTenantIds, assertTenantAccess } = require('../middleware/auth');
const { signString, getKeyId } = require('../lib/signing');
const { authenticateDevice } = require('../lib/deviceAuth');
const { resolveTenantVisibility, loadEffectiveFeatureConfig, resolveFeatureHiddenPaths } = require('../lib/tenantVisibility');
const { resolveDeviceEntitlements } = require('../lib/entitlements');

const router = express.Router();

function parseJsonArray(raw) {
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}

function mapFeatureConfigRow(row) {
  return row
    ? {
        hiddenMenus: parseJsonArray(row.hiddenMenus ?? row.hidden_menus),
        disabledPermissions: parseJsonArray(row.disabledPermissions ?? row.disabled_permissions),
        featurePermissions: parseJsonArray(row.featurePermissions ?? row.feature_permissions),
      }
    : { hiddenMenus: [], disabledPermissions: [], featurePermissions: [] };
}

/**
 * GET /api/v1/configuration/current — signed tenant configuration for a
 * registered device. The tenant is ALWAYS resolved from the device row; the
 * client verifies `signature` over `configJson` with the published Ed25519
 * public key and fails closed on any mismatch.
 */
router.get('/configuration/current', authenticateDevice, async (req, res, next) => {
  try {
    const db = getDb();
    const device = req.device;
    // Plan, license snapshot, effective module set, merged hidden menus and
    // feature permissions — the same visibility inputs module package
    // delivery uses, so offered files match the pages the tenant can see.
    const visibility = await resolveTenantVisibility(db, device);
    const { tenantId, planId, allowedModuleIds, configurationVersion } = visibility;

    const inner = {
      hiddenMenus: visibility.hiddenMenus,
      disabledPermissions: visibility.disabledPermissions,
      featurePermissions: visibility.featurePermissions,
      permissionLimits: visibility.permissionLimits,
      allowedModules: allowedModuleIds,
      usageLimits: {},
    };
    const configJson = JSON.stringify(inner);
    const { signature } = signString(configJson);

    res.json({
      schemaVersion: 1,
      configurationVersion,
      tenantId,
      planId,
      config: inner,
      configJson,
      signature,
      keyId: getKeyId(),
      requestId: req.requestId,
    });
  } catch (err) {
    next(err);
  }
});

router.get(
  '/admin/config/feature-permissions',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.app-configuration.view']),
  async (req, res, next) => {
    try {
      const db = getDb();
      // ?forTenant=<id> returns the layer-merged EFFECTIVE config the tenant's
      // devices will receive plus the tenant's own stored row — used by the
      // per-tenant access editor so it can seed from what is actually applied.
      if (req.query.forTenant) {
        const tenantId = String(req.query.forTenant);
        if (!(await assertTenantAccess(req, res, tenantId))) return;
        const tenant = await db.get('SELECT id, plan_id AS planId FROM platform_tenants WHERE id = ?', [tenantId]);
        if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
        const planId = tenant.planId || '';
        const [{ merged }, tenantRow, featureHidden] = await Promise.all([
          loadEffectiveFeatureConfig(db, tenantId, planId),
          db.get(
            'SELECT hidden_menus AS hiddenMenus, disabled_permissions AS disabledPermissions, feature_permissions AS featurePermissions FROM tenant_feature_config WHERE tenant_id IS ? AND plan_id IS ?',
            [tenantId, null]
          ),
          // Same feature-gating inputs devices get, so the preview matches the
          // signed configuration exactly (feature-owned hidden page paths).
          resolveDeviceEntitlements(db, { tenant_id: tenantId, license_id: null })
            .then((ent) => resolveFeatureHiddenPaths(db, tenantId, ent.baseFeatures)),
        ]);
        if (featureHidden.length) {
          merged.hiddenMenus = [...new Set([...merged.hiddenMenus, ...featureHidden])];
        }
        return res.json({
          data: { effective: merged, tenant: mapFeatureConfigRow(tenantRow) },
          requestId: req.requestId,
        });
      }
      const tenantId = req.query.tenantId || null;
      const planId = req.query.planId || null;
      if (tenantId) {
        if (!(await assertTenantAccess(req, res, tenantId))) return;
      } else {
        // Global (all-tenant) feature config is owner/full-scope only.
        const scoped = await getScopedTenantIds(req);
        if (Array.isArray(scoped)) {
          return res.status(403).json({ error: 'Global feature config requires full tenant scope' });
        }
      }
      const row = await db.get(
        'SELECT hidden_menus AS hiddenMenus, disabled_permissions AS disabledPermissions, feature_permissions AS featurePermissions FROM tenant_feature_config WHERE tenant_id IS ? AND plan_id IS ?',
        [tenantId, planId]
      );
      res.json({
        data: row
          ? {
              hiddenMenus: JSON.parse(row.hiddenMenus || '[]'),
              disabledPermissions: JSON.parse(row.disabledPermissions || '[]'),
              featurePermissions: JSON.parse(row.featurePermissions || '[]'),
            }
          : { hiddenMenus: [], disabledPermissions: [], featurePermissions: [] },
        requestId: req.requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/admin/config/feature-permissions',
  authenticatePlatformUser,
  // Write path requires write permission — never just *.view codes.
  requirePlatformPermission(['platform.app-configuration.update', 'platform.settings.update']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const tenantId = req.body?.tenantId || null;
      const planId = req.body?.planId || null;
      if (tenantId) {
        if (!(await assertTenantAccess(req, res, tenantId))) return;
      } else {
        const scoped = await getScopedTenantIds(req);
        if (Array.isArray(scoped)) {
          return res.status(403).json({ error: 'Global feature config requires full tenant scope' });
        }
      }
      const hiddenMenus = JSON.stringify(req.body?.hiddenMenus || []);
      const disabledPermissions = JSON.stringify(req.body?.disabledPermissions || []);
      const featurePermissions = JSON.stringify(req.body?.featurePermissions || []);
      await db.run(
        `INSERT INTO tenant_feature_config (tenant_id, plan_id, hidden_menus, disabled_permissions, feature_permissions, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(tenant_id, plan_id) DO UPDATE SET
           hidden_menus = excluded.hidden_menus,
           disabled_permissions = excluded.disabled_permissions,
           feature_permissions = excluded.feature_permissions,
           updated_at = excluded.updated_at`,
        [tenantId, planId, hiddenMenus, disabledPermissions, featurePermissions, nowIso()]
      );
      res.json({ data: { ok: true }, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * حدود صلاحيات المنصة لكل مستأجر (tenant_permission_limits).
 * tenant_id = '' يعني حدًا عامًا يسري على كل المستأجرين.
 * المنصة تقيّد ولا توسّع — هذه القيود تتقدم على أي منح محلي.
 */
router.get(
  '/admin/config/permission-limits',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.app-configuration.view']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const tenantId = req.query.tenantId || '';
      if (tenantId) {
        if (!(await assertTenantAccess(req, res, tenantId))) return;
      } else {
        const scoped = await getScopedTenantIds(req);
        if (Array.isArray(scoped)) {
          return res.status(403).json({ error: 'Global permission limits require full tenant scope' });
        }
      }
      const rows = await db.all(
        `SELECT permission_code AS permissionCode, max_amount AS maxAmount,
                cost_visible AS costVisible, profit_visible AS profitVisible,
                disabled, updated_at AS updatedAt
         FROM tenant_permission_limits WHERE tenant_id IS ? ORDER BY permission_code`,
        [tenantId]
      );
      res.json({ data: rows, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/admin/config/permission-limits',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.app-configuration.update', 'platform.settings.update']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const tenantId = req.body?.tenantId || '';
      if (tenantId) {
        if (!(await assertTenantAccess(req, res, tenantId))) return;
      } else {
        const scoped = await getScopedTenantIds(req);
        if (Array.isArray(scoped)) {
          return res.status(403).json({ error: 'Global permission limits require full tenant scope' });
        }
      }
      const limits = req.body?.limits;
      if (!Array.isArray(limits)) {
        return res.status(400).json({ error: 'limits must be an array of { permissionCode, maxAmount?, costVisible?, profitVisible?, disabled? }' });
      }
      const normalized = limits.map((entry) => {
        const code = String(entry?.permissionCode || '').trim();
        if (!code) throw new Error('permissionCode is required for every limit');
        return {
          permissionCode: code,
          maxAmount: entry?.maxAmount == null ? null : Number(entry.maxAmount),
          costVisible: entry?.costVisible == null ? null : entry.costVisible ? 1 : 0,
          profitVisible: entry?.profitVisible == null ? null : entry.profitVisible ? 1 : 0,
          disabled: entry?.disabled ? 1 : 0,
        };
      });
      for (const limit of normalized) {
        if (limit.maxAmount != null && (!Number.isFinite(limit.maxAmount) || limit.maxAmount < 0)) {
          return res.status(400).json({ error: `maxAmount must be a non-negative number for ${limit.permissionCode}` });
        }
      }
      await db.exec('BEGIN TRANSACTION');
      try {
        await db.run('DELETE FROM tenant_permission_limits WHERE tenant_id IS ?', [tenantId]);
        for (const limit of normalized) {
          await db.run(
            `INSERT INTO tenant_permission_limits
               (tenant_id, permission_code, max_amount, cost_visible, profit_visible, disabled, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [tenantId, limit.permissionCode, limit.maxAmount, limit.costVisible,
             limit.profitVisible, limit.disabled, nowIso()]
          );
        }
        await db.exec('COMMIT');
      } catch (err) {
        await db.exec('ROLLBACK');
        throw err;
      }
      res.json({ data: { ok: true, count: normalized.length }, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;