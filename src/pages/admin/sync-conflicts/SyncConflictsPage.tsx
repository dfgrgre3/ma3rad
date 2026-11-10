import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Check, ChevronDown, ChevronUp, RefreshCw, ShieldCheck,
  Sparkles, History, GitMerge, Wifi, WifiOff, Clock, AlertCircle, X,
  CheckCircle2, ArrowRightLeft, Database, SlidersHorizontal
} from 'lucide-react';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import {
  MasterDataSyncService,
  type SyncConflict,
  type ResolvedConflict,
} from '../../../sync/MasterDataSyncService';
import { useToast } from '../../../components/ui/Toast';
import { SyncClientSettings } from './SyncClientSettings';
import { ConflictResolver, type FieldDiff } from '../../../sync/ConflictResolver';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SyncHealth {
  connected: boolean;
  pendingCount: number;
  failedCount: number;
  deadLetterCount: number;
  lastSyncAt: string | null;
  lastError: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const entityLabels: Record<string, string> = {
  category: 'تصنيف',
  brand: 'ماركة',
  product: 'منتج',
  customer: 'عميل',
  supplier: 'مورد',
  stock_transfer: 'تحويل مخزني',
};

function formatTimestamp(value?: string | null): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return value;
  }
}

function parseLocalPayload(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as Record<string, unknown>; } catch { return null; }
}

function parseRemoteRow(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { payload?: { row?: Record<string, unknown> } };
    return parsed?.payload?.row ?? null;
  } catch { return null; }
}

function resolvedStatusLabel(status: string): { label: string; cls: string } {
  if (status === 'RESOLVED_LOCAL') return { label: 'أُبقي المحلي', cls: 'bg-slate-100 text-slate-700' };
  if (status === 'RESOLVED_REMOTE') return { label: 'اعتُمد الوارد', cls: 'bg-sky-100 text-sky-700' };
  if (status === 'RESOLVED_AUTO') return { label: 'دمج ذكي تلقائي', cls: 'bg-emerald-100 text-emerald-700' };
  return { label: status, cls: 'bg-amber-100 text-amber-700' };
}

// ─── FieldDiffRow component ──────────────────────────────────────────────────

const FieldDiffRow: React.FC<{ diff: FieldDiff }> = ({ diff }) => {
  const isConflict = diff.status === 'CONFLICT';
  const rowCls = isConflict
    ? 'bg-amber-50/70 border-amber-200'
    : diff.status === 'LOCAL_ONLY'
      ? 'bg-sky-50/50 border-sky-100'
      : diff.status === 'REMOTE_ONLY'
        ? 'bg-emerald-50/50 border-emerald-100'
        : 'bg-white border-slate-100';

  const badge =
    diff.status === 'CONFLICT'
      ? <span className="rounded-md bg-amber-200/80 px-2 py-0.5 text-[10px] font-bold text-amber-900">مختلف</span>
      : diff.status === 'LOCAL_ONLY'
        ? <span className="rounded-md bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-800">محلي فقط</span>
        : diff.status === 'REMOTE_ONLY'
          ? <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">وارد فقط</span>
          : <span className="text-[10px] text-slate-400">متطابق</span>;

  const fmt = (v: unknown) => (v === null || v === undefined || v === '' ? <span className="text-slate-300 italic">فارغ</span> : String(v));

  return (
    <tr className={`border-b transition-colors ${rowCls}`}>
      <td className="p-3 font-semibold text-slate-700 text-xs">
        <div className="flex items-center gap-2">
          <span>{diff.label}</span>
          {badge}
        </div>
      </td>
      <td className="p-3 font-mono text-slate-900 text-xs">{fmt(diff.localValue)}</td>
      <td className="p-3 font-mono text-slate-900 text-xs">{fmt(diff.remoteValue)}</td>
    </tr>
  );
};

// ─── MergePreviewModal ────────────────────────────────────────────────────────

interface MergePreviewModalProps {
  conflict: SyncConflict;
  diffs: FieldDiff[];
  mergedPayload: Record<string, unknown>;
  onConfirm: () => void;
  onClose: () => void;
}

