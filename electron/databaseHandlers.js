const { createCipheriv, createDecipheriv, randomBytes, scrypt } = require('node:crypto');
const { promisify } = require('node:util');
const path = require('node:path');
const os = require('node:os');
const backupStrategyService = require('./backupStrategyService');
const safeStorageCompat = require('./safeStorageCompat');

const DB_MAGIC = Buffer.from('CERAMISYS-DB\0v1\0', 'utf8');
const SQLITE_HEADER = Buffer.from('SQLite format 3\0', 'binary');
const DB_KEY_FILE = 'database-key.enc';
const RECOVERY_FILE_FORMAT = 'CERAMISYS-RECOVERY-KEY';
const RECOVERY_SCRYPT_OPTIONS = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const deriveRecoveryKey = promisify(scrypt);
let sqliteInitializer;

async function decryptStoredString(safeStorage, encrypted) {
  // shouldReEncrypt is a signal to migrate the ciphertext, not to decrypt the
  // same bytes again. Repeating that call can loop forever on some platforms.
  return safeStorageCompat.decryptString(safeStorage, encrypted);
}

async function encryptRecoveryKey(key, password) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('Invalid database encryption key.');
  if (typeof password !== 'string' || password.length < 12 || password.length > 255) {
    throw new Error('يجب أن تتراوح كلمة مرور ملف الاسترداد بين 12 و255 حرفًا.');
  }
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const wrappingKey = await deriveRecoveryKey(password, salt, 32, RECOVERY_SCRYPT_OPTIONS);
  const cipher = createCipheriv('aes-256-gcm', wrappingKey, iv);
  const ciphertext = Buffer.concat([cipher.update(key), cipher.final()]);
  return Buffer.from(JSON.stringify({
    format: RECOVERY_FILE_FORMAT,
    version: 1,
    kdf: 'scrypt',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  }), 'utf8');
}

async function decryptRecoveryKey(bytes, password) {
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) throw new Error('ملف الاسترداد غير صالح.');
  const payloadBytes = Buffer.from(bytes);
  if (payloadBytes.length === 0 || payloadBytes.length > 16 * 1024) throw new Error('حجم ملف الاسترداد غير صالح.');
  if (typeof password !== 'string' || password.length < 12 || password.length > 255) {
    throw new Error('كلمة مرور ملف الاسترداد غير صالحة.');
  }
  let payload;
  try { payload = JSON.parse(payloadBytes.toString('utf8')); }
  catch { throw new Error('ملف الاسترداد تالف أو غير صالح.'); }
  if (!payload || payload.format !== RECOVERY_FILE_FORMAT || payload.version !== 1 || payload.kdf !== 'scrypt') {
    throw new Error('صيغة ملف الاسترداد غير مدعومة.');
  }
  const decodeField = (value, expectedLength, label) => {
    if (typeof value !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
      throw new Error(`حقل ${label} في ملف الاسترداد غير صالح.`);
    }
    const decoded = Buffer.from(value, 'base64');
    if (decoded.length !== expectedLength) throw new Error(`حقل ${label} في ملف الاسترداد غير صالح.`);
    return decoded;
  };
  const salt = decodeField(payload.salt, 16, 'salt');
  const iv = decodeField(payload.iv, 12, 'iv');
  const tag = decodeField(payload.tag, 16, 'tag');
  const ciphertext = decodeField(payload.ciphertext, 32, 'ciphertext');
  const wrappingKey = await deriveRecoveryKey(password, salt, 32, RECOVERY_SCRYPT_OPTIONS);
  try {
    const decipher = createDecipheriv('aes-256-gcm', wrappingKey, iv);
    decipher.setAuthTag(tag);
    const key = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    if (key.length !== 32) throw new Error('Invalid database encryption key.');
    return key;
  } catch {
    throw new Error('تعذر فتح ملف الاسترداد. تحقق من كلمة المرور أو سلامة الملف.');
  }
}

