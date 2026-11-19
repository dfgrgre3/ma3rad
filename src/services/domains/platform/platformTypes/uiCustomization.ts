// ─── UI Customization & Profiles (Item 12) ────────────────────────────────────

export interface FormFieldRule {
  visible: boolean;
  required?: boolean;
  defaultValue?: string | number | boolean;
}

export interface PlatformUiProfile {
  id: string;
  code: string;
  name: string;
  businessType?: string;
  hiddenPages: string[];
  hiddenActions: string[];
  customLabels: Record<string, string>;
  navOrder: string[];
  formFieldRules: Record<string, FormFieldRule>;
  isDefault: boolean;
  createdAt: string;
}

export interface PlatformTenantUiCustomization {
  id: string;
  tenantId: string;
  profileId?: string;
  hiddenPages: string[];
  hiddenActions: string[];
  customLabels: Record<string, string>;
  navOrder: string[];
  formFieldRules: Record<string, FormFieldRule>;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformTenantUiInput {
  tenantId: string;
  profileId?: string;
  hiddenPages?: string[];
  hiddenActions?: string[];
  customLabels?: Record<string, string>;
  navOrder?: string[];
  formFieldRules?: Record<string, FormFieldRule>;
  changeSummary?: string;
  overrides?: {
    hiddenPages?: string[];
    hiddenActions?: string[];
    customLabels?: Record<string, string>;
    navOrder?: string[];
    formFieldRules?: Record<string, FormFieldRule>;
  };
}

export interface PlatformTenantUiVersion {
  id: string;
  tenantId: string;
  version: number;
  configSnapshot: PlatformTenantUiCustomization;
  changeSummary?: string;
  createdBy?: string;
  createdAt: string;
}

// ─── Per-Tenant Activity Customization & Versions ───────────────────────────

export interface PlatformTenantActivityConfig {
  tenantId: string;
  activityId: string;
  familyId?: string | null;
  profileId?: string | null;
  enabledModules: string[];
  customTerminology: Record<string, string>;
  navigationOverrides?: unknown;
  featuresEnabled?: string[];
  customAttributes?: unknown;
  version: number;
  createdAt: string;
  updatedAt?: string;
}

export interface PlatformTenantActivityVersion {
  id: string;
  tenantId: string;
  version: number;
  activityId: string;
  profileId?: string | null;
  config?: Record<string, unknown>;
  changeSummary?: string | null;
  createdBy?: string | null;
  createdAt: string;
}

export interface PlatformTenantActivityInput {
  tenantId: string;
  activityId: string;
  profileId?: string;
  enabledModules?: string[];
  customTerminology?: Record<string, string>;
  changeSummary?: string;
}
