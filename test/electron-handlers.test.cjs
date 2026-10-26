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

async function createHandlers() {
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
    ipcMain, validateIpcSender, app, path, fs, fsSync, safeStorage,
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

    assert.deepEqual(
      await handlers.get('db:save')(event, new Uint8Array([1, 2, 3, 4])),
      { ok: true, path: dbFile, bytes: 4 },
    );
    assert.deepEqual(
      Array.from(await handlers.get('db:load')(event)),
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
