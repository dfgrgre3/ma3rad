import React, { useState } from 'react';
import { DataTable } from '../../../../components/ui/DataTable';
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
  const [form, setForm] = useState({ workCenterId: '', equipmentName: '', maintenanceType: 'PREVENTIVE', scheduledDate: '', notes: '', branchId: '' });
  const [statusEdits, setStatusEdits] = useState<Record<string, { status: string; cost: string }>>({});

  const create = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      service.createMaintenance({
        workCenterId: form.workCenterId || undefined,
        equipmentName: form.equipmentName,
        maintenanceType: form.maintenanceType as any,
        scheduledDate: form.scheduledDate || undefined,
        notes: form.notes || undefined,
        branchId: form.branchId || undefined,
      });
      setForm({ workCenterId: '', equipmentName: '', maintenanceType: 'PREVENTIVE', scheduledDate: '', notes: '', branchId: '' });
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

  const workCenterName = (id: string | null) => data.workCenters.find((wc) => wc.id === id)?.name || '—';

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <div className="mb-2 flex items-center gap-2">
          <Wrench className="h-4 w-4 text-sky-600" />
          <h3 className="text-sm font-black text-slate-900">سجلات الصيانة</h3>
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
            { key: 'completed', header: 'مكتملة', render: (row) => row.completedDate || '—' },
            { key: 'cost', header: 'التكلفة', render: (row) => row.cost },
            {
              key: 'update', header: 'تحديث',
              render: (row) => canManage && row.status !== 'COMPLETED' && row.status !== 'CANCELLED' && (
                <div className="flex items-center gap-1">
                  <select
                    className="rounded border border-slate-200 px-1 py-0.5 text-xs"
                    value={statusEdits[row.id]?.status || ''}
                    onChange={(e) => setStatusEdits({ ...statusEdits, [row.id]: { status: e.target.value, cost: statusEdits[row.id]?.cost || '' } })}
                  >
                    <option value="">—</option>
                    {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                  <input
                    type="number" min="0" step="0.01" placeholder="تكلفة"
                    className="w-20 rounded border border-slate-200 px-1 py-0.5 text-xs"
                    value={statusEdits[row.id]?.cost || ''}
                    onChange={(e) => setStatusEdits({ ...statusEdits, [row.id]: { status: statusEdits[row.id]?.status || '', cost: e.target.value } })}
                  />
                  <button className="rounded bg-slate-100 px-2 py-0.5 text-xs" onClick={() => update(row)}>حفظ</button>
                </div>
              ),
            },
          ]}
          emptyTitle="لا توجد سجلات صيانة."
        />
      </div>

      {canManage && (
        <form onSubmit={create} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-xs">
          <h3 className="font-black text-slate-900">جدولة صيانة</h3>
          <input required placeholder="اسم المعدة" value={form.equipmentName} onChange={(e) => setForm({ ...form, equipmentName: e.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-1.5" />
          <select value={form.workCenterId} onChange={(e) => setForm({ ...form, workCenterId: e.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-1.5">
            <option value="">بدون مركز عمل</option>
            {data.workCenters.map((wc) => <option key={wc.id} value={wc.id}>{wc.name}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <select value={form.maintenanceType} onChange={(e) => setForm({ ...form, maintenanceType: e.target.value })} className="rounded-lg border border-slate-200 px-2 py-1.5">
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <input type="date" value={form.scheduledDate} onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })} className="rounded-lg border border-slate-200 px-2 py-1.5" />
          </div>
          <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-1.5">
            <option value="">الفرع الافتراضي</option>
            {data.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
          <input placeholder="ملاحظات" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-1.5" />
          <button type="submit" className="flex w-full items-center justify-center gap-1 rounded-lg bg-sky-600 py-1.5 font-bold text-white">
            <Plus className="h-3.5 w-3.5" /> جدولة
          </button>
        </form>
      )}
    </div>
  );
};
