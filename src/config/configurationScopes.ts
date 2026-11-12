export {
  CONFIGURATION_SCOPE_LABELS,
  CONFIGURATION_SCOPE_PRECEDENCE,
  CONFIGURATION_SCOPE_TYPES,
  configurationScopeRef,
  isConfigurationScopeType,
} from './configurationScopes_part01';
export {
  describeScope,
  normalizeScopeContext,
  resolveConfigurationScopeChain,
  serializeScopeContext,
} from './configurationScopes_part02';
export { canOverrideAtScope, scopeAuthority } from './configurationScopes_part03';
export type {
  ConfigurationScopeContext,
  ConfigurationScopeRef,
} from './configurationScopes_part01';
export type { ScopeOverrideDecision } from './configurationScopes_part02';
export type { ConfigurationScopeType } from './configurationScopes_part01';
