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
  PLANNED: { label: 'مخطط', className: 'bg-surface-sunken text-ink-secondary' },
  RELEASED: { label: 'صادر', className: 'bg-accent-soft text-primary' },
  IN_PROGRESS: { label: 'قيد التنفيذ', className: 'bg-warning-soft text-warning' },
  COMPLETED: { label: 'مكتمل', className: 'bg-success-soft text-success' },
  CANCELLED: { label: 'ملغى', className: 'bg-danger-soft text-danger' },
};

export const statusBadge = (status: string) => {
  const meta = ORDER_STATUS[status] || { label: status, className: 'bg-surface-sunken text-ink-secondary' };
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${meta.className}`}>{meta.label}</span>;
};

const PRIORITY_LABEL: Record<string, string> = { LOW: 'منخفضة', MEDIUM: 'متوسطة', HIGH: 'عالية', URGENT: 'عاجلة' };

export const OverviewTab: React.FC<TabProps> = ({ service, data, reload, canManage, toast }) => {
  const orders = data.orders;
  const active = orders.filter((o) => ['RELEASED', 'IN_PROGRESS'].includes(o.status));
  const planned = orders.filter((o) => o.status === 'PLANNED');
  const completed = orders.filter((o) => o.status === 'COMPLETED');
  const today = new Date().toISOString().slice(0, 10);
  const delayed = orders.filter((o) => o.dueDate && o.dueDate < today && !['COMPLETED', 'CANCELLED'].includes(o.status));
  const overloaded = data.capacityPlan.filter((row) => (row.loadPercent ?? 0) > 100);
  const oeeRows = (data.oee?.centers || []).filter((row: any) => row.oeePercent != null);
  const avgOee = oeeRows.length
    ? Math.round(oeeRows.reduce((sum: number, row: any) => sum + Number(row.oeePercent), 0) / oeeRows.length)
    : null;
  const openIncidents = (data.hseIncidents || []).filter((row: any) => row.status !== 'CLOSED');
  const seriousIncidents = openIncidents.filter((row: any) => ['SERIOUS', 'CRITICAL'].includes(row.severity));
  const permitAlerts = data.hsePermitAlerts || { expiring: [], expired: [] };

  const kpis = [
    { label: 'أوامر نشطة', value: active.length, tone: 'text-primary' },
    { label: 'أوامر مخططة', value: planned.length, tone: 'text-ink' },
    { label: 'أوامر متأخرة', value: delayed.length, tone: delayed.length ? 'text-danger' : 'text-success' },
    { label: 'إجمالي المكتملة', value: completed.length, tone: 'text-success' },
    { label: 'تكلفة WIP (مواد)', value: data.wip.totalMaterialCost.toLocaleString(), tone: 'text-warning' },
    { label: 'مراكز فوق الطاقة', value: overloaded.length, tone: overloaded.length ? 'text-danger' : 'text-success' },
    { label: 'صيانة وقائية متأخرة', value: data.maintenanceAlerts.overdue.length, tone: data.maintenanceAlerts.overdue.length ? 'text-danger' : 'text-success' },
    { label: 'OEE متوسط', value: avgOee == null ? '—' : `${avgOee}%`, tone: avgOee == null ? 'text-muted' : avgOee >= 65 ? 'text-success' : avgOee >= 40 ? 'text-warning' : 'text-danger' },
    { label: 'حوادث سلامة مفتوحة', value: openIncidents.length, tone: seriousIncidents.length ? 'text-danger' : openIncidents.length ? 'text-warning' : 'text-success' },
    { label: 'تصاريح منتهية/قاربت', value: permitAlerts.expired.length + permitAlerts.expiring.length, tone: permitAlerts.expired.length ? 'text-danger' : permitAlerts.expiring.length ? 'text-warning' : 'text-success' },
  ];

  return (
    <div className="space-y-4">
      {(seriousIncidents.length > 0 || permitAlerts.expired.length > 0 || data.maintenanceAlerts.overdue.length > 0) && (
        <div className="rounded-xl border border-danger-border bg-danger-soft p-3 text-xs text-danger">
          <span className="font-black">تنبيهات المصنع: </span>
          {seriousIncidents.length > 0 && <span className="ml-2">{seriousIncidents.length} حادث سلامة خطير/جسيم مفتوح ({seriousIncidents.map((i: any) => i.incidentDate).join('، ')})</span>}
          {permitAlerts.expired.length > 0 && <span className="ml-2">{permitAlerts.expired.length} تصريح عمل خطرة منتهي ({permitAlerts.expired.map((p: any) => p.permitNumber).join('، ')})</span>}
          {data.maintenanceAlerts.overdue.length > 0 && <span className="ml-2">{data.maintenanceAlerts.overdue.length} صيانة وقائية متأخرة</span>}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-line bg-surface p-4">
            <div className="text-[11px] font-bold text-muted">{kpi.label}</div>
            <div className={`mt-1 text-2xl font-black ${kpi.tone}`}>{kpi.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-line bg-surface p-3">
          <h3 className="mb-2 text-sm font-black text-ink">أحدث أوامر الإنتاج</h3>
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

        <div className="rounded-xl border border-line bg-surface p-3">
          <h3 className="mb-2 text-sm font-black text-ink">حمل مراكز العمل</h3>
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
                  : <span className={`font-bold ${row.loadPercent > 100 ? 'text-danger' : row.loadPercent > 80 ? 'text-warning' : 'text-success'}`}>{row.loadPercent}%</span>,
              },
            ]}
            emptyTitle="لا توجد مراكز عمل."
          />
        </div>

        <div className="rounded-xl border border-line bg-surface p-3 lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-black text-ink">
              نواقص المواد
              {data.materialShortages.length > 0 && (
                <span className="mr-2 rounded-full bg-danger-soft px-2 py-0.5 text-[11px] text-danger">{data.materialShortages.length}</span>
              )}
            </h3>
            {canManage && data.purchaseSuggestions.length > 0 && (
              <button
                className="rounded-lg bg-success px-3 py-1 text-xs font-bold text-white"
                onClick={() => {
                  try {
                    const created = service.createPurchaseRequestsFromShortages();
                    toast.success(`تم إنشاء ${created.length} طلب شراء: ${created.map((row) => row.requestNumber).join('، ')}`);
                    reload();
                  } catch (error: any) {
                    toast.error(error?.message || 'تعذر إنشاء طلبات الشراء.');
                  }
                }}
              >
                إنشاء طلبات شراء ({data.purchaseSuggestions.length})
              </button>
            )}
          </div>
          {data.purchaseSuggestions.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1">
              {data.purchaseSuggestions.slice(0, 6).map((row) => (
                <span key={`${row.componentProductId}-${row.warehouseId}`} className="rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] text-ink-secondary" title={row.orderNumbers.join('، ')}>
                  {row.componentName}: يُقترح شراء {row.suggestedQty} (≈ {row.estimatedValue.toLocaleString()})
                </span>
              ))}
            </div>
          )}
          <DataTable
            ariaLabel="نواقص مواد أوامر الإنتاج"
            rows={data.materialShortages.slice(0, 10)}
            rowKey={(row) => `${row.orderId}-${row.componentProductId}`}
            dense
            columns={[
              { key: 'order', header: 'أمر الإنتاج', render: (row) => <span className="font-mono text-xs">{row.orderNumber}</span> },
              { key: 'component', header: 'المكوّن', render: (row) => row.componentName },
              { key: 'required', header: 'المطلوب', render: (row) => row.requiredQty },
              { key: 'available', header: 'المتاح', render: (row) => row.availableQty },
              { key: 'deficit', header: 'العجز', render: (row) => <b className="text-danger">{row.deficitQty}</b> },
              { key: 'status', header: 'حالة الأمر', render: (row) => statusBadge(row.orderStatus) },
            ]}
            emptyTitle="لا توجد نواقص — كل المواد متوفرة."
          />
        </div>
      </div>
    </div>
  );
};
