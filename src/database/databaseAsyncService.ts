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
 *   - كل طفرة على الخيط الرئيسي تُمرَّر إلى العامل كرسالة run/exec عادية
 *     (نفس عبارات SQL بالترتيب نفسه)، فيبقى نسخ العامل مطابقًا دون أي نقل
 *     لقطات كاملة. استبدال قاعدة البيانات بالكامل (استيراد/استعادة) يُعلِم
 *     العامل عبر 'reset' ويُزامَن بلقطة كاملة عند الحاجة فقط.
 *   - استعلامات SELECT: تُنفَّذ في العامل مباشرة؛ precedingMutations تضمن
 *     وصول كل الكتابات السابقة إليه أولًا (ترتيب postMessage).
 *   - عمليات الكتابة (run/exec): تُنفَّذ على الخيط الرئيسي (سريعة) وتُمرَّر
 *     إلى العامل تلقائيًا — لا حاجة لسحب لقطة كاملة بعد كل كتابة.
 *   - تصدير اللقطات للحفظ على القرص يتم داخل العامل (خارج خيط الواجهة)،
 *     فلا يتجمد البرنامج عند حفظ قاعدة البيانات.
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
const pending = new Map<number, { resolve: (value: any) => void; reject: (err: Error) => void }>();
let seq = 0;

// Serialize every worker operation so sync pushes/pulls never interleave.
let opQueue: Promise<void> = Promise.resolve();
// Upper bound for any single worker request. Without it a stalled worker
// (OOM, WASM fault, lost message) would leave every queued operation pending
// forever and freeze every feature that touches the database.
const WORKER_OP_TIMEOUT_MS = 120_000;
// mutationSeq of the main database the worker is known to reflect.
// -1 means "never synced" — the first operation always pushes a snapshot.
let lastSyncedSeq = -1;
// True while the worker needs (re)initialization ('init' not yet completed).
let workerNeedsInit = true;
// True when the worker may have missed mutations (failed forward or dead
// worker). Forwards are skipped and a full snapshot push is required.
let workerDirty = false;

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const result = opQueue.then(operation, operation);
  opQueue = result.then(() => undefined, () => undefined);
  return result;
}

function rejectAllPending(error: Error): void {
  const callbacks = [...pending.values()];
  pending.clear();
  for (const cb of callbacks) cb.reject(error);
}

function resetWorkerState(): void {
  worker = null;
  initPromise = null;
  workerNeedsInit = true;
  workerDirty = true;
  lastSyncedSeq = -1;
}

function handleWorkerFailure(reason: string): void {
  console.error(`[database] Database worker failed (${reason}); it will be recreated on the next operation.`);
  rejectAllPending(new Error(`Database worker failed: ${reason}`));
  try { worker?.terminate(); } catch { /* already gone */ }
  resetWorkerState();
}

function ensureWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL('./databaseWorker.ts', import.meta.url), { type: 'module' });
  worker = w;
  workerNeedsInit = true;
  workerDirty = true;

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
    handleWorkerFailure(event.message || 'Worker crashed');
  });

  w.addEventListener('messageerror', () => {
    handleWorkerFailure('Worker message could not be deserialized');
  });

  return w;
}

async function post<T>(request: DbWorkerRequest, transfers: ArrayBuffer[] = []): Promise<T> {
  const w = ensureWorker();
  const id = ++seq;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const promise = new Promise<T>((resolve, reject) => {
    pending.set(id, {
      resolve: (value) => {
        if (timeout) clearTimeout(timeout);
        resolve(value);
      },
      reject: (error) => {
        if (timeout) clearTimeout(timeout);
        reject(error);
      },
    });
    timeout = setTimeout(() => {
      if (pending.delete(id)) {
        reject(new Error(`Database worker request timed out (${request.type})`));
      }
    }, WORKER_OP_TIMEOUT_MS);
  });
  try {
    (w.postMessage as any)({ ...request, id }, transfers);
  } catch (error) {
    pending.delete(id);
    if (timeout) clearTimeout(timeout);
    throw error instanceof Error ? error : new Error(String(error));
  }
  return promise;
}

/**
 * يهيّئ محرك sql.js ويفتح لقطة العامل الخاصة. يُستدعى قبل أي عملية أخرى
 * على عامل جديد، ويُعاد تلقائيًا بعد أي فشل أو إعادة إنشاء.
 */
