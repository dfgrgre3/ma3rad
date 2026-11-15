/**
 * RFC 6238 (TOTP) / RFC 4226 (HOTP) implementation on Node's built-in crypto.
 * Compatible with Google Authenticator / Microsoft Authenticator / 1Password.
 * Dependency-free so the central server stays lean.
 */
const crypto = require('crypto');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(encoded) {
  const clean = String(encoded || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    while (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function hotp(secret, counter) {
  const key = base32Decode(secret);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1', key).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(code % 10 ** DIGITS).padStart(DIGITS, '0');
}

function totp(secret, timeMs = Date.now()) {
  return hotp(secret, Math.floor(timeMs / (STEP_SECONDS * 1000)));
}

function verifyTotp(secret, code, windowSteps = 1, timeMs = Date.now()) {
  const expected = String(code || '').trim().padStart(DIGITS, '0');
  const counter = Math.floor(timeMs / (STEP_SECONDS * 1000));
  for (let w = -windowSteps; w <= windowSteps; w += 1) {
    const candidate = hotp(secret, counter + w);
    if (candidate.length === expected.length && crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(expected))) {
      return true;
    }
  }
  return false;
}

function generateSecret(bytes = 20) {
  return base32Encode(crypto.randomBytes(bytes));
}

function provisioningUri(accountName, secret, issuer = 'CeramiSys') {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

function generateBackupCodes(count = 10) {
  const codes = [];
  for (let i = 0; i < count; i += 1) {
    codes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
  }
  return codes;
}

module.exports = {
  generateSecret,
  generateBackupCodes,
  base32Encode,
  base32Decode,
  hotp,
  totp,
  verifyTotp,
  provisioningUri,
};
