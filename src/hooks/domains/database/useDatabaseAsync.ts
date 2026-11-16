import { useCallback, useRef, useState } from 'react';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { initDatabaseAsync, isDatabaseReady } from '../../../database/databaseAsyncService';

export type UseDatabaseAsyncResult<T> = {
  data: T | null;
  loading: boolean;
  error: Error | null;
  isReady: boolean;
  runQuery: (sql: string, params?: unknown[]) => Promise<T[]>;
  runCommand: (sql: string, params?: unknown[]) => Promise<void>;
  runExec: (sql: string) => Promise<void>;
  exportDb: () => Promise<Uint8Array>;
  importDb: (bytes: Uint8Array) => Promise<void>;
  reset: () => void;
};

/**
 * هووك React لتنفيذ عمليات قاعدة البيانات بشكل غير متزامن عبر Web Worker.
 * يمنع تجميد واجهة المستخدم عند الضغط على أي زر (تحديث، حفظ، حذف، إلخ).
 *
 * الاستخدام:
 *   const { runQuery, runCommand, loading, error } = useDatabaseAsync();
 *   await runQuery('SELECT * FROM products WHERE is_active = 1');
 *   await runCommand('UPDATE customers SET name = ? WHERE id = ?', ['أحمد', 'cust_123']);
 */
export function useDatabaseAsync<T = unknown>(): UseDatabaseAsyncResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const db = DatabaseManager.getInstance();

  const runQuery = useCallback(async (sql: string, params: unknown[] = []): Promise<T[]> => {
    setLoading(true);
    setError(null);
    try {
      const result = await db.queryAsync<T>(sql, params);
      setData(result as unknown as T);
      return result;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [db]);

  const runCommand = useCallback(async (sql: string, params: unknown[] = []): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await db.runAsync(sql, params);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [db]);

  const runExec = useCallback(async (sql: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await db.execAsync(sql);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [db]);

  const exportDb = useCallback(async (): Promise<Uint8Array> => {
    setLoading(true);
    setError(null);
    try {
      return await db.exportDatabaseAsync();
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [db]);

  const importDb = useCallback(async (bytes: Uint8Array): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await db.importDatabaseAsync(bytes);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [db]);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setLoading(false);
  }, []);

  return {
    data,
    loading,
    error,
    isReady: isDatabaseReady(),
    runQuery,
    runCommand,
    runExec,
    exportDb,
    importDb,
    reset,
  };
}

/**
 * تهيئة Web Worker لقاعدة البيانات (يُستدعى مرة واحدة عند بدء التطبيق).
 */
export async function initializeDatabaseAsync(): Promise<void> {
  if (isDatabaseReady()) return;
  await initDatabaseAsync();
}