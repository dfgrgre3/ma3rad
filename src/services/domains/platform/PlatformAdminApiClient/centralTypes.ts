// Shared response types for the central Platform Admin API client.
//
// These mirror the shapes actually returned by `central-server/routes/*`:
// DB-backed endpoints return snake_case rows verbatim, while a few endpoints
// return small camelCase result objects. Fields are optional where the server
// may omit them (joined columns, nullable columns, older deployments).
//
// Every interface keeps a `[key: string]: any` index signature: pages
// historically received `any` and may read either snake_case or camelCase
// keys, so undeclared properties must remain accessible.

import type {
  PlatformTenant,
  PlatformTenantAccount,
  PlatformTenantUser,
  PlatformTenantUserDirectoryEntry,
  PlatformTenantUsage,
  PlatformSubscription,
  PlatformInvoice,
  PlatformPayment,
  PlatformPlan,
  PlatformLicense,
} from '../platformTypes';

// ─── Generic mutation results ────────────────────────────────────────────────

/** Trivial `{ revoked: true }` / `{ deleted: true }` / `{ updated: true }` payloads. */
export interface CentralMutationResult {
  id?: string;
  deleted?: boolean;
  revoked?: boolean;
  updated?: boolean;
  [key: string]: any;
}

// ─── Staff (platform_users) ──────────────────────────────────────────────────

/** Row of `platform_users` returned by GET/POST /admin/staff. */
export interface CentralStaffMember {
  id: string;
  username?: string | null;
  full_name?: string | null;
  email?: string | null;
  role?: string | null;
  /** JSON array of granted permission codes (already parsed by the server). */
  permissions?: any;
  is_active?: number | boolean | null;
  last_login_at?: string | null;
  created_at?: string | null;
  deleted_at?: string | null;
  [key: string]: any;
}

/** POST /admin/staff response (camelCase summary of the created user). */
export interface CentralStaffCreated {
  id?: string;
  username?: string;
  fullName?: string | null;
  email?: string | null;
  role?: string;
  permissions?: string[];
  deniedPermissions?: string[];
  [key: string]: any;
}

/** Row of `platform_staff_sessions` (+ joined staff_name/staff_email). */
export interface CentralStaffSessionRow {
  id: string;
  staff_id?: string | null;
  staff_name?: string | null;
  staff_email?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  device_name?: string | null;
  is_active?: number | boolean | null;
  is_current?: number | boolean | null;
  expires_at?: string | null;
  created_at?: string | null;
  last_activity_at?: string | null;
  [key: string]: any;
}

/** Row of `platform_staff_devices` (+ joined staff_name/staff_email). */
export interface CentralStaffDeviceRow {
  id: string;
  staff_id?: string | null;
  staff_name?: string | null;
  staff_email?: string | null;
  device_name?: string | null;
  fingerprint?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  is_active?: number | boolean | null;
  is_revoked?: number | boolean | null;
  trusted_at?: string | null;
  last_seen_at?: string | null;
  created_at?: string | null;
  [key: string]: any;
}

/** Row of `platform_staff_invites` (+ invited_by_name; `token` only on create). */
export interface CentralStaffInviteRow {
  id: string;
  email?: string | null;
  full_name?: string | null;
  fullName?: string | null;
  phone?: string | null;
  role?: string | null;
  token?: string;
  token_hash?: string | null;
  status?: string | null;
  expires_at?: string | null;
  expiresAt?: string | null;
  invited_by?: string | null;
  invited_by_name?: string | null;
  invitedByName?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
  revoked_at?: string | null;
  accepted_at?: string | null;
  [key: string]: any;
}

// ─── Roles & permission catalog ──────────────────────────────────────────────

/** GET /admin/admin-control/staff-roles row. */
export interface CentralRoleOption {
  code: string;
  name?: string | null;
  description?: string | null;
  [key: string]: any;
}

/** GET /admin/permissions/catalog payload. */
export interface CentralPermissionCatalog {
  sections: unknown[];
  pages: unknown[];
  permissions: unknown[];
  roles: Array<{
    code: string;
    name?: string;
    description?: string | null;
    isSystem?: number | boolean;
    permissions?: string[];
    [key: string]: any;
  }>;
  [key: string]: any;
}

// ─── Notifications ───────────────────────────────────────────────────────────