async function ensureWorkerInitialized(): Promise<void> {
  if (!workerNeedsInit) return;
  await post<void>({ type: 'init' });
  workerNeedsInit = false;
  // اللقطة التي حمّلها العامل قديمة حتمًا؛ نفرض مزامنة بلقطة الخيط الرئيسي.
  lastSyncedSeq = -1;
  workerDirty = true;
}

/**
 * يصدّر قاعدة البيانات من الخيط الرئيسي ويدفعها إلى العامل (Transferable،
 * بدون نسخ). يُستدعى فقط عند وجود تغييرات لم يصلها العامل بعد.
 */
async function pushMainToWorker(retainBytes = false): Promise<Uint8Array | null> {
  const db = DatabaseManager.getInstance();
  const bytes = db.exportDatabaseBytes();
  if (retainBytes) {
    // The import below transfers (detaches) its buffer, which would leave
    // `bytes` empty on this thread. Hand the worker a transferred copy and
    // keep the original so callers (e.g. snapshot export) can reuse it
    // instead of paying for a second full serialization.
    const workerBytes = bytes.slice();
    await post<void>({ type: 'import', bytes: workerBytes }, [workerBytes.buffer as ArrayBuffer]);
    lastSyncedSeq = db.getMutationSeq();
    workerDirty = false;
    return bytes;
  }
  await post<void>({ type: 'import', bytes }, [bytes.buffer as ArrayBuffer]);
  lastSyncedSeq = db.getMutationSeq();
  workerDirty = false;
  return null;
}  

/**
 * يضمن أن العامل لديه أحدث حالة لقاعدة البيانات. تكلفته صفرية عندما لا
 * تكون هناك تغييرات على الخيط الرئيسي منذ آخر مزامنة.
 */
async function ensureWorkerInSync(retainSnapshot = false): Promise<Uint8Array | null> {
  await ensureWorkerInitialized();
  const db = DatabaseManager.getInstance();
  if (workerDirty || db.getMutationSeq() !== lastSyncedSeq) {
    return pushMainToWorker(retainSnapshot);
  }
  return null;
}

/**
 * يعلّم العامل بأنه قد يكون فقد طفرات وأ必须 إعادة مزامنة كاملة قبل الوثوق به.
 */
function markWorkerUnsynced(): void {
  lastSyncedSeq = -1;
  workerDirty = true;
}

/**
 * يُستدعى من DatabaseManager عند كل طفرة (run/exec) أو استبدال كامل
 * للقاعدة (reset). الطفرات تُمرَّر كعبارات SQL عادية عبر نفس قناة
 * postMessage المنظمة، فيصل العامل إليها بنفس ترتيب تنفيذها على الخيط
 * الرئيسي — دون أي تصدير/استيراد للقاعدة كاملة.
 */
function handleMainMutation(kind: 'run' | 'exec' | 'reset', sql: string, params: unknown[]): void {
  if (kind === 'reset') {
    // استبدال القاعدة بالكامل (استيراد/استعادة) — العامل يحتاج لقطة جديدة.
    markWorkerUnsynced();
    return;
  }
  if (workerDirty || !worker || workerNeedsInit) return;
  const capturedSeq = DatabaseManager.getInstance().getMutationSeq();
  const request: DbWorkerRequest = kind === 'exec'
    ? { type: 'exec', sql }
    : { type: 'run', sql, params };
  // عملية الكتابة نفسها متزامنة على الخيط الرئيسي؛ هنا نكتفي بإيصال
  // نفس العبارة إلى العامل بترتيب FIFO. لا ننتظر النتيجة — الفشل يعني
  // أن نسخ العامل غير موثوق فتتم مزامنته بلقطة كاملة لاحقًا.
  void enqueue(async () => {
    if (workerDirty || !worker || workerNeedsInit) return;
    try {
      await post<void>(request);
      if (!workerDirty) lastSyncedSeq = capturedSeq;
    } catch {
      markWorkerUnsynced();
    }
  });
}

/**
 * تهيئة العامل وقاعدة البيانات في الخيط الخلفي.
 * يُستدعى مرة واحدة عند تشغيل التطبيق بعد أن يصبح DatabaseManager جاهزًا في الخيط الرئيسي.
 */