const MergePreviewModal: React.FC<MergePreviewModalProps> = ({ conflict, diffs, onConfirm, onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" dir="rtl">
    <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 p-4 bg-slate-50">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
            <GitMerge className="h-4 w-4" />
          </div>
          <div>
            <h2 className="font-bold text-sm text-slate-900">معاينة الحسم والدمج التلقائي</h2>
            <p className="text-[11px] text-slate-500">سيتم دمج الحقول المتطابقة والآمنة تلقائياً واعتماد النتيجة لباقي الفروع.</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="p-4 max-h-[60vh] overflow-auto">
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-right">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100 text-slate-600 text-xs">
                <th className="p-2.5">الحقل</th>
                <th className="p-2.5">البيانات المحلية</th>
                <th className="p-2.5">بيانات الفرع الواردة</th>
              </tr>
            </thead>
            <tbody>
              {diffs.filter(d => d.status === 'CONFLICT').map(diff => (
                <FieldDiffRow key={diff.field} diff={diff} />
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
          <span>النوع: <strong>{entityLabels[conflict.entityType] ?? conflict.entityType}</strong></span>
          <span>معرّف السجل: <code className="font-mono text-slate-700">{conflict.entityId}</code></span>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-slate-100 p-4 bg-slate-50">
        <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition">
          إلغاء
        </button>
        <button type="button" onClick={onConfirm} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-sm transition">
          <Sparkles className="h-4 w-4" />
          تأكيد وحفظ الدمج
        </button>
      </div>
    </div>
  </div>
);

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'conflicts' | 'resolved';

export const SyncConflictsPage: React.FC = () => {
  const service = useMemo(() => new MasterDataSyncService(), []);
  const conflictResolver = useMemo(() => new ConflictResolver(), []);
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<Tab>('conflicts');
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [resolvedConflicts, setResolvedConflicts] = useState<ResolvedConflict[]>([]);
  const [health, setHealth] = useState<SyncHealth>({
    connected: false, pendingCount: 0, failedCount: 0, deadLetterCount: 0,
    lastSyncAt: null, lastError: null,
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [autoResolvingId, setAutoResolvingId] = useState<string | null>(null);
  const [previewMerge, setPreviewMerge] = useState<{
    conflict: SyncConflict;
    diffs: FieldDiff[];
    mergedPayload: Record<string, unknown>;
  } | null>(null);
  const prevConflictCount = useRef(0);

  // ─── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(() => {
    setLoading(true);
    try {
      PermissionService.require(AuthService.requireAuth(), 'admin.view');
      const openConflicts = service.listOpenConflicts();
      setConflicts(openConflicts);
      setResolvedConflicts(service.listResolvedConflicts());

      if (openConflicts.length > prevConflictCount.current && prevConflictCount.current > 0) {
        const newCount = openConflicts.length - prevConflictCount.current;
        toast.error(`⚠️ تم رصد ${newCount} تعارض جديد يحتاج مراجعتك`);
        setActiveTab('conflicts');
      }
      prevConflictCount.current = openConflicts.length;

      // Status check
      try {
        const syncBridge = window.ceramisys?.sync;
        if (syncBridge?.status) {
          syncBridge.status().then((s: any) => {
            setHealth({
              connected: !!s?.serverReachable,
              pendingCount: s?.outboxPending ?? 0,
              failedCount: s?.outboxFailed ?? 0,
              deadLetterCount: s?.deadLetter ?? 0,
              lastSyncAt: s?.lastSyncAt ?? null,
              lastError: s?.error ?? null,
            });
          }).catch(() => {/* ignore */});
        }
      } catch {/* ignore */}
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تحميل بيانات المزامنة.');
    } finally {
      setLoading(false);
    }
  }, [service, toast]);

  useEffect(() => { load(); }, [load]);

  // ─── Actions ───────────────────────────────────────────────────────────────

  const runInstantSync = async () => {
    try {
      PermissionService.require(AuthService.requireAuth(), 'admin.view');
      const syncBridge = window.ceramisys?.sync;
      const runner = syncBridge?.runSyncNow;
      if (!runner) {
        toast.error('المزامنة الفورية متاحة من تطبيق سطح المكتب فقط.');
        return;
      }
      await runner();
      toast.success('تمت المزامنة الفورية بنجاح.');
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تشغيل المزامنة الفورية.');
    }
  };

  const resolve = (conflict: SyncConflict, resolution: 'KEEP_LOCAL' | 'ACCEPT_REMOTE') => {
    const choice = resolution === 'KEEP_LOCAL' ? 'الإبقاء على نسخة هذا الجهاز' : 'اعتماد النسخة الواردة من الفرع';
    if (!window.confirm(`هل أنت متأكد من ${choice}؟`)) return;
    try {
      PermissionService.require(AuthService.requireAuth(), 'admin.view');
      service.resolveConflict(conflict.id, resolution);
      toast.success('تم حسم التعارض وتحديث البيانات بنجاح.');
      setExpandedId(null);
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر حسم التعارض.');
    }
  };

  const tryAutoResolve = (conflict: SyncConflict) => {
    try {
      const localPayload = parseLocalPayload(conflict.localPayload);
      const remoteRow = parseRemoteRow(conflict.remotePayload);
      if (!remoteRow) {
        toast.error('بيانات الفرع الواردة غير صالحة للدمج.');
        return;
      }

      const resolution = conflictResolver.autoResolve(conflict.entityType, localPayload ?? {}, remoteRow);
      if (!resolution) {
        toast.error('يحتوي هذا التعارض على حقول حساسة تتطلب قرارك اليدوي.');
        return;
      }

      if (resolution.strategy === 'FIELD_MERGE' && resolution.mergedPayload) {
        const diffs = conflictResolver.compareFields(localPayload ?? {}, remoteRow, conflict.entityType);
        setPreviewMerge({ conflict, diffs, mergedPayload: resolution.mergedPayload });
        return;
      }

      setAutoResolvingId(conflict.id);
      PermissionService.require(AuthService.requireAuth(), 'admin.view');
      if (resolution.strategy === 'REMOTE_WINS') {
        service.resolveConflict(conflict.id, 'ACCEPT_REMOTE');
      } else {
        service.resolveConflict(conflict.id, 'KEEP_LOCAL');
      }
      toast.success(`تم الحسم التلقائي: ${resolution.reason}`);
      setExpandedId(null);
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر الحسم التلقائي.');
    } finally {
      setAutoResolvingId(null);
    }
  };

  const confirmAutoMerge = () => {
    if (!previewMerge) return;
    try {
      PermissionService.require(AuthService.requireAuth(), 'admin.view');
      service.resolveConflict(previewMerge.conflict.id, 'AUTO_MERGED', previewMerge.mergedPayload);
      toast.success('تم تطبيق الدمج الذكي وإرسال التحديث لجميع الفروع.');
      setPreviewMerge(null);
      setExpandedId(null);
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تطبيق الدمج التلقائي.');
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-full overflow-auto bg-slate-50 p-4 text-slate-900 sm:p-6" dir="rtl">
      {/* ── Page Header ── */}
      <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 border border-amber-200/50">
            <ArrowRightLeft className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900">إدارة تعارضات المزامنة</h1>
            <p className="text-xs text-slate-500 mt-0.5">مقارنة التعديلات المتزامنة بين الفروع وحسمها بدقة وأمان.</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold transition shadow-sm ${
              showSettings ? 'border-sky-300 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            إعدادات الاتصال والشبكة
          </button>
          <button
            type="button"
            onClick={runInstantSync}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-sm transition"
          >
            <RefreshCw className="h-4 w-4" />
            مزامنة فورية
          </button>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition shadow-sm"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            تحديث
          </button>
        </div>
      </header>

      {/* ── Status Bar ── */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${health.connected ? 'animate-ping bg-emerald-400' : 'bg-slate-300'}`}></span>
              <span className={`relative inline-flex h-3 w-3 rounded-full ${health.connected ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
            </span>
            <span className={`text-xs font-bold ${health.connected ? 'text-emerald-700' : 'text-slate-600'}`}>
              {health.connected ? 'متصل بالشبكة وجاهز' : 'غير متصل بالفرع'}
            </span>
          </div>

          <div className="h-4 w-px bg-slate-200 hidden sm:block"></div>

          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            <span>آخر مزامنة: <strong>{formatTimestamp(health.lastSyncAt)}</strong></span>
          </div>

          {health.pendingCount > 0 && (
            <span className="rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">
              {health.pendingCount} سجل في الانتظار
            </span>
          )}

          {health.failedCount > 0 && (
            <span className="rounded-full bg-red-50 border border-red-200 px-2.5 py-0.5 text-[11px] font-bold text-red-700">
              {health.failedCount} فشل إرسال
            </span>
          )}
        </div>

        {health.lastError && (
          <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 px-2.5 py-1 rounded-lg border border-red-100">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate max-w-sm">{health.lastError}</span>
          </div>
        )}
      </div>

      {/* ── Collapsible Settings (Tailscale / Sync IP) ── */}
      {showSettings && (
        <div className="mb-5 animate-in fade-in duration-200">
          <SyncClientSettings />
        </div>
      )}

      {/* ── Navigation Tabs ── */}
      <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-2">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('conflicts')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === 'conflicts'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-200/60'
            }`}
          >
            <span>التعارضات المفتوحة</span>
            {conflicts.length > 0 && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                activeTab === 'conflicts' ? 'bg-amber-400 text-slate-950' : 'bg-amber-100 text-amber-800'
              }`}>
                {conflicts.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('resolved')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === 'resolved'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-200/60'
            }`}
          >
            <History className="h-3.5 w-3.5" />
            <span>سجل الحسم السابق</span>
            {resolvedConflicts.length > 0 && (
              <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                {resolvedConflicts.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ═══ TAB 1: Open Conflicts ═══════════════════════════════════════════════ */}
      {activeTab === 'conflicts' && (
        <div className="space-y-3">
          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-xs text-slate-400">
              <RefreshCw className="mx-auto mb-2 h-6 w-6 animate-spin text-slate-300" />
              جارٍ فحص التعارضات...
            </div>
          ) : conflicts.length === 0 ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-12 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h3 className="font-bold text-slate-900 text-sm">كافة البيانات متزامنة ولا توجد تعارضات</h3>
              <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                جميع المنتجات والعملاء والمستندات متطابقة تماماً بين هذا الجهاز والفروع الأخرى.
              </p>
            </div>
          ) : (
            conflicts.map((conflict) => {
              const expanded = expandedId === conflict.id;
              const localPayload = parseLocalPayload(conflict.localPayload);
              const remoteRow = parseRemoteRow(conflict.remotePayload);
              const diffs = expanded && localPayload !== null && remoteRow !== null
                ? conflictResolver.compareFields(localPayload, remoteRow, conflict.entityType)
                : [];
              const autoResolution = expanded && localPayload !== null && remoteRow !== null
                ? conflictResolver.autoResolve(conflict.entityType, localPayload, remoteRow)
                : null;
              const conflictDiffs = diffs.filter(d => d.status === 'CONFLICT');

              return (
                <div key={conflict.id} className="overflow-hidden rounded-2xl border border-amber-200/90 bg-white shadow-sm transition">
                  {/* Summary Bar */}
                  <div
                    onClick={() => setExpandedId(expanded ? null : conflict.id)}
                    className="flex cursor-pointer flex-wrap items-center justify-between gap-3 p-4 hover:bg-amber-50/30 transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800 font-black text-xs">
                        {entityLabels[conflict.entityType] ?? conflict.entityType}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900">
                            {entityLabels[conflict.entityType] ?? conflict.entityType}
                          </span>
                          <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600">
                            #{conflict.entityId}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          تعديل وارد من الفرع: <span className="font-semibold text-slate-700">{conflict.sourceBranchId}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1 text-[11px] font-bold text-amber-800">
                        يحتاج قرارك
                      </span>
                      {expanded ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
                    </div>
                  </div>

                  {/* Expanded Body */}
                  {expanded && (
                    <div className="border-t border-slate-100 p-4 bg-slate-50/50">
                      {/* Auto resolution recommendation banner */}
                      {autoResolution && (
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                          <div className="flex items-center gap-2 text-xs text-emerald-900">
                            <Sparkles className="h-4 w-4 text-emerald-600 shrink-0" />
                            <span><strong>اقتراح حسم ذكي:</strong> {autoResolution.reason}</span>
                          </div>
                          <button
                            type="button"
                            disabled={autoResolvingId === conflict.id}
                            onClick={() => tryAutoResolve(conflict)}
                            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition disabled:opacity-50"
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            {autoResolvingId === conflict.id ? 'جارٍ الحسم...' : 'تطبيق الدمج الذكي'}
                          </button>
                        </div>
                      )}

                      {/* Visual Diff Table */}
                      <div className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
                        <table className="w-full text-right">
                          <thead>
                            <tr className="border-b border-slate-100 bg-slate-50 text-slate-600 text-xs">
                              <th className="p-3">اسم الحقل</th>
                              <th className="p-3 text-sky-800">البيانات الحالية على هذا الجهاز</th>
                              <th className="p-3 text-emerald-800">البيانات الواردة من الفرع الآخر</th>
                            </tr>
                          </thead>
                          <tbody>
                            {diffs.map((diff) => (
                              <FieldDiffRow key={diff.field} diff={diff} />
                            ))}
                          </tbody>
                        </table>

                        {conflictDiffs.length > 0 && (
                          <div className="border-t border-slate-100 bg-amber-50/50 px-3 py-2 text-[11px] text-amber-800 flex items-center justify-between">
                            <span>يوجد {conflictDiffs.length} حقول مختلفة بين النسختين.</span>
                            <span className="text-slate-500">{diffs.filter(d => d.status === 'SAME').length} حقول متطابقة تماماً</span>
                          </div>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => resolve(conflict, 'KEEP_LOCAL')}
                            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition shadow-sm"
                          >
                            الإبقاء على نسخة هذا الجهاز وإلغاء الوارد
                          </button>
                          <button
                            type="button"
                            onClick={() => resolve(conflict, 'ACCEPT_REMOTE')}
                            className="rounded-xl bg-sky-700 px-4 py-2 text-xs font-bold text-white hover:bg-sky-800 transition shadow-sm"
                          >
                            اعتماد واستبدال بالبيانات الواردة
                          </button>
                        </div>

                        <span className="text-[11px] text-slate-400">
                          الإصدار المحلي: {conflict.localVersion ?? 0} | الوارد: {conflict.remoteVersion}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ═══ TAB 2: Resolved History ════════════════════════════════════════════ */}
      {activeTab === 'resolved' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold text-sm text-slate-800 flex items-center gap-2">
              <History className="h-4 w-4 text-slate-500" />
              سجل القرارات والتعارضات المحسومة سابقاً
            </h2>
            <span className="text-xs text-slate-400">آخر 50 عملية حسم</span>
          </div>

          {resolvedConflicts.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-slate-100">
              لا توجد عمليات حسم سابقة مسجلة.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-500 bg-slate-50/50">
                    <th className="p-3">نوع البيانات</th>
                    <th className="p-3">معرّف السجل</th>
                    <th className="p-3">الفرع المصدر</th>
                    <th className="p-3">القرار المتخذ</th>
                    <th className="p-3">السبب</th>
                    <th className="p-3">تاريخ الحسم</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {resolvedConflicts.map((rc) => {
                    const st = resolvedStatusLabel(rc.status);
                    return (
                      <tr key={rc.id} className="hover:bg-slate-50/60 transition">
                        <td className="p-3 font-bold text-slate-700">{entityLabels[rc.entityType] ?? rc.entityType}</td>
                        <td className="p-3 font-mono text-[11px] text-slate-600">{rc.entityId}</td>
                        <td className="p-3 text-slate-600">{rc.sourceBranchId}</td>
                        <td className="p-3">
                          <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${st.cls}`}>{st.label}</span>
                        </td>
                        <td className="p-3 text-slate-500 max-w-[240px] truncate">{rc.reason}</td>
                        <td className="p-3 text-slate-400">{formatTimestamp(rc.resolvedAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Auto Merge Preview Modal ── */}
      {previewMerge && (
        <MergePreviewModal
          conflict={previewMerge.conflict}
          diffs={previewMerge.diffs}
          mergedPayload={previewMerge.mergedPayload}
          onConfirm={confirmAutoMerge}
          onClose={() => setPreviewMerge(null)}
        />
      )}
    </div>
  );
};

export default SyncConflictsPage;
