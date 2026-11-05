import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

// Security modules
import {
  encryptAes256Gcm,
  decryptAes256Gcm,
  verifyEd25519Signature,
  signEd25519,
  canonicalStringify,
  sha256Hex,
  timingSafeEqual,
} from '../electron/security/crypto.js';
import { LicenseValidator } from '../electron/security/licenseValidator.js';
import { FileIntegrityChecker } from '../electron/security/fileIntegrity.js';
import {
  validateSafePath,
  validateString,
  validateNumber,
  validateByteArray,
  validateExternalUrl,
} from '../electron/security/ipcGuard.js';
import { isAllowedAppUrl, isAllowedIpcSender } from '../electron/security.js';
import { LicenseGuard } from '../electron/licenseGuard.js';
import { DatabaseManager } from '../src/database/db.ts';
import { encryptExternalBackup, decryptExternalBackup } from '../src/services/backupEncryption.ts';

// Generate dynamic keypair for testing
const { publicKey: testPub, privateKey: testPriv } = crypto.generateKeyPairSync('ed25519');
const testPubKeyBase64 = testPub.export({ type: 'spki', format: 'der' }).toString('base64');
const testPrivKeyBase64 = testPriv.export({ type: 'pkcs8', format: 'der' }).toString('base64');

// 1. اختبار تزوير الترخيص (License Forgery Test)
test('SECURITY 01: License forgery with forged signature is strictly rejected', () => {
  const validator = new LicenseValidator({ publicKey: testPubKeyBase64 });
  const payload = {
    licenseKey: 'EDAR-1111-2222-3333',
    customerId: 'cust_target_1',
    hardwareId: 'HWID-TEST-0001-0002-0003',
    licenseType: 'annual',
    validUntil: new Date(Date.now() + 30 * 86400000).toISOString(),
    allowedModules: ['sales', 'inventory'],
    maxDevices: 1,
  };

  // Forged signature
  const forgedCert = {
    payload,
    signature: Buffer.from('attacker_forged_signature_bytes_12345678901234567890123456789012').toString('base64'),
  };

  const result = validator.validateCertificate(forgedCert, 'HWID-TEST-0001-0002-0003');
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'invalid_digital_signature');
});

// 2. اختبار انتهاء الترخيص (License Expiry Test)
test('SECURITY 02: Expired license is rejected while perpetual license remains valid', () => {
  const validator = new LicenseValidator({ publicKey: testPubKeyBase64 });
  const expiredPayload = {
    licenseKey: 'EDAR-EXP1-EXP2-EXP3',
    customerId: 'cust_expired',
    hardwareId: 'HWID-TEST-0001',
    licenseType: 'annual',
    startsAt: new Date(Date.now() - 60 * 86400000).toISOString(),
    validUntil: new Date(Date.now() - 1 * 86400000).toISOString(), // expired yesterday
    allowedModules: ['sales'],
  };
  const expiredSig = signEd25519(expiredPayload, testPrivKeyBase64);
  const expiredCert = { payload: expiredPayload, signature: expiredSig };

  const expiredResult = validator.validateCertificate(expiredCert, 'HWID-TEST-0001');
  assert.equal(expiredResult.valid, false);
  assert.equal(expiredResult.reason, 'license_expired');

  // Perpetual license test
  const perpetualPayload = {
    licenseKey: 'EDAR-PERP-PERP-PERP',
    customerId: 'cust_perpetual',
    hardwareId: 'HWID-TEST-0001',
    licenseType: 'perpetual',
    startsAt: new Date(Date.now() - 365 * 86400000).toISOString(),
    validUntil: new Date(Date.now() - 10 * 86400000).toISOString(), // date in past, but perpetual
    allowedModules: ['sales', 'inventory'],
  };
  const perpetualSig = signEd25519(perpetualPayload, testPrivKeyBase64);
  const perpResult = validator.validateCertificate({ payload: perpetualPayload, signature: perpetualSig }, 'HWID-TEST-0001');
  assert.equal(perpResult.valid, true);
});

// 3. اختبار تعديل بيانات الترخيص (License Payload Tampering Test)
test('SECURITY 03: Modifying legitimate license fields invalidates the digital signature', () => {
  const validator = new LicenseValidator({ publicKey: testPubKeyBase64 });
  const legitPayload = {
    licenseKey: 'EDAR-VALID-KEY-1',
    customerId: 'cust_1',
    hardwareId: 'HWID-DEVICE-A',
    licenseType: 'monthly',
    validUntil: new Date(Date.now() + 15 * 86400000).toISOString(),
    allowedModules: ['sales'],
    maxDevices: 1,
  };
  const signature = signEd25519(legitPayload, testPrivKeyBase64);

  // Attacker tries to escalate privilege by adding 'manufacturing' module
  const tamperedPayload = {
    ...legitPayload,
    allowedModules: ['sales', 'manufacturing', 'finance'],
  };

  const result = validator.validateCertificate({ payload: tamperedPayload, signature }, 'HWID-DEVICE-A');
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'invalid_digital_signature');
});

