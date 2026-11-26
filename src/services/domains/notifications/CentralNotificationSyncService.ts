import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { CentralLicenseService } from '../licensing/CentralLicenseService';
import { NotificationService } from './NotificationService';
import type { NotificationType } from '../../../types/notifications';

/**
 * Pulls tenant-facing notifications published by the central platform
 * (admin broadcasts, billing/licensing events, clone detections, ...) through
 * the device-authenticated channel and mirrors them into the local
 * `notifications` table so they appear in the bell, the notifications page
 * and the instant toast/OS-notification pipeline like any local alert.
 *
 * Delivery is pull-based on a fixed interval — the central server exposes
 * GET /api/v1/device/notifications scoped to the registered device's tenant.
 * Imports are deduplicated by a persisted seen-id set (plus a DB reference
 * check) so re-polls, clock skew and user deletions never resurrect or
 * duplicate a notification.
 */

interface CentralNotificationRow {
  id: string;
  tenantId?: string | null;
  subject?: string;
  payload?: unknown;
  channel?: string;
  status?: string;
  createdAt?: string;
}

type CentralBridgeResponse = { ok: boolean; status: number; body: any };

const POLL_INTERVAL_MS = 60_000;
const MAX_PER_SYNC = 50;
const SEEN_KEY = 'ceramisys_central_notifications_since';
const SEEN_IDS_KEY = 'ceramisys_central_notifications_seen_ids';
const SEEN_IDS_LIMIT = 300;

function readPayloadMessage(payload: unknown): string {
  if (payload && typeof payload === 'object') {
    const message = (payload as Record<string, unknown>).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  if (typeof payload === 'string') {
    try {
      const parsed = JSON.parse(payload);
      if (parsed && typeof parsed.message === 'string') return parsed.message;
    } catch { /* not JSON */ }
    return payload;
  }
  return '';
}

function mapType(subject: string, message: string): NotificationType {
  const text = `${subject} ${message}`;
  if (/clone|استنساخ/i.test(text)) return 'CLONE_DETECTED';
  if (/security|أمني|اختراق/i.test(text)) return 'AUDIT_SECURITY_ALERT';
  return 'SYSTEM';
}

/** Server timestamps are UTC 'YYYY-MM-DD HH:MM:SS' — normalize before parsing. */
function serverTimeToIso(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const trimmed = value.trim();
  const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(trimmed)
    ? `${trimmed.replace(' ', 'T')}Z`
    : trimmed;
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

export class CentralNotificationSyncService {
  private static timer: ReturnType<typeof setInterval> | null = null;
  private static syncing = false;

  private static bridge(): { request: (req: Record<string, unknown>) => Promise<CentralBridgeResponse> } | null {
    const central = typeof globalThis !== 'undefined' ? (globalThis as any)?.window?.ceramisys?.central : null;
    return central && typeof central.request === 'function' ? central : null;
  }

  /** Starts the polling loop. Idempotent — safe to call from startup hooks. */
  static start(intervalMs = POLL_INTERVAL_MS): void {
    if (this.timer !== null) return;
    void this.sync();
    this.timer = setInterval(() => { void this.sync(); }, intervalMs);
  }

  static stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Single poll cycle. Safe to call repeatedly; never throws. */
  static async sync(): Promise<number> {
    if (this.syncing) return 0;
    this.syncing = true;
    try {
      const status = await CentralLicenseService.getStatus();
      if (!status.configured || !status.activated) return 0;
      const bridge = this.bridge();
      if (!bridge) return 0;

      // First run catches up on the last week only — the feed is ASC, so an
      // unbounded request would import the oldest rows in history.
      const since = this.readSince()
        ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const query = `?since=${encodeURIComponent(since)}`;
      const res = await bridge.request({
        path: `/api/v1/device/notifications${query}`,
        method: 'GET',
        headers: { 'X-Device-Id': CentralLicenseService.getDeviceId() },
      });
      if (!res || res.ok === false || res.status >= 400) return 0;

      const rows: CentralNotificationRow[] = Array.isArray(res.body?.data)
        ? res.body.data
        : Array.isArray(res.body?.notifications)
          ? res.body.notifications
          : [];
      if (!rows.length) return 0;

      const seenIds = this.readSeenIds();
      const db = DatabaseManager.getInstance();
      const notifications = new NotificationService();
      let imported = 0;
      let newest = since;

      // Oldest first so toasts appear in chronological order.
      const ordered = rows
        .filter((row) => row && typeof row.id === 'string' && row.id)
        .map((row) => ({ row, iso: serverTimeToIso(row.createdAt) }))
        .sort((a, b) => (a.iso || '').localeCompare(b.iso || ''))
        .slice(0, MAX_PER_SYNC);

      for (const { row, iso } of ordered) {
        if (iso && (!newest || iso > newest)) newest = iso;

        // IN_APP deliveries are the ones meant for the in-app bell; EMAIL/SMS
        // rows are skipped so a tenant never sees a duplicate of a mailed notice.
        if (row.channel && row.channel !== 'IN_APP') continue;
        if (row.status && row.status === 'CANCELLED') continue;
        if (seenIds.has(row.id)) continue;

        const exists = db.query<{ id: string }>(
          `SELECT id FROM notifications WHERE reference_type = 'CENTRAL_NOTIFICATION' AND reference_id = ? LIMIT 1`,
          [row.id]
        )[0];
        if (exists) {
          seenIds.add(row.id);
          continue;
        }

        const title = String(row.subject || 'إشعار من المنصة').slice(0, 300);
        const message = readPayloadMessage(row.payload) || title;
        notifications.createNotification(
          mapType(title, message),
          title,
          message,
          undefined,
          'CENTRAL_NOTIFICATION',
          row.id
        );
        seenIds.add(row.id);
        imported++;
      }

      if (seenIds.size) this.writeSeenIds(seenIds);
      // Keep a small overlap so rows created in the same second are not missed;
      // the seen-id set makes re-delivery harmless.
      if (newest && newest !== since) {
        this.writeSince(new Date(Date.parse(newest) - 1000).toISOString());
      }
      return imported;
    } catch {
      // Central sync must never break the app; the next poll retries.
      return 0;
    } finally {
      this.syncing = false;
    }
  }

  private static readSince(): string | null {
    try {
      const value = localStorage.getItem(SEEN_KEY);
      const iso = serverTimeToIso(value);
      return iso;
    } catch {
      return null;
    }
  }

  private static writeSince(value: string): void {
    try {
      localStorage.setItem(SEEN_KEY, value);
    } catch { /* storage unavailable */ }
  }

  private static readSeenIds(): Set<string> {
    try {
      const raw = localStorage.getItem(SEEN_IDS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : []);
    } catch {
      return new Set();
    }
  }

  private static writeSeenIds(ids: Set<string>): void {
    try {
      const trimmed = [...ids].slice(-SEEN_IDS_LIMIT);
      localStorage.setItem(SEEN_IDS_KEY, JSON.stringify(trimmed));
    } catch { /* storage unavailable */ }
  }
}

export const centralNotificationSyncService = CentralNotificationSyncService;
