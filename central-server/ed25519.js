/**
 * Minimal Ed25519 helper with the same call shape as the (unmaintained)
 * `node-ed25519` package, implemented on Node's built-in crypto module.
 *
 * Keys are exchanged and stored as RAW 32-byte buffers (base64 in the DB),
 * which matches the format produced by node-ed25519, so existing databases
 * keep working unchanged. Ed25519 signing is deterministic — signatures are
 * byte-identical to those from node-ed25519.
 */
const crypto = require('crypto');

// DER wrappers for raw Ed25519 keys:
//   PKCS8: 302e020100300506032b657004220420 || <32-byte seed>
//   SPKI:  302a300506032b6570032100          || <32-byte public key>
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

function generateKeyPair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const pkcs8 = privateKey.export({ format: 'der', type: 'pkcs8' });
  const spki = publicKey.export({ format: 'der', type: 'spki' });
  return {
    privateKey: Buffer.from(pkcs8.subarray(pkcs8.length - 32)),
    publicKey: Buffer.from(spki.subarray(spki.length - 32)),
  };
}

function privateKeyFromRaw(rawSeed) {
  return crypto.createPrivateKey({
    key: Buffer.concat([PKCS8_PREFIX, rawSeed]),
    format: 'der',
    type: 'pkcs8',
  });
}

function publicKeyFromRaw(rawPublicKey) {
  return crypto.createPublicKey({
    key: Buffer.concat([SPKI_PREFIX, rawPublicKey]),
    format: 'der',
    type: 'spki',
  });
}

function sign(message, privateKey) {
  return crypto.sign(null, message, privateKeyFromRaw(privateKey));
}

function verify(message, signature, publicKey) {
  try {
    return crypto.verify(null, message, publicKeyFromRaw(publicKey), signature);
  } catch {
    return false;
  }
}

module.exports = { generateKeyPair, sign, verify };
