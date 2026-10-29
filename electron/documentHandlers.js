const crypto = require('node:crypto');

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const STORAGE_NAME_PATTERN = /^doc_[a-f0-9]{32}\.[a-z0-9]{1,10}$/i;

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

  const ensureDocumentsDir = () => {
    fsSync.mkdirSync(DOCUMENTS_DIR, { recursive: true });
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

  ipcMain.handle('documents:info', async (event) => {
    validateIpcSender(event);
    ensureDocumentsDir();
    return { ok: true, directory: DOCUMENTS_DIR, maxBytes: MAX_ATTACHMENT_BYTES };
  });

  return { DOCUMENTS_DIR };
}

module.exports = { registerDocumentHandlers, MAX_ATTACHMENT_BYTES };
