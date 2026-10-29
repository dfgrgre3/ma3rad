import { OutboxRepository } from './OutboxRepository.ts';
import { RetryScheduler } from './RetryScheduler.ts';
import { SyncPolicyService } from './SyncPolicyService.ts';
import type { SyncTransport, SyncPushResult } from './types.ts';

export class PushChangesService {
  private outbox: OutboxRepository;
  private transport?: SyncTransport;
  private retry: RetryScheduler;
  private maxAttempts: number;

  constructor(
    outbox?: OutboxRepository,
    transport?: SyncTransport,
    retry?: RetryScheduler,
    maxAttempts = 8
  ) {
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
      throw new RangeError('Maximum sync attempts must be a positive integer');
    }
    this.outbox = outbox || new OutboxRepository();
    this.transport = transport;
    this.retry = retry || new RetryScheduler();
    this.maxAttempts = maxAttempts;
  }

  setTransport(transport: SyncTransport): void {
    this.transport = transport;
  }

  async pushOnce(batchSize = 50): Promise<{ sent: number; failed: number }> {
    if (!this.transport) throw new Error('No sync transport configured');
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) {
      throw new RangeError('Sync batch size must be an integer between 1 and 500');
    }

    const events = this.outbox.listPending(batchSize, SyncPolicyService.pushGate());
    if (events.length === 0) return { sent: 0, failed: 0 };
    for (const e of events) this.outbox.markInFlight(e.eventId);

    let result: SyncPushResult;
    try {
      result = await this.transport.pushEvents(events);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      for (const event of events) this.failEvent(event, message);
      throw error;
    }

    const eventIds = new Set(events.map((event) => event.eventId));
    const acknowledged = new Set<string>();
    const failed = new Map<string, string>();
    const responseIsValid =
      result &&
      Array.isArray(result.acknowledged) &&
      Array.isArray(result.failed);

    if (!responseIsValid) {
      for (const event of events) {
        this.failEvent(event, 'Invalid sync acknowledgement response', true);
      }
      throw new Error('Invalid sync acknowledgement response');
    }

    for (const eventId of result.acknowledged) {
      if (!eventIds.has(eventId) || acknowledged.has(eventId) || failed.has(eventId)) {
        for (const event of events) {
          this.failEvent(event, 'Invalid sync acknowledgement response', true);
        }
        throw new Error('Sync response contained an unknown or duplicate event acknowledgement');
      }
      acknowledged.add(eventId);
    }
    for (const failure of result.failed) {
      if (
        !failure ||
        typeof failure.eventId !== 'string' ||
        typeof failure.error !== 'string' ||
        !eventIds.has(failure.eventId) ||
        acknowledged.has(failure.eventId) ||
        failed.has(failure.eventId)
      ) {
        for (const event of events) {
          this.failEvent(event, 'Invalid sync acknowledgement response', true);
        }
        throw new Error('Sync response contained an unknown or duplicate event result');
      }
      failed.set(failure.eventId, failure.error);
    }

    for (const event of events) {
      if (acknowledged.has(event.eventId)) {
        this.outbox.markAcknowledged(event.eventId);
        continue;
      }
      const message = failed.get(event.eventId) ?? 'Remote service did not acknowledge this event';
      this.failEvent(event, message, failed.has(event.eventId) ? undefined : true);
    }

    return { sent: acknowledged.size, failed: events.length - acknowledged.size };
  }

  private failEvent(event: { eventId: string; attempts?: number }, message: string, retryable?: boolean): void {
    const error = new Error(message);
    const canRetry = retryable ?? this.retry.isTransientError(error);
    const nextAttempts = (event.attempts ?? 0) + 1;
    if (!canRetry || nextAttempts >= this.maxAttempts) {
      this.outbox.markDeadLetter(event.eventId, message);
      return;
    }
    this.outbox.markFailed(event.eventId, message, this.retry.nextRetryAt(nextAttempts));
  }
}
