'use strict';

const { resolveEffectivePermissions, getTenantScopes } = require('../identity');
const { verifyJwt } = require('../lib/jwt');
const { getDb } = require('../lib/db');
const { recordAuditEvent } = require('../lib/audit');

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const ACTIVITY_WRITE_THROTTLE_MS = 60 * 1000;

const SESSION_SELECT = `
  SELECT s.id AS session_id, s.last_activity_at, s.created_at AS session_created_at,
         u.id, u.username, u.full_name, u.email, u.role
  FROM platform_sessions s
  JOIN platform_users u ON u.id = s.user_id`;

async function attachSessionUser(row, req) {
  if (!row) return false;
  const db = getDb();
  const now = Date.now();
  const lastActivity = Date.parse(row.last_activity_at || row.session_created_at || '') || 0;
  if (lastActivity && now - lastActivity > IDLE_TIMEOUT_MS) {
    await db.run('DELETE FROM platform_sessions WHERE id = ?', [row.session_id]);
    return false;
  }
  if (!lastActivity || now - lastActivity > ACTIVITY_WRITE_THROTTLE_MS) {
    await db.run('UPDATE platform_sessions SET last_activity_at = ? WHERE id = ?', [
      new Date().toISOString(),
      row.session_id,
    ]);
  }
  const permissions = [...(await resolveEffectivePermissions(db, row.id))];
  req.platformUser = {
    id: row.id,
    username: row.username,
    full_name: row.full_name,
    email: row.email,
    role: row.role,
    permissions,
    sessionId: row.session_id,
  };
  return true;
}

/**
 * Session-bound authentication. A token is only valid while its
 * platform_sessions row exists, is unexpired and was active within 30 minutes.
 */
async function authenticatePlatformUser(req, res, next) {
  const db = getDb();
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return res.status(401).json({ error: 'Invalid platform user token' });
  }

  // 1. JWT bound to a session id (sid)
  const jwtPayload = verifyJwt(token);
  if (jwtPayload && jwtPayload.sub && jwtPayload.sid) {
    const row = await db.get(
      `${SESSION_SELECT}
       WHERE s.id = ? AND s.token = ? AND s.expires_at > CURRENT_TIMESTAMP
         AND u.is_active = 1 AND u.deleted_at IS NULL`,
      [jwtPayload.sid, token]
    );
    if (await attachSessionUser(row, req)) return next();
    return res.status(401).json({ error: 'Invalid or expired platform user credentials' });
  }

  // 2. Opaque session token fallback (same checks)
  const sessionRow = await db.get(
    `${SESSION_SELECT}
     WHERE s.token = ? AND s.expires_at > CURRENT_TIMESTAMP
       AND u.is_active = 1 AND u.deleted_at IS NULL`,
    [token]
  );
  if (await attachSessionUser(sessionRow, req)) return next();

  return res.status(401).json({ error: 'Invalid or expired platform user credentials' });
}

async function hasAnyPermission(req, requiredPermissions) {
  if (!req.platformUser) return false;
  const db = getDb();
  const effective = await resolveEffectivePermissions(db, req.platformUser.id);
  if (effective.has('*')) return true;
  return requiredPermissions.some((permission) => effective.has(permission));
}

/**
 * RBAC guard. Accepts one code or an array (any-of), so legacy codes can keep
 * working during the migration to granular codes.
 */
function requirePlatformPermission(requiredPermission) {
  const required = Array.isArray(requiredPermission) ? requiredPermission : [requiredPermission];
  return async (req, res, next) => {
    if (!req.platformUser) return res.status(401).json({ error: 'Authentication required' });
    if (await hasAnyPermission(req, required)) return next();

    await recordAuditEvent({
      actorId: req.platformUser.id,
      actorName: req.platformUser.full_name,
      action: 'ACCESS_DENIED',
      resourceType: 'permission',
      resourceId: required.join('|'),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return res.status(403).json({ error: 'Insufficient platform permissions' });
  };
}

const requireAnyPermission = (codes) => requirePlatformPermission(codes);

/**
 * Limit a staff member with data_scope=LIMITED to the tenant ids in
 * platform_scopes. Tenant id is read from params, body or query.
 */
function requireTenantScope(options = {}) {
  const param = options.param || 'tenantId';
  return async (req, res, next) => {
    if (!req.platformUser) return res.status(401).json({ error: 'Authentication required' });
    const db = getDb();
    const scopes = await getTenantScopes(db, req.platformUser.id);
    if (scopes.dataScope === 'ALL' || scopes.tenantIds.includes('*')) return next();

    const tenantId = req.params?.[param] || req.body?.[param] || req.query?.[param];
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant id is required for scoped staff' });
    }
    if (!scopes.tenantIds.includes(String(tenantId))) {
      await recordAuditEvent({
        actorId: req.platformUser.id,
        actorName: req.platformUser.full_name,
        tenantId: String(tenantId),
        action: 'TENANT_SCOPE_DENIED',
        resourceType: 'platform_tenants',
        resourceId: String(tenantId),
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      return res.status(403).json({ error: 'Tenant is outside your data scope' });
    }
    return next();
  };
}

module.exports = {
  IDLE_TIMEOUT_MS,
  SESSION_SELECT,
  attachSessionUser,
  authenticatePlatformUser,
  requirePlatformPermission,
  requireAnyPermission,
  requireTenantScope,
  hasAnyPermission,
};
