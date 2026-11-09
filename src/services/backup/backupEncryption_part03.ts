import { BACKUP_MAGIC, IV_LENGTH, SALT_LENGTH, SIGNATURE_LENGTH, deriveKey, toArrayBuffer } from './backupEncryption_part01';
import { generateBackupSignature } from './backupEncryption_part02';

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
