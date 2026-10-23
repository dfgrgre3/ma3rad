import { DatabaseManager } from '../database/db';
import { v4 as uuidv4 } from 'uuid';

export interface BranchSyncConfig {
  id: string;
  serverUrl: string;
  apiKey: string;
  branchCode: string;
  branchName: string;
  syncMode: 'OFFLINE' | 'HYBRID_AUTO' | 'CLOUD_CENTRAL';
  syncIntervalSeconds: number;
  lastSyncedAt: string | null;
  lastSyncStatus: 'IDLE' | 'SYNCING' | 'SUCCESS' | 'ERROR';
  latencyMs: number;
  isEnabled: boolean;
  autoResolveConflicts: 'SERVER_WINS' | 'LOCAL_WINS' | 'MANUAL';
}

export interface SyncOutboxItem {
  id: string;
  entityTable: string;
  entityId: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  payloadJson: string;
  createdAt: string;
  status: 'PENDING' | 'IN_TRANSIT' | 'ACKNOWLEDGED' | 'FAILED';
  retryCount: number;
  errorMessage?: string;
}

export interface SyncConflictLog {
  id: string;
  entityTable: string;
  entityId: string;
  originBranch: string;
  conflictType: string;
  localData: string;
  remoteData: string;
  resolvedAction: string;
  resolvedAt: string;
}

export interface ConnectedBranchStatus {
  branchCode: string;
  branchName: string;
  lastSeen: string;
  status: 'ONLINE' | 'OFFLINE' | 'SYNCING';
  pendingChanges: number;
  syncHealth: 'EXCELLENT' | 'GOOD' | 'LAGGING';
}

export interface SyncResult {
  success: boolean;
  pushedCount: number;
  pulledCount: number;
  conflictsResolved: number;
  latencyMs: number;
  message: string;
  timestamp: string;
}

export class CloudSyncService {
  private getDb() {
    return DatabaseManager.getInstance().getDb();
  }

  public getConfig(): BranchSyncConfig {
    const db = this.getDb();
    if (!db) {
      return {
        id: 'sync_cfg_main',
        serverUrl: '',
        apiKey: '',
        branchCode: 'BR-01',
        branchName: 'الفرع والمعرض الرئيسي',
        syncMode: 'HYBRID_AUTO',
        syncIntervalSeconds: 60,
        lastSyncedAt: null,
        lastSyncStatus: 'IDLE',
        latencyMs: 0,
        isEnabled: false,
        autoResolveConflicts: 'SERVER_WINS',
      };
    }

    try {
      const res = db.exec(`SELECT * FROM branch_sync_config LIMIT 1`);
      if (res.length > 0 && res[0].values.length > 0) {
        const row = res[0].values[0];
        const cols = res[0].columns;
        const map: Record<string, any> = {};
        cols.forEach((c: string, idx: number) => { map[c] = row[idx]; });

        return {
          id: String(map.id),
          serverUrl: String(map.server_url || ''),
          apiKey: String(map.api_key || ''),
          branchCode: String(map.branch_code || 'BR-01'),
          branchName: String(map.branch_name || 'الفرع الرئيسي'),
          syncMode: map.sync_mode || 'HYBRID_AUTO',
          syncIntervalSeconds: Number(map.sync_interval_seconds || 60),
          lastSyncedAt: map.last_synced_at ? String(map.last_synced_at) : null,
          lastSyncStatus: map.last_sync_status || 'IDLE',
          latencyMs: Number(map.latency_ms || 40),
          isEnabled: Boolean(map.is_enabled),
          autoResolveConflicts: map.auto_resolve_conflicts || 'SERVER_WINS',
        };
      }
    } catch (e) {
      console.warn('Failed to load branch_sync_config, using default', e);
    }

    return {
      id: 'sync_cfg_main',
      serverUrl: '',
      apiKey: '',
      branchCode: 'BR-01',
      branchName: 'الفرع الرئيسي - المعرض',
      syncMode: 'HYBRID_AUTO',
      syncIntervalSeconds: 60,
      lastSyncedAt: null,
      lastSyncStatus: 'IDLE',
      latencyMs: 0,
      isEnabled: false,
      autoResolveConflicts: 'SERVER_WINS',
    };
  }