async function verifySQLiteDatabaseBytes(bytes) {
  if (!sqliteInitializer) {
    const loaded = require('sql.js');
    const initialize = loaded && loaded.default ? loaded.default : loaded;
    sqliteInitializer = initialize({
      locateFile: (fileName) => path.join(path.dirname(require.resolve('sql.js')), fileName),
    });
  }
  const SQL = await sqliteInitializer;
  const database = new SQL.Database(Buffer.from(bytes));
  try {
    const integrityRows = database.exec('PRAGMA integrity_check');
    if (integrityRows.length !== 1 || integrityRows[0].values.length !== 1 ||
        integrityRows[0].values[0][0] !== 'ok') {
      throw new Error('فشل PRAGMA integrity_check على قاعدة البيانات المستعادة.');
    }
    if (database.exec('PRAGMA foreign_key_check').some((result) => result.values.length > 0)) {
      throw new Error('فشل PRAGMA foreign_key_check على قاعدة البيانات المستعادة.');
    }
    const requiredTables = ['customers', 'sales_invoices', 'sales_returns', 'journal_entries'];
    for (const tableName of requiredTables) {
      const exists = database.exec(
        'SELECT 1 FROM sqlite_master WHERE type = ? AND name = ? LIMIT 1',
        ['table', tableName]
      );
      if (!exists.length || !exists[0].values.length) {
        throw new Error(`جدول ${tableName} الأساسي غير موجود في قاعدة البيانات المستعادة.`);
      }
      database.exec(`SELECT COUNT(*) FROM "${tableName}"`);
    }
  } finally {
    database.close();
  }
}

function hasDatabaseMagic(bytes) {
  return Buffer.from(bytes).subarray(0, DB_MAGIC.length).equals(DB_MAGIC);
}

async function readOrCreateDatabaseKey({ appDataDir, fs, safeStorage, path, createIfMissing = true }) {
  if (!(await safeStorageCompat.isEncryptionAvailable(safeStorage))) {
    throw new Error('تشفير قاعدة البيانات غير متاح في مخزن النظام الآمن على هذا الجهاز.');
  }
  const keyPath = path.join(appDataDir, DB_KEY_FILE);
  try {
    const encryptedKey = await fs.readFile(keyPath);
    const key = Buffer.from(await decryptStoredString(safeStorage, encryptedKey), 'base64');
    if (key.length !== 32) throw new Error('Invalid database encryption key.');
    return key;
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error(`تعذر فتح مفتاح تشفير قاعدة البيانات: ${error.message || error}`);
    if (!createIfMissing) throw new Error('مفتاح تشفير قاعدة البيانات غير موجود؛ لم يتم تعديل ملف البيانات. استعد مفتاح النظام أو نسخة احتياطية خارجية.');
  }

  const key = randomBytes(32);
  const temporaryPath = `${keyPath}.tmp`;
  const encryptedKey = await safeStorageCompat.encryptString(safeStorage, key.toString('base64'));
  await fs.writeFile(temporaryPath, encryptedKey, { mode: 0o600 });
  await fs.rename(temporaryPath, keyPath);
  return key;
}

function encryptDatabaseBytes(bytes, key) {
  if (hasDatabaseMagic(bytes)) return Buffer.from(bytes);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(bytes)), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([DB_MAGIC, iv, tag, ciphertext]);
}

function decryptDatabaseBytes(bytes, key) {
  const data = Buffer.from(bytes);
  if (!hasDatabaseMagic(data)) return data;
  const offset = DB_MAGIC.length;
  const iv = data.subarray(offset, offset + 12);
  const tag = data.subarray(offset + 12, offset + 28);
  const ciphertext = data.subarray(offset + 28);
  if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) {
    throw new Error('ملف قاعدة البيانات المشفر تالف أو غير مكتمل.');
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error('تعذر فك تشفير قاعدة البيانات. مفتاح النظام غير متاح أو الملف تالف.');
  }
}

async function atomicWrite(fs, filePath, bytes) {
  const temporaryPath = `${filePath}.tmp`;
  try {
    await fs.writeFile(temporaryPath, bytes, { mode: 0o600 });
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    // Preserve the write/rename error. A failed cleanup must not hide the
    // actual reason the database could not be committed.
    try { await fs.unlink(temporaryPath); } catch { /* best effort */ }
    throw error;
  }
}

function atomicWriteSync(fsSync, filePath, bytes) {
  const temporaryPath = `${filePath}.${randomBytes(8).toString('hex')}.tmp`;
  let descriptor;
  try {
    descriptor = fsSync.openSync(temporaryPath, 'wx', 0o600);
    fsSync.writeFileSync(descriptor, bytes);
    fsSync.fsyncSync(descriptor);
    fsSync.closeSync(descriptor);
    descriptor = undefined;
    fsSync.renameSync(temporaryPath, filePath);
    if (process.platform !== 'win32') {
      const directoryDescriptor = fsSync.openSync(path.dirname(filePath), 'r');
      try { fsSync.fsyncSync(directoryDescriptor); } finally { fsSync.closeSync(directoryDescriptor); }
    }
  } catch (error) {
    if (descriptor !== undefined) {
      try { fsSync.closeSync(descriptor); } catch { /* preserve the write failure */ }
    }
    try { fsSync.unlinkSync(temporaryPath); } catch { /* preserve the write failure */ }
    throw error;
  }
}

