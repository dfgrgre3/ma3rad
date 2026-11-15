'use strict';

/**
 * Route introspection helper used by scripts/generate-routes.mjs.
 *
 * Walks an Express 4 application stack and returns every concrete route as
 * `{ path, methods }`, so the Electron bridge allowlist can be generated from
 * the same routers the server actually mounts.
 */
function joinPath(prefix, path) {
  const left = (prefix || '').replace(/\/+$/, '');
  const right = (path || '').replace(/^\/+/, '');
  if (!left && !right) return '/';
  if (!left) return `/${right}`;
  if (!right) return left;
  return `${left}/${right}`;
}

function routerPrefix(regexp) {
  const source = regexp?.source || '';
  if (!source.startsWith('^')) return null;
  const end = source.indexOf('\\/?(?=');
  if (end === -1) return null;
  return source.slice(1, end).replace(/\\\//g, '/');
}

function collectRoutes(app) {
  const routes = [];

  const walk = (stack, prefix) => {
    for (const layer of stack || []) {
      if (layer.route) {
        const methods = Object.keys(layer.route.methods)
          .filter((method) => layer.route.methods[method])
          .map((method) => method.toUpperCase());
        routes.push({ path: joinPath(prefix, layer.route.path), methods });
        continue;
      }
      if (layer.name === 'router' && layer.handle?.stack) {
        const mountedPrefix = routerPrefix(layer.regexp);
        walk(layer.handle.stack, joinPath(prefix, mountedPrefix || ''));
      }
    }
  };

  walk(app._router?.stack, '');
  return routes;
}

/** `{ 'GET /api/v1/health': true }` — stable lookup for coverage checks. */
function routeKeySet(routes) {
  const keys = new Set();
  for (const route of routes) {
    for (const method of route.methods) keys.add(`${method} ${route.path}`);
  }
  return keys;
}

module.exports = { collectRoutes, routeKeySet };
