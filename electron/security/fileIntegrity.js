// electron/security/fileIntegrity.js
// Runtime file integrity checker: verifies SHA-256 hashes of critical application files.
const fs = require('node:fs');
const path = require('node:path');
const { sha256Hex } = require('./crypto');

class FileIntegrityChecker {
  constructor(appRoot) {
    this.appRoot = appRoot;
  }

  /**
   * Hashes a single file relative to appRoot.
   */
  hashFile(relativePath) {
    const fullPath = path.resolve(this.appRoot, relativePath);
    if (!fs.existsSync(fullPath)) return null;
    const content = fs.readFileSync(fullPath);
    return sha256Hex(content);
  }

  /**
   * Builds an integrity manifest for a list of files.
   */
  buildManifest(fileList) {
    const manifest = {};
    for (const file of fileList) {
      const hash = this.hashFile(file);
      if (hash) manifest[file] = hash;
    }
    return manifest;
  }

  /**
   * Verifies the files against an expected manifest.
   */
  verifyManifest(expectedManifest) {
    const results = [];
    let allValid = true;

    for (const [file, expectedHash] of Object.entries(expectedManifest)) {
      const actualHash = this.hashFile(file);
      if (!actualHash) {
        allValid = false;
        results.push({ file, ok: false, reason: 'missing_file' });
        continue;
      }
      const match = actualHash.toLowerCase() === expectedHash.toLowerCase();
      if (!match) {
        allValid = false;
        results.push({ file, ok: false, reason: 'hash_mismatch', expected: expectedHash, actual: actualHash });
      } else {
        results.push({ file, ok: true });
      }
    }

    return {
      valid: allValid,
      results,
    };
  }
}

module.exports = {
  FileIntegrityChecker,
};

