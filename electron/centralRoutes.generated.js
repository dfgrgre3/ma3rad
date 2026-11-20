/**
 * GENERATED FILE — do not edit by hand.
 * Source: central-server/routeManifest.js
 * Regenerate with: node central-server/scripts/generate-routes.mjs
 *
 * 179 allowlisted endpoint pattern(s).
 */

const ROUTE_DEFINITIONS = [
  {
    "pattern": "/api/v1/health",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/configuration/public-key",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/auth/login",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/auth/me",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/auth/logout",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/auth/refresh",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/auth/effective",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/auth/mfa/setup",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/auth/mfa/verify",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/auth/mfa/disable",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/staff",
    "methods": [
      "GET",
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/roles",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/roles/:code/permissions",
    "methods": [
      "GET",
      "PUT"
    ]
  },
  {
    "pattern": "/api/v1/admin/permissions/catalog",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/tenants",
    "methods": [
      "GET",
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/tenants/:id",
    "methods": [
      "GET",
      "PUT"
    ]
  },
  {
    "pattern": "/api/v1/admin/tenants/:id/status",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/tenants/:id/archive",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/tenants/:id/profile",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/tenants/:id/account",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/tenants/:id/account/reset-password",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/tenants/:id/account/status",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/tenants/:id/users",
    "methods": [
      "GET",
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/tenants/:id/users/:userId",
    "methods": [
      "PUT",
      "DELETE"
    ]
  },
  {
    "pattern": "/api/v1/admin/tenants/:id/users/:userId/status",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/tenants/:id/users/:userId/resend-invite",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/tenants/:id/overrides",
    "methods": [
      "GET",
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/tenants/:id/overrides/:overrideId",
    "methods": [
      "DELETE"
    ]
  },
  {
    "pattern": "/api/v1/admin/tenants/:id/payments",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/tenants/:id/remote",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/tenants/:id/remote/config",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/tenants/:id/remote/sync",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/tenants/:id/branches",
    "methods": [
      "GET",
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/tenants/:id/branches/:branchId",
    "methods": [
      "PUT",
      "DELETE"
    ]
  },
  {
    "pattern": "/api/v1/admin/plans",
    "methods": [
      "GET",
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/plans/:id",
    "methods": [
      "PUT"
    ]
  },
  {
    "pattern": "/api/v1/admin/subscriptions",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/subscriptions/:tenantId/renew",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/subscriptions/:tenantId/cancel",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/subscriptions/:tenantId/change-plan",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/licenses",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/licenses/issue",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/licenses/:id/renew",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/licenses/:id/suspend",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/licenses/:id/reactivate",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/licenses/:id/revoke",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/licenses/:id/transfer",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/licenses/:id/coupling",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/devices",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/devices/:id/suspend",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/devices/:id/release",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/devices/:id/revoke",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/devices/:id/credential",
    "methods": [
      "PUT"
    ]
  },
  {
    "pattern": "/api/v1/admin/devices/detect-clones",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/audit",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/audit/verify",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/audit/:id",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/billing/invoices",
    "methods": [
      "GET",
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/billing/invoices/:id",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/billing/invoices/:id/status",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/billing/invoices/:id/void",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/billing/payments",
    "methods": [
      "GET",
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/billing/payments/:id",
    "methods": [
      "DELETE"
    ]
  },
  {
    "pattern": "/api/v1/admin/operations/jobs",
    "methods": [
      "GET",
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/operations/jobs/:id/cancel",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/operations/jobs/:id/retry",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/operations/usage",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/operations/usage/:tenantId",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/integrations/webhooks",
    "methods": [
      "GET",
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/integrations/webhooks/:id",
    "methods": [
      "PUT",
      "DELETE"
    ]
  },
  {
    "pattern": "/api/v1/admin/integrations/webhooks/:id/test",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/notifications/templates",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/notifications",
    "methods": [
      "GET",
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/backups",
    "methods": [
      "GET",
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/backups/restores",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/backups/:id",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/backups/:id/download",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/backups/:id/restore",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/app-backups",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/app-backups/:id",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/app-backups/:id/restore",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/app-backups/:id/restore/cancel",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/support",
    "methods": [
      "GET",
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/support/:id",
    "methods": [
      "GET",
      "PUT",
      "DELETE"
    ]
  },
  {
    "pattern": "/api/v1/admin/support/:id/messages",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/support/:id/remote-access/request",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/support/:id/remote-access/approve",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/support/:id/remote-access/start",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/support/remote-sessions/:sessionId/end",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/support/:id/remote-sessions",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/monitoring/errors",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/monitoring/errors/summary",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/monitoring/errors/:id/acknowledge",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/monitoring/errors/:id/resolve",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/monitoring/errors/:id/ignore",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/monitoring/errors/:id/reopen",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/releases",
    "methods": [
      "GET",
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/releases/:id",
    "methods": [
      "PUT",
      "DELETE"
    ]
  },
  {
    "pattern": "/api/v1/admin/releases/:id/publish",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/releases/:id/rollback",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/policies",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/config/feature-permissions",
    "methods": [
      "GET",
      "PUT"
    ]
  },
  {
    "pattern": "/api/v1/admin/overview",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/billing/payments",
    "methods": [
      "GET",
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/settings",
    "methods": [
      "GET",
      "PUT"
    ]
  },
  {
    "pattern": "/api/v1/admin/modules",
    "methods": [
      "GET",
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/modules/:id",
    "methods": [
      "PUT"
    ]
  },
  {
    "pattern": "/api/v1/admin/feature-flags",
    "methods": [
      "GET",
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/feature-flags/:id",
    "methods": [
      "PUT",
      "DELETE"
    ]
  },
  {
    "pattern": "/api/v1/admin/staff/sessions",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/staff/sessions/:id",
    "methods": [
      "DELETE"
    ]
  },
  {
    "pattern": "/api/v1/admin/staff/devices",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/staff/devices/:id",
    "methods": [
      "DELETE"
    ]
  },
  {
    "pattern": "/api/v1/admin/staff/invites",
    "methods": [
      "GET",
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/staff/invites/:id",
    "methods": [
      "DELETE"
    ]
  },
  {
    "pattern": "/api/v1/admin/security/overview",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/security/events",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/security/api-keys",
    "methods": [
      "GET",
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/security/api-keys/:id",
    "methods": [
      "DELETE"
    ]
  },
  {
    "pattern": "/api/v1/admin/security/signing-keys",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/security/signing-keys/rotate",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/security/ip-bans",
    "methods": [
      "GET",
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/security/ip-bans/:id/lift",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/analytics/events",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/analytics/summary",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/emergency/events",
    "methods": [
      "GET",
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/emergency/events/:id",
    "methods": [
      "PUT"
    ]
  },
  {
    "pattern": "/api/v1/admin/sync/events",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/sync/status",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/branding",
    "methods": [
      "GET",
      "PUT"
    ]
  },
  {
    "pattern": "/api/v1/admin/customization",
    "methods": [
      "GET",
      "PUT"
    ]
  },
  {
    "pattern": "/api/v1/admin/app-config",
    "methods": [
      "GET",
      "PUT"
    ]
  },
  {
    "pattern": "/api/v1/admin/activity-settings",
    "methods": [
      "GET",
      "PUT"
    ]
  },
  {
    "pattern": "/api/v1/admin/integrations/providers",
    "methods": [
      "GET",
      "PUT"
    ]
  },
  {
    "pattern": "/api/v1/admin/admin-control/actions",
    "methods": [
      "GET",
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/system-health",
    "methods": [
      "GET",
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/config/permission-limits",
    "methods": [
      "GET",
      "PUT"
    ]
  },
  {
    "pattern": "/api/v1/admin/analytics/business-performance",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/analytics/customer-metrics",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/analytics/license-metrics",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/analytics/subscription-metrics",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/analytics/operations-metrics",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/branding/tenant/:tenantId",
    "methods": [
      "GET",
      "PUT"
    ]
  },
  {
    "pattern": "/api/v1/admin/branding/platform",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/branding/tenant/:tenantId/versions",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/branding/tenant/:tenantId/rollback/:version",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/customization/ui-profiles",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/customization/tenant/:tenantId",
    "methods": [
      "GET",
      "PUT"
    ]
  },
  {
    "pattern": "/api/v1/admin/customization/tenant/:tenantId/versions",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/customization/tenant/:tenantId/rollback/:version",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/app-config/templates",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/app-config/rollouts",
    "methods": [
      "GET",
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/app-config/rollouts/:id/start",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/app-config/tenant/:tenantId",
    "methods": [
      "GET",
      "PUT"
    ]
  },
  {
    "pattern": "/api/v1/admin/app-config/tenant/:tenantId/versions",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/app-config/tenant/:tenantId/rollback/:version",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/app-config/rollouts/:id/acks",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/activity/tenant/:tenantId",
    "methods": [
      "GET",
      "PUT"
    ]
  },
  {
    "pattern": "/api/v1/admin/activity/tenant/:tenantId/versions",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/activity/tenant/:tenantId/rollback/:version",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/admin-control/staff",
    "methods": [
      "GET",
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/admin-control/staff/:id",
    "methods": [
      "PUT",
      "DELETE"
    ]
  },
  {
    "pattern": "/api/v1/admin/admin-control/staff-roles",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/admin-control/tenant-users/:tenantId",
    "methods": [
      "GET",
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/admin/admin-control/tenant-users/:tenantId/:userId",
    "methods": [
      "PUT",
      "DELETE"
    ]
  },
  {
    "pattern": "/api/v1/licensing/activate",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/licensing/validate",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/licensing/heartbeat",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/configuration/establishment",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/configuration/current",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/telemetry/errors",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/releases",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/modules/catalog",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/modules/:moduleId/:version/files/:name",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/device/backups",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/device/backups/pending-restore",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/device/backups/upload",
    "methods": [
      "POST"
    ]
  },
  {
    "pattern": "/api/v1/device/backups/:id/download",
    "methods": [
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/device/backups/:id/restore-result",
    "methods": [
      "POST"
    ]
  }
];

module.exports = { ROUTE_DEFINITIONS };
