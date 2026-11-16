import { DatabaseManager } from '../database/repositories/databaseManager.ts';
import { SyncPolicyService } from './SyncPolicyService.ts';
import { AccountLinkService } from './AccountLinkService.ts';
import { PendingChangeService } from './PendingChangeService.ts';
import type { SyncBranchStatus, SyncOverview } from '../types/sync/index.ts';

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

function count(db: DatabaseManager, sql: string, params: unknown[] = []): number {
  return Number(db.query<{ count: number }>(sql, params as any[])[0]?.count ?? 0);
}

/**
 * Read-only aggregation of the whole synchronization surface: connection
 * state, last successful contact, queue depth, conflicts, pending owner
 * approvals, and one row per branch/linked account.
 */
export class SyncStatusService {
  private readonly db: DatabaseManager;
  private readonly links: AccountLinkService;
  private readonly pending: PendingChangeService;

  constructor(db: DatabaseManager = DatabaseManager.getInstance()) {
    this.db = db;
    this.links = new AccountLinkService(db);
    this.pending = new PendingChangeService(db);
  }

  overview(runtime?: { connected?: boolean; lastSuccessfulSyncAt?: string | null; lastError?: string | null }): SyncOverview {
    const identity = SyncPolicyService.currentIdentity();
    const configured = identity !== null;

    const outbox = this.db.query<{ status: string; count: number }>(
      `SELECT delivery_status AS status, COUNT(*) AS count FROM sync_outbox GROUP BY delivery_status`
    );
    const byStatus = (status: string) => Number(outbox.find((row) => row.status === status)?.count ?? 0);

    const inboxPending = count(
      this.db, `SELECT COUNT(*) AS count FROM sync_inbox WHERE status = 'RECEIVED'`
    );
    const conflicts = count(
      this.db, `SELECT COUNT(*) AS count FROM sync_conflicts WHERE status = 'OPEN'`
    );
    const lastSuccess = runtime?.lastSuccessfulSyncAt
      ?? this.db.query<{ at: string | null }>(
        `SELECT MAX(acknowledged_at) AS at FROM sync_outbox WHERE delivery_status = 'ACKNOWLEDGED'`
      )[0]?.at
      ?? null;
    const lastError = runtime?.lastError
      ?? this.db.query<{ error: string | null }>(
        `SELECT last_error AS error FROM sync_outbox WHERE last_error IS NOT NULL
         ORDER BY created_at DESC LIMIT 1`
      )[0]?.error
      ?? null;

    // Without a live engine handle, fall back to queue health: a clean queue
    // with recent successful delivery implies the link was reachable.
    const healthyQueue = byStatus('FAILED') === 0 && byStatus('DEAD_LETTER') === 0;
    const recentSuccess = Boolean(lastSuccess)
      && Date.now() - new Date(lastSuccess!).getTime() < ONLINE_WINDOW_MS;
    const connected = configured && (runtime?.connected ?? (healthyQueue && recentSuccess));

    return {
      configured,
      connected,
      lastSuccessfulSyncAt: lastSuccess,
      lastError,
      pendingCount: byStatus('PENDING') + byStatus('IN_FLIGHT'),
      failedCount: byStatus('FAILED'),
      deadLetterCount: byStatus('DEAD_LETTER'),
      inboxPendingCount: inboxPending,
      conflictCount: conflicts,
      pendingApprovalCount: this.pending.countPending(),
      branches: this.branches(),
      links: this.links.list(),
    };
  }

  branches(): SyncBranchStatus[] {
    const now = Date.now();
    return this.db
      .query<{
        branchId: string;
        name: string;
        status: string;
        isVerified: number;
        lastContactAt: string | null;
        lastSyncAt: string | null;
      }>(
        `SELECT branch_id AS branch_id, name, status, is_verified AS is_verified,
                last_contact_at AS last_contact_at, last_sync_at AS last_sync_at
         FROM sync_branches ORDER BY name`
      )
      .map((row) => {
        const deviceCount = count(
          this.db, `SELECT COUNT(*) AS count FROM sync_devices WHERE branch_id = ?`, [row.branchId]
        );
        const pendingChanges = count(
          this.db,
          `SELECT COUNT(*) AS count FROM sync_pending_changes WHERE status = 'PENDING' AND branch_id = ?`,
          [row.branchId]
        );
        const lastContact = row.lastContactAt ?? null;
        const online = Boolean(lastContact) && now - new Date(lastContact!).getTime() < ONLINE_WINDOW_MS;
        return {
          branchId: row.branchId,
          name: row.name,
          status: row.status,
          isVerified: row.isVerified === 1,
          lastContactAt: lastContact,
          lastSyncAt: row.lastSyncAt ?? null,
          deviceCount,
          pendingChanges,
          online,
        };
      });
  }

  /** Record a successful contact with a branch (called by the sync worker). */
  touchBranch(branchId: string, syncedAt: string = new Date().toISOString()): void {
    this.db.run(
      `UPDATE sync_branches
       SET last_contact_at = CURRENT_TIMESTAMP, last_sync_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE branch_id = ?`,
      [syncedAt, branchId]
    );
  }
}
