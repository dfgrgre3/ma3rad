'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  ModuleStore, signManifest, sha256Hex, verifyManifest,
} = require('../electron/modulePackages.js');

const BUILD_ID = sha256Hex(Buffer.from('index.html of build A'));

function keyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    publicKey: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    privateKey: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
  };
}

function makePackage(keys, { moduleId = 'hr', version = '1.0.0', buildId = BUILD_ID, files } = {}) {
  const contents = files ?? { 'assets/HrPage-abc.js': 'export const x = 1;', 'assets/HrPage-abc.css': '.a{}' };
  const manifest = {
    formatVersion: 1,
    moduleId,
    version,
    buildId,
    files: Object.entries(contents).map(([p, text]) => ({
      path: p, sha256: sha256Hex(Buffer.from(text)), size: Buffer.byteLength(text),
    })),
  };
  return { manifest, signature: signManifest(manifest, keys.privateKey), contents };
}

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ceramisys-modstore-'));
}

test('a correctly signed package installs, is indexed and serves verified bytes', async () => {
  const keys = keyPair();
  const store = new ModuleStore(tempRoot(), { publicKey: keys.publicKey, buildId: BUILD_ID });
  const pkg = makePackage(keys);
  await store.install(pkg.manifest, pkg.signature, async (p) => Buffer.from(pkg.contents[p]));
  assert.equal(store.isInstalled('hr'), true);
  assert.deepEqual(store.list(), [{ moduleId: 'hr', version: '1.0.0' }]);
  assert.equal((await store.readAsset('assets/HrPage-abc.js')).toString(), 'export const x = 1;');
  assert.equal(await store.readAsset('assets/Other.js'), null);

  // A fresh store over the same directory re-verifies and finds the install.
  const reopened = new ModuleStore(store.rootDir, { publicKey: keys.publicKey, buildId: BUILD_ID });
  await reopened.load();
  assert.equal(reopened.isInstalled('hr'), true);
});

test('a manifest signed by another key is refused and nothing is written', async () => {
  const trusted = keyPair();
  const attacker = keyPair();
  const root = tempRoot();
  const store = new ModuleStore(root, { publicKey: trusted.publicKey, buildId: BUILD_ID });
  const pkg = makePackage(attacker);
  await assert.rejects(
    store.install(pkg.manifest, pkg.signature, async (p) => Buffer.from(pkg.contents[p])),
    /signature is invalid/,
  );
  assert.deepEqual(fs.readdirSync(root), []);
});

test('tampering with the manifest after signing invalidates the signature', async () => {
  const keys = keyPair();
  const pkg = makePackage(keys);
  pkg.manifest.files[0].sha256 = sha256Hex(Buffer.from('evil'));
  assert.throws(
    () => verifyManifest(pkg.manifest, pkg.signature, { publicKey: keys.publicKey, buildId: BUILD_ID }),
    /signature is invalid/,
  );
});

test('a file that differs from its signed hash is rejected', async () => {
  const keys = keyPair();
  const store = new ModuleStore(tempRoot(), { publicKey: keys.publicKey, buildId: BUILD_ID });
  const pkg = makePackage(keys);
  await assert.rejects(
    store.install(pkg.manifest, pkg.signature, async () => Buffer.from('console.log("evil")')),
    /does not match the signed manifest/,
  );
  assert.equal(store.isInstalled('hr'), false);
});

test('a package built for another application build is refused', async () => {
  const keys = keyPair();
  const store = new ModuleStore(tempRoot(), { publicKey: keys.publicKey, buildId: BUILD_ID });
  const pkg = makePackage(keys, { buildId: sha256Hex(Buffer.from('build B')) });
  await assert.rejects(
    store.install(pkg.manifest, pkg.signature, async (p) => Buffer.from(pkg.contents[p])),
    /different application build/,
  );
});

test('no configured signing key means every package is refused', async () => {
  const keys = keyPair();
  const store = new ModuleStore(tempRoot(), { publicKey: '', buildId: BUILD_ID });
  const pkg = makePackage(keys);
  await assert.rejects(
    store.install(pkg.manifest, pkg.signature, async (p) => Buffer.from(pkg.contents[p])),
    /signing key is not configured/,
  );
});

