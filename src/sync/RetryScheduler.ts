export class RetryScheduler {
  private readonly baseMs: number;
  private readonly maxMs: number;
  constructor(baseMs = 1000, maxMs = 60000) {
    this.baseMs = baseMs;
    this.maxMs = maxMs;
  }
  nextDelayMs(attempts: number): number {
    const exp = Math.min(this.maxMs, this.baseMs * Math.pow(2, Math.max(0, attempts)));
    const jitter = Math.floor(Math.random() * (exp * 0.25));
    return Math.min(this.maxMs, exp + jitter);
  }
  nextRetryAt(attempts: number): string {
    const delay = this.nextDelayMs(attempts);
    return new Date(Date.now() + delay).toISOString();
  }
  isTransientError(error: any): boolean {
    const msg = String(error?.message || error || '').toLowerCase();
    const code = String(error?.code || '').toLowerCase();
    if (code.includes('econn') || code.includes('etimedout') || code.includes('enotfound')) return true;
    if (msg.includes('timeout') || msg.includes('network') || msg.includes('fetch') || msg.includes('socket')) return true;
    if (error?.status && (error.status === 429 || error.status >= 500)) return true;
    return false;
  }
}
