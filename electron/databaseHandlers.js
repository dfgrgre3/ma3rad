function registerDatabaseHandlers({
  ipcMain, validateIpcSender, app, path, fs, fsSync, safeStorage,
  APP_DATA_DIR, DATA_DIR, BACKUP_DIR, DB_FILE, REMEMBERED_CREDENTIALS_FILE,
}) {
  ipcMain.handle('db:load', async (event) => {
    validateIpcSender(event);
    ensureDirs();
    if (!(await databaseFileExists())) return null;
    const buffer = await fs.readFile(DB_FILE);
    if (buffer.length > MAX_DB_SIZE) {
      throw new Error('Database file exceeds maximum allowed size');
    }
    return new Uint8Array(buffer);
  });

  ipcMain.handle('db:preserve-corrupt', async (event) => {
    validateIpcSender(event);
    ensureDirs();
    if (!(await databaseFileExists())) {
      throw new Error('قاعدة البيانات الأصلية غير موجودة لإنشاء نسخة استعادة.');
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const target = path.join(BACKUP_DIR, `ceramisys_corrupt_${stamp}.sqlite`);
    await fs.copyFile(DB_FILE, target, fsSync.constants.COPYFILE_EXCL);
    return { path: target, bytes: (await fs.stat(target)).size };
  });

  ipcMain.handle('db:backup-snapshot', async (event, { bytes, label }) => {
    validateIpcSender(event);
    ensureDirs();
    const data = Buffer.from(bytes);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeLabel = String(label || 'snapshot').replace(/[^a-zA-Z0-9_-]/g, '-');
    const target = path.join(BACKUP_DIR, `ceramisys_${safeLabel}_${stamp}.sqlite`);
    const temporaryFile = `${target}.tmp`;
    try {
      await fs.writeFile(temporaryFile, data, { flag: 'wx' });
      await fs.rename(temporaryFile, target);
      return { ok: true, path: target, bytes: data.length };
    } catch (error) {
      try { await fs.unlink(temporaryFile); } catch (cleanupError) {
        if (cleanupError.code !== 'ENOENT') throw cleanupError;
      }
      throw error;
    }
  });

  ipcMain.handle('db:create-fresh-after-recovery', async (event) => {
    validateIpcSender(event);
    ensureDirs();
    if (!(await databaseFileExists())) return { ok: true };

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const target = path.join(BACKUP_DIR, `ceramisys_replaced_${stamp}.sqlite`);
    await fs.copyFile(DB_FILE, target, fsSync.constants.COPYFILE_EXCL);
    await fs.rename(DB_FILE, `${DB_FILE}.replaced-${stamp}`);
    return { ok: true, path: target };
  });

  ipcMain.handle('db:save', async (event, bytes) => {
    validateIpcSender(event);
    try {
      ensureDirs();
      const data = Buffer.from(bytes);
      if (data.length > MAX_DB_SIZE) {
        throw new Error('Database data exceeds maximum allowed size');
      }
      const tmp = `${DB_FILE}.tmp`;
      try {
        await fs.writeFile(tmp, data);
        await fs.rename(tmp, DB_FILE);
      } catch (error) {
        try { await fs.unlink(tmp); } catch (cleanupError) {
          if (cleanupError.code !== 'ENOENT') throw cleanupError;
        }
        throw error;
      }
      return { ok: true, path: DB_FILE, bytes: data.length };
    } catch (error) {
      console.error('Failed to save database file:', error);
      return { ok: false, error: error.message || String(error) };
    }
  });

  ipcMain.handle('db:backup', async (event, label) => {
    validateIpcSender(event);
    try {
      ensureDirs();
      if (!fsSync.existsSync(DB_FILE)) return { ok: false, error: 'قاعدة البيانات غير موجودة بعد' };
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const safeLabel = String(label || 'manual').replace(/[^a-zA-Z0-9_-]/g, '-');
      const target = path.join(BACKUP_DIR, `ceramisys_${safeLabel}_${stamp}.sqlite`);
      await fs.copyFile(DB_FILE, target);
      const stat = await fs.stat(target);
      return { ok: true, path: target, bytes: stat.size };
    } catch (error) {
      console.error('Failed to create backup:', error);
      return { ok: false, error: error.message || String(error) };
    }
  });

  ipcMain.handle('db:info', async (event) => {
    validateIpcSender(event);
    try {
      ensureDirs();
      const exists = fsSync.existsSync(DB_FILE);
      const stat = exists ? await fs.stat(DB_FILE) : null;
      return { path: DB_FILE, exists, bytes: stat ? stat.size : 0, backupDir: BACKUP_DIR };
    } catch (error) {
      return { path: DB_FILE, exists: false, bytes: 0, backupDir: BACKUP_DIR, error: String(error) };
    }
  });

  ipcMain.handle('credentials:get', async (event) => {
    validateIpcSender(event);
    if (!fsSync.existsSync(REMEMBERED_CREDENTIALS_FILE)) return null;
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('التخزين الآمن لكلمات المرور غير متاح على هذا الجهاز.');
    }
    const encrypted = await fs.readFile(REMEMBERED_CREDENTIALS_FILE);
    const credentials = JSON.parse(safeStorage.decryptString(encrypted));
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
    if (typeof username !== 'string' || typeof password !== 'string') {
      throw new Error('بيانات الدخول غير صالحة للحفظ.');
    }
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('التخزين الآمن لكلمات المرور غير متاح على هذا الجهاز.');
    }
    ensureDirs();
    const encrypted = safeStorage.encryptString(JSON.stringify({ username, password, consented: true }));
    const temporaryFile = `${REMEMBERED_CREDENTIALS_FILE}.tmp`;
    await fs.writeFile(temporaryFile, encrypted);
    await fs.rename(temporaryFile, REMEMBERED_CREDENTIALS_FILE);
    return { ok: true };
  });

  ipcMain.handle('credentials:clear', async (event) => {
    validateIpcSender(event);
    try {
      await fs.unlink(REMEMBERED_CREDENTIALS_FILE);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    return { ok: true };
  });
}

module.exports = { registerDatabaseHandlers };