  public updateConfig(patch: Partial<BranchSyncConfig>): void {
    const db = this.getDb();
    if (!db) return;

    const current = this.getConfig();
    const updated = { ...current, ...patch };
    updated.isEnabled = patch.isEnabled ?? Boolean(updated.serverUrl.trim() && updated.apiKey.trim());

    db.run(
      `INSERT INTO branch_sync_config (
         id, server_url, api_key, branch_code, branch_name, sync_mode,
         sync_interval_seconds, latency_ms, is_enabled, auto_resolve_conflicts,
         last_synced_at, last_sync_status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         server_url = excluded.server_url, api_key = excluded.api_key,
         branch_code = excluded.branch_code, branch_name = excluded.branch_name,
         sync_mode = excluded.sync_mode, sync_interval_seconds = excluded.sync_interval_seconds,
         latency_ms = excluded.latency_ms, is_enabled = excluded.is_enabled,
         auto_resolve_conflicts = excluded.auto_resolve_conflicts,
         last_synced_at = excluded.last_synced_at, last_sync_status = excluded.last_sync_status`,
      [
        updated.id,
        updated.serverUrl,
        updated.apiKey,
        updated.branchCode,
        updated.branchName,
        updated.syncMode,
        updated.syncIntervalSeconds,
        updated.latencyMs,
        updated.isEnabled ? 1 : 0,
        updated.autoResolveConflicts,
        updated.lastSyncedAt,
        updated.lastSyncStatus,
      ]
    );
    DatabaseManager.getInstance().saveToStorage();
  }

  public getPendingOutboxCount(): number {
    const db = this.getDb();
    if (!db) return 0;
    try {
      const res = db.exec(`SELECT COUNT(*) FROM sync_outbox WHERE status = 'PENDING'`);
      return Number(res[0]?.values[0]?.[0] || 0);
    } catch {
      return 0;
    }
  }

  public getOutboxItems(limit = 20): SyncOutboxItem[] {
    const db = this.getDb();
    if (!db) return [];
    try {
      const res = db.exec(`SELECT * FROM sync_outbox ORDER BY created_at DESC LIMIT ${limit}`);
      if (!res.length) return [];
      const cols = res[0].columns;
      return res[0].values.map((row: any[]) => {
        const item: any = {};
        cols.forEach((c: string, idx: number) => { item[c] = row[idx]; });
        return {
          id: item.id,
          entityTable: item.entity_table,
          entityId: item.entity_id,
          action: item.action,
          payloadJson: item.payload_json,
          createdAt: item.created_at,
          status: item.status,
          retryCount: Number(item.retry_count || 0),
          errorMessage: item.error_message,
        };
      });
    } catch {
      return [];
    }
  }

  public queueChange(entityTable: string, entityId: string, action: 'INSERT' | 'UPDATE' | 'DELETE', payload: any): void {
    const db = this.getDb();
    if (!db) return;
    try {
      db.run(
        `INSERT INTO sync_outbox (id, entity_table, entity_id, action, payload_json, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'PENDING', datetime('now'))`,
        [uuidv4(), entityTable, entityId, action, JSON.stringify(payload)]
      );
      DatabaseManager.getInstance().saveToStorage();
    } catch (e) {
      console.error('Failed to queue sync outbox item', e);
    }
  }

  public getConnectedBranches(): ConnectedBranchStatus[] {
    try {
      const config = this.getConfig();
      const pending = this.getPendingOutboxCount();
      const rows = DatabaseManager.getInstance().query<{ code: string; name: string; is_main: number }>(
        `SELECT code, name, is_main FROM branches WHERE is_active = 1 ORDER BY is_main DESC, name`
      );
      return rows.map((row) => {
        const isLocal = row.code === config.branchCode || (!config.branchCode && row.is_main === 1);
        return {
          branchCode: row.code,
          branchName: isLocal ? `${row.name} (الجهاز الحالي)` : row.name,
          lastSeen: isLocal
            ? 'الآن'
            : config.lastSyncedAt
              ? `آخر مزامنة ${new Date(config.lastSyncedAt).toLocaleString('ar-EG')}`
              : 'غير معروف',
          status: isLocal ? 'ONLINE' : 'OFFLINE',
          pendingChanges: isLocal ? pending : 0,
          syncHealth: isLocal ? (pending > 50 ? 'LAGGING' : 'EXCELLENT') : 'GOOD',
        };
      });
    } catch {
      return [];
    }
  }

  public getSyncConflictLogs(): SyncConflictLog[] {
    const db = this.getDb();
    if (!db) return [];
    try {
      const res = db.exec(`SELECT * FROM sync_conflict_logs ORDER BY resolved_at DESC LIMIT 10`);
      if (!res.length) return [];
      const cols = res[0].columns;
      return res[0].values.map((row: any[]) => {
        const item: any = {};
        cols.forEach((c: string, idx: number) => { item[c] = row[idx]; });
        return {
          id: item.id,
          entityTable: item.entity_table,
          entityId: item.entity_id,
          originBranch: item.origin_branch,
          conflictType: item.conflict_type,
          localData: item.local_data,
          remoteData: item.remote_data,
          resolvedAction: item.resolved_action,
          resolvedAt: item.resolved_at,
        };
      });
    } catch {
      return [];
    }
  }

