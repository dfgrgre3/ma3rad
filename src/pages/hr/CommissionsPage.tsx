import React, { useEffect, useMemo, useState } from 'react';
import { BadgeDollarSign, Calculator, Check, Banknote, X, Loader2, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { CommissionService, CommissionRow, CommissionStats } from '../../services/CommissionService';
import { useToast } from '../../components/ui/Toast';
import { exportToExcel } from '../../utils/export';

const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n) || 0) + ' ج.م';
const currentMonth = () => new Date().toISOString().slice(0, 7);

const statusStyles: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  APPROVED: 'bg-sky-50 text-sky-700 border-sky-200',
  PAID: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CANCELLED: 'bg-slate-100 text-slate-500 border-slate-200',
};
const statusLabels: Record<string, string> = {
  PENDING: 'قيد الاعتماد', APPROVED: 'معتمدة', PAID: 'مدفوعة', CANCELLED: 'ملغاة',
};

export const CommissionsPage: React.FC = () => {
  const service = useMemo(() => new CommissionService(), []);
  const toast = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [status, setStatus] = useState('ALL');
  const [rows, setRows] = useState<CommissionRow[]>([]);
  const [stats, setStats] = useState<CommissionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const load = () => {
    setLoading(true);
    try {
      setRows(service.getCommissions({ month, status }));
      setStats(service.getStats(month));
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تحميل العمولات.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [month, status]);

  const generate = () => {
    setGenerating(true);
    try {
      const result = service.generateForMonth(month);
      toast.success(
        result.created > 0
          ? `تم إنشاء ${result.created} عمولة بقيمة ${fmt(result.amount)} (تم تجاهل ${result.skipped}).`
          : `لا توجد عمولات جديدة. تم تجاهل ${result.skipped} فاتورة.`
      );
      load();
    } catch (e: any) {
      toast.error(e?.message || 'تعذر احتساب العمولات.');
    } finally {
      setGenerating(false);
    }
  };

  const changeStatus = (row: CommissionRow, next: 'APPROVED' | 'PAID' | 'CANCELLED') => {
    const labels = { APPROVED: 'اعتماد', PAID: 'صرف', CANCELLED: 'إلغاء' };
    if (!confirm(`${labels[next]} عمولة ${row.employeeName} بقيمة ${fmt(row.commissionAmount)}؟`)) return;
    try {
      service.setStatus(row.id, next);
      toast.success(`تم ${labels[next]} العمولة.`);
      load();
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تحديث العمولة.');
    }
  };

  const exportRows = () => {
    exportToExcel({
      title: 'تقرير العمولات', subtitle: `شهر ${month}`, fileName: `commissions-${month}`,
      permission: 'employees.export',
      columns: [
        { key: 'employeeName', label: 'الموظف' }, { key: 'invoiceNumber', label: 'الفاتورة' },
        { key: 'baseAmount', label: 'أساس العمولة' }, { key: 'percentage', label: 'النسبة %' },
        { key: 'commissionAmount', label: 'قيمة العمولة' }, { key: 'status', label: 'الحالة' },
      ],
      rows: rows.map((row) => ({ ...row, status: statusLabels[row.status] })),
    });
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center">
            <BadgeDollarSign className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-base font-black">عمولات المبيعات</h1>
            <p className="text-xs text-slate-500 font-medium">احتساب واعتماد وصرف عمولات مندوبي المبيعات</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold" />
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold">
            <option value="ALL">كل الحالات</option>
            <option value="PENDING">قيد الاعتماد</option>
            <option value="APPROVED">معتمدة</option>
            <option value="PAID">مدفوعة</option>
            <option value="CANCELLED">ملغاة</option>
          </select>
          <button onClick={generate} disabled={generating} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold disabled:opacity-50">
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />} احتساب الشهر
          </button>
          <button onClick={() => load()} className="p-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-600"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
          <button onClick={exportRows} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-teal-600 text-white text-xs font-bold"><FileSpreadsheet className="w-4 h-4" /> Excel</button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-[11px] text-slate-500 font-bold">قيد الاعتماد</p>
            <p className="text-xl font-black mt-1">{fmt(stats?.totalPending || 0)}</p>
            <p className="text-[10px] text-slate-400">{stats?.pending || 0} + {stats?.approved || 0} معتمدة</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-[11px] text-slate-500 font-bold">المدفوع</p>
            <p className="text-xl font-black mt-1 text-emerald-700">{fmt(stats?.totalPaid || 0)}</p>
            <p className="text-[10px] text-slate-400">{stats?.paid || 0} عمولة</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-[11px] text-slate-500 font-bold">إجمالي السجلات</p>
            <p className="text-xl font-black mt-1">{rows.length}</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm text-right">
            <thead className="bg-slate-50 text-[11px] text-slate-500 border-b border-slate-200">
              <tr><th className="px-3 py-3">الموظف</th><th className="px-3 py-3">الفاتورة</th><th className="px-3 py-3">الأساس</th><th className="px-3 py-3">النسبة</th><th className="px-3 py-3">العمولة</th><th className="px-3 py-3">الحالة</th><th className="px-3 py-3">إجراءات</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/70">
                  <td className="px-3 py-2.5 font-bold">{row.employeeName}</td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-slate-500">{row.invoiceNumber || row.sourceId || '—'}</td>
                  <td className="px-3 py-2.5 font-mono">{fmt(row.baseAmount)}</td>
                  <td className="px-3 py-2.5 font-mono">{row.percentage}%</td>
                  <td className="px-3 py-2.5 font-mono font-black">{fmt(row.commissionAmount)}</td>
                  <td className="px-3 py-2.5">
                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${statusStyles[row.status]}`}>{statusLabels[row.status]}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      {row.status === 'PENDING' && <button onClick={() => changeStatus(row, 'APPROVED')} className="p-1.5 rounded-lg text-sky-600 hover:bg-sky-50" title="اعتماد"><Check className="w-4 h-4" /></button>}
                      {row.status === 'APPROVED' && <button onClick={() => changeStatus(row, 'PAID')} className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50" title="صرف"><Banknote className="w-4 h-4" /></button>}
                      {row.status !== 'PAID' && row.status !== 'CANCELLED' && <button onClick={() => changeStatus(row, 'CANCELLED')} className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50" title="إلغاء"><X className="w-4 h-4" /></button>}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && !loading && <tr><td colSpan={7} className="py-12 text-center text-slate-400">لا توجد عمولات لهذا الشهر. اضغط «احتساب الشهر».</td></tr>}
              {loading && <tr><td colSpan={7} className="py-12 text-center"><Loader2 className="w-5 h-5 animate-spin text-indigo-500 mx-auto" /></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
