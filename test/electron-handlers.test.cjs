const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const {
  registerDatabaseHandlers,
} = require('../electron/databaseHandlers');
const { registerAppHandlers } = require('../electron/appHandlers');
const { registerPrintingHandlers } = require('../electron/printing');

async function createHandlers(fsImpl = fs) {
  const appDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ceramisys-electron-'));
  const dataDir = path.join(appDataDir, 'data');
  const backupDir = path.join(appDataDir, 'backups');
  const dbFile = path.join(dataDir, 'ceramisys.sqlite');
  const handlers = new Map();
  const ipcMain = {
    handle: (name, handler) => handlers.set(name, handler),
  };
  const validateIpcSender = () => true;
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
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(value),
    decryptString: (value) => value.toString(),
  };

  registerDatabaseHandlers({
    ipcMain, validateIpcSender, app, path, fs: fsImpl, fsSync, safeStorage,
    APP_DATA_DIR: appDataDir, DATA_DIR: dataDir, BACKUP_DIR: backupDir,
    DB_FILE: dbFile, REMEMBERED_CREDENTIALS_FILE: path.join(appDataDir, 'credentials.enc'),
    ensureDirs, databaseFileExists, MAX_DB_SIZE: 4,
  });
  registerAppHandlers({
    ipcMain, validateIpcSender, app, path, fs,
    shell: { openPath: async () => '' },
    dialog: {}, BrowserWindow: {}, appDataDir, DATA_DIR: dataDir, BACKUP_DIR: backupDir,
    ensureDirs,
  });
  registerPrintingHandlers({ ipcMain, validateIpcSender, appDataDir, MAX_PRINT_DATA: 1 });

  return {
    appDataDir,
    dataDir,
    backupDir,
    dbFile,
    handlers,
    event: { senderFrame: { url: 'file:///index.html' } },
  };
}

test('registered database handlers initialize directories and load/save within the size limit', async () => {
  const context = await createHandlers();
  try {
    const { handlers, event, dbFile, dataDir, backupDir } = context;
    assert.equal(await handlers.get('db:load')(event), null);
    assert.ok(fsSync.existsSync(dataDir));
    assert.ok(fsSync.existsSync(backupDir));

    const saved = await handlers.get('db:save')(event, new Uint8Array([1, 2, 3, 4]));
    assert.equal(saved.ok, true);
    assert.equal(saved.path, dbFile);
    assert.ok(saved.bytes > 4);
    const encryptedOnDisk = await fs.readFile(dbFile);
    assert.equal(encryptedOnDisk.subarray(0, 16).toString(), 'CERAMISYS-DB\0v1\0');
    assert.deepEqual(
      Array.from(await handlers.get('db:load')(event)),
      [1, 2, 3, 4],
    );
    assert.deepEqual(
      Array.from(await handlers.get('db:decrypt-local-backup')(event, encryptedOnDisk)),
      [1, 2, 3, 4],
    );
    const originalConsoleError = console.error;
    let saveError;
    let oversizedSave;
    console.error = (...args) => { saveError = args; };
    try {
      oversizedSave = await handlers.get('db:save')(event, new Uint8Array([1, 2, 3, 4, 5]));
    } finally {
      console.error = originalConsoleError;
    }
    assert.match(oversizedSave.error, /maximum allowed size/i);
    assert.match(String(saveError && saveError[1]), /Database data exceeds maximum allowed size/);

    await fs.writeFile(dbFile, Buffer.from([1, 2, 3, 4, 5]));
    await assert.rejects(handlers.get('db:load')(event), /maximum allowed size/i);
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
    const original = await handlers.get('db:save')(event, new Uint8Array([1, 2, 3]));
    assert.equal(original.ok, true);
    const originalBytes = await fs.readFile(dbFile);

    interruptDatabaseWrite = true;
    const originalConsoleError = console.error;
    let loggedError;
    let failed;
    console.error = (...args) => { loggedError = args; };
    try {
      failed = await handlers.get('db:save')(event, new Uint8Array([4, 5, 6]));
    } finally {
      console.error = originalConsoleError;
    }
    assert.equal(failed.ok, false);
    assert.match(String(loggedError && loggedError[0]), /Failed to save encrypted database file/);
    assert.deepEqual(await fs.readFile(dbFile), originalBytes);
    assert.deepEqual(
      Array.from(await handlers.get('db:load')(event)),
      [1, 2, 3],
      'the last successfully committed database remains readable',
    );
    assert.equal(fsSync.existsSync(`${dbFile}.tmp`), false, 'the incomplete temporary file is removed');
  } finally {
    await fs.rm(context.appDataDir, { recursive: true, force: true });
  }
});

test('registered app and printing handlers receive their directory and size dependencies', async () => {
  const context = await createHandlers();
  try {
    const { handlers, event, appDataDir, dataDir, backupDir } = context;
    assert.deepEqual(await handlers.get('app:info')(event), {
      version: 'test',
      packaged: false,
      dataDir: appDataDir,
      backupDir,
    });
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
