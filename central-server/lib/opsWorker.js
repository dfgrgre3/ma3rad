'use strict';

/**
 * Ops job worker — executes queued platform_ops_jobs rows.
 *
 * Job types:
 *   BACKUP_CREATE  → exports tenant (or platform-wide) data to a JSON artifact
 *                    under CENTRAL_BACKUP_DIR, stores sha256 + size on the
 *                    platform_backups row, marks it COMPLETED.
 *   BACKUP_RESTORE → verifies the artifact checksum, then transactionally
 *                    restores the tenant's platform records (subscriptions,
 *                    licenses, devices, invoices, payments, users, branches,
 *                    support tickets, …) inside the central DB — scoped to
 *                    that tenant only. Audit events and operational logs are
 *                    never rewritten.
 *   REMOTE_SYNC / CONFIG_PUSH → acknowledged and marked COMPLETED (the tenant
 *                    device picks the change up on its next sync).
 *   PROVISIONING / MIGRATION / CUSTOM → no executor; marked FAILED honestly.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { getDb } = require('./db');
const { nowIso } = require('./time');

const TENANT_SCOPED_TABLES = [
  'platform_subscriptions',
  'platform_licenses',
  'platform_license_activations',
  'platform_devices',
  'platform_invoices',
  'platform_payments',
  'platform_tenant_accounts',
  'platform_tenant_users',
  'platform_tenant_overrides',
  'platform_tenant_branches',
  'platform_remote_config',
  'platform_ops_jobs',
  'platform_backups',
  'platform_backup_restores',
  'platform_error_reports',
  'platform_support_tickets',
];

const PLATFORM_TABLES = [
  'platform_tenants',
  'platform_plans',
  'platform_roles',
  'platform_permissions',
  'platform_role_permissions',
  'platform_releases',
  'platform_policies',
  'platform_policy_documents',
  'platform_policy_versions',
];

// Tenant-scoped platform tables restored from a backup artifact, parents
// before children for inserts. Deletes run in reverse order.
// Deliberately excluded: platform_ops_jobs / platform_backups /
// platform_backup_restores / platform_error_reports (operational logs, not
// restorable state) and platform_audit_events (append-only tamper-evident
// chain — rewriting it would corrupt record hashes).
const RESTORE_TABLES = [
  'platform_subscriptions',
  'platform_licenses',
  'platform_devices',
  'platform_invoices',
  'platform_invoice_items',
  'platform_tenant_accounts',
  'platform_tenant_users',
  'platform_tenant_overrides',
  'platform_tenant_branches',
  'platform_remote_config',
  'platform_license_activations',
  'platform_license_changes',
  'platform_subscription_changes',
  'platform_payments',
  'platform_support_tickets',
  'platform_support_messages',
];

function backupDir() {
  if (process.env.CENTRAL_BACKUP_DIR) return process.env.CENTRAL_BACKUP_DIR;
  const dbFile = process.env.CENTRAL_DB_PATH || './central.db';
  return path.join(path.dirname(path.resolve(dbFile)), 'backups');
}

// Tenant application (ERP) snapshots live under their own directory: they are
// opaque encrypted blobs uploaded by devices, never platform metadata exports.
function appBackupDir() {
  if (process.env.CENTRAL_APP_BACKUP_DIR) return process.env.CENTRAL_APP_BACKUP_DIR;
  return path.join(backupDir(), 'app');
}

function safeArtifactName(backupId) {
  return `${String(backupId).replace(/[^A-Za-z0-9_-]/g, '')}.json`;
}

async function exportTenantData(db, tenantId) {
  const dump = { exportedAt: nowIso(), tenantId: tenantId ?? null, tables: {} };

  if (tenantId) {
    dump.tables.platform_tenants = await db.all('SELECT * FROM platform_tenants WHERE id = ?', [tenantId]);
    for (const table of TENANT_SCOPED_TABLES) {
      dump.tables[table] = await db.all(`SELECT * FROM "${table}" WHERE tenant_id = ?`, [tenantId]);
    }
    const ticketIds = (dump.tables.platform_support_tickets || []).map((t) => t.id);
    if (ticketIds.length) {
      dump.tables.platform_support_messages = await db.all(
        `SELECT * FROM platform_support_messages WHERE ticket_id IN (${ticketIds.map(() => '?').join(',')})`,
        ticketIds
      );
    }
    const licenseIds = (dump.tables.platform_licenses || []).map((l) => l.id);
    if (licenseIds.length) {
      dump.tables.platform_license_changes = await db.all(
        `SELECT * FROM platform_license_changes WHERE license_id IN (${licenseIds.map(() => '?').join(',')})`,
        licenseIds
      );
    }
    const subscriptionIds = (dump.tables.platform_subscriptions || []).map((s) => s.id);
    if (subscriptionIds.length) {
      dump.tables.platform_subscription_changes = await db.all(
        `SELECT * FROM platform_subscription_changes WHERE subscription_id IN (${subscriptionIds.map(() => '?').join(',')})`,
        subscriptionIds
      );
    }
    const invoiceIds = (dump.tables.platform_invoices || []).map((i) => i.id);
    if (invoiceIds.length) {
      dump.tables.platform_invoice_items = await db.all(
        `SELECT * FROM platform_invoice_items WHERE invoice_id IN (${invoiceIds.map(() => '?').join(',')})`,
        invoiceIds
      );
    }
    dump.tables.platform_audit_events = await db.all(
      'SELECT * FROM platform_audit_events WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 10000', [tenantId]);
  } else {
    for (const table of [...PLATFORM_TABLES, ...TENANT_SCOPED_TABLES,
      'platform_license_changes', 'platform_subscription_changes',
      'platform_invoice_items',
      'platform_support_messages', 'platform_audit_events']) {
      dump.tables[table] = await db.all(`SELECT * FROM "${table}"`);
    }
  }
  return dump;
}

async function executeBackupCreate(db, job) {
  const payload = typeof job.payload === 'string' ? JSON.parse(job.payload || '{}') : (job.payload || {});
  const backupId = payload.backupId;
  if (!backupId) throw new Error('BACKUP_CREATE job missing payload.backupId');

  const backup = await db.get('SELECT * FROM platform_backups WHERE id = ?', [backupId]);
  if (!backup) throw new Error(`Backup row ${backupId} not found`);

  const dir = backupDir();
  fs.mkdirSync(dir, { recursive: true });
  const fileName = safeArtifactName(backupId);
  const filePath = path.join(dir, fileName);

  const dump = await exportTenantData(db, backup.tenant_id ?? job.tenant_id ?? null);
  const json = JSON.stringify(dump);
  const checksum = crypto.createHash('sha256').update(json).digest('hex');
  fs.writeFileSync(filePath, json, 'utf8');

  const stat = fs.statSync(filePath);
  const now = nowIso();
  await db.run(
    `UPDATE platform_backups SET status = 'COMPLETED', size_bytes = ?, checksum = ?,
       storage_uri = ?, completed_at = ?, error = NULL, updated_at = ? WHERE id = ?`,
    [stat.size, checksum, fileName, now, now, backupId]
  );
  return { backupId, file: fileName, sizeBytes: stat.size, checksum, tenantId: backup.tenant_id ?? null };
}

async function tableColumns(db, table) {
  const cols = await db.all(`PRAGMA table_info('${table}')`);
  return new Set(cols.map((c) => c.name));
}

async function deleteTenantRows(db, tenantId) {
  // Children first.
  await db.run(
    `DELETE FROM platform_support_messages WHERE ticket_id IN
     (SELECT id FROM platform_support_tickets WHERE tenant_id = ?)`, [tenantId]);
  await db.run('DELETE FROM platform_support_tickets WHERE tenant_id = ?', [tenantId]);
  await db.run(
    `DELETE FROM platform_subscription_changes WHERE subscription_id IN
     (SELECT id FROM platform_subscriptions WHERE tenant_id = ?)`, [tenantId]);
  await db.run(
    `DELETE FROM platform_license_changes WHERE license_id IN
     (SELECT id FROM platform_licenses WHERE tenant_id = ?)`, [tenantId]);
  await db.run(
    `DELETE FROM platform_invoice_items WHERE invoice_id IN
     (SELECT id FROM platform_invoices WHERE tenant_id = ?)`, [tenantId]);
  for (const table of [
    'platform_payments', 'platform_license_activations', 'platform_remote_config',
    'platform_tenant_branches', 'platform_tenant_overrides', 'platform_tenant_users',
    'platform_tenant_accounts', 'platform_invoices', 'platform_devices',
    'platform_licenses', 'platform_subscriptions',
  ]) {
    await db.run(`DELETE FROM "${table}" WHERE tenant_id = ?`, [tenantId]);
  }
}

async function insertArtifactRows(db, table, rows, validCols) {
  let inserted = 0;
  for (const row of rows || []) {
    if (!row || typeof row !== 'object' || !row.id) continue;
    const keys = Object.keys(row).filter((k) => validCols.has(k));
    if (!keys.length) continue;
    const placeholders = keys.map(() => '?').join(',');
    await db.run(
      `INSERT OR REPLACE INTO "${table}" (${keys.map((k) => `"${k}"`).join(',')}) VALUES (${placeholders})`,
      keys.map((k) => row[k])
    );
    inserted += 1;
  }
  return inserted;
}

async function applyArtifactToTenant(db, parsed, tenantId) {
  if (parsed.tenantId && parsed.tenantId !== tenantId) {
    throw new Error(`Artifact tenant mismatch: expected ${tenantId}, got ${parsed.tenantId}`);
  }
  const tables = parsed.tables || {};

  // PRAGMA foreign_keys cannot change inside a transaction — disable first.
  await db.exec('PRAGMA foreign_keys = OFF');
  const counts = {};
  try {
    await db.exec('BEGIN TRANSACTION');
    try {
      await deleteTenantRows(db, tenantId);

      // Restore the tenant profile row itself (UPDATE, never re-key the id).
      const tenantRows = tables.platform_tenants || [];
      if (tenantRows.length) {
        const src = tenantRows[0];
        const valid = await tableColumns(db, 'platform_tenants');
        const keys = Object.keys(src).filter((k) => k !== 'id' && valid.has(k));
        if (keys.length) {
          await db.run(
            `UPDATE platform_tenants SET ${keys.map((k) => `"${k}" = ?`).join(', ')} WHERE id = ?`,
            [...keys.map((k) => src[k]), tenantId]
          );
        }
      }

      const colCache = new Map();
      for (const table of RESTORE_TABLES) {
        colCache.set(table, await tableColumns(db, table));
      }
      for (const table of RESTORE_TABLES) {
        counts[table] = await insertArtifactRows(db, table, tables[table], colCache.get(table));
      }
      await db.exec('COMMIT');
    } catch (err) {
      await db.exec('ROLLBACK');
      throw err;
    }
  } finally {
    await db.exec('PRAGMA foreign_keys = ON');
  }
  return counts;
}

async function executeBackupRestore(db, job) {
  const payload = typeof job.payload === 'string' ? JSON.parse(job.payload || '{}') : (job.payload || {});
  const { restoreId, backupId } = payload;
  if (!restoreId || !backupId) throw new Error('BACKUP_RESTORE job missing restoreId/backupId');

  const restore = await db.get('SELECT * FROM platform_backup_restores WHERE id = ?', [restoreId]);
  const backup = await db.get('SELECT * FROM platform_backups WHERE id = ?', [backupId]);
  if (!restore || !backup) throw new Error('Restore or backup row not found');
  if (!backup.storage_uri || !backup.checksum) {
    throw new Error('Backup artifact is missing storage_uri/checksum — cannot verify');
  }

  const markRestoreFailed = async (message) => {
    const now = nowIso();
    await db.run(
      `UPDATE platform_backup_restores SET status = 'FAILED', error = ?, updated_at = ? WHERE id = ?`,
      [message, now, restoreId]
    );
    await db.run(
      `UPDATE platform_backups SET status = 'COMPLETED', updated_at = ? WHERE id = ?`,
      [now, backupId]
    );
  };

  // storage_uri stores only the artifact file name (never an absolute path).
  const filePath = path.join(backupDir(), path.basename(backup.storage_uri));
  let parsed;
  try {
    const raw = fs.readFileSync(filePath);
    const actual = crypto.createHash('sha256').update(raw).digest('hex');
    if (actual !== backup.checksum) {
      throw new Error('Backup artifact checksum mismatch — refusing to restore');
    }
    parsed = JSON.parse(raw.toString('utf8'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markRestoreFailed(message);
    throw err;
  }

  const tableCount = Object.keys(parsed.tables || {}).length;
  const rowCount = Object.values(parsed.tables || {}).reduce((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0);

  let counts;
  try {
    counts = await applyArtifactToTenant(db, parsed, restore.tenant_id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markRestoreFailed(message);
    throw err;
  }

  const now = nowIso();
  const restoredRows = Object.values(counts).reduce((a, b) => a + b, 0);
  await db.run(
    `UPDATE platform_backup_restores SET status = 'COMPLETED', completed_at = ?,
       notes = COALESCE(notes, '') || ?, updated_at = ? WHERE id = ?`,
    [now, ` | restored ${restoredRows} rows across ${RESTORE_TABLES.length} tables from ${backup.storage_uri}`, now, restoreId]
  );
  await db.run(
    `UPDATE platform_backups SET status = 'COMPLETED', updated_at = ? WHERE id = ?`,
    [now, backupId]
  );
  return {
    restoreId, backupId, verified: true, applied: true,
    artifact: backup.storage_uri, rows: rowCount, tables: tableCount,
    restoredRows, perTable: counts,
  };
}

const PASS_THROUGH_TYPES = new Set(['REMOTE_SYNC', 'CONFIG_PUSH']);

async function executeJob(db, job) {
  switch (job.type) {
    case 'BACKUP_CREATE':
      return executeBackupCreate(db, job);
    case 'BACKUP_RESTORE':
      return executeBackupRestore(db, job);
    case 'REMOTE_SYNC':
    case 'CONFIG_PUSH':
      return { acknowledged: true, type: job.type, tenantId: job.tenant_id ?? null };
    default:
      throw new Error(`No executor registered for job type ${job.type}`);
  }
}

async function markJob(db, jobId, status, { result = null, error = null } = {}) {
  const now = nowIso();
  await db.run(
    `UPDATE platform_ops_jobs SET status = ?, result = ?, error = ?, attempts = attempts + 1,
       started_at = COALESCE(started_at, ?), finished_at = ?, updated_at = ? WHERE id = ?`,
    [status, result ? JSON.stringify(result) : null, error, now, now, now, jobId]
  );
}

async function processDueJobs({ limit = 10 } = {}) {
  const db = getDb();
  const now = nowIso();
  const jobs = await db.all(
    `SELECT * FROM platform_ops_jobs
     WHERE status = 'PENDING' AND (run_at IS NULL OR run_at <= ?)
     ORDER BY created_at ASC LIMIT ?`,
    [now, limit]
  );

  const outcomes = [];
  for (const job of jobs) {
    // Claim atomically-ish: only proceed if still PENDING.
    const claimed = await db.run(
      "UPDATE platform_ops_jobs SET status = 'RUNNING', started_at = ?, updated_at = ? WHERE id = ? AND status = 'PENDING'",
      [nowIso(), nowIso(), job.id]
    );
    if (!claimed?.changes) continue;
    try {
      const result = await executeJob(db, job);
      await markJob(db, job.id, 'COMPLETED', { result });
      outcomes.push({ id: job.id, type: job.type, status: 'COMPLETED' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await markJob(db, job.id, 'FAILED', { error: message });
      outcomes.push({ id: job.id, type: job.type, status: 'FAILED', error: message });
    }
  }
  return outcomes;
}

let workerTimer = null;
let lastAppBackupCleanup = 0;
const APP_BACKUP_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Retention for tenant application backups: removes artifacts (and their rows)
 * older than CENTRAL_APP_BACKUP_RETENTION_DAYS (default 90; <=0 disables).
 * Rows with an in-flight restore (REQUESTED/IN_PROGRESS) are never touched,
 * and orphaned .enc files past the cutoff are removed as well.
 */
