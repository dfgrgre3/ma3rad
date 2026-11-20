'use strict';

/**
 * Device ↔ central platform channel for downloadable feature modules, plus the
 * file-protocol hook that lets the renderer import installed module chunks.
 *
 * Verification lives in ./modulePackages (signature, build id, SHA-256 per
 * file). This file only moves bytes and exposes a small IPC surface:
 *
 *   modules:status     → what is installed, whether downloads are configured
 *   modules:available  → entitled modules the server offers for this build
 *   modules:install    → download + verify + install one module
 *   modules:remove     → uninstall one module
 *
 * The renderer never supplies URLs or file names: it names a module id, the
 * main process asks the server and installs only what the signed manifest lists.
 */

const path = require('node:path');
const { MODULE_ID_PATTERN } = require('./modulePackages');

const JSON_TIMEOUT_MS = 30 * 1000;
const FILE_TIMEOUT_MS = 5 * 60 * 1000;

function createModuleDelivery({ store, getOrigin, getCredential, getDeviceId, buildId }) {
  const pending = new Map();

  async function request(pathname, timeoutMs) {
    const [origin, deviceId, credential] = await Promise.all([getOrigin(), getDeviceId(), getCredential()]);
    if (!origin) throw new Error('Central API is not configured for this application build.');
    if (!deviceId || !credential) throw new Error('This device is not activated with the central platform.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(new URL(pathname, origin), {
        headers: { 'X-Device-Id': deviceId, 'X-Device-Credential': credential },
        signal: controller.signal,
        redirect: 'error',
      });
      if (!response.ok) {
        let detail = '';
        try { detail = (await response.json())?.error || ''; } catch { /* not JSON */ }
        throw new Error(detail || `Central server returned ${response.status}.`);
      }
      return response;
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchCatalog() {
    const response = await request(`/api/v1/modules/catalog?buildId=${encodeURIComponent(buildId)}`, JSON_TIMEOUT_MS);
    const body = await response.json();
    return Array.isArray(body?.data?.modules) ? body.data.modules : [];
  }

  async function available() {
    const catalog = await fetchCatalog();
    return catalog.map((entry) => ({
      moduleId: entry.moduleId,
      version: entry.version,
      sizeBytes: Array.isArray(entry.manifest?.files)
        ? entry.manifest.files.reduce((sum, file) => sum + (Number(file.size) || 0), 0)
        : 0,
      installed: store.list().some((item) => item.moduleId === entry.moduleId && item.version === entry.version),
    }));
  }

  async function installNow(moduleId) {
    const catalog = await fetchCatalog();
    const entry = catalog.find((item) => item.moduleId === moduleId);
    if (!entry) throw new Error('This module is not available for this device or application build.');
    const sizes = new Map((entry.manifest?.files || []).map((file) => [file.path, Number(file.size)]));
    // store.install verifies signature/build/paths BEFORE calling readFile,
    // then checks size and SHA-256 of every downloaded file.
    return store.install(entry.manifest, entry.signature, async (relPath) => {
      const name = relPath.slice('assets/'.length);
      const response = await request(
        `/api/v1/modules/${encodeURIComponent(entry.moduleId)}/${encodeURIComponent(entry.version)}/files/${encodeURIComponent(name)}`,
        FILE_TIMEOUT_MS,
      );
      const declared = Number(response.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > (sizes.get(relPath) ?? 0)) {
        throw new Error(`Module file "${relPath}" is larger than its signed size.`);
      }
      return Buffer.from(await response.arrayBuffer());
    });
  }

  /** Concurrent requests for the same module share one download. */
  function install(moduleId) {
    if (typeof moduleId !== 'string' || !MODULE_ID_PATTERN.test(moduleId)) {
      return Promise.reject(new Error('Invalid module id.'));
    }
    if (store.isInstalled(moduleId)) return Promise.resolve({ moduleId, version: store.list().find((m) => m.moduleId === moduleId)?.version });
    let job = pending.get(moduleId);
    if (!job) {
      job = installNow(moduleId).finally(() => pending.delete(moduleId));
      pending.set(moduleId, job);
    }
    return job;
  }

  return {
    available,
    install,
    remove: (moduleId) => {
      if (typeof moduleId !== 'string' || !MODULE_ID_PATTERN.test(moduleId)) return Promise.reject(new Error('Invalid module id.'));
      return store.remove(moduleId);
    },
    status: async () => ({
      configured: Boolean(await getOrigin()),
      trustConfigured: Boolean(store.trust.publicKey),
      buildId,
      installed: store.list(),
    }),
  };
}

function registerModuleHandlers({ ipcMain, validateIpcSender, delivery }) {
  ipcMain.handle('modules:status', async (event) => { validateIpcSender(event); return delivery.status(); });
  ipcMain.handle('modules:available', async (event) => { validateIpcSender(event); return delivery.available(); });
  ipcMain.handle('modules:install', async (event, moduleId) => { validateIpcSender(event); return delivery.install(moduleId); });
  ipcMain.handle('modules:remove', async (event, moduleId) => { validateIpcSender(event); await delivery.remove(moduleId); return { ok: true }; });
}

const CONTENT_TYPES = { '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

/**
 * Serve installed module chunks at the SAME file:// URLs the build expects
 * (`<app>/dist/assets/<name>`). Keeping the URL identical matters: module
 * chunks import the app's shared chunks relatively, and the browser must resolve
 * them to the exact instances the core already loaded (one React, one store).
 *
 * Only requests for a missing `dist/assets/<name>` that the verified store
 * holds are answered from the store; every other file request is passed
 * through untouched.
 */
function registerModuleProtocol({ protocol, net, store, distAssetsDir, fileExists, fileURLToPath }) {
  const assetsRoot = path.resolve(distAssetsDir);
  protocol.handle('file', async (request) => {
    try {
      const filePath = path.resolve(fileURLToPath(request.url));
      if (path.dirname(filePath) === assetsRoot) {
        const name = path.basename(filePath);
        const relPath = `assets/${name}`;
        if (store.hasAsset(relPath) && !fileExists(filePath)) {
          const bytes = await store.readAsset(relPath);
          if (bytes) {
            return new Response(bytes, {
              status: 200,
              headers: {
                'Content-Type': CONTENT_TYPES[path.extname(name)] || 'application/octet-stream',
                'X-Content-Type-Options': 'nosniff',
              },
            });
          }
          return new Response('Module file failed verification', { status: 403 });
        }
      }
    } catch { /* fall through to the default loader */ }
    return net.fetch(request.url, { bypassCustomProtocolHandlers: true });
  });
}

module.exports = { createModuleDelivery, registerModuleHandlers, registerModuleProtocol };
