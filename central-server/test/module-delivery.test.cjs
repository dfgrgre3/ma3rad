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

function writePackage(moduleId, version, buildId) {
  const dir = path.join(packagesDir, moduleId, version);
  fs.mkdirSync(path.join(dir, 'files', 'assets'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'files', 'assets', 'Page-1.js'), JS);
  fs.writeFileSync(path.join(dir, 'files', 'assets', 'Unlisted-1.js'), 'secret');
  const manifest = {
    formatVersion: 1, moduleId, version, buildId,
    files: [{ path: 'assets/Page-1.js', sha256: crypto.createHash('sha256').update(JS).digest('hex'), size: JS.length }],
  };
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
  devices.tnt_nohash = 'hw-nohash';
  writePackage('hr', '1.0.0', BUILD_ID);
  writePackage('hr', '1.2.0', BUILD_ID);
  writePackage('hr', '1.10.0', OTHER_BUILD);
  writePackage('manufacturing', '1.0.0', BUILD_ID);
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
