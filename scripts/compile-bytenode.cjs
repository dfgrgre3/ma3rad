const bytenode = require('bytenode');
const fs = require('fs');
const path = require('path');

const electronDir = path.join(__dirname, '../electron');
const electronPathArg = process.argv.indexOf('--electron-path');
const electronPath = electronPathArg === -1
  ? undefined
  : path.resolve(process.argv[electronPathArg + 1] || '');

const filesToCompile = [
  'main.js',
  'licenseGuard.js',
  'hardwareId.js',
  'security.js',
  'databaseHandlers.js',
  'appHandlers.js',
  'centralApi.js',
  'documentHandlers.js',
  'printing.js',
  'syncClientConfig.js',
  'syncRelay.js',
  'gracefulShutdown.js',
  'safeStorageCompat.js',
  'security/crypto.js',
  'security/licenseValidator.js',
  'security/fileIntegrity.js',
  'security/ipcGuard.js',
  'security/auditLogger.js',
  'security/index.js',
];

async function compileFiles() {
  console.log('🔒 Compiling Electron source files to V8 Bytecode (.jsc)...');

  for (const file of filesToCompile) {
    const fullPath = path.join(electronDir, file);
    const backupPath = fullPath + '.bak';
    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, fullPath);
      fs.unlinkSync(backupPath);
    }
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

  console.log('✅ Bytecode compilation complete.');
}

compileFiles().catch((error) => {
  console.error('❌ Bytecode compilation failed:', error);
  process.exitCode = 1;
});
