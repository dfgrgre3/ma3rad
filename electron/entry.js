const path = require('path');
const fs = require('fs');
const { createHash } = require('node:crypto');
const { app } = require('electron');

const BYTECODE_INTEGRITY_MANIFEST_SHA256 = '1731f1a4c00070dd1a92e829c84344d3ed98cd8b2d50c8a49dc989f84e50da45';
const jscPath = path.join(__dirname, 'main.jsc');

function listBytecodeFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listBytecodeFiles(entryPath));
    else if (entry.isFile() && entry.name.endsWith('.jsc')) files.push(entryPath);
  }
  return files;
}

function verifyBytecodeIntegrity() {
  const appRoot = path.dirname(__dirname);
  const manifestPath = path.join(__dirname, 'bytecode-integrity.json');
  const manifestContents = fs.readFileSync(manifestPath);
  const manifestHash = createHash('sha256').update(manifestContents).digest('hex');
  if (manifestHash !== BYTECODE_INTEGRITY_MANIFEST_SHA256) {
    throw new Error('Electron bytecode integrity manifest failed its pinned hash check');
  }
  const manifest = JSON.parse(manifestContents.toString('utf8'));
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Electron bytecode integrity manifest is invalid');
  }

  const actualFiles = listBytecodeFiles(__dirname)
    .map((file) => path.relative(appRoot, file).split(path.sep).join('/'))
    .sort();
  const manifestFiles = Object.keys(manifest).sort();
  if (actualFiles.length === 0 || actualFiles.length !== manifestFiles.length ||
      actualFiles.some((file, index) => file !== manifestFiles[index])) {
    throw new Error('Electron bytecode integrity manifest does not cover every bytecode file');
  }

  for (const file of manifestFiles) {
    const expectedHash = manifest[file];
    if (typeof expectedHash !== 'string' || !/^[a-f0-9]{64}$/i.test(expectedHash)) {
      throw new Error(`Electron bytecode integrity hash is invalid: ${file}`);
    }
    const actualHash = createHash('sha256')
      .update(fs.readFileSync(path.resolve(appRoot, file)))
      .digest('hex');
    if (actualHash !== expectedHash.toLowerCase()) {
      throw new Error(`Electron bytecode integrity check failed: ${file}`);
    }
  }
}

function loadMainEntry() {
  if (!app.isPackaged) {
    require('./main.js');
    return;
  }

  try {
    verifyBytecodeIntegrity();
  } catch (error) {
    console.error('[electron-entry] packaged bytecode integrity check failed; the application will not start:', error);
    app.quit();
    return;
  }

  try {
    require('bytenode');
    require(jscPath);
  } catch (error) {
    console.error('[electron-entry] packaged main bytecode failed to load; the application will not start:', error);
    app.quit();
  }
}

loadMainEntry();
