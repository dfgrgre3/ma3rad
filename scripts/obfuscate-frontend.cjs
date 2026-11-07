const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const distDir = path.join(__dirname, '../dist/assets');

if (!fs.existsSync(distDir)) {
  throw new Error(`Frontend assets directory not found: ${distDir}`);
}

console.log('🔒 Starting JavaScript Obfuscation on Frontend bundle...');

const files = fs.readdirSync(distDir, { withFileTypes: true })
  .filter((entry) => entry.isFile()
    && entry.name.endsWith('.js')
    && !entry.name.includes('vendor-sqlite')
    && !entry.name.includes('sql-wasm')
    && !entry.name.startsWith('pdf.worker-'));
let obfuscatedCount = 0;

console.log(`Found ${files.length} frontend JavaScript files eligible for obfuscation.`);

for (const entry of files) {
  const file = entry.name;
  const filePath = path.join(distDir, file);
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
}

if (obfuscatedCount !== files.length) {
  throw new Error(`Obfuscation incomplete: processed ${obfuscatedCount} of ${files.length} frontend files.`);
}

console.log(`✅ Obfuscated all ${obfuscatedCount} frontend files.`);
