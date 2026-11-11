const crypto = require('node:crypto');
const safeStorageCompat = require('./safeStorageCompat');

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_OCR_IMAGE_BYTES = 12 * 1024 * 1024;
const STORAGE_NAME_PATTERN = /^doc_[a-f0-9]{32}\.[a-z0-9]{1,10}$/i;
const EMPLOYEE_STORAGE_NAME_PATTERN = /^hrdoc_[a-f0-9]{32}\.(pdf|png|jpg|jpeg|webp|gif)$/i;
const ENCRYPTED_DOCUMENT_MAGIC = Buffer.from('CERAMISYS-DOC\0v1\0');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const EMPLOYEE_MIME_BY_EXTENSION = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

const MIME_BY_EXTENSION = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.zip': 'application/zip',
};

function isSafeFileName(fileName) {
  return typeof fileName === 'string'
    && !fileName.includes('/')
    && !fileName.includes('\\')
    && !Array.from(fileName).some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    });
}

function isInside(parent, candidate) {
  const base = pathResolveWithSeparator(parent);
  const target = pathResolveWithSeparator(candidate);
  const normalizedBase = process.platform === 'win32' ? base.toLowerCase() : base;
  const normalizedTarget = process.platform === 'win32' ? target.toLowerCase() : target;
  return normalizedTarget.startsWith(normalizedBase) && normalizedTarget !== normalizedBase.slice(0, -1);
}

let pathResolveWithSeparator = (value) => value;

function configurePath(pathModule) {
  pathResolveWithSeparator = (value) => {
    const resolved = pathModule.resolve(value);
    return resolved.endsWith(pathModule.sep) ? resolved : `${resolved}${pathModule.sep}`;
  };
  return pathModule;
}

