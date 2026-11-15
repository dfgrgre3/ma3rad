import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { provisioningQueueService, PROVISIONING_MAX_ATTEMPTS, type ProvisioningJob } from './ProvisioningQueueService';
import { identityLinkService } from './IdentityLinkService';
import { centralAuditService } from './CentralAuditService';

/**
 * Executes queued tenant-identity provisioning jobs.
 *
 * The queue is the contract between the platform console and the tenant's
 * identity system. A job only reaches PROVISIONED — and the directory record
 * only reaches PROVISIONED with a linked identity — when the configured
 * endpoint confirms creation. Without a configured channel, jobs stay PENDING
 * with an explicit `last_error`; nothing ever reports PROVISIONED on a guess.
 *
 * Configuration (platform_settings):
 *   platform.provisioningPath — central-server-relative path the tenant ERP
 *   exposes for identity provisioning, e.g. `/api/v1/tenants/users`. The path
 *   must be allowlisted in electron/centralRoutes.generated.js (the bridge
 *   will refuse anything else). When unset, provisioning is deferred.
 *
 * Retry policy: a failing channel marks the job RETRYING with attempts+1 and a
 * backoff delay; jobs whose attempts reach the max are terminal FAILED.
 * Jobs with attempts >= MAX_ATTEMPTS are no longer picked up. Deferrals
 * (no bridge, no channel configured) never burn an attempt.
 */

export type ProvisioningDrainResult = {
  picked: number;
  succeeded: number;
  failed: number;
  deferred: number;
  retrying: number;
};

const CHANNEL_SETTING = 'platform.provisioningPath';

function nowIso(): string {
  return new Date().toISOString();
}

export class ProvisioningExecutorService {
  private db = DatabaseManager.getInstance();
  private draining = false;

  /** Fire-and-forget drain; safe to call from request paths. */
  public requestDrain(): void {
    if (this.draining) return;
    this.draining = true;
    void this.processPending(20)
      .catch(() => undefined)
      .finally(() => {
        this.draining = false;
      });
  }

  public async processPending(limit = 20): Promise<ProvisioningDrainResult> {
    const now = new Date().toISOString();
    // Expiry sweep: outstanding invites/attempts whose window elapsed are
    // cancelled rather than retried blindly.
    for (const expired of provisioningQueueService.listExpired()) {
      provisioningQueueService.markCancelled(expired.id, 'EXPIRED');
    }
    const jobs = provisioningQueueService
      .listPending(limit)
      .filter((job) => (job.status === 'PENDING' || job.status === 'RETRYING') && job.attempts < PROVISIONING_MAX_ATTEMPTS);

    const result: ProvisioningDrainResult = { picked: jobs.length, succeeded: 0, failed: 0, deferred: 0, retrying: 0 };
    for (const job of jobs) {
      const outcome = await this.processJob(job);
      if (outcome === 'done') result.succeeded += 1;
      else if (outcome === 'failed') result.failed += 1;
      else if (outcome === 'retrying') result.retrying += 1;
      else result.deferred += 1;
    }
    return result;
  }

  private setting(key: string, fallback: string): string {
    try {
      const row = this.db.query<{ value: string }>(
        'SELECT value FROM platform_settings WHERE key = ? LIMIT 1',
        [key],
      )[0];
      return row?.value != null ? String(row.value) : fallback;
    } catch {
      return fallback;
    }
  }

  private bridge(): { request: (req: Record<string, unknown>) => Promise<any> } | null {
    const central = typeof globalThis !== 'undefined' ? (globalThis as any)?.window?.ceramisys?.central : null;
    return central && typeof central.request === 'function' ? central : null;
  }

  private audit(tenantId: string, tenantUserId: string, action: string, details?: unknown, severity = 'NOTICE'): void {
    try {
      centralAuditService.log(
        { id: null, fullName: 'Platform Provisioning Executor', role: 'SYSTEM' },
        {
          action,
          entityType: 'TENANT_USER',
          entityId: tenantUserId,
          tenantId,
          actorType: 'SYSTEM',
          severity: severity as any,
          details,
        } as any,
      );
    } catch {
      // Audit must never break provisioning bookkeeping.
    }
  }

