const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Route definitions are generated from the central server route manifest by
 * `node central-server/scripts/generate-routes.mjs`. Do not hand-edit the
 * generated file: add routes in central-server/routeManifest.js and regenerate.
 *
 * Pattern matching converts :param segments into a single URL segment matcher ([^/]+).
 */
const { ROUTE_DEFINITIONS } = require('./centralRoutes.generated');

// Compiled routes with RegExp and Set of methods
const COMPILED_ROUTES = ROUTE_DEFINITIONS.map(route => {
  const regexStr = '^' + route.pattern.replace(/:[a-zA-Z0-9_]+/g, '([^/]+)') + '$';
  return {
    pattern: route.pattern,
    regex: new RegExp(regexStr),
    methods: new Set(route.methods.map(m => m.toUpperCase()))
  };
});

// Backward compatibility map for existing consumers expecting CENTRAL_ENDPOINTS
const CENTRAL_ENDPOINTS = new Map();
for (const route of ROUTE_DEFINITIONS) {
  for (const method of route.methods) {
    CENTRAL_ENDPOINTS.set(`${method} ${route.pattern}`, method);
    // Also store path alone with primary/last method if required
    CENTRAL_ENDPOINTS.set(route.pattern, method);
  }
}

function normalizeOrigin(value, allowLocalHttp) {
  let url;
  try { url = new URL(String(value || '')); } catch { return null; }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
  if (url.protocol === 'https:') return url.origin;
  if (allowLocalHttp && url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname)) return url.origin;
  return null;
}

/**
 * Validates and matches a route against defined patterns.
 * @param {string} pathname
 * @param {string} method
 * @returns {boolean}
 */
function isAllowedEndpoint(pathname, method) {
  const upperMethod = String(method || 'GET').toUpperCase();
  for (const route of COMPILED_ROUTES) {
    if (route.regex.test(pathname) && route.methods.has(upperMethod)) {
      return true;
    }
  }
  return false;
}

function resolveCentralRequest(configuredUrl, request, allowLocalHttp = false) {
  const trustedOrigin = normalizeOrigin(configuredUrl, allowLocalHttp);
  if (!trustedOrigin) {
    throw new Error('Central API origin is not configured.');
  }

  const rawPath = request?.path;
  const method = String(request?.method || 'GET').toUpperCase();
  if (typeof rawPath !== 'string' || !rawPath.startsWith('/') || rawPath.startsWith('//') || rawPath.includes('#') || rawPath.includes('\\')) {
    throw new Error('Invalid central API path.');
  }

  // Parse path and query parameters safely
  let parsedUrl;
  try {
    parsedUrl = new URL(rawPath, trustedOrigin);
  } catch {
    throw new Error('Invalid central API path format.');
  }

  const pathname = parsedUrl.pathname;

  // Protect sensitive endpoints from leaking credentials or arguments via query string
  if (parsedUrl.search && pathname.startsWith('/api/v1/licensing/')) {
    throw new Error('Licensing endpoints do not accept query parameters in path.');
  }

  if (!isAllowedEndpoint(pathname, method)) {
    throw new Error('Central API endpoint or method is not allowed.');
  }

  return parsedUrl;
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

module.exports = {
  CENTRAL_ENDPOINTS,
  ROUTE_DEFINITIONS,
  normalizeOrigin,
  isAllowedEndpoint,
  resolveCentralRequest,
  sanitizeCentralHeaders
};
