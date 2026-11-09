const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const XLSX = require('xlsx');
const {
  registerDatabaseHandlers,
} = require('../electron/databaseHandlers');
const { registerAppHandlers } = require('../electron/appHandlers');
const { registerPrintingHandlers } = require('../electron/printing');

async function createHandlers(
  fsImpl = fs,
  safeStorageOverride,
  openPath = async () => '',
  maxDbSize = 4 * 1024 * 1024,
  validateIpcSenderImpl = () => true,
) {
  const appDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ceramisys-electron-'));
  const dataDir = path.join(appDataDir, 'data');
  const backupDir = path.join(appDataDir, 'backups');
  const dbFile = path.join(dataDir, 'ceramisys.sqlite');
  const handlers = new Map();
  const events = new Map();
  const ipcMain = {
    handle: (name, handler) => handlers.set(name, handler),
    on: (name, handler) => events.set(name, handler),
  };
  const validateIpcSender = validateIpcSenderImpl;
  let restartRequested = 0;
  let shutdownRequested = 0;
  const ensureDirs = () => {
    fsSync.mkdirSync(dataDir, { recursive: true });
    fsSync.mkdirSync(backupDir, { recursive: true });
  };
  const databaseFileExists = async () => {
    try {
      await fs.stat(dbFile);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      throw error;
    }
  };
  const app = { getVersion: () => 'test', isPackaged: false };
  const safeStorage = safeStorageOverride || {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(value),
    decryptString: (value) => value.toString(),
    isAsyncEncryptionAvailable: async () => true,
    encryptStringAsync: async (value) => Buffer.from(value),
    decryptStringAsync: async (value) => ({ result: value.toString(), shouldReEncrypt: false }),
  };

  registerDatabaseHandlers({
    ipcMain, validateIpcSender, app, path, fs: fsImpl, fsSync, safeStorage,
    APP_DATA_DIR: appDataDir, DATA_DIR: dataDir, BACKUP_DIR: backupDir,
    DB_FILE: dbFile, REMEMBERED_CREDENTIALS_FILE: path.join(appDataDir, 'credentials.enc'),
    ensureDirs, databaseFileExists, MAX_DB_SIZE: maxDbSize,
  });
  registerAppHandlers({
    ipcMain, validateIpcSender, app, path, fs,
    shell: { openPath },
    dialog: {}, BrowserWindow: {}, appDataDir, DATA_DIR: dataDir, BACKUP_DIR: backupDir,
    ensureDirs,
    requestGracefulRestart: () => { restartRequested++; },
    requestGracefulShutdown: () => { shutdownRequested++; },
  });
  registerPrintingHandlers({ ipcMain, validateIpcSender, appDataDir, MAX_PRINT_DATA: 1 });

  return {
    appDataDir,
    dataDir,
    backupDir,
    dbFile,
    handlers,
    events,
    event: { senderFrame: { url: 'file:///index.html' } },
    getRestartRequested: () => restartRequested,
    getShutdownRequested: () => shutdownRequested,
  };
}

async function createValidDatabaseBytes() {
  return createDatabaseBytes(['users', 'products', 'system_settings', 'sales_invoices']);
}

async function createDatabaseBytes(tableNames) {
  const sqlJsModule = require('sql.js');
  const initializeSqlJs = sqlJsModule.default || sqlJsModule;
  const SQL = await initializeSqlJs({
    locateFile: (fileName) => path.join(path.dirname(require.resolve('sql.js')), fileName),
  });
  const database = new SQL.Database();
  for (const table of tableNames) {
    database.run(`CREATE TABLE ${table} (id INTEGER PRIMARY KEY)`);
  }
  const bytes = Buffer.from(database.export());
  database.close();
  return bytes;
}

