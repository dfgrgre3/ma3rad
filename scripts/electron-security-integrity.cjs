const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const electronDirectory = path.join(__dirname, '../electron');
const defaultMainPath = path.join(electronDirectory, 'main.js');
const defaultEntryPath = path.join(electronDirectory, 'entry.js');
const defaultSecurityPath = path.join(electronDirectory, 'security.js');
const BYTECODE_MANIFEST_HASH_PATTERN = /(const BYTECODE_INTEGRITY_MANIFEST_SHA256 = ')[a-f0-9]{64}(';)/;

function createProtectedLoaderSource(moduleName) {
  return `// Protected binary code\nmodule.exports = require('./${moduleName}.jsc');\n`;
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function getEntrySourceIntegrityHash(entryPath = defaultEntryPath) {
  const source = fs.readFileSync(entryPath, 'utf8');
  let matches = 0;
  const normalizedSource = source.replace(BYTECODE_MANIFEST_HASH_PATTERN, (_match, prefix, suffix) => {
    matches++;
    return `${prefix}${'0'.repeat(64)}${suffix}`;
  });
  if (matches !== 1) {
    throw new Error(`Expected exactly one bytecode manifest hash in ${entryPath}; found ${matches}.`);
  }
  return sha256(normalizedSource);
}

function replacePinnedHash(source, name, hash) {
  const pattern = new RegExp(`(const ${name} = ')[a-f0-9]{64}(';?)`);
  let replacements = 0;
  const updated = source.replace(pattern, (_match, prefix, suffix) => {
    replacements++;
    return `${prefix}${hash}${suffix}`;
  });
  if (replacements !== 1) {
    throw new Error(`Expected exactly one ${name} integrity hash in electron/main.js; found ${replacements}.`);
  }
  return updated;
}

function updateSecurityIntegrityHashes({
  mainPath = defaultMainPath,
  entryPath = defaultEntryPath,
  securityPath = defaultSecurityPath,
} = {}) {
  if (!fs.existsSync(mainPath)) {
    throw new Error(`Electron main process source is missing: ${mainPath}`);
  }
  if (!fs.existsSync(securityPath)) {
    throw new Error(`Electron security source is missing: ${securityPath}`);
  }

  const mainSource = fs.readFileSync(mainPath, 'utf8');
  const securitySourceHash = sha256(fs.readFileSync(securityPath));
  const packagedLoaderHash = sha256(createProtectedLoaderSource('security'));
  let updatedSource = replacePinnedHash(
    replacePinnedHash(mainSource, 'SECURITY_SOURCE_INTEGRITY_SHA256', securitySourceHash),
    'SECURITY_PACKAGED_LOADER_INTEGRITY_SHA256',
    packagedLoaderHash,
  );
  if (fs.existsSync(entryPath)) {
    updatedSource = replacePinnedHash(
      updatedSource,
      'ENTRY_SOURCE_INTEGRITY_SHA256',
      getEntrySourceIntegrityHash(entryPath),
    );
  }
  if (updatedSource !== mainSource) fs.writeFileSync(mainPath, updatedSource, 'utf8');

  return {
    entrySourceHash: fs.existsSync(entryPath) ? getEntrySourceIntegrityHash(entryPath) : null,
    securitySourceHash,
    packagedLoaderHash,
  };
}

if (require.main === module) {
  try {
    updateSecurityIntegrityHashes();
  } catch (error) {
    console.error('Electron security integrity manifest update failed:', error);
    process.exitCode = 1;
  }
}

module.exports = {
  createProtectedLoaderSource,
  getEntrySourceIntegrityHash,
  updateSecurityIntegrityHashes,
};
