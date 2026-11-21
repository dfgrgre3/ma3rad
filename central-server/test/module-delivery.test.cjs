'use strict';

process.env.NODE_ENV = 'test';
process.env.CENTRAL_DISABLE_STARTUP_CHECK = '1';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createApp } = require('../app');
const { initDatabase, getDb, bootstrapDefaults, seedPlatformRBAC } = require('../lib/db');
const { initSigningKeys } = require('../lib/signing');
const { invalidatePermissionsCache } = require('../identity');
const { tempDbPath, removeDbFiles, startTestServer, api } = require('./helpers.cjs');

const dbPath = tempDbPath('moduledelivery');
const packagesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ceramisys-modpkgs-'));
process.env.CENTRAL_MODULE_PACKAGES_DIR = packagesDir;

const BUILD_ID = crypto.createHash('sha256').update('build').digest('hex');
const OTHER_BUILD = crypto.createHash('sha256').update('other build').digest('hex');
const JS = Buffer.from('export default 1;');

let server;
const devices = {};

function writePackage(moduleId, version, buildId, meta = {}) {
  const dir = path.join(packagesDir, moduleId, version);
  fs.mkdirSync(path.join(dir, 'files', 'assets'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'files', 'assets', 'Page-1.js'), JS);
  fs.writeFileSync(path.join(dir, 'files', 'assets', 'Unlisted-1.js'), 'secret');
  const manifest = {
    formatVersion: 1, moduleId, version, buildId,
    files: [{ path: 'assets/Page-1.js', sha256: crypto.createHash('sha256').update(JS).digest('hex'), size: JS.length }],
  };
  if (meta.modules) manifest.modules = meta.modules;
  if (meta.pages) manifest.pages = meta.pages;
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(dir, 'manifest.sig'), 'c2lnbmF0dXJl');
}

const headers = (device) => ({ 'X-Device-Id': device, 'X-Device-Credential': 'cred' });
const raw = (urlPath, device) => fetch(`${server.base}${urlPath}`, { headers: device ? headers(device) : {} });

before(async () => {
  await initDatabase({ filename: dbPath });
  await initSigningKeys();
  await bootstrapDefaults({ initialPassword: 'admin-test-pass' });
  await seedPlatformRBAC();
  invalidatePermissionsCache();
  server = await startTestServer(createApp());

  const db = getDb();
  const now = new Date().toISOString();
  for (const [tenant, code, hwId, modules] of [
    ['tnt_hr', 'MDH', 'hw-hr', ['hr']],
    ['tnt_none', 'MDN', 'hw-none', []],
    ['tnt_sales', 'MDS', 'hw-sales', ['sales']],
  ]) {
    await db.run(
      `INSERT INTO platform_tenants (id, code, name, status, created_at, updated_at) VALUES (?, ?, ?, 'ACTIVE', ?, ?)`,
      [tenant, code, tenant, now, now]
    );
    await db.run(
      `INSERT INTO platform_devices (id, tenant_id, hardware_id, name, status, credential_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?)`,
      [`dev_${tenant}`, tenant, hwId, tenant, crypto.createHash('sha256').update('cred').digest('hex'), now, now]
    );
    devices[tenant] = hwId;
    for (const code of modules) {
      await db.run(
        `INSERT INTO platform_tenant_overrides (id, tenant_id, kind, code, is_enabled) VALUES (?, ?, 'MODULE', ?, 1)`,
        [`ov_${tenant}_${code}`, tenant, code]
      );
    }
  }
  // A registered device whose credential was never enrolled must be refused.
  await db.run(
    `INSERT INTO platform_tenants (id, code, name, status, created_at, updated_at) VALUES ('tnt_nohash', 'MDX', 'tnt_nohash', 'ACTIVE', ?, ?)`,
    [now, now]
  );
  await db.run(
    `INSERT INTO platform_devices (id, tenant_id, hardware_id, name, status, created_at, updated_at)
     VALUES ('dev_tnt_nohash', 'tnt_nohash', 'hw-nohash', 'tnt_nohash', 'ACTIVE', ?, ?)`,
    [now, now]
  );
  await db.run(
    `INSERT INTO platform_tenant_overrides (id, tenant_id, kind, code, is_enabled) VALUES ('ov_tnt_nohash_hr', 'tnt_nohash', 'MODULE', 'hr', 1)`
  );
  // tnt_sales hides /secret through its tenant feature config: page packages
  // serving only hidden routes must never be offered or downloadable.
  await db.run(
    `INSERT INTO tenant_feature_config (tenant_id, plan_id, hidden_menus, disabled_permissions, feature_permissions, updated_at)
     VALUES ('tnt_sales', NULL, '["/secret"]', '[]', '[]', ?)`,
    [now]
  );
  devices.tnt_nohash = 'hw-nohash';
  writePackage('hr', '1.0.0', BUILD_ID);
  writePackage('hr', '1.2.0', BUILD_ID);
  writePackage('hr', '1.10.0', OTHER_BUILD);
  writePackage('manufacturing', '1.0.0', BUILD_ID);
  writePackage('pg-sales-orders', '1.0.0', BUILD_ID, { modules: ['sales'], pages: ['/orders'] });
  writePackage('pg-sales-secret', '1.0.0', BUILD_ID, { modules: ['sales'], pages: ['/secret'] });
  writePackage('sales', '1.0.0', BUILD_ID, { modules: ['sales'], pages: ['/orders', '/returns'] });
});

