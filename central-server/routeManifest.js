'use strict';

/**
 * Central API route manifest — the single source of truth for the route
 * allowlist enforced by the Electron bridge (electron/centralApi.js).
 *
 * - `serverMethods` must exist on the central server. The generator fails if a
 *   declared route is missing or if a server route is not declared here.
 * - `clientOnlyMethods` are endpoints owned by other services (licensing,
 *   deployment configuration, telemetry, releases) that the desktop app is
 *   allowed to call through the bridge.
 *
 * Regenerate with: node central-server/scripts/generate-routes.mjs
 */

const route = (pattern, serverMethods, permission, clientOnlyMethods = []) => {
  const definition = { pattern, serverMethods, permission };
  if (clientOnlyMethods.length) definition.clientOnlyMethods = clientOnlyMethods;
  return definition;
};

const ROUTE_MANIFEST = [
  // ── Public / unauthenticated ──────────────────────────────────────────────
  route('/api/v1/health', ['GET'], null),
  route('/api/v1/configuration/public-key', ['GET'], null),

  // ── Platform authentication ───────────────────────────────────────────────
  route('/api/v1/admin/auth/login', ['POST'], null),
  route('/api/v1/admin/auth/me', ['GET'], null),
  route('/api/v1/admin/auth/logout', ['POST'], null),
  route('/api/v1/admin/auth/refresh', ['POST'], null),
  route('/api/v1/admin/auth/effective', ['GET'], null),
  route('/api/v1/admin/auth/mfa/setup', ['POST'], null),
  route('/api/v1/admin/auth/mfa/verify', ['POST'], null),
  route('/api/v1/admin/auth/mfa/disable', ['POST'], null),

  // ── Staff ─────────────────────────────────────────────────────────────────
  route('/api/v1/admin/staff', ['GET', 'POST'], {
    GET: ['staff:read', 'platform.staff.view'],
    POST: ['staff:manage', 'platform.staff.create'],
  }),
  route('/api/v1/admin/roles', ['GET'], {
    GET: ['platform.staff.view', 'platform.staff.manage_permissions'],
  }),
  route('/api/v1/admin/roles/:code/permissions', ['GET', 'PUT'], {
    GET: ['platform.staff.view', 'platform.staff.manage_permissions'],
    PUT: ['platform.staff.manage_permissions'],
  }),
  route('/api/v1/admin/permissions/catalog', ['GET'], {
    GET: ['platform.staff.view', 'platform.staff.manage_permissions'],
  }),

  // ── Tenants ───────────────────────────────────────────────────────────────
  route('/api/v1/admin/tenants', ['GET', 'POST'], {
    GET: ['platform.tenants.view', 'platform.tenants.manage'],
    POST: ['platform.tenants.create', 'platform.tenants.manage'],
  }),
  route('/api/v1/admin/tenants/:id', ['GET', 'PUT'], {
    GET: ['platform.tenants.view', 'platform.tenants.manage'],
    PUT: ['platform.tenants.update', 'platform.tenants.manage'],
  }),
  route('/api/v1/admin/tenants/:id/status', ['POST'], {
    POST: ['platform.tenants.update', 'platform.tenants.manage'],
  }),
  route('/api/v1/admin/tenants/:id/archive', ['POST'], {
    POST: ['platform.tenants.delete', 'platform.tenants.manage'],
  }),
  route('/api/v1/admin/tenants/:id/profile', ['GET'], {
    GET: ['platform.tenants.view', 'platform.tenants.manage'],
  }),
  route('/api/v1/admin/tenants/:id/account', ['POST', 'PUT'], {
    POST: ['platform.tenants.update', 'platform.tenants.manage'],
    PUT: ['platform.tenants.update', 'platform.tenants.manage'],
  }),
  route('/api/v1/admin/tenants/:id/account/reset-password', ['POST'], {
    POST: ['platform.tenants.update', 'platform.tenants.manage'],
  }),
  route('/api/v1/admin/tenants/:id/account/status', ['POST'], {
    POST: ['platform.tenants.update', 'platform.tenants.manage'],
  }),
  route('/api/v1/admin/tenants/:id/users', ['GET', 'POST'], {
    GET: ['platform.tenants.view', 'platform.tenants.manage'],
    POST: ['platform.tenants.update', 'platform.tenants.manage'],
  }),
  route('/api/v1/admin/tenants/:id/users/:userId', ['PUT', 'DELETE'], {
    PUT: ['platform.tenants.update', 'platform.tenants.manage'],
    DELETE: ['platform.tenants.update', 'platform.tenants.manage'],
  }),
  route('/api/v1/admin/tenants/:id/users/:userId/status', ['POST'], {
    POST: ['platform.tenants.update', 'platform.tenants.manage'],
  }),
  route('/api/v1/admin/tenants/:id/users/:userId/resend-invite', ['POST'], {
    POST: ['platform.tenants.update', 'platform.tenants.manage'],
  }),
  route('/api/v1/admin/tenants/:id/overrides', ['GET', 'POST'], {
    GET: ['platform.tenants.view', 'platform.tenants.manage'],
    POST: ['platform.tenants.update', 'platform.tenants.manage'],
  }),
  route('/api/v1/admin/tenants/:id/overrides/:overrideId', ['DELETE'], {
    DELETE: ['platform.tenants.update', 'platform.tenants.manage'],
  }),
  route('/api/v1/admin/tenants/:id/payments', ['POST'], {
    POST: ['platform.billing.create', 'platform.billing.manage', 'platform.tenants.update'],
  }),
  route('/api/v1/admin/tenants/:id/remote', ['GET'], {
    GET: ['platform.tenants.view', 'platform.tenants.manage'],
  }),
  route('/api/v1/admin/tenants/:id/remote/config', ['POST'], {
    POST: ['platform.tenants.update', 'platform.tenants.manage'],
  }),
  route('/api/v1/admin/tenants/:id/remote/sync', ['POST'], {
    POST: ['platform.tenants.update', 'platform.tenants.manage'],
  }),
  route('/api/v1/admin/tenants/:id/branches', ['GET', 'POST'], {
    GET: ['platform.tenants.view', 'platform.tenants.manage'],
    POST: ['platform.tenants.update', 'platform.tenants.manage'],
  }),
  route('/api/v1/admin/tenants/:id/branches/:branchId', ['PUT', 'DELETE'], {
    PUT: ['platform.tenants.update', 'platform.tenants.manage'],
    DELETE: ['platform.tenants.update', 'platform.tenants.manage'],
  }),
  route('/api/v1/admin/tenants/:id/api-keys', ['GET', 'POST'], {
    GET: ['platform.tenants.view', 'platform.tenants.manage'],
    POST: ['platform.tenants.update', 'platform.tenants.manage'],
  }),
  route('/api/v1/admin/tenants/:id/api-keys/:keyId', ['DELETE'], {
    DELETE: ['platform.tenants.update', 'platform.tenants.manage'],
  }),

  // ── Plans ─────────────────────────────────────────────────────────────────
  route('/api/v1/admin/plans', ['GET', 'POST'], {
    GET: ['platform.plans.view', 'platform.plans.manage'],
    POST: ['platform.plans.create', 'platform.plans.manage', 'platform.plans.update'],
  }),
  route('/api/v1/admin/plans/upgrade-rules', ['GET', 'PUT'], {
    GET: ['platform.plans.view', 'platform.plans.manage'],
    PUT: ['platform.plans.update', 'platform.plans.manage'],
  }),
  route('/api/v1/admin/plans/:id', ['GET', 'PUT', 'DELETE'], {
    GET: ['platform.plans.view', 'platform.plans.manage'],
    PUT: ['platform.plans.update', 'platform.plans.manage'],
    DELETE: ['platform.plans.delete', 'platform.plans.manage'],
  }),
  route('/api/v1/admin/plans/:id/subscribers', ['GET'], {
    GET: ['platform.plans.view', 'platform.plans.manage'],
  }),
  route('/api/v1/admin/plans/:id/versions', ['GET'], {
    GET: ['platform.plans.view', 'platform.plans.manage'],
  }),
  route('/api/v1/admin/plans/:id/price-history', ['GET'], {
    GET: ['platform.plans.view', 'platform.plans.manage'],
  }),
  route('/api/v1/admin/plans/:id/deactivation-check', ['GET'], {
    GET: ['platform.plans.view', 'platform.plans.manage'],
  }),
  route('/api/v1/admin/plans/:id/impact-preview', ['POST'], {
    POST: ['platform.plans.view', 'platform.plans.manage'],
  }),
  route('/api/v1/admin/plans/:id/copy', ['POST'], {
    POST: ['platform.plans.create', 'platform.plans.manage', 'platform.plans.update'],
  }),

  // ── Subscriptions ──────────────────────────────────────────────────────────
  route('/api/v1/admin/subscriptions', ['GET', 'POST'], {
    GET: ['platform.subscriptions.view'],
    POST: ['platform.subscriptions.create', 'platform.subscriptions.manage', 'platform.subscriptions.update'],
  }),
  route('/api/v1/admin/subscriptions/trial', ['POST'], {
    POST: ['platform.subscriptions.create', 'platform.subscriptions.manage', 'platform.subscriptions.update'],
  }),
  route('/api/v1/admin/subscriptions/:tenantId', ['PATCH'], {
    PATCH: ['platform.subscriptions.update', 'platform.subscriptions.manage'],
  }),
  route('/api/v1/admin/subscriptions/:tenantId/history', ['GET'], {
    GET: ['platform.subscriptions.view'],
  }),
  route('/api/v1/admin/subscriptions/:tenantId/renew', ['POST'], {
    POST: ['platform.subscriptions.update'],
  }),
  route('/api/v1/admin/subscriptions/:tenantId/cancel', ['POST'], {
    POST: ['platform.subscriptions.delete'],
  }),
  route('/api/v1/admin/subscriptions/:tenantId/change-plan', ['POST'], {
    POST: ['platform.subscriptions.update'],
  }),
  route('/api/v1/admin/subscriptions/:tenantId/suspend', ['POST'], {
    POST: ['platform.subscriptions.update', 'platform.subscriptions.manage'],
  }),
  route('/api/v1/admin/subscriptions/:tenantId/resume', ['POST'], {
    POST: ['platform.subscriptions.update', 'platform.subscriptions.manage'],
  }),

  // ── Licenses ──────────────────────────────────────────────────────────────
  route('/api/v1/admin/licenses', ['GET'], {
    GET: ['platform.licenses.view', 'platform.licenses.manage'],
  }),
  route('/api/v1/admin/licenses/issue', ['POST'], {
    POST: ['platform.licenses.create', 'platform.licenses.manage'],
  }),
  route('/api/v1/admin/licenses/:id', ['GET', 'PATCH'], {
    GET: ['platform.licenses.view', 'platform.licenses.manage'],
    PATCH: ['platform.licenses.update', 'platform.licenses.manage'],
  }),
  route('/api/v1/admin/licenses/:id/activations', ['GET'], {
    GET: ['platform.licenses.view', 'platform.licenses.manage'],
  }),
  route('/api/v1/admin/licenses/:id/changes', ['GET'], {
    GET: ['platform.licenses.view', 'platform.licenses.manage'],
  }),
  route('/api/v1/admin/licenses/:id/renew', ['POST'], {
    POST: ['platform.licenses.update', 'platform.licenses.manage'],
  }),
  route('/api/v1/admin/licenses/:id/suspend', ['POST'], {
    POST: ['platform.licenses.update', 'platform.licenses.manage'],
  }),
  route('/api/v1/admin/licenses/:id/reactivate', ['POST'], {
    POST: ['platform.licenses.update', 'platform.licenses.manage'],
  }),
  route('/api/v1/admin/licenses/:id/revoke', ['POST'], {
    POST: ['platform.licenses.delete', 'platform.licenses.manage'],
  }),
  route('/api/v1/admin/licenses/:id/transfer', ['POST'], {
    POST: ['platform.licenses.update', 'platform.licenses.manage'],
  }),
  route('/api/v1/admin/licenses/:id/coupling', ['POST'], {
    POST: ['platform.licenses.update', 'platform.licenses.manage'],
  }),

  // ── Devices ───────────────────────────────────────────────────────────────
  route('/api/v1/admin/devices', ['GET'], {
    GET: ['platform.devices.view'],
  }),
  route('/api/v1/admin/devices/:id/activate', ['POST'], {
    POST: ['platform.devices.update'],
  }),
  route('/api/v1/admin/devices/:id/suspend', ['POST'], {
    POST: ['platform.devices.update'],
  }),
  route('/api/v1/admin/devices/:id/release', ['POST'], {
    POST: ['platform.devices.update'],
  }),
  route('/api/v1/admin/devices/:id/revoke', ['POST'], {
    POST: ['platform.devices.update'],
  }),
  route('/api/v1/admin/devices/:id/reassign', ['POST'], {
    POST: ['platform.devices.update'],
  }),
  route('/api/v1/admin/devices/:id/clone-flag', ['POST'], {
    POST: ['platform.devices.update'],
  }),
  route('/api/v1/admin/devices/:id', ['DELETE'], {
    DELETE: ['platform.devices.update', 'platform.devices.manage'],
  }),
  route('/api/v1/admin/devices/:id/credential', ['PUT'], {
    PUT: ['platform.devices.update'],
  }),
  route('/api/v1/admin/devices/detect-clones', ['POST'], {
    POST: ['platform.devices.view', 'platform.devices.update'],
  }),

  // ── Audit ─────────────────────────────────────────────────────────────────
  route('/api/v1/admin/audit', ['GET'], {
    GET: ['platform.audit.view'],
  }),
  route('/api/v1/admin/audit/verify', ['GET'], {
    GET: ['platform.audit.view'],
  }),
  route('/api/v1/admin/audit/:id', ['GET'], {
    GET: ['platform.audit.view'],
  }),

  // ── Billing ─────────────────────────────────────────────────────────────────
  route('/api/v1/admin/billing/invoices', ['GET', 'POST'], {
    GET: ['platform.billing.view', 'platform.billing.manage'],
    POST: ['platform.billing.create', 'platform.billing.manage'],
  }),
  route('/api/v1/admin/billing/invoices/:id', ['GET'], {
    GET: ['platform.billing.view', 'platform.billing.manage'],
  }),
  route('/api/v1/admin/billing/invoices/:id/status', ['POST'], {
    POST: ['platform.billing.update', 'platform.billing.manage'],
  }),
  route('/api/v1/admin/billing/invoices/:id/void', ['POST'], {
    POST: ['platform.billing.delete', 'platform.billing.manage'],
  }),
  route('/api/v1/admin/billing/payments', ['GET', 'POST'], {
    GET: ['platform.billing.view', 'platform.billing.manage'],
    POST: ['platform.billing.create', 'platform.billing.approve', 'platform.billing.manage'],
  }),
  route('/api/v1/admin/billing/payments/:id', ['DELETE'], {
    DELETE: ['platform.billing.delete', 'platform.billing.manage'],
  }),

  // ── Operations ─────────────────────────────────────────────────────────────
  route('/api/v1/admin/operations/jobs', ['GET', 'POST'], {
    GET: ['platform.operations.view'],
    POST: ['platform.operations.create', 'platform.operations.approve'],
  }),
  route('/api/v1/admin/operations/jobs/:id/cancel', ['POST'], {
    POST: ['platform.operations.update', 'platform.operations.approve'],
  }),
  route('/api/v1/admin/operations/jobs/:id/retry', ['POST'], {
    POST: ['platform.operations.update', 'platform.operations.approve'],
  }),
  route('/api/v1/admin/operations/usage', ['GET'], {
    GET: ['platform.operations.view', 'platform.platform-health.view', 'platform.tenants.view'],
  }),
  route('/api/v1/admin/operations/usage/:tenantId', ['GET'], {
    GET: ['platform.operations.view', 'platform.platform-health.view', 'platform.tenants.view'],
  }),
  route('/api/v1/admin/operations/maintenance-windows', ['GET', 'POST'], {
    GET: ['platform.operations.view'],
    POST: ['platform.operations.create', 'platform.operations.update'],
  }),
  route('/api/v1/admin/operations/maintenance-windows/:id/cancel', ['POST'], {
    POST: ['platform.operations.update'],
  }),

  // ── Integrations ───────────────────────────────────────────────────────────
  route('/api/v1/admin/integrations/webhooks', ['GET', 'POST'], {
    GET: ['platform.integrations.view'],
    POST: ['platform.integrations.create', 'platform.integrations.manage'],
  }),
  route('/api/v1/admin/integrations/webhooks/:id', ['PUT', 'DELETE'], {
    PUT: ['platform.integrations.update', 'platform.integrations.manage'],
    DELETE: ['platform.integrations.delete', 'platform.integrations.manage'],
  }),
  route('/api/v1/admin/integrations/webhooks/:id/test', ['POST'], {
    POST: ['platform.integrations.update', 'platform.integrations.manage'],
  }),

  // ── Notifications ──────────────────────────────────────────────────────────
  route('/api/v1/admin/notifications/templates', ['GET'], {
    GET: ['platform.notifications.view'],
  }),
  route('/api/v1/admin/notifications', ['GET', 'POST'], {
    GET: ['platform.notifications.view'],
    POST: ['platform.notifications.update'],
  }),

  // ── Backups ─────────────────────────────────────────────────────────────────
  route('/api/v1/admin/backups', ['GET', 'POST'], {
    GET: ['platform.backups.view'],
    POST: ['platform.backups.create', 'platform.backups.approve'],
  }),
  route('/api/v1/admin/backups/restores', ['GET'], {
    GET: ['platform.backups.view'],
  }),
  route('/api/v1/admin/backups/:id', ['GET'], {
    GET: ['platform.backups.view'],
  }),
  route('/api/v1/admin/backups/:id/download', ['GET'], {
    GET: ['platform.backups.view'],
  }),
  route('/api/v1/admin/backups/:id/restore', ['POST'], {
    POST: ['platform.backups.restore', 'platform.backups.approve'],
  }),

  // ── Application (ERP) backups — opaque encrypted device snapshots ─────────
  route('/api/v1/admin/app-backups', ['GET'], {
    GET: ['platform.backups.view'],
  }),
  route('/api/v1/admin/app-backups/:id', ['GET'], {
    GET: ['platform.backups.view'],
  }),
  route('/api/v1/admin/app-backups/:id/restore', ['POST'], {
    POST: ['platform.backups.restore', 'platform.backups.approve'],
  }),
  route('/api/v1/admin/app-backups/:id/restore/cancel', ['POST'], {
    POST: ['platform.backups.restore', 'platform.backups.approve'],
  }),

  // ── Support portal ──────────────────────────────────────────────────────────
  route('/api/v1/admin/support', ['GET', 'POST'], {
    GET: ['platform.support.view'],
    POST: ['platform.support.create', 'platform.support.update'],
  }),
  route('/api/v1/admin/support/:id', ['GET', 'PUT', 'DELETE'], {
    GET: ['platform.support.view'],
    PUT: ['platform.support.update'],
    DELETE: ['platform.support.delete'],
  }),
  route('/api/v1/admin/support/:id/messages', ['POST'], {
    POST: ['platform.support.update'],
  }),
  route('/api/v1/admin/support/:id/remote-access/request', ['POST'], {
    POST: ['platform.support.update'],
  }),
  route('/api/v1/admin/support/:id/remote-access/approve', ['POST'], {
    POST: ['platform.support.update'],
  }),
  route('/api/v1/admin/support/:id/remote-access/start', ['POST'], {
    POST: ['platform.support.update'],
  }),
  route('/api/v1/admin/support/remote-sessions/:sessionId/end', ['POST'], {
    POST: ['platform.support.update'],
  }),
  route('/api/v1/admin/support/:id/remote-sessions', ['GET'], {
    GET: ['platform.support.view'],
  }),
  route('/api/v1/admin/support/tickets/:id/rating', ['POST'], {
    POST: ['platform.support.update'],
  }),

  // ── Error monitoring ────────────────────────────────────────────────────────
  route('/api/v1/admin/monitoring/errors', ['GET'], {
    GET: ['platform.platform-health.view', 'platform.operations.view', 'platform.system-health.view'],
  }),
  route('/api/v1/admin/monitoring/errors/summary', ['GET'], {
    GET: ['platform.platform-health.view', 'platform.operations.view', 'platform.system-health.view'],
  }),
  route('/api/v1/admin/monitoring/errors/:id/acknowledge', ['POST'], {
    POST: ['platform.platform-health.update', 'platform.operations.update', 'platform.system-health.update'],
  }),
  route('/api/v1/admin/monitoring/errors/:id/resolve', ['POST'], {
    POST: ['platform.platform-health.update', 'platform.operations.update', 'platform.system-health.update'],
  }),
  route('/api/v1/admin/monitoring/errors/:id/ignore', ['POST'], {
    POST: ['platform.platform-health.update', 'platform.operations.update', 'platform.system-health.update'],
  }),
  route('/api/v1/admin/monitoring/errors/:id/reopen', ['POST'], {
    POST: ['platform.platform-health.update', 'platform.operations.update', 'platform.system-health.update'],
  }),
  route('/api/v1/admin/monitoring/health', ['GET'], {
    GET: ['platform.platform-health.view', 'platform.operations.view', 'platform.system-health.view'],
  }),
  route('/api/v1/admin/monitoring/metrics', ['GET'], {
    GET: ['platform.platform-health.view', 'platform.operations.view', 'platform.system-health.view'],
  }),

  // ── Releases & phased rollout ───────────────────────────────────────────────
  route('/api/v1/admin/releases', ['GET', 'POST'], {
    GET: ['platform.releases.view'],
    POST: ['platform.releases.create'],
  }),
  route('/api/v1/admin/releases/:id', ['PUT', 'DELETE'], {
    PUT: ['platform.releases.update'],
    DELETE: ['platform.releases.delete'],
  }),
  route('/api/v1/admin/releases/:id/publish', ['POST'], {
    POST: ['platform.releases.approve', 'platform.releases.update'],
  }),
  route('/api/v1/admin/releases/:id/rollback', ['POST'], {
    POST: ['platform.releases.approve', 'platform.releases.update'],
  }),
  route('/api/v1/admin/releases/:id/targets', ['GET', 'PUT'], {
    GET: ['platform.releases.view'],
    PUT: ['platform.releases.update'],
  }),
  route('/api/v1/admin/releases/:id/targets/:tenantId/status', ['POST'], {
    POST: ['platform.releases.update'],
  }),

  // ── Policies & Compliance ──────────────────────────────────────────────────
  route('/api/v1/admin/policies', ['GET'], {
    GET: ['platform.policies.view'],
  }),
  route('/api/v1/admin/policies/documents', ['GET'], {
    GET: ['platform.policies.view'],
  }),
  route('/api/v1/admin/policies/documents/:slug', ['GET', 'PUT'], {
    GET: ['platform.policies.view'],
    PUT: ['platform.policies.update', 'platform.policies.create'],
  }),
  route('/api/v1/admin/policies/documents/:slug/submit', ['POST'], {
    POST: ['platform.policies.update'],
  }),
  route('/api/v1/admin/policies/documents/:slug/approve', ['POST'], {
    POST: ['platform.policies.approve'],
  }),
  route('/api/v1/admin/policies/documents/:slug/reject', ['POST'], {
    POST: ['platform.policies.approve'],
  }),
  route('/api/v1/admin/policies/documents/:slug/versions', ['GET'], {
    GET: ['platform.policies.view'],
  }),
  route('/api/v1/admin/policies/documents/:slug/restore', ['POST'], {
    POST: ['platform.policies.update'],
  }),
  route('/api/v1/admin/policies/retention', ['GET', 'PUT'], {
    GET: ['platform.policies.view'],
    PUT: ['platform.policies.update'],
  }),
  route('/api/v1/admin/policies/export', ['GET'], {
    GET: ['platform.policies.export'],
  }),

  // ── Feature permissions / dynamic app configuration ─────────────────────────
  route('/api/v1/admin/config/feature-permissions', ['GET', 'PUT'], {
    GET: ['platform.app-configuration.view'],
    PUT: ['platform.app-configuration.update', 'platform.settings.update'],
  }),

  // ── Admin Extra (Dashboard, Billing, Settings, Product, Staff, Security, etc.) ──
  route('/api/v1/admin/overview', ['GET'], {
    GET: ['platform.dashboard.view', 'platform.tenants.view'],
  }),
  route('/api/v1/admin/billing/payments', ['GET', 'POST'], {
    GET: ['platform.billing.view', 'platform.billing.manage'],
    POST: ['platform.billing.create', 'platform.billing.manage'],
  }),
  route('/api/v1/admin/settings', ['GET', 'PUT'], {
    GET: ['platform.settings.view', 'platform.settings.manage'],
    PUT: ['platform.settings.update', 'platform.settings.manage'],
  }),
  route('/api/v1/admin/modules', ['GET', 'POST'], {
    GET: ['platform.product.view', 'platform.product.manage'],
    POST: ['platform.product.create', 'platform.product.manage'],
  }),
  route('/api/v1/admin/modules/:id', ['PUT'], {
    PUT: ['platform.product.update', 'platform.product.manage'],
  }),
  route('/api/v1/admin/feature-flags', ['GET', 'POST'], {
    GET: ['platform.product.view', 'platform.product.manage'],
    POST: ['platform.product.create', 'platform.product.manage'],
  }),
  route('/api/v1/admin/feature-flags/:id', ['PUT', 'DELETE'], {
    PUT: ['platform.product.update', 'platform.product.manage'],
    DELETE: ['platform.product.delete', 'platform.product.manage'],
  }),
  route('/api/v1/admin/feature-flags/:id/overrides', ['GET', 'POST'], {
    GET: ['platform.product.view', 'platform.product.manage'],
    POST: ['platform.product.update', 'platform.product.manage'],
  }),
  route('/api/v1/admin/feature-flags/:id/overrides/:overrideId', ['DELETE'], {
    DELETE: ['platform.product.delete', 'platform.product.manage'],
  }),
  route('/api/v1/admin/staff/sessions', ['GET'], {
    GET: ['platform.staff.view', 'platform.staff.manage_sessions'],
  }),
  route('/api/v1/admin/staff/sessions/:id', ['DELETE'], {
    DELETE: ['platform.staff.manage_sessions'],
  }),
  route('/api/v1/admin/staff/devices', ['GET'], {
    GET: ['platform.staff.view', 'platform.staff.manage_devices'],
  }),
  route('/api/v1/admin/staff/devices/:id', ['DELETE'], {
    DELETE: ['platform.staff.manage_devices'],
  }),
  route('/api/v1/admin/staff/invites', ['GET', 'POST'], {
    GET: ['platform.staff.view', 'platform.staff.manage_invites'],
    POST: ['platform.staff.create', 'platform.staff.manage_invites'],
  }),
  route('/api/v1/admin/staff/invites/:id', ['DELETE'], {
    DELETE: ['platform.staff.manage_invites'],
  }),
  route('/api/v1/admin/security/overview', ['GET'], {
    GET: ['platform.security.view', 'platform.security.manage'],
  }),
  route('/api/v1/admin/security/events', ['GET'], {
    GET: ['platform.security.view', 'platform.security.manage'],
  }),
  route('/api/v1/admin/security/api-keys', ['GET', 'POST'], {
    GET: ['platform.security.view', 'platform.security.manage'],
    POST: ['platform.security.create', 'platform.security.manage'],
  }),
  route('/api/v1/admin/security/api-keys/:id', ['DELETE'], {
    DELETE: ['platform.security.delete', 'platform.security.manage'],
  }),
  route('/api/v1/admin/security/signing-keys', ['GET'], {
    GET: ['platform.security.view', 'platform.security.manage'],
  }),
  route('/api/v1/admin/security/signing-keys/rotate', ['POST'], {
    POST: ['platform.security.update', 'platform.security.manage'],
  }),
  route('/api/v1/admin/security/ip-bans', ['GET', 'POST'], {
    GET: ['platform.security.view', 'platform.security.manage'],
    POST: ['platform.security.update', 'platform.security.manage'],
  }),
  route('/api/v1/admin/security/ip-bans/:id/lift', ['POST'], {
    POST: ['platform.security.update', 'platform.security.manage'],
  }),
  route('/api/v1/admin/analytics/events', ['GET'], {
    GET: ['platform.analytics.view', 'platform.analytics.manage'],
  }),
  route('/api/v1/admin/analytics/summary', ['GET'], {
    GET: ['platform.analytics.view', 'platform.analytics.manage'],
  }),
  route('/api/v1/admin/emergency/events', ['GET', 'POST'], {
    GET: ['platform.emergency.view', 'platform.emergency.manage'],
    POST: ['platform.emergency.create', 'platform.emergency.manage'],
  }),
  route('/api/v1/admin/emergency/events/:id', ['PUT'], {
    PUT: ['platform.emergency.update', 'platform.emergency.manage'],
  }),
  route('/api/v1/admin/sync/events', ['GET'], {
    GET: ['platform.sync.view', 'platform.sync.manage'],
  }),
  route('/api/v1/admin/sync/status', ['GET'], {
    GET: ['platform.sync.view', 'platform.sync.manage'],
  }),
  route('/api/v1/admin/branding', ['GET', 'PUT'], {
    GET: ['platform.branding.view', 'platform.branding.manage'],
    PUT: ['platform.branding.update', 'platform.branding.manage'],
  }),
  route('/api/v1/admin/customization', ['GET', 'PUT'], {
    GET: ['platform.customization.view', 'platform.customization.manage'],
    PUT: ['platform.customization.update', 'platform.customization.manage'],
  }),
  route('/api/v1/admin/app-config', ['GET', 'PUT'], {
    GET: ['platform.appconfig.view', 'platform.appconfig.manage'],
    PUT: ['platform.appconfig.update', 'platform.appconfig.manage'],
  }),
  route('/api/v1/admin/activity-settings', ['GET', 'PUT'], {
    GET: ['platform.activity.view', 'platform.activity.manage'],
    PUT: ['platform.activity.update', 'platform.activity.manage'],
  }),
  route('/api/v1/admin/integrations/providers', ['GET', 'PUT'], {
    GET: ['platform.integrations.view', 'platform.integrations.manage'],
    PUT: ['platform.integrations.update', 'platform.integrations.manage'],
  }),
  route('/api/v1/admin/admin-control/actions', ['GET', 'POST'], {
    GET: ['platform.admincontrol.view', 'platform.admincontrol.manage'],
    POST: ['platform.admincontrol.create', 'platform.admincontrol.manage'],
  }),
  route('/api/v1/admin/system-health', ['GET', 'POST'], {
    GET: ['platform.health.view', 'platform.health.manage'],
    POST: ['platform.health.report', 'platform.health.manage'],
  }),
  route('/api/v1/admin/config/permission-limits', ['GET', 'PUT'], {
    GET: ['platform.app-configuration.view'],
    PUT: ['platform.app-configuration.update', 'platform.settings.update'],
  }),

  // ── Complex Analytics Endpoints ─────────────────────────────────────────
  route('/api/v1/admin/analytics/business-performance', ['GET'], {
    GET: ['platform.analytics.view', 'platform.analytics.manage'],
  }),
  route('/api/v1/admin/analytics/customer-metrics', ['GET'], {
    GET: ['platform.analytics.view', 'platform.analytics.manage'],
  }),
  route('/api/v1/admin/analytics/license-metrics', ['GET'], {
    GET: ['platform.analytics.view', 'platform.analytics.manage'],
  }),
  route('/api/v1/admin/analytics/subscription-metrics', ['GET'], {
    GET: ['platform.analytics.view', 'platform.analytics.manage'],
  }),
  route('/api/v1/admin/analytics/operations-metrics', ['GET'], {
    GET: ['platform.analytics.view', 'platform.analytics.manage'],
  }),

  // ── Tenant Branding (versioned) ─────────────────────────────────────────
  route('/api/v1/admin/branding/tenant/:tenantId', ['GET', 'PUT'], {
    GET: ['platform.branding.view', 'platform.branding.manage'],
    PUT: ['platform.branding.update', 'platform.branding.manage'],
  }),
  route('/api/v1/admin/branding/platform', ['GET'], {
    GET: ['platform.branding.view', 'platform.branding.manage'],
  }),
  route('/api/v1/admin/branding/tenant/:tenantId/versions', ['GET'], {
    GET: ['platform.branding.view', 'platform.branding.manage'],
  }),
  route('/api/v1/admin/branding/tenant/:tenantId/rollback/:version', ['POST'], {
    POST: ['platform.branding.update', 'platform.branding.manage'],
  }),

  // ── Tenant UI Customization (versioned) ────────────────────────────────
  route('/api/v1/admin/customization/ui-profiles', ['GET'], {
    GET: ['platform.customization.view', 'platform.customization.manage'],
  }),
  route('/api/v1/admin/customization/tenant/:tenantId', ['GET', 'PUT'], {
    GET: ['platform.customization.view', 'platform.customization.manage'],
    PUT: ['platform.customization.update', 'platform.customization.manage'],
  }),
  route('/api/v1/admin/customization/tenant/:tenantId/versions', ['GET'], {
    GET: ['platform.customization.view', 'platform.customization.manage'],
  }),
  route('/api/v1/admin/customization/tenant/:tenantId/rollback/:version', ['POST'], {
    POST: ['platform.customization.update', 'platform.customization.manage'],
  }),

  // ── Tenant App Configuration (versioned + templates + rollouts) ────────
  route('/api/v1/admin/app-config/templates', ['GET'], {
    GET: ['platform.appconfig.view', 'platform.appconfig.manage'],
  }),
  route('/api/v1/admin/app-config/rollouts', ['GET', 'POST'], {
    GET: ['platform.appconfig.view', 'platform.appconfig.manage'],
    POST: ['platform.appconfig.create', 'platform.appconfig.manage'],
  }),
  route('/api/v1/admin/app-config/rollouts/:id/start', ['POST'], {
    POST: ['platform.appconfig.update', 'platform.appconfig.manage'],
  }),
  route('/api/v1/admin/app-config/tenant/:tenantId', ['GET', 'PUT'], {
    GET: ['platform.appconfig.view', 'platform.appconfig.manage'],
    PUT: ['platform.appconfig.update', 'platform.appconfig.manage'],
  }),
  route('/api/v1/admin/app-config/tenant/:tenantId/versions', ['GET'], {
    GET: ['platform.appconfig.view', 'platform.appconfig.manage'],
  }),
  route('/api/v1/admin/app-config/tenant/:tenantId/rollback/:version', ['POST'], {
    POST: ['platform.appconfig.update', 'platform.appconfig.manage'],
  }),
  route('/api/v1/admin/app-config/rollouts/:id/acks', ['GET'], {
    GET: ['platform.appconfig.view', 'platform.appconfig.manage'],
  }),

  // ── Tenant Activity Settings (versioned) ───────────────────────────────
  route('/api/v1/admin/activity/tenant/:tenantId', ['GET', 'PUT'], {
    GET: ['platform.activity.view', 'platform.activity.manage'],
    PUT: ['platform.activity.update', 'platform.activity.manage'],
  }),
  route('/api/v1/admin/activity/tenant/:tenantId/versions', ['GET'], {
    GET: ['platform.activity.view', 'platform.activity.manage'],
  }),
  route('/api/v1/admin/activity/tenant/:tenantId/rollback/:version', ['POST'], {
    POST: ['platform.activity.update', 'platform.activity.manage'],
  }),

  // ── Admin Control (Staff & Tenant Users) ────────────────────────────────
  route('/api/v1/admin/admin-control/staff', ['GET', 'POST'], {
    GET: ['platform.admincontrol.view', 'platform.admincontrol.manage'],
    POST: ['platform.admincontrol.create', 'platform.admincontrol.manage'],
  }),
  route('/api/v1/admin/admin-control/staff/:id', ['PUT', 'DELETE'], {
    PUT: ['platform.admincontrol.update', 'platform.admincontrol.manage'],
    DELETE: ['platform.admincontrol.delete', 'platform.admincontrol.manage'],
  }),
  route('/api/v1/admin/admin-control/staff-roles', ['GET'], {
    GET: ['platform.admincontrol.view', 'platform.admincontrol.manage'],
  }),
  route('/api/v1/admin/admin-control/tenant-users/:tenantId', ['GET', 'POST'], {
    GET: ['platform.admincontrol.view', 'platform.admincontrol.manage'],
    POST: ['platform.admincontrol.create', 'platform.admincontrol.manage'],
  }),
  route('/api/v1/admin/admin-control/tenant-users/:tenantId/:userId', ['PUT', 'DELETE'], {
    PUT: ['platform.admincontrol.update', 'platform.admincontrol.manage'],
    DELETE: ['platform.admincontrol.delete', 'platform.admincontrol.manage'],
  }),
  // Cross-tenant directory of tenant users with live provisioning status.
  route('/api/v1/admin/tenant-users', ['GET'], {
    GET: ['platform.tenants.view', 'platform.tenants.manage', 'platform.admincontrol.view', 'platform.admincontrol.manage'],
  }),
  // Unified users hub: aggregated overview, cross-type search and per-user detail.
  route('/api/v1/admin/admin-control/users/overview', ['GET'], {
    GET: ['platform.admincontrol.view', 'platform.admincontrol.manage', 'platform.tenants.view'],
  }),
  route('/api/v1/admin/admin-control/users/search', ['GET'], {
    GET: ['platform.admincontrol.view', 'platform.admincontrol.manage', 'platform.tenants.view'],
  }),
  route('/api/v1/admin/admin-control/users/tenant/:userId', ['GET'], {
    GET: ['platform.admincontrol.view', 'platform.admincontrol.manage', 'platform.tenants.view'],
  }),
  route('/api/v1/admin/admin-control/users/staff/:id', ['GET'], {
    GET: ['platform.admincontrol.view', 'platform.admincontrol.manage'],
  }),

  // Device-authenticated tenant-identity provisioning channel (X-Device-Id +
  // X-Device-Credential; tenant resolved from the registered device).
  route('/api/v1/device/provisioning/pending', ['GET'], null),
  route('/api/v1/device/provisioning/:jobId/result', ['POST'], null),
  // Reverse channel: devices report local user mutations to the directory.
  route('/api/v1/device/tenant-users/report', ['POST'], null),

  // Customer-facing read-only API — authenticated by tenant-scoped API keys
  // (Authorization: Bearer pk_...), not by a platform staff session.
  route('/api/v1/tenant/v1/me', ['GET'], null),
  route('/api/v1/tenant/v1/subscription', ['GET'], null),
  route('/api/v1/tenant/v1/licenses', ['GET'], null),
  route('/api/v1/tenant/v1/usage', ['GET'], null),
  route('/api/v1/tenant/v1/devices', ['GET'], null),
  route('/api/v1/tenant/v1/entitlements', ['GET'], null),

  // ── Client-owned endpoints (device-authenticated, served by this server) ──
  route('/api/v1/licensing/activate', ['POST'], null),
  route('/api/v1/licensing/validate', ['POST'], null),
  route('/api/v1/licensing/heartbeat', ['POST'], null),
  route('/api/v1/configuration/establishment', [], null, ['GET']),
  // Device-authenticated signed tenant configuration (X-Device-Id +
  // X-Device-Credential); served by this server, no platform user required.
  route('/api/v1/configuration/current', ['GET'], null),
  route('/api/v1/telemetry/errors', ['POST'], null),
  route('/api/v1/telemetry/metrics', ['POST'], null),
  route('/api/v1/releases', ['GET'], null),
  // Device-authenticated signed feature-module packages (entitlement-checked).
  route('/api/v1/modules/catalog', ['GET'], null),
  route('/api/v1/modules/:moduleId/:version/files/:name', ['GET'], null),
  // Device-authenticated application backup channel (X-Device-Id +
  // X-Device-Credential; tenant resolved from the registered device).
  route('/api/v1/device/backups', ['GET'], null),
  route('/api/v1/device/backups/pending-restore', ['GET'], null),
  route('/api/v1/device/backups/upload', ['POST'], null),
  route('/api/v1/device/backups/:id/download', ['GET'], null),
  route('/api/v1/device/backups/:id/restore-result', ['POST'], null),
];

module.exports = { ROUTE_MANIFEST };
