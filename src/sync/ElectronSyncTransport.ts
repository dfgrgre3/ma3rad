import type { SyncEvent, SyncPullResult, SyncPushResult, SyncTransport } from './types.ts';

export interface SyncIpcBridge {
  pushEvents(events: SyncEvent[]): Promise<SyncPushResult>;
  pullEvents(scope: string, cursor: string | null, limit: number): Promise<SyncPullResult>;
}

export class ElectronSyncTransport implements SyncTransport {
  constructor(private readonly bridge: SyncIpcBridge) {}

  pushEvents(events: SyncEvent[]): Promise<SyncPushResult> {
    return this.bridge.pushEvents(events);
  }

  pullEvents(scope: string, cursor: string | null, limit: number): Promise<SyncPullResult> {
    return this.bridge.pullEvents(scope, cursor, limit);
  }
}
