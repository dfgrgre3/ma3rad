import { OutboxRepository } from './OutboxRepository.ts';
import type { SyncStatus } from './types.ts';

export class SyncHealthMonitor {
  private lastSuccessfulSyncAt: string | null = null;
  private lastError: string | null = null;
  private connected = false;
  private outbox: OutboxRepository;
  constructor(outbox?: OutboxRepository) { this.outbox = outbox || new OutboxRepository(); }
  setConnected(v: boolean): void { this.connected = v; }
  setLastSuccess(ts: string): void { this.lastSuccessfulSyncAt = ts; }
  setLastError(err: string | null): void { this.lastError = err; }
  status(): SyncStatus {
    return {
      connected: this.connected,
      lastSuccessfulSyncAt: this.lastSuccessfulSyncAt,
      pendingCount: this.outbox.countPending(),
      failedCount: this.outbox.countFailed(),
      deadLetterCount: this.outbox.countDeadLetter(),
      lastError: this.lastError,
    };
  }
}
