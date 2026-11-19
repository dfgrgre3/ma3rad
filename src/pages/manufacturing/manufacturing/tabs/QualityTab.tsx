import React, { useState } from 'react';
import { DataTable } from '../../../../components/ui/DataTable';
import { ClipboardCheck, Plus } from 'lucide-react';
import type { TabProps } from './OverviewTab';

const INSPECTION_TYPES = [
  { value: 'INCOMING', label: 'وارد' },
  { value: 'IN_PROCESS', label: 'أثناء التشغيل' },
  { value: 'FINAL', label: 'نهائي' },
];
const RESULTS = [
  { value: 'PENDING', label: 'قيد الانتظار' },
  { value: 'PASS', label: 'ناجح' },
  { value: 'FAIL', label: 'راسب' },
  { value: 'CONDITIONAL', label: 'مشروط' },
];
const DISPOSITIONS = [
  { value: 'ACCEPT', label: 'قبول' },
  { value: 'SCRAP', label: 'إتلاف' },
  { value: 'REWORK', label: 'إعادة عمل' },
  { value: 'RETURN', label: 'إرجاع' },
];

export const QualityTab: React.FC<TabProps> = ({ service, data, reload, canManage, toast }) => {
  const [form, setForm] = useState({ productionOrderId: '', inspectionType: 'FINAL', result: 'PENDING', quantityInspected: '', quantityAccepted: '', quantityRejected: '', notes: '' });
  const [dispositionForm, setDispositionForm] = useState<Record<string, { disposition: string; quantity: string }>>({});

  const create = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      service.createQualityCheck({
        productionOrderId: form.productionOrderId,
        inspectionType: form.inspectionType as any,
        result: form.result as any,
        quantityInspected: Number(form.quantityInspected) || 0,
        quantityAccepted: Number(form.quantityAccepted) || 0,
        quantityRejected: Number(form.quantityRejected) || 0,
        notes: form.notes || undefined,
      });
      setForm({ productionOrderId: '', inspectionType: 'FINAL', result: 'PENDING', quantityInspected: '', quantityAccepted: '', quantityRejected: '', notes: '' });
      toast.success('تم تسجيل فحص الجودة.');
      reload();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تسجيل الفحص.');
    }
  };

  const recordDisposition = (check: any) => {
    const entry = dispositionForm[check.id];
    if (!entry?.disposition) return;
    try {
      service.recordQualityDisposition(check.id, entry.disposition as any, Number(entry.quantity) || 0);
      toast.success('تم تسجيل قرار المعالجة.');
      reload();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تسجيل القرار.');
    }
  };

  const orderLabel = (orderId: string) => {
    const order = data.orders.find((row) => row.id === orderId);
    return order ? `${order.orderNumber} — ${order.productName}` : orderId;
  };

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <div className="mb-2 flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-sky-600" />
          <h3 className="text-sm font-black text-slate-900">فحوصات الجودة</h3>
        </div>
        <DataTable
          ariaLabel="فحوصات الجودة"
          rows={data.qualityChecks}
          rowKey={(row) => row.id}
          columns={[
            { key: 'order', header: 'أمر الإنتاج', render: (row) => <span className="text-xs">{orderLabel(row.productionOrderId)}</span> },
            { key: 'type', header: 'النوع', render: (row) => INSPECTION_TYPES.find((t) => t.value === row.inspectionType)?.label || row.inspectionType },
            { key: 'result', header: 'النتيجة', render: (row) => RESULTS.find((r) => r.value === row.result)?.label || row.result },
            { key: 'inspected', header: 'مفحوص', render: (row) => row.quantityInspected },
            { key: 'accepted', header: 'مقبول', render: (row) => row.quantityAccepted },
            { key: 'rejected', header: 'مرفوض', render: (row) => row.quantityRejected },
            { key: 'disposition', header: 'القرار', render: (row) => row.disposition !== 'NONE' ? `${DISPOSITIONS.find((d) => d.value === row.disposition)?.label || row.disposition} (${row.dispositionQty})` : '—' },
            {
              key: 'dispositionAction', header: 'معالجة',
              render: (row) => canManage && row.disposition === 'NONE' && (
                <div className="flex items-center gap-1">
                  <select
                    className="rounded border border-slate-200 px-1 py-0.5 text-xs"
                    value={dispositionForm[row.id]?.disposition || ''}
                    onChange={(e) => setDispositionForm({ ...dispositionForm, [row.id]: { disposition: e.target.value, quantity: dispositionForm[row.id]?.quantity || '' } })}
                  >
                    <option value="">—</option>
                    {DISPOSITIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                  <input
                    type="number" min="0" placeholder="كمية"
                    className="w-16 rounded border border-slate-200 px-1 py-0.5 text-xs"
                    value={dispositionForm[row.id]?.quantity || ''}
                    onChange={(e) => setDispositionForm({ ...dispositionForm, [row.id]: { disposition: dispositionForm[row.id]?.disposition || '', quantity: e.target.value } })}
                  />
                  <button className="rounded bg-slate-100 px-2 py-0.5 text-xs" onClick={() => recordDisposition(row)}>تسجيل</button>
                </div>
              ),
            },
          ]}
          emptyTitle="لا توجد فحوصات جودة."
        />
      </div>

      {canManage && (
        <form onSubmit={create} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-xs">
          <h3 className="font-black text-slate-900">فحص جديد</h3>
          <select required value={form.productionOrderId} onChange={(e) => setForm({ ...form, productionOrderId: e.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-1.5">
            <option value="">أمر الإنتاج</option>
            {data.orders.filter((o) => !['CANCELLED'].includes(o.status)).map((order) => <option key={order.id} value={order.id}>{order.orderNumber} — {order.productName}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <select value={form.inspectionType} onChange={(e) => setForm({ ...form, inspectionType: e.target.value })} className="rounded-lg border border-slate-200 px-2 py-1.5">
              {INSPECTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <select value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value })} className="rounded-lg border border-slate-200 px-2 py-1.5">
              {RESULTS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input type="number" min="0" placeholder="مفحوص" value={form.quantityInspected} onChange={(e) => setForm({ ...form, quantityInspected: e.target.value })} className="rounded-lg border border-slate-200 px-2 py-1.5" />
            <input type="number" min="0" placeholder="مقبول" value={form.quantityAccepted} onChange={(e) => setForm({ ...form, quantityAccepted: e.target.value })} className="rounded-lg border border-slate-200 px-2 py-1.5" />
            <input type="number" min="0" placeholder="مرفوض" value={form.quantityRejected} onChange={(e) => setForm({ ...form, quantityRejected: e.target.value })} className="rounded-lg border border-slate-200 px-2 py-1.5" />
          </div>
          <input placeholder="ملاحظات" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-1.5" />
          <button type="submit" className="flex w-full items-center justify-center gap-1 rounded-lg bg-sky-600 py-1.5 font-bold text-white">
            <Plus className="h-3.5 w-3.5" /> تسجيل الفحص
          </button>
        </form>
      )}
    </div>
  );
};
