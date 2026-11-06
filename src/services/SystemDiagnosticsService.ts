import { DatabaseManager } from '../database/db';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';

export type DiagnosticStatus = 'PASS' | 'WARN' | 'FAIL' | 'NOT_RUN';

export interface DiagnosticCheck {
  key: string;
  label: string;
  status: DiagnosticStatus;
  detail: string;
  durationMs: number;
}

export interface DiagnosticHistoryEntry {
  timestamp: string;
  overall: DiagnosticStatus;
  checks: Array<Pick<DiagnosticCheck, 'key' | 'status'>>;
}

export interface SystemDiagnosticsReport {
  checks: DiagnosticCheck[];
  totalTables: number;
  totalProducts: number | null;
  totalInvoices: number | null;
  totalTransactions: number | null;
  databaseSizeBytes: number | null;
  querySpeedMs: number | null;
  timestamp: string;
  history: DiagnosticHistoryEntry[];
}

export interface SystemRuntimeDiagnostics {
  system: {
    version: string;
    packaged: boolean;
    platform: string;
    arch: string;
    osRelease: string;
    cpuCount: number;
    totalMemoryBytes: number;
    freeMemoryBytes: number;
    processUptimeSeconds: number;
    processMemoryBytes: number;
    processHeapUsedBytes: number;
    disk: { available: true; freeBytes: number; totalBytes: number } | { available: false; error: string };
  } | null;
  databaseFile: {
    available: boolean;
    exists: boolean | null;
    bytes: number | null;
    path: string | null;
    error: string | null;
  };
  databasePersistence: {
    backend: 'file' | 'indexedDB' | 'localStorage' | 'none';
    status: 'saving' | 'saved' | 'error' | 'unencrypted' | 'unavailable';
    error: string | null;
  };
  backups: {
    available: boolean;
    count: number | null;
    bytes: number | null;
    latestAt: string | null;
    latestName: string | null;
    error: string | null;
  };
  checks: DiagnosticCheck[];
  history: DiagnosticHistoryEntry[];
}

const HISTORY_KEY = 'system_diagnostics_history';
const CORE_TABLES = ['products', 'sales_invoices', 'inventory_transactions', 'journal_entries', 'journal_entry_lines'];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function overallStatus(checks: DiagnosticCheck[]): DiagnosticStatus {
  if (checks.some((check) => check.status === 'FAIL')) return 'FAIL';
  if (checks.some((check) => check.status === 'WARN' || check.status === 'NOT_RUN')) return 'WARN';
  return 'PASS';
}

export class SystemDiagnosticsService {
  private db = DatabaseManager.getInstance();

