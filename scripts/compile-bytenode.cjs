const bytenode = require('bytenode');
const fs = require('fs');
const path = require('path');

const electronDir = path.join(__dirname, '../electron');

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
];

console.log('🔒 Compiling Electron source files to V8 Bytecode (.jsc)...');

for (const file of filesToCompile) {
  const fullPath = path.join(electronDir, file);
  if (fs.existsSync(fullPath)) {
    const jscPath = fullPath.replace(/\.js$/, '.jsc');
    bytenode.compileFile({
      filename: fullPath,
      output: jscPath,
      electron: true,
    });
    console.log(`  ✓ Compiled bytecode: ${file} -> ${path.basename(jscPath)}`);
  }
}

console.log('✅ Bytecode compilation complete.');

