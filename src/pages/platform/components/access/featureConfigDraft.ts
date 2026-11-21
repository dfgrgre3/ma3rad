import type { CentralFeaturePermission } from '../../../../services/domains/licensing/CentralFeaturePermissionService';
import { isGranularPermissionCode } from './pageAccessRules';

// ─── Feature-config draft split ───────────────────────────────────────────────
// tenant_feature_config stores three arrays; editors work on all of them.
// Entries that do not map to a catalog page path (or non-granular permission
// codes) are preserved verbatim so saving never drops unrelated overrides.

export interface TenantFeatureConfigDraft {
  hiddenMenus: Set<string>;
  /** pageUrl → featurePermissions entry (only catalog page paths). */
  featurePerms: Map<string, CentralFeaturePermission>;
  /** featurePermissions entries without a catalog pageUrl — passed through. */
  otherFeaturePerms: Array<Record<string, unknown>>;
  /** granular ui.* permission codes disabled for the scope. */
  disabledPermissions: Set<string>;
  /** non-granular disabled codes — passed through. */
  otherDisabledPermissions: string[];
}

export const emptyFeatureConfigDraft = (): TenantFeatureConfigDraft => ({
  hiddenMenus: new Set(),
  featurePerms: new Map(),
  otherFeaturePerms: [],
  disabledPermissions: new Set(),
  otherDisabledPermissions: [],
});

export const normalizePageUrl = (value: unknown): string =>
  String(value || '').split('?')[0].toLowerCase().replace(/\/+$/, '');

export interface FeatureConfigData {
  hiddenMenus?: string[];
  disabledPermissions?: string[];
  featurePermissions?: Array<Record<string, unknown>>;
}

export const splitFeatureConfig = (
  data: FeatureConfigData,
  catalogPaths: Set<string>
): TenantFeatureConfigDraft => {
  const draft = emptyFeatureConfigDraft();
  for (const path of data.hiddenMenus ?? []) draft.hiddenMenus.add(String(path));
  for (const code of data.disabledPermissions ?? []) {
    const c = String(code);
    if (isGranularPermissionCode(c)) draft.disabledPermissions.add(c);
    else draft.otherDisabledPermissions.push(c);
  }
  for (const entry of data.featurePermissions ?? []) {
    const pageUrl = normalizePageUrl(entry?.pageUrl);
    if (pageUrl && catalogPaths.has(pageUrl)) {
      draft.featurePerms.set(pageUrl, entry as unknown as CentralFeaturePermission);
    } else {
      draft.otherFeaturePerms.push(entry);
    }
  }
  return draft;
};

/** Payload shape accepted by PUT /api/v1/admin/config/feature-permissions. */
export const serializeFeatureConfig = (cfg: TenantFeatureConfigDraft): {
  hiddenMenus: string[];
  disabledPermissions: string[];
  featurePermissions: Array<Record<string, unknown>>;
} => ({
  hiddenMenus: [...cfg.hiddenMenus],
  disabledPermissions: [
    ...cfg.otherDisabledPermissions,
    ...[...cfg.disabledPermissions],
  ],
  featurePermissions: [
    ...cfg.otherFeaturePerms,
    ...[...cfg.featurePerms.values()].map((entry) => ({ ...(entry as Record<string, unknown>) })),
  ],
});

/** Deterministic serialization used to detect unapplied edits. */
export const featureConfigSignature = (cfg: TenantFeatureConfigDraft): string =>
  JSON.stringify({
    h: [...cfg.hiddenMenus].sort(),
    fp: [...cfg.featurePerms.entries()].sort(([a], [b]) => a.localeCompare(b)),
    ofp: cfg.otherFeaturePerms,
    dp: [...cfg.disabledPermissions].sort(),
    odp: [...cfg.otherDisabledPermissions].sort(),
  });
