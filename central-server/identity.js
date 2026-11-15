/**
 * Central platform identity: effective-permission resolution and tenant data
 * scopes, with a short-lived in-memory cache.
 *
 * Effective permissions for a user are:
 *   1. The union of all matrices of the user's roles (platform_user_roles →
 *      platform_role_permissions; falls back to platform_users.role for legacy rows)
 *   2. Individual GRANT exceptions (platform_user_permissions)
 *   3. Individual DENY exceptions, which always win
 *
 * Wildcard '*' comes from the SUPER_ADMIN role matrix, never from user grants.
 */

const CACHE_TTL_MS = 60 * 1000;
const permissionCache = new Map(); // userId -> { ts, permissions: string[] }
const scopesCache = new Map();     // userId -> { ts, dataScope, tenantIds }

async function resolveEffectivePermissions(db, userId) {
  const cached = permissionCache.get(userId);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return new Set(cached.permissions);
  }

  const permissions = new Set();
  const user = await db.get(
    'SELECT id, role FROM platform_users WHERE id = ? AND is_active = 1 AND deleted_at IS NULL',
    [userId],
  );
  if (user) {
    let roleRows = await db.all('SELECT role_code FROM platform_user_roles WHERE user_id = ?', [userId]);
    let roleCodes = roleRows.map((row) => row.role_code);
    if (roleCodes.length === 0 && user.role) {
      roleCodes = [user.role];
    }
    if (roleCodes.length > 0) {
      const placeholders = roleCodes.map(() => '?').join(',');
      const rows = await db.all(
        `SELECT DISTINCT permission_code FROM platform_role_permissions WHERE role_code IN (${placeholders})`,
        roleCodes,
      );
      for (const row of rows) permissions.add(row.permission_code);
    }

    const exceptions = await db.all(
      'SELECT permission_code, effect FROM platform_user_permissions WHERE user_id = ?',
      [userId],
    );
    for (const exception of exceptions) {
      if (exception.effect === 'DENY') permissions.delete(exception.permission_code);
    }
    for (const exception of exceptions) {
      if (exception.effect === 'GRANT') permissions.add(exception.permission_code);
    }
  }

  permissionCache.set(userId, { ts: Date.now(), permissions: [...permissions] });
  return permissions;
}

function invalidatePermissionsCache(userId) {
  if (userId) {
    permissionCache.delete(userId);
    return;
  }
  permissionCache.clear();
}

function invalidateScopesCache(userId) {
  if (userId) {
    scopesCache.delete(userId);
    return;
  }
  scopesCache.clear();
}

async function getTenantScopes(db, userId) {
  const cached = scopesCache.get(userId);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return { dataScope: cached.dataScope, tenantIds: [...cached.tenantIds] };
  }

  const user = await db.get('SELECT data_scope FROM platform_users WHERE id = ?', [userId]);
  const rows = await db.all(
    `SELECT scope_id FROM platform_scopes WHERE user_id = ? AND scope_type = 'TENANT'`,
    [userId],
  );
  const dataScope = user?.data_scope || 'ALL';
  const tenantIds = rows.map((row) => row.scope_id);
  scopesCache.set(userId, { ts: Date.now(), dataScope, tenantIds });
  return { dataScope, tenantIds };
}

async function userHasTenantScope(db, userId, tenantId) {
  const scopes = await getTenantScopes(db, userId);
  if (scopes.dataScope === 'ALL') return true;
  return scopes.tenantIds.includes(tenantId);
}

module.exports = {
  resolveEffectivePermissions,
  invalidatePermissionsCache,
  getTenantScopes,
  userHasTenantScope,
  invalidateScopesCache,
};
