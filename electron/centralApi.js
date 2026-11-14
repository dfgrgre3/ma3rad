const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const CENTRAL_ENDPOINTS = new Map([
  // ── Licensing / configuration / telemetry (existing) ─────────────────────
  ['/api/v1/licensing/activate', 'POST'],
  ['/api/v1/licensing/validate', 'POST'],
  ['/api/v1/licensing/heartbeat', 'POST'],
  ['/api/v1/configuration/establishment', 'GET'],
  ['/api/v1/configuration/current', 'GET'],
  ['/api/v1/configuration/public-key', 'GET'],
  ['/api/v1/telemetry/errors', 'POST'],
  ['/api/v1/releases', 'GET'],
  // ── Platform admin (Phase 4 cutover; allowlisted now for Phase 0/2) ──────
  ['/api/v1/admin/tenants', 'GET'],
  ['/api/v1/admin/tenants', 'POST'],
  ['/api/v1/admin/plans', 'GET'],
  ['/api/v1/admin/licenses', 'GET'],
  ['/api/v1/admin/licenses/issue', 'POST'],
  ['/api/v1/admin/licenses/:id/renew', 'POST'],
  ['/api/v1/admin/licenses/:id/suspend', 'POST'],
  ['/api/v1/admin/licenses/:id/revoke', 'POST'],
  ['/api/v1/admin/licenses/:id/transfer', 'POST'],
  ['/api/v1/admin/licenses/:id/coupling', 'POST'],
  ['/api/v1/admin/invoices', 'GET'],
  ['/api/v1/admin/payments', 'POST'],
  ['/api/v1/admin/audit', 'GET'],
  ['/api/v1/admin/settings', 'GET'],
  ['/api/v1/admin/settings', 'PUT'],
  // ── Device management ────────────────────────────────────────────────────
  ['/api/v1/admin/devices', 'GET'],
  ['/api/v1/admin/devices/:id/suspend', 'POST'],
  ['/api/v1/admin/devices/:id/release', 'POST'],
  ['/api/v1/admin/devices/:id/revoke', 'POST'],
  ['/api/v1/admin/devices/detect-clones', 'POST'],
]);

function normalizeOrigin(value, allowLocalHttp) {
  let url;
  try { url = new URL(String(value || '')); } catch { return null; }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
  if (url.protocol === 'https:') return url.origin;
  if (allowLocalHttp && url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname)) return url.origin;
  return null;
}

function resolveCentralRequest(configuredUrl, request, allowLocalHttp = false) {
  const trustedOrigin = normalizeOrigin(configuredUrl, allowLocalHttp);
  if (!trustedOrigin) {
    throw new Error('Central API origin is not configured.');
  }

  const path = request?.path;
  const method = String(request?.method || 'GET').toUpperCase();
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.includes('?') || path.includes('#') || path.includes('\\')) {
    throw new Error('Invalid central API path.');
  }
  if (CENTRAL_ENDPOINTS.get(path) !== method) throw new Error('Central API endpoint or method is not allowed.');
  return new URL(path, trustedOrigin);
}

/** @returns {Record<string, string>} */
function sanitizeCentralHeaders(headers = {}) {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) throw new Error('Invalid central API headers.');
  const allowed = new Set(['content-type', 'x-device-id', 'authorization']);
  /** @type {Record<string, string>} */
  const safe = {};
  for (const [key, value] of Object.entries(headers)) {
    const normalized = key.toLowerCase();
    if (!allowed.has(normalized) || typeof value !== 'string' || /[\r\n]/.test(value)) {
      throw new Error('Central API header is not allowed.');
    }
    if (normalized === 'content-type') safe['Content-Type'] = value;
else if (normalized === 'x-device-id') safe['X-Device-Id'] = value;
else if (normalized === 'authorization') safe['Authorization'] = value;
  }
  return safe;
}

module.exports = { CENTRAL_ENDPOINTS, normalizeOrigin, resolveCentralRequest, sanitizeCentralHeaders };
