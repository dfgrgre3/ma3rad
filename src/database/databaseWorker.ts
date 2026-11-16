/**
 * databaseWorker.ts
 * Web Worker مستقل يدير جميع عمليات SQLite (sql.js) في خيط خلفي.
 *
 * الغرض: نقل تنفيذ استعلامات SQLite وتصدير/استيراد قاعدة البيانات من
 * خيط واجهة المستخدم (UI thread) إلى عامل مستقل، ताकي لا يتجمد البرنامج
 * عند الضغط على أي زر (تحديث، حفظ، حذف، إلخ).
 *
 * protocole الرسائل:
 *  - { type: 'init', id }         -> تهيئة قاعدة البيانات في العامل
 *  - { type: 'query', sql, params, id } -> تنفيذ SELECT وإرجاع الصفوف
 *  - { type: 'run', sql, params, id }   -> تنفيذ INSERT/UPDATE/DELETE
 *  - { type: 'exec', sql, id }          -> تنفيذ SQL خام (transactions, pragmas)
 *  - { type: 'export', id }             -> تصدير قاعدة البيانات كـ Uint8Array (Transferable)
 *  - { type: 'import', bytes, id }      -> استيراد قاعدة بيانات من Uint8Array
 *  - { type: 'close', id }              -> إغلاق العامل وحفظ اللقطة
 *
 * الاستجابات:
 *  - { type: 'ok', id, payload }
 *  - { type: 'error', id, error }
 */

import { DatabaseManager } from './repositories/databaseManager';

type DbWorkerRequest =
  | { type: 'init'; id: number }
  | { type: 'query'; sql: string; params: unknown[]; id: number }
  | { type: 'run'; sql: string; params: unknown[]; id: number }
  | { type: 'exec'; sql: string; id: number }
  | { type: 'export'; id: number }
  | { type: 'import'; bytes: Uint8Array; id: number }
  | { type: 'close'; id: number };

type DbWorkerResponse =
  | { type: 'ok'; id: number; payload: unknown }
  | { type: 'error'; id: number; error: string };

let isInitialized = false;

function postResponse(response: DbWorkerResponse, transfers: ArrayBuffer[] = []): void {
  (self as any).postMessage(response, transfers);
}

self.addEventListener('message', async (event: MessageEvent<DbWorkerRequest>) => {
  const { type, id } = event.data;

  try {
    switch (type) {
      case 'init': {
        await DatabaseManager.getInstance().initialize();
        isInitialized = true;
        postResponse({ type: 'ok', id, payload: undefined });
        break;
      }

      case 'query': {
        if (!isInitialized) {
          postResponse({ type: 'error', id, error: 'Database worker not initialized' });
          break;
        }
        const db = DatabaseManager.getInstance();
        if (!db.getDatabase()) {
          postResponse({ type: 'error', id, error: 'Database not initialized' });
          break;
        }
        const result = db.query(event.data.sql, event.data.params);
        postResponse({ type: 'ok', id, payload: result });
        break;
      }

      case 'run': {
        if (!isInitialized) {
          postResponse({ type: 'error', id, error: 'Database worker not initialized' });
          break;
        }
        const db = DatabaseManager.getInstance();
        if (!db.getDatabase()) {
          postResponse({ type: 'error', id, error: 'Database not initialized' });
          break;
        }
        db.run(event.data.sql, event.data.params);
        postResponse({ type: 'ok', id, payload: undefined });
        break;
      }

      case 'exec': {
        if (!isInitialized) {
          postResponse({ type: 'error', id, error: 'Database worker not initialized' });
          break;
        }
        const db = DatabaseManager.getInstance();
        if (!db.getDatabase()) {
          postResponse({ type: 'error', id, error: 'Database not initialized' });
          break;
        }
        db.getDatabase().exec(event.data.sql);
        postResponse({ type: 'ok', id, payload: undefined });
        break;
      }

      case 'export': {
        const db = DatabaseManager.getInstance();
        if (!db.getDatabase()) {
          postResponse({ type: 'error', id, error: 'Database not initialized' });
          break;
        }
        // تصدير قاعدة البيانات كـ Uint8Array ونقلها بدون نسخ (Transferable)
        const bytes = db.exportDatabaseBytes();
        postResponse({ type: 'ok', id, payload: bytes }, [bytes.buffer as ArrayBuffer]);
        break;
      }

      case 'import': {
        const db = DatabaseManager.getInstance();
        db.importDatabaseBytes(event.data.bytes);
        postResponse({ type: 'ok', id, payload: undefined });
        break;
      }

      case 'close': {
        await DatabaseManager.getInstance().flush();
        isInitialized = false;
        postResponse({ type: 'ok', id, payload: undefined });
        break;
      }

      default:
        postResponse({ type: 'error', id, error: `Unknown message type: ${type}` });
    }
  } catch (error) {
    postResponse({
      type: 'error',
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});