// 4. اختبار ربط الترخيص بجهاز مختلف (Hardware Binding Test)
test('SECURITY 04: License bound to Machine A is rejected when executed on Machine B', () => {
  const validator = new LicenseValidator({ publicKey: testPubKeyBase64 });
  const payload = {
    licenseKey: 'EDAR-HW-BIND-001',
    customerId: 'cust_bound',
    hardwareId: 'HWID-AUTHORIZED-MACHINE',
    licenseType: 'annual',
    validUntil: new Date(Date.now() + 90 * 86400000).toISOString(),
    allowedModules: ['sales'],
  };
  const signature = signEd25519(payload, testPrivKeyBase64);
  const cert = { payload, signature };

  // On authorized machine -> VALID
  const matchResult = validator.validateCertificate(cert, 'HWID-AUTHORIZED-MACHINE');
  assert.equal(matchResult.valid, true);

  // On cloned/different machine -> HARDWARE MISMATCH
  const mismatchResult = validator.validateCertificate(cert, 'HWID-PIRATED-MACHINE-B');
  assert.equal(mismatchResult.valid, false);
  assert.equal(mismatchResult.reason, 'hardware_mismatch');
});

// 5. اختبار إلغاء الترخيص (License Revocation Test)
test('SECURITY 05: Revoked license flag fails validation immediately', () => {
  const validator = new LicenseValidator({ publicKey: testPubKeyBase64 });
  const payload = {
    licenseKey: 'EDAR-REVOKED-01',
    customerId: 'cust_bad',
    hardwareId: 'HWID-REVOKED-DEV',
    licenseType: 'annual',
    validUntil: new Date(Date.now() + 60 * 86400000).toISOString(),
    allowedModules: ['sales'],
    revoked: true,
  };
  const signature = signEd25519(payload, testPrivKeyBase64);
  const cert = { payload, signature };

  const result = validator.validateCertificate(cert, 'HWID-REVOKED-DEV');
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'license_revoked');
});

// 6. اختبار تشغيل Offline وسقف الصلاحية (Offline Operation & Lease Test)
test('SECURITY 06: Offline operation allowed within offlineLease, fails when lease expires', () => {
  const validator = new LicenseValidator({ publicKey: testPubKeyBase64 });
  // Valid offline lease
  const validOfflinePayload = {
    licenseKey: 'EDAR-OFFLINE-01',
    customerId: 'cust_offline',
    hardwareId: 'HWID-OFFLINE-DEV',
    licenseType: 'annual',
    validUntil: new Date(Date.now() + 300 * 86400000).toISOString(),
    offlineLeaseExpiresAt: new Date(Date.now() + 7 * 86400000).toISOString(), // 7 days lease
    allowedModules: ['sales', 'inventory'],
  };
  const certValid = {
    payload: validOfflinePayload,
    signature: signEd25519(validOfflinePayload, testPrivKeyBase64),
  };
  assert.equal(validator.validateCertificate(certValid, 'HWID-OFFLINE-DEV').valid, true);

  // Expired offline lease (must connect to internet or renew)
  const expiredOfflinePayload = {
    ...validOfflinePayload,
    offlineLeaseExpiresAt: new Date(Date.now() - 2 * 86400000).toISOString(), // expired 2 days ago
  };
  const certExpired = {
    payload: expiredOfflinePayload,
    signature: signEd25519(expiredOfflinePayload, testPrivKeyBase64),
  };
  const expiredResult = validator.validateCertificate(certExpired, 'HWID-OFFLINE-DEV');
  assert.equal(expiredResult.valid, false);
  assert.equal(expiredResult.reason, 'offline_lease_expired');
});

