import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import {
  HistoricalReturnReconciliationService,
  type HistoricalReturnCandidate,
} from '../../services/HistoricalReturnReconciliationService';

type ApprovalForm = {
  cash: string;
  balance: string;
  notes: string;
};

const money = (value: number) =>
  new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(value) || 0) + ' ج';

export const HistoricalReturnReconciliationPanel: React.FC = () => {
  const service = useMemo(() => new HistoricalReturnReconciliationService(), []);
  const [rows, setRows] = useState<HistoricalReturnCandidate[]>([]);
  const [forms, setForms] = useState<Record<string, ApprovalForm>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reportReviewId, setReportReviewId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    setReportReviewId(null);
    try {
      setRows(service.listPending());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [service]);

  useEffect(() => { load(); }, [load]);

  const updateForm = (id: string, patch: Partial<ApprovalForm>) => {
    setForms((current) => {
      const previous = current[id] || { cash: '', balance: '', notes: '' };
      return { ...current, [id]: { ...previous, ...patch } };
    });
  };

  const approve = (candidate: HistoricalReturnCandidate) => {
    if (!reportReviewId) {
      setError('احفظ تقرير الفروقات وراجعه قبل اعتماد أي تسوية.');
      return;
    }
    const form = forms[candidate.id];
    if (!form) {
      setError('أدخل المبلغ النقدي والرصيد المؤكدين من مستندات أصلية، ثم اكتب ملاحظة التدقيق.');
      return;
    }
    setSavingId(candidate.id);
    setError(null);
    setNotice(null);
    try {
      service.approve({
        returnId: candidate.id,
        reviewId: reportReviewId,
        confirmedCashAmount: Number(form.cash),
        confirmedBalanceAmount: Number(form.balance),
        notes: form.notes,
      });
      setNotice(`تم اعتماد تسوية ${candidate.returnNumber}. لم تُعدّل حركة النقد التاريخية.`);
      setReportReviewId(null);
      setForms((current) => {
        const next = { ...current };
        delete next[candidate.id];
        return next;
      });
      load();
    } catch (approvalError) {
      setError(approvalError instanceof Error ? approvalError.message : String(approvalError));
    } finally {
      setSavingId(null);
    }
  };

  const saveReportReview = () => {
    setError(null);
    setNotice(null);
    try {
      const reviewId = service.recordReportReview();
      setRows(service.listPending());
      setReportReviewId(reviewId);
      setNotice('تم حفظ تقرير الفروقات في سجل التدقيق. راجعه قبل اعتماد أي تسوية.');
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : String(reviewError));
    }
  };

  return (
    <section className="mb-5 rounded-2xl border border-amber-300 bg-white p-4 shadow-sm" dir="rtl">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-slate-900">مراجعة المرتجعات التاريخية قبل التسوية</h2>
          <p className="mt-1 max-w-4xl text-[11px] leading-relaxed text-slate-600">
            الضريبة محسوبة تناسبيًا من الفاتورة الأصلية للعرض فقط. لا تُعدّل الخزينة أو الوردية أو القيد التاريخي تلقائيًا؛
            يلزم إثبات النقد والرصيد من المستندات، ويُسجل أي قيد تصحيح في تاريخ اليوم وبعد التحقق من الفترة المفتوحة.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> تحديث
          </button>
          <button type="button" onClick={saveReportReview} disabled={loading} className="rounded-lg bg-sky-700 px-3 py-2 text-xs font-bold text-white hover:bg-sky-800 disabled:opacity-50">
            حفظ تقرير الفروقات للمراجعة
          </button>
        </div>
      </div>

      {error && <div className="mb-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
      {notice && <div className="mb-3 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{notice}</div>}
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-amber-600" /></div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl bg-emerald-50 p-4 text-center text-xs font-semibold text-emerald-700">لا توجد مرتجعات تاريخية بانتظار المراجعة.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const form = forms[row.id] || { cash: '', balance: '', notes: '' };
            const ledgerMismatch = Math.abs(row.ledgerCashAmount - row.storedCashAmount) > 0.01;
            return (
              <article key={row.id} className="rounded-xl border border-slate-200 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-black text-slate-900">{row.returnNumber} · {row.customerName}</h3>
                    <p className="mt-0.5 text-[10px] text-slate-500">الفاتورة {row.invoiceNumber} · {row.returnDate}</p>
                  </div>
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-800">الضريبة غير مسجلة</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[10px] sm:grid-cols-4 lg:grid-cols-7">
                  <div><span className="text-slate-500">صافي المرتجع</span><b className="block text-slate-900">{money(row.netAmount)}</b></div>
                  <div><span className="text-slate-500">الضريبة المحسوبة للعرض</span><b className="block text-orange-700">{money(row.calculatedTax)}</b></div>
                  <div><span className="text-slate-500">الإجمالي المتوقع</span><b className="block text-rose-700">{money(row.grossAmount)}</b></div>
                  <div><span className="text-slate-500">النقد المسجل / القيد</span><b className="block">{money(row.storedCashAmount)} / {money(row.ledgerCashAmount)}</b></div>
                  <div><span className="text-slate-500">الرصيد المسجل</span><b className="block">{money(row.storedBalanceAmount)}</b></div>
                  <div><span className="text-slate-500">إجمالي المرتجع بالفاتورة</span><b className="block">{money(row.invoiceReturnedAmount)}</b></div>
                  <div><span className="text-slate-500">قيد موجود</span><b className="block">{row.ledgerEntryCount ? row.ledgerEntryIds : 'لا يوجد'}</b></div>
                </div>

                <div className="mt-3 rounded-lg bg-slate-50 p-2 text-[10px] text-slate-600">
                  القيد الحالي — مردودات المبيعات: {money(row.ledgerRevenueAmount)} · ضريبة: {money(row.ledgerTaxAmount)} · رصيد العميل: {money(row.ledgerBalanceAmount)}
                  {' · '}الخزينة: {row.registerId || 'غير محددة'} · الوردية: {row.shiftId || 'غير محددة'}
                  {' · '}رقم القيد: {row.ledgerEntryNumbers || 'غير موجود'}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg border border-slate-100 p-2 text-[10px] text-slate-600 sm:grid-cols-4">
                  <div>رصيد العميل الحالي<b className="block text-slate-800">{money(row.customerBalance)}</b></div>
                  <div>المتبقي الحالي على الفاتورة<b className="block text-slate-800">{money(row.invoiceRemainingAmount)}</b></div>
                  <div>رصيد الخزينة الحالي (للمراجعة فقط)<b className="block text-slate-800">{row.cashRegisterBalance == null ? 'غير متاح' : money(row.cashRegisterBalance)}</b></div>
                  <div>إجمالي مردودات الوردية (للمراجعة فقط)<b className="block text-slate-800">{row.shiftTotalRefunds == null ? 'غير متاح' : money(row.shiftTotalRefunds)}</b></div>
                </div>
                {row.ledgerLinesSummary && (
                  <p className="mt-2 break-words rounded-lg bg-slate-50 p-2 text-[10px] text-slate-600">
                    تفاصيل أسطر القيد: {row.ledgerLinesSummary}
                  </p>
                )}
                {ledgerMismatch && (
                  <p className="mt-2 text-[10px] font-bold text-rose-700">
                    اختلاف بين النقد المسجل والقيد؛ لا يمكن اعتمادها آليًا قبل تسوية هذا الاختلاف ومراجعة الخزينة.
                  </p>
                )}

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <label className="text-[10px] font-bold text-slate-600">
                    النقد المؤكد فعليًا
                    <input type="number" min="0" step="0.01" value={form.cash} onChange={(event) => updateForm(row.id, { cash: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs" />
                  </label>
                  <label className="text-[10px] font-bold text-slate-600">
                    الرصيد المؤكد بعد مراجعة الحساب
                    <input type="number" min="0" step="0.01" value={form.balance} onChange={(event) => updateForm(row.id, { balance: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs" />
                  </label>
                  <label className="text-[10px] font-bold text-slate-600">
                    ملاحظة التدقيق / مرجع المستند
                    <input type="text" value={form.notes} onChange={(event) => updateForm(row.id, { notes: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs" />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => approve(row)}
                  disabled={savingId === row.id || !reportReviewId}
                  className="mt-3 rounded-lg bg-amber-700 px-4 py-2 text-[11px] font-bold text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingId === row.id ? 'جارٍ اعتماد التسوية...' : 'اعتماد القيم وإنشاء قيد التصحيح'}
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
