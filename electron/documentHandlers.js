const crypto = require('node:crypto');

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_OCR_IMAGE_BYTES = 12 * 1024 * 1024;
const STORAGE_NAME_PATTERN = /^doc_[a-f0-9]{32}\.[a-z0-9]{1,10}$/i;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

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
  appDataDir,
}) {
  const pathModule = configurePath(path);
  const DOCUMENTS_DIR = pathModule.join(appDataDir, 'documents');
  let ocrWorkerPromise = null;
  let ocrQueue = Promise.resolve();

  const ensureDocumentsDir = () => {
    fsSync.mkdirSync(DOCUMENTS_DIR, { recursive: true });
  };

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
        const { createWorker, OEM } = require('tesseract.js');
        return createWorker('ara+eng', OEM.LSTM_ONLY, {
          langPath: languageDirectory,
          cacheMethod: 'none',
          gzip: true,
        });
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

  ipcMain.handle('documents:import', async (event) => {
    validateIpcSender(event);
    ensureDocumentsDir();

    const selection = await dialog.showOpenDialog({
      title: 'اختيار ملف المستند',
      properties: ['openFile'],
      filters: [
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
      const safeExtension = /^\.[a-z0-9]{1,10}$/.test(extension) ? extension : '';
      const storageName = `doc_${crypto.randomUUID().replace(/-/g, '')}${safeExtension}`;
      const destination = pathModule.join(DOCUMENTS_DIR, storageName);
      if (!isInside(DOCUMENTS_DIR, destination)) {
        return { ok: false, error: 'مسار التخزين غير صالح.' };
      }

      await fs.copyFile(sourcePath, destination);
      const bytes = await fs.readFile(destination);
      const checksum = crypto.createHash('sha256').update(bytes).digest('hex');

      return {
        ok: true,
        storageName,
        fileName: pathModule.basename(sourcePath).slice(0, 255),
        mimeType: MIME_BY_EXTENSION[safeExtension] || 'application/octet-stream',
        fileSize: stat.size,
        checksum,
      };
    } catch (error) {
      console.error('Document import failed:', error);
      return { ok: false, error: String(error?.message || error) };
    }
  });

  ipcMain.handle('documents:open', async (event, storageName) => {
    validateIpcSender(event);
    if (typeof storageName !== 'string' || !STORAGE_NAME_PATTERN.test(storageName)) {
      return { ok: false, error: 'اسم الملف غير صالح.' };
    }
    ensureDocumentsDir();
    const target = pathModule.resolve(DOCUMENTS_DIR, storageName);
    if (!isInside(DOCUMENTS_DIR, target)) {
      return { ok: false, error: 'مسار الملف غير صالح.' };
    }
    try {
      const stat = await fs.stat(target);
      if (!stat.isFile()) return { ok: false, error: 'الملف غير موجود.' };
      const result = await shell.openPath(target);
      return result ? { ok: false, error: result } : { ok: true };
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
    ensureDocumentsDir();
    return { ok: true, directory: DOCUMENTS_DIR, maxBytes: MAX_ATTACHMENT_BYTES };
  });

  return { DOCUMENTS_DIR };
}

module.exports = { registerDocumentHandlers, MAX_ATTACHMENT_BYTES };