// 7. اختبار التلاعب بملفات البرنامج (App File Integrity Tampering Test)
test('SECURITY 07: File integrity checker detects modified or missing files', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'integrity_test_'));
  try {
    const file1 = path.join(tempDir, 'file1.js');
    const file2 = path.join(tempDir, 'file2.js');
    fs.writeFileSync(file1, 'console.log("clean code 1");', 'utf8');
    fs.writeFileSync(file2, 'console.log("clean code 2");', 'utf8');

    const checker = new FileIntegrityChecker(tempDir);
    const manifest = checker.buildManifest(['file1.js', 'file2.js']);

    // Clean check
    assert.equal(checker.verifyManifest(manifest).valid, true);

    // Tampering file1
    fs.writeFileSync(file1, 'console.log("malicious injected code");', 'utf8');
    const tamperedCheck = checker.verifyManifest(manifest);
    assert.equal(tamperedCheck.valid, false);
    const failedItem = tamperedCheck.results.find((r) => r.file === 'file1.js');
    assert.ok(failedItem);
    assert.equal(failedItem.ok, false);
    assert.equal(failedItem.reason, 'hash_mismatch');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('SECURITY 07b: packaged preload integrity uses a pinned expected hash', () => {
  const sourceRoot = path.resolve('.');
  const mainSource = fs.readFileSync(path.join(sourceRoot, 'electron', 'main.js'), 'utf8');
  const expectedHash = mainSource.match(/PRELOAD_INTEGRITY_SHA256 = '([a-f0-9]{64})'/)?.[1];
  assert.ok(expectedHash, 'main process contains a fixed preload hash');

  const checker = new FileIntegrityChecker(sourceRoot);
  assert.equal(checker.verifyManifest({ 'electron/preload.js': expectedHash }).valid, true);

  const tamperedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'preload_integrity_test_'));
  try {
    fs.mkdirSync(path.join(tamperedRoot, 'electron'), { recursive: true });
    fs.writeFileSync(path.join(tamperedRoot, 'electron', 'preload.js'), 'tampered preload', 'utf8');
    assert.equal(
      new FileIntegrityChecker(tamperedRoot)
        .verifyManifest({ 'electron/preload.js': expectedHash }).valid,
      false,
    );
  } finally {
    fs.rmSync(tamperedRoot, { recursive: true, force: true });
  }
});

// 8. اختبار صلاحيات وسياق مرسل IPC (IPC Security Test)
test('SECURITY 08: IPC sender verification rejects unauthorized frames', () => {
  const appHtmlPath = path.resolve('dist', 'index.html');
  const trustedUrl = `${pathToFileURL(appHtmlPath).href}#/sales`;
  const frame = { url: trustedUrl };
  const event = { senderFrame: frame, sender: { mainFrame: frame } };
  const allowedOrigins = new Set(['http://localhost:5173']);
  const options = { isPackaged: true, appHtmlPath, allowedOrigins };

  // Packaged app from legitimate dist/index.html -> ALLOWED
  assert.equal(isAllowedIpcSender(event, options), true);

  // Subframe or unauthorized frame URL -> REJECTED
  const evilFrame = { url: 'https://evil-phishing.com/exploit.html' };
  assert.equal(isAllowedIpcSender({ senderFrame: evilFrame, sender: { mainFrame: frame } }, options), false);

  // Unauthorized protocol -> REJECTED
  assert.equal(isAllowedAppUrl('javascript:alert(1)', options), false);
  assert.equal(isAllowedAppUrl('data:text/html,hack', options), false);
});

// 9. اختبار مدخلات API / IPC (API Input Validation Test)
test('SECURITY 09: IPC parameter validators enforce type, range and length boundaries', () => {
  // String validation
  assert.equal(validateString('valid-string', { minLength: 3, maxLength: 20 }), 'valid-string');
  assert.throws(() => validateString(123 as any), TypeError);
  assert.throws(() => validateString('ab', { minLength: 3 }), RangeError);
  assert.throws(() => validateString('a'.repeat(25), { maxLength: 20 }), RangeError);

  // Number validation
  assert.equal(validateNumber(42, { min: 0, max: 100 }), 42);
  assert.throws(() => validateNumber('not-a-number'), TypeError);
  assert.throws(() => validateNumber(150, { max: 100 }), RangeError);

  // Byte array validation
  const validBytes = new Uint8Array(1024);
  assert.equal(validateByteArray(validBytes, { maxBytes: 2048 }), validBytes);
  assert.throws(() => validateByteArray('not-bytes' as any), TypeError);
  assert.throws(() => validateByteArray(new Uint8Array(5000), { maxBytes: 2048 }), RangeError);

  // External URL validation (blocks dangerous protocols and loopback)
  assert.equal(validateExternalUrl('https://google.com/search').allowed, true);
  assert.equal(validateExternalUrl('file:///C:/secret.txt').allowed, false);
  assert.equal(validateExternalUrl('javascript:alert(1)').allowed, false);
  assert.equal(validateExternalUrl('http://127.0.0.1:4000/api').allowed, false);
});

// 10. اختبار SQL Injection (SQL Injection Resistance Test)
test('SECURITY 10: Parameterized queries resist SQL injection strings safely', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();

  // Test SQL injection in string parameter
  const evilName = "Test'; DROP TABLE users; --";
  const rows = db.query('SELECT * FROM roles WHERE name = ?', [evilName]);
  assert.ok(Array.isArray(rows));
  assert.equal(rows.length, 0);

  // Verify users table was NOT dropped
  const usersCheck = db.query('SELECT COUNT(*) as count FROM users');
  assert.ok(Number(usersCheck[0].count) >= 0);
});

