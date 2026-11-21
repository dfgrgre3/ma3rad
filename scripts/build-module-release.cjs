'use strict';

/**
 * Module-package release build — the downloadable-modules variant of
 * `bundle:secure`.
 *
 *   CERAMISYS_MODULE_SIGNING_KEY_FILE=key.b64 npm run build:module-release
 *   npm run electron:dist:modules:x64
 *
 * Steps:
 *   1. bundle:secure with CERAMISYS_MODULE_PACKAGES=1 — the Vite plugin emits
 *      dist/module-chunks.json (one signed package per page plus per-module
 *      shared chunks) and build-info.json marks the build as package-enabled.
 *   2. scripts/package-modules.cjs signs every package with the offline Ed25519
 *      release key and --strip removes those chunks from dist, so the installer
 *      ships only core files. Pages a tenant is not entitled to are never
 *      downloaded because the central server withholds their packages.
 *
 * Afterwards upload module-packages/ to the central server's
 * CENTRAL_MODULE_PACKAGES_DIR, then run electron:dist:modules:* to pack the
 * (already stripped) dist into the NSIS installer.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { packageModules } = require('./package-modules.cjs');

const projectRoot = path.resolve(__dirname, '..');
const packageJson = require(path.join(projectRoot, 'package.json'));

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }
}

function readPrivateKey() {
  if (process.env.CERAMISYS_MODULE_SIGNING_KEY) return process.env.CERAMISYS_MODULE_SIGNING_KEY.trim();
  const file = process.env.CERAMISYS_MODULE_SIGNING_KEY_FILE;
  if (file) return fs.readFileSync(file, 'utf8').trim();
  throw new Error(
    'Set CERAMISYS_MODULE_SIGNING_KEY or CERAMISYS_MODULE_SIGNING_KEY_FILE (PKCS#8 DER, base64). '
    + 'The matching public key is pinned in electron/main.js (PINNED_MODULE_PUBLIC_KEY).',
  );
}

function main() {
  const version = process.env.CERAMISYS_MODULE_VERSION || packageJson.version;
  const outDir = path.resolve(projectRoot, process.env.CERAMISYS_MODULES_OUT || 'module-packages');

  console.log('==> Building commercial frontend with downloadable module packages…');
  run('npm', ['run', 'bundle:secure'], {
    ...process.env,
    CERAMISYS_MODULE_PACKAGES: '1',
  });

  console.log('==> Signing module packages and stripping them from dist…');
  const result = packageModules({
    distDir: path.join(projectRoot, 'dist'),
    outDir,
    version,
    privateKey: readPrivateKey(),
    strip: true,
  });

  const pagePackages = result.written.filter((item) => item.moduleId.startsWith('pg-')).length;
  console.log(`==> ${result.written.length} packages written to ${outDir} (${pagePackages} page packages, build ${result.buildId.slice(0, 12)}…).`);
  for (const item of result.written) {
    console.log(`    ${item.moduleId}: ${item.files} files, ${(item.bytes / 1024).toFixed(0)} KB`);
  }
  console.log('');
  console.log('Next steps:');
  console.log(`  1. Upload ${outDir} to the central server directory CENTRAL_MODULE_PACKAGES_DIR.`);
  console.log('  2. Pack the stripped installer in one shot: npm run electron:dist:modules:x64');
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

module.exports = { main };
