/*
 * Development-only: decrypt a CeramiSys database copy for read-only auditing.
 *
 *   npx electron scripts/db-decrypt-audit.cjs <encrypted-db> <plain-output> [appDataDir]
 *
 * The key is read from `<appDataDir>/database-key.enc` through Electron's
 * OS-backed safeStorage. Never point this at a live file that the running app
 * still has open for writing; copy it first.
 */
const { app, safeStorage } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createDecipheriv } = require('node:crypto');
const safeStorageCompat = require('../electron/safeStorageCompat');

const DB_MAGIC = Buffer.from('CERAMISYS-DB\0v1\0', 'utf8');

// safeStorage (Chromium OSCrypt) reads its app-bound key material from the
// profile's Local State. Point the profile at the same directory the desktop
// app uses before `ready`, otherwise decryption fails even for the same user.
const APP_DATA_DIR = process.env.CERAMISYS_USER_DATA_DIR
  || path.join(process.env.APPDATA || os.homedir(), 'CeramiSysERP');
app.setPath('userData', APP_DATA_DIR);
app.setName('CeramiSys ERP');

function hasDatabaseMagic(bytes) {
  return Buffer.from(bytes).subarray(0, DB_MAGIC.length).equals(DB_MAGIC);
}

function decryptDatabaseBytes(bytes, key) {
  const data = Buffer.from(bytes);
  if (!hasDatabaseMagic(data)) return data;
  const offset = DB_MAGIC.length;
  const iv = data.subarray(offset, offset + 12);
  const tag = data.subarray(offset + 12, offset + 28);
  const ciphertext = data.subarray(offset + 28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

app.whenReady().then(async () => {
  const [source, target, appDataArg] = process.argv.slice(2);
  if (!source || !target) throw new Error('Usage: electron scripts/db-decrypt-audit.cjs <encrypted-db> <plain-output> [appDataDir]');
  const appDataDir = appDataArg || path.join(process.env.APPDATA || os.homedir(), 'CeramiSysERP');
  const encryptedKey = await fs.readFile(path.join(appDataDir, 'database-key.enc'));
  if (!(await safeStorageCompat.isEncryptionAvailable(safeStorage))) {
    throw new Error('OS secure storage is unavailable.');
  }
  const key = Buffer.from(await safeStorageCompat.decryptString(safeStorage, encryptedKey), 'base64');
  if (key.length !== 32) throw new Error('Invalid database encryption key.');
  const plain = decryptDatabaseBytes(await fs.readFile(source), key);
  await fs.writeFile(target, plain, { mode: 0o600 });
  console.log(`Decrypted ${source} -> ${target} (${plain.length} bytes)`);
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
