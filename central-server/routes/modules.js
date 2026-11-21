'use strict';

/**
 * Feature-module package delivery — /api/v1/modules (device-authenticated).
 *
 * Serves the signed packages produced by scripts/package-modules.cjs from
 * CENTRAL_MODULE_PACKAGES_DIR. The server never signs anything: signatures are
 * made offline with the release key, so a compromised server cannot make a
 * device run code it did not build. The server's job is entitlement — a device
 * only sees and can only download modules its tenant's plan/license includes.
 *
 * Layout: <dir>/<packageId>/<version>/{manifest.json,manifest.sig,files/assets/*}
 * A packageId is either a business module id (module-shared chunks, legacy
 * packages) or a page package id (`pg-…`). Manifests may carry `modules` +
 * `pages` metadata; visibility (allowed modules ∩ not-all-pages-hidden) is
 * resolved per device through lib/tenantVisibility.
 */

const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { getDb } = require('../lib/db');
const { resolveTenantVisibility, isPackageVisible } = require('../lib/tenantVisibility');
const { authenticateDevice } = require('../lib/deviceAuth');

const router = express.Router();

const MODULE_ID_PATTERN = /^[a-z][a-z0-9-]{0,40}$/;
const VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z._-]{0,63}$/;
const FILE_NAME_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,199}\.(?:js|css)$/;
const BUILD_ID_PATTERN = /^[a-f0-9]{64}$/;

function packagesDir() {
  return path.resolve(process.env.CENTRAL_MODULE_PACKAGES_DIR || path.join(__dirname, '..', 'module-packages'));
}

function compareVersions(a, b) {
  const pa = a.split(/[._-]/);
  const pb = b.split(/[._-]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const x = pa[i] ?? '0';
    const y = pb[i] ?? '0';
    const nx = Number(x);
    const ny = Number(y);
    if (Number.isInteger(nx) && Number.isInteger(ny)) {
      if (nx !== ny) return nx - ny;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

function readPackage(moduleId, version) {
  const dir = path.join(packagesDir(), moduleId, version);
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    const signature = fs.readFileSync(path.join(dir, 'manifest.sig'), 'utf8').trim();
    if (manifest.moduleId !== moduleId || manifest.version !== version) return null;
    return { manifest, signature, dir };
  } catch {
    return null;
  }
}

function listVersions(moduleId) {
  try {
    return fs.readdirSync(path.join(packagesDir(), moduleId), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && VERSION_PATTERN.test(entry.name))
      .map((entry) => entry.name)
      .sort(compareVersions);
  } catch {
    return [];
  }
}

/** Every package id (directory) published under the packages root. */
function listPackageIds() {
  try {
    return fs.readdirSync(packagesDir(), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && MODULE_ID_PATTERN.test(entry.name))
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

// Device identity — X-Device-Id + X-Device-Credential verified against the
// enrolled credential hash (shared with the other device channels).

/**
 * GET /api/v1/modules/catalog?buildId=<sha256>
 * The newest package per entitled module that was built for the caller's build.
 */
router.get('/catalog', authenticateDevice, async (req, res, next) => {
  try {
    const buildId = String(req.query.buildId || '');
    if (!BUILD_ID_PATTERN.test(buildId)) return res.status(400).json({ error: 'buildId is required' });
    // Same visibility inputs as the signed tenant configuration: a package is
    // offered only when one of its modules is allowed AND not every route it
    // serves is hidden — so files of hidden pages never reach the device.
    const visibility = await resolveTenantVisibility(getDb(), req.device);
    const modules = [];
    for (const packageId of listPackageIds()) {
      const version = listVersions(packageId).reverse()
        .find((candidate) => readPackage(packageId, candidate)?.manifest.buildId === buildId);
      if (!version) continue;
      const pkg = readPackage(packageId, version);
      if (!isPackageVisible(pkg.manifest, visibility)) continue;
      modules.push({ moduleId: packageId, version, manifest: pkg.manifest, signature: pkg.signature });
    }
    res.json({ data: { modules }, requestId: req.requestId });
  } catch (err) { next(err); }
});

/** GET /api/v1/modules/:moduleId/:version/files/:name — one file listed in the manifest. */
router.get('/:moduleId/:version/files/:name', authenticateDevice, async (req, res, next) => {
  try {
    const { moduleId, version, name } = req.params;
    if (!MODULE_ID_PATTERN.test(moduleId) || !VERSION_PATTERN.test(version) || !FILE_NAME_PATTERN.test(name)) {
      return res.status(400).json({ error: 'Invalid module file request' });
    }
    const pkg = readPackage(moduleId, version);
    if (!pkg) return res.status(404).json({ error: 'Module file not found' });
    const visibility = await resolveTenantVisibility(getDb(), req.device);
    if (!isPackageVisible(pkg.manifest, visibility)) {
      return res.status(403).json({ error: 'This module is not included in your plan' });
    }
    const listed = pkg.manifest.files?.some((file) => file.path === `assets/${name}`);
    if (!listed) return res.status(404).json({ error: 'Module file not found' });
    const filePath = path.join(pkg.dir, 'files', 'assets', name);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.sendFile(filePath, { dotfiles: 'deny' }, (error) => { if (error && !res.headersSent) next(error); });
  } catch (err) { return next(err); }
});

module.exports = router;
