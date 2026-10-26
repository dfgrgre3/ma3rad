import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Lock,
  Unlock,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  ShieldAlert,
  Loader2,
  RefreshCw,
  Plus,
  BookOpen,
} from 'lucide-react';
import { FinanceEnterpriseService } from '../../services/FinanceEnterpriseService';
import type { FiscalYear, FiscalPeriod } from '../../types/finance';
import { useToast } from '../../components/ui/Toast';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';

export const FiscalClosingPage: React.FC = () => {
  const service = useMemo(() => new FinanceEnterpriseService(), []);
  const toast = useToast();
  const actor = AuthService.getCurrentUser();
  const canManage = PermissionService.can(actor, 'finance.approve');
  const canClose = PermissionService.can(actor, 'finance.close');
  const canReopen = PermissionService.can(actor, 'finance.reopen');

  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<string>('');
  const [periods, setPeriods] = useState<FiscalPeriod[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showYearModal, setShowYearModal] = useState(false);
  const [yearForm, setYearForm] = useState({ yearCode: '', name: '', startDate: '', endDate: '' });

  const [closePeriodTarget, setClosePeriodTarget] = useState<FiscalPeriod | null>(null);
  const [closePeriodNotes, setClosePeriodNotes] = useState('');

  const [reopenPeriodTarget, setReopenPeriodTarget] = useState<FiscalPeriod | null>(null);
  const [reopenReason, setReopenReason] = useState('');

  const [closeYearTarget, setCloseYearTarget] = useState<FiscalYear | null>(null);
  const [retainedEarningsAccount, setRetainedEarningsAccount] = useState('3102');

  const [actionBusy, setActionBusy] = useState(false);

  const loadData = () => {
    setLoading(true);
    try {
      const years = service.getFiscalYears();
      setFiscalYears(years);
      const activeYear = selectedYearId || years[0]?.id || '';
      setSelectedYearId(activeYear);
      if (activeYear) {
        setPeriods(service.getFiscalPeriods(activeYear));
      }
    } catch (err: any) {
      toast.error(err?.message || 'تعذر تحميل بيانات الفترات المالية.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedYearId) {
      try {
        setPeriods(service.getFiscalPeriods(selectedYearId));
      } catch (err: any) {
        toast.error(err?.message || 'تعذر تحميل فترات السنة المالية.');
      }
    }
  }, [selectedYearId]);

  const handleCreateYear = (e: React.FormEvent) => {
    e.preventDefault();
    setActionBusy(true);
    try {
      service.createFiscalYear(yearForm);
      toast.success('تم إنشاء السنة المالية وفتراتها الشهرية بنجاح.');
      setShowYearModal(false);
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر إنشاء السنة المالية.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleClosePeriod = () => {
    if (!closePeriodTarget) return;
    setActionBusy(true);
    try {
      service.closePeriod(closePeriodTarget.id, closePeriodNotes);
      toast.success(`تم إقفال الفترة ${closePeriodTarget.name} بنجاح وقفل تاريخ القيود.`);
      setClosePeriodTarget(null);
      setClosePeriodNotes('');
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر إقفال الفترة.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleReopenPeriod = () => {
    if (!reopenPeriodTarget) return;
    setActionBusy(true);
    try {
      service.reopenPeriod(reopenPeriodTarget.id, reopenReason);
      toast.success(`تم إعادة فتح الفترة ${reopenPeriodTarget.name}.`);
      setReopenPeriodTarget(null);
      setReopenReason('');
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر إعادة فتح الفترة.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleCloseYear = () => {
    if (!closeYearTarget) return;
    setActionBusy(true);
    try {
      const closingEntryId = service.closeFiscalYear(closeYearTarget.id, retainedEarningsAccount);
      toast.success(`تم الإقفال السنوي وترحيل الأرباح والخسائر بنجاح (رقم القيد: ${closingEntryId || 'مكتمل'}).`);
      setCloseYearTarget(null);
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر إقفال السنة المالية.');
    } finally {
      setActionBusy(false);
    }
  };

  const currentYearObj = fiscalYears.find((y) => y.id === selectedYearId);

  return (
    <div className="p-6 bg-slate-50 min-h-screen text-slate-900 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">الإقفال المالي وإدارة الفترات المحاسبية</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                إدارة الفترات الشهرية، إقفال الدورة المستندية، منع التعديل على الحسابات المقفلة، وقيد الإقفال السنوي
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            className="p-2.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
            title="تحديث البيانات"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          {canManage && <button
            onClick={() => {
              const nextYear = new Date().getFullYear() + 1;
              setYearForm({
                yearCode: `FY${nextYear}`,
                name: `السنة المالية ${nextYear}`,
                startDate: `${nextYear}-01-01`,
                endDate: `${nextYear}-12-31`,
              });
              setShowYearModal(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>سنة مالية جديدة</span>
          </button>}
        </div>
      </div>

      {/* Year Selector & Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <label className="block text-xs font-medium text-slate-500 mb-1.5">اختر السنة المالية</label>
          <select
            value={selectedYearId}
            onChange={(e) => setSelectedYearId(e.target.value)}
            className="w-full text-sm font-semibold border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 bg-slate-50"
          >
            {fiscalYears.map((fy) => (
              <option key={fy.id} value={fy.id}>
                {fy.name} ({fy.yearCode}) - {fy.status === 'OPEN' ? '🟢 مفتوحة' : '🔒 مقفلة'}
              </option>
            ))}
          </select>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 block">حالة السنة المالية</span>
            <span className={`text-sm font-bold ${currentYearObj?.status === 'OPEN' ? 'text-emerald-600' : 'text-slate-600'}`}>
              {currentYearObj?.status === 'OPEN' ? 'مفتوحة للعمليات' : 'مقفلة بالكامل'}
            </span>
          </div>
          {currentYearObj?.status === 'OPEN' ? (
            canClose ? <button
              onClick={() => setCloseYearTarget(currentYearObj)}
              className="px-3 py-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg text-xs font-semibold transition"
            >
              إقفال السنة السنوي
            </button> : <span className="text-xs text-slate-400">الإقفال يتطلب صلاحية مستقلة</span>
          ) : (
            <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md font-medium">
              قيد الإقفال مُرحّل
            </span>
          )}
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 block">الفترات المقفلة</span>
            <span className="text-lg font-bold text-slate-800">
              {periods.filter((p) => p.status === 'CLOSED' || p.status === 'LOCKED').length} / {periods.length}
            </span>
          </div>
          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold">
            <Lock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 block">الفترات النشطة</span>
            <span className="text-lg font-bold text-emerald-600">
              {periods.filter((p) => p.status === 'OPEN').length} فترة
            </span>
          </div>
          <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 font-bold">
            <Unlock className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Periods Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800">الفترات المحاسبية الشهرية للسنة المالية المحددة</h2>
          <span className="text-xs text-slate-400">أي فترة مقفلة تمنع تلقائياً أي ترحيل محاسبي بأثر رجعي</span>
        </div>

        {loading ? (
          <div className="p-12 flex justify-center items-center text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-500 ml-2" />
            <span>جاري تحميل بيانات الفترات...</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="p-3.5 font-semibold">رقم الفترة</th>
                  <th className="p-3.5 font-semibold">اسم الفترة</th>
                  <th className="p-3.5 font-semibold">تاريخ البداية</th>
                  <th className="p-3.5 font-semibold">تاريخ النهاية</th>
                  <th className="p-3.5 font-semibold">الحالة</th>
                  <th className="p-3.5 font-semibold">ملاحظات الإقفال</th>
                  <th className="p-3.5 font-semibold text-center">الإجراءات والضوابط</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {periods.map((p) => {
                  const isClosed = p.status === 'CLOSED' || p.status === 'LOCKED';
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/70 transition">
                      <td className="p-3.5 font-bold text-slate-700">#{p.periodNumber}</td>
                      <td className="p-3.5 font-semibold text-slate-800">{p.name}</td>
                      <td className="p-3.5 text-slate-600 font-mono">{p.startDate}</td>
                      <td className="p-3.5 text-slate-600 font-mono">{p.endDate}</td>
                      <td className="p-3.5">
                        {isClosed ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-700 rounded-md font-semibold text-[11px]">
                            <Lock className="w-3 h-3 text-slate-500" />
                            مقفلة (محظور الترحيل)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-md font-semibold text-[11px]">
                            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                            مفتوحة للعمليات
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 text-slate-500 max-w-xs truncate">{p.closingNotes || '-'}</td>
                      <td className="p-3.5 text-center">
                        {isClosed ? (
                          canReopen ? (
                          <button
                            onClick={() => setReopenPeriodTarget(p)}
                            className="px-3 py-1 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg text-xs font-semibold transition"
                          >
                            إعادة فتح لضرورة
                          </button>
                          ) : <span className="text-slate-400">إعادة الفتح غير مصرح</span>
                        ) : (
                          canClose ? <button
                            onClick={() => setClosePeriodTarget(p)}
                            className="px-3 py-1 bg-slate-800 text-white hover:bg-slate-900 rounded-lg text-xs font-semibold transition"
                          >
                            إقفال الفترة
                          </button> : <span className="text-slate-400">الإقفال غير مصرح</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: New Fiscal Year */}
      {showYearModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-800 mb-4">إنشاء سنة مالية جديدة</h3>
            <form onSubmit={handleCreateYear} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-600 mb-1 font-medium">كود السنة المالية (مثال: FY2026)</label>
                <input
                  type="text"
                  required
                  value={yearForm.yearCode}
                  onChange={(e) => setYearForm({ ...yearForm, yearCode: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl p-2.5"
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-1 font-medium">اسم السنة المالية</label>
                <input
                  type="text"
                  required
                  value={yearForm.name}
                  onChange={(e) => setYearForm({ ...yearForm, name: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl p-2.5"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 mb-1 font-medium">تاريخ البداية</label>
                  <input
                    type="date"
                    required
                    value={yearForm.startDate}
                    onChange={(e) => setYearForm({ ...yearForm, startDate: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl p-2.5"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1 font-medium">تاريخ النهاية</label>
                  <input
                    type="date"
                    required
                    value={yearForm.endDate}
                    onChange={(e) => setYearForm({ ...yearForm, endDate: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl p-2.5"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowYearModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-medium"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={actionBusy}
                  className="px-5 py-2 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 disabled:opacity-50"
                >
                  {actionBusy ? 'جاري الإنشاء...' : 'تأكيد وحفظ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Close Period */}
      {closePeriodTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-slate-200">
            <div className="flex items-center gap-2.5 text-slate-800 font-bold mb-3">
              <Lock className="w-5 h-5 text-slate-700" />
              <span>إقفال الفترة المحاسبية ({closePeriodTarget.name})</span>
            </div>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              عند الإقفال، سيتم حظر تسجيل أي قيود يومية أو فواتير أو سندات قبض وسداد تقع ضمن تواريخ هذه الفترة
              ({closePeriodTarget.startDate} إلى {closePeriodTarget.endDate}).
            </p>
            <div className="mb-4">
              <label className="block text-xs font-medium text-slate-700 mb-1">ملاحظات الإقفال أو رقم محضر المطابقة</label>
              <textarea
                value={closePeriodNotes}
                onChange={(e) => setClosePeriodNotes(e.target.value)}
                placeholder="تمت مطابقة الصندوق والبنوك والعملاء..."
                className="w-full border border-slate-200 rounded-xl p-2.5 text-xs h-20"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setClosePeriodTarget(null)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-medium text-xs"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={actionBusy}
                onClick={handleClosePeriod}
                className="px-5 py-2 bg-slate-900 text-white rounded-xl font-semibold hover:bg-slate-800 disabled:opacity-50 text-xs"
              >
                {actionBusy ? 'جاري الإقفال...' : 'تأكيد الإقفال'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Reopen Period */}
      {reopenPeriodTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-slate-200">
            <div className="flex items-center gap-2.5 text-amber-800 font-bold mb-3">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <span>إعادة فتح الفترة ({reopenPeriodTarget.name})</span>
            </div>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              إعادة فتح فترة مقفلة هو إجراء رقابي دقيق. يجب كتابة سبب الإجراء لتوثيقه في سجل التدقيق والمحاضر الرقابية.
            </p>
            <div className="mb-4">
              <label className="block text-xs font-medium text-slate-700 mb-1">سبب إعادة الفتح (إلزامي)</label>
              <textarea
                required
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                placeholder="إضافة قيد تسوية ضريبي بناء على توجيه الإدارة..."
                className="w-full border border-slate-200 rounded-xl p-2.5 text-xs h-20"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReopenPeriodTarget(null)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-medium text-xs"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={actionBusy || !reopenReason.trim()}
                onClick={handleReopenPeriod}
                className="px-5 py-2 bg-amber-600 text-white rounded-xl font-semibold hover:bg-amber-700 disabled:opacity-50 text-xs"
              >
                {actionBusy ? 'جاري الفتح...' : 'تأكيد إعادة الفتح'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Close Fiscal Year Wizard */}
      {closeYearTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl border border-slate-200">
            <div className="flex items-center gap-2.5 text-rose-800 font-bold mb-3">
              <ShieldAlert className="w-5 h-5 text-rose-600" />
              <span>الإقفال السنوي وترحيل الأرباح ({closeYearTarget.name})</span>
            </div>
            <div className="text-xs text-slate-600 space-y-2 mb-4 leading-relaxed bg-rose-50/50 p-3.5 rounded-xl border border-rose-100">
              <p className="font-semibold text-rose-900">سيقوم النظام آلياً بالآتي:</p>
              <ul className="list-disc list-inside space-y-1 text-slate-700">
                <li>إقفال كافة الفترات الشهرية الـ 12 المتبقية.</li>
                <li>تصفير كافة حسابات الإيرادات والمصروفات للسنة المالية.</li>
                <li>توليد قيد يومية آلي متوازن ينقل صافي الربح أو الخسارة إلى حساب الأرباح المرحلة.</li>
                <li>تأمين السنة المالية نهائياً.</li>
              </ul>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-medium text-slate-700 mb-1">كود حساب الأرباح والخسائر المرحلة (المدورة)</label>
              <input
                type="text"
                value={retainedEarningsAccount}
                onChange={(e) => setRetainedEarningsAccount(e.target.value)}
                className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-mono font-semibold"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">الحساب الافتراضي: 3102 - أرباح وخسائر مرحلة</span>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCloseYearTarget(null)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-medium text-xs"
              >
                تراجع
              </button>
              <button
                type="button"
                disabled={actionBusy}
                onClick={handleCloseYear}
                className="px-5 py-2 bg-rose-700 text-white rounded-xl font-semibold hover:bg-rose-800 disabled:opacity-50 text-xs shadow-md"
              >
                {actionBusy ? 'جاري الإقفال والترحيل...' : 'تأكيد الإقفال السنوي النهائي'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
