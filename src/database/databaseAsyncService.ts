/**
 * databaseAsyncService.ts
 * خدمة غير متزامنة للتواصل مع Web Worker (databaseWorker.ts).
 *
 * توفر واجهة Promise-based لجميع عمليات SQLite بحيث يتم تنفيذها في خيط
 * خلفي ولا تحجب واجهة المستخدم (UI thread).
 *
 * استراتيجية المزامنة:
 *  sql.js يحتفظ بقاعدة البيانات في الذاكرة، لذا فإن الخيط الرئيسي والعامل
 *  لديهما نسخ منفصلة. بدل تصدير/استيراد قاعدة البيانات كاملة قبل كل عملية
 *  (وهو ما كان يحجب الواجهة لآلاف الأجزاء من الثانية)، نتتبع عدّاد الطفرات
 *  (mutationSeq) في الخيط الرئيسي:
 *   - استعلامات SELECT: لا يُدفع شيء إلى العامل إلا إذا تغيّرت القاعدة منذ
 *     آخر مزامنة، ولا يُسحب شيء منها (القراءة لا تغيّر الحالة).
 *   - عمليات الكتابة (run/exec): تُزامَن القاعدة مع العامل عند الحاجة، ثم
 *     تُسحب اللقطة المحدّثة من العامل إلى الخيط الرئيسي مرة واحدة فقط.
 *  كل العمليات تُسلسل عبر queue واحد حتى لا تتداخل المزامنات.
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
let pending = new Map<number, { resolve: (value: any) => void; reject: (err: Error) => void }>();
let seq = 0;

// Serialize every worker operation so sync pushes/pulls never interleave.
let opQueue: Promise<void> = Promise.resolve();
// mutationSeq of the main database the last time it was pushed to the worker.
// -1 means "never synced" — the first operation always pushes a snapshot.
let lastMainSeqPushed = -1;

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const result = opQueue.then(operation, operation);
  opQueue = result.then(() => undefined, () => undefined);
  return result;
}

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
 * يصدّر قاعدة البيانات من الخيط الرئيسي ويدفعها إلى العامل (Transferable،
 * بدون نسخ). يُستدعى فقط عند وجود تغييرات لم يصلها العامل بعد.
 */
async function pushMainToWorker(): Promise<void> {
  const db = DatabaseManager.getInstance();
  const bytes = db.exportDatabaseBytes();
  await post<void>({ type: 'import', bytes }, [bytes.buffer as ArrayBuffer]);
  lastMainSeqPushed = db.getMutationSeq();
}

/**
 * يضمن أن العامل لديه أحدث حالة لقاعدة البيانات. تكلفته صفرية عندما لا
 * تكون هناك تغييرات على الخيط الرئيسي منذ آخر مزامنة.
 */
async function ensureWorkerInSync(): Promise<void> {
  const db = DatabaseManager.getInstance();
  if (db.getMutationSeq() !== lastMainSeqPushed) {
    await pushMainToWorker();
  }
}

/**
 * يسحب لقطة قاعدة البيانات من العامل ويستوردها في الخيط الرئيسي.
 * يُستدعى مرة واحدة بعد عمليات الكتابة فقط.
 */
async function pullWorkerToMain(): Promise<void> {
  const db = DatabaseManager.getInstance();
  const mainSeqBefore = db.getMutationSeq();
  const bytes = await post<Uint8Array>({ type: 'export' });
  if (db.getMutationSeq() !== mainSeqBefore) {
    // حدثت كتابة على الخيط الرئيسي أثناء تنفيذ عملية العامل. سحب لقطة العامل
    // كان سيمحوها بصمت — نبقي الخيط الرئيسي هو المرجع ونسجّل تحذيرًا. ستتم
    // مزامنة العامل مع الحالة الأحدث في العملية التالية.
    console.warn('[database] Skipped worker→main sync: main database changed during async operation.');
    return;
  }
  db.importDatabaseBytes(bytes);
  // importDatabaseBytes يرفع عدّاد الطفرات؛ سجّله حتى لا تدفع العملية
  // التالية لقطة مطابقة إلى العامل بلا داعٍ.
  lastMainSeqPushed = db.getMutationSeq();
}

