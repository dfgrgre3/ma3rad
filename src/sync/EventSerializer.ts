import type { SyncEvent } from './types.ts';

export class EventSerializer {
  serialize(event: SyncEvent): string {
    return JSON.stringify(event);
  }
  deserialize(raw: string): SyncEvent {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid event payload');
    return parsed as SyncEvent;
  }
  serializeBatch(events: SyncEvent[]): string {
    return JSON.stringify(events);
  }
  deserializeBatch(raw: string): SyncEvent[] {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('Expected event array');
    return parsed as SyncEvent[];
  }
}
