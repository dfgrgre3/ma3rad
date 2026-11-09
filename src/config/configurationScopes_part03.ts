import { isSecuritySensitiveConfigKey, type AppConfigDomain } from './appConfiguration';
import { CONFIGURATION_SCOPE_PRECEDENCE } from './configurationScopes_part01';
import type { ConfigurationScopeType } from './configurationScopes_part01';
import type { ScopeOverrideDecision } from './configurationScopes_part02';

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
