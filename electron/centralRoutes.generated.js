/**
 * GENERATED FILE — do not edit by hand.
 * Source: central-server/routeManifest.js
 * Regenerate with: node central-server/scripts/generate-routes.mjs
 *
 * 39 allowlisted endpoint pattern(s).
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
      "GET"
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
      "GET"
    ]
  },
  {
    "pattern": "/api/v1/admin/plans",
    "methods": [
      "GET"
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
  }
];

module.exports = { ROUTE_DEFINITIONS };