test('registered database handlers initialize directories and load/save within the size limit', async () => {
  const databaseBytes = await createValidDatabaseBytes();
  const context = await createHandlers(fs, undefined, undefined, databaseBytes.length);
  try {
    const { handlers, event, dbFile, dataDir, backupDir } = context;
    assert.equal(await handlers.get('db:load')(event), null);
    assert.ok(fsSync.existsSync(dataDir));
    assert.ok(fsSync.existsSync(backupDir));

    const saved = await handlers.get('db:save')(event, databaseBytes);
    assert.equal(saved.ok, true);
    assert.equal(saved.path, dbFile);
    assert.ok(saved.bytes > databaseBytes.length);
    const encryptedOnDisk = await fs.readFile(dbFile);
    assert.equal(encryptedOnDisk.subarray(0, 16).toString(), 'CERAMISYS-DB\0v1\0');
    assert.deepEqual(
      Array.from(await handlers.get('db:load')(event)),
      Array.from(databaseBytes),
    );
    assert.deepEqual(
      Array.from(await handlers.get('db:decrypt-local-backup')(event, encryptedOnDisk)),
      Array.from(databaseBytes),
    );

    const originalDatabaseFile = await fs.readFile(dbFile);
    const originalConsoleError = console.error;
    let saveError;
    const invalidSaves = [];
    console.error = (...args) => { saveError = args; };
    try {
      for (const invalidBytes of [
        new Uint8Array(0),
        Buffer.from('not a SQLite database'),
        Buffer.concat([Buffer.from('SQLite format 3\0'), Buffer.from([1, 2, 3])]),
        await createDatabaseBytes(['customers', 'sales_invoices', 'sales_returns', 'journal_entries']),
      ]) {
        invalidSaves.push(await handlers.get('db:save')(event, invalidBytes));
      }
    } finally {
      console.error = originalConsoleError;
    }
    for (const invalidSave of invalidSaves) {
      assert.equal(invalidSave.ok, false);
      assert.equal(invalidSave.code, 'DATABASE_INVALID_SQLITE');
      assert.match(invalidSave.error, /valid.*SQLite database/i);
    }
    assert.match(String(saveError && saveError[1]), /valid.*SQLite database/i);
    assert.deepEqual(await fs.readFile(dbFile), originalDatabaseFile);

    const originalConsoleErrorForOversizedSave = console.error;
    let oversizedSave;
    console.error = () => {};
    try {
      oversizedSave = await handlers.get('db:save')(event, Buffer.concat([databaseBytes, Buffer.from([0])]));
    } finally {
      console.error = originalConsoleErrorForOversizedSave;
    }
    assert.match(oversizedSave.error, /الحد المناسب/);

    await fs.writeFile(dbFile, Buffer.alloc(databaseBytes.length + 1));
    await assert.rejects(handlers.get('db:load')(event), /الحد المناسب/);
  } finally {
    await fs.rm(context.appDataDir, { recursive: true, force: true });
  }
});

test('database IPC validates the sender before accessing backup or database files', async () => {
  let validationCalls = 0;
  const validationError = new Error('Rejected IPC sender');
  const context = await createHandlers(
    fs,
    undefined,
    undefined,
    undefined,
    () => {
      validationCalls++;
      throw validationError;
    },
  );
  try {
    await assert.rejects(
      context.handlers.get('db:backup')(context.event, 'manual'),
      (error) => error === validationError,
    );
    assert.equal(validationCalls, 1);
    assert.equal(fsSync.existsSync(context.dataDir), false);
    assert.equal(fsSync.existsSync(context.backupDir), false);

    const originalConsoleError = console.error;
    console.error = () => {};
    let saveResult;
    try {
      saveResult = await context.handlers.get('db:save')(context.event, new Uint8Array([1]));
    } finally {
      console.error = originalConsoleError;
    }
    assert.equal(saveResult.ok, false);
    assert.equal(saveResult.error, validationError.message);
    assert.equal(validationCalls, 2);
    assert.equal(fsSync.existsSync(context.dataDir), false);
    assert.equal(fsSync.existsSync(context.backupDir), false);
  } finally {
    await fs.rm(context.appDataDir, { recursive: true, force: true });
  }
});

test('database secret handlers round-trip authenticated ciphertext and reject tampering', async () => {
  const context = await createHandlers();
  try {
    const encrypt = context.handlers.get('security:encrypt-db-secret');
    const decrypt = context.handlers.get('security:decrypt-db-secret');
    const encrypted = await encrypt(context.event, '7319');
    assert.match(encrypted, /^v1:[a-f0-9]{24}:[a-f0-9]{32}:[a-f0-9]+$/i);
    assert.equal(await decrypt(context.event, encrypted), '7319');
    await assert.rejects(decrypt(context.event, `${encrypted.slice(0, -2)}00`));
    await assert.rejects(encrypt(context.event, ''));
  } finally {
    await fs.rm(context.appDataDir, { recursive: true, force: true });
  }
});