// 11. اختبار Path Traversal (Path Traversal Resistance Test)
test('SECURITY 11: Path traversal attempts via ../ or encoded null bytes are blocked', () => {
  const baseDir = 'C:\\CeramiSysData\\documents';

  // Legitimate relative paths -> safe
  const safe = validateSafePath(baseDir, 'customer_docs\\contract.pdf');
  assert.ok(safe.toLowerCase().includes('contract.pdf'));

  // Path traversal escapes -> blocked
  assert.throws(() => validateSafePath(baseDir, '..\\..\\Windows\\System32\\calc.exe'), /Path traversal detected/);
  assert.throws(() => validateSafePath(baseDir, '../../../etc/passwd'), /Path traversal detected/);
  assert.throws(() => validateSafePath(baseDir, 'doc\0.pdf'), /null bytes are forbidden/);
  assert.throws(() => validateSafePath(baseDir, 'doc%00.pdf'), /null bytes are forbidden/);
});

// 12. اختبار التحديثات والتكوينات غير الموقعة (Unsigned Updates Rejection Test)
test('SECURITY 12: Unsigned or invalid signed configuration and releases are rejected', () => {
  const data = {
    config: { allowedModules: ['sales'] },
    signature: 'invalid_signature_base64',
  };
  const verified = verifyEd25519Signature(data.config, data.signature, testPubKeyBase64);
  assert.equal(verified, false);
});

// 13. اختبار تشفير وتخزين الأسرار (Secret Storage & AES-GCM Nonce Test)
test('SECURITY 13: AES-256-GCM uses unique random IVs per encryption and detects tampering', () => {
  const key = crypto.randomBytes(32);
  const secret = 'ultra_confidential_db_secret_key_12345';

  const enc1 = encryptAes256Gcm(secret, key);
  const enc2 = encryptAes256Gcm(secret, key);

  // Probabilistic / non-deterministic encryption: same plaintext must yield different IV and ciphertext
  assert.notEqual(enc1.iv, enc2.iv);
  assert.notEqual(enc1.ciphertext, enc2.ciphertext);

  // Decryption succeeds with correct key
  assert.equal(decryptAes256Gcm(enc1, key).toString('utf8'), secret);
  assert.equal(decryptAes256Gcm(enc2, key).toString('utf8'), secret);

  // Tampering with ciphertext fails GCM auth tag check
  const tampered = { ...enc1, ciphertext: Buffer.from('corrupted_ciphertext_bytes_here').toString('base64') };
  assert.throws(() => decryptAes256Gcm(tampered, key));

  // Constant-time compare
  assert.equal(timingSafeEqual('secret_token_123', 'secret_token_123'), true);
  assert.equal(timingSafeEqual('secret_token_123', 'secret_token_456'), false);
});

// 14. اختبار تشفير واستعادة النسخ الاحتياطية (Backup Encryption & Restore Test)
test('SECURITY 14: Encrypted backups protect database contents against unauthorized recovery', async () => {
  const sampleDatabaseBytes = new TextEncoder().encode('SQLite format 3\0sample_encrypted_data');
  const password = 'StrongCorporatePassword#2026';

  const encryptedBackup = await encryptExternalBackup(sampleDatabaseBytes, password);
  assert.notDeepEqual(encryptedBackup, sampleDatabaseBytes);

  // Correct password recovers original database
  const restored = await decryptExternalBackup(encryptedBackup, password);
  assert.deepEqual(restored, sampleDatabaseBytes);

  // Wrong password rejected with authentication error
  await assert.rejects(decryptExternalBackup(encryptedBackup, 'WrongPassword123!'), /كلمة المرور غير صحيحة/);
});

// 15. اختبار عدم كسر الوظائف الأصلية (Regression & Core ERP Integrity Test)
test('SECURITY 15: Core database operations and schema integrity remain fully operational', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();

  // Test inserting and querying data
  const testId = `prod_sec_test_${Date.now()}`;
  db.run(
    `INSERT INTO products (
       id, product_type, custom_unit, sku, barcode, name, category_id, brand_id, grade, size,
       base_unit, sell_unit, pieces_per_box, meters_per_box, cost_price, selling_price_m2,
       min_selling_price_m2, is_active
     ) VALUES (?, 'CERAMIC', '', ?, ?, ?, 'cat_floor', 'br_cleo', 'GRADE_1', '60x60',
       'M2', 'M2', 4, 1.44, 150, 250, 200, 1)`,
    [testId, `SKU_${testId}`, `BAR_${testId}`, 'بلاط اختبار الأمان']
  );

  const found = db.query('SELECT * FROM products WHERE id = ?', [testId]);
  assert.equal(found.length, 1);
  assert.equal(found[0].name, 'بلاط اختبار الأمان');

  // Clean up
  db.run('DELETE FROM products WHERE id = ?', [testId]);
});
