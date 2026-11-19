import React from 'react';
import { AlertTriangle, Factory } from 'lucide-react';
import { DataTable } from '../../../../components/ui/DataTable';
import { statusBadge } from './OverviewTab';
import type { TabProps } from './OverviewTab';

const PRIORITY_LABEL: Record<string, string> = { LOW: 'منخفضة', MEDIUM: 'متوسطة', HIGH: 'عالية', URGENT: 'عاجلة' };

const isOverdue = (dueDate: string | null) => !!dueDate && dueDate < new Date().toISOString().slice(0, 10);

export const FloorTab: React.FC<TabProps> = ({ data }) => {
  const rows = data.productionFloor || [];
  const inProgress = rows.filter((row) => row.status === 'IN_PROGRESS').length;
  const withShortages = rows.filter((row) => row.materialsShort > 0).length;
  const overdue = rows.filter((row) => isOverdue(row.dueDate)).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-bold text-slate-500">أوامر نشطة</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{rows.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-bold text-slate-500">قيد التنفيذ</p>
          <p className="mt-1 text-2xl font-black text-amber-600">{inProgress}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-bold text-slate-500">بنواقص مواد</p>
          <p className={`mt-1 text-2xl font-black ${withShortages > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{withShortages}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-bold text-slate-500">متجاوزة للاستحقاق</p>
          <p className={`mt-1 text-2xl font-black ${overdue > 0 ? 'text-rose-600' : 'text-slate-900'}`}>{overdue}</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <Factory className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-black text-slate-900">أوامر على أرضية الإنتاج</h3>
        </div>
        {rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-400">لا توجد أوامر صادرة أو قيد التنفيذ حالياً.</p>
        ) : (
          <DataTable
            ariaLabel="أرضية الإنتاج"
            rows={rows}
            rowKey={(row) => row.orderId}
            columns={[
              { key: 'number', header: 'الرقم', render: (row) => <span className="font-mono text-xs">{row.orderNumber}</span> },
              { key: 'product', header: 'المنتج', render: (row) => row.productName },
              { key: 'qty', header: 'الكمية', render: (row) => row.quantity },
              { key: 'priority', header: 'الأولوية', render: (row) => PRIORITY_LABEL[row.priority] || row.priority },
              { key: 'status', header: 'الحالة', render: (row) => statusBadge(row.status) },
              {
                key: 'progress', header: 'التقدم',
                render: (row) => (
                  <div className="w-32">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${row.progressPercent}%` }} />
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {row.opsCompleted}/{row.opsTotal} عملية · {row.progressPercent}%
                    </p>
                  </div>
                ),
              },
              {
                key: 'current', header: 'العملية الحالية',
                render: (row) => row.currentOperation ? (
                  <span className="text-xs text-slate-600">
                    {row.currentOperation.workCenterName || '—'} #{row.currentOperation.sequence}
                    {row.currentOperation.status === 'IN_PROGRESS' && <span className="mr-1 text-amber-600">●</span>}
                  </span>
                ) : '—',
              },
              {
                key: 'materials', header: 'المواد',
                render: (row) => (
                  <span className={`text-xs ${row.materialsShort > 0 ? 'font-bold text-rose-600' : 'text-slate-600'}`}>
                    {Math.round(row.materialsConsumedQty * 10) / 10}/{Math.round(row.materialsPlannedQty * 10) / 10}
                    {row.materialsShort > 0 && (
                      <span className="mr-1 inline-flex items-center gap-0.5 text-rose-600"><AlertTriangle className="h-3 w-3" />{row.materialsShort}</span>
                    )}
                  </span>
                ),
              },
              { key: 'shift', header: 'الوردية', render: (row) => row.operationShiftId ? <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-bold text-indigo-700">مربوطة</span> : '—' },
              {
                key: 'due', header: 'الاستحقاق',
                render: (row) => (
                  <span className={`text-xs ${isOverdue(row.dueDate) ? 'font-bold text-rose-600' : 'text-slate-600'}`}>
                    {row.dueDate || '—'}
                  </span>
                ),
              },
              { key: 'sales', header: 'أمر البيع', render: (row) => row.salesOrderNumber ? <span className="font-mono text-xs">{row.salesOrderNumber}</span> : '—' },
              { key: 'customer', header: 'العميل', render: (row) => row.customerName || '—' },
            ]}
          />
        )}
      </div>
    </div>
  );
};
