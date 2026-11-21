'use strict';

/**
 * Signed feature-module packages (downloaded renderer chunks).
 *
 * A package is the set of renderer chunks that belong exclusively to one
 * business module. The installer ships without them; a device downloads them
 * on demand after the central server confirms the tenant is entitled.
 *
 * Trust model — nothing downloaded is executed unless ALL of these hold:
 *   1. The manifest carries a valid Ed25519 signature from the pinned module
 *      signing key (separate from the license key, domain-separated payload).
 *   2. The manifest's `buildId` equals this app's build, because chunks import
 *      the app's hashed shared chunks by file name.
 *   3. Every file's SHA-256 and size match the signed manifest.
 *   4. File paths are flat `assets/<name>.js|css` names — no traversal.
 * The signature and hashes are checked again every time installed files are
 * loaded or served, so edits to files on disk are never trusted.
 *
 * This module is pure Node (no Electron) so it can be unit-tested directly.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const FORMAT_VERSION = 1;
const SIGNATURE_DOMAIN = 'ceramisys-module-package-v1\n';
const MODULE_ID_PATTERN = /^[a-z][a-z0-9-]{0,40}$/;
const VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z._-]{0,63}$/;
const ASSET_PATH_PATTERN = /^assets\/[A-Za-z0-9_][A-Za-z0-9_.-]{0,199}\.(?:js|css)$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const PAGE_PATH_PATTERN = /^\/[A-Za-z0-9_~.:/*-]{0,299}$/;
const MAX_FILES = 400;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_PACKAGE_BYTES = 120 * 1024 * 1024;

function canonicalStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(',')}}`;
}

/** The exact bytes that are signed for a manifest. */
function manifestSigningBytes(manifest) {
  return Buffer.from(SIGNATURE_DOMAIN + canonicalStringify(manifest), 'utf8');
}

function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Sign a manifest. Used by the packaging script (never by the app).
 * @param {object} manifest
 * @param {string} privateKeyBase64 PKCS#8 DER, base64.
 */
function signManifest(manifest, privateKeyBase64) {
  const privateKey = crypto.createPrivateKey({
    key: Buffer.from(privateKeyBase64, 'base64'), format: 'der', type: 'pkcs8',
  });
  return crypto.sign(null, manifestSigningBytes(manifest), privateKey).toString('base64');
}

function verifyManifestSignature(manifest, signatureBase64, publicKeyBase64) {
  if (!manifest || !signatureBase64 || !publicKeyBase64) return false;
  try {
    const publicKey = crypto.createPublicKey({
      key: Buffer.from(publicKeyBase64, 'base64'), format: 'der', type: 'spki',
    });
    return crypto.verify(null, manifestSigningBytes(manifest), publicKey, Buffer.from(signatureBase64, 'base64'));
  } catch {
    return false;
  }
}

/** Structural validation only (shape, safe names, limits). Throws with a reason. */
function assertManifestShape(manifest) {
  const fail = (reason) => { throw new Error(`Invalid module manifest: ${reason}`); };
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) fail('not an object');
  if (manifest.formatVersion !== FORMAT_VERSION) fail('unsupported format version');
  if (typeof manifest.moduleId !== 'string' || !MODULE_ID_PATTERN.test(manifest.moduleId)) fail('bad module id');
  if (typeof manifest.version !== 'string' || !VERSION_PATTERN.test(manifest.version)) fail('bad version');
  if (typeof manifest.buildId !== 'string' || !SHA256_PATTERN.test(manifest.buildId)) fail('bad build id');
  if (!Array.isArray(manifest.files) || manifest.files.length === 0 || manifest.files.length > MAX_FILES) fail('bad file list');
  // Optional page-level metadata (signed like everything else): which registry
  // modules may receive this package and which app routes it serves.
  if (manifest.modules !== undefined) {
    if (!Array.isArray(manifest.modules) || manifest.modules.length > 32
      || manifest.modules.some((id) => typeof id !== 'string' || !MODULE_ID_PATTERN.test(id))) {
      fail('bad modules list');
    }
  }
  if (manifest.pages !== undefined) {
    if (!Array.isArray(manifest.pages) || manifest.pages.length > 200
      || manifest.pages.some((p) => typeof p !== 'string' || !PAGE_PATH_PATTERN.test(p))) {
      fail('bad pages list');
    }
  }
  const seen = new Set();
  let total = 0;
  for (const file of manifest.files) {
    if (!file || typeof file !== 'object') fail('bad file entry');
    if (typeof file.path !== 'string' || !ASSET_PATH_PATTERN.test(file.path)) fail(`unsafe file path "${String(file.path)}"`);
    if (seen.has(file.path)) fail(`duplicate file path "${file.path}"`);
    seen.add(file.path);
    if (typeof file.sha256 !== 'string' || !SHA256_PATTERN.test(file.sha256)) fail(`bad hash for "${file.path}"`);
    if (!Number.isInteger(file.size) || file.size < 0 || file.size > MAX_FILE_BYTES) fail(`bad size for "${file.path}"`);
    total += file.size;
  }
  if (total > MAX_PACKAGE_BYTES) fail('package too large');
}

