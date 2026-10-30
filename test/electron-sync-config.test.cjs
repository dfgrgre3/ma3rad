'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  loadSyncClientConfig,
  registerSyncClientConfigHandlers,
} = require('../electron/syncClientConfig');

const TOKEN = 'electron-sync-config-token-with-at-least-thirty-two-bytes';

async function createConfigHandlers() {
  const appDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ceramisys-sync-config-'));
  const handlers = new Map();
  const ipcMain = { handle: (name, handler) => handlers.set(name, handler) };
  const safeStorage = {
    isAsyncEncryptionAvailable: async () => true,
    encryptStringAsync: async (value) => Buffer.from(`encrypted:${Buffer.from(value).toString('base64')}`),
    decryptStringAsync: async (value) => {
      const contents = value.toString();
      if (!contents.startsWith('encrypted:')) throw new Error('Invalid encrypted payload');
      return {
        result: Buffer.from(contents.slice('encrypted:'.length), 'base64').toString('utf8'),
        shouldReEncrypt: false,
      };
    },
  };
  registerSyncClientConfigHandlers({
    ipcMain,
    validateIpcSender: () => true,
    appDataDir,
    fs,
    path,
    safeStorage,
  });
  return {
    appDataDir,
    handlers,
    safeStorage,
    event: { senderFrame: { url: 'file:///index.html' } },
  };
}

function validConfig(overrides = {}) {
  return {
    url: 'https://branch-lan.example:47821',
    token: TOKEN,
    tenantId: 'company-test',
    branchId: 'branch-test',
    deviceId: 'device-test',
    canManagePolicies: false,
    ...overrides,
  };
}

test('sync client configuration is encrypted, reloadable, and never returns its token', async () => {
  const context = await createConfigHandlers();
  try {
    const saved = await context.handlers.get('sync:client-config:save')(context.event, validConfig());
    assert.deepEqual(saved, {
      url: 'https://branch-lan.example:47821',
      tenantId: 'company-test',
      branchId: 'branch-test',
      deviceId: 'device-test',
      canManagePolicies: false,
      tokenConfigured: true,
    });

    const configPath = path.join(context.appDataDir, 'sync-client-config.enc');
    const encryptedFile = await fs.readFile(configPath, 'utf8');
    assert.match(encryptedFile, /^encrypted:/);
    assert.ok(!encryptedFile.includes(TOKEN));

    const loaded = await loadSyncClientConfig({
      appDataDir: context.appDataDir,
      fs,
      path,
      safeStorage: context.safeStorage,
    });
    assert.equal(loaded.token, TOKEN);
    assert.equal(
      (await context.handlers.get('sync:client-config:get')(context.event)).tokenConfigured,
      true,
    );
  } finally {
    await fs.rm(context.appDataDir, { recursive: true, force: true });
  }
});

test('sync client settings preserve an existing token when the UI leaves it blank', async () => {
  const context = await createConfigHandlers();
  try {
    await context.handlers.get('sync:client-config:save')(context.event, validConfig());
    await context.handlers.get('sync:client-config:save')(
      context.event,
      validConfig({ url: 'https://new-branch-lan.example:47821', token: '' }),
    );
    const loaded = await loadSyncClientConfig({
      appDataDir: context.appDataDir,
      fs,
      path,
      safeStorage: context.safeStorage,
    });
    assert.equal(loaded.url, 'https://new-branch-lan.example:47821');
    assert.equal(loaded.token, TOKEN);
  } finally {
    await fs.rm(context.appDataDir, { recursive: true, force: true });
  }
});

test('sync client configuration rejects invalid endpoints and missing first-use tokens', async () => {
  const context = await createConfigHandlers();
  try {
    await assert.rejects(
      context.handlers.get('sync:client-config:save')(
        context.event,
        validConfig({ url: 'http://branch.example:47821' }),
      ),
      /HTTPS/i,
    );
    await assert.rejects(
      context.handlers.get('sync:client-config:save')(
        context.event,
        validConfig({ token: '' }),
      ),
      /token is required/i,
    );
    assert.equal(
      await context.handlers.get('sync:client-config:get')(context.event),
      null,
    );
  } finally {
    await fs.rm(context.appDataDir, { recursive: true, force: true });
  }
});

test('sync client configuration handlers validate their IPC sender', async () => {
  const context = await createConfigHandlers();
  try {
    const guarded = new Map();
    const ipcMain = { handle: (name, handler) => guarded.set(name, handler) };
    const { registerSyncClientConfigHandlers } = require('../electron/syncClientConfig');
    registerSyncClientConfigHandlers({
      ipcMain,
      validateIpcSender: () => { throw new Error('Unauthorized IPC caller'); },
      appDataDir: context.appDataDir,
      fs,
      path,
      safeStorage: context.safeStorage,
    });
    await assert.rejects(
      guarded.get('sync:client-config:get')(context.event),
      /Unauthorized IPC caller/,
    );
  } finally {
    await fs.rm(context.appDataDir, { recursive: true, force: true });
  }
});

test('sync client configuration can be cleared without deleting other app data', async () => {
  const context = await createConfigHandlers();
  try {
    const unrelatedFile = path.join(context.appDataDir, 'keep.txt');
    await fs.writeFile(unrelatedFile, 'preserve');
    await context.handlers.get('sync:client-config:save')(context.event, validConfig());
    assert.deepEqual(
      await context.handlers.get('sync:client-config:clear')(context.event),
      { ok: true },
    );
    assert.equal(await context.handlers.get('sync:client-config:get')(context.event), null);
    assert.equal(await fs.readFile(unrelatedFile, 'utf8'), 'preserve');
  } finally {
    await fs.rm(context.appDataDir, { recursive: true, force: true });
  }
});