export async function initDatabaseAsync(): Promise<void> {
  registerMutationForwarder();
  if (initPromise) return initPromise;
  const initialization = enqueue(async () => {
    await ensureWorkerInSync();
  });
  initPromise = initialization;
  initialization.catch(() => {
    // فشل التهيئة لا يجب أن يُخزَّن إلى الأبد — سنحاول مجددًا عند الطلب التالي.
    if (initPromise === initialization) initPromise = null;
  });
  return initialization;
}

/**
 * يجهّز العامل (تحميل محرك sql.js داخل الخيط الخلفي) دون مزامنة اللقطة.
 * يُستدعى مبكرًا عند الإقلاع ليتداخل تجميع WASM الخاص بالعامل مع تهيئة
 * الخيط الرئيسي؛ المزامنة الفعلية للبيانات تتم عند أول عملية حقيقية
 * عبر ensureWorkerInSync كالمعتاد.
 */
export function prewarmDatabaseWorker(): void {
  registerMutationForwarder();
  void enqueue(async () => {
    await ensureWorkerInitialized();
  }).catch((error) => {
    console.error('Database worker prewarm failed:', error);
  });
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
 * تنفيذ INSERT/UPDATE/DELETE غير متزامن.
 * تُنفَّذ الكتابة على خيط الواجهة (عبارات SQL المفردة سريعة جدًا) ويقوم
 * DatabaseManager بتمريرها إلى العامل تلقائيًا، فلا حاجة لدورة
 * export/import كاملة للقاعدة بعد كل كتابة.
 */
export async function runAsync(sql: string, params: unknown[] = []): Promise<void> {
  return enqueue(async () => {
    DatabaseManager.getInstance().run(sql, params);
  });
}

/**
 * تنفيذ SQL خام (transactions, PRAGMA, إلخ) بشكل غير متزامن.
 * يُنفَّذ على الخيط الرئيسي وتُمرَّر نفس العبارات إلى العامل بالترتيب
 * نفسه، فيبقى نسخ العامل مطابقًا (بما في ذلك BEGIN/COMMIT/ROLLBACK).
 */
export async function execAsync(sql: string): Promise<void> {
  return enqueue(async () => {
    DatabaseManager.getInstance().getDatabase().exec(sql);
  });
}

/**
 * تصدير قاعدة البيانات من العامل كـ Uint8Array (تُنقل بدون نسخ).
 * يُستخدم لمسار الحفظ على القرص حتى لا يتجمد خيط الواجهة بعملية
 * db.export() المتزامنة متعددة الميغابايتات.
 */
export async function exportDatabaseAsync(): Promise<Uint8Array> {
  return enqueue(async () => {
    // If the worker was out of sync, ensureWorkerInSync already exported the
    // main database to push it — reuse those bytes instead of paying for a
    // second full db.export() inside the worker.
    const pushed = await ensureWorkerInSync(true);
    if (pushed) return pushed;
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
    await ensureWorkerInitialized();
    await importDatabaseToWorkerAsync(bytes);
    lastSyncedSeq = DatabaseManager.getInstance().getMutationSeq();
    workerDirty = false;
  });
}

/**
 * تسجيل مستقبِل الطفرات على DatabaseManager — يُستدعى مرة واحدة عند
 * تهيئة الخدمة. كل طفرة على الخيط الرئيسي تُمرَّر إلى العامل فورًا.
 */
export function registerMutationForwarder(): void {
  DatabaseManager.getInstance().setMutationForwarder(handleMainMutation);
}

/**
 * إغلاق العامل وحفظ لقطة قاعدة البيانات.
 */
export async function closeDatabaseAsync(): Promise<void> {
  try {
    await enqueue(async () => {
      await post<void>({ type: 'close' });
    });
  } catch { /* worker may already be gone */ } finally {
    rejectAllPending(new Error('Database worker closed'));
    try { worker?.terminate(); } catch { /* already gone */ }
    worker = null;
    initPromise = null;
    workerNeedsInit = true;
    workerDirty = true;
    lastSyncedSeq = -1;
  }
}

/**
 * إعادة true إذا كان العامل قد تم تهيئته ويحتفظ بنسخة صالحة من القاعدة.
 */
export function isDatabaseReady(): boolean {
  return !!worker && !workerNeedsInit && initPromise !== null;
}

// Installing the forwarder at module load guarantees that mutations are
// mirrored to the worker from the very first write, even before
// initDatabaseAsync() has run (the worker itself is created lazily).
registerMutationForwarder();
