'use strict';

const { platformCodesToRegistryIds } = require('./platformModuleMap');

function parseJsonArray(raw) {
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}

/**
 * Resolve what a registered device's tenant is entitled to.
 *
 * Single source of truth for "which business modules may this device use":
 * shared by the signed tenant configuration and by module package delivery so
 * the two can never disagree.
 *
 * Effective platform module set: license snapshot → plan defaults → tenant
 * overrides (kind='MODULE'). Codes are platform catalog codes and are translated
 * to tenant registry ids.
 *
 * @param {{ all: Function, get: Function }} db
 * @param {{ tenant_id: string, license_id?: string|null }} device
 */
async function resolveDeviceEntitlements(db, device) {
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

  return { tenantId, planId, license, baseFeatures, allowedModuleIds };
}

module.exports = { resolveDeviceEntitlements, parseJsonArray };
