'use strict';

const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const ed25519 = require('../ed25519');
const { getDb } = require('./db');

let currentSigningKey = null;
let currentVerifyingKey = null;
let currentKeyId = null;

const SIGNING_KEY_BYTES = 32;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Resolves the externally managed signing key, if configured. The private key
 * must live outside the database so a leaked DB copy cannot forge licenses:
 *   - PLATFORM_SIGNING_PRIVATE_KEY : base64-encoded raw 32-byte Ed25519 seed
 *   - PLATFORM_SIGNING_KEY_FILE    : path to a file containing the same value
 * PLATFORM_SIGNING_KEY_ID optionally pins the key_id recorded in the DB.
 * Returns null when neither is configured (legacy DB-backed mode).
 */
function loadExternalSigningKey() {
  const envValue = process.env.PLATFORM_SIGNING_PRIVATE_KEY;
  const keyFile = process.env.PLATFORM_SIGNING_KEY_FILE;

  let encoded = null;
  let source = null;
  if (envValue && envValue.trim()) {
    encoded = envValue.trim();
    source = 'PLATFORM_SIGNING_PRIVATE_KEY';
  } else if (keyFile) {
    encoded = fs.readFileSync(keyFile, 'utf8').trim();
    source = `PLATFORM_SIGNING_KEY_FILE (${keyFile})`;
  }
  if (!encoded) return null;

  if (!BASE64_PATTERN.test(encoded)) {
    throw new Error(`Invalid signing key in ${source}: expected base64-encoded key material`);
  }
  const privateKey = Buffer.from(encoded, 'base64');
  if (privateKey.length !== SIGNING_KEY_BYTES) {
    throw new Error(`Invalid signing key in ${source}: expected ${SIGNING_KEY_BYTES} bytes, got ${privateKey.length}`);
  }
  return { privateKey, source };
}

/**
 * Removes every private_key value from platform_signing_keys. Once an
 * externally managed key is active the table only needs public metadata —
 * historical private keys are dead weight that a DB leak could exploit.
 */
async function scrubPrivateKeysFromDb(db) {
  const result = await db.run('UPDATE platform_signing_keys SET private_key = NULL WHERE private_key IS NOT NULL');
  if (result?.changes) {
    console.log(`Removed ${result.changes} private key(s) from platform_signing_keys (externally managed key active)`);
  }
}

