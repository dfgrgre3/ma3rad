const bytenode = require('bytenode');
const crypto = require('node:crypto');
const fs = require('fs');
const os = require('node:os');
const path = require('path');
const { updateSecurityIntegrityHashes } = require('./electron-security-integrity.cjs');

const electronDir = path.join(__dirname, '../electron');
const electronPathArg = process.argv.indexOf('--electron-path');
const electronPath = electronPathArg === -1
  ? undefined
  : path.resolve(process.argv[electronPathArg + 1] || '');
const skipVerifyArg = process.argv.includes('--skip-verify') || Boolean(process.env.CERAMISYS_SKIP_BYTECODE_VERIFY);

const filesToCompile = [
  'main.js',
  'licenseGuard.js',
  'hardwareId.js',
  'security.js',
  'databaseHandlers.js',
  'databaseMemoryPolicy.js',
  'appHandlers.js',
  'centralApi.js',
  'documentHandlers.js',
  'printing.js',
  'syncClientConfig.js',
  'syncRelay.js',
  'gracefulShutdown.js',
  'autoUpdater.js',
  'safeStorageCompat.js',
  'security/crypto.js',
  'security/licenseValidator.js',
  'security/fileIntegrity.js',
  'security/ipcGuard.js',
  'security/auditLogger.js',
  'security/index.js',
];

function writeBytecodeIntegrityManifest(directory = electronDir) {
  const manifest = {};
  for (const file of filesToCompile) {
    const bytecodePath = path.join(directory, file.replace(/\.js$/, '.jsc'));
    if (!fs.existsSync(bytecodePath)) {
      throw new Error(`Compiled Electron bytecode is missing: ${bytecodePath}`);
    }
    const relativePath = path.relative(path.dirname(directory), bytecodePath).split(path.sep).join('/');
    manifest[relativePath] = crypto.createHash('sha256').update(fs.readFileSync(bytecodePath)).digest('hex');
  }
  fs.writeFileSync(
    path.join(directory, 'bytecode-integrity.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
}

function pinBytecodeIntegrityManifest(directory = electronDir) {
  const entryPath = path.join(directory, 'entry.js');
  const manifestPath = path.join(directory, 'bytecode-integrity.json');
  const source = fs.readFileSync(entryPath, 'utf8');
  const marker = /const BYTECODE_INTEGRITY_MANIFEST_SHA256 = '[a-f0-9]{64}';/;
  if (!marker.test(source)) throw new Error('Electron entry is missing its bytecode integrity hash');
  const manifestHash = crypto.createHash('sha256').update(fs.readFileSync(manifestPath)).digest('hex');
  const updatedSource = source.replace(marker, `const BYTECODE_INTEGRITY_MANIFEST_SHA256 = '${manifestHash}';`);
  if (updatedSource !== source) {
    const backupPath = `${entryPath}.bak`;
    if (!fs.existsSync(backupPath)) fs.copyFileSync(entryPath, backupPath);
    fs.writeFileSync(entryPath, updatedSource, 'utf8');
  }
}

function refreshBytecodeIntegrityManifest(directory = electronDir) {
  writeBytecodeIntegrityManifest(directory);
  pinBytecodeIntegrityManifest(directory);
}

async function verifyBytecodeReproducibility({
  directory = electronDir,
  files = filesToCompile,
  compileFile = bytenode.compileFile,
} = {}) {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ceramisys-bytecode-verify-'));
  try {
    for (const file of files) {
      const sourcePath = path.join(directory, file);
      const artifactPath = path.join(directory, file.replace(/\.js$/, '.jsc'));
      if (!fs.existsSync(sourcePath) || !fs.existsSync(artifactPath)) {
        throw new Error(`Electron source or bytecode artifact is missing: ${file}`);
      }

      const candidatePath = path.join(temporaryDirectory, file.replace(/\.js$/, '.jsc'));
      fs.mkdirSync(path.dirname(candidatePath), { recursive: true });
      await compileFile({
        filename: sourcePath,
        output: candidatePath,
        electronMain: true,
        electronPath,
      });

      if (!fs.readFileSync(candidatePath).equals(fs.readFileSync(artifactPath))) {
        throw new Error(`Electron bytecode does not reproducibly match its source: ${file}`);
      }
    }
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

async function compileFiles() {
  console.log('🔒 Compiling Electron source files to V8 Bytecode (.jsc)...');

  for (const file of filesToCompile) {
    const fullPath = path.join(electronDir, file);
    const backupPath = fullPath + '.bak';
    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, fullPath);
      fs.unlinkSync(backupPath);
    }
  }
  const entryPath = path.join(electronDir, 'entry.js');
  const entryBackupPath = `${entryPath}.bak`;
  if (fs.existsSync(entryBackupPath)) {
    fs.copyFileSync(entryBackupPath, entryPath);
    fs.unlinkSync(entryBackupPath);
  }

  updateSecurityIntegrityHashes();

  for (const file of filesToCompile) {
    const fullPath = path.join(electronDir, file);
    if (fs.existsSync(fullPath)) {
      const code = fs.readFileSync(fullPath, 'utf8');
      if (code.includes('// Protected binary code')) {
        console.warn(`  ⚠️ Skipping ${file}: file appears to already be a protected stub.`);
        continue;
      }
      const jscPath = fullPath.replace(/\.js$/, '.jsc');
      await bytenode.compileFile({
        filename: fullPath,
        output: jscPath,
        electronMain: true,
        electronPath,
      });
      console.log(`  ✓ Compiled bytecode: ${file} -> ${path.basename(jscPath)}`);
    }
  }

  if (!skipVerifyArg) {
    await verifyBytecodeReproducibility();
  }
  refreshBytecodeIntegrityManifest();
  console.log('✅ Bytecode compilation complete.');
}

if (require.main === module) {
  compileFiles().catch((error) => {
    console.error('❌ Bytecode compilation failed:', error);
    process.exitCode = 1;
  });
}

module.exports = {
  filesToCompile,
  pinBytecodeIntegrityManifest,
  refreshBytecodeIntegrityManifest,
  verifyBytecodeReproducibility,
  writeBytecodeIntegrityManifest,
};