  private defer(job: ProvisioningJob, reason: string): void {
    // Deferring is not a failure of the tenant channel's health — it means no
    // channel exists yet. Keep the job PENDING, record why, burn no attempt.
    try {
      const row = this.db.query<any>(
        'SELECT last_error FROM provisioning_queue WHERE id = ? LIMIT 1',
        [job.id],
      )[0];
      const currentError = String(row?.lastError ?? row?.last_error ?? '') || '';
      if (currentError !== reason) {
        this.db.run(`UPDATE provisioning_queue SET status = 'PENDING', last_error = ?, updated_at = ? WHERE id = ?`, [reason, nowIso(), job.id]);
        try {
          this.db.run(
            `UPDATE platform_tenant_users SET last_error = ?, updated_at = ? WHERE id = ?`,
            [reason, nowIso(), job.tenantUserId],
          );
        } catch {
          // best effort
        }
        this.audit(job.tenantId, job.tenantUserId, 'TENANT_USER_PROVISION_DEFERRED', { reason, jobId: job.id });
      }
    } catch {
      // best effort
    }
  }

  private async processJob(job: ProvisioningJob): Promise<'done' | 'failed' | 'deferred' | 'retrying'> {
    const bridge = this.bridge();
    const provisioningPath = this.setting(CHANNEL_SETTING, '').trim();
    if (!bridge) {
      this.defer(job, 'CENTRAL_BRIDGE_UNAVAILABLE');
      return 'deferred';
    }
    if (!provisioningPath) {
      this.defer(job, 'TENANT_IDENTITY_CHANNEL_NOT_CONFIGURED');
      return 'deferred';
    }

    // Move the job into PROCESSING so observers see the in-flight state.
    provisioningQueueService.markProcessing(job.id);

    const tenantUser = this.db.query<any>(
      'SELECT * FROM platform_tenant_users WHERE id = ? LIMIT 1',
      [job.tenantUserId],
    )[0];
    if (!tenantUser) {
      if (this.markFailed(job, 'TENANT_USER_NOT_FOUND', true) === 'FAILED') {
        return 'failed';
      }
      return 'retrying';
    }

    try {
      const response = await bridge.request({
        path: provisioningPath,
        method: 'POST',
        headers: { 'Idempotency-Key': job.id },
        body: {
          tenantId: job.tenantId,
          tenantUserId: job.tenantUserId,
          username: tenantUser.username ?? null,
          fullName: tenantUser.fullName ?? tenantUser.full_name ?? null,
          email: tenantUser.email ?? null,
          phone: tenantUser.phone ?? null,
          role: tenantUser.role ?? null,
          scope: tenantUser.scope ?? null,
          mode: tenantUser.provisioningMode ?? tenantUser.provisioning_mode ?? null,
          inviteExpiresAt: tenantUser.inviteExpiresAt ?? tenantUser.invite_expires_at ?? null,
          idempotencyKey: job.id,
          event: job.event,
        },
      });

      if (!response || response.ok === false) {
        throw new Error(String(response?.error || 'Provisioning endpoint rejected the request'));
      }

      const identityUserId =
        response?.data?.identityUserId ?? response?.identityUserId ?? response?.data?.identity_user_id ?? null;

      const now = nowIso();
      this.db.run(
        `UPDATE platform_tenant_users
            SET provisioning_status = 'PROVISIONED',
                identity_user_id = COALESCE(?, identity_user_id),
                provisioned_at = ?,
                last_error = NULL,
                updated_at = ?
          WHERE id = ?`,
        [identityUserId, now, now, job.tenantUserId],
      );
      provisioningQueueService.markDone(job.id);

      if (!identityLinkService.findByTenantUser(job.tenantUserId)) {
        identityLinkService.link({ tenantUserId: job.tenantUserId, linkType: 'TENANT_USER' });
      }
      this.audit(job.tenantId, job.tenantUserId, 'TENANT_USER_PROVISIONED', {
        jobId: job.id,
        identityUserId,
        mode: tenantUser.provisioningMode ?? tenantUser.provisioning_mode ?? null,
      });
      return 'done';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const next = this.markFailed(job, message);
      // RETRYING keeps the job queued with backoff; FAILED is terminal.
      return next === 'FAILED' ? 'failed' : 'retrying';
    }
  }

  private markFailed(job: ProvisioningJob, message: string, terminal = false): 'FAILED' | 'RETRYING' {
    const next = provisioningQueueService.markFailed(job.id, message, terminal);
    if (next === 'FAILED') {
      try {
        this.db.run(
          `UPDATE platform_tenant_users
              SET provisioning_status = 'FAILED', last_error = ?, updated_at = ?
            WHERE id = ?`,
          [message.slice(0, 500), nowIso(), job.tenantUserId],
        );
      } catch {
        // best effort
      }
    }
    this.audit(job.tenantId, job.tenantUserId, 'TENANT_USER_PROVISION_FAILED', { jobId: job.id, message }, 'WARNING');
    return next;
  }
}

export const provisioningExecutorService = new ProvisioningExecutorService();
