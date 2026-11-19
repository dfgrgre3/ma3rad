import type { Database } from 'sql.js';
import type { DatabaseManager } from '../databaseManager';
import { applyPerformancePragmas } from './engine';
import type { DatabaseManagerInternals } from './internals';
import { markDirty, notifyDatabaseReplaced } from './mutationSync';
import { exportSnapshot, saveToStorage } from './persistence';
import { clearQueryCache } from './queries';

/**
 * Whole-database binary export/import, backup-table extraction for merge
 * imports, and read-only inspection of backup binaries.
 * Extracted from databaseManager.ts; behaviour is identical.
 */

/**
 * Esporta l'intero database come Uint8Array (binary snapshot di sql.js).
 * Utile per trasferire lo stato del database a un Web Worker e tornare indietro.
 */
export function exportDatabaseBytes(host: DatabaseManager): Uint8Array {
  const db = host.getDatabase();
  return db.export();
}

/**
 * Sostituisce il database in memoria con i bytes forniti (es. ricevuti da un Web Worker).
 * Dopo questa chiamata tutte le query successive lavoreranno sul nuovo stato.
 */
export function importDatabaseBytes(host: DatabaseManager, bytes: Uint8Array): void {
  const h = host as unknown as DatabaseManagerInternals;
  if (!h.SQL) throw new Error('SQL engine not loaded');
  const candidate = new h.SQL.Database(bytes);
  try {
    const integrity = candidate.exec('PRAGMA integrity_check')[0]?.values[0]?.[0];
    if (integrity !== 'ok') {
      throw new Error('Imported database failed integrity check');
    }
    // Schema invariant: the snapshot must contain the core application
    // tables before it is allowed to replace the live database.
    const tables = candidate.exec("SELECT name FROM sqlite_master WHERE type = 'table'");
    const names = new Set((tables[0]?.values || []).map((row: unknown[]) => String(row[0])));
    const requiredTables = ['users', 'products', 'system_settings', 'sales_invoices'];
    const missingTables = requiredTables.filter((name) => !names.has(name));
    if (missingTables.length > 0) {
      throw new Error(`Imported database is missing required tables: ${missingTables.join(', ')}`);
    }
    const foreignKeyResults = candidate.exec('PRAGMA foreign_key_check');
    const violationCount = foreignKeyResults.reduce(
      (total: number, result: { values?: unknown[] }) => total + (result?.values?.length ?? 0),
      0,
    );
    if (violationCount > 0) {
      throw new Error(`Imported database contains ${violationCount} foreign key violation(s)`);
    }
  } catch (error) {
    candidate.close();
    throw error;
  }
  // Connection-scoped pragmas do not survive an export/import round-trip;
  // re-apply them or the replacement connection silently loses FK enforcement.
  applyPerformancePragmas(candidate);
  h.db = candidate;
  h.databaseFacade = null;
  h.databaseFacadeTarget = null;
  clearQueryCache(host);
  markDirty(host);
  notifyDatabaseReplaced(host);
  host.scheduleDebouncedSave();
}

export function exportDatabaseBinary(host: DatabaseManager): Uint8Array {
  return exportSnapshot(host);
}

