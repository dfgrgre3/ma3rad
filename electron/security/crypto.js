// electron/security/crypto.js
// Cryptographic helpers: AES-256-GCM, Ed25519 digital signatures, SHA-256, timing-safe compare.
const crypto = require('node:crypto');

const AES_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const TAG_LENGTH = 16; // 128 bits auth tag
const KEY_LENGTH = 32; // 256 bits

/**
 * Deterministic JSON stringifier with sorted object keys.
 * Ensures cross-platform bit-for-bit identical serialization for signature verification.
 */
function canonicalStringify(obj) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalStringify).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  const entries = keys.map(k => `${JSON.stringify(k)}:${canonicalStringify(obj[k])}`);
  return '{' + entries.join(',') + '}';
}

/**
 * Encrypt arbitrary plaintext with AES-256-GCM using a random 12-byte IV.
 */
function encryptAes256Gcm(plaintext, keyBuffer) {
  if (!Buffer.isBuffer(keyBuffer) || keyBuffer.length !== KEY_LENGTH) {
    throw new TypeError('AES-256 key must be a 32-byte Buffer.');
  }
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(AES_ALGORITHM, keyBuffer, iv);
  const inputBuffer = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(String(plaintext), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(inputBuffer), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    alg: AES_ALGORITHM,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

/**
 * Decrypt AES-256-GCM encrypted payload.
 */
function decryptAes256Gcm(encryptedPayload, keyBuffer) {
  if (!Buffer.isBuffer(keyBuffer) || keyBuffer.length !== KEY_LENGTH) {
    throw new TypeError('AES-256 key must be a 32-byte Buffer.');
  }
  if (!encryptedPayload || typeof encryptedPayload !== 'object') {
    throw new TypeError('Invalid encrypted payload object.');
  }

  const iv = Buffer.from(encryptedPayload.iv, 'base64');
  const tag = Buffer.from(encryptedPayload.tag, 'base64');
  const ciphertext = Buffer.from(encryptedPayload.ciphertext, 'base64');

  if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) {
    throw new Error('Encrypted payload contains invalid IV or tag length.');
  }

  const decipher = crypto.createDecipheriv(AES_ALGORITHM, keyBuffer, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted;
}

/**
 * Verifies an Ed25519 digital signature over an object payload or buffer.
 */
function verifyEd25519Signature(payload, signatureBase64, publicKeyBase64) {
  if (!payload || !signatureBase64 || !publicKeyBase64) return false;
  try {
    const pubDer = Buffer.from(publicKeyBase64, 'base64');
    const publicKey = crypto.createPublicKey({ key: pubDer, format: 'der', type: 'spki' });
    const dataBuffer = Buffer.isBuffer(payload)
      ? payload
      : Buffer.from(typeof payload === 'string' ? payload : canonicalStringify(payload), 'utf8');
    const sigBuffer = Buffer.from(signatureBase64, 'base64');

    return crypto.verify(null, dataBuffer, publicKey, sigBuffer);
  } catch {
    return false;
  }
}

/**
 * Signs an object payload or buffer with an Ed25519 private key.
 */
function signEd25519(payload, privateKeyBase64) {
  const privDer = Buffer.from(privateKeyBase64, 'base64');
  const privateKey = crypto.createPrivateKey({ key: privDer, format: 'der', type: 'pkcs8' });
  const dataBuffer = Buffer.isBuffer(payload)
    ? payload
    : Buffer.from(typeof payload === 'string' ? payload : canonicalStringify(payload), 'utf8');
  const sig = crypto.sign(null, dataBuffer, privateKey);
  return sig.toString('base64');
}

/**
 * Computes SHA-256 hash of a buffer or string.
 */
function sha256Hex(data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Timing-safe string or buffer comparison.
 */
function timingSafeEqual(a, b) {
  try {
    const bufA = Buffer.isBuffer(a) ? a : Buffer.from(String(a));
    const bufB = Buffer.isBuffer(b) ? b : Buffer.from(String(b));
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

module.exports = {
  AES_ALGORITHM,
  KEY_LENGTH,
  IV_LENGTH,
  TAG_LENGTH,
  canonicalStringify,
  encryptAes256Gcm,
  decryptAes256Gcm,
  verifyEd25519Signature,
  signEd25519,
  sha256Hex,
  timingSafeEqual,
};
