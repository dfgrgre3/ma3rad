const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const { registerDocumentHandlers } = require('../electron/documentHandlers');

test('document vault imports into its own directory, hashes the file and rejects path traversal', async () => {
  const appDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ceramisys-docs-'));
  const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ceramisys-src-'));
  const sourceFile = path.join(sourceDir, 'contract.pdf');
  const bytes = Buffer.from('contract contents');
  await fs.writeFile(sourceFile, bytes);

  const handlers = new Map();
  const ipcMain = { handle: (name, handler) => handlers.set(name, handler) };
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
    assert.deepEqual(await fs.readFile(storedPath), bytes);

    const openedResult = await handlers.get('documents:open')(event, imported.storageName);
    assert.equal(openedResult.ok, true);
    assert.equal(opened.length, 1);
    assert.equal(path.dirname(opened[0]), path.join(appDataDir, 'documents'));

    const traversal = await handlers.get('documents:open')(event, '../outside.pdf');
    assert.equal(traversal.ok, false);
    const traversalName = await handlers.get('documents:open')(event, 'doc_' + 'a'.repeat(32) + '.pdf/../../evil.pdf');
    assert.equal(traversalName.ok, false);

    dialogResponse = { canceled: true, filePaths: [] };
    const canceled = await handlers.get('documents:import')(event);
    assert.equal(canceled.canceled, true);

    assert.ok(senderChecks >= 5, 'every IPC handler validates the sender');
  } finally {
    await fs.rm(appDataDir, { recursive: true, force: true });
    await fs.rm(sourceDir, { recursive: true, force: true });
  }
});
