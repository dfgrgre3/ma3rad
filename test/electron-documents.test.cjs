const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const zlib = require('node:zlib');
const { registerDocumentHandlers } = require('../electron/documentHandlers');

const pngCrc32 = (bytes) => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const pngChunk = (name, data) => {
  const type = Buffer.from(name);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(pngCrc32(Buffer.concat([type, data])));
  return Buffer.concat([length, type, data, checksum]);
};

const blankPng = () => {
  const width = 100;
  const height = 50;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc(height * (width * 4 + 1), 255);
  for (let y = 0; y < height; y++) rows[y * (width * 4 + 1)] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(rows)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
};

test('document vault imports into its own directory, hashes the file and rejects path traversal', async () => {
  const appDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ceramisys-docs-'));
  const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ceramisys-src-'));
  const sourceFile = path.join(sourceDir, 'contract.pdf');
  const bytes = Buffer.from('contract contents');
  await fs.writeFile(sourceFile, bytes);

  const handlers = new Map();
  const ipcMain = { handle: (name, handler) => handlers.set(name, handler) };
  const appListeners = new Map();
  const app = { on: (name, listener) => appListeners.set(name, listener) };
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(value),
    decryptString: (value) => value.toString(),
  };
  let senderChecks = 0;
  const opened = [];
  const validateIpcSender = () => { senderChecks++; return true; };
  let dialogResponse = { canceled: false, filePaths: [sourceFile] };

  registerDocumentHandlers({
    ipcMain,
    validateIpcSender,
    path,
    fs,
    fsSync,
    shell: { openPath: async (target) => { opened.push(target); return ''; } },
    dialog: { showOpenDialog: async () => dialogResponse },
    app,
    safeStorage,
    appDataDir,
  });

  const event = { senderFrame: { url: 'file:///index.html' } };
  try {
    const imported = await handlers.get('documents:import')(event);
    assert.equal(imported.ok, true);
    assert.match(imported.storageName, /^doc_[a-f0-9]{32}\.pdf$/);
    assert.equal(imported.fileName, 'contract.pdf');
    assert.equal(imported.mimeType, 'application/pdf');
    assert.equal(imported.fileSize, bytes.length);
    assert.equal(imported.checksum, crypto.createHash('sha256').update(bytes).digest('hex'));

    const storedPath = path.join(appDataDir, 'documents', imported.storageName);
    assert.equal(fsSync.existsSync(storedPath), true);
    const storedBytes = await fs.readFile(storedPath);
    assert.notDeepEqual(storedBytes, bytes);
    assert.equal(storedBytes.subarray(0, 17).toString(), 'CERAMISYS-DOC\0v1\0');

    const openedResult = await handlers.get('documents:open')(event, imported.storageName);
    assert.equal(openedResult.ok, true);
    assert.equal(opened.length, 1);
    assert.equal(path.dirname(opened[0]), path.join(appDataDir, '.document-open'));
    assert.deepEqual(await fs.readFile(opened[0]), bytes);
    appListeners.get('will-quit')();
    assert.equal(fsSync.existsSync(opened[0]), false);

    const tamperedBytes = Buffer.from(storedBytes);
    tamperedBytes[tamperedBytes.length - 1] ^= 0x01;
    await fs.writeFile(storedPath, tamperedBytes);
    const tamperedOpen = await handlers.get('documents:open')(event, imported.storageName);
    assert.equal(tamperedOpen.ok, false);

    const traversal = await handlers.get('documents:open')(event, '../outside.pdf');
    assert.equal(traversal.ok, false);
    const traversalName = await handlers.get('documents:open')(event, 'doc_' + 'a'.repeat(32) + '.pdf/../../evil.pdf');
    assert.equal(traversalName.ok, false);

    dialogResponse = { canceled: true, filePaths: [] };
    const canceled = await handlers.get('documents:import')(event);
    assert.equal(canceled.canceled, true);

    const invalidOcrImage = await handlers.get('documents:ocr-page')(event, Buffer.from('bad'));
    assert.equal(invalidOcrImage.ok, false);
    assert.match(invalidOcrImage.error, /بيانات صورة الصفحة غير صالحة/);
    const recognized = await handlers.get('documents:ocr-page')(event, blankPng());
    assert.equal(recognized.ok, true);
    assert.equal(typeof recognized.text, 'string');
    const finishedOcr = await handlers.get('documents:ocr-finish')(event);
    assert.equal(finishedOcr.ok, true);

    assert.ok(senderChecks >= 8, 'every IPC handler validates the sender');
  } finally {
    await fs.rm(appDataDir, { recursive: true, force: true });
    await fs.rm(sourceDir, { recursive: true, force: true });
  }
});

test('document vault migrates existing plaintext attachments and refuses writes without safeStorage', async () => {
  const appDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ceramisys-docs-migrate-'));
  const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ceramisys-src-'));
  const legacyBytes = Buffer.from('legacy contract contents');
  const legacyName = `doc_${'a'.repeat(32)}.pdf`;
  const legacyPath = path.join(appDataDir, 'documents', legacyName);
  await fs.mkdir(path.dirname(legacyPath), { recursive: true });
  await fs.writeFile(legacyPath, legacyBytes);

  const handlers = new Map();
  const ipcMain = { handle: (name, handler) => handlers.set(name, handler) };
  const unavailableAppDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ceramisys-docs-unavailable-'));
  const sourceFile = path.join(sourceDir, 'new.pdf');
  await fs.writeFile(sourceFile, 'new contract');
  const register = (safeStorage) => registerDocumentHandlers({
    ipcMain,
    validateIpcSender: () => true,
    path,
    fs,
    fsSync,
    shell: { openPath: async () => '' },
    dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [sourceFile] }) },
    safeStorage,
    appDataDir,
  });
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(value),
    decryptString: (value) => value.toString(),
  };
  const event = { senderFrame: { url: 'file:///index.html' } };
  try {
    register(safeStorage);
    const info = await handlers.get('documents:info')(event);
    assert.equal(info.ok, true);
    const migratedBytes = await fs.readFile(legacyPath);
    assert.notDeepEqual(migratedBytes, legacyBytes);
    assert.equal(migratedBytes.subarray(0, 17).toString(), 'CERAMISYS-DOC\0v1\0');

    const unavailableHandlers = new Map();
    registerDocumentHandlers({
      ipcMain: { handle: (name, handler) => unavailableHandlers.set(name, handler) },
      validateIpcSender: () => true,
      path,
      fs,
      fsSync,
      shell: { openPath: async () => '' },
      dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [sourceFile] }) },
      safeStorage: { isEncryptionAvailable: () => false },
      appDataDir: unavailableAppDataDir,
    });
    const unavailable = await unavailableHandlers.get('documents:import')(event);
    assert.equal(unavailable.ok, false);
    assert.match(unavailable.error, /تشفير مرفقات المستندات غير متاح/);
  } finally {
    await fs.rm(appDataDir, { recursive: true, force: true });
    await fs.rm(sourceDir, { recursive: true, force: true });
    await fs.rm(unavailableAppDataDir, { recursive: true, force: true });
  }
});
