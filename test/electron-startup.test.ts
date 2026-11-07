import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { DatabaseManager } from '../src/database/db.ts';

const require = createRequire(import.meta.url);
const {
  registerDatabaseHandlers, encryptRecoveryKey, decryptRecoveryKey,
  encryptDatabaseBytes, decryptDatabaseBytes, verifySQLiteDatabaseBytes,
} = require('../electron/databaseHandlers.js');

test('recovery key is portable and restore validation checks SQLite integrity and foreign keys', async () => {
  const key = randomBytes(32);
  const recoveryFile = await encryptRecoveryKey(key, 'safe-recovery-password');
  const recoveredKey = await decryptRecoveryKey(recoveryFile, 'safe-recovery-password');
  assert.deepEqual(recoveredKey, key);
  await assert.rejects(
    () => decryptRecoveryKey(recoveryFile, 'wrong-recovery-password'),
    /تعذر فتح ملف الاسترداد/
  );

  const initializeSqlJs = require('sql.js');
  const SQL = await initializeSqlJs({
    locateFile: (fileName: string) => path.join(path.dirname(require.resolve('sql.js')), fileName),
  });
  const database = new SQL.Database();
  database.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE products (id TEXT PRIMARY KEY);
    CREATE TABLE system_settings (key TEXT PRIMARY KEY);
    CREATE TABLE sales_invoices (id TEXT PRIMARY KEY);
  `);
  const plaintext = Buffer.from(database.export());
  database.close();
  const encrypted = encryptDatabaseBytes(plaintext, recoveredKey);
  const restored = decryptDatabaseBytes(encrypted, recoveredKey);
  assert.deepEqual(restored, plaintext);
  await verifySQLiteDatabaseBytes(restored);

  const corrupt = new SQL.Database();
  corrupt.exec(`
    PRAGMA foreign_keys = OFF;
    CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE products (id TEXT PRIMARY KEY);
    CREATE TABLE system_settings (key TEXT PRIMARY KEY);
    CREATE TABLE sales_invoices (id TEXT PRIMARY KEY);
    CREATE TABLE dependent (user_id TEXT REFERENCES users(id));
    INSERT INTO dependent VALUES ('missing-user');
  `);
  const corruptBytes = Buffer.from(corrupt.export());
  corrupt.close();
  await assert.rejects(() => verifySQLiteDatabaseBytes(corruptBytes), /foreign_key_check/);
});

test('Electron database initialization loads and persists through the registered IPC handlers', async () => {
  const appDataDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'ceramisys-startup-'));
  const dataDir = path.join(appDataDir, 'data');
  const backupDir = path.join(appDataDir, 'backups');
  const dbFile = path.join(dataDir, 'ceramisys.sqlite');
  const handlers = new Map<string, (...args: any[]) => Promise<any>>();
  const ipcMain = { handle: (name: string, handler: (...args: any[]) => Promise<any>) => handlers.set(name, handler) };
  const ensureDirs = () => {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.mkdirSync(backupDir, { recursive: true });
  };
  const databaseFileExists = async () => {
    try {
      await fsPromises.stat(dbFile);
      return true;
    } catch (error: any) {
      if (error.code === 'ENOENT') return false;
      throw error;
    }
  };
  const validateIpcSender = () => true;
  const event = { senderFrame: { url: 'file:///index.html' } };

  registerDatabaseHandlers({
    ipcMain,
    validateIpcSender,
    app: {},
    path,
    fs: fsPromises,
    fsSync: fs,
    safeStorage: {
      isAsyncEncryptionAvailable: async () => true,
      encryptStringAsync: async (value: string) => Buffer.from(value),
      decryptStringAsync: async (value: Buffer) => ({ result: value.toString(), shouldReEncrypt: false }),
    },
    APP_DATA_DIR: appDataDir,
    DATA_DIR: dataDir,
    BACKUP_DIR: backupDir,
    DB_FILE: dbFile,
    REMEMBERED_CREDENTIALS_FILE: path.join(appDataDir, 'credentials.enc'),
    ensureDirs,
    databaseFileExists,
    MAX_DB_SIZE: 500 * 1024 * 1024,
  });

  const calls = { load: 0, save: 0 };
  (globalThis as any).window.ceramisys = {
    db: {
      load: async () => {
        calls.load++;
        return handlers.get('db:load')!(event);
      },
      save: async (bytes: Uint8Array) => {
        calls.save++;
        return handlers.get('db:save')!(event, bytes);
      },
      backup: async (label: string) => handlers.get('db:backup')!(event, label),
      preserveCorrupt: async () => handlers.get('db:preserve-corrupt')!(event),
      createFreshAfterRecovery: async () =>
        handlers.get('db:create-fresh-after-recovery')!(event),
    },
  };

  try {
    await assert.rejects(
      () => handlers.get('db:offsite-backup-dir:set')!(event, path.join(path.dirname(appDataDir), 'same-volume-backups')),
      /وحدة تخزين مستقلة/
    );
    const database = await DatabaseManager.getInstance().initialize();
    assert.ok(database);
    assert.equal(calls.load, 1, 'startup reads the database through db:load');
    assert.ok(calls.save > 0, 'startup persists the initialized database through db:save');
    assert.ok(fs.existsSync(dbFile), 'the initialized SQLite file exists on disk');
  } finally {
    await fsPromises.rm(appDataDir, { recursive: true, force: true });
  }
});
