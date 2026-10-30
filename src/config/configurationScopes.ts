/**
 * Configuration scope model.
 *
 * Platform
 *   └── Tenant / Customer
 *        └── Business Activity
 *             └── Company
 *                  └── Branch
 *                       └── Device
 *                            └── User
 *
 * The list is ordered from the highest authority to the lowest. Effective
 * configuration is resolved by walking this chain from the top: the first
 * scope that defines a key wins. The legacy global `app_config_entries` table
 * acts as the company-level base and is always the last fallback.
 *
 * Pure data and pure functions only. No database or React imports.
 */

import { isSecuritySensitiveConfigKey, type AppConfigDomain } from './appConfiguration';

export type ConfigurationScopeType =
  | 'platform'
  | 'tenant'
  | 'activity'
  | 'company'
  | 'branch'
  | 'device'
  | 'user';

export const CONFIGURATION_SCOPE_PRECEDENCE: readonly ConfigurationScopeType[] = [
  'platform', 'tenant', 'activity', 'company', 'branch', 'device', 'user',
] as const;

export const CONFIGURATION_SCOPE_TYPES = CONFIGURATION_SCOPE_PRECEDENCE;

export const CONFIGURATION_SCOPE_LABELS: Record<ConfigurationScopeType, string> = {
  platform: 'المنصة',
  tenant: 'المستأجر / العميل',
  activity: 'نشاط العمل',
  company: 'الشركة',
  branch: 'الفرع',
  device: 'الجهاز',
  user: 'المستخدم',
};

export interface ConfigurationScopeContext {
  tenantId?: string;
  activityId?: string;
  companyId?: string;
  branchId?: string;
  deviceId?: string;
  userId?: string;
}

export interface ConfigurationScopeRef {
  type: ConfigurationScopeType;
  id: string;
}

export function isConfigurationScopeType(value: unknown): value is ConfigurationScopeType {
  return typeof value === 'string'
    && (CONFIGURATION_SCOPE_PRECEDENCE as readonly string[]).includes(value);
}

export function configurationScopeRef(
  type: ConfigurationScopeType,
  context: ConfigurationScopeContext,
): ConfigurationScopeRef | null {
  const raw = (() => {
    switch (type) {
      case 'platform': return 'platform';
      case 'tenant': return context.tenantId;
      case 'activity': return context.activityId;
      case 'company': return context.companyId;
      case 'branch': return context.branchId;
      case 'device': return context.deviceId;
      case 'user': return context.userId;
      default: return undefined;
    }
  })();
  if (raw === undefined || raw === null) return null;
  const id = String(raw).trim();
  if (!id || id.length > 120) return null;
  return { type, id };
}

/** Highest authority first; only scopes present in the context are included. */
export function resolveConfigurationScopeChain(
  context: ConfigurationScopeContext,
): ConfigurationScopeRef[] {
  const chain: ConfigurationScopeRef[] = [];
  for (const type of CONFIGURATION_SCOPE_PRECEDENCE) {
    const ref = configurationScopeRef(type, context);
    if (ref) chain.push(ref);
  }
  return chain;
}

export function normalizeScopeContext(context: unknown): ConfigurationScopeContext {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return {};
  const input = context as Record<string, unknown>;
  const read = (key: string): string | undefined => {
    const value = input[key];
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed && trimmed.length <= 120 ? trimmed : undefined;
  };
  return {
    tenantId: read('tenantId'),
    activityId: read('activityId'),
    companyId: read('companyId'),
    branchId: read('branchId'),
    deviceId: read('deviceId'),
    userId: read('userId'),
  };
}

export function serializeScopeContext(context: ConfigurationScopeContext): string {
  return CONFIGURATION_SCOPE_PRECEDENCE
    .map((type) => {
      const ref = configurationScopeRef(type, context);
      return ref ? `${ref.type}:${ref.id}` : '';
    })
    .filter(Boolean)
    .join('|') || 'base';
}

export function describeScope(ref: ConfigurationScopeRef | null): string {
  if (!ref) return 'الإعداد العام';
  return `${CONFIGURATION_SCOPE_LABELS[ref.type]} — ${ref.id}`;
}

export interface ScopeOverrideDecision {
  allowed: boolean;
  reason: string;
}

/**
 * Rule table for who may override what.
 *
 * - The platform layer is distributed centrally and is read-only locally.
 * - Security, module and feature decisions cannot be weakened below tenant.
 * - Every presentation concern (pages, sections, fields, texts, actions,
 *   numbering, print) is configurable at any local scope.
 */
export function canOverrideAtScope(
  scopeType: ConfigurationScopeType,
  domain: AppConfigDomain,
  key: string,
): ScopeOverrideDecision {
  if (scopeType === 'platform') {
    return {
      allowed: false,
      reason: 'إعدادات المنصة تُوزَّع مركزيًا ولا يمكن تعديلها من الجهاز المحلي.',
    };
  }
  const sensitive = isSecuritySensitiveConfigKey(domain, key);
  if (sensitive && scopeType !== 'tenant') {
    return {
      allowed: false,
      reason: 'هذا الإعداد أمني أو مرتبط بالترخيص، ولا يمكن تجاوزه من نطاق أدنى من المستأجر.',
    };
  }
  if (domain === 'module' && scopeType !== 'tenant' && scopeType !== 'company') {
    return {
      allowed: false,
      reason: 'تفعيل الوحدات يُدار على مستوى المستأجر أو الشركة فقط.',
    };
  }
  return { allowed: true, reason: '' };
}

/** Merge order helper: lower index = higher authority. */
export function scopeAuthority(scopeType: ConfigurationScopeType): number {
  return CONFIGURATION_SCOPE_PRECEDENCE.indexOf(scopeType);
}
