/**
 * databaseAsyncService.ts
 * خدمة غير متزامنة للتواصل مع Web Worker (databaseWorker.ts).
 *
 * توفر واجهة Promise-based لجميع عمليات SQLite بحيث يتم تنفيذها في خيط
 * خلفي ولا تحجب واجهة المستخدم (UI thread).
 *
 * 전략 المزامنة:
 *  sql.js يحتفظ بقاعدة البيانات في الذاكرة، لذا فإن الخيط الرئيسي والعامل
 *  لديهما نسخ منفصلة. قبل كل عملية، يتم تصدير قاعدة البيانات من الخيط
 *  الرئيسي ونقلها إلى العامل (بدون نسخ، عبر Transferable). يقوم العامل
 *  باستيرادها، تنفيذ العملية، تصدير النتيجة، وإرسالها للخيط الرئيسي
 *  الذي يعيد استيرادها ليبقى مزامنًا.
 */

import { DatabaseManager } from './repositories/databaseManager';

type DbWorkerRequest =
  | { type: 'init' }
  | { type: 'query'; sql: string; params: unknown[] }
  | { type: 'run'; sql: string; params: unknown[] }
  | { type: 'exec'; sql: string }
  | { type: 'close' }
  | { type: 'export' }
  | { type: 'import'; bytes: Uint8Array };

type DbWorkerResponse =
  | { type: 'ok'; payload: unknown }
  | { type: 'error'; error: string };

type MessageWithId = DbWorkerResponse & { id: number };

let worker: Worker | null = null;
let initPromise: Promise<void> | null = null;
let pending = new Map<number, { resolve: (value: unknown) => void; reject: (err: Error) => void }>();
let seq = 0;

function ensureWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL('./databaseWorker.ts', import.meta.url), { type: 'module' });
  worker = w;

  w.addEventListener('message', (event: MessageEvent<MessageWithId>) => {
    const { id, type } = event.data;
    const cb = pending.get(id);
    if (!cb) return;
    pending.delete(id);
    if (type === 'ok') {
      cb.resolve((event.data as Extract<MessageWithId, { type: 'ok' }>).payload);
    } else {
      cb.reject(new Error((event.data as Extract<MessageWithId, { type: 'error' }>).error || 'Database worker error'));
    }
  });

  w.addEventListener('error', (event: ErrorEvent) => {
    pending.forEach((cb) => cb.reject(new Error(event.message || 'Worker crashed')));
    pending.clear();
  });

  return w;
}

async function post<T>(request: DbWorkerRequest, transfers: ArrayBuffer[] = []): Promise<T> {
  const w = ensureWorker();
  const id = ++seq;
  const promise = new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve, reject });
  });
  (w.postMessage as any)({ ...request, id }, transfers);
  return promise;
}

/**
 * تهيئة العامل وقاعدة البيانات في الخيط الخلفي.
 * يُستدعى مرة واحدة عند تشغيل التطبيق بعد أن يصبح DatabaseManager جاهزًا في الخيط الرئيسي.
 */
export async function initDatabaseAsync(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = post<void>({ type: 'init' }).then(() => undefined);
  return initPromise;
}

/**
 * تنفيذ استعلام SELECT غير متزامن في العامل.
 * يعيد مصفوفة من الكائنات بمفاتيح camelCase (نفس سلوك DatabaseManager.query).
 */
export async function queryAsync<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
  return post<T[]>({ type: 'query', sql, params });
}

/**
 * تنفيذ INSERT/UPDATE/DELETE غير متزامن في العامل.
 */
export async function runAsync(sql: string, params: unknown[] = []): Promise<void> {
  return post<void>({ type: 'run', sql, params });
}

/**
 * تنفيذ SQL خام (transactions, PRAGMA, إلخ) غير متزامن في العامل.
 */
export async function execAsync(sql: string): Promise<void> {
  return post<void>({ type: 'exec', sql });
}

/**
 * تصدير قاعدة البيانات من العامل كـ Uint8Array (تُنقل بدون نسخ).
 */
export async function exportDatabaseFromWorkerAsync(): Promise<Uint8Array> {
  return post<Uint8Array>({ type: 'export' });
}

/**
 * استيراد قاعدة بيانات ثنائية إلى العامل (تستبدل نسخته في الذاكرة).
 */
export async function importDatabaseToWorkerAsync(bytes: Uint8Array): Promise<void> {
  await post<void>({ type: 'import', bytes }, [bytes.buffer as ArrayBuffer]);
}

/**
 * إغلاق العامل وحفظ لقطة قاعدة البيانات.
 */
export async function closeDatabaseAsync(): Promise<void> {
  await post<void>({ type: 'close' });
  worker?.terminate();
  worker = null;
  initPromise = null;
  pending = new Map();
}

/**
 * إعادة true إذا كان العامل قد تم تهيئته.
 */
export function isDatabaseReady(): boolean {
  return !!worker && initPromise !== null;
}

/**
 * مزامنة قاعدة البيانات من الخيط الرئيسي إلى العامل قبل عملية ما.
 * يُستدعى قبل queryAsync / runAsync / execAsync لضمان أن العامل لديه أحدث حالة.
 */
export async function syncMainToWorkerAsync(): Promise<void> {
  const db = DatabaseManager.getInstance();
  const bytes = db.exportDatabaseBytes();
  await importDatabaseToWorkerAsync(bytes);
}

/**
 * مزامنة قاعدة البيانات من العامل إلى الخيط الرئيسي بعد عملية ما.
 * يُستدعى بعد queryAsync / runAsync / execAsync للحفاظ على تزامن الخيط الرئيسي.
 */
export async function syncWorkerToMainAsync(): Promise<void> {
  const bytes = await exportDatabaseFromWorkerAsync();
  DatabaseManager.getInstance().importDatabaseBytes(bytes);
}