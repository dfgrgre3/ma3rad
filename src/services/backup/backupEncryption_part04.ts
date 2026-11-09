import { BACKUP_MAGIC, IV_LENGTH, SALT_LENGTH, SIGNATURE_LENGTH, deriveKey, isEncryptedBackup, toArrayBuffer } from './backupEncryption_part01';
import { verifyBackupSignature } from './backupEncryption_part02';

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
