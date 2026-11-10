import { BACKUP_MAGIC, IV_LENGTH, SALT_LENGTH, deriveKey, isEncryptedBackup, toArrayBuffer } from './backupEncryption_part01';

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
