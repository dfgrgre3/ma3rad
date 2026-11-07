const fs = require('fs');
const path = require('path');
const { createProtectedLoaderSource } = require('./electron-security-integrity.cjs');

const defaultElectronDir = path.join(__dirname, '../electron');

// قائمة الملفات التي يجب حذف نسختها النصية .js إذا وُجدت نسخة .jsc المترجمة
const compiledFiles = [
  'main',
  'licenseGuard',
  'hardwareId',
  'security',
  'databaseHandlers',
  'appHandlers',
  'centralApi',
  'documentHandlers',
  'printing',
  'syncClientConfig',
  'syncRelay',
  'gracefulShutdown',
  'autoUpdater',
  'safeStorageCompat',
  'security/crypto',
  'security/licenseValidator',
  'security/fileIntegrity',
  'security/ipcGuard',
  'security/auditLogger',
  'security/index',
];

function prepareProductionBundle(electronDir = defaultElectronDir) {
  console.log('🛡️ Cleaning plain JS files to keep only compiled V8 bytecode in release bundle...');

  for (const name of compiledFiles) {
    const sourcePath = path.join(electronDir, `${name}.js`);
    const bytecodePath = path.join(electronDir, `${name}.jsc`);
    const backupPath = `${sourcePath}.bak`;

    if (fs.existsSync(bytecodePath) && fs.existsSync(sourcePath)) {
      const source = fs.readFileSync(sourcePath, 'utf8');
      if (source.includes('// Protected binary code')) continue;

      if (!fs.existsSync(backupPath)) fs.copyFileSync(sourcePath, backupPath);
      fs.writeFileSync(sourcePath, createProtectedLoaderSource(path.basename(name)));
      console.log(`  ✓ Protected: ${name}.js replaced with binary bytecode loader`);
    }
  }

  console.log('✅ Production bundle ready: All business logic is compiled to binary.');
}

if (require.main === module) prepareProductionBundle();

module.exports = { prepareProductionBundle, compiledFiles };
