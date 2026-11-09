import { CONFIGURATION_SCOPE_LABELS, CONFIGURATION_SCOPE_PRECEDENCE, configurationScopeRef } from './configurationScopes_part01';
import type { ConfigurationScopeContext, ConfigurationScopeRef } from './configurationScopes_part01';

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
