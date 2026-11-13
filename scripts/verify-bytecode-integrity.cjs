const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const electronDir = path.join(__dirname, '../electron');
const entry = fs.readFileSync(path.join(electronDir, 'entry.js'), 'utf8');
const match = entry.match(/const BYTECODE_INTEGRITY_MANIFEST_SHA256 = '([a-f0-9]{64})';/);
if (!match) throw new Error('Electron entry is missing its bytecode manifest hash pin.');

const manifestBytes = fs.readFileSync(path.join(electronDir, 'bytecode-integrity.json'));
const actualManifestHash = crypto.createHash('sha256').update(manifestBytes).digest('hex');
if (actualManifestHash !== match[1]) {
  throw new Error(`Bytecode manifest hash mismatch: entry pins ${match[1]}, manifest is ${actualManifestHash}.`);
}

const manifest = JSON.parse(manifestBytes.toString('utf8'));
for (const [relativePath, expectedHash] of Object.entries(manifest)) {
  if (!/^[a-f0-9]{64}$/i.test(expectedHash)) throw new Error(`Invalid bytecode hash: ${relativePath}`);
  const bytecodePath = path.resolve(path.dirname(electronDir), relativePath);
  if (!bytecodePath.startsWith(`${path.dirname(electronDir)}${path.sep}`)) {
    throw new Error(`Bytecode manifest path escapes the repository: ${relativePath}`);
  }
  const actualHash = crypto.createHash('sha256').update(fs.readFileSync(bytecodePath)).digest('hex');
  if (actualHash !== expectedHash.toLowerCase()) throw new Error(`Bytecode artifact hash mismatch: ${relativePath}`);
}

console.log(`Bytecode integrity verified (${Object.keys(manifest).length} artifacts, manifest ${actualManifestHash}).`);
