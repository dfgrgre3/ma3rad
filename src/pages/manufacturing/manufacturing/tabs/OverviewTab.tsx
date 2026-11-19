import React from 'react';
import { DataTable } from '../../../../components/ui/DataTable';
import type { ManufacturingService } from '../../../../services/domains/manufacturing/ManufacturingService';
import type { ManufacturingData } from '../ManufacturingPage';

interface ToastApi { success: (message: string) => void; error: (message: string) => void }
export interface TabProps {
  service: ManufacturingService;
  data: ManufacturingData;
  reload: () => void;
  canManage: boolean;
  toast: ToastApi;
}

const ORDER_STATUS: Record<string, { label: string; className: string }> = {
  PLANNED: { label: 'مخطط', className: 'bg-slate-100 text-slate-600' },
  RELEASED: { label: 'صادر', className: 'bg-sky-100 text-sky-700' },
  IN_PROGRESS: { label: 'قيد التنفيذ', className: 'bg-amber-100 text-amber-700' },
  COMPLETED: { label: 'مكتمل', className: 'bg-emerald-100 text-emerald-700' },
  CANCELLED: { label: 'ملغى', className: 'bg-rose-100 text-rose-700' },
};

export const statusBadge = (status: string) => {
  const meta = ORDER_STATUS[status] || { label: status, className: 'bg-slate-100 text-slate-600' };
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${meta.className}`}>{meta.label}</span>;
};

const PRIORITY_LABEL: Record<string, string> = { LOW: 'منخفضة', MEDIUM: 'متوسطة', HIGH: 'عالية', URGENT: 'عاجلة' };

export const OverviewTab: React.FC<TabProps> = ({ data }) => {
  const orders = data.orders;
  const active = orders.filter((o) => ['RELEASED', 'IN_PROGRESS'].includes(o.status));
  const planned = orders.filter((o) => o.status === 'PLANNED');
  const completed = orders.filter((o) => o.status === 'COMPLETED');
  const today = new Date().toISOString().slice(0, 10);
  const delayed = orders.filter((o) => o.dueDate && o.dueDate < today && !['COMPLETED', 'CANCELLED'].includes(o.status));
  const overloaded = data.capacityPlan.filter((row) => (row.loadPercent ?? 0) > 100);

  const kpis = [
    { label: 'أوامر نشطة', value: active.length, tone: 'text-sky-600' },
    { label: 'أوامر مخططة', value: planned.length, tone: 'text-slate-700' },
    { label: 'أوامر متأخرة', value: delayed.length, tone: delayed.length ? 'text-rose-600' : 'text-emerald-600' },
    { label: 'إجمالي المكتملة', value: completed.length, tone: 'text-emerald-600' },
    { label: 'تكلفة WIP (مواد)', value: data.wip.totalMaterialCost.toLocaleString(), tone: 'text-amber-600' },
    { label: 'مراكز فوق الطاقة', value: overloaded.length, tone: overloaded.length ? 'text-rose-600' : 'text-emerald-600' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-[11px] font-bold text-slate-500">{kpi.label}</div>
            <div className={`mt-1 text-2xl font-black ${kpi.tone}`}>{kpi.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <h3 className="mb-2 text-sm font-black text-slate-900">أحدث أوامر الإنتاج</h3>
          <DataTable
            ariaLabel="أحدث أوامر الإنتاج"
            rows={orders.slice(0, 8)}
            rowKey={(row) => row.id}
            dense
            columns={[
              { key: 'number', header: 'الرقم', render: (row) => <span className="font-mono text-xs">{row.orderNumber}</span> },
              { key: 'product', header: 'المنتج', render: (row) => row.productName },
              { key: 'qty', header: 'الكمية', render: (row) => row.quantity },
              { key: 'priority', header: 'الأولوية', render: (row) => PRIORITY_LABEL[row.priority] || row.priority },
              { key: 'status', header: 'الحالة', render: (row) => statusBadge(row.status) },
              { key: 'due', header: 'الاستحقاق', render: (row) => row.dueDate || '—' },
            ]}
            emptyTitle="لا توجد أوامر إنتاج."
          />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <h3 className="mb-2 text-sm font-black text-slate-900">حمل مراكز العمل</h3>
          <DataTable
            ariaLabel="حمل مراكز العمل"
            rows={data.capacityPlan}
            rowKey={(row) => row.workCenterId}
            dense
            columns={[
              { key: 'name', header: 'مركز العمل', render: (row) => row.name },
              { key: 'orders', header: 'أوامر', render: (row) => row.activeOrders },
              { key: 'planned', header: 'مخطط (دقيقة)', render: (row) => row.plannedMinutes },
              { key: 'actual', header: 'فعلي (دقيقة)', render: (row) => row.actualMinutes },
              {
                key: 'load', header: 'النسبة',
                render: (row) => row.loadPercent == null
                  ? '—'
                  : <span className={`font-bold ${row.loadPercent > 100 ? 'text-rose-600' : row.loadPercent > 80 ? 'text-amber-600' : 'text-emerald-600'}`}>{row.loadPercent}%</span>,
              },
            ]}
            emptyTitle="لا توجد مراكز عمل."
          />
        </div>
      </div>
    </div>
  );
};
