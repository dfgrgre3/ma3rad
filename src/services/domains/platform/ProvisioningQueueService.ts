import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { v4 as uuidv4 } from 'uuid';

/**
 * Provisioning job lifecycle.
 *
 * Canonical transitions (no skipping allowed):
 *   PENDING ──enqueue──▶ PENDING            (first submission; idempotency-keyed)
 *   PENDING ──PROCESS──▶ PROCESSING         (executor picked the job up)
 *   PROCESSING ──success──▶ PROVISIONED     (tenant identity system confirmed)
 *   PROCESSING ──fail──▶ RETRYING|FAILED   (transient → RETRYING, attempts<5)
 *   PENDING/RETRYING ──retry-scheduled──▶ RETRYING
 *   any active ──cancel──▶ CANCELLED        (manual/super admin stop)
 *   PENDING/RETRYING ──expire──▶ CANCELLED  (invite/expiry window elapsed)
 *
 * Retry policy: a failing channel marks the job RETRYING with attempts+1 and a
 * backoff delay; jobs whose attempts reach MAX_ATTEMPTS land in FAILED
 * (terminal). Deferrals (no bridge / channel not configured) keep the job
 * PENDING and record a reason without burning an attempt.
 */
export const PROVISIONING_JOB_STATUSES = [
  'PENDING',
  'PROCESSING',
  'PROVISIONED',
  'FAILED',
  'RETRYING',
  'CANCELLED',
] as const;

export type ProvisioningJobStatus = (typeof PROVISIONING_JOB_STATUSES)[number];

export interface ProvisioningJob {
  id: string;
  tenantId: string;
  tenantUserId: string;
  event: string;
  payload: string;
  status: ProvisioningJobStatus;
  attempts: number;
  lastError: string | null;
  idempotencyKey: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const PROVISIONING_MAX_ATTEMPTS = 5;
const RETRY_BACKOFF_MS = 30_000;

function nowIso(): string {
  return new Date().toISOString();
}

export class ProvisioningQueueService {
  private db = DatabaseManager.getInstance();