test('database info reports actual on-disk database and encrypted backup statistics', async () => {
  const context = await createHandlers();
  try {
    await fs.mkdir(context.dataDir, { recursive: true });
    await fs.mkdir(context.backupDir, { recursive: true });
    await fs.writeFile(context.dbFile, Buffer.from([1, 2, 3]));
    const backupName = 'ceramisys_auto_daily_test.sqlite.enc';
    await fs.writeFile(path.join(context.backupDir, backupName), Buffer.from([4, 5, 6, 7]));
    await fs.writeFile(path.join(context.backupDir, 'notes.txt'), Buffer.from([8, 9]));

    const info = await context.handlers.get('db:info')(context.event);
    assert.equal(info.exists, true);
    assert.equal(info.bytes, 3);
    assert.equal(info.backups.count, 1);
    assert.equal(info.backups.bytes, 4);
    assert.equal(info.backups.latestName, backupName);
    assert.ok(Number.isFinite(Date.parse(info.backups.latestAt)));
    assert.equal(info.backups.error, null);
  } finally {
    await fs.rm(context.appDataDir, { recursive: true, force: true });
  }
});

test('database handlers persist on Electron versions with synchronous safeStorage APIs', async () => {
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(value),
    decryptString: (value) => value.toString(),
  };
  const context = await createHandlers(fs, safeStorage);
  try {
    const { handlers, event } = context;
    const databaseBytes = await createValidDatabaseBytes();
    const saved = await handlers.get('db:save')(event, databaseBytes);
    assert.equal(saved.ok, true, saved.error);
    assert.deepEqual(Array.from(await handlers.get('db:load')(event)), Array.from(databaseBytes));
  } finally {
    await fs.rm(context.appDataDir, { recursive: true, force: true });
  }
});

