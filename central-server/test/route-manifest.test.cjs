'use strict';

process.env.NODE_ENV = 'test';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { readFileSync } = require('node:fs');

const { createApp } = require('../app');
const { ROUTE_MANIFEST } = require('../routeManifest');
const { collectRoutes, routeKeySet } = require('../lib/routeIntrospection');

const repoRoot = path.resolve(__dirname, '..', '..');

test('every mounted server route is declared in the route manifest', () => {
  const actualKeys = routeKeySet(collectRoutes(createApp()));
  const declared = new Set();
  for (const entry of ROUTE_MANIFEST) {
    for (const method of entry.serverMethods) declared.add(`${method} ${entry.pattern}`);
  }

  const undeclared = [...actualKeys].filter((key) => !declared.has(key));
  const missing = [...declared].filter((key) => !actualKeys.has(key));

  assert.deepEqual(undeclared, [], 'routes mounted but missing from the manifest');
  assert.deepEqual(missing, [], 'routes declared in the manifest but never mounted');
  assert.ok(actualKeys.size >= 30, 'manifest covers the full central API surface');
});

test('the Electron allowlist matches the manifest', () => {
  const generated = require(path.join(repoRoot, 'electron', 'centralRoutes.generated.js'));
  const expected = ROUTE_MANIFEST.map((entry) => ({
    pattern: entry.pattern,
    methods: [...new Set([...entry.serverMethods, ...(entry.clientOnlyMethods || [])])],
  }));
  assert.deepEqual(generated.ROUTE_DEFINITIONS, expected);
});

test('permission-guarded routes declare at least one permission code', () => {
  const publicRoutes = new Set([
    '/api/v1/health',
    '/api/v1/configuration/public-key',
    '/api/v1/admin/auth/login',
    '/api/v1/admin/auth/me',
    '/api/v1/admin/auth/logout',
    '/api/v1/admin/auth/refresh',
    '/api/v1/admin/auth/effective',
    '/api/v1/admin/auth/mfa/setup',
    '/api/v1/admin/auth/mfa/verify',
    '/api/v1/admin/auth/mfa/disable',
    // Device-authenticated client endpoints (no platform staff session).
    '/api/v1/telemetry/errors',
    '/api/v1/releases',
    '/api/v1/device/backups',
    '/api/v1/device/backups/pending-restore',
    '/api/v1/device/backups/upload',
    '/api/v1/device/backups/:id/download',
    '/api/v1/device/backups/:id/restore-result',
  ]);

  for (const entry of ROUTE_MANIFEST) {
    if (!entry.serverMethods.length) continue;
    if (publicRoutes.has(entry.pattern)) continue;
    assert.ok(entry.permission, `missing permission declaration for ${entry.pattern}`);
    for (const method of entry.serverMethods) {
      assert.ok(
        Array.isArray(entry.permission[method]) && entry.permission[method].length > 0,
        `missing permission codes for ${method} ${entry.pattern}`
      );
    }
  }
});

test('the generated route file is up to date', () => {
  const generatedPath = path.join(repoRoot, 'electron', 'centralRoutes.generated.js');
  const contents = readFileSync(generatedPath, 'utf8');
  assert.match(contents, /GENERATED FILE/);
  assert.match(contents, /central-server\/routeManifest\.js/);
  assert.match(contents, /module\.exports = \{ ROUTE_DEFINITIONS \}/);
});