/** Row of `platform_notifications`. */
export interface CentralNotificationRow {
  id: string;
  tenant_id?: string | null;
  audience?: string | null;
  channel?: string | null;
  template_id?: string | null;
  subject: string;
  payload?: any;
  status?: string | null;
  attempts?: number | null;
  last_error?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: any;
}

/** Row of `platform_notification_deliveries`. */
export interface CentralNotificationDeliveryRow {
  id: string;
  notification_id?: string | null;
  channel?: string | null;
  recipient?: string | null;
  status?: string | null;
  provider?: string | null;
  external_id?: string | null;
  error?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: any;
}

/** Row of `platform_notification_templates`. */
export interface CentralNotificationTemplateRow {
  id: string;
  code?: string | null;
  name?: string | null;
  channel?: string | null;
  subject?: string | null;
  body?: string | null;
  is_active?: number | boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: any;
}

// ─── Admin control (platform_staff_extended) ─────────────────────────────────

/** Row of `platform_staff_extended` returned by /admin/admin-control/staff*. */
export interface CentralAdminControlStaffRow {
  id: string;
  user_id?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  is_active?: number | boolean | null;
  /** JSON string or parsed value depending on the endpoint. */
  permissions?: any;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
  [key: string]: any;
}

// ─── Billing rows ────────────────────────────────────────────────────────────

/** Row of `platform_subscriptions` (+ joined tenant/plan names; snake_case). */
export interface CentralSubscriptionRow {
  id?: string;
  tenant_id?: string | null;
  plan_id?: string | null;
  status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  seats?: number | null;
  price?: number | null;
  discount?: number | null;
  billing_cycle?: string | null;
  auto_renew?: number | boolean | null;
  branches_limit?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: any;
}

/** Raw `platform_invoices` row (+ joined names / items; snake_case). */
export interface CentralInvoiceRow {
  id?: string;
  number?: string | null;
  tenant_id?: string | null;
  subscription_id?: string | null;
  issue_date?: string | null;
  due_date?: string | null;
  status?: string | null;
  currency?: string | null;
  subtotal?: number | null;
  discount?: number | null;
  tax?: number | null;
  total?: number | null;
  paid_amount?: number | null;
  notes?: string | null;
  created_at?: string | null;
  items?: any;
  [key: string]: any;
}

/** Raw `platform_payments` row (+ joined invoice/tenant names; snake_case). */
export interface CentralPaymentRow {
  id?: string;
  invoice_id?: string | null;
  tenant_id?: string | null;
  amount?: number | null;
  method?: string | null;
  reference?: string | null;
  paid_at?: string | null;
  notes?: string | null;
  created_at?: string | null;
  [key: string]: any;
}

/** Raw `platform_devices` row (+ joined tenant/license names; snake_case). */
export interface CentralDeviceRow {
  id?: string;
  tenant_id?: string | null;
  license_id?: string | null;
  hardware_id?: string | null;
  name?: string | null;
  os?: string | null;
  app_version?: string | null;
  ip_address?: string | null;
  status?: string | null;
  first_activated_at?: string | null;
  last_seen_at?: string | null;
  clone_suspected?: number | boolean | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: any;
}

// ─── Subscriptions ───────────────────────────────────────────────────────────

/** POST /admin/subscriptions/:tenantId/renew → data payload. */
export interface CentralSubscriptionRenewResult {
  subscriptionId?: string;
  endDate?: string | null;
  [key: string]: any;
}

/** POST /admin/subscriptions/:tenantId/cancel → data payload. */
export interface CentralSubscriptionCancelResult {
  tenantId?: string;
  status?: string;
  [key: string]: any;
}

/** POST /admin/subscriptions/:tenantId/change-plan → data payload. */
export interface CentralSubscriptionChangePlanResult {
  subscriptionId?: string;
  licenseId?: string;
  planId?: string;
  previousPlanId?: string | null;
  startDate?: string;
  endDate?: string | null;
  status?: string;
  [key: string]: any;
}

/** POST /admin/subscriptions → data payload (created subscription + license). */
export interface CentralSubscriptionCreateResult {
  subscriptionId?: string;
  licenseId?: string;
  tenantId?: string;
  planId?: string;
  status?: string;
  startDate?: string;
  endDate?: string | null;
  [key: string]: any;
}

