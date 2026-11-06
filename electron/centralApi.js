const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const CENTRAL_ENDPOINTS = new Map([
  ['/api/v1/licensing/activate', 'POST'],
  ['/api/v1/licensing/validate', 'POST'],
  ['/api/v1/licensing/heartbeat', 'POST'],
  ['/api/v1/configuration/establishment', 'GET'],
  ['/api/v1/configuration/current', 'GET'],
  ['/api/v1/configuration/public-key', 'GET'],
  ['/api/v1/telemetry/errors', 'POST'],
  ['/api/v1/releases', 'GET'],
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

function sanitizeCentralHeaders(headers = {}) {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) throw new Error('Invalid central API headers.');
  const allowed = new Set(['content-type', 'x-device-id']);
  const safe = {};
  for (const [key, value] of Object.entries(headers)) {
    const normalized = key.toLowerCase();
    if (!allowed.has(normalized) || typeof value !== 'string' || /[\r\n]/.test(value)) {
      throw new Error('Central API header is not allowed.');
    }
    safe[normalized === 'content-type' ? 'Content-Type' : 'X-Device-Id'] = value;
  }
  return safe;
}

module.exports = { CENTRAL_ENDPOINTS, normalizeOrigin, resolveCentralRequest, sanitizeCentralHeaders };