test('a failed database write does not replace the last complete database file', async () => {
  let interruptDatabaseWrite = false;
  const interruptedFs = new Proxy(fs, {
    get(target, property) {
      if (property === 'writeFile') {
        return async (filePath, ...args) => {
          if (interruptDatabaseWrite && String(filePath).endsWith('ceramisys.sqlite.tmp')) {
            await fs.writeFile(filePath, Buffer.from('partial database write'));
            throw new Error('simulated interrupted database write');
          }
          return fs.writeFile(filePath, ...args);
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const context = await createHandlers(interruptedFs);
  try {
    const { handlers, event, dbFile } = context;
    const databaseBytes = await createValidDatabaseBytes();
    const replacementBytes = await createValidDatabaseBytes();
    const original = await handlers.get('db:save')(event, databaseBytes);
    assert.equal(original.ok, true);
    const originalBytes = await fs.readFile(dbFile);

    interruptDatabaseWrite = true;
    const originalConsoleError = console.error;
    let loggedError;
    let failed;
    console.error = (...args) => { loggedError = args; };
    try {
      failed = await handlers.get('db:save')(event, replacementBytes);
    } finally {
      console.error = originalConsoleError;
    }
    assert.equal(failed.ok, false);
    assert.match(String(loggedError && loggedError[0]), /Failed to save encrypted database file/);
    assert.deepEqual(await fs.readFile(dbFile), originalBytes);
    assert.deepEqual(
      Array.from(await handlers.get('db:load')(event)),
      Array.from(databaseBytes),
      'the last successfully committed database remains readable',
    );
    assert.equal(fsSync.existsSync(`${dbFile}.tmp`), false, 'the incomplete temporary file is removed');
  } finally {
    await fs.rm(context.appDataDir, { recursive: true, force: true });
  }
});

test('automatic database backups complete when applying the backup strategy', async () => {
  const context = await createHandlers();
  try {
    const { handlers, event, backupDir } = context;
    const saved = await handlers.get('db:save')(event, await createValidDatabaseBytes());
    assert.equal(saved.ok, true);
    await fs.writeFile(path.join(backupDir, 'ceramisys_corrupt_test.sqlite.enc'), 'recovery');

    const backup = await handlers.get('db:backup')(event, 'auto');

    assert.equal(backup.ok, true, backup.error);
    assert.ok(backup.path.startsWith(backupDir));
    assert.equal(fsSync.existsSync(backup.path), true);
  } finally {
    await fs.rm(context.appDataDir, { recursive: true, force: true });
  }
});

test('network backup destination is persisted, isolated from app data, and restore-verified', async (t) => {
  const context = await createHandlers();
  const appRoot = path.parse(context.appDataDir).root.toLowerCase();
  const workingRoot = path.parse(process.cwd()).root.toLowerCase();
  const appDevice = fsSync.statSync(context.appDataDir).dev;
  const workingDevice = fsSync.statSync(process.cwd()).dev;
  if ((process.platform === 'win32' && appRoot === workingRoot)
    || (process.platform !== 'win32' && appDevice === workingDevice)) {
    await fs.rm(context.appDataDir, { recursive: true, force: true });
    t.skip('An independent writable volume is required for offsite backup validation.');
    return;
  }
  const offsiteDir = await fs.mkdtemp(path.join(process.cwd(), '.ceramisys-offsite-'));
  try {
    const { handlers, event, dbFile } = context;
    await fs.mkdir(path.dirname(dbFile), { recursive: true });
    const sqlJsModule = require('sql.js');
    const initializeSqlJs = sqlJsModule.default || sqlJsModule;
    const SQL = await initializeSqlJs({
      locateFile: (fileName) => path.join(path.dirname(require.resolve('sql.js')), fileName),
    });
    const database = new SQL.Database();
    for (const table of ['users', 'products', 'system_settings', 'sales_invoices']) {
      database.run(`CREATE TABLE ${table} (id INTEGER PRIMARY KEY)`);
    }
    await fs.writeFile(dbFile, Buffer.from(database.export()));
    database.close();

    assert.deepEqual(await handlers.get('db:offsite-backup-dir:get')(event), { ok: true, path: null });
    assert.deepEqual(await handlers.get('db:offsite-backup-dir:set')(event, offsiteDir), {
      ok: true,
      path: offsiteDir,
    });
    await assert.rejects(
      handlers.get('db:offsite-backup-dir:set')(event, context.appDataDir),
      /independent|مستقلة/i,
    );
    await assert.rejects(
      handlers.get('db:offsite-backup-dir:set')(event, path.join(context.appDataDir, 'nested')),
      /independent|مستقلة/i,
    );
    assert.deepEqual(await handlers.get('db:offsite-backup-dir:get')(event), {
      ok: true,
      path: offsiteDir,
    });

    const backup = await handlers.get('db:backup')(event, 'manual');
    assert.equal(backup.ok, true, backup.error);
    const offsiteAction = backup.strategy.actions.find((action) => action.type === 'offsite');
    assert.equal(offsiteAction.status, 'complete', offsiteAction.description);
    const offsitePath = path.join(offsiteDir, path.basename(backup.path));
    assert.ok(fsSync.existsSync(offsitePath));

    assert.deepEqual(await handlers.get('db:offsite-backup-dir:set')(event, ''), {
      ok: true,
      path: null,
    });
  } finally {
    await fs.rm(context.appDataDir, { recursive: true, force: true });
    await fs.rm(offsiteDir, { recursive: true, force: true });
  }
});

test('registered app and printing handlers receive their directory and size dependencies', async () => {
  const context = await createHandlers();
  try {
    const { handlers, event, appDataDir, dataDir, backupDir } = context;
    const appInfo = await handlers.get('app:info')(event);
    assert.deepEqual(
      { version: appInfo.version, packaged: appInfo.packaged, dataDir: appInfo.dataDir, backupDir: appInfo.backupDir },
      { version: 'test', packaged: false, dataDir: appDataDir, backupDir },
    );
    assert.equal(appInfo.system.platform, process.platform);
    assert.equal(appInfo.system.arch, process.arch);
    assert.ok(appInfo.system.cpuCount > 0);
    assert.ok(appInfo.system.totalMemoryBytes > 0);
    assert.ok(appInfo.system.freeMemoryBytes > 0);
    assert.ok(appInfo.system.processMemoryBytes > 0);
    assert.equal(typeof appInfo.system.disk.available, 'boolean');
    assert.deepEqual(await handlers.get('app:openFolder')(event, 'data'), {
      ok: true,
      path: dataDir,
    });
    assert.ok(fsSync.existsSync(dataDir));

    assert.deepEqual(
      await handlers.get('print:raw')(event, {
        bytes: [0, 1],
        printerName: 'test-printer',
      }),
      { ok: false, error: 'حجم بيانات الطباعة يتجاوز الحد المسموح به' },
    );
  } finally {
    await fs.rm(context.appDataDir, { recursive: true, force: true });
  }
});

test('opening a folder reports shell.openPath failures', async () => {
  const context = await createHandlers(fs, undefined, async () => 'The folder could not be opened.');
  try {
    assert.deepEqual(await context.handlers.get('app:openFolder')(context.event, 'backups'), {
      ok: false,
      error: 'The folder could not be opened.',
    });
  } finally {
    await fs.rm(context.appDataDir, { recursive: true, force: true });
  }
});

test('application relaunch requests graceful shutdown', async () => {
  const context = await createHandlers();
  try {
    assert.deepEqual(await context.handlers.get('app:relaunch')(context.event), { ok: true });
    assert.equal(context.getRestartRequested(), 1);
  } finally {
    await fs.rm(context.appDataDir, { recursive: true, force: true });
  }
});

test('application shutdown requests a coordinated window close', async () => {
  const context = await createHandlers();
  try {
    assert.deepEqual(await context.handlers.get('app:requestShutdown')(context.event), { ok: true });
    assert.equal(context.getShutdownRequested(), 1);
  } finally {
    await fs.rm(context.appDataDir, { recursive: true, force: true });
  }
});

test('XLSX backup handlers create and restore password-protected Office workbooks', async () => {
  const context = await createHandlers();
  try {
    const { handlers, event } = context;
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([['CeramiSys'], ['backup payload']]),
      'Backup',
    );
    const plainBytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const encrypted = await handlers.get('db:encrypt-xlsx-backup')(
      event,
      new Uint8Array(plainBytes),
      'correct horse battery',
    );

    assert.deepEqual(Array.from(encrypted.subarray(0, 8)), [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    assert.equal(require('officecrypto-tool').isEncrypted(Buffer.from(encrypted)), true);
    const restored = await handlers.get('db:decrypt-xlsx-backup')(
      event,
      encrypted,
      'correct horse battery',
    );
    assert.deepEqual(Buffer.from(restored), plainBytes);
    await assert.rejects(
      handlers.get('db:decrypt-xlsx-backup')(event, encrypted, 'wrong password'),
      /كلمة المرور غير صحيحة/,
    );
  } finally {
    await fs.rm(context.appDataDir, { recursive: true, force: true });
  }
});

test('database backup removal is limited to automatic backup files', async () => {
  const context = await createHandlers();
  try {
    const { handlers, event, dbFile, backupDir } = context;
    await fs.mkdir(path.dirname(dbFile), { recursive: true });
    await fs.writeFile(dbFile, Buffer.from([1, 2, 3]));
    const backup = await handlers.get('db:backup')(event, 'auto');
    const fileName = path.basename(backup.path);
    assert.match(fileName, /^ceramisys_auto_.*\.sqlite\.enc$/);
    assert.equal((await fs.readFile(backup.path)).subarray(0, 16).toString(), 'CERAMISYS-DB\0v1\0');
    assert.ok(fsSync.existsSync(path.join(backupDir, fileName)));

    assert.deepEqual(await handlers.get('db:remove-backup')(event, fileName), {
      ok: true,
      deleted: true,
    });
    assert.ok(!fsSync.existsSync(path.join(backupDir, fileName)));
    await assert.rejects(
      handlers.get('db:remove-backup')(event, '..\\outside.sqlite'),
      /Invalid automatic backup file name/,
    );
  } finally {
    await fs.rm(context.appDataDir, { recursive: true, force: true });
  }
});

test('an interrupted backup publish leaves no visible partial backup', async () => {
  let interruptBackup = false;
  const interruptedFs = new Proxy(fs, {
    get(target, property) {
      if (property === 'writeFile') {
        return async (filePath, ...args) => {
          if (interruptBackup && String(filePath).includes('ceramisys_manual_') && String(filePath).endsWith('.tmp')) {
            await fs.writeFile(filePath, Buffer.from('partial backup'));
            throw new Error('simulated interrupted backup write');
          }
          return fs.writeFile(filePath, ...args);
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const context = await createHandlers(interruptedFs);
  try {
    await fs.mkdir(path.dirname(context.dbFile), { recursive: true });
    const original = Buffer.from('complete database');
    await fs.writeFile(context.dbFile, original);
    interruptBackup = true;

    const result = await context.handlers.get('db:backup')(context.event, 'manual');

    assert.equal(result.ok, false);
    assert.deepEqual(await fs.readFile(context.dbFile), original, 'backup failure never changes the active database');
    assert.deepEqual(await fs.readdir(context.backupDir), [], 'no incomplete backup is exposed');
  } finally {
    await fs.rm(context.appDataDir, { recursive: true, force: true });
  }
});
