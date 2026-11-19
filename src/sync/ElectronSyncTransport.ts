import type { SyncEvent, SyncPullResult, SyncPushResult, SyncTransport } from '../types/sync/index.ts';

export interface SyncIpcBridge {
  pushEvents(events: SyncEvent[]): Promise<SyncPushResult>;
  pullEvents(scope: string, cursor: string | null, limit: number): Promise<SyncPullResult>;
}

export class ElectronSyncTransport implements SyncTransport {
  private readonly bridge: SyncIpcBridge;
  constructor(bridge: SyncIpcBridge) { this.bridge = bridge; }

  pushEvents(events: SyncEvent[]): Promise<SyncPushResult> {
    return this.bridge.pushEvents(events);
  }

  pullEvents(scope: string, cursor: string | null, limit: number): Promise<SyncPullResult> {
    return this.bridge.pullEvents(scope, cursor, limit);
  }
}
