'use strict';

const express = require('express');
const { getDb } = require('../lib/db');
const { nowIso } = require('../lib/time');
const { authenticatePlatformUser, requirePlatformPermission, getScopedTenantIds, assertTenantAccess } = require('../middleware/auth');
const { signString, getKeyId } = require('../lib/signing');
const { platformCodesToRegistryIds } = require('../lib/platformModuleMap');
const { FEATURE_CODE_TO_PAGE_PATHS } = require('../lib/featurePageMap');

const router = express.Router();

function parseJsonArray(raw) {
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}

/**
 * GET /api/v1/configuration/current — signed tenant configuration for a
 * registered device. The tenant is ALWAYS resolved from the device row; the
 * client verifies `signature` over `configJson` with the published Ed25519
 * public key and fails closed on any mismatch.
 */
router.get('/configuration/current', async (req, res, next) => {
  try {
    const deviceId = String(req.get('X-Device-Id') || '').trim();
    const credential = String(req.get('X-Device-Credential') || '').trim();
    if (!deviceId || !credential) {
      return res.status(401).json({ error: 'Device authentication required' });
    }
    const db = getDb();
    const device = await db.get(
      'SELECT * FROM platform_devices WHERE id = ? OR hardware_id = ? LIMIT 1',
      [deviceId, deviceId]
    );
    if (!device) return res.status(401).json({ error: 'Unknown device' });
    if (device.status !== 'ACTIVE') return res.status(403).json({ error: `Device is ${device.status}` });
    const tenantId = device.tenant_id;

    // Resolve the plan: device license first, then the tenant's active subscription.
    let planId = null;
    let license = null;
    if (device.license_id) {
      license = await db.get('SELECT * FROM platform_licenses WHERE id = ?', [device.license_id]);
      planId = license?.plan_id || null;
    }
    if (!planId) {
      const sub = await db.get(
        `SELECT plan_id AS planId FROM platform_subscriptions
         WHERE tenant_id = ? AND status IN ('TRIAL','ACTIVE','PAST_DUE')
         ORDER BY created_at DESC LIMIT 1`,
        [tenantId]
      );
      planId = sub?.planId || null;
    }

    // Effective platform module set: license snapshot → plan defaults → tenant
    // overrides (kind='MODULE'). Codes are platform catalog codes and are
    // translated to tenant registry ids before being signed into the config.
    let baseModules = license?.modules ? parseJsonArray(license.modules) : [];
    let baseFeatures = license?.features ? parseJsonArray(license.features) : [];
    if ((!baseModules.length || !baseFeatures.length) && planId) {
      const plan = await db.get('SELECT included_modules AS includedModules, features AS planFeatures FROM platform_plans WHERE id = ?', [planId]);
      if (!baseModules.length) baseModules = parseJsonArray(plan?.includedModules);
      if (!baseFeatures.length) baseFeatures = parseJsonArray(plan?.planFeatures);
    }
    const moduleOverrides = await db.all(
      `SELECT code, is_enabled AS isEnabled FROM platform_tenant_overrides
       WHERE tenant_id = ? AND kind = 'MODULE'`,
      [tenantId]
    );
    const effectiveModuleCodes = new Set(baseModules.map(String));
    for (const row of moduleOverrides) {
      const code = String(row.code || '');
      if (!code) continue;
      if (row.isEnabled) effectiveModuleCodes.add(code);
      else effectiveModuleCodes.delete(code);
    }
    const allowedModuleIds = platformCodesToRegistryIds([...effectiveModuleCodes]);

    // Effective feature set: license snapshot → plan defaults → tenant
    // overrides (kind='FEATURE'). Features absent from the set hide the pages
    // they own via hiddenMenus.
    const featureOverrides = await db.all(
      `SELECT code, is_enabled AS isEnabled FROM platform_tenant_overrides
       WHERE tenant_id = ? AND kind = 'FEATURE'`,
      [tenantId]
    );
    const effectiveFeatureCodes = new Set(baseFeatures.map(String));
    for (const row of featureOverrides) {
      const code = String(row.code || '');
      if (!code) continue;
      if (row.isEnabled) effectiveFeatureCodes.add(code);
      else effectiveFeatureCodes.delete(code);
    }
    // Only gate feature-owned pages when the tenant actually has a feature
    // set (license/plan features or explicit overrides) — otherwise tenants
    // without plan features would lose pages they never had gated.
    const featureGatingActive = baseFeatures.length > 0 || featureOverrides.length > 0;
    let featureHiddenPaths = [];
    if (featureGatingActive) {
      // Dynamic page ownership: page_paths stored on each feature flag
      // (admin-managed) merged over the built-in static map.
      const flagRows = await db.all('SELECT key, page_paths AS pagePaths FROM platform_feature_flags').catch(() => []);
      const dynamicMap = { ...FEATURE_CODE_TO_PAGE_PATHS };
      for (const row of flagRows || []) {
        const code = String(row.key || '');
        if (!code) continue;
        let paths = [];
        try { paths = JSON.parse(row.pagePaths || '[]'); } catch { paths = []; }
        if (Array.isArray(paths) && paths.length) {
          dynamicMap[code] = [...new Set([...(dynamicMap[code] || []), ...paths.map(String)])];
        }
      }
      featureHiddenPaths = Object.entries(dynamicMap)
        .filter(([code]) => !effectiveFeatureCodes.has(code))
        .flatMap(([, paths]) => paths);
    }

    // Layered feature config: global → tenant → tenant+plan (later wins).
    const featureRows = await db.all(
      `SELECT tenant_id AS tenantId, plan_id AS planId, hidden_menus AS hiddenMenus,
              disabled_permissions AS disabledPermissions, feature_permissions AS featurePermissions,
              updated_at AS updatedAt
       FROM tenant_feature_config
       WHERE (tenant_id IS NULL OR tenant_id = '' OR tenant_id = ?)
         AND (plan_id IS NULL OR plan_id = ?)`,
      [tenantId, planId || '']
    );
    const merged = { hiddenMenus: [], disabledPermissions: [], featurePermissions: [] };
    const rank = (row) => (row.tenantId ? 1 : 0) + (row.planId ? 2 : 0);
    const ordered = featureRows.slice().sort((a, b) => rank(a) - rank(b));
    let maxFeatureUpdated = '';
    for (const row of ordered) {
      const hidden = parseJsonArray(row.hiddenMenus);
      const disabled = parseJsonArray(row.disabledPermissions);
      const features = parseJsonArray(row.featurePermissions);
      if (hidden.length) merged.hiddenMenus = hidden;
      if (disabled.length) merged.disabledPermissions = disabled;
      if (features.length) merged.featurePermissions = features;
      if (row.updatedAt > maxFeatureUpdated) maxFeatureUpdated = row.updatedAt;
    }
    // Pages owned by features the tenant's plan/overrides exclude.
    if (featureHiddenPaths.length) {
      merged.hiddenMenus = [...new Set([...merged.hiddenMenus, ...featureHiddenPaths])];
    }

    // Permission limits: tenant-specific rows override global ('' tenant) rows.
    const limitRows = await db.all(
      `SELECT tenant_id AS tenantId, permission_code AS permissionCode, max_amount AS maxAmount,
              cost_visible AS costVisible, profit_visible AS profitVisible, disabled, updated_at AS updatedAt
       FROM tenant_permission_limits WHERE tenant_id IN ('', ?) ORDER BY tenant_id`,
      [tenantId]
    );
    const limitsByCode = new Map();
    let maxLimitUpdated = '';
    for (const row of limitRows) {
      limitsByCode.set(row.permissionCode, {
        permissionCode: row.permissionCode,
        maxAmount: row.maxAmount ?? null,
        costVisible: row.costVisible ?? null,
        profitVisible: row.profitVisible ?? null,
        disabled: row.disabled ? 1 : 0,
      });
      if (row.updatedAt > maxLimitUpdated) maxLimitUpdated = row.updatedAt;
    }

    const inner = {
      hiddenMenus: merged.hiddenMenus,
      disabledPermissions: merged.disabledPermissions,
      featurePermissions: merged.featurePermissions,
      permissionLimits: [...limitsByCode.values()],
      allowedModules: allowedModuleIds,
      usageLimits: {},
    };
    const configurationVersion = Math.max(
      1,
      Math.floor(Date.parse(maxFeatureUpdated || maxLimitUpdated || '') / 1000) || 1
    );
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