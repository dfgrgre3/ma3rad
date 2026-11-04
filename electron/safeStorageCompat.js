'use strict';

async function isEncryptionAvailable(safeStorage) {
  if (typeof safeStorage.isAsyncEncryptionAvailable === 'function') {
    return safeStorage.isAsyncEncryptionAvailable();
  }
  if (typeof safeStorage.isEncryptionAvailable === 'function') {
    return safeStorage.isEncryptionAvailable();
  }
  throw new Error('OS secure storage availability cannot be checked by this Electron version.');
}

async function encryptString(safeStorage, value) {
  if (typeof safeStorage.encryptStringAsync === 'function') {
    return safeStorage.encryptStringAsync(value);
  }
  if (typeof safeStorage.encryptString === 'function') {
    return safeStorage.encryptString(value);
  }
  throw new Error('OS secure storage encryption is unavailable in this Electron version.');
}

async function decryptString(safeStorage, encrypted) {
  if (typeof safeStorage.decryptStringAsync === 'function') {
    const result = await safeStorage.decryptStringAsync(encrypted);
    if (typeof result?.result !== 'string') {
      throw new Error('OS secure storage returned an invalid decrypted value.');
    }
    return result.result;
  }
  if (typeof safeStorage.decryptString === 'function') {
    return safeStorage.decryptString(encrypted);
  }
  throw new Error('OS secure storage decryption is unavailable in this Electron version.');
}

module.exports = {
  decryptString,
  encryptString,
  isEncryptionAvailable,
};
