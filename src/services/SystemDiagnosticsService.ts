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
  totalProducts: number;
  totalInvoices: number;
  totalTransactions: number;
  databaseSizeBytes: number;
  querySpeedMs: number;
  timestamp: string;
  history: DiagnosticHistoryEntry[];
}

const HISTORY_KEY = 'system_diagnostics_history';

export class SystemDiagnosticsService {
  private db = DatabaseManager.getInstance();

  private requireMaintenance() {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'settings.maintenance', '/system-health');
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
    const history = [...this.history(), entry].slice(-20);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch { /* optional persistence */ }
    return history;
  }

  public runDiagnostics(): SystemDiagnosticsReport {
    this.requireMaintenance();
    const database = this.db.getDb();
    const timestamp = new Date().toISOString();
    if (!database) throw new Error('قاعدة البيانات غير جاهزة للتشخيص.');

    const checks: DiagnosticCheck[] = [];
    const add = (key: string, label: string, status: DiagnosticStatus, detail: string, durationMs: number) =>
      checks.push({ key, label, status, detail, durationMs });

    let integrityResult: string | null = null;
    try {
      const result = this.measure(() => database.exec('PRAGMA integrity_check'));
      integrityResult = result.value[0]?.values[0]?.[0] == null ? null : String(result.value[0].values[0][0]);
      add('sqlite_integrity', 'سلامة SQLite', integrityResult === 'ok' ? 'PASS' : integrityResult ? 'FAIL' : 'NOT_RUN', integrityResult || 'لم تُرجع SQLite نتيجة للفحص.', result.durationMs);
    } catch (error: any) {
      add('sqlite_integrity', 'سلامة SQLite', 'FAIL', error?.message || 'تعذر تنفيذ integrity_check.', 0);
    }

    try {
      const result = this.measure(() => database.exec('PRAGMA foreign_key_check'));
      const violations = result.value[0]?.values ?? [];
      add('foreign_keys', 'سلامة العلاقات المرجعية', violations.length === 0 ? 'PASS' : 'FAIL', violations.length === 0 ? 'لا توجد مخالفات للعلاقات المرجعية.' : `تم العثور على ${violations.length} مخالفة.`, result.durationMs);
    } catch (error: any) {
      add('foreign_keys', 'سلامة العلاقات المرجعية', 'FAIL', error?.message || 'تعذر تنفيذ foreign_key_check.', 0);
    }

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
      const entries = Number(row?.[0] || 0);
      const unbalanced = Number(row?.[1] || 0);
      add('financial_consistency', 'الاتساق المحاسبي', unbalanced === 0 ? 'PASS' : 'FAIL', `${unbalanced} قيد غير متوازن من ${entries} قيد مرحل.`, result.durationMs);
    } catch (error: any) {
      add('financial_consistency', 'الاتساق المحاسبي', 'NOT_RUN', error?.message || 'تعذر تنفيذ فحص الاتساق المحاسبي.', 0);
    }

    const tableResult = this.measure(() => database.exec("SELECT COUNT(*) FROM sqlite_master WHERE type='table'"));
    const totalTables = Number(tableResult.value[0]?.values[0]?.[0] || 0);
    const totalProducts = Number(database.exec('SELECT COUNT(*) FROM products')[0]?.values[0]?.[0] || 0);
    const totalInvoices = Number(database.exec('SELECT COUNT(*) FROM sales_invoices')[0]?.values[0]?.[0] || 0);
    const totalTransactions = Number(database.exec('SELECT COUNT(*) FROM inventory_transactions')[0]?.values[0]?.[0] || 0);

    const performance = this.measure(() => database.exec("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"));
    add('query_performance', 'أداء استعلام قياسي', performance.durationMs < 250 ? 'PASS' : 'WARN', `استغرق الاستعلام القياسي ${performance.durationMs} مللي ثانية.`, performance.durationMs);

    const pageCount = Number(database.exec('PRAGMA page_count')[0]?.values[0]?.[0] || 0);
    const pageSize = Number(database.exec('PRAGMA page_size')[0]?.values[0]?.[0] || 0);
    const databaseSizeBytes = pageCount * pageSize;
    const overall: DiagnosticStatus = checks.some((check) => check.status === 'FAIL') ? 'FAIL'
      : checks.some((check) => check.status === 'WARN' || check.status === 'NOT_RUN') ? 'WARN' : 'PASS';
    const history = this.saveHistory({ timestamp, overall, checks: checks.map(({ key, status }) => ({ key, status })) });

    return { checks, totalTables, totalProducts, totalInvoices, totalTransactions, databaseSizeBytes,
      querySpeedMs: performance.durationMs, timestamp, history };
  }

  public vacuum(): void {
    this.requireMaintenance();
    this.db.getDb()?.run('VACUUM');
    this.db.saveToStorage();
  }

  public reindex(): void {
    this.requireMaintenance();
    this.db.getDb()?.run('REINDEX');
    this.db.saveToStorage();
  }
}
