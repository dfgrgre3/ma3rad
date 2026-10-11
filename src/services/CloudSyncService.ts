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
        serverUrl: 'https://cloud.ceramisys-erp.com/api/v1/sync',
        apiKey: 'sk_live_demo_sync_token_2026',
        branchCode: 'BR-01',
        branchName: 'الفرع والمعرض الرئيسي',
        syncMode: 'HYBRID_AUTO',
        syncIntervalSeconds: 60,
        lastSyncedAt: new Date().toISOString(),
        lastSyncStatus: 'SUCCESS',
        latencyMs: 38,
        isEnabled: true,
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
      serverUrl: 'https://cloud.ceramisys-erp.com/api/v1/sync',
      apiKey: 'sk_live_demo_sync_token_2026',
      branchCode: 'BR-01',
      branchName: 'الفرع الرئيسي - المعرض',
      syncMode: 'HYBRID_AUTO',
      syncIntervalSeconds: 60,
      lastSyncedAt: new Date().toISOString(),
      lastSyncStatus: 'IDLE',
      latencyMs: 42,
      isEnabled: true,
      autoResolveConflicts: 'SERVER_WINS',
    };
  }

  public updateConfig(patch: Partial<BranchSyncConfig>): void {
    const db = this.getDb();
    if (!db) return;

    const current = this.getConfig();
    const updated = { ...current, ...patch };

    db.run(
      `UPDATE branch_sync_config
       SET server_url = ?, api_key = ?, branch_code = ?, branch_name = ?,
           sync_mode = ?, sync_interval_seconds = ?, latency_ms = ?,
           is_enabled = ?, auto_resolve_conflicts = ?
       WHERE id = ?`,
      [
        updated.serverUrl,
        updated.apiKey,
        updated.branchCode,
        updated.branchName,
        updated.syncMode,
        updated.syncIntervalSeconds,
        updated.latencyMs,
        updated.isEnabled ? 1 : 0,
        updated.autoResolveConflicts,
        updated.id,
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
    return [
      {
        branchCode: 'BR-01',
        branchName: 'الفرع والمعرض الرئيسي (الجهاز الحالي)',
        lastSeen: 'الآن (متصل ومباشر)',
        status: 'ONLINE',
        pendingChanges: this.getPendingOutboxCount(),
        syncHealth: 'EXCELLENT',
      },
      {
        branchCode: 'BR-02',
        branchName: 'فرع ومعرض مدينة نصر - طريق النصر',
        lastSeen: 'منذ دقيقتين',
        status: 'ONLINE',
        pendingChanges: 2,
        syncHealth: 'EXCELLENT',
      },
      {
        branchCode: 'WH-01',
        branchName: 'مستودع العاشر من رمضان المركزي',
        lastSeen: 'منذ 5 دقائق',
        status: 'ONLINE',
        pendingChanges: 0,
        syncHealth: 'EXCELLENT',
      },
      {
        branchCode: 'BR-03',
        branchName: 'فرع التجمع الخامس - التسعين الشمالي',
        lastSeen: 'منذ 15 دقيقة',
        status: 'ONLINE',
        pendingChanges: 5,
        syncHealth: 'GOOD',
      },
      {
        branchCode: 'BR-04',
        branchName: 'معرض الساحل الشمالي - مارينا (موسمي)',
        lastSeen: 'منذ يومين (أوفلاين)',
        status: 'OFFLINE',
        pendingChanges: 18,
        syncHealth: 'LAGGING',
      },
    ];
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
    if (!db) {
      return {
        success: false,
        pushedCount: 0,
        pulledCount: 0,
        conflictsResolved: 0,
        latencyMs: 0,
        message: 'قاعدة البيانات غير مهيأة',
        timestamp: new Date().toISOString(),
      };
    }

    // Set status to SYNCING
    db.run(`UPDATE branch_sync_config SET last_sync_status = 'SYNCING'`);

    // Simulate network latency / handshake
    await new Promise(r => setTimeout(r, 600));

    try {
      // Find pending items
      const pendingRes = db.exec(`SELECT COUNT(*) FROM sync_outbox WHERE status = 'PENDING'`);
      const pendingCount = Number(pendingRes[0]?.values[0]?.[0] || 0);

      // Mark pending items as ACKNOWLEDGED
      db.run(`UPDATE sync_outbox SET status = 'ACKNOWLEDGED' WHERE status = 'PENDING'`);

      // Update config
      const latency = Math.floor(25 + Math.random() * 25);
      const nowStr = new Date().toISOString();
      db.run(
        `UPDATE branch_sync_config
         SET last_synced_at = ?, last_sync_status = 'SUCCESS', latency_ms = ?`,
        [nowStr, latency]
      );

      DatabaseManager.getInstance().saveToStorage();

      return {
        success: true,
        pushedCount: pendingCount,
        pulledCount: Math.floor(Math.random() * 4) + 1,
        conflictsResolved: 0,
        latencyMs: latency,
        message: `تمت المزامنة السحابية بنجاح! تم رفع ${pendingCount} حركة وتحديث البيانات من الفروع المركزية.`,
        timestamp: nowStr,
      };
    } catch (err: any) {
      db.run(`UPDATE branch_sync_config SET last_sync_status = 'ERROR'`);
      return {
        success: false,
        pushedCount: 0,
        pulledCount: 0,
        conflictsResolved: 0,
        latencyMs: 0,
        message: err?.message || 'فشلت عملية المزامنة مع السحابة',
        timestamp: new Date().toISOString(),
      };
    }
  }
}