function readOrCreateDatabaseKeySync({ appDataDir, fsSync, safeStorage, path }) {
  if (typeof safeStorage.isEncryptionAvailable !== 'function' || !safeStorage.isEncryptionAvailable()
    || typeof safeStorage.encryptString !== 'function' || typeof safeStorage.decryptString !== 'function') {
    throw new Error('Synchronous OS secure storage is unavailable; the transaction was not persisted.');
  }

  const keyPath = path.join(appDataDir, DB_KEY_FILE);
  try {
    const key = Buffer.from(safeStorage.decryptString(fsSync.readFileSync(keyPath)), 'base64');
    if (key.length !== 32) throw new Error('Invalid database encryption key.');
    return key;
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error(`تعذر فتح مفتاح تشفير قاعدة البيانات: ${error.message || error}`);
  }

  const key = randomBytes(32);
  const encryptedKey = safeStorage.encryptString(key.toString('base64'));
  atomicWriteSync(fsSync, keyPath, encryptedKey);
  return key;
}

async function atomicCreate(fs, filePath, bytes) {
  const temporaryPath = `${filePath}.${randomBytes(8).toString('hex')}.tmp`;
  try {
    await fs.writeFile(temporaryPath, bytes, { mode: 0o600, flag: 'wx' });
    // link() publishes the completed file atomically and fails if the target exists.
    await fs.link(temporaryPath, filePath);
    await fs.unlink(temporaryPath);
  } catch (error) {
    try { await fs.unlink(temporaryPath); } catch (cleanupError) {
      if (cleanupError.code !== 'ENOENT') throw cleanupError;
    }
    throw error;
  }
}

function describeError(error) {
  const seen = new Set();
  let current = error;
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const message = typeof current.message === 'string' ? current.message.trim() : '';
    const code = typeof current.code === 'string' ? current.code.trim() : '';
    const syscall = typeof current.syscall === 'string' ? current.syscall.trim() : '';
    const path = typeof current.path === 'string' ? current.path.trim() : '';
    const details = [code && `[${code}]`, syscall && `(${syscall})`, path && `— ${path}`]
      .filter(Boolean).join(' ');
    if (message || details) {
      const description = message || 'تعذر حفظ الملف بسبب خطأ في نظام الملفات';
      return details ? `${description} ${details}` : description;
    }
    current = current.cause;
  }
  if (typeof error === 'string' && error.trim()) return error.trim();
  if (error !== null && typeof error !== 'undefined') {
    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== '{}') return serialized;
    } catch { /* use the safe fallback below */ }
  }
  return 'تعذر حفظ ملف قاعدة البيانات بسبب خطأ نظام غير محدد. تحقق من مساحة القرص وصلاحية مجلد بيانات التطبيق.';
}

