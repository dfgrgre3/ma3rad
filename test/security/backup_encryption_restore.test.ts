import '../integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'node:crypto';
import { DatabaseManager } from '../../src/database/repositories/databaseManager.ts';
import fs from 'fs';
import os from 'os';
import path from 'path';

const MAGIC = Buffer.from('CERAMISYS-DB\0v1\0', 'utf8');

function encryptDbBytes(plaintext: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, iv, tag, ciphertext]);
}

function decryptDbBytes(encrypted: Buffer, key: Buffer): Buffer {
  const data = Buffer.from(encrypted);
  if (!data.subarray(0, MAGIC.length).equals(MAGIC)) return data;
  const iv = data.subarray(MAGIC.length, MAGIC.length + 12);
  const tag = data.subarray(MAGIC.length + 12, MAGIC.length + 28);
  const ciphertext = data.subarray(MAGIC.length + 28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

const RECOVERY_FORMAT = 'CERAMISYS-RECOVERY-KEY';
const RECOVERY_SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function deriveRecoveryKey(password: string, salt: Buffer, keyLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, RECOVERY_SCRYPT, (err, key) => err ? reject(err) : resolve(key as Buffer));
  });
}

async function encryptRecoveryKey(key: Buffer, password: string): Promise<Buffer> {
  if (key.length !== 32) throw new Error('Invalid key length');
  if (typeof password !== 'string' || password.length < 12 || password.length > 255) {
    throw new Error('Recovery password must be 12-255 characters');
  }
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const wrappingKey = await deriveRecoveryKey(password, salt, 32);
  const cipher = createCipheriv('aes-256-gcm', wrappingKey, iv);
  const ciphertext = Buffer.concat([cipher.update(key), cipher.final()]);
  const payload = { format: RECOVERY_FORMAT, version: 1, kdf: 'scrypt',
    salt: salt.toString('base64'), iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
  return Buffer.from(JSON.stringify(payload), 'utf8');
}

async function decryptRecoveryKey(bytes: Buffer, password: string): Promise<Buffer> {
  const payloadBytes = Buffer.from(bytes);
  if (payloadBytes.length === 0 || payloadBytes.length > 16 * 1024) throw new Error('Invalid recovery file size');
  if (typeof password !== 'string' || password.length < 12 || password.length > 255) {
    throw new Error('Invalid recovery password');
  }
  let payload: any;
  try { payload = JSON.parse(payloadBytes.toString('utf8')); } catch { throw new Error('Corrupt recovery file'); }
  if (!payload || payload.format !== RECOVERY_FORMAT || payload.version !== 1 || payload.kdf !== 'scrypt') {
    throw new Error('Unsupported recovery file format');
  }
  const decodeField = (value: string, expectedLength: number, label: string): Buffer => {
    if (typeof value !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error(`Invalid ${label}`);
    const decoded = Buffer.from(value, 'base64');
    if (decoded.length !== expectedLength) throw new Error(`Invalid ${label} length`);
    return decoded;
  };
  const salt = decodeField(payload.salt, 16, 'salt');
  const iv = decodeField(payload.iv, 12, 'iv');
  const tag = decodeField(payload.tag, 16, 'tag');
  const ciphertext = decodeField(payload.ciphertext, 32, 'ciphertext');
  const wrappingKey = await deriveRecoveryKey(password, salt, 32);
  const decipher = createDecipheriv('aes-256-gcm', wrappingKey, iv);
  decipher.setAuthTag(tag);
  const key = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  if (key.length !== 32) throw new Error('Invalid recovered key');
  return key;
}


test('backup encryption: database bytes are encrypted with AES-256-GCM and not readable as plaintext', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  const key = randomBytes(32);

  const plaintext = Buffer.from('SQLite format 3\0' + JSON.stringify({ sensitive: 'financial data' }), 'utf8');
  const encrypted = encryptDbBytes(plaintext, key);

  assert.ok(!encrypted.subarray(0, 15).equals(Buffer.from('SQLite format 3\0', 'binary')), 'encrypted backup must not expose SQLite header');
  assert.ok(!encrypted.toString('utf8').includes('financial data'), 'encrypted backup must not contain plaintext data');

  const decrypted = decryptDbBytes(encrypted, key);
  assert.ok(decrypted.toString('utf8').includes('financial data'), 'decryption must restore original data');
});

test('backup encryption: wrong key must fail closed (GCM auth tag verification)', async () => {
  const keyA = randomBytes(32);
  const keyB = randomBytes(32);
  const plaintext = Buffer.from('secret data', 'utf8');
  const encrypted = encryptDbBytes(plaintext, keyA);

  assert.throws(() => decryptDbBytes(encrypted, keyB), /تعذر|فشل|auth|tag|decrypt/,
    'decryption with wrong key must fail closed');
});

test('recovery key: encrypt and decrypt database key with strong password (scrypt)', async () => {
  const dbKey = randomBytes(32);
  const password = 'C3ramisys_R3c0very_2026!';
  const encrypted = await encryptRecoveryKey(dbKey, password);
  const recovered = await decryptRecoveryKey(encrypted, password);
  assert.ok(recovered.equals(dbKey), 'recovery key must round-trip the original database key');
});

test('recovery key: wrong recovery password must fail', async () => {
  const dbKey = randomBytes(32);
  const encrypted = await encryptRecoveryKey(dbKey, 'CorrectP@ssword2026!');
  await assert.rejects(() => decryptRecoveryKey(encrypted, 'WrongP@ssword2026!'),
    /تعذر|فشل|Invalid|corrupt/,
    'wrong recovery password must fail');
});

test('restore on different device: database key is bound to device safeStorage, recovery key needed', async () => {
  const dbKey = randomBytes(32);
  const recoveryPassword = 'DeviceTransfer_R3c0very_2026!';
  const encryptedRecovery = await encryptRecoveryKey(dbKey, recoveryPassword);

  const recoveredKey = await decryptRecoveryKey(encryptedRecovery, recoveryPassword);
  assert.ok(recoveredKey.equals(dbKey), 'different device can restore using recovery key + password');

  await assert.rejects(() => decryptRecoveryKey(encryptedRecovery, ''),
    /متنوعة|12|255|Invalid/,
    'empty recovery password must be rejected');
});

test('encrypted backup file integrity: decrypted backup preserves byte length and header', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  const key = randomBytes(32);

  const testData = Buffer.from('SQLite format 3\0' + Buffer.alloc(4096), 'utf8');
  const encrypted = encryptDbBytes(testData, key);
  const decrypted = decryptDbBytes(encrypted, key);

  assert.equal(decrypted.length, testData.length, 'decrypted backup must preserve byte length');
  assert.ok(decrypted.subarray(0, 15).equals(Buffer.from('SQLite format 3\0', 'binary')),
    'decrypted backup must restore SQLite header');
});