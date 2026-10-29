const BACKUP_MAGIC = new TextEncoder().encode('CERAMISYS-BACKUP\n1\n');
const SALT_LENGTH = 16;
const LOCAL_DATABASE_MAGIC = new Uint8Array([67, 69, 82, 65, 77, 73, 83, 89, 83, 45, 68, 66, 0, 118, 49, 0]);
const IV_LENGTH = 12;
const PBKDF2_ITERATIONS = 310_000;
const SIGNATURE_LENGTH = 64; // SHA-512 for strong integrity

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function startsWithBytes(data: Uint8Array, prefix: Uint8Array): boolean {
  return data.length >= prefix.length && prefix.every((byte, index) => data[index] === byte);
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: toArrayBuffer(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export function isEncryptedBackup(bytes: Uint8Array): boolean {
  return startsWithBytes(bytes, BACKUP_MAGIC);
}

export function isEncryptedLocalDatabase(bytes: Uint8Array): boolean {
  return startsWithBytes(bytes, LOCAL_DATABASE_MAGIC);
}

export async function encryptExternalBackup(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(password, salt);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, toArrayBuffer(bytes)
  ));
  const result = new Uint8Array(BACKUP_MAGIC.length + SALT_LENGTH + IV_LENGTH + ciphertext.length);
  let offset = 0;
  result.set(BACKUP_MAGIC, offset); offset += BACKUP_MAGIC.length;
  result.set(salt, offset); offset += SALT_LENGTH;
  result.set(iv, offset); offset += IV_LENGTH;
  result.set(ciphertext, offset);
  return result;
}

export async function decryptExternalBackup(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  if (!isEncryptedBackup(bytes)) throw new Error('صيغة النسخة غير معروفة.');
  const offset = BACKUP_MAGIC.length;
  if (bytes.length <= offset + SALT_LENGTH + IV_LENGTH + 16) throw new Error('ملف النسخة المشفرة ناقص أو تالف.');
  const salt = bytes.slice(offset, offset + SALT_LENGTH);
  const iv = bytes.slice(offset + SALT_LENGTH, offset + SALT_LENGTH + IV_LENGTH);
  const ciphertext = bytes.slice(offset + SALT_LENGTH + IV_LENGTH);
  try {
    const key = await deriveKey(password, salt);
    return new Uint8Array(await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, toArrayBuffer(ciphertext)
    ));
  } catch {
    throw new Error('كلمة المرور غير صحيحة أو ملف النسخة تالف.');
  }
}

/**
 * توليد توقيع رقمي للتحقق من سلامة ملف النسخة الاحتياطية
 */
export async function generateBackupSignature(
  bytes: Uint8Array,
  secretKey: CryptoKey
): Promise<Uint8Array> {
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-512' },
    secretKey,
    toArrayBuffer(bytes)
  );  // Get signature as Uint8Array
  return new Uint8Array(signature);
}

/**
 * التحقق من التوقيع الرقمي لضمان عدم التعديل على ملف النسخة الاحتياطية
 */
export async function verifyBackupSignature(
  bytes: Uint8Array,
  signature: Uint8Array,
  secretKey: CryptoKey
): Promise<boolean> {
  try {
    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-512' },
      secretKey,
      toArrayBuffer(signature),
      toArrayBuffer(bytes)
    );
  } catch {
    return false;
  }
}

/**
 * إنشاء نسخة احتياطية مشفرة مع توقيع رقمي
 */
export async function encryptBackupWithSignature(
  bytes: Uint8Array,
  password: string,
  secretKey: CryptoKey
): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  // Generate signature BEFORE encryption (on plaintext)
  const signature = await generateBackupSignature(bytes, secretKey);

  const key = await deriveKey(password, salt);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, toArrayBuffer(bytes)
  ));

  // Build result: MAGIC + SALT + IV + SIGNATURE + CIPHERTEXT
  const result = new Uint8Array(
    BACKUP_MAGIC.length + SALT_LENGTH + IV_LENGTH + SIGNATURE_LENGTH + ciphertext.length
  );
  let offset = 0;
  result.set(BACKUP_MAGIC, offset); offset += BACKUP_MAGIC.length;
  result.set(salt, offset); offset += SALT_LENGTH;
  result.set(iv, offset); offset += IV_LENGTH;
  result.set(signature, offset); offset += SIGNATURE_LENGTH;
  result.set(ciphertext, offset);

  return result;
}

/**
 * فك تشفير النسخة الاحتياطية مع التحقق من التوقيع الرقمي
 */
export async function decryptBackupWithSignature(
  bytes: Uint8Array,
  password: string,
  secretKey: CryptoKey
): Promise<Uint8Array> {
  if (!isEncryptedBackup(bytes)) throw new Error('صيغة النسخة غير معروفة.');
  const offset = BACKUP_MAGIC.length;
  if (bytes.length <= offset + SALT_LENGTH + IV_LENGTH + SIGNATURE_LENGTH + 16) {
    throw new Error('ملف النسخة المشفرة ناقص أو تالف.');
  }

  const salt = bytes.slice(offset, offset + SALT_LENGTH);
  const iv = bytes.slice(offset + SALT_LENGTH, offset + SALT_LENGTH + IV_LENGTH);
  const signature = bytes.slice(offset + SALT_LENGTH + IV_LENGTH, offset + SALT_LENGTH + IV_LENGTH + SIGNATURE_LENGTH);
  const ciphertext = bytes.slice(offset + SALT_LENGTH + IV_LENGTH + SIGNATURE_LENGTH);

  try {
    const key = await deriveKey(password, salt);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, toArrayBuffer(ciphertext)
    );

    // Verify signature on the PLAINTEXT
    const isSignatureValid = await verifyBackupSignature(
      new Uint8Array(decrypted),
      signature,
      secretKey
    );

    if (!isSignatureValid) {
      throw new Error('لم يتم التحقق من صحة التوقيع الرقمي - قد تكون النسخة تالفة أو مشبوهة.');
    }

    return new Uint8Array(decrypted);
  } catch (error: any) {
    if (error.message?.includes('signature')) {
      throw error;
    }
    throw new Error('كلمة المرور غير صحيحة أو ملف النسخة تالف.');
  }
}

