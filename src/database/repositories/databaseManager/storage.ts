import { DB_STORAGE_KEY } from './constants';
import { bytesToBase64, toUint8Array } from './utils';

const DB_IDB_NAME = 'ceramisys_database';
const DB_IDB_STORE = 'snapshots';
const DB_IDB_KEY = 'main';
const DB_IDB_KEY_STORE = 'keys';
const DB_IDB_ENCRYPTION_KEY_ID = 'main';
const DB_IDB_VERSION = 2;
const DB_ENCRYPTION_KEY_KEY = 'ceramisys_db_encryption_key';
// Tracks whether the last persisted browser snapshot was ciphertext. Updated
// on every browser write/read so getPersistenceStatus() can report the real
// at-rest encryption state instead of assuming IndexedDB is always plaintext.
let lastKnownBrowserSnapshotEncrypted: boolean | null = null;

/** Read by DatabaseManager.getPersistenceStatus() (see persistence.ts). */
export function getBrowserSnapshotEncryptionState(): boolean | null {
  return lastKnownBrowserSnapshotEncrypted;
}

/**
 * Production builds must never persist the database snapshot unencrypted:
 * the browser fallback key lives in localStorage next to the data, so a
 * plaintext snapshot would expose the entire business database to any script
 * running on the origin. Development/test builds keep the legacy plaintext
 * fallback so local previews and unit tests keep working.
 */
function isProductionBuild(): boolean {
  try {
    return typeof import.meta !== 'undefined' && Boolean((import.meta as { env?: { PROD?: boolean } }).env?.PROD);
  } catch {
    return false;
  }
}

const SQLITE_IMAGE_HEADER = 'SQLite format 3\0';

function isSqliteImage(bytes: Uint8Array): boolean {
  if (bytes.length < SQLITE_IMAGE_HEADER.length) return false;
  for (let i = 0; i < SQLITE_IMAGE_HEADER.length; i++) {
    if (bytes[i] !== SQLITE_IMAGE_HEADER.charCodeAt(i)) return false;
  }
  return true;
}

/**
 * Encryption utilities for IndexedDB storage using Web Crypto API (AES-GCM).
 * Falls back to unencrypted storage if crypto is unavailable.
 */
async function getOrCreateEncryptionKey(): Promise<CryptoKey | null> {
  try {
    if (typeof crypto === 'undefined' || !crypto.subtle) {
      console.warn('[database] Web Crypto API not available, using unencrypted storage');
      return null;
    }

    // Preferred: a non-extractable CryptoKey persisted in IndexedDB. Page
    // script can use it for encrypt/decrypt but can never export the raw key
    // material, unlike a JWK stored in localStorage next to the data.
    if (typeof indexedDB !== 'undefined') {
      try {
        const db = await openDatabaseStorage();
        try {
          const stored = await new Promise<unknown>((resolve, reject) => {
            const request = db
              .transaction(DB_IDB_KEY_STORE, 'readonly')
              .objectStore(DB_IDB_KEY_STORE)
              .get(DB_IDB_ENCRYPTION_KEY_ID);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          if (stored instanceof CryptoKey) return stored;
        } finally {
          db.close();
        }
      } catch {
        // Fall through to the legacy localStorage key or generate a new one.
      }
    }

    // Legacy path: existing installs keep an exportable JWK in localStorage.
    if (typeof localStorage !== 'undefined') {
      const storedKey = localStorage.getItem(DB_ENCRYPTION_KEY_KEY);
      if (storedKey) {
        const keyData = JSON.parse(storedKey);
        return await crypto.subtle.importKey(
          'jwk',
          keyData,
          { name: 'AES-GCM', length: 256 },
          true,
          ['encrypt', 'decrypt']
        );
      }
    }

    // Generate a fresh non-extractable key and persist the CryptoKey object
    // itself in IndexedDB (structured clone keeps it non-exportable).
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    if (typeof indexedDB !== 'undefined') {
      try {
        const db = await openDatabaseStorage();
        try {
          await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction(DB_IDB_KEY_STORE, 'readwrite');
            transaction.objectStore(DB_IDB_KEY_STORE).put(key, DB_IDB_ENCRYPTION_KEY_ID);
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error || new Error('Browser key storage write aborted'));
          });
        } finally {
          db.close();
        }
        return key;
      } catch (error) {
        console.warn('[database] Could not persist encryption key in IndexedDB; falling back to localStorage JWK:', error);
      }
    }

    // Last resort for environments without IndexedDB: exportable JWK in
    // localStorage (legacy behaviour, weaker threat model).
    if (typeof localStorage !== 'undefined') {
      const exportableKey = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );
      const exportedKey = await crypto.subtle.exportKey('jwk', exportableKey);
      localStorage.setItem(DB_ENCRYPTION_KEY_KEY, JSON.stringify(exportedKey));
      return exportableKey;
    }

    return key;
  } catch (error) {
    console.warn('[database] Failed to setup encryption, using unencrypted storage:', error);
    return null;
  }
}

