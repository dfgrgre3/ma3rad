import { InboxRepository } from './InboxRepository.ts';
import { EventValidator } from './EventValidator.ts';
import type { SyncEvent } from './types.ts';

export class EventDispatcher {
  private handlers = new Map<string, (event: SyncEvent) => void | 'DEFERRED' | Promise<void | 'DEFERRED'>>();
  register(entityType: string, handler: (event: SyncEvent) => void | 'DEFERRED' | Promise<void | 'DEFERRED'>): void {
    this.handlers.set(entityType, handler);
  }
  async dispatch(event: SyncEvent): Promise<void | 'DEFERRED'> {
    const handler = this.handlers.get(event.entityType);
    if (!handler) throw new Error(`No sync handler registered for entity type: ${event.entityType}`);
    return handler(event);
  }
}

export class PullChangesService {
  private inbox: InboxRepository;
  private validator: EventValidator;
  private dispatcher: EventDispatcher;
  private readonly processingEventIds = new Set<string>();
  constructor(inbox?: InboxRepository, validator?: EventValidator, dispatcher?: EventDispatcher) {
    this.inbox = inbox || new InboxRepository();
    this.validator = validator || new EventValidator();
    this.dispatcher = dispatcher || new EventDispatcher();
  }
  async applyIncoming(events: SyncEvent[]): Promise<{ applied: number; duplicates: number; failed: number }> {
    let applied = 0, duplicates = 0, failed = 0;
    for (const event of events) {
      const eventId = typeof event?.eventId === 'string' ? event.eventId : null;
      if (eventId && this.processingEventIds.has(eventId)) {
        duplicates++;
        continue;
      }
      if (eventId) this.processingEventIds.add(eventId);
      let canMarkFailed = false;
      try {
        this.validator.assertValid(event);
        const isNew = this.inbox.recordReceived(event);
        canMarkFailed = true;
        if (!isNew) {
          const status = this.inbox.getStatus(event.eventId);
          if (status === 'APPLIED' || status === 'DUPLICATE') {
            duplicates++;
            continue;
          }
          if (status === 'REJECTED') {
            failed++;
            continue;
          }
          this.inbox.prepareForRetry(event.eventId);
        }
        const dispatchResult = await this.dispatcher.dispatch(event);
        if (dispatchResult === 'DEFERRED') continue;
        this.inbox.markApplied(event.eventId);
        applied++;
      } catch (error) {
        if (canMarkFailed && eventId && eventId.length > 0) {
          this.inbox.markFailed(event.eventId, error instanceof Error ? error.message : String(error));
        }
        failed++;
      } finally {
        if (eventId) this.processingEventIds.delete(eventId);
      }
    }
    return { applied, duplicates, failed };
  }
}
