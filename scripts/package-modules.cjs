'use strict';

/**
 * Turn a `CERAMISYS_MODULE_PACKAGES=1` production build into signed module
 * packages for the central server, and optionally strip those files from the
 * installer's dist directory.
 *
 *   CERAMISYS_MODULE_PACKAGES=1 npm run build
 *   CERAMISYS_MODULE_SIGNING_KEY_FILE=key.b64 node scripts/package-modules.cjs \
 *       --dist dist --out module-packages --version 1.1.5 [--strip]
 *
 * Output (this is the directory the central server serves):
 *   <out>/<moduleId>/<version>/manifest.json
 *   <out>/<moduleId>/<version>/manifest.sig
 *   <out>/<moduleId>/<version>/files/assets/<chunk>
 *
 * The signing key is PKCS#8 DER, base64 — keep it out of the repo and out of
 * the installer; only the matching public key is pinned in the app.
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  FORMAT_VERSION, computeBuildId, sha256Hex, signManifest, assertManifestShape,
} = require('../electron/modulePackages.js');

function packageModules({ distDir, outDir, version, privateKey, strip = false }) {
  const planPath = path.join(distDir, 'module-chunks.json');
  if (!fs.existsSync(planPath)) {
    throw new Error('dist/module-chunks.json not found — build with CERAMISYS_MODULE_PACKAGES=1 first.');
  }
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  const buildId = computeBuildId(distDir);
  const written = [];

  for (const [moduleId, files] of Object.entries(plan.modules)) {
    const entries = files.map((relPath) => {
      const bytes = fs.readFileSync(path.join(distDir, relPath));
      return { path: relPath, sha256: sha256Hex(bytes), size: bytes.length, bytes };
    });
    const meta = plan.packages?.[moduleId] || {};
    const manifest = {
      formatVersion: FORMAT_VERSION,
      moduleId,
      version,
      buildId,
      files: entries.map(({ path: p, sha256, size }) => ({ path: p, sha256, size })),
    };
    // Page-level metadata: which registry modules may receive this package and
    // which app routes it serves — the server uses it to withhold packages
    // whose pages are all hidden for a tenant.
    if (Array.isArray(meta.modules) && meta.modules.length) manifest.modules = meta.modules;
    if (Array.isArray(meta.pages) && meta.pages.length) manifest.pages = meta.pages;
    assertManifestShape(manifest);
    const target = path.join(outDir, moduleId, version);
    fs.rmSync(target, { recursive: true, force: true });
    for (const entry of entries) {
      const destination = path.join(target, 'files', entry.path);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, entry.bytes);
    }
    fs.writeFileSync(path.join(target, 'manifest.json'), JSON.stringify(manifest, null, 2));
    fs.writeFileSync(path.join(target, 'manifest.sig'), signManifest(manifest, privateKey));
    written.push({ moduleId, files: entries.length, bytes: entries.reduce((sum, e) => sum + e.size, 0) });
  }

  if (strip) {
    for (const relPath of Object.values(plan.modules).flat()) {
      fs.rmSync(path.join(distDir, relPath), { force: true });
    }
    fs.rmSync(planPath, { force: true });
  }
  return { buildId, written };
}

function readPrivateKey() {
  if (process.env.CERAMISYS_MODULE_SIGNING_KEY) return process.env.CERAMISYS_MODULE_SIGNING_KEY.trim();
  const file = process.env.CERAMISYS_MODULE_SIGNING_KEY_FILE;
  if (file) return fs.readFileSync(file, 'utf8').trim();
  throw new Error('Set CERAMISYS_MODULE_SIGNING_KEY or CERAMISYS_MODULE_SIGNING_KEY_FILE (PKCS#8 DER, base64).');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const option = (name, fallback) => {
    const index = args.indexOf(`--${name}`);
    return index === -1 ? fallback : args[index + 1];
  };
  const version = option('version', require('../package.json').version);
  const result = packageModules({
    distDir: path.resolve(option('dist', 'dist')),
    outDir: path.resolve(option('out', 'module-packages')),
    version,
    privateKey: readPrivateKey(),
    strip: args.includes('--strip'),
  });
  console.log(`Build ${result.buildId.slice(0, 12)}… packaged for version ${version}:`);
  for (const item of result.written) {
    console.log(`  ${item.moduleId}: ${item.files} files, ${(item.bytes / 1024).toFixed(0)} KB`);
  }
}

module.exports = { packageModules };