  ensureSchema(): void {
    this.db.run(`CREATE TABLE IF NOT EXISTS provisioning_queue (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      tenant_user_id TEXT NOT NULL,
      event TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      idempotency_key TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
    // Transitional migrations for databases created by older builds of this
    // feature (no destructive changes; only additive columns).
    try {
      this.db.run(`ALTER TABLE provisioning_queue ADD COLUMN idempotency_key TEXT`);
    } catch {
      /* already present */
    }
    try {
      this.db.run(`ALTER TABLE provisioning_queue ADD COLUMN expires_at TEXT`);
    } catch {
      /* already present */
    }
  }

  enqueue(
    tenantId: string,
    tenantUserId: string,
    event: string,
    payload: Record<string, unknown>,
    expiresAt?: string | null,
  ): ProvisioningJob {
    this.ensureSchema();
    const id = `prvq_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = nowIso();
    const payloadStr = JSON.stringify(payload);
    const key = `${event}:${tenantId}:${tenantUserId}`;
    // Idempotent enqueue: a retry of the same logical request never starts a
    // second job while the previous one is still active.
    const existing = this.db.query<any>(
      `SELECT * FROM provisioning_queue WHERE idempotency_key = ? AND status IN ('PENDING','PROCESSING','RETRYING') LIMIT 1`,
      [key],
    )[0];
    if (existing) {
      return this.map({ ...existing, status: (existing.status as ProvisioningJobStatus) ?? 'PENDING', attempts: Number(existing.attempts || 0), lastError: existing.last_error ?? existing.lastError ?? null });
    }
    this.db.run(
      `INSERT INTO provisioning_queue (id, tenant_id, tenant_user_id, event, payload, status, attempts, last_error, idempotency_key, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'PENDING', 0, NULL, ?, ?, ?, ?)`,
      [id, tenantId, tenantUserId, event, payloadStr, key, expiresAt ?? null, now, now],
    );
    return {
      id,
      tenantId,
      tenantUserId,
      event,
      payload: payloadStr,
      status: 'PENDING',
      attempts: 0,
      lastError: null,
      idempotencyKey: key,
      expiresAt: expiresAt ?? null,
      createdAt: now,
      updatedAt: now,
    };
  }

  /** Jobs eligible for execution: active, not expired, within retry budget. */
  listPending(limit = 50): ProvisioningJob[] {
    this.ensureSchema();
    const rows = this.db.query<any>(
      `SELECT * FROM provisioning_queue
       WHERE status IN ('PENDING','RETRYING')
         AND (? IS NULL OR expires_at IS NULL OR expires_at > ?)
       ORDER BY created_at ASC
       LIMIT ?`,
      [nowIso(), nowIso(), limit],
    );
    return rows.map(this.map);
  }

  /** Jobs that are considered expired (invite window elapsed) → CANCELLED. */
  listExpired(): ProvisioningJob[] {
    this.ensureSchema();
    const now = nowIso();
    const rows = this.db.query<any>(
      `SELECT * FROM provisioning_queue
       WHERE status IN ('PENDING','RETRYING') AND expires_at IS NOT NULL AND expires_at <= ?
       ORDER BY created_at ASC`,
      [now],
    );
    return rows.map(this.map);
  }

  markProcessing(id: string): void {
    this.ensureSchema();
    this.db.run(`UPDATE provisioning_queue SET status='PROCESSING', updated_at=? WHERE id=?`, [nowIso(), id]);
  }

  markDone(id: string, status: 'PROVISIONED' | 'DONE' = 'PROVISIONED'): void {
    this.ensureSchema();
    // Legacy callers may still pass the old terminal status name; both map to
    // the canonical PROVISIONED outcome.
    const next: ProvisioningJobStatus = status === 'DONE' ? 'PROVISIONED' : status;
    this.db.run(`UPDATE provisioning_queue SET status=?, updated_at=? WHERE id=?`, [next, nowIso(), id]);
  }

  markFailed(id: string, error: string, retry = true): 'FAILED' | 'RETRYING' {
    this.ensureSchema();
    const row = this.db.query<any>('SELECT attempts FROM provisioning_queue WHERE id = ? LIMIT 1', [id])[0];
    const attempts = Number(row?.attempts || 0) + 1;
    const terminal = attempts >= PROVISIONING_MAX_ATTEMPTS;
    const status: ProvisioningJobStatus = !retry || terminal ? 'FAILED' : 'RETRYING';
    const lastError = error.slice(0, 500);
    this.db.run(
      `UPDATE provisioning_queue SET status=?, attempts=?, last_error=?, updated_at=? WHERE id=?`,
      [status, attempts, lastError, nowIso(), id],
    );
    return status;
  }

  markRetrying(id: string, error: string): 'FAILED' | 'RETRYING' {
    this.ensureSchema();
    const row = this.db.query<any>('SELECT attempts FROM provisioning_queue WHERE id = ? LIMIT 1', [id])[0];
    const attempts = Number(row?.attempts || 0) + 1;
    const status: ProvisioningJobStatus = attempts >= PROVISIONING_MAX_ATTEMPTS ? 'FAILED' : 'RETRYING';
    this.db.run(
      `UPDATE provisioning_queue SET status=?, attempts=?, last_error=?, updated_at=? WHERE id=?`,
      [status, attempts, error.slice(0, 500), nowIso(), id],
    );
    return status;
  }

  markCancelled(id: string, reason = 'CANCELLED'): void {
    this.ensureSchema();
    this.db.run(
      `UPDATE provisioning_queue SET status='CANCELLED', last_error=?, updated_at=? WHERE id=?`,
      [reason, nowIso(), id],
    );
  }

  private map(row: any): ProvisioningJob {
    // DatabaseManager normalizes snake_case columns to camelCase on read;
    // accept both shapes so direct rows also map correctly.
    const tenantId = row.tenantId ?? row.tenant_id;
    const tenantUserId = row.tenantUserId ?? row.tenant_user_id;
    const lastError = row.lastError ?? row.last_error ?? null;
    const idempotencyKey = row.idempotencyKey ?? row.idempotency_key ?? null;
    const expiresAt = row.expiresAt ?? row.expires_at ?? null;
    const rawStatus = String(row.status ?? 'PENDING');
    const status = (PROVISIONING_JOB_STATUSES as readonly string[]).includes(rawStatus)
      ? (rawStatus as ProvisioningJobStatus)
      : 'PENDING';
    return {
      id: String(row.id),
      tenantId: String(tenantId),
      tenantUserId: String(tenantUserId),
      event: String(row.event),
      payload: String(row.payload),
      status,
      attempts: Number(row.attempts || 0),
      lastError: lastError == null ? null : String(lastError),
      idempotencyKey: idempotencyKey == null ? null : String(idempotencyKey),
      expiresAt: expiresAt == null ? null : String(expiresAt),
      createdAt: String(row.createdAt ?? row.created_at),
      updatedAt: String(row.updatedAt ?? row.updated_at),
    };
  }
}

export const provisioningQueueService = new ProvisioningQueueService();
