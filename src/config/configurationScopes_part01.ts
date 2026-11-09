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