after(async () => {
  await server?.close();
  await getDb().close();
  removeDbFiles(dbPath);
  fs.rmSync(packagesDir, { recursive: true, force: true });
});

test('catalog requires a device and a build id', async () => {
  assert.equal((await raw(`/api/v1/modules/catalog?buildId=${BUILD_ID}`)).status, 401);
  assert.equal((await raw('/api/v1/modules/catalog', devices.tnt_hr)).status, 400);
  assert.equal((await raw('/api/v1/modules/catalog?buildId=nope', devices.tnt_hr)).status, 400);
});

test('the device credential is verified against the enrolled hash', async () => {
  const wrong = await fetch(`${server.base}/api/v1/modules/catalog?buildId=${BUILD_ID}`, {
    headers: { 'X-Device-Id': devices.tnt_hr, 'X-Device-Credential': 'wrong-cred' },
  });
  assert.equal(wrong.status, 401);

  // Registered but never enrolled: presence of any credential is not enough.
  const noHash = await raw(`/api/v1/modules/catalog?buildId=${BUILD_ID}`, devices.tnt_nohash);
  assert.equal(noHash.status, 401);
});

test('catalog lists only entitled modules, newest version for the caller\'s build', async () => {
  const res = await raw(`/api/v1/modules/catalog?buildId=${BUILD_ID}`, devices.tnt_hr);
  assert.equal(res.status, 200);
  const { modules } = (await res.json()).data;
  assert.deepEqual(modules.map((m) => [m.moduleId, m.version]), [['hr', '1.2.0']]);
  assert.equal(modules[0].manifest.buildId, BUILD_ID);
  assert.ok(modules[0].signature);

  const none = await (await raw(`/api/v1/modules/catalog?buildId=${BUILD_ID}`, devices.tnt_none)).json();
  assert.deepEqual(none.data.modules, []);

  const wrongBuild = await (await raw(`/api/v1/modules/catalog?buildId=${'a'.repeat(64)}`, devices.tnt_hr)).json();
  assert.deepEqual(wrongBuild.data.modules, []);
});

test('files are served to entitled devices and only if listed in the manifest', async () => {
  const ok = await raw('/api/v1/modules/hr/1.2.0/files/Page-1.js', devices.tnt_hr);
  assert.equal(ok.status, 200);
  assert.ok(Buffer.from(await ok.arrayBuffer()).equals(JS));

  assert.equal((await raw('/api/v1/modules/hr/1.2.0/files/Unlisted-1.js', devices.tnt_hr)).status, 404);
  assert.equal((await raw('/api/v1/modules/hr/9.9.9/files/Page-1.js', devices.tnt_hr)).status, 404);
});

test('a tenant without the module cannot download it, and anonymous callers are refused', async () => {
  assert.equal((await raw('/api/v1/modules/hr/1.2.0/files/Page-1.js', devices.tnt_none)).status, 403);
  assert.equal((await raw('/api/v1/modules/manufacturing/1.0.0/files/Page-1.js', devices.tnt_hr)).status, 403);
  assert.equal((await raw('/api/v1/modules/hr/1.2.0/files/Page-1.js')).status, 401);
});

test('unsafe file names are rejected before touching the disk', async () => {
  for (const name of ['..%2F..%2Fmanifest.json', 'manifest.json', 'x.exe', '%2e%2e']) {
    const res = await raw(`/api/v1/modules/hr/1.2.0/files/${name}`, devices.tnt_hr);
    assert.ok([400, 404].includes(res.status), `${name} → ${res.status}`);
  }
});

test('page packages follow tenant page visibility: hidden pages are never offered or downloadable', async () => {
  const res = await raw(`/api/v1/modules/catalog?buildId=${BUILD_ID}`, devices.tnt_sales);
  assert.equal(res.status, 200);
  const { modules } = (await res.json()).data;
  const ids = modules.map((m) => m.moduleId).sort();
  // The package serving only the hidden /secret page is absent; the visible
  // page package and the module-shared package (still needed by /orders) stay.
  assert.deepEqual(ids, ['pg-sales-orders', 'sales']);

  // File endpoint applies the same rule independently of the catalog.
  assert.equal((await raw('/api/v1/modules/pg-sales-orders/1.0.0/files/Page-1.js', devices.tnt_sales)).status, 200);
  assert.equal((await raw('/api/v1/modules/sales/1.0.0/files/Page-1.js', devices.tnt_sales)).status, 200);
  assert.equal((await raw('/api/v1/modules/pg-sales-secret/1.0.0/files/Page-1.js', devices.tnt_sales)).status, 403);

  // A tenant without the sales module cannot reach any of its packages.
  assert.equal((await raw('/api/v1/modules/pg-sales-orders/1.0.0/files/Page-1.js', devices.tnt_hr)).status, 403);
  assert.equal((await raw('/api/v1/modules/pg-sales-secret/1.0.0/files/Page-1.js', devices.tnt_hr)).status, 403);
});
