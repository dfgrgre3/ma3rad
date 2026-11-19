import React, { useState } from 'react';
import { DataTable } from '../../../../components/ui/DataTable';
import { Plus } from 'lucide-react';
import type { TabProps } from './OverviewTab';

export const WorkCentersTab: React.FC<TabProps> = ({ service, data, reload, canManage, toast }) => {
  const [form, setForm] = useState({ code: '', name: '', description: '', costPerHour: '', capacityPerDay: '', branchId: '' });
  const capacityByCenter = new Map(data.capacityPlan.map((row) => [row.workCenterId, row]));

  const create = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      service.createWorkCenter({
        code: form.code,
        name: form.name,
        description: form.description || undefined,
        costPerHour: Number(form.costPerHour) || 0,
        capacityPerDay: Number(form.capacityPerDay) || 0,
        branchId: form.branchId || undefined,
      });
      setForm({ code: '', name: '', description: '', costPerHour: '', capacityPerDay: '', branchId: '' });
      toast.success('تم إضافة مركز العمل.');
      reload();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر إضافة مركز العمل.');
    }
  };

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <DataTable
        ariaLabel="مراكز العمل"
        rows={data.workCenters}
        rowKey={(row) => row.id}
        columns={[
          { key: 'code', header: 'الرمز', render: (row) => <span className="font-mono text-xs">{row.code}</span> },
          { key: 'name', header: 'الاسم', render: (row) => row.name },
          { key: 'cost', header: 'التكلفة/ساعة', render: (row) => row.costPerHour },
          { key: 'capacity', header: 'السعة/يوم (ساعة)', render: (row) => row.capacityPerDay },
          {
            key: 'load', header: 'الحمل الحالي',
            render: (row) => {
              const load = capacityByCenter.get(row.id);
              if (!load) return '—';
              return (
                <span className={`text-xs font-bold ${load.loadPercent != null && load.loadPercent > 100 ? 'text-rose-600' : 'text-slate-600'}`}>
                  {load.plannedMinutes} د / {load.activeOrders} أمر{load.loadPercent != null ? ` (${load.loadPercent}%)` : ''}
                </span>
              );
            },
          },
        ]}
        emptyTitle="لا توجد مراكز عمل."
      />

      {canManage && (
        <form onSubmit={create} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-xs lg:col-span-2">
          <h3 className="font-black text-slate-900">إضافة مركز عمل</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <input required placeholder="الرمز" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="rounded-lg border border-slate-200 px-2 py-1.5" />
            <input required placeholder="الاسم" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-lg border border-slate-200 px-2 py-1.5" />
            <input type="number" min="0" step="0.01" placeholder="تكلفة/ساعة" value={form.costPerHour} onChange={(e) => setForm({ ...form, costPerHour: e.target.value })} className="rounded-lg border border-slate-200 px-2 py-1.5" />
            <input type="number" min="0" step="0.5" placeholder="السعة/يوم (ساعة)" value={form.capacityPerDay} onChange={(e) => setForm({ ...form, capacityPerDay: e.target.value })} className="rounded-lg border border-slate-200 px-2 py-1.5" />
          </div>
          <input placeholder="وصف" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-1.5" />
          <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-1.5">
            <option value="">الفرع الافتراضي</option>
            {data.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
          <button type="submit" className="flex w-full items-center justify-center gap-1 rounded-lg bg-sky-600 py-1.5 font-bold text-white">
            <Plus className="h-3.5 w-3.5" /> إضافة
          </button>
        </form>
      )}
    </div>
  );
};
