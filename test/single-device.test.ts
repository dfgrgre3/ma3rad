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

test('single-device: the renderer has no outbound network calls or cloud sync code', () => {
  const offenders: string[] = [];
  const networkPattern = /\bfetch\s*\(|XMLHttpRequest|axios|WebSocket|EventSource|sendBeacon|socket\.io/;
  const syncPattern = /cloudSync|CloudSync|syncService|SyncService|مزامنة سحابية|cloud_storage|sync_endpoint/;
  for (const file of listSourceFiles(path.join(root, 'src'))) {
    const source = fs.readFileSync(file, 'utf8');
    if (networkPattern.test(source) || syncPattern.test(source)) {
      offenders.push(path.relative(root, file));
    }
  }
  assert.deepEqual(offenders, []);
});

test('single-device: database persistence targets one local file', () => {
  assert.match(mainSource, /DATA_DIR/);
  assert.match(mainSource, /ceramisys\.sqlite/);
  assert.match(mainSource, /app\.setPath\('userData', APP_DATA_DIR\)/);
});
