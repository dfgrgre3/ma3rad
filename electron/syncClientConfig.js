'use strict';

const { randomBytes } = require('node:crypto');
const { createHttpSyncClient } = require('./syncRelay');

const CONFIG_FILE = 'sync-client-config.enc';

function normalizeConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Sync client configuration must be an object');
  }
  const config = {
    url: input.url,
    token: input.token,
    tenantId: input.tenantId,
    branchId: input.branchId,
    deviceId: input.deviceId,
    canManagePolicies: input.canManagePolicies === true,
  };
  createHttpSyncClient(config);
  return config;
}

function publicConfig(config) {
  if (!config) return null;
  return {
    url: config.url,
    tenantId: config.tenantId,
    branchId: config.branchId,
    deviceId: config.deviceId,
    canManagePolicies: config.canManagePolicies === true,
    tokenConfigured: true,
  };
}

async function loadSyncClientConfig({ appDataDir, fs, path, safeStorage }) {
  const configPath = path.join(appDataDir, CONFIG_FILE);
  let encrypted;
  try {
    encrypted = await fs.readFile(configPath);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error(`Could not read the encrypted sync client configuration: ${error.message || error}`);
  }

  if (!(await safeStorage.isAsyncEncryptionAvailable())) {
    throw new Error('OS secure storage is unavailable; the sync client configuration cannot be opened safely.');
  }
  let parsed;
  try {
    const decrypted = await safeStorage.decryptStringAsync(encrypted);
    parsed = JSON.parse(decrypted.result);
  } catch (error) {
    throw new Error(`Could not decrypt or parse the sync client configuration: ${error.message || error}`);
  }
  return normalizeConfig(parsed);
}

async function saveSyncClientConfig({ appDataDir, fs, path, safeStorage }, input) {
  if (!(await safeStorage.isAsyncEncryptionAvailable())) {
    throw new Error('OS secure storage is unavailable; the sync client token was not saved.');
  }
  let candidate = input;
  if (candidate && typeof candidate.token === 'string' && candidate.token.length === 0) {
    const existing = await loadSyncClientConfig({ appDataDir, fs, path, safeStorage });
    if (!existing) throw new TypeError('A sync token is required for the first configuration.');
    candidate = { ...candidate, token: existing.token };
  }
  const config = normalizeConfig(candidate);
  const configPath = path.join(appDataDir, CONFIG_FILE);
  const temporaryPath = `${configPath}.${randomBytes(8).toString('hex')}.tmp`;
  const encrypted = await safeStorage.encryptStringAsync(JSON.stringify(config));
  try {
    await fs.mkdir(appDataDir, { recursive: true });
    await fs.writeFile(temporaryPath, encrypted, { flag: 'wx', mode: 0o600 });
    await fs.rename(temporaryPath, configPath);
  } catch (error) {
    try { await fs.unlink(temporaryPath); } catch (cleanupError) {
      if (cleanupError.code !== 'ENOENT') throw cleanupError;
    }
    throw new Error(`Could not securely save the sync client configuration: ${error.message || error}`);
  }
  return publicConfig(config);
}

async function clearSyncClientConfig({ appDataDir, fs, path }) {
  try {
    await fs.unlink(path.join(appDataDir, CONFIG_FILE));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Error(`Could not remove the encrypted sync client configuration: ${error.message || error}`);
    }
  }
}

function registerSyncClientConfigHandlers({
  ipcMain,
  validateIpcSender,
  appDataDir,
  fs,
  path,
  safeStorage,
}) {
  const dependencies = { appDataDir, fs, path, safeStorage };
  ipcMain.handle('sync:client-config:get', async (event) => {
    validateIpcSender(event);
    return publicConfig(await loadSyncClientConfig(dependencies));
  });
  ipcMain.handle('sync:client-config:save', async (event, input) => {
    validateIpcSender(event);
    return saveSyncClientConfig(dependencies, input);
  });
  ipcMain.handle('sync:client-config:clear', async (event) => {
    validateIpcSender(event);
    await clearSyncClientConfig(dependencies);
    return { ok: true };
  });
}

module.exports = {
  clearSyncClientConfig,
  loadSyncClientConfig,
  normalizeConfig,
  publicConfig,
  registerSyncClientConfigHandlers,
  saveSyncClientConfig,
};