async function initSigningKeys() {
  const db = getDb();
  const external = loadExternalSigningKey();

  if (external) {
    currentSigningKey = external.privateKey;
    currentVerifyingKey = ed25519.publicKeyFromPrivate(currentSigningKey);
    const publicKeyB64 = currentVerifyingKey.toString('base64');
    const configuredKeyId = process.env.PLATFORM_SIGNING_KEY_ID;

    const rows = await db.all(
      'SELECT id, key_id, private_key, public_key, is_active FROM platform_signing_keys'
    );
    let row = configuredKeyId
      ? rows.find((r) => r.key_id === configuredKeyId)
      : rows.find((r) => r.public_key === publicKeyB64);

    if (row && row.public_key !== publicKeyB64) {
      throw new Error(
        `PLATFORM_SIGNING_KEY_ID "${configuredKeyId}" does not match the configured private key's public key`
      );
    }

    if (!row) {
      currentKeyId = configuredKeyId || `key_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      await db.run(
        'INSERT INTO platform_signing_keys (id, key_id, private_key, public_key, is_active) VALUES (?, ?, NULL, ?, 1)',
        [currentKeyId, currentKeyId, publicKeyB64]
      );
    } else {
      currentKeyId = row.key_id;
      await db.run(
        'UPDATE platform_signing_keys SET is_active = 1, expires_at = NULL WHERE id = ?',
        [row.id]
      );
    }

    // The external key is authoritative: deactivate every other row and strip
    // all remaining private key material from the database.
    await db.run('UPDATE platform_signing_keys SET is_active = 0 WHERE key_id != ?', [currentKeyId]);
    await scrubPrivateKeysFromDb(db);

    console.log(`Loaded externally managed signing key: ${currentKeyId} (${external.source})`);
    console.log('Public key (base64):', publicKeyB64);
    return;
  }

  console.warn(
    '[signing] No external signing key configured (PLATFORM_SIGNING_PRIVATE_KEY / PLATFORM_SIGNING_KEY_FILE). ' +
    'Falling back to storing the private key in platform_signing_keys — a database leak would expose it. ' +
    'Configure an external key for production deployments.'
  );

  const existing = await db.get(
    'SELECT * FROM platform_signing_keys WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1'
  );

  if (existing && existing.private_key) {
    currentKeyId = existing.key_id;
    currentSigningKey = Buffer.from(existing.private_key, 'base64');
    currentVerifyingKey = Buffer.from(existing.public_key, 'base64');
    console.log('Loaded existing signing key:', currentKeyId);
  } else {
    const keyPair = ed25519.generateKeyPair();
    currentSigningKey = keyPair.privateKey;
    currentVerifyingKey = keyPair.publicKey;
    currentKeyId = `key_${uuidv4().replace(/-/g, '').slice(0, 12)}`;

    // A row left active with private_key = NULL (externally managed key whose
    // env config was removed) cannot sign — deactivate it before inserting.
    await db.run('UPDATE platform_signing_keys SET is_active = 0 WHERE is_active = 1');
    await db.run(
      'INSERT INTO platform_signing_keys (id, key_id, private_key, public_key, is_active) VALUES (?, ?, ?, ?, 1)',
      [currentKeyId, currentKeyId, currentSigningKey.toString('base64'), currentVerifyingKey.toString('base64')]
    );
    console.log('Generated new signing key:', currentKeyId);
  }

  console.log('Public key (base64):', currentVerifyingKey.toString('base64'));
}

/**
 * Rotates the active Ed25519 signing key: deactivates the current key and
 * installs a freshly generated pair. Previous keys stay in the table
 * (is_active = 0) so historical certificates remain auditable.
 *
 * When an externally managed key is configured the new private key is written
 * to PLATFORM_SIGNING_KEY_FILE (mode 0600) and only public metadata is stored
 * in the database. Rotation requires the key file — an env-var-only key
 * cannot be persisted automatically and must be rotated by updating
 * PLATFORM_SIGNING_PRIVATE_KEY manually.
 */
async function rotateSigningKey() {
  const db = getDb();
  const external = loadExternalSigningKey();
  const keyPair = ed25519.generateKeyPair();
  const newKeyId = `key_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
  const now = new Date().toISOString();

  let privateKeyColumnValue = keyPair.privateKey.toString('base64');
  let privateKeyStorage = 'database';
  if (external) {
    if (process.env.PLATFORM_SIGNING_PRIVATE_KEY && process.env.PLATFORM_SIGNING_PRIVATE_KEY.trim()) {
      throw new Error(
        'Cannot rotate automatically: PLATFORM_SIGNING_PRIVATE_KEY is set and takes precedence over the key file. ' +
        'Update the environment variable manually or unset it and use PLATFORM_SIGNING_KEY_FILE.'
      );
    }
    const keyFile = process.env.PLATFORM_SIGNING_KEY_FILE;
    if (!keyFile) {
      throw new Error(
        'Cannot rotate automatically: no PLATFORM_SIGNING_KEY_FILE configured to receive the new private key. ' +
        'Set PLATFORM_SIGNING_KEY_FILE or update the external key material manually.'
      );
    }
    fs.writeFileSync(keyFile, privateKeyColumnValue, { mode: 0o600 });
    privateKeyColumnValue = null;
    privateKeyStorage = `file:${keyFile}`;
  }

  await db.run('BEGIN TRANSACTION');
  try {
    await db.run(
      'UPDATE platform_signing_keys SET is_active = 0, expires_at = ? WHERE is_active = 1',
      [now]
    );
    await db.run(
      'INSERT INTO platform_signing_keys (id, key_id, private_key, public_key, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)',
      [newKeyId, newKeyId, privateKeyColumnValue, keyPair.publicKey.toString('base64'), now]
    );
    await db.exec('COMMIT');
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }

  currentKeyId = newKeyId;
  currentSigningKey = keyPair.privateKey;
  currentVerifyingKey = keyPair.publicKey;
  return {
    keyId: newKeyId,
    publicKey: keyPair.publicKey.toString('base64'),
    privateKeyStorage,
  };
}

function getVerifyingKey() {
  return currentVerifyingKey;
}

function getKeyId() {
  return currentKeyId;
}

function signString(payloadString) {
  const signature = ed25519.sign(Buffer.from(payloadString, 'utf8'), currentSigningKey);
  return { signature: signature.toString('base64'), key_id: currentKeyId };
}

function signCertificate(payload) {
  const body = JSON.stringify(payload);
  const signature = ed25519.sign(Buffer.from(body), currentSigningKey);
  return {
    payload,
    signature: signature.toString('base64'),
    key_id: currentKeyId,
  };
}

function verifyCertificate(certificate, publicKey = currentVerifyingKey) {
  const body = JSON.stringify(certificate.payload);
  return ed25519.verify(Buffer.from(body), Buffer.from(certificate.signature, 'base64'), publicKey);
}

function generateLicenseKey() {
  const block = () => uuidv4().replace(/-/g, '').slice(0, 4).toUpperCase();
  return `CS-${block()}-${block()}-${block()}-${block()}`;
}

function generateActivationCode() {
  const block = () => uuidv4().replace(/-/g, '').slice(0, 4).toUpperCase();
  return `${block()}-${block()}-${block()}`;
}

module.exports = {
  initSigningKeys,
  rotateSigningKey,
  getVerifyingKey,
  getKeyId,
  signString,
  signCertificate,
  verifyCertificate,
  generateLicenseKey,
  generateActivationCode,
};
