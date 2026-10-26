import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ClipboardCheck, Loader2, RefreshCw, Scale } from 'lucide-react';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import {
  SalesFinancialReconciliationService,
} from '../../services/SalesFinancialReconciliationService';
import type {
  SalesFinancialCheck,
  SalesFinancialClosure,
} from '../../services/SalesFinancialReconciliationService';

const fmt = (value: number) => new Intl.NumberFormat('ar-EG', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(value);

export function SalesFinancialReconciliation({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const service = useMemo(() => new SalesFinancialReconciliationService(), []);
  const user = AuthService.getCurrentUser();
  const canView = PermissionService.can(user, 'finance.view');
  const canClose = PermissionService.can(user, 'finance.approve');
  const [checks, setChecks] = useState<SalesFinancialCheck[]>([]);
  const [closure, setClosure] = useState<SalesFinancialClosure | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setChecks(service.getReconciliation(dateFrom, dateTo));
      setClosure(service.getLatestClosure(dateFrom, dateTo));
      setReasons({});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل بيانات المصالحة.');
    } finally {
      setLoading(false);
    }
  }, [canView, dateFrom, dateTo, service]);

  useEffect(() => { load(); }, [load]);

  const closeReview = () => {
    setSaving(true);
    setError(null);
    try {
      const result = service.closeReconciliation(dateFrom, dateTo, reasons);
      setClosure(result);
      setChecks(result.checks);
      setReasons({});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر إقفال المصالحة.');
    } finally {
      setSaving(false);
    }
  };

  if (!canView) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm font-bold text-rose-700">
        لا تملك صلاحية عرض بيانات المصالحة المالية.
      </div>
    );
  }

  const differences = checks.filter((check) => check.status === 'DIFFERENCE');
  const allReasonsProvided = differences.every((check) => Boolean(reasons[check.key]?.trim()));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-teal-50 p-2 text-teal-700"><Scale className="h-5 w-5" /></div>
          <div>
            <h2 className="font-black text-slate-900">بوابة مراجعة الفروقات المالية</h2>
            <p className="text-xs text-slate-500">الفترة التشغيلية: {dateFrom} — {dateTo}</p>
          </div>
        </div>
        <button onClick={load} disabled={loading || saving}
          className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> تحديث الفحص
        </button>
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center rounded-xl border border-slate-200 bg-white py-12">
          <Loader2 className="h-7 w-7 animate-spin text-teal-600" />
        </div>
      ) : (
        <>
          <div className={`rounded-xl border p-4 ${differences.length ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
            <p className="flex items-center gap-2 text-sm font-black">
              {differences.length ? <AlertCircle className="h-4 w-4 text-amber-700" /> : <CheckCircle2 className="h-4 w-4 text-emerald-700" />}
              {differences.length ? `تحتاج ${differences.length} بنود إلى المراجعة` : 'جميع بنود المصالحة متطابقة'}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              تظهر فحوصات المبيعات والمرتجعات حسب الفترة، وأرصدة الذمم والمخزون والخزائن والبنوك الحالية.
              الإقفال يوثق المراجعة ولا ينشئ قيود تسوية تلقائية.
            </p>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-right">بند المصالحة</th>
                    <th className="px-4 py-3 text-left">الأستاذ العام</th>
                    <th className="px-4 py-3 text-left">المصدر التشغيلي</th>
                    <th className="px-4 py-3 text-left">الفرق</th>
                    <th className="px-4 py-3 text-right">الحالة / سبب الفرق</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {checks.map((check) => (
                    <tr key={check.key}>
                      <td className="px-4 py-3">
                        <p className="font-bold text-slate-800">{check.label}</p>
                        <p className="mt-1 text-xs text-slate-500">{check.detail}</p>
                      </td>
                      <td className="px-4 py-3 text-left font-mono">{fmt(check.ledger)} ج.م</td>
                      <td className="px-4 py-3 text-left font-mono">{fmt(check.source)} ج.م</td>
                      <td className={`px-4 py-3 text-left font-mono ${check.status === 'MATCH' ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {fmt(check.difference)} ج.م
                      </td>
                      <td className="px-4 py-3">
                        {check.status === 'MATCH' ? (
                          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700">متطابق</span>
                        ) : canClose ? (
                          <label className="block min-w-64">
                            <span className="sr-only">سبب الفرق في {check.label}</span>
                            <textarea value={reasons[check.key] || ''}
                              onChange={(event) => setReasons((current) => ({ ...current, [check.key]: event.target.value }))}
                              rows={2} maxLength={1000} placeholder="سجل سبب الفرق أو الإجراء المتخذ"
                              className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs focus:border-teal-500 focus:outline-none" />
                          </label>
                        ) : (
                          <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-bold text-rose-700">فرق</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {canClose && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">
                {differences.length
                  ? 'يجب توثيق سبب كل فرق قبل الإقفال. الإقفال يحفظ لقطة مراجعة قابلة للتدقيق.'
                  : 'يمكن إقفال الفترة بعد مراجعة النتائج المتطابقة.'}
              </p>
              <button onClick={closeReview} disabled={saving || loading || !allReasonsProvided}
                className="flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-xs font-bold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
                إقفال المراجعة وحفظها
              </button>
            </div>
          )}

          {closure && (
            <div className="rounded-xl border border-teal-200 bg-teal-50 p-4">
              <p className="font-black text-teal-900">آخر مراجعة مقفلة لهذه الفترة</p>
              <p className="mt-1 text-xs text-teal-800">
                {closure.closedAt} — بواسطة {closure.closedBy}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-xs text-slate-700">{closure.notes}</p>
              <p className="mt-2 text-[11px] text-slate-500">هذه لقطة وقت الإقفال؛ حدّث الفحص للتحقق من الأرصدة الحالية.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
