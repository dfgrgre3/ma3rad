const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const distDir = path.join(__dirname, '../dist/assets');

if (!fs.existsSync(distDir)) {
  console.log('No dist/assets directory found, skipping obfuscation.');
  process.exit(0);
}

console.log('🔒 Starting JavaScript Obfuscation on Frontend bundle...');

const files = fs.readdirSync(distDir, { withFileTypes: true });
let obfuscatedCount = 0;
let skippedCount = 0;

for (const entry of files) {
  if (!entry.isFile()) continue;

  const file = entry.name;
  if (!file.endsWith('.js') || file.includes('vendor-sqlite') || file.includes('sql-wasm')) {
    continue;
  }

  const filePath = path.join(distDir, file);

  if (!fs.existsSync(filePath)) {
    console.warn(`  ⚠ Skipping missing file: ${file}`);
    skippedCount++;
    continue;
  }

  try {
    const code = fs.readFileSync(filePath, 'utf8');

    const obfuscationResult = JavaScriptObfuscator.obfuscate(code, {
      compact: true,
      controlFlowFlattening: true,
      controlFlowFlatteningThreshold: 0.75,
      deadCodeInjection: false, // keep performance snappy
      debugProtection: false, // handled by Electron
      disableConsoleOutput: false,
      identifierNamesGenerator: 'hexadecimal',
      log: false,
      numbersToExpressions: true,
      renameGlobals: false,
      selfDefending: false,
      simplify: true,
      splitStrings: true,
      splitStringsChunkLength: 10,
      stringArray: true,
      stringArrayCallsTransform: true,
      stringArrayEncoding: ['base64'],
      stringArrayIndexShift: true,
      stringArrayRotate: true,
      stringArrayShuffle: true,
      stringArrayWrappersCount: 2,
      stringArrayWrappersChainedCalls: true,
      stringArrayWrappersParametersMaxCount: 4,
      stringArrayWrappersType: 'function',
      stringArrayThreshold: 0.8,
      transformObjectKeys: true,
      unicodeEscapeSequence: false,
    });

    fs.writeFileSync(filePath, obfuscationResult.getObfuscatedCode(), 'utf8');
    obfuscatedCount++;
    console.log(`  ✓ Obfuscated: ${file}`);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }

    console.warn(`  ⚠ Skipping asset that disappeared during obfuscation: ${file}`);
    skippedCount++;
  }
}

console.log(`✅ Obfuscated ${obfuscatedCount} frontend files; skipped ${skippedCount} missing assets.`);