test('signed manifests with unsafe paths are still rejected', async () => {
  const keys = keyPair();
  for (const bad of ['../evil.js', 'assets/../../evil.js', 'assets/sub/x.js', '/abs/x.js', 'assets/x.exe', 'assets\\x.js']) {
    const pkg = makePackage(keys, { files: { [bad]: 'x' } });
    const store = new ModuleStore(tempRoot(), { publicKey: keys.publicKey, buildId: BUILD_ID });
    await assert.rejects(
      store.install(pkg.manifest, pkg.signature, async () => Buffer.from('x')),
      /unsafe file path/,
      bad,
    );
  }
});

test('a file edited on disk after install is no longer served', async () => {
  const keys = keyPair();
  const store = new ModuleStore(tempRoot(), { publicKey: keys.publicKey, buildId: BUILD_ID });
  const pkg = makePackage(keys);
  await store.install(pkg.manifest, pkg.signature, async (p) => Buffer.from(pkg.contents[p]));
  assert.ok(await store.readAsset('assets/HrPage-abc.js'));
  const file = path.join(store.rootDir, 'hr', '1.0.0', 'assets', 'HrPage-abc.js');
  fs.writeFileSync(file, 'export const x = 2;!!');
  assert.equal(await store.readAsset('assets/HrPage-abc.js'), null);
});

test('tampered installed manifest is dropped on reload; remove deletes the module', async () => {
  const keys = keyPair();
  const store = new ModuleStore(tempRoot(), { publicKey: keys.publicKey, buildId: BUILD_ID });
  const pkg = makePackage(keys);
  await store.install(pkg.manifest, pkg.signature, async (p) => Buffer.from(pkg.contents[p]));

  const manifestPath = path.join(store.rootDir, 'hr', '1.0.0', 'manifest.json');
  const edited = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  edited.files.push({ path: 'assets/Evil.js', sha256: sha256Hex(Buffer.from('e')), size: 1 });
  fs.writeFileSync(manifestPath, JSON.stringify(edited));
  await store.load();
  assert.equal(store.isInstalled('hr'), false);

  fs.writeFileSync(manifestPath, JSON.stringify(pkg.manifest));
  await store.load();
  assert.equal(store.isInstalled('hr'), true);
  await store.remove('hr');
  assert.equal(store.isInstalled('hr'), false);
  assert.equal(fs.existsSync(path.join(store.rootDir, 'hr')), false);
});

test('upgrading replaces the previous version', async () => {
  const keys = keyPair();
  const store = new ModuleStore(tempRoot(), { publicKey: keys.publicKey, buildId: BUILD_ID });
  const v1 = makePackage(keys, { version: '1.0.0' });
  const v2 = makePackage(keys, { version: '1.1.0', files: { 'assets/HrPage-def.js': 'export const x = 3;' } });
  await store.install(v1.manifest, v1.signature, async (p) => Buffer.from(v1.contents[p]));
  await store.install(v2.manifest, v2.signature, async (p) => Buffer.from(v2.contents[p]));
  assert.deepEqual(store.list(), [{ moduleId: 'hr', version: '1.1.0' }]);
  assert.equal(store.hasAsset('assets/HrPage-abc.js'), false);
  assert.equal(store.hasAsset('assets/HrPage-def.js'), true);
  assert.equal(fs.existsSync(path.join(store.rootDir, 'hr', '1.0.0')), false);
});