function registerDocumentHandlers({
  ipcMain,
  validateIpcSender,
  path,
  fs,
  fsSync,
  shell,
  dialog,
  app,
  safeStorage,
  appDataDir,
}) {
  const pathModule = configurePath(path);
  const DOCUMENTS_DIR = pathModule.join(appDataDir, 'documents');
  const OPEN_DIR = pathModule.join(appDataDir, '.document-open');
  const pendingEmployeeImports = new Set();
  let ocrWorkerPromise = null;
  let ocrQueue = Promise.resolve();
  let vaultInitialization = null;

  const ensureDocumentsDir = () => {
    fsSync.mkdirSync(DOCUMENTS_DIR, { recursive: true, mode: 0o700 });
  };

  const assertEncryptionAvailable = async () => {
    if (!safeStorage || !(await safeStorageCompat.isEncryptionAvailable(safeStorage))) {
      throw new Error('تشفير مرفقات المستندات غير متاح في هذا النظام؛ لم يتم حفظ الملف.');
    }
  };

  const encryptDocument = async (bytes) => {
    await assertEncryptionAvailable();
    const dataKey = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', dataKey, iv);
    cipher.setAAD(ENCRYPTED_DOCUMENT_MAGIC);
    const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
    const wrappedKey = Buffer.from(await safeStorageCompat.encryptString(safeStorage, dataKey.toString('base64')));
    const keyLength = Buffer.alloc(4);
    keyLength.writeUInt32BE(wrappedKey.length);
    return Buffer.concat([
      ENCRYPTED_DOCUMENT_MAGIC,
      keyLength,
      wrappedKey,
      iv,
      cipher.getAuthTag(),
      ciphertext,
    ]);
  };

  const decryptDocument = async (storedBytes) => {
    await assertEncryptionAvailable();
    const headerLength = ENCRYPTED_DOCUMENT_MAGIC.length + 4;
    if (storedBytes.length < headerLength || !storedBytes.subarray(0, ENCRYPTED_DOCUMENT_MAGIC.length).equals(ENCRYPTED_DOCUMENT_MAGIC)) {
      throw new Error('صيغة ملف المستند المشفر غير صالحة.');
    }
    const keyLength = storedBytes.readUInt32BE(ENCRYPTED_DOCUMENT_MAGIC.length);
    const keyStart = headerLength;
    const ivStart = keyStart + keyLength;
    const tagStart = ivStart + 12;
    const ciphertextStart = tagStart + 16;
    if (!keyLength || ciphertextStart > storedBytes.length) {
      throw new Error('ملف المستند المشفر تالف أو غير مكتمل.');
    }

    const wrappedKey = storedBytes.subarray(keyStart, ivStart);
    const keyText = await safeStorageCompat.decryptString(safeStorage, wrappedKey);
    const dataKey = Buffer.from(keyText, 'base64');
    if (dataKey.length !== 32) throw new Error('مفتاح تشفير المستند غير صالح.');

    const decipher = crypto.createDecipheriv('aes-256-gcm', dataKey, storedBytes.subarray(ivStart, tagStart));
    decipher.setAAD(ENCRYPTED_DOCUMENT_MAGIC);
    decipher.setAuthTag(storedBytes.subarray(tagStart, ciphertextStart));
    return Buffer.concat([
      decipher.update(storedBytes.subarray(ciphertextStart)),
      decipher.final(),
    ]);
  };

  const writeEncryptedDocument = async (target, bytes) => {
    const encrypted = await encryptDocument(bytes);
    const temporaryPath = `${target}.${crypto.randomBytes(8).toString('hex')}.tmp`;
    try {
      await fs.writeFile(temporaryPath, encrypted, { flag: 'wx', mode: 0o600 });
      await fs.rename(temporaryPath, target);
    } catch (error) {
      try {
        await fs.unlink(temporaryPath);
      } catch (cleanupError) {
        if (cleanupError.code !== 'ENOENT') {
          console.error('Could not clean up temporary encrypted document:', cleanupError);
        }
      }
      throw error;
    }
  };

  const initializeVault = async () => {
    ensureDocumentsDir();
    await assertEncryptionAvailable();
    if (fsSync.existsSync(OPEN_DIR)) fsSync.rmSync(OPEN_DIR, { recursive: true, force: true });

    for (const entry of await fs.readdir(DOCUMENTS_DIR, { withFileTypes: true })) {
      if (!entry.isFile() || (!STORAGE_NAME_PATTERN.test(entry.name) && !EMPLOYEE_STORAGE_NAME_PATTERN.test(entry.name))) continue;
      const target = pathModule.join(DOCUMENTS_DIR, entry.name);
      const storedBytes = await fs.readFile(target);
      if (storedBytes.subarray(0, ENCRYPTED_DOCUMENT_MAGIC.length).equals(ENCRYPTED_DOCUMENT_MAGIC)) continue;
      const plaintext = Buffer.from(storedBytes);
      if (plaintext.length > MAX_ATTACHMENT_BYTES) {
        throw new Error(`تعذر ترحيل المرفق القديم ${entry.name}: حجمه يتجاوز الحد المسموح.`);
      }
      await writeEncryptedDocument(target, plaintext);
    }
  };

  const ensureVault = () => {
    if (!vaultInitialization) {
      vaultInitialization = initializeVault().catch((error) => {
        vaultInitialization = null;
        throw error;
      });
    }
    return vaultInitialization;
  };

  const cleanupOpenFiles = () => {
    try {
      fsSync.rmSync(OPEN_DIR, { recursive: true, force: true });
    } catch (error) {
      console.error('Could not remove temporary decrypted documents:', error);
    }
  };

  if (app && typeof app.on === 'function') app.on('will-quit', cleanupOpenFiles);

  const getOcrWorker = () => {
    if (!ocrWorkerPromise) {
      ocrWorkerPromise = (async () => {
        const languageDirectory = pathModule.join(appDataDir, 'ocr-languages');
        fsSync.mkdirSync(languageDirectory, { recursive: true });
        for (const code of ['ara', 'eng']) {
          const packagePath = require.resolve(`@tesseract.js-data/${code}`);
          const sourcePath = pathModule.join(pathModule.dirname(packagePath), '4.0.0_best_int', `${code}.traineddata.gz`);
          const targetPath = pathModule.join(languageDirectory, `${code}.traineddata.gz`);
          const sourceSize = fsSync.statSync(sourcePath).size;
          if (!fsSync.existsSync(targetPath) || fsSync.statSync(targetPath).size !== sourceSize) {
            fsSync.copyFileSync(sourcePath, targetPath);
          }
        }
        const { createWorker, OEM, PSM } = require('tesseract.js');
        const worker = await createWorker('ara+eng', OEM.LSTM_ONLY, {
          langPath: languageDirectory,
          cacheMethod: 'none',
          gzip: true,
        });
        await worker.setParameters({
          preserve_interword_spaces: '1',
          tessedit_pageseg_mode: PSM.AUTO,
          user_defined_dpi: '300',
        });
        return worker;
      })().catch((error) => {
        ocrWorkerPromise = null;
        throw error;
      });
    }
    return ocrWorkerPromise;
  };

  const recognizeImage = (image) => {
    const task = ocrQueue.then(async () => {
      const worker = await getOcrWorker();
      const result = await worker.recognize(image);
      return result.data.text;
    });
    ocrQueue = task.then(() => undefined, () => undefined);
    return task;
  };

  ipcMain.handle('documents:import', async (event, options = {}) => {
    validateIpcSender(event);
    const employeeDocument = options?.purpose === 'employee';
    try {
      await ensureVault();
    } catch (error) {
      console.error('Document vault initialization failed:', error);
      return { ok: false, error: String(error?.message || error) };
    }

    const selection = await dialog.showOpenDialog({
      title: 'اختيار ملف المستند',
      properties: ['openFile'],
      filters: employeeDocument
        ? [{ name: 'مستندات الموظفين (PDF وصور)', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif'] }]
        : [
          { name: 'المستندات', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'zip'] },
          { name: 'كل الملفات', extensions: ['*'] },
        ],
    });
    if (selection.canceled || !selection.filePaths?.length) {
      return { ok: false, canceled: true };
    }

    const sourcePath = selection.filePaths[0];
    try {
      const stat = await fs.stat(sourcePath);
      if (!stat.isFile()) return { ok: false, error: 'المسار المحدد ليس ملفًا.' };
      if (stat.size > MAX_ATTACHMENT_BYTES) {
        return { ok: false, error: 'حجم الملف يتجاوز الحد المسموح (25 ميجابايت).' };
      }

      const extension = pathModule.extname(sourcePath).toLowerCase();
      if (employeeDocument && !EMPLOYEE_MIME_BY_EXTENSION[extension]) {
        return { ok: false, error: 'يسمح فقط بملفات PDF والصور المدعومة.' };
      }
      const safeExtension = /^\.[a-z0-9]{1,10}$/.test(extension) ? extension : '';
      const storageName = `${employeeDocument ? 'hrdoc_' : 'doc_'}${crypto.randomUUID().replace(/-/g, '')}${safeExtension}`;
      const destination = pathModule.join(DOCUMENTS_DIR, storageName);
      if (!isInside(DOCUMENTS_DIR, destination)) {
        return { ok: false, error: 'مسار التخزين غير صالح.' };
      }

      const bytes = await fs.readFile(sourcePath);
      if (bytes.length > MAX_ATTACHMENT_BYTES) {
        return { ok: false, error: 'حجم الملف يتجاوز الحد المسموح (25 ميجابايت).' };
      }
      if (employeeDocument) {
        const validContent = extension === '.pdf'
          ? bytes.subarray(0, 5).toString() === '%PDF-'
          : extension === '.png'
            ? bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
            : extension === '.jpg' || extension === '.jpeg'
              ? bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
              : extension === '.webp'
                ? bytes.length >= 12 && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP'
                : bytes.subarray(0, 6).toString() === 'GIF87a' || bytes.subarray(0, 6).toString() === 'GIF89a';
        if (!validContent) return { ok: false, error: 'محتوى الملف لا يطابق نوع PDF أو الصورة المحدد.' };
      }
      await writeEncryptedDocument(destination, bytes);
      const checksum = crypto.createHash('sha256').update(bytes).digest('hex');
      if (employeeDocument) pendingEmployeeImports.add(storageName);

      return {
        ok: true,
        storageName,
        fileName: pathModule.basename(sourcePath).slice(0, 255),
        mimeType: (employeeDocument ? EMPLOYEE_MIME_BY_EXTENSION[safeExtension] : MIME_BY_EXTENSION[safeExtension]) || 'application/octet-stream',
        fileSize: bytes.length,
        checksum,
      };
    } catch (error) {
      console.error('Document import failed:', error);
      return { ok: false, error: String(error?.message || error) };
    }
  });

  ipcMain.handle('documents:employee-import-commit', async (event, storageName) => {
    validateIpcSender(event);
    if (typeof storageName !== 'string' || !EMPLOYEE_STORAGE_NAME_PATTERN.test(storageName)
      || !pendingEmployeeImports.has(storageName)) {
      return { ok: false, error: 'الملف ليس رفعًا مؤقتًا صالحًا.' };
    }
    pendingEmployeeImports.delete(storageName);
    return { ok: true };
  });

  ipcMain.handle('documents:employee-import-discard', async (event, storageName) => {
    validateIpcSender(event);
    if (typeof storageName !== 'string' || !EMPLOYEE_STORAGE_NAME_PATTERN.test(storageName)
      || !pendingEmployeeImports.has(storageName)) {
      return { ok: false, error: 'الملف ليس رفعًا مؤقتًا صالحًا.' };
    }
    const target = pathModule.resolve(DOCUMENTS_DIR, storageName);
    if (!EMPLOYEE_STORAGE_NAME_PATTERN.test(storageName) || !isInside(DOCUMENTS_DIR, target)) {
      return { ok: false, error: 'اسم الملف غير صالح.' };
    }
    try {
      await fs.unlink(target);
      pendingEmployeeImports.delete(storageName);
      return { ok: true };
    } catch (error) {
      console.error('Could not discard staged employee document:', error);
      return { ok: false, error: String(error?.message || error) };
    }
  });

  ipcMain.handle('documents:read', async (event, storageName) => {
    validateIpcSender(event);
    if (typeof storageName !== 'string' || !EMPLOYEE_STORAGE_NAME_PATTERN.test(storageName)) {
      return { ok: false, error: 'اسم الملف غير صالح.' };
    }
    const target = pathModule.resolve(DOCUMENTS_DIR, storageName);
    if (!isInside(DOCUMENTS_DIR, target)) return { ok: false, error: 'مسار الملف غير صالح.' };
    try {
      await ensureVault();
      const plaintext = await decryptDocument(await fs.readFile(target));
      if (plaintext.length > MAX_ATTACHMENT_BYTES) return { ok: false, error: 'حجم الملف يتجاوز الحد المسموح.' };
      return { ok: true, bytes: Uint8Array.from(plaintext) };
    } catch (error) {
      console.error('Document read failed:', error);
      return { ok: false, error: String(error?.message || error) };
    }
  });

  ipcMain.handle('documents:download', async (event, storageName, fileName) => {
    validateIpcSender(event);
    if (typeof storageName !== 'string' || !EMPLOYEE_STORAGE_NAME_PATTERN.test(storageName)
      || !isSafeFileName(fileName) || !fileName.trim() || fileName.length > 255) {
      return { ok: false, error: 'بيانات تنزيل الملف غير صالحة.' };
    }
    const target = pathModule.resolve(DOCUMENTS_DIR, storageName);
    if (!isInside(DOCUMENTS_DIR, target)) return { ok: false, error: 'مسار الملف غير صالح.' };
    const selection = await dialog.showSaveDialog({
      title: 'تنزيل مستند الموظف',
      defaultPath: fileName,
      filters: [{ name: pathModule.extname(fileName).toLowerCase() === '.pdf' ? 'PDF' : 'صورة', extensions: [pathModule.extname(fileName).slice(1).toLowerCase()] }],
    });
    if (selection.canceled || !selection.filePath) return { ok: false, canceled: true };
    try {
      await ensureVault();
      const plaintext = await decryptDocument(await fs.readFile(target));
      if (plaintext.length > MAX_ATTACHMENT_BYTES) return { ok: false, error: 'حجم الملف يتجاوز الحد المسموح.' };
      await fs.writeFile(selection.filePath, plaintext, { mode: 0o600 });
      return { ok: true };
    } catch (error) {
      console.error('Document download failed:', error);
      return { ok: false, error: String(error?.message || error) };
    }
  });

  ipcMain.handle('documents:open', async (event, storageName) => {
    validateIpcSender(event);
    if (typeof storageName !== 'string' || !STORAGE_NAME_PATTERN.test(storageName)) {
      return { ok: false, error: 'اسم الملف غير صالح.' };
    }
    const target = pathModule.resolve(DOCUMENTS_DIR, storageName);
    if (!isInside(DOCUMENTS_DIR, target)) {
      return { ok: false, error: 'مسار الملف غير صالح.' };
    }
    try {
      await ensureVault();
      const storedBytes = await fs.readFile(target);
      const plaintext = await decryptDocument(storedBytes);
      fsSync.mkdirSync(OPEN_DIR, { recursive: true, mode: 0o700 });
      const temporaryPath = pathModule.join(
        OPEN_DIR,
        `${crypto.randomUUID().replace(/-/g, '')}${pathModule.extname(storageName)}`,
      );
      await fs.writeFile(temporaryPath, plaintext, { flag: 'wx', mode: 0o600 });
      const result = await shell.openPath(temporaryPath);
      if (result) {
        await fs.unlink(temporaryPath);
        return { ok: false, error: result };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  });

  ipcMain.handle('documents:ocr-page', async (event, imageData) => {
    validateIpcSender(event);
    if (!(imageData instanceof Uint8Array) || imageData.byteLength < 24) {
      return { ok: false, error: 'بيانات صورة الصفحة غير صالحة.' };
    }
    if (imageData.byteLength > MAX_OCR_IMAGE_BYTES) {
      return { ok: false, error: 'حجم صورة الصفحة يتجاوز الحد المسموح لمعالجة OCR.' };
    }

    const image = Buffer.from(imageData.buffer, imageData.byteOffset, imageData.byteLength);
    if (!image.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
      || image.subarray(12, 16).toString('ascii') !== 'IHDR') {
      return { ok: false, error: 'صيغة صورة الصفحة غير مدعومة.' };
    }
    const width = image.readUInt32BE(16);
    const height = image.readUInt32BE(20);
    if (!width || !height || width * height > 12_000_000) {
      return { ok: false, error: 'أبعاد صورة الصفحة أكبر من الحد المسموح لمعالجة OCR.' };
    }
    try {
      const text = await recognizeImage(image);
      return { ok: true, text };
    } catch (error) {
      console.error('PDF OCR failed:', error);
      return { ok: false, error: String(error?.message || error) };
    }
  });

  ipcMain.handle('documents:ocr-finish', async (event) => {
    validateIpcSender(event);
    await ocrQueue;
    if (!ocrWorkerPromise) return { ok: true };
    try {
      const worker = await ocrWorkerPromise;
      await worker.terminate();
      ocrWorkerPromise = null;
      return { ok: true };
    } catch (error) {
      console.error('PDF OCR worker shutdown failed:', error);
      return { ok: false, error: String(error?.message || error) };
    }
  });

  ipcMain.handle('documents:info', async (event) => {
    validateIpcSender(event);
    await ensureVault();
    return { ok: true, directory: DOCUMENTS_DIR, maxBytes: MAX_ATTACHMENT_BYTES };
  });

  return { DOCUMENTS_DIR };
}

module.exports = { registerDocumentHandlers, MAX_ATTACHMENT_BYTES };