  public async triggerSync(): Promise<SyncResult> {
    const db = this.getDb();
    const manager = DatabaseManager.getInstance();
    const failed = (message: string): SyncResult => ({
      success: false,
      pushedCount: 0,
      pulledCount: 0,
      conflictsResolved: 0,
      latencyMs: 0,
      message,
      timestamp: new Date().toISOString(),
    });

    if (!db) return failed('قاعدة البيانات غير مهيأة');

    const config = this.getConfig();
    if (!config.isEnabled || config.syncMode === 'OFFLINE') {
      return failed('المزامنة معطلة. فعّل المزامنة وأدخل عنوان الخادم ومفتاح API أولًا.');
    }
    if (!config.serverUrl || !config.apiKey) {
      return failed('لم يتم ضبط عنوان خادم المزامنة أو مفتاح API.');
    }
    try {
      const url = new URL(config.serverUrl);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('invalid');
    } catch {
      return failed('عنوان خادم المزامنة غير صالح.');
    }

    db.run(`UPDATE branch_sync_config SET last_sync_status = 'SYNCING'`);
    const startedAt = Date.now();

    try {
      const pending = manager.query<any>(
        `SELECT id, entity_table, entity_id, action, payload_json, created_at
         FROM sync_outbox WHERE status = 'PENDING' ORDER BY created_at LIMIT 200`
      );
      if (pending.length === 0) {
        const now = new Date().toISOString();
        db.run(
          `UPDATE branch_sync_config SET last_synced_at = ?, last_sync_status = 'SUCCESS', latency_ms = ?`,
          [now, Date.now() - startedAt]
        );
        manager.saveToStorage();
        return {
          success: true, pushedCount: 0, pulledCount: 0, conflictsResolved: 0,
          latencyMs: Date.now() - startedAt, message: 'لا توجد تغييرات معلّقة للمزامنة.', timestamp: now,
        };
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      let response: Response;
      try {
        response = await fetch(config.serverUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': config.apiKey,
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            branchCode: config.branchCode,
            branchName: config.branchName,
            sentAt: new Date().toISOString(),
            items: pending.map((item) => ({
              id: item.id,
              table: item.entity_table,
              entityId: item.entity_id,
              action: item.action,
              payload: item.payload_json,
              createdAt: item.created_at,
            })),
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.success === false) {
        throw new Error(data?.message || `رفض الخادم الطلب (HTTP ${response.status}).`);
      }

      const acknowledged: string[] = Array.isArray(data?.acknowledged)
        ? data.acknowledged.map(String)
        : pending.map((item) => String(item.id));

      for (const id of acknowledged) {
        db.run(
          `UPDATE sync_outbox SET status = 'ACKNOWLEDGED', error_message = NULL WHERE id = ?`,
          [id]
        );
      }

      const latency = Date.now() - startedAt;
      const now = new Date().toISOString();
      db.run(
        `UPDATE branch_sync_config SET last_synced_at = ?, last_sync_status = 'SUCCESS', latency_ms = ?`,
        [now, latency]
      );
      manager.saveToStorage();

      const pulled = Number(data?.pulledCount) || 0;
      const conflicts = Number(data?.conflictsResolved) || 0;
      return {
        success: true,
        pushedCount: acknowledged.length,
        pulledCount: pulled,
        conflictsResolved: conflicts,
        latencyMs: latency,
        message: `تمت المزامنة: رُفعت ${acknowledged.length} حركة${pulled ? ` واستُلمت ${pulled} تحديثًا` : ''}${conflicts ? ` وحُلّت ${conflicts} تعارضات` : ''}.`,
        timestamp: now,
      };
    } catch (err: any) {
      const message = err?.name === 'AbortError'
        ? 'انتهت مهلة الاتصال بخادم المزامنة (15 ثانية).'
        : err?.message || 'تعذر الاتصال بخادم المزامنة.';
      db.run(`UPDATE branch_sync_config SET last_sync_status = 'ERROR'`);
      db.run(
        `UPDATE sync_outbox SET retry_count = retry_count + 1, error_message = ? WHERE status = 'PENDING'`,
        [message]
      );
      manager.saveToStorage();
      return failed(message);
    }
  }
}