  private requireHealthView() {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'settings.health.view', '/system-health');
    return actor;
  }

  private requireHealthManagement() {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'settings.health.manage', '/system-health');
    return actor;
  }

  private measure<T>(fn: () => T): { value: T; durationMs: number } {
    const started = performance.now();
    const value = fn();
    return { value, durationMs: Math.max(0, Math.round(performance.now() - started)) };
  }

  private history(): DiagnosticHistoryEntry[] {
    try {
      const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      return Array.isArray(value) ? value.slice(-20) : [];
    } catch {
      return [];
    }
  }

  private saveHistory(entry: DiagnosticHistoryEntry): DiagnosticHistoryEntry[] {
    const history = [...this.history().filter((item) => item.timestamp !== entry.timestamp), entry].slice(-20);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
      // The current report remains available even when browser storage is full or disabled.
    }
    return history;
  }

  public runDiagnostics(): SystemDiagnosticsReport {
    this.requireHealthView();
    const database = this.db.getDb();
    const timestamp = new Date().toISOString();
    if (!database) throw new Error('قاعدة البيانات غير جاهزة للتشخيص.');

    const checks: DiagnosticCheck[] = [];
    const add = (key: string, label: string, status: DiagnosticStatus, detail: string, durationMs: number) =>
      checks.push({ key, label, status, detail, durationMs });

    try {
      const result = this.measure(() => database.exec('PRAGMA integrity_check'));
      const messages = result.value[0]?.values.map((row) => String(row[0])) ?? [];
      const isHealthy = messages.length === 1 && messages[0] === 'ok';
      add(
        'sqlite_integrity',
        'سلامة SQLite',
        isHealthy ? 'PASS' : 'FAIL',
        isHealthy ? 'اجتاز ملف قاعدة البيانات فحص SQLite.' : messages.join('؛ ') || 'لم تُرجع SQLite نتيجة للفحص.',
        result.durationMs,
      );
    } catch (error) {
      add('sqlite_integrity', 'سلامة SQLite', 'FAIL', errorMessage(error), 0);
    }

    try {
      const result = this.measure(() => database.exec('PRAGMA foreign_key_check'));
      const violations = result.value.reduce((total, item) => total + item.values.length, 0);
      add(
        'foreign_keys',
        'سلامة العلاقات المرجعية',
        violations === 0 ? 'PASS' : 'FAIL',
        violations === 0 ? 'لا توجد مخالفات للعلاقات المرجعية.' : `تم العثور على ${violations} مخالفة.`,
        result.durationMs,
      );
    } catch (error) {
      add('foreign_keys', 'سلامة العلاقات المرجعية', 'FAIL', errorMessage(error), 0);
    }

    let tableNames: Set<string> = new Set();
    let totalTables = 0;
    try {
      const result = this.measure(() => database.exec(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      ));
      tableNames = new Set((result.value[0]?.values ?? []).map((row) => String(row[0])));
      totalTables = tableNames.size;
      const missingTables = CORE_TABLES.filter((name) => !tableNames.has(name));
      add(
        'core_tables',
        'الجداول الأساسية',
        missingTables.length === 0 ? 'PASS' : 'FAIL',
        missingTables.length === 0 ? `الجداول الأساسية متوفرة (${totalTables} جدولاً).` : `جداول أساسية مفقودة: ${missingTables.join('، ')}.`,
        result.durationMs,
      );
    } catch (error) {
      add('core_tables', 'الجداول الأساسية', 'FAIL', errorMessage(error), 0);
    }

    const countRows = (table: string): number | null => {
      if (!tableNames.has(table)) return null;
      const result = database.exec(`SELECT COUNT(*) FROM "${table}"`);
      return Number(result[0]?.values[0]?.[0] ?? 0);
    };

    let totalProducts: number | null = null;
    let totalInvoices: number | null = null;
    let totalTransactions: number | null = null;
    try {
      totalProducts = countRows('products');
      totalInvoices = countRows('sales_invoices');
      totalTransactions = countRows('inventory_transactions');
    } catch (error) {
      add('record_counts', 'إحصائيات السجلات', 'WARN', errorMessage(error), 0);
    }

    if (tableNames.has('journal_entries') && tableNames.has('journal_entry_lines')) {
      try {
        const result = this.measure(() => database.exec(`
          SELECT COUNT(*) AS entries,
                 COALESCE(SUM(CASE WHEN ABS(ROUND(COALESCE(e.total_debit, 0) - COALESCE(t.debit, 0), 2)) > 0.009
                      OR ABS(ROUND(COALESCE(e.total_credit, 0) - COALESCE(t.credit, 0), 2)) > 0.009
                      OR ABS(ROUND(COALESCE(t.debit, 0) - COALESCE(t.credit, 0), 2)) > 0.009 THEN 1 ELSE 0 END), 0) AS unbalanced
          FROM journal_entries e
          LEFT JOIN (
            SELECT entry_id, SUM(debit) AS debit, SUM(credit) AS credit
            FROM journal_entry_lines GROUP BY entry_id
          ) t ON t.entry_id = e.id
          WHERE e.is_posted = 1
        `));
        const row = result.value[0]?.values[0] as unknown[] | undefined;
        const entries = Number(row?.[0] ?? 0);
        const unbalanced = Number(row?.[1] ?? 0);
        add(
          'financial_consistency',
          'الاتساق المحاسبي',
          unbalanced === 0 ? 'PASS' : 'FAIL',
          `${unbalanced} قيد غير متوازن من ${entries} قيد مرحل.`,
          result.durationMs,
        );
      } catch (error) {
        add('financial_consistency', 'الاتساق المحاسبي', 'FAIL', errorMessage(error), 0);
      }
    } else {
      add('financial_consistency', 'الاتساق المحاسبي', 'NOT_RUN', 'تعذر الفحص لعدم توفر جداول القيود المحاسبية.', 0);
    }

    let querySpeedMs: number | null = null;
    try {
      const performanceResult = this.measure(() => database.exec(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      ));
      querySpeedMs = performanceResult.durationMs;
      add(
        'query_performance',
        'أداء استعلام قياسي',
        querySpeedMs < 250 ? 'PASS' : 'WARN',
        `استغرق الاستعلام القياسي ${querySpeedMs} مللي ثانية.`,
        querySpeedMs,
      );
    } catch (error) {
      add('query_performance', 'أداء استعلام قياسي', 'FAIL', errorMessage(error), 0);
    }

    let databaseSizeBytes: number | null = null;
    try {
      const pageCount = Number(database.exec('PRAGMA page_count')[0]?.values[0]?.[0] ?? 0);
      const pageSize = Number(database.exec('PRAGMA page_size')[0]?.values[0]?.[0] ?? 0);
      databaseSizeBytes = pageCount * pageSize;
    } catch (error) {
      add('database_size', 'حجم قاعدة البيانات', 'WARN', errorMessage(error), 0);
    }

    const history = this.saveHistory({
      timestamp,
      overall: overallStatus(checks),
      checks: checks.map(({ key, status }) => ({ key, status })),
    });

    return {
      checks,
      totalTables,
      totalProducts,
      totalInvoices,
      totalTransactions,
      databaseSizeBytes,
      querySpeedMs,
      timestamp,
      history,
    };
  }

  public async getRuntimeDiagnostics(timestamp = new Date().toISOString()): Promise<SystemRuntimeDiagnostics> {
    this.requireHealthView();
    const ceramisys = typeof window !== 'undefined' ? window.ceramisys : undefined;
    const appInfoApi = ceramisys?.app?.info;
    const dbInfoApi = ceramisys?.db?.info;
    const [appResult, dbResult] = await Promise.all([
      appInfoApi
        ? appInfoApi().then((value) => ({ value })).catch((error: unknown) => ({ error: errorMessage(error) }))
        : Promise.resolve({ error: 'معلومات النظام متاحة فقط في تطبيق سطح المكتب.' }),
      dbInfoApi
        ? dbInfoApi().then((value) => ({ value })).catch((error: unknown) => ({ error: errorMessage(error) }))
        : Promise.resolve({ error: 'معلومات ملف قاعدة البيانات غير متاحة في هذا التشغيل.' }),
    ]);

    const system = 'value' in appResult && appResult.value.system
      ? { version: appResult.value.version, packaged: appResult.value.packaged, ...appResult.value.system }
      : null;
    const databaseInfo = 'value' in dbResult ? dbResult.value : null;
    const backupInfo = databaseInfo?.backups;
    const checks: DiagnosticCheck[] = [];
    const add = (key: string, label: string, status: DiagnosticStatus, detail: string) =>
      checks.push({ key, label, status, detail, durationMs: 0 });

    if (!system) {
      const detail = 'error' in appResult ? appResult.error : 'لم تُرجع واجهة النظام معلومات موارد الجهاز.';
      add('system_resources', 'موارد الجهاز', 'WARN', detail);
    } else {
      add('system_resources', 'موارد الجهاز', 'PASS', `${system.platform} ${system.arch} · ${system.cpuCount} معالجاً منطقياً.`);
      const freeMemory = system.freeMemoryBytes;
      const memoryStatus: DiagnosticStatus = freeMemory < 256 * 1024 * 1024 ? 'FAIL'
        : freeMemory < 1024 * 1024 * 1024 ? 'WARN' : 'PASS';
      add('available_memory', 'الذاكرة المتاحة', memoryStatus, `المتاح ${Math.round(freeMemory / 1024 / 1024)} ميجابايت من ذاكرة الجهاز.`);
      if (!system.disk.available) {
        add('disk_space', 'مساحة القرص', 'WARN', system.disk.error);
      } else {
        const freeDisk = system.disk.freeBytes;
        const diskStatus: DiagnosticStatus = freeDisk < 512 * 1024 * 1024 ? 'FAIL'
          : freeDisk < 5 * 1024 * 1024 * 1024 ? 'WARN' : 'PASS';
        add('disk_space', 'مساحة القرص', diskStatus, `المتاح ${Math.round(freeDisk / 1024 / 1024)} ميجابايت على قرص بيانات التطبيق.`);
      }
    }

    if (!databaseInfo) {
      const detail = 'error' in dbResult ? dbResult.error : 'لم تُرجع واجهة التخزين معلومات الملف.';
      add('database_file', 'ملف قاعدة البيانات', 'WARN', detail);
    } else if (databaseInfo.error) {
      add('database_file', 'ملف قاعدة البيانات', 'FAIL', databaseInfo.error);
    } else if (!databaseInfo.exists || databaseInfo.bytes <= 0) {
      add('database_file', 'ملف قاعدة البيانات', 'FAIL', 'ملف قاعدة البيانات غير موجود أو حجمه فارغ.');
    } else {
      add('database_file', 'ملف قاعدة البيانات', 'PASS', `ملف البيانات المحلي موجود (${databaseInfo.bytes} بايت).`);
    }

    const persistence = this.db.getPersistenceStatus();
    const persistenceBackend = this.db.getStorageBackend();
    const persistenceStatus: DiagnosticStatus = persistence.status === 'saved' ? 'PASS'
      : persistence.status === 'error' || persistence.status === 'unavailable' ? 'FAIL'
        : 'WARN';
    const persistenceDetails: Record<typeof persistence.status, string> = {
      saved: `التخزين مستقر عبر ${persistenceBackend}.`,
      saving: 'هناك تغييرات لم يكتمل حفظها بعد.',
      error: persistence.error || 'فشل حفظ قاعدة البيانات.',
      unencrypted: 'يُستخدم localStorage دون تشفير على مستوى ملف التخزين.',
      unavailable: 'لا توجد واجهة تخزين متاحة.',
    };
    add('database_persistence', 'حفظ قاعدة البيانات', persistenceStatus, persistenceDetails[persistence.status]);

    if (!backupInfo) {
      add('backup_health', 'النسخ الاحتياطية المحلية', 'WARN', 'تعذر قراءة قائمة ملفات النسخ الاحتياطية على هذا الجهاز.');
    } else if (backupInfo.error) {
      add('backup_health', 'النسخ الاحتياطية المحلية', 'WARN', backupInfo.error);
    } else if (backupInfo.count === 0 || !backupInfo.latestAt) {
      add('backup_health', 'النسخ الاحتياطية المحلية', 'WARN', 'لا توجد نسخة احتياطية محلية مشفرة في مجلد النسخ.');
    } else {
      const ageDays = (Date.now() - new Date(backupInfo.latestAt).getTime()) / (24 * 60 * 60 * 1000);
      const status: DiagnosticStatus = ageDays > 30 ? 'WARN' : 'PASS';
      add(
        'backup_health',
        'النسخ الاحتياطية المحلية',
        status,
        `تم العثور على ${backupInfo.count} نسخة محلية؛ أحدثها منذ ${Math.max(0, Math.floor(ageDays))} يوماً.`,
      );
    }

    const priorHistory = this.history().find((entry) => entry.timestamp === timestamp);
    const combinedChecks = [
      ...(priorHistory?.checks ?? []),
      ...checks.map(({ key, status }) => ({ key, status })),
    ].filter((check, index, all) => all.findIndex((item) => item.key === check.key) === index);
    const history = this.saveHistory({
      timestamp,
      overall: overallStatus(combinedChecks.map((check) => ({ ...check, label: '', detail: '', durationMs: 0 }))),
      checks: combinedChecks,
    });

    return {
      system,
      databaseFile: {
        available: Boolean(databaseInfo),
        exists: databaseInfo?.exists ?? null,
        bytes: databaseInfo?.bytes ?? null,
        path: databaseInfo?.path ?? null,
        error: databaseInfo?.error ?? ('error' in dbResult ? dbResult.error : null),
      },
      databasePersistence: {
        backend: persistenceBackend,
        status: persistence.status,
        error: persistence.error ?? null,
      },
      backups: {
        available: Boolean(backupInfo && !backupInfo.error),
        count: backupInfo?.count ?? null,
        bytes: backupInfo?.bytes ?? null,
        latestAt: backupInfo?.latestAt ?? null,
        latestName: backupInfo?.latestName ?? null,
        error: backupInfo?.error ?? null,
      },
      checks,
      history,
    };
  }

  public vacuum(): void {
    this.requireHealthManagement();
    const database = this.db.getDb();
    if (!database) throw new Error('قاعدة البيانات غير جاهزة للصيانة.');
    database.run('VACUUM');
    this.db.saveToStorage();
  }

  public reindex(): void {
    this.requireHealthManagement();
    const database = this.db.getDb();
    if (!database) throw new Error('قاعدة البيانات غير جاهزة للصيانة.');
    database.run('REINDEX');
    this.db.saveToStorage();
  }
}