/** POST /admin/subscriptions/:tenantId/{suspend|resume} → data payload. */
export interface CentralSubscriptionStatusResult {
  tenantId?: string;
  status?: string;
  affectedSubscriptions?: number;
  [key: string]: any;
}

/** PATCH /admin/subscriptions/:tenantId → data payload. */
export interface CentralSubscriptionSettingsResult {
  tenantId?: string;
  updated?: boolean;
  [key: string]: any;
}

/** Row of platform_subscription_changes returned by GET .../history. */
export interface CentralSubscriptionChangeRow {
  id?: string;
  subscription_id?: string | null;
  change_type?: string | null;
  old_values?: any;
  new_values?: any;
  actor_name?: string | null;
  reason?: string | null;
  created_at?: string | null;
  [key: string]: any;
}

// ─── Licenses & devices ──────────────────────────────────────────────────────

/** Raw `platform_licenses` row (snake_case) as embedded in action responses. */
export interface CentralLicenseRow {
  id?: string;
  tenant_id?: string | null;
  subscription_id?: string | null;
  plan_id?: string | null;
  license_key?: string | null;
  status?: string | null;
  issued_at?: string | null;
  starts_at?: string | null;
  expires_at?: string | null;
  seats?: number | null;
  device_limit?: number | null;
  branches_limit?: number | null;
  hardware_id?: string | null;
  activation_code?: string | null;
  certificate?: any;
  transfer_count?: number | null;
  modules?: any;
  features?: any;
  offline_grace_period_days?: number | null;
  coupling_mode?: string | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: any;
}

/** POST /admin/licenses/:id/renew → data payload. */
export interface CentralLicenseRenewResult {
  license?: CentralLicenseRow | null;
  previousExpiresAt?: string | null;
  newExpiresAt?: string | null;
  [key: string]: any;
}

/** POST /admin/licenses/:id/reactivate → data payload. */
export interface CentralLicenseStatusResult {
  licenseId?: string;
  status?: string;
  previousStatus?: string | null;
  suspendedAt?: string | null;
  revokedAt?: string | null;
  [key: string]: any;
}

/** POST /admin/devices/:id/{suspend|release|revoke} → data payload. */
export interface CentralDeviceStatusResult {
  deviceId?: string;
  status?: string;
  previousStatus?: string | null;
  [key: string]: any;
}

// ─── Tenants ─────────────────────────────────────────────────────────────────

/** Aggregated GET /admin/tenants/:id/profile payload. */
export interface CentralTenantProfile {
  tenant?: PlatformTenant;
  plan?: (Partial<PlatformPlan> & Record<string, any>) | null;
  account?: PlatformTenantAccount | null;
  subscriptions?: Array<Partial<PlatformSubscription> & Record<string, any>>;
  licenses?: Array<Partial<PlatformLicense> & Record<string, any>>;
  invoices?: PlatformInvoice[];
  payments?: Array<Partial<PlatformPayment> & Record<string, any>>;
  devices?: Array<Record<string, any>>;
  usage?: PlatformTenantUsage;
  activationLog?: Array<Record<string, any>>;
  changeLog?: Array<Record<string, any>>;
  activityLog?: Array<Record<string, any>>;
  [key: string]: any;
}

/** POST /admin/tenants/:id/account → data payload. */
export interface CentralTenantAccountCreated {
  account?: PlatformTenantAccount | null;
  temporaryPassword?: string;
  activationCode?: string;
  [key: string]: any;
}

/** POST /admin/tenants/:id/users → data payload. */
export interface CentralTenantUserCreated {
  user?: PlatformTenantUser | null;
  inviteCode?: string | null;
  temporaryPassword?: string | null;
  provisioned?: boolean;
  message?: string;
  [key: string]: any;
}

/** POST /admin/tenants/:id/users/:userId/resend-invite → data payload. */
export interface CentralTenantUserInviteResult {
  user?: PlatformTenantUser | null;
  inviteCode?: string | null;
  temporaryPassword?: string | null;
  [key: string]: any;
}

/** Row returned by GET /admin/tenant-users (cross-tenant directory). */
export type CentralTenantUserDirectoryEntry = PlatformTenantUserDirectoryEntry;

