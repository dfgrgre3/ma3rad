import React from 'react';
import { DataTable } from '../../../../components/ui/DataTable';
import { exportToExcel } from '../../../../utils/export/export';
import { Coins, Download, FlaskConical, Wrench } from 'lucide-react';
import { ManufacturingService } from '../../../../services/domains/manufacturing/ManufacturingService';
import type { TabProps } from './OverviewTab';
import { statusBadge } from './OverviewTab';

const STATUS_LABEL: Record<string, string> = {
  PLANNED: 'مخطط', RELEASED: 'صادر', IN_PROGRESS: 'قيد التنفيذ', COMPLETED: 'مكتمل', CANCELLED: 'ملغى',
};

export const CostingTab: React.FC<TabProps> = ({ data }) => {
  const report = data.costReport;
  const service = React.useMemo(() => new ManufacturingService(), []);
  const [simOrderId, setSimOrderId] = React.useState('');
  const [simScale, setSimScale] = React.useState('1');
  const [simRows, setSimRows] = React.useState<any[] | null>(null);

  const scheduledOrders = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of data.productionSchedule) seen.set(row.orderId, row.orderNumber);
    return [...seen.entries()].map(([id, number]) => ({ id, number }));
  }, [data.productionSchedule]);

  const runSimulation = () => {
    const scale = Number(simScale);
    setSimRows(service.getProductionSchedule({
      excludeOrderIds: simOrderId ? [simOrderId] : [],
      minutesScale: Number.isFinite(scale) && scale > 0 ? scale : 1,
    }));
  };

  const exportReport = () => {
    exportToExcel({
      title: 'تقرير تكاليف الإنتاج',
      columns: [
        { key: 'orderNumber', label: 'رقم الأمر' },
        { key: 'productName', label: 'المنتج' },
        { key: 'quantity', label: 'الكمية' },
        { key: 'status', label: 'الحالة' },
        { key: 'materialCost', label: 'تكلفة المواد' },
        { key: 'laborCost', label: 'تكلفة العمالة' },
        { key: 'totalCost', label: 'الإجمالي' },
        { key: 'costPerUnit', label: 'تكلفة الوحدة' },
      ],
      rows: report.orders.map((row) => ({
        orderNumber: row.orderNumber,
        productName: row.productName,
        quantity: row.quantity,
        status: STATUS_LABEL[row.status] || row.status,
        materialCost: row.materialCost,
        laborCost: row.laborCost,
        totalCost: row.totalCost,
        costPerUnit: row.costPerUnit,
      })),
      fileName: 'manufacturing-cost-report',
      kpis: [
        { label: 'إجمالي المواد', value: report.totalMaterialCost },
        { label: 'إجمالي العمالة', value: report.totalLaborCost },
        { label: 'الإجمالي', value: report.totalCost },
        { label: 'تكاليف الصيانة', value: report.maintenanceCost || 0 },
        { label: 'الكمية', value: report.totalQuantity },
      ],
      permission: 'manufacturing.export',
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[
          { label: 'إجمالي تكلفة المواد', value: report.totalMaterialCost },
          { label: 'إجمالي تكلفة العمالة', value: report.totalLaborCost },
          { label: 'إجمالي التكلفة', value: report.totalCost, strong: true },
          { label: 'التكلفة المعيارية', value: report.orders.reduce((s, r) => s + (r.standardCost || 0), 0) },
          { label: 'إجمالي الانحراف', value: report.orders.reduce((s, r) => s + (r.costVariance || 0), 0), strong: true },
          { label: 'إجمالي الكمية المنتجة', value: report.totalQuantity },
        ].map((kpi) => (
          <div key={kpi.label} className={`rounded-xl border p-4 ${kpi.strong ? 'border-accent-border bg-accent-soft' : 'border-line bg-surface'}`}>
            <div className="text-[11px] font-bold text-muted">{kpi.label}</div>
            <div className={`mt-1 text-2xl font-black ${kpi.strong ? 'text-primary' : 'text-ink'}`}>{Number(kpi.value).toLocaleString()}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-line bg-surface p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-black text-ink">تكلفة أوامر الإنتاج</h3>
          </div>
          <button onClick={exportReport} className="flex items-center gap-1 rounded-full bg-success-soft px-3 py-1 text-xs font-bold text-success" title="تصدير Excel">
            <Download className="h-3.5 w-3.5" /> تصدير
          </button>
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
            {
              key: 'variance', header: 'الانحراف عن المعياري',
              render: (row) => row.standardCost == null ? '—' : (
                <span className={`text-xs font-bold ${row.costVariance > 0 ? 'text-danger' : row.costVariance < 0 ? 'text-success' : 'text-muted'}`}>
                  {row.costVariance > 0 ? '+' : ''}{row.costVariance?.toLocaleString()}
                  {row.variancePercent != null && <span className="mr-1 text-[10px]">({row.variancePercent > 0 ? '+' : ''}{row.variancePercent}%)</span>}
                </span>
              ),
            },
          ]}
          emptyTitle="لا توجد أوامر إنتاج."
        />
      </div>

      <div className="rounded-xl border border-line bg-surface p-3">
        <div className="mb-2 flex items-center gap-2">
          <Wrench className="h-4 w-4 text-warning" />
          <h3 className="text-sm font-black text-ink">تكاليف الصيانة المنفذة</h3>
          <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-bold text-warning">
            الإجمالي: {Number(report.maintenanceCost || 0).toLocaleString()}
          </span>
        </div>
        <p className="mb-2 text-[11px] text-muted">تكلفة الصيانة على مستوى المرفق — لا تُوزَّع على أوامر الإنتاج.</p>
        <DataTable
          ariaLabel="تكاليف الصيانة حسب مركز العمل"
          rows={report.maintenanceByWorkCenter || []}
          rowKey={(row) => row.workCenterId || 'general'}
          dense
          columns={[
            { key: 'wc', header: 'مركز العمل', render: (row) => row.workCenterName || 'صيانة عامة' },
            { key: 'cost', header: 'التكلفة', render: (row) => <b>{Number(row.cost).toLocaleString()}</b> },
          ]}
          emptyTitle="لا توجد تكاليف صيانة منفذة."
        />
      </div>

      <div className="rounded-xl border border-line bg-surface p-3">
        <h3 className="mb-2 text-sm font-black text-ink">خطة السعة — مراكز العمل</h3>
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
            { key: 'down', header: 'توقف (دقيقة)', render: (row) => row.downtimeMinutes || 0 },
            {
              key: 'load', header: 'نسبة الحمل',
              render: (row) => row.loadPercent == null
                ? '—'
                : <span className={`font-bold ${row.loadPercent > 100 ? 'text-danger' : row.loadPercent > 80 ? 'text-warning' : 'text-success'}`}>{row.loadPercent}%</span>,
            },
          ]}
          emptyTitle="لا توجد مراكز عمل."
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-line bg-surface p-3">
          <h3 className="mb-2 text-sm font-black text-ink">كفاءة مراكز العمل</h3>
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
              { key: 'down', header: 'توقف (د)', render: (row) => row.downtimeMinutes || 0 },
              {
                key: 'eff', header: 'الكفاءة',
                render: (row) => row.efficiencyPercent == null ? '—' : <b className={row.efficiencyPercent >= 100 ? 'text-success' : 'text-warning'}>{row.efficiencyPercent}%</b>,
              },
            ]}
            emptyTitle="لا توجد بيانات."
          />
        </div>

        <div className="rounded-xl border border-line bg-surface p-3">
          <h3 className="mb-2 text-sm font-black text-ink">انحراف وقت العمل — الأوامر المكتملة</h3>
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
                render: (row) => row.variancePercent == null ? '—' : <b className={row.variancePercent >= 0 ? 'text-success' : 'text-danger'}>{row.variancePercent > 0 ? '+' : ''}{row.variancePercent}%</b>,
              },
            ]}
            emptyTitle="لا توجد أوامر مكتملة."
          />
        </div>

        <div className="rounded-xl border border-line bg-surface p-3">
          <h3 className="mb-2 text-sm font-black text-ink">الإنتاج الشهري</h3>
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

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-line bg-surface p-3">
          <h3 className="mb-1 text-sm font-black text-ink">فعالية المعدات OEE — لكل مركز عمل</h3>
          <p className="mb-2 text-[11px] text-muted">{data.oee.periodNote}</p>
          <DataTable
            ariaLabel="فعالية المعدات"
            rows={data.oee.centers}
            rowKey={(row) => row.workCenterId}
            dense
            columns={[
              { key: 'name', header: 'المركز', render: (row) => row.name },
              { key: 'avail', header: 'التوافر', render: (row) => row.availabilityPercent == null ? '—' : `${row.availabilityPercent}%` },
              { key: 'perf', header: 'الأداء', render: (row) => row.performancePercent == null ? '—' : `${row.performancePercent}%` },
              { key: 'qual', header: 'الجودة', render: (row) => row.qualityPercent == null ? '—' : `${row.qualityPercent}%` },
              {
                key: 'oee', header: 'OEE',
                render: (row) => row.oeePercent == null ? '—' : (
                  <b className={row.oeePercent >= 65 ? 'text-success' : row.oeePercent >= 40 ? 'text-warning' : 'text-danger'}>{row.oeePercent}%</b>
                ),
              },
            ]}
            emptyTitle="لا توجد مراكز عمل."
          />
        </div>

        <div className="rounded-xl border border-line bg-surface p-3">
          <h3 className="mb-1 text-sm font-black text-ink">عمالة المشغلين — مطابقة الحضور</h3>
          <p className="mb-2 text-[11px] text-muted">دقائق الإنتاج الفعلية مقابل worked_minutes المسجلة في حضور الموارد البشرية</p>
          <DataTable
            ariaLabel="عمالة المشغلين"
            rows={data.operatorLabor}
            rowKey={(row) => row.operatorId}
            dense
            columns={[
              { key: 'name', header: 'المشغل', render: (row) => row.operatorName },
              { key: 'ops', header: 'عمليات', render: (row) => row.operationsCount },
              { key: 'planned', header: 'مخطط (د)', render: (row) => row.plannedMinutes },
              { key: 'actual', header: 'فعلي (د)', render: (row) => row.actualMinutes },
              { key: 'att', header: 'حضور (د)', render: (row) => row.attendanceMinutes },
              { key: 'log', header: 'مسجّل (د)', render: (row) => row.loggedMinutes },
              {
                key: 'var', header: 'الفرق',
                render: (row) => (
                  <b className={row.varianceMinutes > 0 ? 'text-warning' : 'text-ink-secondary'}>
                    {row.varianceMinutes > 0 ? '+' : ''}{row.varianceMinutes}
                  </b>
                ),
              },
            ]}
            emptyTitle="لم يُسند أي مشغل لعمليات مكتملة."
          />
        </div>
      </div>

      <div className="rounded-xl border border-line bg-surface p-3">
        <h3 className="mb-1 text-sm font-black text-ink">مطابقة عمالة المشغلين مع الحضور (يومياً)</h3>
        <p className="mb-2 text-[11px] text-muted">دقائق الإنتاج المسجلة لكل عملية مقابل بصمات الحضور في نفس اليوم.</p>
        <DataTable
          ariaLabel="مطابقة عمالة يومية"
          rows={data.operatorLaborDaily}
          rowKey={(row) => `${row.operatorId}|${row.workDate}`}
          dense
          columns={[
            { key: 'name', header: 'المشغل', render: (row) => row.operatorName },
            { key: 'date', header: 'التاريخ', render: (row) => row.workDate },
            { key: 'ops', header: 'إنتاج (د)', render: (row) => row.operationMinutes },
            { key: 'att', header: 'حضور (د)', render: (row) => row.attendanceMinutes },
            {
              key: 'punch', header: 'البصمة',
              render: (row) => row.checkInAt
                ? `${String(row.checkInAt).slice(11, 16)} ← ${row.checkOutAt ? String(row.checkOutAt).slice(11, 16) : '—'}`
                : '—',
            },
            {
              key: 'diff', header: 'الفرق',
              render: (row) => {
                const diff = row.operationMinutes - row.attendanceMinutes;
                return (
                  <b className={diff > 0 ? 'text-warning' : 'text-ink-secondary'}>
                    {diff > 0 ? '+' : ''}{diff}
                  </b>
                );
              },
            },
          ]}
          emptyTitle="لا توجد سجلات عمالة يومية بعد."
        />
      </div>

      <div className="rounded-xl border border-line bg-surface p-3">
        <div className="mb-2 flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-black text-ink">محاكاة What-if للجدولة</h3>
        </div>
        <p className="mb-2 text-[11px] text-muted">استبعد أمراً أو غيّر عامل الدقائق لترى أثره على المواعيد — دون أي حفظ.</p>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <select value={simOrderId} onChange={(e) => setSimOrderId(e.target.value)} className="rounded-lg border border-line px-2 py-1.5 text-xs">
            <option value="">— استبعاد أمر —</option>
            {scheduledOrders.map((order) => <option key={order.id} value={order.id}>{order.number}</option>)}
          </select>
          <label className="flex items-center gap-1 text-xs text-ink-secondary">
            عامل الدقائق
            <input type="number" min="0.1" step="0.1" value={simScale} onChange={(e) => setSimScale(e.target.value)} className="w-20 rounded-lg border border-line px-2 py-1.5" />
          </label>
          <button type="button" onClick={runSimulation} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white">محاكاة</button>
          {simRows && <button type="button" onClick={() => setSimRows(null)} className="rounded-lg bg-surface-sunken px-3 py-1.5 text-xs">مسح</button>}
        </div>
        {simRows && (
          <DataTable
            ariaLabel="نتائج محاكاة الجدولة"
            rows={simRows}
            rowKey={(row) => row.operationId}
            dense
            columns={[
              { key: 'wc', header: 'مركز العمل', render: (row) => row.workCenterName || row.workCenterCode },
              { key: 'number', header: 'أمر الإنتاج', render: (row) => <span className="font-mono text-xs">{row.orderNumber}</span> },
              { key: 'minutes', header: 'دقائق', render: (row) => row.plannedMinutes },
              { key: 'start', header: 'البدء', render: (row) => `${row.estimatedStartDate} (+${Math.round(row.startOffsetMinutes || 0)})` },
              { key: 'finish', header: 'الانتهاء', render: (row) => `${row.estimatedFinishDate} (+${Math.round(row.finishOffsetMinutes || 0)})` },
            ]}
            emptyTitle="لا توجد عمليات في السيناريو."
          />
        )}
      </div>

      <div className="rounded-xl border border-line bg-surface p-3">
        <h3 className="mb-2 text-sm font-black text-ink">جدولة مراكز العمل</h3>
        <DataTable
          ariaLabel="جدولة الإنتاج"
          rows={data.productionSchedule}
          rowKey={(row) => row.operationId}
          dense
          columns={[
            { key: 'wc', header: 'مركز العمل', render: (row) => row.workCenterName || row.workCenterCode },
            { key: 'queue', header: '#', render: (row) => row.queuePosition },
            { key: 'number', header: 'أمر الإنتاج', render: (row) => <span className="font-mono text-xs">{row.orderNumber}</span> },
            { key: 'product', header: 'المنتج', render: (row) => row.productName },
            { key: 'seq', header: 'التسلسل', render: (row) => `#${row.sequence}` },
            { key: 'minutes', header: 'دقائق', render: (row) => row.plannedMinutes },
            { key: 'status', header: 'الحالة', render: (row) => row.operationStatus === 'IN_PROGRESS' ? 'جارٍ' : row.operationStatus === 'PENDING' ? 'منتظر' : row.operationStatus },
            { key: 'start', header: 'البدء المتوقع', render: (row) => `${row.estimatedStartDate} (+${Math.round(row.startOffsetMinutes || 0)} د)` },
            { key: 'finish', header: 'الانتهاء المتوقع', render: (row) => `${row.estimatedFinishDate} (+${Math.round(row.finishOffsetMinutes || 0)} د)` },
            { key: 'due', header: 'استحقاق الأمر', render: (row) => row.dueDate || '—' },
          ]}
          emptyTitle="لا توجد عمليات مجدولة."
        />
      </div>
    </div>
  );
};
