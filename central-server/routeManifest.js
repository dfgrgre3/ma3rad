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
  route('/api/v1/admin/roles/:code/permissions', ['GET'], {
    GET: ['platform.staff.view', 'platform.staff.manage_permissions'],
  }),
  route('/api/v1/admin/permissions/catalog', ['GET'], {
    GET: ['platform.staff.view', 'platform.staff.manage_permissions'],
  }),

  // ── Tenants ───────────────────────────────────────────────────────────────
  route('/api/v1/admin/tenants', ['GET', 'POST'], {
    GET: ['platform.tenants.view', 'platform.tenants.manage'],
    POST: ['platform.tenants.create', 'platform.tenants.manage'],
  }),
  route('/api/v1/admin/tenants/:id', ['GET'], {
    GET: ['platform.tenants.view', 'platform.tenants.manage'],
  }),

  // ── Plans ─────────────────────────────────────────────────────────────────
  route('/api/v1/admin/plans', ['GET'], {
    GET: ['platform.plans.view', 'platform.plans.manage'],
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
  route('/api/v1/admin/operations/jobs', ['GET'], {
    GET: ['platform.operations.view'],
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
  route('/api/v1/admin/backups', ['GET'], {
    GET: ['platform.backups.view'],
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

  // ── Client-owned endpoints (served by licensing/update services) ──────────
  route('/api/v1/licensing/activate', [], null, ['POST']),
  route('/api/v1/licensing/validate', [], null, ['POST']),
  route('/api/v1/licensing/heartbeat', [], null, ['POST']),
  route('/api/v1/configuration/establishment', [], null, ['GET']),
  route('/api/v1/configuration/current', [], null, ['GET']),
  route('/api/v1/telemetry/errors', [], null, ['POST']),
  route('/api/v1/releases', [], null, ['GET']),
];

module.exports = { ROUTE_MANIFEST };