export function readImportTablesBinary(host: DatabaseManager, bytes: Uint8Array): Array<{
  name: string;
  columns: string[];
  rows: Array<Record<string, unknown>>;
}> {
  const h = host as unknown as DatabaseManagerInternals;
  if (!h.SQL) throw new Error('SQL engine not loaded');
  let candidate: Database | undefined;
  try {
    const importedDatabase = new h.SQL.Database(bytes) as Database;
    candidate = importedDatabase;
    const integrity = importedDatabase.exec('PRAGMA integrity_check')[0]?.values[0]?.[0];
    if (integrity !== 'ok') throw new Error('ملف النسخة الاحتياطية تالف أو غير مكتمل.');

    const requiredTables = ['users', 'products', 'system_settings', 'sales_invoices'];
    const availableTables = new Set(
      (importedDatabase.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")[0]?.values || [])
        .map((row: unknown[]) => String(row[0]))
    );
    if (!requiredTables.every((table) => availableTables.has(table))) {
      throw new Error('الملف لا يحتوي على نسخة احتياطية صالحة للنظام.');
    }

    let totalRows = 0;
    let totalCells = 0;
    const sheets: Array<{
      name: string;
      columns: string[];
      rows: Array<Record<string, unknown>>;
    }> = [...availableTables]
      .filter((name: string) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
      .sort()
      .map((name: string) => {
        const columns = (importedDatabase.exec(`PRAGMA table_info("${name}")`)[0]?.values || [])
          .map((column: unknown[]) => String(column[1]));
        const statement = importedDatabase.prepare(`SELECT * FROM "${name}"`);
        const rows: Array<Record<string, unknown>> = [];
        try {
          while (statement.step()) {
            const row = statement.getAsObject() as Record<string, unknown>;
            rows.push(row);
            totalRows++;
            totalCells += columns.length;
            if (totalRows > 1_000_000 || totalCells > 5_000_000) {
              throw new Error('حجم بيانات النسخة يتجاوز الحد المسموح للدمج.');
            }
          }
        } finally {
          statement.free();
        }
        return { name, columns, rows };
      });
    return sheets;
  } finally {
    candidate?.close();
  }
}

export async function importDatabaseBinary(host: DatabaseManager, bytes: Uint8Array): Promise<void> {
  const h = host as unknown as DatabaseManagerInternals;
  if (!h.SQL) throw new Error('SQL engine not loaded');
  const { runMigrations } = await import('../../migrations');
  clearQueryCache(host);
  let imported: Database | undefined;
  try {
    const candidate = new h.SQL.Database(bytes);
    imported = candidate;
    const requiredTables = ['users', 'products', 'system_settings', 'sales_invoices'];
    const tables = candidate.exec("SELECT name FROM sqlite_master WHERE type = 'table'");
    const names = new Set((tables[0]?.values || []).map((row: unknown[]) => String(row[0])));
    if (!requiredTables.every((name) => names.has(name))) {
      throw new Error('الملف لا يحتوي على نسخة احتياطية صالحة للنظام.');
    }
    const integrity = candidate.exec('PRAGMA integrity_check');
    if (integrity[0]?.values[0]?.[0] !== 'ok') {
      throw new Error('Backup database failed SQLite integrity_check.');
    }
    // Migrate and validate the candidate in isolation so failed restores
    // cannot replace the database currently used by this session.
    const migrationReport = runMigrations(candidate);
    if (migrationReport.failed.length > 0) {
      throw new Error(`Database migration failed (${migrationReport.failed[0].id}): ${migrationReport.failed[0].error}`);
    }
    const migratedIntegrity = candidate.exec('PRAGMA integrity_check');
    if (migratedIntegrity[0]?.values[0]?.[0] !== 'ok') {
      throw new Error('Restored database failed SQLite integrity_check after migrations.');
    }
    const foreignKeyErrors = candidate.exec('PRAGMA foreign_key_check');
    if (foreignKeyErrors[0]?.values.length) {
      throw new Error('Restored database contains foreign key violations.');
    }
  } catch (error) {
    imported?.close();
    throw new Error(`تعذر استعادة النسخة الاحتياطية: ${error instanceof Error ? error.message : 'ملف غير صالح'}`);
  }

  if (typeof imported === 'undefined') throw new Error('Backup database was not initialized.');
  h.db = imported;
  h.databaseFacade = null;
  h.databaseFacadeTarget = null;
  clearQueryCache(host);
  markDirty(host);
  notifyDatabaseReplaced(host);
  saveToStorage(host);
}

/**
 * Inspects and tests restoring a database binary in isolation without affecting the live database.
 * Runs SQLite PRAGMA integrity_check and counts key entities (invoices, products, customers, journal entries).
 */
export function inspectDatabaseBinary(host: DatabaseManager, bytes: Uint8Array): {
  valid: boolean;
  integrity: string;
  productsCount: number;
  invoicesCount: number;
  customersCount: number;
  journalEntriesCount: number;
  error?: string;
} {
  const h = host as unknown as DatabaseManagerInternals;
  if (!h.SQL) throw new Error('SQL engine not loaded');
  try {
    const candidate = new h.SQL.Database(bytes);
    const integrity = String(candidate.exec('PRAGMA integrity_check')[0]?.values[0]?.[0] || 'unknown');
    if (integrity !== 'ok') {
      candidate.close();
      return {
        valid: false,
        integrity,
        productsCount: 0,
        invoicesCount: 0,
        customersCount: 0,
        journalEntriesCount: 0,
        error: 'فشل فحص سلامة الملف SQLite integrity_check',
      };
    }
    const count = (tbl: string) => {
      try {
        return Number(candidate.exec(`SELECT COUNT(*) FROM ${tbl}`)[0]?.values[0]?.[0] || 0);
      } catch {
        return 0;
      }
    };
    const productsCount = count('products');
    const invoicesCount = count('sales_invoices');
    const customersCount = count('customers');
    const journalEntriesCount = count('journal_entries');
    candidate.close();
    return { valid: true, integrity, productsCount, invoicesCount, customersCount, journalEntriesCount };
  } catch (err) {
    return {
      valid: false,
      integrity: 'failed',
      productsCount: 0,
      invoicesCount: 0,
      customersCount: 0,
      journalEntriesCount: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