/** Row returned by the tenant branches endpoints (mapBranchRow). */
export interface CentralTenantBranch {
  id: string;
  tenantId?: string;
  code?: string;
  name?: string;
  city?: string | null;
  country?: string | null;
  address?: string | null;
  phone?: string | null;
  status?: string;
  seatsLimit?: number;
  devicesLimit?: number;
  isMain?: boolean;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

/** mapRemoteConfigRow output (platform_remote_config). */
export interface CentralRemoteConfigRow {
  id?: string;
  key?: string;
  value?: any;
  scope?: string;
  targetDeviceIds?: any;
  status?: string;
  appliedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

/** Device summary embedded in GET /admin/tenants/:id/remote. */
export interface CentralTenantRemoteDevice {
  id: string;
  licenseId?: string | null;
  hardwareId?: string | null;
  name?: string | null;
  status?: string;
  firstActivatedAt?: string | null;
  lastSeenAt?: string | null;
  cloneSuspected?: boolean;
  [key: string]: any;
}

/** GET /admin/tenants/:id/remote payload. */
export interface CentralTenantRemoteControl {
  devices?: CentralTenantRemoteDevice[];
  appliedConfig?: CentralRemoteConfigRow | null;
  configPushHistory?: CentralRemoteConfigRow[];
  lastSync?: any;
  [key: string]: any;
}

/** POST /admin/tenants/:id/remote/sync → data payload. */
export interface CentralTenantSyncResult {
  tenantId?: string;
  syncRequested?: boolean;
  [key: string]: any;
}

/** POST /admin/tenants/:id/archive → data payload. */
export interface CentralTenantArchiveResult {
  id?: string;
  status?: string;
  [key: string]: any;
}

// ─── Integrations ────────────────────────────────────────────────────────────

/** Raw `platform_webhook_endpoints` row (snake_case) from create/update. */
export interface CentralWebhookRow {
  id: string;
  name?: string | null;
  url?: string | null;
  /** JSON string of subscribed event names. */
  events?: any;
  secret?: string | null;
  is_active?: number | boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: any;
}

/** Row of `platform_payment_providers` / `platform_sms_providers`. */
export interface CentralIntegrationProviderRow {
  id: string;
  provider_code?: string | null;
  provider_name?: string | null;
  is_enabled?: number | boolean | null;
  config?: any;
  sender_id?: string | null;
  daily_quota?: number | null;
  updated_at?: string | null;
  [key: string]: any;
}

/** GET/PUT /admin/integrations/providers payloads. */
export interface CentralIntegrationProviders {
  payments: CentralIntegrationProviderRow[];
  sms: CentralIntegrationProviderRow[];
  [key: string]: any;
}

// ─── Tenant experience (branding / UI / app-config / activity) ───────────────

/** Raw `platform_branding` row (platform-level, snake_case). */
export interface CentralPlatformBrandingRow {
  id?: string;
  logo_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  font_family?: string | null;
  custom_css?: string | null;
  login_bg_url?: string | null;
  invoice_template?: string | null;
  updated_at?: string | null;
  updated_by?: string | null;
  [key: string]: any;
}

/** Raw `platform_tenant_branding` row (snake_case). */
export interface CentralTenantBrandingRow {
  id: string;
  tenant_id?: string | null;
  version?: number | null;
  company_name?: string | null;
  logo_url?: string | null;
  logo_dark_url?: string | null;
  favicon_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  accent_color?: string | null;
  font_family?: string | null;
  invoice_template?: string | null;
  login_background_url?: string | null;
  login_welcome_title?: string | null;
  login_welcome_subtitle?: string | null;
  email_header_logo?: string | null;
  email_footer_text?: string | null;
  custom_subdomain?: string | null;
  allowed_customizations?: any;
  created_at?: string | null;
  updated_at?: string | null;
  updated_by?: string | null;
  [key: string]: any;
}

/** Version-list rows shared by branding/UI/config/activity endpoints. */
export interface CentralVersionSummaryRow {
  id: string;
  version?: number | null;
  template_id?: string | null;
  activity_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  updated_by?: string | null;
  [key: string]: any;
}

/** Row of `platform_ui_profiles`. */
export interface CentralUiProfileRow {
  id: string;
  code?: string | null;
  name?: string | null;
  business_type?: string | null;
  hidden_pages?: any;
  hidden_actions?: any;
  custom_labels?: any;
  nav_order?: any;
  form_field_rules?: any;
  is_default?: number | boolean | null;
  is_active?: number | boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: any;
}

/** Raw `platform_tenant_ui_customization` row (snake_case). */
export interface CentralTenantUiRow {
  id: string;
  tenant_id?: string | null;
  version?: number | null;
  profile_id?: string | null;
  hidden_pages?: any;
  hidden_actions?: any;
  custom_labels?: any;
  form_field_rules?: any;
  created_at?: string | null;
  updated_at?: string | null;
  updated_by?: string | null;
  [key: string]: any;
}

/** Row of `platform_config_templates`. */
export interface CentralConfigTemplateRow {
  id: string;
  code?: string | null;
  name?: string | null;
  business_type?: string | null;
  plan_id?: string | null;
  config_payload?: any;
  version?: number | null;
  is_default?: number | boolean | null;
  is_active?: number | boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: any;
}

/** Row of `platform_config_rollouts`. */
export interface CentralConfigRolloutRow {
  id: string;
  template_id?: string | null;
  status?: string | null;
  target_tenants?: any;
  created_by?: string | null;
  created_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  [key: string]: any;
}

/** Row of `platform_config_acks`. */
export interface CentralConfigAckRow {
  id: string;
  rollout_id?: string | null;
  tenant_id?: string | null;
  device_id?: string | null;
  status?: string | null;
  acked_at?: string | null;
  created_at?: string | null;
  [key: string]: any;
}

/** Raw `platform_tenant_config` row (snake_case). */
export interface CentralTenantConfigRow {
  id: string;
  tenant_id?: string | null;
  version?: number | null;
  template_id?: string | null;
  config_payload?: any;
  created_at?: string | null;
  updated_at?: string | null;
  updated_by?: string | null;
  [key: string]: any;
}

/** Raw `platform_tenant_activity` row (snake_case). `id` optional: the platform
 * activity-config DTO has no id, and pages cast rows to it directly. */
export interface CentralTenantActivityRow {
  id?: string;
  tenant_id?: string | null;
  version?: number | null;
  activity_id?: string | null;
  enabled_modules?: any;
  custom_terminology?: any;
  created_at?: string | null;
  updated_at?: string | null;
  updated_by?: string | null;
  [key: string]: any;
}

// ─── Audit security / monitoring ─────────────────────────────────────────────

/** mapErrorRow output (platform_error_reports, camelCase). */
export interface CentralErrorReport {
  id: string;
  tenantId?: string | null;
  tenantName?: string | null;
  deviceId?: string | null;
  fingerprint?: string | null;
  title?: string | null;
  description?: string | null;
  stack?: string | null;
  issueType?: string | null;
  severity?: string | null;
  appVersion?: string | null;
  os?: string | null;
  occurrences?: number | null;
  firstSeenAt?: string | null;
  lastSeenAt?: string | null;
  status?: string | null;
  acknowledgedBy?: string | null;
  resolvedBy?: string | null;
  resolvedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  [key: string]: any;
}

/** GET /admin/monitoring/errors/summary payload. */
export interface CentralErrorReportsSummary {
  byStatus?: Record<string, number>;
  bySeverity?: Record<string, { count?: number; occurrences?: number }>;
  total?: number;
  occurrences?: number;
  last24h?: number;
  [key: string]: any;
}

/** mapMetricRow output (platform_health_metrics, camelCase). */
export interface CentralDeviceMetric {
  id: string;
  tenantId?: string | null;
  tenantName?: string | null;
  deviceId?: string | null;
  deviceName?: string | null;
  metricName?: string | null;
  metricValue?: number | null;
  metricUnit?: string | null;
  status?: string | null;
  details?: any;
  recordedAt?: string | null;
  [key: string]: any;
}

/** Latest metric value reported by a single device (keyed by metric name). */
export interface CentralDeviceLatestMetrics {
  [metricName: string]: {
    value?: number | null;
    unit?: string | null;
    status?: string | null;
    recordedAt?: string | null;
  };
}

/** Device row inside the aggregated health payload. */
export interface CentralHealthDeviceRow {
  id: string;
  tenantId?: string | null;
  tenantName?: string | null;
  name?: string | null;
  hardwareId?: string | null;
  status?: string | null;
  lastSeenAt?: string | null;
  appVersion?: string | null;
  os?: string | null;
  metrics?: CentralDeviceLatestMetrics;
  [key: string]: any;
}

/** GET /admin/monitoring/health aggregate payload. */
export interface CentralMonitoringHealth {
  generatedAt?: string;
  server?: {
    uptimeSeconds?: number;
    nodeVersion?: string;
    dbSizeMb?: number;
    dbLatencyMs?: number;
    tableCount?: number;
    [key: string]: any;
  };
  devices?: {
    total?: number;
    byStatus?: Record<string, number>;
    onlineCount?: number;
    staleCount?: number;
    rows?: CentralHealthDeviceRow[];
    [key: string]: any;
  };
  errors?: CentralErrorReportsSummary;
  jobs?: {
    total?: number;
    byStatus?: Record<string, number>;
    failedLast24h?: number;
    [key: string]: any;
  };
  backups?: {
    total?: number;
    byStatus?: Record<string, number>;
    latest?: {
      id?: string;
      name?: string | null;
      type?: string | null;
      status?: string | null;
      triggerSource?: string | null;
      createdAt?: string | null;
      completedAt?: string | null;
      sizeBytes?: number | null;
      error?: string | null;
      [key: string]: any;
    } | null;
    [key: string]: any;
  };
  metrics?: CentralDeviceMetric[];
  [key: string]: any;
}

/** GET /admin/security/overview payload (raw counters, NOT PlatformCentralSecurityOverview). */
export interface CentralSecurityOverviewStats {
  events24h?: Array<{ severity?: string | null; count?: number | null }>;
  activeApiKeys?: number;
  activeSessions?: number;
  failedLogins24h?: number;
  [key: string]: any;
}

/** Raw `platform_security_events` row (snake_case; columns vary by event type). */
export interface CentralSecurityEventRow {
  id: string;
  event_type?: string | null;
  severity?: string | null;
  title?: string | null;
  description?: string | null;
  source_ip?: string | null;
  tenant_id?: string | null;
  staff_id?: string | null;
  metadata?: any;
  created_at?: string | null;
  [key: string]: any;
}

/** Raw `platform_sync_events` row (snake_case). */
export interface CentralSyncEventRow {
  id: string;
  tenant_id?: string | null;
  device_id?: string | null;
  event_type?: string | null;
  status?: string | null;
  payload?: any;
  error?: string | null;
  created_at?: string | null;
  [key: string]: any;
}

/** GET /admin/sync/status payload. */
export interface CentralSyncStatusSummary {
  pending?: number;
  processing?: number;
  completed?: number;
  failed?: number;
  [key: string]: any;
}

/** GET /admin/security/api-keys row (selected columns, snake_case). */
export interface CentralApiKeyRow {
  id: string;
  name?: string | null;
  prefix?: string | null;
  scopes?: any;
  is_active?: number | boolean | null;
  last_used_at?: string | null;
  expires_at?: string | null;
  created_at?: string | null;
  revoked_at?: string | null;
  [key: string]: any;
}

/** POST /admin/security/api-keys → row + one-time plaintext `key`. */
export interface CentralApiKeyCreated extends CentralApiKeyRow {
  key?: string;
}

/** GET /admin/security/signing-keys row (camelCase aliases via SQL AS). */
export interface CentralSigningKeyRow {
  id: string;
  keyId?: string | null;
  isActive?: number | boolean | null;
  createdAt?: string | null;
  expiresAt?: string | null;
  [key: string]: any;
}

/** GET /admin/security/signing-keys payload. */
export interface CentralSigningKeysPayload {
  keys: CentralSigningKeyRow[];
  currentKeyId: string | null;
  [key: string]: any;
}

/** Raw `platform_ip_bans` row (snake_case). */
export interface CentralIpBanRow {
  id: string;
  ip_address?: string | null;
  reason?: string | null;
  is_active?: number | boolean | null;
  expires_at?: string | null;
  banned_by?: string | null;
  banned_by_name?: string | null;
  lifted_at?: string | null;
  lifted_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: any;
}

// ─── Unified users hub (/admin/admin-control/users/*) ───────────────────────
// Mapped client-side to the shared Platform* types; these describe the raw
// snake_case wire rows so the mappers stay honest about the contract.

export type {
  PlatformUsersOverview,
  PlatformUsersSearchResults,
  PlatformTenantUserDetail,
  PlatformStaffUserDetail,
  PlatformUserAuditEvent,
  PlatformTenantUserJob,
  PlatformStaffPermissionEntry,
  PlatformStaffLoginEntry,
} from '../platformTypes';
