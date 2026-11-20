import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import {
  HistoricalReturnReconciliationService,
  type HistoricalReturnCandidate,
} from '../../../services/domains/sales/HistoricalReturnReconciliationService';

type ApprovalForm = {
  cash: string;
  balance: string;
  taxPreviouslyIncluded: '' | 'yes' | 'no';
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

  const load = useCallback((preserveReportReview = false) => {
    setLoading(true);
    setError(null);
    if (!preserveReportReview) {
      setReportReviewId(null);
      setForms({});
    }
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
      const previous = current[id] || { cash: '', balance: '', taxPreviouslyIncluded: '', notes: '' };
      return { ...current, [id]: { ...previous, ...patch } };
    });
  };

  const approve = (candidate: HistoricalReturnCandidate) => {
    if (!reportReviewId) {
      setError('احفظ تقرير الفروقات وراجعه قبل اعتماد أي تسوية.');
      return;
    }
    const form = forms[candidate.id] || { cash: '', balance: '', taxPreviouslyIncluded: '', notes: '' };
    if (!form.cash || !form.balance || !form.taxPreviouslyIncluded) {
      setError('أدخل المبلغين المؤكدين وحدد هل خُصمت الضريبة سابقًا من مشتريات العميل بعد مراجعة المستندات.');
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
        taxAlreadyIncludedInCustomerPurchases: form.taxPreviouslyIncluded === 'yes',
        notes: form.notes,
      });
      setNotice(`تم اعتماد تسوية ${candidate.returnNumber}. لم تُعدّل حركة النقد التاريخية.`);
      setForms((current) => {
        const next = { ...current };
        delete next[candidate.id];
        return next;
      });
      load(true);
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
      setForms({});
      setReportReviewId(reviewId);
      setNotice('تم حفظ تقرير الفروقات في سجل التدقيق. راجعه قبل اعتماد أي تسوية.');
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : String(reviewError));
    }
  };

  return (
    <section className="mb-5 rounded-2xl border border-warning bg-surface p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-ink">مراجعة المرتجعات التاريخية قبل التسوية</h2>
          <p className="mt-1 max-w-4xl text-[11px] leading-relaxed text-ink-secondary">
            الضريبة محسوبة تناسبيًا من الفاتورة الأصلية للعرض فقط. لا تُعدّل الخزينة أو الوردية أو القيد التاريخي تلقائيًا؛
            أثبت النقد والرصيد وحدد من مستندات الإصدار السابق هل خُصمت الضريبة من مشتريات العميل، ثم يُسجل أي قيد تصحيح بتاريخ اليوم.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => load()} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-bold text-ink hover:bg-surface-muted disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> تحديث
          </button>
          <button type="button" onClick={saveReportReview} disabled={loading} className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white hover:bg-primary disabled:opacity-50">
            حفظ تقرير الفروقات للمراجعة
          </button>
        </div>
      </div>

      {error && <div className="mb-3 flex items-start gap-2 rounded-xl border border-danger-border bg-danger-soft p-3 text-xs text-danger"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
      {notice && <div className="mb-3 flex items-start gap-2 rounded-xl border border-success-border bg-success-soft p-3 text-xs text-success"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{notice}</div>}
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-warning" /></div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl bg-success-soft p-4 text-center text-xs font-semibold text-success">لا توجد مرتجعات تاريخية بانتظار المراجعة.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const form = forms[row.id] || { cash: '', balance: '', taxPreviouslyIncluded: '', notes: '' };
            const ledgerMismatch = Math.abs(row.ledgerCashAmount - row.storedCashAmount) > 0.01;
            return (
              <article key={row.id} className="rounded-xl border border-line p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-black text-ink">{row.returnNumber} · {row.customerName}</h3>
                    <p className="mt-0.5 text-[10px] text-muted">الفاتورة {row.invoiceNumber} · {row.returnDate}</p>
                  </div>
                  <span className="rounded-full bg-warning-soft px-2.5 py-1 text-[10px] font-bold text-warning">الضريبة غير مسجلة</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10px] sm:grid-cols-4 lg:grid-cols-7">
                  <div><span className="text-muted">صافي المرتجع</span><b className="block text-ink">{money(row.netAmount)}</b></div>
                  <div><span className="text-muted">الضريبة المحسوبة للعرض</span><b className="block text-warning">{money(row.calculatedTax)}</b></div>
                  <div><span className="text-muted">الإجمالي المتوقع</span><b className="block text-danger">{money(row.grossAmount)}</b></div>
                  <div><span className="text-muted">النقد المسجل / القيد</span><b className="block">{money(row.storedCashAmount)} / {money(row.ledgerCashAmount)}</b></div>
                  <div><span className="text-muted">الرصيد المسجل</span><b className="block">{money(row.storedBalanceAmount)}</b></div>
                  <div><span className="text-muted">إجمالي المرتجع بالفاتورة</span><b className="block">{money(row.invoiceReturnedAmount)}</b></div>
                  <div><span className="text-muted">قيد موجود</span><b className="block">{row.ledgerEntryCount ? row.ledgerEntryIds : 'لا يوجد'}</b></div>
                </div>

                <div className="mt-3 rounded-lg bg-surface-muted p-2 text-[10px] text-ink-secondary">
                  القيد الحالي — مردودات المبيعات: {money(row.ledgerRevenueAmount)} · ضريبة: {money(row.ledgerTaxAmount)} · رصيد العميل: {money(row.ledgerBalanceAmount)}
                  {' · '}الخزينة: {row.registerId || 'غير محددة'} · الوردية: {row.shiftId || 'غير محددة'}
                  {' · '}رقم القيد: {row.ledgerEntryNumbers || 'غير موجود'}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg border border-line p-2 text-[10px] text-ink-secondary sm:grid-cols-4">
                  <div>رصيد العميل الحالي<b className="block text-ink">{money(row.customerBalance)}</b></div>
                  <div>المتبقي الحالي على الفاتورة<b className="block text-ink">{money(row.invoiceRemainingAmount)}</b></div>
                  <div>رصيد الخزينة الحالي (للمراجعة فقط)<b className="block text-ink">{row.cashRegisterBalance == null ? 'غير متاح' : money(row.cashRegisterBalance)}</b></div>
                  <div>إجمالي مردودات الوردية (للمراجعة فقط)<b className="block text-ink">{row.shiftTotalRefunds == null ? 'غير متاح' : money(row.shiftTotalRefunds)}</b></div>
                </div>
                {row.ledgerLinesSummary && (
                  <p className="mt-2 break-words rounded-lg bg-surface-muted p-2 text-[10px] text-ink-secondary">
                    تفاصيل أسطر القيد: {row.ledgerLinesSummary}
                  </p>
                )}
                {ledgerMismatch && (
                  <p className="mt-2 text-[10px] font-bold text-danger">
                    اختلاف بين النقد المسجل والقيد؛ لا يمكن اعتمادها آليًا قبل تسوية هذا الاختلاف ومراجعة الخزينة.
                  </p>
                )}

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-4">
                  <label className="text-[10px] font-bold text-ink-secondary">
                    النقد المؤكد فعليًا
                    <input type="number" min="0" step="0.01" value={form.cash} onChange={(event) => updateForm(row.id, { cash: event.target.value })} className="mt-1 w-full rounded-lg border border-line-strong px-2.5 py-2 text-xs" />
                  </label>
                  <label className="text-[10px] font-bold text-ink-secondary">
                    الرصيد المؤكد بعد مراجعة الحساب
                    <input type="number" min="0" step="0.01" value={form.balance} onChange={(event) => updateForm(row.id, { balance: event.target.value })} className="mt-1 w-full rounded-lg border border-line-strong px-2.5 py-2 text-xs" />
                  </label>
                  <label className="text-[10px] font-bold text-ink-secondary">
                    هل خُصمت الضريبة مسبقًا من مشتريات العميل؟
                    <select
                      value={form.taxPreviouslyIncluded}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (value === '' || value === 'yes' || value === 'no') {
                          updateForm(row.id, { taxPreviouslyIncluded: value });
                        }
                      }}
                      className="mt-1 w-full rounded-lg border border-line-strong px-2.5 py-2 text-xs"
                    >
                      <option value="">حدد من مستندات الإصدار السابق</option>
                      <option value="yes">نعم، خُصمت بالفعل (لا تخصمها مجددًا)</option>
                      <option value="no">لا، لم تُخصم (اخصمها الآن)</option>
                    </select>
                  </label>
                  <label className="text-[10px] font-bold text-ink-secondary">
                    ملاحظة التدقيق / مرجع المستند
                    <input type="text" value={form.notes} onChange={(event) => updateForm(row.id, { notes: event.target.value })} className="mt-1 w-full rounded-lg border border-line-strong px-2.5 py-2 text-xs" />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => approve(row)}
                  disabled={savingId === row.id || !reportReviewId}
                  className="mt-3 rounded-lg bg-warning px-4 py-2 text-[11px] font-bold text-white hover:bg-warning disabled:cursor-not-allowed disabled:opacity-50"
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
