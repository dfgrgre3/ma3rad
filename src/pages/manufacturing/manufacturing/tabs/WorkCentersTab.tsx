import React, { useState } from 'react';
import { DataTable } from '../../../../components/ui/DataTable';
import { Modal } from '../../../../components/ui/Modal';
import { Pencil, Plus } from 'lucide-react';
import type { TabProps } from './OverviewTab';

const EMPTY_FORM = { code: '', name: '', description: '', costPerHour: '', overheadPerHour: '', capacityPerDay: '', branchId: '', productionLineId: '' };
const EMPTY_LINE = { code: '', name: '', branchId: '' };

export const WorkCentersTab: React.FC<TabProps> = ({ service, data, reload, canManage, toast }) => {
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState<any | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [lineForm, setLineForm] = useState(EMPTY_LINE);
  const capacityByCenter = new Map(data.capacityPlan.map((row) => [row.workCenterId, row]));
  const linesForBranch = (branchId: string) => data.productionLines.filter((line: any) => !branchId || line.branchId === branchId);

  const create = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      service.createWorkCenter({
        code: form.code,
        name: form.name,
        description: form.description || undefined,
        costPerHour: Number(form.costPerHour) || 0,
        overheadPerHour: Number(form.overheadPerHour) || 0,
        capacityPerDay: Number(form.capacityPerDay) || 0,
        branchId: form.branchId || undefined,
        productionLineId: form.productionLineId || undefined,
      });
      setForm(EMPTY_FORM);
      toast.success('تم إضافة مركز العمل.');
      reload();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر إضافة مركز العمل.');
    }
  };

  const openEdit = (wc: any) => {
    setEditing(wc);
    setEditForm({
      code: wc.code || '',
      name: wc.name || '',
      description: wc.description || '',
      costPerHour: String(wc.costPerHour ?? ''),
      overheadPerHour: String(wc.overheadPerHour ?? ''),
      capacityPerDay: String(wc.capacityPerDay ?? ''),
      branchId: wc.branchId || '',
      productionLineId: wc.productionLineId || '',
    });
  };

  const saveEdit = () => {
    if (!editing || busy) return;
    setBusy(true);
    try {
      service.updateWorkCenter(editing.id, {
        code: editForm.code,
        name: editForm.name,
        description: editForm.description,
        costPerHour: Number(editForm.costPerHour) || 0,
        overheadPerHour: Number(editForm.overheadPerHour) || 0,
        capacityPerDay: Number(editForm.capacityPerDay) || 0,
        productionLineId: editForm.productionLineId || null,
      });
      toast.success('تم تحديث مركز العمل.');
      setEditing(null);
      reload();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تحديث مركز العمل.');
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = (wc: any) => {
    try {
      service.updateWorkCenter(wc.id, { isActive: !wc.isActive });
      toast.success(wc.isActive ? 'تم إيقاف مركز العمل.' : 'تم تفعيل مركز العمل.');
      reload();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تحديث الحالة.');
    }
  };

  const field = (key: keyof typeof EMPTY_FORM, label: string, type = 'text') => (
    <label className="block">
      <span className="mb-1 block font-bold text-ink-secondary">{label}</span>
      <input
        type={type} min={type === 'number' ? '0' : undefined} step={type === 'number' ? '0.01' : undefined}
        value={editForm[key]}
        onChange={(e) => setEditForm({ ...editForm, [key]: e.target.value })}
        className="w-full rounded-lg border border-line px-2 py-1.5"
      />
    </label>
  );

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <DataTable
        ariaLabel="مراكز العمل"
        rows={data.workCenters}
        rowKey={(row) => row.id}
        columns={[
          { key: 'code', header: 'الرمز', render: (row) => <span className="font-mono text-xs">{row.code}</span> },
          { key: 'name', header: 'الاسم', render: (row) => row.name },
          { key: 'line', header: 'خط الإنتاج', render: (row) => row.productionLineName || '—' },
          { key: 'status', header: 'الحالة', render: (row) => row.isActive === false || row.isActive === 0
            ? <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[10px] font-bold text-muted">موقوف</span>
            : <span className="rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-bold text-success">نشط</span> },
          { key: 'cost', header: 'التكلفة/ساعة', render: (row) => row.costPerHour },
          { key: 'overhead', header: 'أوفرهيد/ساعة', render: (row) => row.overheadPerHour ?? 0 },
          { key: 'capacity', header: 'السعة/يوم (ساعة)', render: (row) => row.capacityPerDay },
          {
            key: 'load', header: 'الحمل الحالي',
            render: (row) => {
              const load = capacityByCenter.get(row.id);
              if (!load) return '—';
              return (
                <span className={`text-xs font-bold ${load.loadPercent != null && load.loadPercent > 100 ? 'text-danger' : 'text-ink-secondary'}`}>
                  {load.plannedMinutes} د / {load.activeOrders} أمر{load.loadPercent != null ? ` (${load.loadPercent}%)` : ''}
                </span>
              );
            },
          },
          {
            key: 'actions', header: 'إجراءات',
            render: (row) => canManage && (
              <div className="flex gap-1">
                <button className="flex items-center gap-1 rounded bg-accent-soft px-2 py-1 text-xs text-primary" onClick={() => openEdit(row)}>
                  <Pencil className="h-3 w-3" /> تعديل
                </button>
                <button
                  className={`rounded px-2 py-1 text-xs ${row.isActive === false || row.isActive === 0 ? 'bg-success-soft text-success' : 'bg-surface-sunken text-ink-secondary'}`}
                  onClick={() => toggleActive(row)}
                >
                  {row.isActive === false || row.isActive === 0 ? 'تفعيل' : 'إيقاف'}
                </button>
              </div>
            ),
          },
        ]}
        emptyTitle="لا توجد مراكز عمل."
      />

      {canManage && (
        <form onSubmit={create} className="space-y-2 rounded-xl border border-line bg-surface p-3 text-xs lg:col-span-2">
          <h3 className="font-black text-ink">إضافة مركز عمل</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <input required placeholder="الرمز" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="rounded-lg border border-line px-2 py-1.5" />
            <input required placeholder="الاسم" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-lg border border-line px-2 py-1.5" />
            <input type="number" min="0" step="0.01" placeholder="تكلفة/ساعة" value={form.costPerHour} onChange={(e) => setForm({ ...form, costPerHour: e.target.value })} className="rounded-lg border border-line px-2 py-1.5" />
            <input type="number" min="0" step="0.01" placeholder="أوفرهيد/ساعة" value={form.overheadPerHour} onChange={(e) => setForm({ ...form, overheadPerHour: e.target.value })} className="rounded-lg border border-line px-2 py-1.5" />
            <input type="number" min="0" step="0.5" placeholder="السعة/يوم (ساعة)" value={form.capacityPerDay} onChange={(e) => setForm({ ...form, capacityPerDay: e.target.value })} className="rounded-lg border border-line px-2 py-1.5" />
          </div>
          <input placeholder="وصف" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-lg border border-line px-2 py-1.5" />
          <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value, productionLineId: '' })} className="w-full rounded-lg border border-line px-2 py-1.5">
            <option value="">الفرع الافتراضي</option>
            {data.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
          <select value={form.productionLineId} onChange={(e) => setForm({ ...form, productionLineId: e.target.value })} className="w-full rounded-lg border border-line px-2 py-1.5">
            <option value="">بدون خط إنتاج</option>
            {linesForBranch(form.branchId).map((line: any) => <option key={line.id} value={line.id}>{line.name} ({line.code})</option>)}
          </select>
          <button type="submit" className="flex w-full items-center justify-center gap-1 rounded-lg bg-primary py-1.5 font-bold text-white">
            <Plus className="h-3.5 w-3.5" /> إضافة
          </button>
        </form>
      )}

      {canManage && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            try {
              service.createProductionLine({ code: lineForm.code, name: lineForm.name, branchId: lineForm.branchId || undefined });
              setLineForm(EMPTY_LINE);
              toast.success('تم إضافة خط الإنتاج.');
              reload();
            } catch (error: any) { toast.error(error?.message || 'تعذر إضافة خط الإنتاج.'); }
          }}
          className="space-y-2 rounded-xl border border-line bg-surface p-3 text-xs lg:col-span-3"
        >
          <h3 className="font-black text-ink">إضافة خط إنتاج</h3>
          <div className="grid gap-2 sm:grid-cols-4">
            <input required placeholder="رمز الخط" value={lineForm.code} onChange={(e) => setLineForm({ ...lineForm, code: e.target.value })} className="rounded-lg border border-line px-2 py-1.5" />
            <input required placeholder="اسم الخط" value={lineForm.name} onChange={(e) => setLineForm({ ...lineForm, name: e.target.value })} className="rounded-lg border border-line px-2 py-1.5" />
            <select value={lineForm.branchId} onChange={(e) => setLineForm({ ...lineForm, branchId: e.target.value })} className="rounded-lg border border-line px-2 py-1.5">
              <option value="">الفرع الافتراضي</option>
              {data.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
            <button type="submit" className="flex items-center justify-center gap-1 rounded-lg bg-primary py-1.5 font-bold text-white">
              <Plus className="h-3.5 w-3.5" /> إضافة الخط
            </button>
          </div>
          {data.productionLines.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {data.productionLines.map((line: any) => (
                <span key={line.id} className="rounded-full bg-surface-sunken px-2 py-0.5 text-[10px] text-ink-secondary">
                  {line.name} — {line.workCentersCount ?? 0} مركز عمل
                </span>
              ))}
            </div>
          )}
        </form>
      )}

      <Modal
        open={!!editing}
        onClose={() => !busy && setEditing(null)}
        busy={busy}
        size="md"
        title={`تعديل مركز العمل — ${editing?.name || ''}`}
        footer={
          <div className="flex gap-2">
            <button type="button" className="flex-1 rounded-lg border border-line px-3 py-1.5 text-xs" onClick={() => setEditing(null)} disabled={busy}>إلغاء</button>
            <button type="button" className="flex-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50" onClick={saveEdit} disabled={busy}>حفظ</button>
          </div>
        }
      >
        <div className="grid gap-2 text-xs sm:grid-cols-2">
          {field('code', 'الرمز')}
          {field('name', 'الاسم')}
          {field('costPerHour', 'تكلفة/ساعة', 'number')}
          {field('overheadPerHour', 'أوفرهيد/ساعة', 'number')}
          {field('capacityPerDay', 'السعة/يوم (ساعة)', 'number')}
          {field('description', 'الوصف')}
          <label className="block">
            <span className="mb-1 block font-bold text-ink-secondary">خط الإنتاج</span>
            <select
              value={editForm.productionLineId}
              onChange={(e) => setEditForm({ ...editForm, productionLineId: e.target.value })}
              className="w-full rounded-lg border border-line px-2 py-1.5"
            >
              <option value="">بدون خط إنتاج</option>
              {linesForBranch(editForm.branchId).map((line: any) => <option key={line.id} value={line.id}>{line.name}</option>)}
            </select>
          </label>
        </div>
      </Modal>
    </div>
  );
};
