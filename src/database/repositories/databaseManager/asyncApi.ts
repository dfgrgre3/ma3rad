import type { DatabaseManager } from '../databaseManager';

/**
 * Async API — delegates to the database Web Worker via databaseAsyncService.
 * Extracted from databaseManager.ts; behaviour is identical.
 * (`_host` keeps the uniform host-first signature; the worker service is a
 * process-wide singleton and does not need the instance.)
 */

export async function importAsyncService(): Promise<typeof import('../../databaseAsyncService')> {
  return import('../../databaseAsyncService');
}

/**
 * تنفيذ استعلام SELECT بشكل غير متزامن في Web Worker (لا يحجب واجهة المستخدم).
 * يعيد نفس تنسيق النتيجة الخاص بـ `query` (مصفوفة من الكائنات بمفاتيح camelCase).
 */
export async function queryAsync<T = unknown>(_host: DatabaseManager, sql: string, params: unknown[] = []): Promise<T[]> {
  const service = await importAsyncService();
  return service.queryAsync<T>(sql, params);
}

/**
 * تنفيذ INSERT/UPDATE/DELETE بشكل غير متزامن في Web Worker.
 */
export async function runAsync(_host: DatabaseManager, sql: string, params: unknown[] = []): Promise<void> {
  const service = await importAsyncService();
  return service.runAsync(sql, params);
}

/**
 * تنفيذ SQL خام (transactions, PRAGMA) بشكل غير متزامن في Web Worker.
 */
export async function execAsync(_host: DatabaseManager, sql: string): Promise<void> {
  const service = await importAsyncService();
  return service.execAsync(sql);
}

/**
 * تصدير قاعدة البيانات بشكل غير متزامن من Web Worker.
 * يعيد Uint8Array يمكن حفظه في indexedDB أو ملف.
 */
export async function exportDatabaseAsync(_host: DatabaseManager): Promise<Uint8Array> {
  const service = await importAsyncService();
  return service.exportDatabaseAsync();
}

/**
 * استيراد قاعدة بيانات ثنائية بشكل غير متزامن إلى Web Worker والخيط الرئيسي.
 */
export async function importDatabaseAsync(_host: DatabaseManager, bytes: Uint8Array): Promise<void> {
  const service = await importAsyncService();
  return service.importDatabaseAsync(bytes);
}