async function cleanupAppBackups({ retentionDays } = {}) {
  const days = retentionDays ?? Number(process.env.CENTRAL_APP_BACKUP_RETENTION_DAYS ?? 90);
  if (!Number.isFinite(days) || days <= 0) return { deleted: 0 };

  const db = getDb();
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const cutoff = new Date(cutoffMs).toISOString();
  const dir = appBackupDir();

  const expired = await db.all(
    `SELECT id, storage_uri FROM platform_app_backups
     WHERE created_at < ? AND restore_status NOT IN ('REQUESTED','IN_PROGRESS')`,
    [cutoff]
  );
  let deleted = 0;
  for (const row of expired) {
    const filePath = path.join(dir, path.basename(String(row.storage_uri || '')));
    try { if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch { /* best effort */ }
    await db.run('DELETE FROM platform_app_backups WHERE id = ?', [row.id]);
    deleted += 1;
  }

  // Orphaned artifacts: .enc files past the cutoff with no backing row.
  const remaining = new Set(
    (await db.all('SELECT storage_uri FROM platform_app_backups')).map((r) => path.basename(String(r.storage_uri || '')))
  );
  try {
    for (const entry of fs.readdirSync(dir)) {
      if (!entry.endsWith('.enc') || remaining.has(entry)) continue;
      const filePath = path.join(dir, entry);
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < cutoffMs) {
        fs.unlinkSync(filePath);
        deleted += 1;
      }
    }
  } catch { /* missing dir is fine */ }

  if (deleted) console.log(`[ops-worker] app-backup retention removed ${deleted} artifact(s) (>${days}d)`);
  return { deleted };
}

function startOpsWorker({ intervalMs = 5000 } = {}) {
  if (workerTimer) return workerTimer;
  const tick = async () => {
    try {
      if (Date.now() - lastAppBackupCleanup > APP_BACKUP_CLEANUP_INTERVAL_MS) {
        lastAppBackupCleanup = Date.now();
        await cleanupAppBackups();
      }
      const outcomes = await processDueJobs();
      for (const o of outcomes) {
        console.log(`[ops-worker] job ${o.id} (${o.type}) → ${o.status}${o.error ? `: ${o.error}` : ''}`);
      }
    } catch (err) {
      console.error('[ops-worker] tick failed:', err);
    }
  };
  workerTimer = setInterval(tick, intervalMs);
  workerTimer.unref?.();
  // Run once shortly after boot so queued jobs drain without waiting a full interval.
  setTimeout(tick, 1500).unref?.();
  return workerTimer;
}

function stopOpsWorker() {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }
}

module.exports = {
  processDueJobs,
  startOpsWorker,
  stopOpsWorker,
  backupDir,
  appBackupDir,
  cleanupAppBackups,
  exportTenantData,
};
