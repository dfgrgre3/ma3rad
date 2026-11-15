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

function getVerifyingKey() {
  return currentVerifyingKey;
}

function getKeyId() {
  return currentKeyId;
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
  getVerifyingKey,
  getKeyId,
  signCertificate,
  verifyCertificate,
  generateLicenseKey,
  generateActivationCode,
};
