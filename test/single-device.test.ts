import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const mainSource = fs.readFileSync(path.join(root, 'electron', 'main.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

function listSourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

test('single-device: the app enforces one running instance per workstation', () => {
  assert.match(mainSource, /requestSingleInstanceLock\(\)/);
  assert.match(mainSource, /isE2EIsolated \? true : app\.requestSingleInstanceLock\(\)/);
  assert.match(mainSource, /path\.basename\(dataDir\)\.startsWith\('ceramisys-e2e-'\)/);
  assert.match(mainSource, /second-instance/);
  // A second launch must focus the existing window instead of opening a second database.
  assert.match(mainSource, /win\.focus\(\)/);
});

test('single-device: packaged builds load local files and block outbound HTTP(S)', () => {
  assert.match(mainSource, /win\.loadFile\(/);
  assert.match(mainSource, /installOfflineNetworkGuard\(session\.defaultSession\)/);
  assert.match(mainSource, /callback\(\{ cancel: true \}\)/);
  // Only the unpackaged Vite dev server may use HTTP.
  assert.match(mainSource, /!app\.isPackaged && LOOPBACK_HOSTS\.has/);
});

test('electron startup: an unpackaged launch without a dev URL loads the built renderer', () => {
  assert.match(mainSource, /const devServerUrl = process\.env\.VITE_DEV_SERVER_URL/);
  assert.match(mainSource, /if \(!app\.isPackaged && devServerUrl\)/);
  assert.match(mainSource, /win\.loadFile\(APP_HTML_PATH\)/);
  assert.equal(pkg.scripts.start, 'npm run build:local && node scripts/electron-security-integrity.cjs && electron .');
  assert.equal(pkg.scripts['electron:start'], 'npm run build:local && node scripts/electron-security-integrity.cjs && electron .');
  assert.equal(pkg.scripts['electron:dev'], 'node scripts/electron-dev.mjs');
  assert.match(fs.readFileSync(path.join(root, 'scripts', 'electron-dev.mjs'), 'utf8'), /VITE_DEV_SERVER_URL: devUrl/);
});

test('electron startup: software rasterization remains available when hardware acceleration is disabled', () => {
  assert.match(mainSource, /app\.disableHardwareAcceleration\(\)/);
  assert.doesNotMatch(mainSource, /disable-software-rasterizer/);
});

test('single-device: no server, API or sync stack is shipped', () => {
  const forbiddenDeps = [
    'express', 'fastify', 'koa', 'hapi', '@hapi/hapi', 'socket.io', 'ws',
    'axios', 'node-fetch', 'got', 'superagent', 'mongoose', 'pg', 'mysql', 'mysql2',
    'redis', 'ioredis', 'firebase', 'firebase-admin', '@supabase/supabase-js',
  ];
  const installed = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  for (const dep of forbiddenDeps) {
    assert.equal(installed.includes(dep), false, `${dep} must not be a dependency`);
  }
  for (const [name, command] of Object.entries(pkg.scripts)) {
    if (name === 'preview') continue;
    assert.doesNotMatch(command, /\bserver\/index|\bserve:api|express|fastify/, `script ${name} must not start a server`);
  }
  assert.equal(fs.existsSync(path.join(root, 'server')), false, 'server/ directory must not exist');
});

test('single-device: renderer network access is limited to the central licensing API', () => {
  const offenders: string[] = [];
  const networkPattern = /\bfetch\s*\(|XMLHttpRequest|axios|WebSocket|EventSource|sendBeacon|socket\.io/;
  // The only renderer module allowed to open a network connection is the
  // central licensing/configuration client. Business data and sync stay local
  // and travel through the Electron IPC bridge, never direct HTTP.
  const allowedNetworkFiles = new Set([path.join('src', 'services', 'CentralLicenseService.ts')]);
  for (const file of listSourceFiles(path.join(root, 'src'))) {
    const relative = path.relative(root, file);
    const source = fs.readFileSync(file, 'utf8');
    if (networkPattern.test(source) && !allowedNetworkFiles.has(relative)) {
      offenders.push(relative);
    }
  }
  assert.deepEqual(offenders, []);

  // Cloud sync SDKs must never be bundled into the renderer.
  const cloudSdkPattern = /firebase|@supabase|socket\.io|axios|node-fetch/;
  for (const file of listSourceFiles(path.join(root, 'src'))) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), cloudSdkPattern, `${path.relative(root, file)} must not use a cloud SDK`);
  }
});

test('single-device: database persistence targets one local file', () => {
  assert.match(mainSource, /DATA_DIR/);
  assert.match(mainSource, /ceramisys\.sqlite/);
  assert.match(mainSource, /app\.setPath\('userData', APP_DATA_DIR\)/);
});