/**
 * Full authenticity check: signature first (so nothing in an unsigned manifest
 * is acted on), then shape, then build compatibility.
 */
function verifyManifest(manifest, signature, { publicKey, buildId }) {
  if (!publicKey) throw new Error('Module signing key is not configured; module packages are refused.');
  if (!verifyManifestSignature(manifest, signature, publicKey)) {
    throw new Error('Module package signature is invalid.');
  }
  assertManifestShape(manifest);
  if (!buildId || manifest.buildId !== buildId) {
    throw new Error('Module package was built for a different application build.');
  }
  return manifest;
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * On-disk store of verified module packages.
 *
 * Layout: <root>/<moduleId>/<version>/{manifest.json,manifest.sig,assets/*}
 *         <root>/active.json  → { "<moduleId>": "<version>" }
 */
class ModuleStore {
  /**
   * @param {string} rootDir
   * @param {{ publicKey: string, buildId: string }} trust
   */
  constructor(rootDir, trust) {
    this.rootDir = path.resolve(rootDir);
    this.trust = trust;
    /** @type {Map<string, { abs: string, sha256: string, size: number, moduleId: string }>} */
    this.assets = new Map();
    /** @type {Map<string, string>} moduleId → version */
    this.active = new Map();
    /** @type {Map<string, { key: string, ok: true }>} */
    this.verifiedCache = new Map();
  }

  get activeFile() { return path.join(this.rootDir, 'active.json'); }

  /** Rebuild the in-memory index from disk, re-verifying every active package. */
  async load() {
    this.assets.clear();
    this.active.clear();
    this.verifiedCache.clear();
    let activeMap = {};
    try { activeMap = JSON.parse(await fsp.readFile(this.activeFile, 'utf8')); } catch { return; }
    if (!activeMap || typeof activeMap !== 'object') return;
    for (const [moduleId, version] of Object.entries(activeMap)) {
      try { await this.#indexVersion(moduleId, String(version)); } catch { /* invalid install is ignored, not served */ }
    }
  }

  async #indexVersion(moduleId, version) {
    if (!MODULE_ID_PATTERN.test(moduleId) || !VERSION_PATTERN.test(version)) throw new Error('bad id');
    const dir = path.join(this.rootDir, moduleId, version);
    const manifest = JSON.parse(await fsp.readFile(path.join(dir, 'manifest.json'), 'utf8'));
    const signature = (await fsp.readFile(path.join(dir, 'manifest.sig'), 'utf8')).trim();
    verifyManifest(manifest, signature, this.trust);
    if (manifest.moduleId !== moduleId || manifest.version !== version) throw new Error('manifest mismatch');
    for (const file of manifest.files) {
      const abs = path.join(dir, file.path);
      if (!isInside(dir, abs)) throw new Error('path escape');
      this.assets.set(file.path, { abs, sha256: file.sha256, size: file.size, moduleId });
    }
    this.active.set(moduleId, version);
  }

  isInstalled(moduleId) { return this.active.has(moduleId); }

  list() {
    return [...this.active.entries()].map(([moduleId, version]) => ({ moduleId, version }));
  }

  /**
   * Install a package. `readFile(relPath)` returns the file bytes; files are
   * hashed before anything is written, so a bad file leaves no trace.
   */
  async install(manifest, signature, readFile) {
    verifyManifest(manifest, signature, this.trust);
    const { moduleId, version } = manifest;
    const staged = new Map();
    for (const file of manifest.files) {
      const bytes = Buffer.from(await readFile(file.path));
      if (bytes.length !== file.size || sha256Hex(bytes) !== file.sha256) {
        throw new Error(`Module file "${file.path}" does not match the signed manifest.`);
      }
      staged.set(file.path, bytes);
    }

    const moduleDir = path.join(this.rootDir, moduleId);
    const finalDir = path.join(moduleDir, version);
    const tempDir = path.join(moduleDir, `.${version}.${process.pid}.${Date.now()}.tmp`);
    await fsp.mkdir(path.join(tempDir, 'assets'), { recursive: true });
    try {
      for (const [relPath, bytes] of staged) await fsp.writeFile(path.join(tempDir, relPath), bytes);
      await fsp.writeFile(path.join(tempDir, 'manifest.json'), JSON.stringify(manifest));
      await fsp.writeFile(path.join(tempDir, 'manifest.sig'), signature);
      await fsp.rm(finalDir, { recursive: true, force: true });
      await fsp.rename(tempDir, finalDir);
    } catch (error) {
      await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      throw error;
    }

    const previous = this.active.get(moduleId);
    await this.#writeActive({ ...Object.fromEntries(this.active), [moduleId]: version });
    await this.load();
    if (previous && previous !== version) {
      await fsp.rm(path.join(moduleDir, previous), { recursive: true, force: true }).catch(() => {});
    }
    return { moduleId, version };
  }

  async remove(moduleId) {
    if (!MODULE_ID_PATTERN.test(moduleId)) throw new Error('Invalid module id.');
    const next = Object.fromEntries(this.active);
    delete next[moduleId];
    await this.#writeActive(next);
    await fsp.rm(path.join(this.rootDir, moduleId), { recursive: true, force: true });
    await this.load();
  }

  async #writeActive(map) {
    await fsp.mkdir(this.rootDir, { recursive: true });
    const temp = `${this.activeFile}.${process.pid}.tmp`;
    await fsp.writeFile(temp, JSON.stringify(map));
    await fsp.rename(temp, this.activeFile);
  }

  /** Does this store hold the asset (flat `assets/<name>` path)? */
  hasAsset(relPath) { return this.assets.has(relPath); }

  /**
   * Read an installed asset, re-checking size and SHA-256 against the signed
   * manifest. Returns null when the asset is unknown or fails verification.
   */
  async readAsset(relPath) {
    const entry = this.assets.get(relPath);
    if (!entry) return null;
    let stat;
    try { stat = await fsp.stat(entry.abs); } catch { return null; }
    const bytes = await fsp.readFile(entry.abs);
    const key = `${stat.mtimeMs}:${stat.size}`;
    const cached = this.verifiedCache.get(relPath);
    if (!cached || cached.key !== key) {
      if (bytes.length !== entry.size || sha256Hex(bytes) !== entry.sha256) return null;
      this.verifiedCache.set(relPath, { key, ok: true });
    }
    return bytes;
  }
}

/** Build id of the running app: SHA-256 of the packaged renderer entry HTML. */
function computeBuildId(distDir) {
  return sha256Hex(fs.readFileSync(path.join(distDir, 'index.html')));
}

module.exports = {
  FORMAT_VERSION,
  ASSET_PATH_PATTERN,
  MODULE_ID_PATTERN,
  ModuleStore,
  assertManifestShape,
  canonicalStringify,
  computeBuildId,
  manifestSigningBytes,
  sha256Hex,
  signManifest,
  verifyManifest,
  verifyManifestSignature,
};