function registerDatabaseHandlers({
  ipcMain, validateIpcSender, path, fs, fsSync, safeStorage,
  APP_DATA_DIR, DATA_DIR, BACKUP_DIR, DB_FILE, REMEMBERED_CREDENTIALS_FILE,
  ensureDirs, databaseFileExists, MAX_DB_SIZE,
}) {
  const getKey = () => readOrCreateDatabaseKey({ appDataDir: APP_DATA_DIR, fs, fsSync, safeStorage, path });
  const offsiteBackupConfig = path.join(APP_DATA_DIR, 'offsite-backup.json');

  const getOffsiteBackupDir = async () => {
    try {
      const config = JSON.parse(await fs.readFile(offsiteBackupConfig, 'utf8'));
      return typeof config.path === 'string' ? validateOffsiteBackupDir(config.path) : null;
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  };

  const validateOffsiteBackupDir = (directory) => {
    if (typeof directory !== 'string' || !directory.trim() || !path.isAbsolute(directory)) {
      throw new Error('يجب إدخال مسار مطلق لمشاركة الشبكة الخارجية.');
    }
    const resolved = path.resolve(directory.trim());
    const relative = path.relative(path.resolve(APP_DATA_DIR), resolved);
    const isInsideAppData = relative === ''
      || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
    if (isInsideAppData) {
      throw new Error('يجب أن تكون وجهة النسخ الخارجية مستقلة عن مجلد بيانات التطبيق.');
    }
    let existingPath = resolved;
    while (!fsSync.existsSync(existingPath)) {
      const parent = path.dirname(existingPath);
      if (parent === existingPath) throw new Error('تعذر العثور على وحدة تخزين وجهة النسخ.');
      existingPath = parent;
    }
    const targetStat = fsSync.statSync(existingPath);
    if (!targetStat.isDirectory()) throw new Error('يجب أن تكون وجهة النسخ مجلدًا صالحًا.');
    const appStat = fsSync.statSync(APP_DATA_DIR);
    if (process.platform === 'win32') {
      const root = path.parse(resolved).root.toLowerCase();
      const appRoot = path.parse(path.resolve(APP_DATA_DIR)).root.toLowerCase();
      const isUncShare = /^\\\\[^\\]+\\[^\\]+\\/.test(resolved);
      if (!isUncShare && root === appRoot) {
        throw new Error('يجب أن تكون الوجهة مشاركة شبكة أو على وحدة تخزين مستقلة عن وحدة بيانات التطبيق.');
      }
    } else if (targetStat.dev === appStat.dev) {
      throw new Error('يجب أن تكون الوجهة مشاركة شبكة أو على وحدة تخزين مستقلة عن وحدة بيانات التطبيق.');
    }
    return resolved;
  };

  ipcMain.handle('db:load', async (event) => {
    validateIpcSender(event);
    ensureDirs();
    if (!(await databaseFileExists())) return null;
    const fileBytes = await fs.readFile(DB_FILE);
    if (fileBytes.length > MAX_DB_SIZE + 64) {
      throw new Error('Database file exceeds maximum allowed size');
    }
    const plaintext = hasDatabaseMagic(fileBytes)
      ? decryptDatabaseBytes(fileBytes, await readOrCreateDatabaseKey({
          appDataDir: APP_DATA_DIR, fs, safeStorage, path, createIfMissing: false,
        }))
      : fileBytes;
    if (plaintext.length > MAX_DB_SIZE) throw new Error('Database file exceeds maximum allowed size');
    return new Uint8Array(plaintext);
  });

  ipcMain.handle('db:export-recovery-key', async (event, password) => {
    validateIpcSender(event);
    if (!(await databaseFileExists())) throw new Error('أنشئ قاعدة بيانات ونسخة احتياطية قبل تصدير مفتاح الاسترداد.');
    const key = await readOrCreateDatabaseKey({
      appDataDir: APP_DATA_DIR, fs, safeStorage, path, createIfMissing: false,
    });
    const recoveryFile = await encryptRecoveryKey(key, password);
    return new Uint8Array(recoveryFile);
  });

  ipcMain.handle('db:decrypt-backup-with-recovery-key', async (event, backupBytes, recoveryFileBytes, password) => {
    validateIpcSender(event);
    const encrypted = Buffer.from(backupBytes || []);
    if (encrypted.length > MAX_DB_SIZE + 64 || !hasDatabaseMagic(encrypted)) {
      throw new Error('ملف النسخة المشفر غير صالح.');
    }
    const key = await decryptRecoveryKey(recoveryFileBytes, password);
    const plaintext = decryptDatabaseBytes(encrypted, key);
    if (plaintext.length > MAX_DB_SIZE || !plaintext.subarray(0, SQLITE_HEADER.length).equals(SQLITE_HEADER)) {
      throw new Error('الملف المستعاد لا يحتوي على قاعدة SQLite صالحة.');
    }
    await verifySQLiteDatabaseBytes(plaintext);
    return new Uint8Array(plaintext);
  });

  ipcMain.handle('db:preserve-corrupt', async (event) => {
    validateIpcSender(event);
    ensureDirs();
    if (!(await databaseFileExists())) throw new Error('قاعدة البيانات الأصلية غير موجودة لإنشاء نسخة استعادة.');
    const raw = await fs.readFile(DB_FILE);
    const protectedBytes = hasDatabaseMagic(raw)
      ? raw
      : encryptDatabaseBytes(raw, await getKey());
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const target = path.join(BACKUP_DIR, `ceramisys_corrupt_${stamp}.sqlite.enc`);
    await atomicCreate(fs, target, protectedBytes);
    return { path: target, bytes: protectedBytes.length };
  });

  ipcMain.handle('db:create-fresh-after-recovery', async (event) => {
    validateIpcSender(event);
    ensureDirs();
    if (!(await databaseFileExists())) return { ok: true };
    const raw = await fs.readFile(DB_FILE);
    const protectedBytes = hasDatabaseMagic(raw) ? raw : encryptDatabaseBytes(raw, await getKey());
    await atomicWrite(fs, DB_FILE, protectedBytes);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const target = path.join(BACKUP_DIR, `ceramisys_replaced_${stamp}.sqlite.enc`);
    await fs.copyFile(DB_FILE, target, fsSync.constants.COPYFILE_EXCL);
    await fs.rename(DB_FILE, `${DB_FILE}.replaced-${stamp}`);
    return { ok: true, path: target };
  });

  ipcMain.handle('db:save', async (event, bytes) => {
    try {
      // Keep IPC validation failures inside this handler's structured error
      // response so Electron does not strip the original message on rejection.
      validateIpcSender(event);
      ensureDirs();
      if (!(bytes instanceof Uint8Array) && !Array.isArray(bytes)) {
        const error = new TypeError('Database save payload must be a byte array.');
        error.code = 'DATABASE_INVALID_PAYLOAD';
        throw error;
      }
      const data = Buffer.from(bytes);
      if (data.length > MAX_DB_SIZE) throw new Error('Database data exceeds maximum allowed size');
      const key = await getKey();
      const encrypted = encryptDatabaseBytes(data, key);
      await atomicWrite(fs, DB_FILE, encrypted);
      return { ok: true, path: DB_FILE, bytes: encrypted.length };
    } catch (error) {
      const message = describeError(error);
      const code = error && typeof error === 'object' && typeof error.code === 'string'
        ? error.code
        : 'DATABASE_SAVE_FAILED';
      console.error('Failed to save encrypted database file:', error);
      return {
        ok: false,
        code,
        retryable: true,
        error: message,
      };
    }
  });

  if (typeof ipcMain.on === 'function') ipcMain.on('db:save-sync', (event, bytes) => {
    try {
      validateIpcSender(event);
      ensureDirs();
      if (!(bytes instanceof Uint8Array) && !Array.isArray(bytes)) {
        const error = new TypeError('Database save payload must be a byte array.');
        error.code = 'DATABASE_INVALID_PAYLOAD';
        throw error;
      }
      const data = Buffer.from(bytes);
      if (data.length > MAX_DB_SIZE) throw new Error('Database data exceeds maximum allowed size');
      const key = readOrCreateDatabaseKeySync({
        appDataDir: APP_DATA_DIR, fsSync, safeStorage, path,
      });
      const encrypted = encryptDatabaseBytes(data, key);
      atomicWriteSync(fsSync, DB_FILE, encrypted);
      event.returnValue = { ok: true, path: DB_FILE, bytes: encrypted.length };
    } catch (error) {
      const message = describeError(error);
      const code = error && typeof error === 'object' && typeof error.code === 'string'
        ? error.code
        : 'DATABASE_SAVE_FAILED';
      console.error('Failed to synchronously save encrypted database file:', error);
      event.returnValue = { ok: false, code, retryable: true, error: message };
    }
  });

  ipcMain.handle('db:decrypt-local-backup', async (event, bytes) => {
    validateIpcSender(event);
    const encrypted = Buffer.from(bytes || []);
    if (encrypted.length > MAX_DB_SIZE + 64 || !hasDatabaseMagic(encrypted)) {
      throw new Error('ملف النسخة المحلية ليس نسخة مشفرة صالحة.');
    }
    const key = await readOrCreateDatabaseKey({
      appDataDir: APP_DATA_DIR, fs, safeStorage, path, createIfMissing: false,
    });
    const plaintext = decryptDatabaseBytes(encrypted, key);
    if (plaintext.length > MAX_DB_SIZE) throw new Error('Database file exceeds maximum allowed size');
    return new Uint8Array(plaintext);
  });

  ipcMain.handle('db:backup', async (event, label) => {
    validateIpcSender(event);
    try {
      ensureDirs();
      if (!fsSync.existsSync(DB_FILE)) return { ok: false, error: 'قاعدة البيانات غير موجودة بعد' };
      const raw = await fs.readFile(DB_FILE);
      const protectedBytes = hasDatabaseMagic(raw) ? raw : encryptDatabaseBytes(raw, await getKey());
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const safeLabel = String(label || 'manual').replace(/[^a-zA-Z0-9_-]/g, '-');
      const target = path.join(BACKUP_DIR, `ceramisys_${safeLabel}_${stamp}.sqlite.enc`);
      await atomicCreate(fs, target, protectedBytes);

      // تطبيق استراتيجية 3-2-1
      let offsiteBackupDir = null;
      let offsiteConfigError = null;
      try {
        offsiteBackupDir = await getOffsiteBackupDir();
      } catch (error) {
        offsiteConfigError = error;
      }
      const strategy = await backupStrategyService.apply321Strategy({
        BACKUP_DIR,
        DATA_DIR,
        APP_DATA_DIR,
        backupPath: target,
        offsiteBackupDir,
        verifyRestoreImpl: async (offsitePath) => {
          const restoreDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ceramisys-restore-check-'));
          try {
            const restoredPath = path.join(restoreDir, path.basename(offsitePath));
            await fs.copyFile(offsitePath, restoredPath);
            const restoredBytes = await fs.readFile(restoredPath);
            const plaintext = decryptDatabaseBytes(restoredBytes, await getKey());
            if (!plaintext.subarray(0, SQLITE_HEADER.length).equals(SQLITE_HEADER)) {
              throw new Error('الملف المستعاد لا يحتوي على قاعدة SQLite صالحة.');
            }
            await verifySQLiteDatabaseBytes(plaintext);
          } finally {
            await fs.rm(restoreDir, { recursive: true, force: true });
          }
        },
      }, label === 'daily' ? 'daily' : 'full');
      if (offsiteConfigError) {
        const action = strategy.actions.find((item) => item.type === 'offsite');
        if (action) {
          action.status = 'failed';
          action.description = `تعذر استخدام وجهة النسخ الخارجية المحفوظة: ${offsiteConfigError.message || offsiteConfigError}`;
        }
        strategy.recommendations.push({
          type: 'offsite',
          action: 'افتح إعدادات النسخ الاحتياطي واختر مشاركة شبكة أو وحدة تخزين مستقلة صالحة.',
        });
      }

      return {
        ok: true,
        path: target,
        bytes: protectedBytes.length,
        strategy
      };
    } catch (error) {
      console.error('Failed to create encrypted database backup:', error);
      return { ok: false, error: error.message || String(error) };
    }
  });

  ipcMain.handle('db:remove-backup', async (event, fileName) => {
    validateIpcSender(event);
    if (typeof fileName !== 'string' || path.basename(fileName) !== fileName ||
      !/^ceramisys_auto_[A-Za-z0-9_-]+\.sqlite\.enc$/.test(fileName)) {
      throw new Error('Invalid automatic backup file name');
    }
    ensureDirs();
    const backupRoot = path.resolve(BACKUP_DIR);
    const target = path.resolve(backupRoot, fileName);
    if (path.dirname(target) !== backupRoot) throw new Error('Backup file is outside the backup directory');
    try {
      await fs.unlink(target);
      return { ok: true, deleted: true };
    } catch (error) {
      if (error.code === 'ENOENT') return { ok: true, deleted: false };
      throw error;
    }
  });

  ipcMain.handle('db:offsite-backup-dir:get', async (event) => {
    validateIpcSender(event);
    return { ok: true, path: await getOffsiteBackupDir() };
  });

  ipcMain.handle('db:offsite-backup-dir:set', async (event, directory) => {
    validateIpcSender(event);
    ensureDirs();
    const configPath = offsiteBackupConfig;
    if (directory === '') {
      try {
        await fs.unlink(configPath);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      return { ok: true, path: null };
    }
    const resolved = validateOffsiteBackupDir(directory);
    const temporaryPath = `${configPath}.tmp`;
    await fs.writeFile(temporaryPath, JSON.stringify({ path: resolved }), { mode: 0o600 });
    await fs.rename(temporaryPath, configPath);
    return { ok: true, path: resolved };
  });

  ipcMain.handle('db:info', async (event) => {
    validateIpcSender(event);
    try {
      ensureDirs();
      const exists = fsSync.existsSync(DB_FILE);
      const stat = exists ? await fs.stat(DB_FILE) : null;
      let backups = { count: 0, bytes: 0, latestAt: null, latestName: null, error: null };
      try {
        const names = await fs.readdir(BACKUP_DIR);
        const backupFiles = names.filter((name) =>
          /^ceramisys_.*\.sqlite\.enc$/i.test(name)
        );
        const fileStats = await Promise.all(backupFiles.map(async (name) => {
          const fileStat = await fs.stat(path.join(BACKUP_DIR, name));
          return fileStat.isFile()
            ? { name, bytes: fileStat.size, modifiedAt: fileStat.mtime }
            : null;
        }));
        const validBackups = fileStats.filter(Boolean);
        const latest = validBackups.sort((a, b) => b.modifiedAt - a.modifiedAt)[0] || null;
        backups = {
          count: validBackups.length,
          bytes: validBackups.reduce((total, backup) => total + backup.bytes, 0),
          latestAt: latest ? latest.modifiedAt.toISOString() : null,
          latestName: latest ? latest.name : null,
          error: null,
        };
      } catch (error) {
        backups.error = error.message || String(error);
      }
      return {
        path: DB_FILE,
        exists,
        bytes: stat ? stat.size : 0,
        backupDir: BACKUP_DIR,
        backups,
      };
    } catch (error) {
      return { path: DB_FILE, exists: false, bytes: 0, backupDir: BACKUP_DIR, error: String(error) };
    }
  });

ipcMain.handle('db:analyze-backup-strategy', async (event) => {
    validateIpcSender(event);
    try {
      ensureDirs();
      const strategy = await backupStrategyService.analyzeBackupStrategy({ BACKUP_DIR });
      return { ok: true, ...strategy };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

ipcMain.handle('db:backup-stats', async (event) => {
    validateIpcSender(event);
    try {
      ensureDirs();
      const stats = await backupStrategyService.getBackupStrategyStats({ BACKUP_DIR });
      return { ok: true, ...stats };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

ipcMain.handle('db:cleanup-backups', async (event, retention = {}) => {
    validateIpcSender(event);
    try {
      ensureDirs();
      const count = await backupStrategyService.cleanupOldBackups(
        { BACKUP_DIR },
        { daily: retention.daily || 7, weekly: retention.weekly || 4, monthly: retention.monthly || 12 }
      );
      return { ok: true, deleted: count };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });


  ipcMain.handle('credentials:get', async (event) => {
    validateIpcSender(event);
    if (!fsSync.existsSync(REMEMBERED_CREDENTIALS_FILE)) return null;
    if (!(await safeStorageCompat.isEncryptionAvailable(safeStorage))) throw new Error('التخزين الآمن لكلمات المرور غير متاح على هذا الجهاز.');
    const encrypted = await fs.readFile(REMEMBERED_CREDENTIALS_FILE);
    const credentials = JSON.parse(await decryptStoredString(safeStorage, encrypted));
    if (typeof credentials.username !== 'string' || typeof credentials.password !== 'string') {
      throw new Error('بيانات الدخول المحفوظة غير صالحة.');
    }
    if (credentials.consented !== true) {
      await fs.unlink(REMEMBERED_CREDENTIALS_FILE);
      return null;
    }
    return credentials;
  });

  ipcMain.handle('credentials:set', async (event, { username, password }) => {
    validateIpcSender(event);
    if (typeof username !== 'string' || typeof password !== 'string') throw new Error('بيانات الدخول غير صالحة للحفظ.');
    if (!(await safeStorageCompat.isEncryptionAvailable(safeStorage))) throw new Error('التخزين الآمن لكلمات المرور غير متاح على هذا الجهاز.');
    ensureDirs();
    const encrypted = await safeStorageCompat.encryptString(safeStorage, JSON.stringify({ username, password, consented: true }));
    const temporaryFile = `${REMEMBERED_CREDENTIALS_FILE}.tmp`;
    await fs.writeFile(temporaryFile, encrypted, { mode: 0o600 });
    await fs.rename(temporaryFile, REMEMBERED_CREDENTIALS_FILE);
    return { ok: true };
  });

  ipcMain.handle('credentials:clear', async (event) => {
    validateIpcSender(event);
    try { await fs.unlink(REMEMBERED_CREDENTIALS_FILE); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    return { ok: true };
  });
}

module.exports = {
  registerDatabaseHandlers,
  encryptDatabaseBytes,
  decryptDatabaseBytes,
  decryptRecoveryKey,
  encryptRecoveryKey,
  hasDatabaseMagic,
  verifySQLiteDatabaseBytes,
};
