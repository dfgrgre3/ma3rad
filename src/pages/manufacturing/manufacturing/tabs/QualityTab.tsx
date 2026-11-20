import React, { useState } from 'react';
import { DataTable } from '../../../../components/ui/DataTable';
import { Modal } from '../../../../components/ui/Modal';
import { ClipboardCheck, Pencil, Plus, Tags } from 'lucide-react';
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

const EMPTY_CHECK_FORM = { productionOrderId: '', inspectionType: 'FINAL', result: 'PENDING', quantityInspected: '', quantityAccepted: '', quantityRejected: '', sampleSize: '', acceptNumber: '', rejectNumber: '', notes: '' };

export const QualityTab: React.FC<TabProps> = ({ service, data, reload, canManage, toast }) => {
  const [form, setForm] = useState(EMPTY_CHECK_FORM);
  const [defectRows, setDefectRows] = useState<Array<{ defectCodeId: string; quantity: string }>>([]);
  const [dispositionForm, setDispositionForm] = useState<Record<string, { disposition: string; quantity: string }>>({});
  const [defectForm, setDefectForm] = useState({ code: '', name: '', branchId: '' });
  const [editingCheck, setEditingCheck] = useState<any | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_CHECK_FORM);
  const [editDefects, setEditDefects] = useState<Array<{ defectCodeId: string; quantity: string }>>([]);
  const [editBusy, setEditBusy] = useState(false);

  const activeDefectCodes = (data.defectCodes || []).filter((code: any) => code.isActive !== false);

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
        sampleSize: form.sampleSize === '' ? undefined : Number(form.sampleSize),
        acceptNumber: form.acceptNumber === '' ? undefined : Number(form.acceptNumber),
        rejectNumber: form.rejectNumber === '' ? undefined : Number(form.rejectNumber),
        notes: form.notes || undefined,
        defects: defectRows
          .filter((row) => row.defectCodeId && Number(row.quantity) > 0)
          .map((row) => ({ defectCodeId: row.defectCodeId, quantity: Number(row.quantity) })),
      });
      setForm(EMPTY_CHECK_FORM);
      setDefectRows([]);
      toast.success('تم تسجيل فحص الجودة.');
      reload();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تسجيل الفحص.');
    }
  };

  const createDefect = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      service.createDefectCode({
        code: defectForm.code,
        name: defectForm.name,
        branchId: defectForm.branchId || undefined,
      });
      setDefectForm({ code: '', name: '', branchId: '' });
      toast.success('تمت إضافة كود العيب.');
      reload();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر إضافة كود العيب.');
    }
  };

  const deactivateDefect = (code: any) => {
    try {
      service.deactivateDefectCode(code.id);
      toast.success('تم إيقاف كود العيب.');
      reload();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر إيقاف الكود.');
    }
  };

  const openEditCheck = (check: any) => {
    setEditingCheck(check);
    setEditForm({
      productionOrderId: check.productionOrderId || '',
      inspectionType: check.inspectionType || 'FINAL',
      result: check.result || 'PENDING',
      quantityInspected: String(check.quantityInspected ?? ''),
      quantityAccepted: String(check.quantityAccepted ?? ''),
      quantityRejected: String(check.quantityRejected ?? ''),
      sampleSize: check.sampleSize == null ? '' : String(check.sampleSize),
      acceptNumber: check.acceptNumber == null ? '' : String(check.acceptNumber),
      rejectNumber: check.rejectNumber == null ? '' : String(check.rejectNumber),
      notes: check.notes || '',
    });
    setEditDefects((check.defects || []).map((d: any) => ({ defectCodeId: d.defectCodeId, quantity: String(d.quantity ?? '') })));
  };

  const saveEditCheck = () => {
    if (!editingCheck || editBusy) return;
    setEditBusy(true);
    try {
      service.updateQualityCheck(editingCheck.id, {
        inspectionType: editForm.inspectionType as any,
        result: editForm.result as any,
        quantityInspected: Number(editForm.quantityInspected) || 0,
        quantityAccepted: Number(editForm.quantityAccepted) || 0,
        quantityRejected: Number(editForm.quantityRejected) || 0,
        sampleSize: editForm.sampleSize === '' ? null : Number(editForm.sampleSize),
        acceptNumber: editForm.acceptNumber === '' ? null : Number(editForm.acceptNumber),
        rejectNumber: editForm.rejectNumber === '' ? null : Number(editForm.rejectNumber),
        notes: editForm.notes || null,
        defects: editDefects
          .filter((row) => row.defectCodeId && Number(row.quantity) > 0)
          .map((row) => ({ defectCodeId: row.defectCodeId, quantity: Number(row.quantity) })),
      });
      toast.success('تم تحديث فحص الجودة.');
      setEditingCheck(null);
      reload();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تحديث الفحص.');
    } finally {
      setEditBusy(false);
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

  const createRework = (check: any) => {
    const qty = Number(check.dispositionQty) || Number(check.quantityRejected) || 0;
    if (!check.productionOrderId || qty <= 0) {
      toast.error('لا يمكن إنشاء أمر إعادة عمل بدون أمر إنتاج أو كمية مرفوضة.');
      return;
    }
    try {
      const rework = service.createReworkOrder(check.productionOrderId, qty, { qualityCheckId: check.id });
      toast.success(`تم إنشاء أمر إعادة العمل ${rework.orderNumber}.`);
      reload();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر إنشاء أمر إعادة العمل.');
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
          <ClipboardCheck className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-black text-ink">فحوصات الجودة</h3>
        </div>
        <DataTable
          ariaLabel="فحوصات الجودة"
          rows={data.qualityChecks}
          rowKey={(row) => row.id}
          columns={[
            {
              key: 'order', header: 'أمر الإنتاج',
              render: (row) => {
                const held = service.getQcHeldQuantity ? service.getQcHeldQuantity(row.productionOrderId) : 0;
                return (
                  <span className="text-xs">
                    {orderLabel(row.productionOrderId)}
                    {held > 0 && <span className="mr-1 rounded bg-warning-soft px-1.5 py-0.5 text-[10px] font-bold text-warning">محجوز فحص {held}</span>}
                  </span>
                );
              },
            },
            { key: 'type', header: 'النوع', render: (row) => INSPECTION_TYPES.find((t) => t.value === row.inspectionType)?.label || row.inspectionType },
            { key: 'result', header: 'النتيجة', render: (row) => RESULTS.find((r) => r.value === row.result)?.label || row.result },
            { key: 'inspected', header: 'مفحوص', render: (row) => row.quantityInspected },
            { key: 'accepted', header: 'مقبول', render: (row) => row.quantityAccepted },
            { key: 'rejected', header: 'مرفوض', render: (row) => row.quantityRejected },
            { key: 'aql', header: 'AQL', render: (row) => row.sampleSize ? `${row.sampleSize} / ${row.acceptNumber ?? '—'} / ${row.rejectNumber ?? '—'}` : '—' },
            { key: 'defects', header: 'العيوب', render: (row) => row.defects?.length ? row.defects.map((d: any) => `${d.defectCode}:${d.quantity}`).join('، ') : '—' },
            { key: 'disposition', header: 'القرار', render: (row) => row.disposition !== 'NONE' ? `${DISPOSITIONS.find((d) => d.value === row.disposition)?.label || row.disposition} (${row.dispositionQty})` : '—' },
            {
              key: 'editAction', header: 'تعديل',
              render: (row) => canManage && row.disposition === 'NONE' && (
                <button
                  className="flex items-center gap-1 rounded bg-accent-soft px-2 py-0.5 text-xs font-bold text-primary"
                  onClick={() => openEditCheck(row)}
                >
                  <Pencil className="h-3 w-3" /> تعديل
                </button>
              ),
            },
            {
              key: 'dispositionAction', header: 'معالجة',
              render: (row) => canManage && row.disposition === 'NONE' && (
                <div className="flex items-center gap-1">
                  <select
                    className="rounded border border-line px-1 py-0.5 text-xs"
                    value={dispositionForm[row.id]?.disposition || ''}
                    onChange={(e) => setDispositionForm({ ...dispositionForm, [row.id]: { disposition: e.target.value, quantity: dispositionForm[row.id]?.quantity || '' } })}
                  >
                    <option value="">—</option>
                    {DISPOSITIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                  <input
                    type="number" min="0" placeholder="كمية"
                    className="w-16 rounded border border-line px-1 py-0.5 text-xs"
                    value={dispositionForm[row.id]?.quantity || ''}
                    onChange={(e) => setDispositionForm({ ...dispositionForm, [row.id]: { disposition: dispositionForm[row.id]?.disposition || '', quantity: e.target.value } })}
                  />
                  <button className="rounded bg-surface-sunken px-2 py-0.5 text-xs" onClick={() => recordDisposition(row)}>تسجيل</button>
                </div>
              ),
            },
            {
              key: 'reworkAction', header: 'إعادة عمل',
              render: (row) => canManage && row.disposition === 'REWORK' && row.productionOrderId && (
                <button
                  className="rounded bg-accent-soft px-2 py-0.5 text-xs font-bold text-primary"
                  onClick={() => createRework(row)}
                >
                  أمر إعادة عمل
                </button>
              ),
            },
          ]}
          emptyTitle="لا توجد فحوصات جودة."
        />
      </div>

      {canManage && (
        <form onSubmit={create} className="space-y-2 rounded-xl border border-line bg-surface p-3 text-xs">
          <h3 className="font-black text-ink">فحص جديد</h3>
          <select required value={form.productionOrderId} onChange={(e) => setForm({ ...form, productionOrderId: e.target.value })} className="w-full rounded-lg border border-line px-2 py-1.5">
            <option value="">أمر الإنتاج</option>
            {data.orders.filter((o) => !['CANCELLED'].includes(o.status)).map((order) => <option key={order.id} value={order.id}>{order.orderNumber} — {order.productName}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <select value={form.inspectionType} onChange={(e) => setForm({ ...form, inspectionType: e.target.value })} className="rounded-lg border border-line px-2 py-1.5">
              {INSPECTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <select value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value })} className="rounded-lg border border-line px-2 py-1.5">
              {RESULTS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input type="number" min="0" placeholder="مفحوص" value={form.quantityInspected} onChange={(e) => setForm({ ...form, quantityInspected: e.target.value })} className="rounded-lg border border-line px-2 py-1.5" />
            <input type="number" min="0" placeholder="مقبول" value={form.quantityAccepted} onChange={(e) => setForm({ ...form, quantityAccepted: e.target.value })} className="rounded-lg border border-line px-2 py-1.5" />
            <input type="number" min="0" placeholder="مرفوض" value={form.quantityRejected} onChange={(e) => setForm({ ...form, quantityRejected: e.target.value })} className="rounded-lg border border-line px-2 py-1.5" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input type="number" min="0" placeholder="حجم العينة" value={form.sampleSize} onChange={(e) => setForm({ ...form, sampleSize: e.target.value })} className="rounded-lg border border-line px-2 py-1.5" />
            <input type="number" min="0" placeholder="رقم القبول" value={form.acceptNumber} onChange={(e) => setForm({ ...form, acceptNumber: e.target.value })} className="rounded-lg border border-line px-2 py-1.5" />
            <input type="number" min="0" placeholder="رقم الرفض" value={form.rejectNumber} onChange={(e) => setForm({ ...form, rejectNumber: e.target.value })} className="rounded-lg border border-line px-2 py-1.5" />
          </div>
          {activeDefectCodes.length > 0 && (
            <div className="space-y-1">
              {defectRows.map((row, index) => (
                <div key={index} className="flex gap-1">
                  <select
                    className="flex-1 rounded-lg border border-line px-2 py-1"
                    value={row.defectCodeId}
                    onChange={(e) => setDefectRows(defectRows.map((r, i) => i === index ? { ...r, defectCodeId: e.target.value } : r))}
                  >
                    <option value="">نوع العيب</option>
                    {activeDefectCodes.map((code: any) => <option key={code.id} value={code.id}>{code.code} — {code.name}</option>)}
                  </select>
                  <input
                    type="number" min="0" placeholder="كمية"
                    className="w-20 rounded-lg border border-line px-2 py-1"
                    value={row.quantity}
                    onChange={(e) => setDefectRows(defectRows.map((r, i) => i === index ? { ...r, quantity: e.target.value } : r))}
                  />
                  <button type="button" className="rounded border border-line px-2 text-muted" onClick={() => setDefectRows(defectRows.filter((_, i) => i !== index))}>×</button>
                </div>
              ))}
              <button type="button" className="text-primary" onClick={() => setDefectRows([...defectRows, { defectCodeId: '', quantity: '' }])}>+ إضافة عيب</button>
            </div>
          )}
          <input placeholder="ملاحظات" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full rounded-lg border border-line px-2 py-1.5" />
          <button type="submit" className="flex w-full items-center justify-center gap-1 rounded-lg bg-primary py-1.5 font-bold text-white">
            <Plus className="h-3.5 w-3.5" /> تسجيل الفحص
          </button>
        </form>
      )}

      <div className="rounded-xl border border-line bg-surface p-3 lg:col-span-3">
        <div className="mb-2 flex items-center gap-2">
          <Tags className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-black text-ink">أكواد العيوب</h3>
        </div>
        <DataTable
          ariaLabel="أكواد العيوب"
          rows={data.defectCodes || []}
          rowKey={(row) => row.id}
          dense
          columns={[
            { key: 'code', header: 'الرمز', render: (row) => <span className="font-mono text-xs font-bold">{row.code}</span> },
            { key: 'name', header: 'الاسم', render: (row) => row.name },
            {
              key: 'status', header: 'الحالة',
              render: (row) => row.isActive === false
                ? <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[10px] font-bold text-muted">موقوف</span>
                : <span className="rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-bold text-success">نشط</span>,
            },
            {
              key: 'action', header: '',
              render: (row) => canManage && row.isActive !== false && (
                <button className="rounded bg-danger-soft px-2 py-0.5 text-xs text-danger" onClick={() => deactivateDefect(row)}>إيقاف</button>
              ),
            },
          ]}
          emptyTitle="لا توجد أكواد عيوب — أضف أول كود."
        />
        {canManage && (
          <form onSubmit={createDefect} className="mt-2 flex flex-wrap items-center gap-2 border-t border-line pt-2">
            <input required placeholder="الرمز" value={defectForm.code} onChange={(e) => setDefectForm({ ...defectForm, code: e.target.value })} className="w-28 rounded-lg border border-line px-2 py-1.5" />
            <input required placeholder="اسم العيب" value={defectForm.name} onChange={(e) => setDefectForm({ ...defectForm, name: e.target.value })} className="min-w-48 flex-1 rounded-lg border border-line px-2 py-1.5" />
            <select value={defectForm.branchId} onChange={(e) => setDefectForm({ ...defectForm, branchId: e.target.value })} className="rounded-lg border border-line px-2 py-1.5">
              <option value="">الفرع الافتراضي</option>
              {data.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
            <button type="submit" className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 font-bold text-white">
              <Plus className="h-3.5 w-3.5" /> إضافة كود
            </button>
          </form>
        )}
      </div>

      <Modal
        open={!!editingCheck}
        onClose={() => !editBusy && setEditingCheck(null)}
        busy={editBusy}
        size="lg"
        title={`تعديل فحص الجودة — ${orderLabel(editingCheck?.productionOrderId || '')}`}
        footer={
          <div className="flex gap-2">
            <button type="button" className="flex-1 rounded-lg border border-line px-3 py-1.5 text-xs" onClick={() => setEditingCheck(null)} disabled={editBusy}>إلغاء</button>
            <button type="button" className="flex-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50" onClick={saveEditCheck} disabled={editBusy}>
              {editBusy ? 'جارٍ…' : 'حفظ التعديلات'}
            </button>
          </div>
        }
      >
        <div className="space-y-3 text-xs">
          <div className="grid gap-2 sm:grid-cols-2">
            <select value={editForm.inspectionType} onChange={(e) => setEditForm({ ...editForm, inspectionType: e.target.value })} className="rounded-lg border border-line px-2 py-1.5">
              {INSPECTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <select value={editForm.result} onChange={(e) => setEditForm({ ...editForm, result: e.target.value })} className="rounded-lg border border-line px-2 py-1.5">
              {RESULTS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input type="number" min="0" placeholder="مفحوص" value={editForm.quantityInspected} onChange={(e) => setEditForm({ ...editForm, quantityInspected: e.target.value })} className="rounded-lg border border-line px-2 py-1.5" />
            <input type="number" min="0" placeholder="مقبول" value={editForm.quantityAccepted} onChange={(e) => setEditForm({ ...editForm, quantityAccepted: e.target.value })} className="rounded-lg border border-line px-2 py-1.5" />
            <input type="number" min="0" placeholder="مرفوض" value={editForm.quantityRejected} onChange={(e) => setEditForm({ ...editForm, quantityRejected: e.target.value })} className="rounded-lg border border-line px-2 py-1.5" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input type="number" min="0" placeholder="حجم العينة" value={editForm.sampleSize} onChange={(e) => setEditForm({ ...editForm, sampleSize: e.target.value })} className="rounded-lg border border-line px-2 py-1.5" />
            <input type="number" min="0" placeholder="رقم القبول" value={editForm.acceptNumber} onChange={(e) => setEditForm({ ...editForm, acceptNumber: e.target.value })} className="rounded-lg border border-line px-2 py-1.5" />
            <input type="number" min="0" placeholder="رقم الرفض" value={editForm.rejectNumber} onChange={(e) => setEditForm({ ...editForm, rejectNumber: e.target.value })} className="rounded-lg border border-line px-2 py-1.5" />
          </div>
          {activeDefectCodes.length > 0 && (
            <div className="space-y-1">
              {editDefects.map((row, index) => (
                <div key={index} className="flex gap-1">
                  <select
                    className="flex-1 rounded-lg border border-line px-2 py-1"
                    value={row.defectCodeId}
                    onChange={(e) => setEditDefects(editDefects.map((r, i) => i === index ? { ...r, defectCodeId: e.target.value } : r))}
                  >
                    <option value="">نوع العيب</option>
                    {activeDefectCodes.map((code: any) => <option key={code.id} value={code.id}>{code.code} — {code.name}</option>)}
                  </select>
                  <input
                    type="number" min="0" placeholder="كمية"
                    className="w-20 rounded-lg border border-line px-2 py-1"
                    value={row.quantity}
                    onChange={(e) => setEditDefects(editDefects.map((r, i) => i === index ? { ...r, quantity: e.target.value } : r))}
                  />
                  <button type="button" className="rounded border border-line px-2 text-muted" onClick={() => setEditDefects(editDefects.filter((_, i) => i !== index))}>×</button>
                </div>
              ))}
              <button type="button" className="text-primary" onClick={() => setEditDefects([...editDefects, { defectCodeId: '', quantity: '' }])}>+ إضافة عيب</button>
            </div>
          )}
          <input placeholder="ملاحظات" value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} className="w-full rounded-lg border border-line px-2 py-1.5" />
        </div>
      </Modal>
    </div>
  );
};
