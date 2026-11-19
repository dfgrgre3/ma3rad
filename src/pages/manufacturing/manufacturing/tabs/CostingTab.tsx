import React from 'react';
import { DataTable } from '../../../../components/ui/DataTable';
import { Coins } from 'lucide-react';
import type { TabProps } from './OverviewTab';
import { statusBadge } from './OverviewTab';

export const CostingTab: React.FC<TabProps> = ({ data }) => {
  const report = data.costReport;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'إجمالي تكلفة المواد', value: report.totalMaterialCost },
          { label: 'إجمالي تكلفة العمالة', value: report.totalLaborCost },
          { label: 'إجمالي التكلفة', value: report.totalCost, strong: true },
          { label: 'إجمالي الكمية المنتجة', value: report.totalQuantity },
        ].map((kpi) => (
          <div key={kpi.label} className={`rounded-xl border p-4 ${kpi.strong ? 'border-sky-200 bg-sky-50' : 'border-slate-200 bg-white'}`}>
            <div className="text-[11px] font-bold text-slate-500">{kpi.label}</div>
            <div className={`mt-1 text-2xl font-black ${kpi.strong ? 'text-sky-700' : 'text-slate-800'}`}>{Number(kpi.value).toLocaleString()}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="mb-2 flex items-center gap-2">
          <Coins className="h-4 w-4 text-sky-600" />
          <h3 className="text-sm font-black text-slate-900">تكلفة أوامر الإنتاج</h3>
        </div>
        <DataTable
          ariaLabel="تكلفة أوامر الإنتاج"
          rows={report.orders}
          rowKey={(row) => row.orderId}
          columns={[
            { key: 'number', header: 'رقم الأمر', render: (row) => <span className="font-mono text-xs">{row.orderNumber}</span> },
            { key: 'product', header: 'المنتج', render: (row) => row.productName },
            { key: 'qty', header: 'الكمية', render: (row) => row.quantity },
            { key: 'status', header: 'الحالة', render: (row) => statusBadge(row.status) },
            { key: 'material', header: 'المواد', render: (row) => row.materialCost.toLocaleString() },
            { key: 'labor', header: 'العمالة', render: (row) => row.laborCost.toLocaleString() },
            { key: 'total', header: 'الإجمالي', render: (row) => <b>{row.totalCost.toLocaleString()}</b> },
            { key: 'unit', header: 'تكلفة الوحدة', render: (row) => row.costPerUnit.toLocaleString() },
          ]}
          emptyTitle="لا توجد أوامر إنتاج."
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <h3 className="mb-2 text-sm font-black text-slate-900">خطة السعة — مراكز العمل</h3>
        <DataTable
          ariaLabel="خطة السعة"
          rows={data.capacityPlan}
          rowKey={(row) => row.workCenterId}
          columns={[
            { key: 'code', header: 'الرمز', render: (row) => <span className="font-mono text-xs">{row.code}</span> },
            { key: 'name', header: 'مركز العمل', render: (row) => row.name },
            { key: 'capacity', header: 'السعة/يوم (ساعة)', render: (row) => row.capacityPerDay },
            { key: 'orders', header: 'أوامر نشطة', render: (row) => row.activeOrders },
            { key: 'planned', header: 'مخطط (دقيقة)', render: (row) => row.plannedMinutes },
            { key: 'actual', header: 'فعلي (دقيقة)', render: (row) => row.actualMinutes },
            {
              key: 'load', header: 'نسبة الحمل',
              render: (row) => row.loadPercent == null
                ? '—'
                : <span className={`font-bold ${row.loadPercent > 100 ? 'text-rose-600' : row.loadPercent > 80 ? 'text-amber-600' : 'text-emerald-600'}`}>{row.loadPercent}%</span>,
            },
          ]}
          emptyTitle="لا توجد مراكز عمل."
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <h3 className="mb-2 text-sm font-black text-slate-900">كفاءة مراكز العمل</h3>
          <DataTable
            ariaLabel="كفاءة مراكز العمل"
            rows={data.analytics.workCenterEfficiency}
            rowKey={(row) => row.workCenterId}
            dense
            columns={[
              { key: 'name', header: 'المركز', render: (row) => row.name },
              { key: 'planned', header: 'مخطط (د)', render: (row) => row.plannedMinutes },
              { key: 'actual', header: 'فعلي (د)', render: (row) => row.actualMinutes },
              { key: 'ops', header: 'عمليات', render: (row) => row.completedOperations },
              {
                key: 'eff', header: 'الكفاءة',
                render: (row) => row.efficiencyPercent == null ? '—' : <b className={row.efficiencyPercent >= 100 ? 'text-emerald-600' : 'text-amber-600'}>{row.efficiencyPercent}%</b>,
              },
            ]}
            emptyTitle="لا توجد بيانات."
          />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <h3 className="mb-2 text-sm font-black text-slate-900">انحراف وقت العمل — الأوامر المكتملة</h3>
          <DataTable
            ariaLabel="انحراف وقت العمل"
            rows={data.analytics.orderVariance}
            rowKey={(row) => row.orderId}
            dense
            columns={[
              { key: 'number', header: 'الأمر', render: (row) => <span className="font-mono text-xs">{row.orderNumber}</span> },
              { key: 'product', header: 'المنتج', render: (row) => row.productName },
              { key: 'planned', header: 'مخطط', render: (row) => row.plannedMinutes },
              { key: 'actual', header: 'فعلي', render: (row) => row.actualMinutes },
              {
                key: 'var', header: 'الانحراف',
                render: (row) => row.variancePercent == null ? '—' : <b className={row.variancePercent >= 0 ? 'text-emerald-600' : 'text-rose-600'}>{row.variancePercent > 0 ? '+' : ''}{row.variancePercent}%</b>,
              },
            ]}
            emptyTitle="لا توجد أوامر مكتملة."
          />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <h3 className="mb-2 text-sm font-black text-slate-900">الإنتاج الشهري</h3>
          <DataTable
            ariaLabel="الإنتاج الشهري"
            rows={data.analytics.monthlyOutput}
            rowKey={(row) => row.month}
            dense
            columns={[
              { key: 'month', header: 'الشهر', render: (row) => row.month },
              { key: 'orders', header: 'أوامر', render: (row) => row.orders },
              { key: 'qty', header: 'الكمية', render: (row) => row.quantity },
              { key: 'cost', header: 'التكلفة', render: (row) => row.totalCost.toLocaleString() },
            ]}
            emptyTitle="لا توجد إنتاج مكتمل."
          />
        </div>
      </div>
    </div>
  );
};