async function encryptData(data: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data.buffer as ArrayBuffer
  );
  const result = new Uint8Array(iv.length + encrypted.byteLength);
  result.set(iv);
  result.set(new Uint8Array(encrypted), iv.length);
  return result;
}

async function decryptData(data: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
  const iv = data.slice(0, 12);
  const encrypted = data.slice(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted
  );
  return new Uint8Array(decrypted);
}

function openDatabaseStorage(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_IDB_NAME, DB_IDB_VERSION);
    request.onupgradeneeded = () => {
      const result = request.result;
      if (!result.objectStoreNames.contains(DB_IDB_STORE)) result.createObjectStore(DB_IDB_STORE);
      if (!result.objectStoreNames.contains(DB_IDB_KEY_STORE)) result.createObjectStore(DB_IDB_KEY_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open browser database storage'));
  });
}

export async function readBrowserSnapshot(): Promise<Uint8Array | null> {
  if (typeof indexedDB !== 'undefined') {
    const db = await openDatabaseStorage();
    try {
      const value = await new Promise<unknown>((resolve, reject) => {
        const request = db.transaction(DB_IDB_STORE, 'readonly').objectStore(DB_IDB_STORE).get(DB_IDB_KEY);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const stored = toUint8Array(value);
      if (stored) {
        // Try to decrypt if encryption key is available
        const key = await getOrCreateEncryptionKey();
        if (key) {
          try {
            const plaintext = await decryptData(stored, key);
            lastKnownBrowserSnapshotEncrypted = true;
            return plaintext;
          } catch (decryptError) {
            // Only accept plaintext when it is recognizably a legacy SQLite
            // image — never feed ciphertext back into sql.js as if it were data.
            if (isSqliteImage(stored)) {
              console.warn('[database] Snapshot is not decryptable; treating it as legacy unencrypted data:', decryptError);
              lastKnownBrowserSnapshotEncrypted = false;
              return stored;
            }
            throw new Error('Database snapshot could not be decrypted and is not a valid SQLite image', { cause: decryptError });
          }
        }
        lastKnownBrowserSnapshotEncrypted = false;
        return stored;
      }
    } finally { db.close(); }
  }
  return null;
}

export async function writeBrowserSnapshot(bytes: Uint8Array, key = DB_IDB_KEY): Promise<void> {
  // Resolve the key once up front so the plaintext guard covers both the
  // IndexedDB and localStorage branches.
  const encryptionKey = await getOrCreateEncryptionKey();
  if (!encryptionKey && isProductionBuild()) {
    throw new Error(
      'Encrypted browser storage is unavailable (Web Crypto API missing or key setup failed). ' +
      'Refusing to persist the database unencrypted in a production build.'
    );
  }
  if (typeof indexedDB !== 'undefined') {
    const db = await openDatabaseStorage();
    try {
      const dataToWrite = encryptionKey ? await encryptData(bytes, encryptionKey) : bytes;

      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(DB_IDB_STORE, 'readwrite');
        transaction.objectStore(DB_IDB_STORE).put(dataToWrite, key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error('Browser database storage write aborted'));
      });
      lastKnownBrowserSnapshotEncrypted = encryptionKey != null;
    } finally { db.close(); }
    return;
  }
  if (typeof localStorage !== 'undefined') {
    // The legacy localStorage path stores a plaintext base64 snapshot. That
    // is tolerable for development previews/tests, but a production build
    // must never expose the whole business database as readable text — fail
    // the save instead of silently downgrading to plaintext.
    if (isProductionBuild()) {
      throw new Error(
        'Refusing to persist the database snapshot in plaintext localStorage in a production build. ' +
        'Encrypted IndexedDB storage or the desktop file backend is required.'
      );
    }
    localStorage.setItem(key === DB_IDB_KEY ? DB_STORAGE_KEY : key, bytesToBase64(bytes));
    lastKnownBrowserSnapshotEncrypted = false;
    return;
  }
  throw new Error('No browser database storage is available');
}

// Removes the browser snapshot (encrypted or plaintext) once the encrypted file backend is
// authoritative, so no copy of the database lingers on disk.
// Backup snapshots stored under other keys are left untouched.
export async function deleteBrowserSnapshot(): Promise<void> {
  try {
    if (typeof indexedDB !== 'undefined') {
      const db = await openDatabaseStorage();
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction(DB_IDB_STORE, 'readwrite');
          transaction.objectStore(DB_IDB_STORE).delete(DB_IDB_KEY);
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error || new Error('Browser database storage delete aborted'));
        });
        if (db.objectStoreNames.contains(DB_IDB_KEY_STORE)) {
          await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction(DB_IDB_KEY_STORE, 'readwrite');
            transaction.objectStore(DB_IDB_KEY_STORE).delete(DB_IDB_ENCRYPTION_KEY_ID);
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error || new Error('Browser key storage delete aborted'));
          });
        }
        lastKnownBrowserSnapshotEncrypted = null;
      } finally { db.close(); }
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(DB_STORAGE_KEY);
      // Also remove encryption key when deleting snapshot for security
      localStorage.removeItem(DB_ENCRYPTION_KEY_KEY);
    }
  } catch { /* best effort: a stale copy must not break the encrypted save */ }
}
