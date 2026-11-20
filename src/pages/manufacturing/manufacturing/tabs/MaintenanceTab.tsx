import React, { useState } from 'react';
import { DataTable } from '../../../../components/ui/DataTable';
import { Modal } from '../../../../components/ui/Modal';
import { Wrench, Plus } from 'lucide-react';
import type { TabProps } from './OverviewTab';

const TYPES = [
  { value: 'PREVENTIVE', label: 'وقائية' },
  { value: 'CORRECTIVE', label: 'تصحيحية' },
  { value: 'PREDICTIVE', label: 'تنبوؤية' },
];
const STATUSES = [
  { value: 'SCHEDULED', label: 'مجدولة' },
  { value: 'IN_PROGRESS', label: 'قيد التنفيذ' },
  { value: 'COMPLETED', label: 'مكتملة' },
  { value: 'CANCELLED', label: 'ملغاة' },
];

export const MaintenanceTab: React.FC<TabProps> = ({ service, data, reload, canManage, toast }) => {
  const [form, setForm] = useState({ workCenterId: '', equipmentName: '', maintenanceType: 'PREVENTIVE', scheduledDate: '', recurrenceDays: '', notes: '', branchId: '' });
  const [statusEdits, setStatusEdits] = useState<Record<string, { status: string; cost: string }>>({});
  const [downModal, setDownModal] = useState(false);
  const [downForm, setDownForm] = useState({ workCenterId: '', minutes: '30', reason: '' });
  const [downBusy, setDownBusy] = useState(false);

  const create = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      service.createMaintenance({
        workCenterId: form.workCenterId || undefined,
        equipmentName: form.equipmentName,
        maintenanceType: form.maintenanceType as any,
        scheduledDate: form.scheduledDate || undefined,
        recurrenceIntervalDays: form.maintenanceType === 'PREVENTIVE' && form.recurrenceDays !== '' ? Number(form.recurrenceDays) : undefined,
        notes: form.notes || undefined,
        branchId: form.branchId || undefined,
      });
      setForm({ workCenterId: '', equipmentName: '', maintenanceType: 'PREVENTIVE', scheduledDate: '', recurrenceDays: '', notes: '', branchId: '' });
      toast.success('تم جدولة الصيانة.');
      reload();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر جدولة الصيانة.');
    }
  };

  const update = (record: any) => {
    const edit = statusEdits[record.id];
    if (!edit?.status) return;
    try {
      service.updateMaintenance(record.id, {
        status: edit.status as any,
        cost: edit.cost === '' ? undefined : Number(edit.cost),
      });
      toast.success('تم تحديث الصيانة.');
      reload();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تحديث الصيانة.');
    }
  };

  const submitDowntime = () => {
    if (downBusy) return;
    const minutes = Number(downForm.minutes);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      toast.error('مدة التوقف يجب أن تكون رقماً أكبر من صفر.');
      return;
    }
    setDownBusy(true);
    try {
      service.recordDowntime({
        workCenterId: downForm.workCenterId || undefined,
        minutes,
        reason: downForm.reason || undefined,
      });
      toast.success('تم تسجيل التوقف.');
      setDownModal(false);
      setDownForm({ workCenterId: '', minutes: '30', reason: '' });
      reload();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تسجيل التوقف.');
    } finally {
      setDownBusy(false);
    }
  };

  const workCenterName = (id: string | null) => data.workCenters.find((wc) => wc.id === id)?.name || '—';
  const alerts = data.maintenanceAlerts;

  return (
    <div className="space-y-3">
      {(alerts.overdue.length > 0 || alerts.dueSoon.length > 0) && (
        <div className={`rounded-xl border p-3 text-xs ${alerts.overdue.length > 0 ? 'border-danger-border bg-danger-soft text-danger' : 'border-warning-border bg-warning-soft text-warning'}`}>
          {alerts.overdue.length > 0 && <div className="font-bold">{alerts.overdue.length} صيانة وقائية متأخرة: {alerts.overdue.map((r) => r.equipmentName).join('، ')}</div>}
          {alerts.dueSoon.length > 0 && <div className={alerts.overdue.length > 0 ? 'mt-1' : 'font-bold'}>{alerts.dueSoon.length} صيانة وقائية خلال 7 أيام: {alerts.dueSoon.map((r) => `${r.equipmentName} (${r.scheduledDate})`).join('، ')}</div>}
        </div>
      )}
      <div className="grid gap-3 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <div className="mb-2 flex items-center gap-2">
          <Wrench className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-black text-ink">سجلات الصيانة</h3>
        </div>
        <DataTable
          ariaLabel="سجلات الصيانة"
          rows={data.maintenance}
          rowKey={(row) => row.id}
          columns={[
            { key: 'equipment', header: 'المعدة', render: (row) => row.equipmentName },
            { key: 'wc', header: 'مركز العمل', render: (row) => workCenterName(row.workCenterId) },
            { key: 'type', header: 'النوع', render: (row) => TYPES.find((t) => t.value === row.maintenanceType)?.label || row.maintenanceType },
            { key: 'status', header: 'الحالة', render: (row) => STATUSES.find((s) => s.value === row.status)?.label || row.status },
            { key: 'scheduled', header: 'مجدولة', render: (row) => row.scheduledDate || '—' },
            { key: 'recurrence', header: 'التكرار', render: (row) => row.recurrenceIntervalDays ? `كل ${row.recurrenceIntervalDays} يوم` : '—' },
            { key: 'completed', header: 'مكتملة', render: (row) => row.completedDate || '—' },
            { key: 'cost', header: 'التكلفة', render: (row) => row.cost },
            {
              key: 'update', header: 'تحديث',
              render: (row) => canManage && row.status !== 'COMPLETED' && row.status !== 'CANCELLED' && (
                <div className="flex items-center gap-1">
                  <select
                    className="rounded border border-line px-1 py-0.5 text-xs"
                    value={statusEdits[row.id]?.status || ''}
                    onChange={(e) => setStatusEdits({ ...statusEdits, [row.id]: { status: e.target.value, cost: statusEdits[row.id]?.cost || '' } })}
                  >
                    <option value="">—</option>
                    {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                  <input
                    type="number" min="0" step="0.01" placeholder="تكلفة"
                    className="w-20 rounded border border-line px-1 py-0.5 text-xs"
                    value={statusEdits[row.id]?.cost || ''}
                    onChange={(e) => setStatusEdits({ ...statusEdits, [row.id]: { status: statusEdits[row.id]?.status || '', cost: e.target.value } })}
                  />
                  <button className="rounded bg-surface-sunken px-2 py-0.5 text-xs" onClick={() => update(row)}>حفظ</button>
                </div>
              ),
            },
          ]}
          emptyTitle="لا توجد سجلات صيانة."
        />
      </div>

      <div className="rounded-xl border border-line bg-surface p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-black text-ink">توقفات الإنتاج</h3>
          {canManage && (
            <button
              className="rounded-lg bg-warning-soft px-2 py-1 text-xs font-bold text-warning"
              onClick={() => setDownModal(true)}
            >
              + تسجيل توقف
            </button>
          )}
        </div>
        <DataTable
          ariaLabel="توقفات الإنتاج"
          rows={data.downtime || []}
          rowKey={(row) => row.id}
          dense
          columns={[
            { key: 'wc', header: 'مركز العمل', render: (row) => row.work_center_name || row.workCenterName || '—' },
            { key: 'order', header: 'أمر الإنتاج', render: (row) => <span className="font-mono text-xs">{row.order_number || row.orderNumber || '—'}</span> },
            { key: 'minutes', header: 'الدقائق', render: (row) => row.minutes },
            { key: 'reason', header: 'السبب', render: (row) => row.reason || '—' },
            { key: 'at', header: 'التاريخ', render: (row) => (row.created_at || row.createdAt || '').slice(0, 16).replace('T', ' ') },
          ]}
          emptyTitle="لا توجد توقفات مسجلة."
        />
      </div>

      {canManage && (
        <form onSubmit={create} className="space-y-2 rounded-xl border border-line bg-surface p-3 text-xs">
          <h3 className="font-black text-ink">جدولة صيانة</h3>
          <input required placeholder="اسم المعدة" value={form.equipmentName} onChange={(e) => setForm({ ...form, equipmentName: e.target.value })} className="w-full rounded-lg border border-line px-2 py-1.5" />
          <select value={form.workCenterId} onChange={(e) => setForm({ ...form, workCenterId: e.target.value })} className="w-full rounded-lg border border-line px-2 py-1.5">
            <option value="">بدون مركز عمل</option>
            {data.workCenters.map((wc) => <option key={wc.id} value={wc.id}>{wc.name}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <select value={form.maintenanceType} onChange={(e) => setForm({ ...form, maintenanceType: e.target.value })} className="rounded-lg border border-line px-2 py-1.5">
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <input type="date" value={form.scheduledDate} onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })} className="rounded-lg border border-line px-2 py-1.5" />
          </div>
          {form.maintenanceType === 'PREVENTIVE' && (
            <input
              type="number" min="1" max="3650" placeholder="تكرار كل كذا يوم (اختياري)"
              value={form.recurrenceDays}
              onChange={(e) => setForm({ ...form, recurrenceDays: e.target.value })}
              className="w-full rounded-lg border border-line px-2 py-1.5"
            />
          )}
          <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} className="w-full rounded-lg border border-line px-2 py-1.5">
            <option value="">الفرع الافتراضي</option>
            {data.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
          <input placeholder="ملاحظات" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full rounded-lg border border-line px-2 py-1.5" />
          <button type="submit" className="flex w-full items-center justify-center gap-1 rounded-lg bg-primary py-1.5 font-bold text-white">
            <Plus className="h-3.5 w-3.5" /> جدولة
          </button>
        </form>
      )}
      </div>

      <Modal
        open={downModal}
        onClose={() => !downBusy && setDownModal(false)}
        busy={downBusy}
        size="sm"
        title="تسجيل توقف إنتاج"
        footer={
          <div className="flex gap-2">
            <button type="button" className="flex-1 rounded-lg border border-line px-3 py-1.5 text-xs" onClick={() => setDownModal(false)} disabled={downBusy}>إلغاء</button>
            <button type="button" className="flex-1 rounded-lg bg-warning px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50" onClick={submitDowntime} disabled={downBusy}>
              {downBusy ? 'جارٍ…' : 'تسجيل'}
            </button>
          </div>
        }
      >
        <div className="space-y-2 text-xs">
          <label className="block">
            <span className="mb-1 block font-bold text-ink-secondary">مركز العمل</span>
            <select value={downForm.workCenterId} onChange={(e) => setDownForm({ ...downForm, workCenterId: e.target.value })} className="w-full rounded-lg border border-line px-2 py-1.5">
              <option value="">— عام (بدون مركز) —</option>
              {data.workCenters.map((wc: any) => <option key={wc.id} value={wc.id}>{wc.name} ({wc.code})</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block font-bold text-ink-secondary">المدة (دقيقة)</span>
            <input type="number" min="1" step="1" value={downForm.minutes} onChange={(e) => setDownForm({ ...downForm, minutes: e.target.value })} className="w-full rounded-lg border border-line px-2 py-1.5" />
          </label>
          <label className="block">
            <span className="mb-1 block font-bold text-ink-secondary">السبب</span>
            <input type="text" value={downForm.reason} onChange={(e) => setDownForm({ ...downForm, reason: e.target.value })} className="w-full rounded-lg border border-line px-2 py-1.5" />
          </label>
        </div>
      </Modal>
    </div>
  );
};
