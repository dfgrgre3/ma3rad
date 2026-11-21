'use strict';

/**
 * Bearer-token authentication for tenant-facing API keys.
 *
 * Keys live in platform_api_keys. A key with tenant_id NULL/'' is a platform
 * staff key (managed under Security Center); a key with tenant_id set is a
 * customer key that may only ever read that tenant's own data — every
 * tenant-api handler scopes queries by req.apiKey.tenantId.
 *
 * Only the SHA-256 of the key is stored; the plaintext is shown once at
 * creation. Scopes are a JSON array of capability strings (e.g. 'read').
 */

const crypto = require('node:crypto');
const { getDb } = require('./db');

const KEY_PATTERN = /^pk_[a-f0-9]{32,}$/;

function hashApiKey(key) {
  return crypto.createHash('sha256').update(String(key), 'utf8').digest('hex');
}

function extractBearer(req) {
  const header = String(req.get('Authorization') || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function apiKeyScopes(keyRow) {
  try {
    const parsed = JSON.parse(keyRow?.scopes || '[]');
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/** True when the key grants the given scope (empty scopes = read-only default). */
function apiKeyHasScope(keyRow, scope) {
  const scopes = apiKeyScopes(keyRow);
  if (!scopes.length) return scope === 'read';
  return scopes.includes(scope) || scopes.includes('*');
}

/**
 * Express middleware: resolves req.apiKey from `Authorization: Bearer pk_...`.
 * Rejects unknown, revoked, expired or malformed keys.
 */
async function authenticateApiKey(req, res, next) {
  try {
    const key = extractBearer(req);
    if (!key || !KEY_PATTERN.test(key)) {
      return res.status(401).json({ error: 'A valid API key is required (Bearer pk_...)' });
    }
    const db = getDb();
    const row = await db.get('SELECT * FROM platform_api_keys WHERE key_hash = ?', [hashApiKey(key)]);
    if (!row || !row.is_active || row.revoked_at) {
      return res.status(401).json({ error: 'Invalid or revoked API key' });
    }
    if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
      return res.status(401).json({ error: 'API key has expired' });
    }
    const tenantId = row.tenant_id ? String(row.tenant_id) : null;
    if (!tenantId) {
      // Platform staff keys are not accepted on the tenant API surface.
      return res.status(403).json({ error: 'This API key is not scoped to a tenant' });
    }
    // Fire-and-forget last-used stamp (never block the request on it).
    db.run('UPDATE platform_api_keys SET last_used_at = ? WHERE id = ?', [new Date().toISOString(), row.id]).catch(() => {});
    req.apiKey = {
      id: row.id,
      name: row.name,
      tenantId,
      scopes: apiKeyScopes(row),
      hasScope: (scope) => apiKeyHasScope(row, scope),
    };
    return next();
  } catch (err) {
    return next(err);
  }
}

/** Guard for endpoints that need a scope beyond the default 'read'. */
function requireApiScope(scope) {
  return (req, res, next) => {
    if (!req.apiKey?.hasScope(scope)) {
      return res.status(403).json({ error: `API key lacks the '${scope}' scope` });
    }
    return next();
  };
}

module.exports = { authenticateApiKey, requireApiScope, hashApiKey, apiKeyScopes, apiKeyHasScope, KEY_PATTERN };
