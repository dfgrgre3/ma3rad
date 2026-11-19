import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { PageHeader } from '../../../components/ui/PageHeader';
import { BadgeDollarSign, Calculator, Check, Banknote, X, Loader2, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { CommissionService, CommissionRow, CommissionStats } from '../../../services/domains/hr/CommissionService';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { useToast } from '../../../components/ui/Toast';
import { exportToExcel } from '../../../utils/export/export';

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
  const actor = AuthService.getCurrentUser();
  const canManagePayroll = PermissionService.canAny(actor, ['employees.payroll.manage', 'employees.manage']);
  const canApprovePayroll = PermissionService.canAny(actor, ['employees.payroll.approve', 'employees.manage']);
  const [month, setMonth] = useState(currentMonth());
  const [status, setStatus] = useState('ALL');
  const [rows, setRows] = useState<CommissionRow[]>([]);
  const [stats, setStats] = useState<CommissionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    try {
      setRows(service.getCommissions({ month, status }));
      setStats(service.getStats(month));
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تحميل العمولات.');
    } finally {
      setLoading(false);
    }
  }, [service, month, status, setLoading, setRows, setStats, toast]);

  useEffect(() => { load();   }, [load, month, status]);

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
      permission: 'employees.payroll.view',
      columns: [
        { key: 'employeeName', label: 'الموظف' }, { key: 'invoiceNumber', label: 'الفاتورة' },
        { key: 'baseAmount', label: 'أساس العمولة' }, { key: 'percentage', label: 'النسبة %' },
        { key: 'commissionAmount', label: 'قيمة العمولة' }, { key: 'status', label: 'الحالة' },
      ],
      rows: rows.map((row) => ({ ...row, status: statusLabels[row.status] })),
    });
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden">
      <div className="bg-white px-6 pt-4">
        <PageHeader
          icon={<BadgeDollarSign className="h-5 w-5" />}
          title="عمولات المبيعات"
          description="احتساب واعتماد وصرف عمولات مندوبي المبيعات"
          actions={<>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold" />
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold">
              <option value="ALL">كل الحالات</option>
              <option value="PENDING">قيد الاعتماد</option>
              <option value="APPROVED">معتمدة</option>
              <option value="PAID">مدفوعة</option>
              <option value="CANCELLED">ملغاة</option>
            </select>
            {canManagePayroll && <button onClick={generate} disabled={generating} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold disabled:opacity-50">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />} احتساب الشهر
            </button>}
            <button onClick={() => load()} className="p-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-600"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
            <button onClick={exportRows} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-teal-600 text-white text-xs font-bold"><FileSpreadsheet className="w-4 h-4" /> جدول بيانات</button>
          </>}
        />
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
          <DataTable
              ariaLabel="عمولات الموظفين"
              rows={rows}
              rowKey={(row: any) => String(row.id)}
              tableClassName="text-sm"
              columns={[
                { key: 'emp', header: 'الموظف', render: (row: any) => <span className="font-bold">{row.employeeName}</span> },
                { key: 'invoice', header: 'الفاتورة', render: (row: any) => <span className="font-mono text-[11px] text-slate-500">{row.invoiceNumber || row.sourceId || '—'}</span> },
                { key: 'base', header: 'الأساس', render: (row: any) => <span className="font-mono">{fmt(row.baseAmount)}</span> },
                { key: 'pct', header: 'النسبة', render: (row: any) => <span className="font-mono">{row.percentage}%</span> },
                { key: 'comm', header: 'العمولة', render: (row: any) => <span className="font-mono font-black">{fmt(row.commissionAmount)}</span> },
                {
                  key: 'status', header: 'الحالة',
                  render: (row: any) => <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${statusStyles[row.status]}`}>{statusLabels[row.status]}</span>,
                },
                {
                  key: 'actions', header: 'إجراءات',
                  render: (row: any) => (
                    <span className="flex items-center gap-1">
                      {canApprovePayroll && row.status === 'PENDING' && <button onClick={() => changeStatus(row, 'APPROVED')} className="rounded-lg p-1.5 text-sky-600 hover:bg-sky-50" title="اعتماد"><Check className="h-4 w-4" /></button>}
                      {canApprovePayroll && row.status === 'APPROVED' && <button onClick={() => changeStatus(row, 'PAID')} className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50" title="صرف"><Banknote className="h-4 w-4" /></button>}
                      {canManagePayroll && row.status !== 'PAID' && row.status !== 'CANCELLED' && <button onClick={() => changeStatus(row, 'CANCELLED')} className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50" title="إلغاء"><X className="h-4 w-4" /></button>}
                    </span>
                  ),
                },
              ]}
              loading={loading}
              emptyTitle="لا توجد عمولات لهذا الشهر. اضغط «احتساب الشهر»."
            />
        </div>
      </div>
    </div>
  );
};
