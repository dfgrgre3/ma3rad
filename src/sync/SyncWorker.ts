export interface SyncEngineLike { runCycle(): Promise<void>; }

export class SyncWorker {
  private timer: any = null;
  private activeCycle: Promise<void> | null = null;
  private readonly engine: SyncEngineLike;
  private readonly intervalMs: number;
  constructor(engine: SyncEngineLike, intervalMs = 30000) {
    if (!Number.isInteger(intervalMs) || intervalMs < 1000) {
      throw new RangeError('Sync worker interval must be an integer of at least 1000ms');
    }
    this.engine = engine;
    this.intervalMs = intervalMs;
  }
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick().catch((error) => {
        console.error('Background synchronization worker failed:', error);
      });
    }, this.intervalMs);
  }
  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }
  async stopAndWait(): Promise<void> {
    this.stop();
    await this.activeCycle;
  }
  tick(): Promise<void> {
    if (this.activeCycle) return this.activeCycle;
    this.activeCycle = this.engine.runCycle().finally(() => {
      this.activeCycle = null;
    });
    return this.activeCycle;
  }
  isRunning(): boolean { return this.activeCycle !== null; }
}
