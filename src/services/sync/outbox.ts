// Phase 2 outbox: queues mutations when central is unreachable.
// Drained by a sync worker (Phase 5) on reconnect.

export type OutboxEntry = {
  id: string;
  method: string;
  path: string;
  body: unknown;
  createdAt: string;
  attempts: number;
  idempotencyKey: string;
};

const STORAGE_KEY = 'ceramisys.admin.outbox.v1';

export function loadOutbox(): OutboxEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as OutboxEntry[]) : [];
  } catch {
    return [];
  }
}

export function saveOutbox(entries: OutboxEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // ignore quota errors
  }
}

export function enqueue(entry: Omit<OutboxEntry, 'id' | 'createdAt' | 'attempts'>): OutboxEntry {
  const full: OutboxEntry = {
    ...entry,
    id: `obx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    attempts: 0,
  };
  const entries = loadOutbox();
  entries.push(full);
  saveOutbox(entries);
  return full;
}

export function clearOutbox(): void {
  localStorage.removeItem(STORAGE_KEY);
}