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
  route('/api/v1/admin/tenants/:id/account', ['POST'], {
    POST: ['platform.tenants.update', 'platform.tenants.manage'],
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

  // ── Plans ─────────────────────────────────────────────────────────────────
  route('/api/v1/admin/plans', ['GET'], {
    GET: ['platform.plans.view', 'platform.plans.manage'],
  }),

  // ── Subscriptions ──────────────────────────────────────────────────────────
  route('/api/v1/admin/subscriptions', ['GET'], {
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

  // ── Licenses ──────────────────────────────────────────────────────────────
  route('/api/v1/admin/licenses', ['GET'], {
    GET: ['platform.licenses.view', 'platform.licenses.manage'],
  }),
  route('/api/v1/admin/licenses/issue', ['POST'], {
    POST: ['platform.licenses.create', 'platform.licenses.manage'],
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
  route('/api/v1/admin/devices/:id/suspend', ['POST'], {
    POST: ['platform.devices.update'],
  }),
  route('/api/v1/admin/devices/:id/release', ['POST'], {
    POST: ['platform.devices.update'],
  }),
  route('/api/v1/admin/devices/:id/revoke', ['POST'], {
    POST: ['platform.devices.update'],
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

  // ── Policies ───────────────────────────────────────────────────────────────
  route('/api/v1/admin/policies', ['GET'], {
    GET: ['platform.policies.view'],
  }),

  // ── Feature permissions / dynamic app configuration ─────────────────────────
  route('/api/v1/admin/config/feature-permissions', ['GET', 'PUT'], {
    GET: ['platform.app-configuration.view'],
    PUT: ['platform.app-configuration.update', 'platform.settings.update'],
  }),
  route('/api/v1/admin/config/permission-limits', ['GET', 'PUT'], {
    GET: ['platform.app-configuration.view'],
    PUT: ['platform.app-configuration.update', 'platform.settings.update'],
  }),

  // ── Client-owned endpoints (device-authenticated, served by this server) ──
  route('/api/v1/licensing/activate', [], null, ['POST']),
  route('/api/v1/licensing/validate', [], null, ['POST']),
  route('/api/v1/licensing/heartbeat', [], null, ['POST']),
  route('/api/v1/configuration/establishment', [], null, ['GET']),
  route('/api/v1/configuration/current', [], null, ['GET']),
  route('/api/v1/telemetry/errors', ['POST'], null),
  route('/api/v1/releases', ['GET'], null),
  // Device-authenticated application backup channel (X-Device-Id +
  // X-Device-Credential; tenant resolved from the registered device).
  route('/api/v1/device/backups', ['GET'], null),
  route('/api/v1/device/backups/pending-restore', ['GET'], null),
  route('/api/v1/device/backups/upload', ['POST'], null),
  route('/api/v1/device/backups/:id/download', ['GET'], null),
  route('/api/v1/device/backups/:id/restore-result', ['POST'], null),
];

module.exports = { ROUTE_MANIFEST };
