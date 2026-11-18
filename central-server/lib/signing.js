'use strict';

const { v4: uuidv4 } = require('uuid');
const ed25519 = require('../ed25519');
const { getDb } = require('./db');

let currentSigningKey = null;
let currentVerifyingKey = null;
let currentKeyId = null;

async function initSigningKeys() {
  const db = getDb();
  const existing = await db.get(
    'SELECT * FROM platform_signing_keys WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1'
  );

  if (existing) {
    currentKeyId = existing.key_id;
    currentSigningKey = Buffer.from(existing.private_key, 'base64');
    currentVerifyingKey = Buffer.from(existing.public_key, 'base64');
    console.log('Loaded existing signing key:', currentKeyId);
  } else {
    const keyPair = ed25519.generateKeyPair();
    currentSigningKey = keyPair.privateKey;
    currentVerifyingKey = keyPair.publicKey;
    currentKeyId = `key_${uuidv4().replace(/-/g, '').slice(0, 12)}`;

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
 */
async function rotateSigningKey() {
  const db = getDb();
  const keyPair = ed25519.generateKeyPair();
  const newKeyId = `key_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
  const now = new Date().toISOString();

  await db.run('BEGIN TRANSACTION');
  try {
    await db.run(
      'UPDATE platform_signing_keys SET is_active = 0, expires_at = ? WHERE is_active = 1',
      [now]
    );
    await db.run(
      'INSERT INTO platform_signing_keys (id, key_id, private_key, public_key, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)',
      [newKeyId, newKeyId, keyPair.privateKey.toString('base64'), keyPair.publicKey.toString('base64'), now]
    );
    await db.exec('COMMIT');
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }

  currentKeyId = newKeyId;
  currentSigningKey = keyPair.privateKey;
  currentVerifyingKey = keyPair.publicKey;
  return { keyId: newKeyId, publicKey: keyPair.publicKey.toString('base64') };
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
