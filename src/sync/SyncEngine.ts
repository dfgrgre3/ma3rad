import { OutboxRepository } from './OutboxRepository.ts';
import { InboxRepository } from './InboxRepository.ts';
import { PushChangesService } from './PushChangesService.ts';
import { PullChangesService } from './PullChangesService.ts';
import { CursorManager } from './CursorManager.ts';
import { SyncHealthMonitor } from './SyncHealthMonitor.ts';
import { RetryScheduler } from './RetryScheduler.ts';
import { SyncAuditLogger } from './SyncAuditLogger.ts';
import { EventDispatcher } from './PullChangesService.ts';
import { EventValidator } from './EventValidator.ts';
import type { SyncEvent, SyncTransport, SyncStatus } from './types.ts';

export class SyncEngine {
  public outbox: OutboxRepository;
  public inbox: InboxRepository;
  public cursor: CursorManager;
  public push: PushChangesService;
  public pull: PullChangesService;
  public health: SyncHealthMonitor;
  public retry: RetryScheduler;
  public audit: SyncAuditLogger;
  public dispatcher: EventDispatcher;
  private transport?: SyncTransport;
  private scope: string;
  private activeCycle: Promise<void> | null = null;
  private lastErrorLogAt = 0;
  constructor(opts?: { scope?: string; transport?: SyncTransport }) {
    this.outbox = new OutboxRepository();
    this.inbox = new InboxRepository();
    this.cursor = new CursorManager();
    this.dispatcher = new EventDispatcher();
    this.pull = new PullChangesService(this.inbox, new EventValidator(), this.dispatcher);
    this.health = new SyncHealthMonitor(this.outbox);
    this.retry = new RetryScheduler();
    this.audit = new SyncAuditLogger();
    this.scope = opts?.scope || 'default';
    this.transport = opts?.transport;
    this.push = new PushChangesService(this.outbox, this.transport);
  }
  setTransport(transport: SyncTransport): void {
    this.transport = transport;
    this.push = new PushChangesService(this.outbox, transport);
  }
  enqueueChange(input: any): string {
    const id = this.outbox.enqueue(input);
    this.audit.log({ branchId: input.branchId, action: 'ENQUEUE', details: { eventId: id, entityType: input.entityType } });
    return id;
  }
  runCycle(): Promise<void> {
    if (this.activeCycle) return this.activeCycle;
    this.activeCycle = this.executeCycle().finally(() => {
      this.activeCycle = null;
    });
    return this.activeCycle;
  }

  private async executeCycle(): Promise<void> {
    try {
      this.outbox.recoverInFlight();
      if (!this.transport) throw new Error('No sync transport configured');
      const queuedIncoming = await this.pull.applyIncoming(this.inbox.listPending(100));
      if (queuedIncoming.failed > 0) {
        throw new Error(`${queuedIncoming.failed} queued sync event(s) could not be applied`);
      }
      const cursor = this.cursor.getCursor(this.scope);
      const pulled = await this.transport.pullEvents(this.scope, cursor, 100);
      const result = await this.pull.applyIncoming(pulled.events);
      if (result.failed > 0) throw new Error(`${result.failed} incoming sync event(s) could not be applied`);
      if (pulled.nextCursor !== null) this.cursor.setCursor(this.scope, pulled.nextCursor);
      await this.push.pushOnce();
      this.health.setConnected(true);
      this.health.setLastSuccess(new Date().toISOString());
      this.health.setLastError(null);
    } catch (error) {
      this.health.setConnected(false);
      this.health.setLastError(error instanceof Error ? error.message : String(error));
      if (Date.now() - this.lastErrorLogAt >= 60000) {
        this.lastErrorLogAt = Date.now();
        console.error('Synchronization cycle failed:', error);
      }
    }
  }
  async pullOnceRemote(scope?: string): Promise<{ applied: number; duplicates: number; failed: number }> {
    if (!this.transport) throw new Error('No transport');
    const s = scope || this.scope;
    const queuedIncoming = await this.pull.applyIncoming(this.inbox.listPending(100));
    if (queuedIncoming.failed > 0) {
      throw new Error(`${queuedIncoming.failed} queued sync event(s) could not be applied`);
    }
    const cursor = this.cursor.getCursor(s);
    const pulled = await this.transport.pullEvents(s, cursor, 100);
    const res = await this.pull.applyIncoming(pulled.events);
    if (res.failed === 0 && pulled.nextCursor !== null) this.cursor.setCursor(s, pulled.nextCursor);
    return res;
  }
  status(): SyncStatus { return this.health.status(); }
}
