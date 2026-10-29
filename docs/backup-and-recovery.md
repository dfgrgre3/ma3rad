# Backup and Recovery Runbook

Verified behavior in this repository is limited to the automated tests listed at the bottom. Follow the manual verification steps before relying on a restore in production.

## 1. What is backed up

- The full SQLite database image (all business, financial, inventory, HR, audit and settings data).
- Backup metadata rows in `backup_history` (file name, location, size, type, status).
- Auto-backup runs on the configured interval (`autoBackupIntervalHours`, default 24 hours) when the desktop app is running.

Document attachments are **not** inside the SQLite image. They are copied by the Electron document vault into the user-data `documents/` folder. Back up that folder together with the database; the database stores only the attachment metadata (file name, size, SHA-256 checksum and storage name).

## 2. Backup types

| Type | How it is created | Location |
| --- | --- | --- |
| Auto snapshot | `BackupService.runAutoBackupIfDue` via Electron `backup` IPC | Electron user-data `backups/` folder |
| Manual local snapshot | **Settings → Backup → Create snapshot** | Electron user-data `backups/` |
| Portable export | **Settings → Backup → Export** | User-selected download; AES-256-GCM encrypted with PBKDF2-SHA-256 key derivation |

Portable exports use the `.ceramisys-backup` extension. Keep the export password separately from the file; it cannot be recovered from the application.

## 3. Verify a backup

1. Create or select a backup.
2. The service validates the file signature, decrypts it when encrypted, opens it as a SQLite database and runs an integrity check before reporting success.
3. Record the result in the backup history and, for portable exports, store the file on a different device or medium.

A backup that has not been opened and integrity-checked is not a verified backup.

## 4. Restore procedure

1. Sign in as ADMIN (`settings.backup` permission required).
2. Take a pre-restore local snapshot when prompted; the restore flow also creates one automatically.
3. Select the backup file.
4. The service validates the file, imports it, re-runs integrity verification, and rolls back to the pre-restore snapshot if verification fails.
5. Confirm business data after restore: log in, open dashboard, check recent invoices, trial balance and stock balances.

For manual recovery without the application:

1. Close the application so the database file is not locked.
2. Copy the current database file aside (do not overwrite it).
3. Replace it with the verified backup file.
4. Start the application and check the audit log and financial statements.

## 5. Retention and responsibilities

- Keep at least one off-device copy of every portable export.
- Never delete the newest verified backup, automatic or manual.
- Record who performed a restore, when, and which backup was used.
- Test a restore into a separate workstation at least quarterly.

## 6. Automated coverage

- `test/backup-encryption.test.ts`: encrypted export round-trip and tamper detection.
- `test/database-recovery.test.ts`: recovery behavior for a corrupted/unavailable database path.
- Backup retention and scheduling behavior are covered in the service test suite.

Not yet verified: restore from a real operator backup at production size, and full disaster recovery on a clean machine.