test('package-modules writes signed packages that the store accepts, and strips the installer', async () => {
  const { packageModules } = require('../scripts/package-modules.cjs');
  const { computeBuildId } = require('../electron/modulePackages.js');
  const keys = keyPair();
  const dist = tempRoot();
  const out = tempRoot();
  fs.mkdirSync(path.join(dist, 'assets'));
  fs.writeFileSync(path.join(dist, 'index.html'), '<html>build</html>');
  fs.writeFileSync(path.join(dist, 'assets', 'index-1.js'), 'core');
  fs.writeFileSync(path.join(dist, 'assets', 'HrPage-1.js'), 'hr page');
  fs.writeFileSync(path.join(dist, 'assets', 'HrPage-1.css'), '.hr{}');
  fs.writeFileSync(path.join(dist, 'module-chunks.json'), JSON.stringify({
    modules: { hr: ['assets/HrPage-1.css', 'assets/HrPage-1.js'] }, coreChunkCount: 1, keptInCore: [], unsplittableModules: [],
  }));

  const result = packageModules({ distDir: dist, outDir: out, version: '2.0.0', privateKey: keys.privateKey, strip: true });
  assert.equal(result.written[0].moduleId, 'hr');
  assert.equal(fs.existsSync(path.join(dist, 'assets', 'HrPage-1.js')), false, 'stripped from installer');
  assert.equal(fs.existsSync(path.join(dist, 'assets', 'index-1.js')), true, 'core kept');
  assert.equal(fs.existsSync(path.join(dist, 'module-chunks.json')), false);

  const base = path.join(out, 'hr', '2.0.0');
  const manifest = JSON.parse(fs.readFileSync(path.join(base, 'manifest.json'), 'utf8'));
  const signature = fs.readFileSync(path.join(base, 'manifest.sig'), 'utf8');
  const store = new ModuleStore(tempRoot(), { publicKey: keys.publicKey, buildId: computeBuildId(dist) });
  await store.install(manifest, signature, async (p) => fs.readFileSync(path.join(base, 'files', p)));
  assert.equal((await store.readAsset('assets/HrPage-1.js')).toString(), 'hr page');
});

test('page-level manifests carry modules/pages and the store accepts them', async () => {
  const { assertManifestShape } = require('../electron/modulePackages.js');
  const keys = keyPair();
  const store = new ModuleStore(tempRoot(), { publicKey: keys.publicKey, buildId: BUILD_ID });
  const pkg = makePackage(keys, { moduleId: 'pg-sales-a1b2c3d4' });
  pkg.manifest.modules = ['sales'];
  pkg.manifest.pages = ['/orders', '/products/:id'];
  pkg.signature = signManifest(pkg.manifest, keys.privateKey);
  await store.install(pkg.manifest, pkg.signature, async (p) => Buffer.from(pkg.contents[p]));
  assert.equal(store.isInstalled('pg-sales-a1b2c3d4'), true);

  // Invalid metadata shapes are rejected before anything is trusted.
  const bad = makePackage(keys);
  bad.manifest.modules = ['NOT VALID!'];
  assert.throws(() => assertManifestShape(bad.manifest), /bad modules list/);
  const badPages = makePackage(keys);
  badPages.manifest.pages = ['orders'];
  assert.throws(() => assertManifestShape(badPages.manifest), /bad pages list/);
});

test('package-modules writes page metadata from the plan into signed manifests', async () => {
  const { packageModules } = require('../scripts/package-modules.cjs');
  const keys = keyPair();
  const dist = tempRoot();
  const out = tempRoot();
  fs.mkdirSync(path.join(dist, 'assets'));
  fs.writeFileSync(path.join(dist, 'index.html'), '<html>build</html>');
  fs.writeFileSync(path.join(dist, 'assets', 'index-1.js'), 'core');
  fs.writeFileSync(path.join(dist, 'assets', 'OrdersPage-1.js'), 'orders page');
  fs.writeFileSync(path.join(dist, 'assets', 'Shared-1.js'), 'shared');
  fs.writeFileSync(path.join(dist, 'module-chunks.json'), JSON.stringify({
    modules: {
      'pg-sales-a1b2c3d4': ['assets/OrdersPage-1.js'],
      sales: ['assets/Shared-1.js'],
    },
    packages: {
      'pg-sales-a1b2c3d4': { modules: ['sales'], pages: ['/orders'] },
      sales: { modules: ['sales'], pages: ['/orders', '/returns'] },
    },
    coreChunkCount: 1, keptInCore: [], unsplittablePackages: [],
  }));

  packageModules({ distDir: dist, outDir: out, version: '2.0.0', privateKey: keys.privateKey });
  const pageManifest = JSON.parse(fs.readFileSync(path.join(out, 'pg-sales-a1b2c3d4', '2.0.0', 'manifest.json'), 'utf8'));
  assert.deepEqual(pageManifest.modules, ['sales']);
  assert.deepEqual(pageManifest.pages, ['/orders']);
  const sharedManifest = JSON.parse(fs.readFileSync(path.join(out, 'sales', '2.0.0', 'manifest.json'), 'utf8'));
  assert.deepEqual(sharedManifest.modules, ['sales']);
  assert.deepEqual(sharedManifest.pages, ['/orders', '/returns']);
});