/**
 * تهيئة العامل وقاعدة البيانات في الخيط الخلفي.
 * يُستدعى مرة واحدة عند تشغيل التطبيق بعد أن يصبح DatabaseManager جاهزًا في الخيط الرئيسي.
 */
export async function initDatabaseAsync(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = enqueue(async () => {
    await post<void>({ type: 'init' });
    // العامل حمّل لقطته الخاصة (ربما قديمة) من IndexedDB؛ نستبدلها فورًا
    // بالحالة المرجعية على الخيط الرئيسي.
    await pushMainToWorker();
  });
  return initPromise;
}

/**
 * تنفيذ استعلام SELECT غير متزامن في العامل.
 * يعيد مصفوفة من الكائنات بمفاتيح camelCase (نفس سلوك DatabaseManager.query).
 * لا يسحب أي لقطة من العامل لأن القراءة لا تغيّر حالة قاعدة البيانات.
 */
export async function queryAsync<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
  return enqueue(async () => {
    await ensureWorkerInSync();
    return post<T[]>({ type: 'query', sql, params });
  });
}

/**
 * تنفيذ INSERT/UPDATE/DELETE غير متزامن في العامل.
 */
export async function runAsync(sql: string, params: unknown[] = []): Promise<void> {
  return enqueue(async () => {
    await ensureWorkerInSync();
    try {
      await post<void>({ type: 'run', sql, params });
    } catch (err) {
      // The worker may be partially mutated — force a full re-sync next op.
      lastMainSeqPushed = -1;
      throw err;
    }
    try {
      await pullWorkerToMain();
    } catch (err) {
      lastMainSeqPushed = -1;
      throw err;
    }
  });
}

/**
 * تنفيذ SQL خام (transactions, PRAGMA, إلخ) غير متزامن في العامل.
 */
export async function execAsync(sql: string): Promise<void> {
  return enqueue(async () => {
    await ensureWorkerInSync();
    try {
      await post<void>({ type: 'exec', sql });
    } catch (err) {
      lastMainSeqPushed = -1;
      throw err;
    }
    try {
      await pullWorkerToMain();
    } catch (err) {
      lastMainSeqPushed = -1;
      throw err;
    }
  });
}

/**
 * تصدير قاعدة البيانات من العامل كـ Uint8Array (تُنقل بدون نسخ).
 */
export async function exportDatabaseAsync(): Promise<Uint8Array> {
  return enqueue(async () => {
    await ensureWorkerInSync();
    return post<Uint8Array>({ type: 'export' });
  });
}

/**
 * استيراد قاعدة بيانات ثنائية إلى العامل (تستبدل نسخته في الذاكرة).
 */
async function importDatabaseToWorkerAsync(bytes: Uint8Array): Promise<void> {
  await post<void>({ type: 'import', bytes }, [bytes.buffer as ArrayBuffer]);
}

/**
 * استيراد قاعدة بيانات ثنائية إلى الخيط الرئيسي والعامل معًا.
 */
export async function importDatabaseAsync(bytes: Uint8Array): Promise<void> {
  return enqueue(async () => {
    // تحديث النسخة في الخيط الرئيسي أولًا، ثم العامل. نُسجّل عدّاد الطفرات
    // بعد الاستيراد حتى تعتبر الحالة مزامَنة ولا يُدفع شيء لاحقًا.
    DatabaseManager.getInstance().importDatabaseBytes(bytes);
    await importDatabaseToWorkerAsync(bytes);
    lastMainSeqPushed = DatabaseManager.getInstance().getMutationSeq();
  });
}

/**
 * إغلاق العامل وحفظ لقطة قاعدة البيانات.
 */
export async function closeDatabaseAsync(): Promise<void> {
  try {
    await enqueue(async () => {
      await post<void>({ type: 'close' });
    });
  } finally {
    worker?.terminate();
    worker = null;
    initPromise = null;
    pending = new Map();
    lastMainSeqPushed = -1;
  }
}

/**
 * إعادة true إذا كان العامل قد تم تهيئته.
 */
export function isDatabaseReady(): boolean {
  return !!worker && initPromise !== null;
}
