import React, { useState } from 'react';
import { DataTable } from '../../../../components/ui/DataTable';
import { Modal } from '../../../../components/ui/Modal';
import { Factory } from 'lucide-react';
import type { SalesOrderProductionCandidate } from '../../../../services/domains/manufacturing/ManufacturingService/types';
import type { TabProps } from './OverviewTab';

const PRIORITY_OPTIONS = [
  { value: 'LOW', label: 'منخفضة' },
  { value: 'MEDIUM', label: 'متوسطة' },
  { value: 'HIGH', label: 'عالية' },
  { value: 'URGENT', label: 'عاجلة' },
];

export const SalesCandidatesTab: React.FC<TabProps> = ({ service, data, reload, canManage, toast }) => {
  const [selected, setSelected] = useState<SalesOrderProductionCandidate | null>(null);
  const [form, setForm] = useState({ quantity: '', priority: 'MEDIUM', startDate: '', dueDate: '', notes: '' });
  const [busy, setBusy] = useState(false);

  const openFor = (row: SalesOrderProductionCandidate) => {
    setSelected(row);
    setForm({ quantity: String(row.quantity), priority: 'MEDIUM', startDate: '', dueDate: '', notes: '' });
  };

  const createFromItem = () => {
    if (!selected) return;
    const quantity = form.quantity === '' ? undefined : Number(form.quantity);
    if (quantity !== undefined && (!Number.isFinite(quantity) || quantity <= 0)) {
      toast.error('أدخل كمية صحيحة أكبر من صفر.');
      return;
    }
    setBusy(true);
    try {
      const order = service.createProductionOrderFromSalesItem(selected.orderItemId, {
        quantity,
        priority: form.priority as any,
        startDate: form.startDate || undefined,
        dueDate: form.dueDate || undefined,
        notes: form.notes || undefined,
      });
      toast.success(`تم إنشاء أمر الإنتاج ${order.orderNumber}.`);
      setSelected(null);
      reload();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر إنشاء أمر الإنتاج.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className="mb-2 flex items-center gap-2">
        <Factory className="h-4 w-4 text-primary" />
        <div>
          <h3 className="text-sm font-black text-ink">عناصر أوامر البيع الجاهزة للإنتاج</h3>
          <p className="text-xs text-muted">عناصر البيع لمنتجات لها قائمة مواد (BOM) نشطة ولا يوجد لها أمر إنتاج بعد.</p>
        </div>
      </div>
      <DataTable
        ariaLabel="عناصر أوامر البيع المرشحة للإنتاج"
        rows={data.salesCandidates}
        rowKey={(row) => row.orderItemId}
        columns={[
          { key: 'order', header: 'أمر البيع', render: (row) => <span className="font-mono text-xs">{row.salesOrderNumber}</span> },
          { key: 'customer', header: 'العميل', render: (row) => row.customerName },
          { key: 'product', header: 'المنتج', render: (row) => row.productName },
          { key: 'qty', header: 'الكمية', render: (row) => `${row.quantity} ${row.unit || ''}` },
          { key: 'bom', header: 'BOM', render: (row) => <span className="text-xs">{row.bomName}</span> },
          {
            key: 'action', header: 'إجراء',
            render: (row) => canManage && (
              <button
                className="rounded bg-accent-soft px-2 py-1 text-xs font-bold text-primary"
                onClick={() => openFor(row)}
              >
                إنشاء أمر إنتاج
              </button>
            ),
          },
        ]}
        emptyTitle="لا توجد عناصر بيع تحتاج للإنتاج."
        emptyDescription="عندما يحتوي أمر بيع على منتج له BOM نشطة سيظهر هنا."
      />

      <Modal
        open={!!selected}
        onClose={() => !busy && setSelected(null)}
        title={selected ? `إنشاء أمر إنتاج — ${selected.productName}` : ''}
        description={selected ? `${selected.salesOrderNumber} · ${selected.customerName} · ${selected.quantity} ${selected.unit || ''}` : ''}
        icon={<Factory className="h-5 w-5 text-primary" />}
        size="sm"
        busy={busy}
        footer={
          <>
            <button disabled={busy} onClick={() => setSelected(null)} className="rounded-lg px-3 py-1.5 text-sm text-ink-secondary">إلغاء</button>
            <button disabled={busy} onClick={createFromItem} className="rounded-lg bg-primary px-4 py-1.5 text-sm font-bold text-white">إنشاء الأمر</button>
          </>
        }
      >
        <div className="space-y-3 text-xs">
          <label className="block">
            <span className="mb-1 block font-bold text-ink-secondary">الكمية (افتراضي: كمية البيع)</span>
            <input type="number" min="0" step="any" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="w-full rounded-lg border border-line px-2 py-1.5" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block font-bold text-ink-secondary">الأولوية</span>
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="w-full rounded-lg border border-line px-2 py-1.5">
                {PRIORITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block font-bold text-ink-secondary">الاستحقاق</span>
              <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="w-full rounded-lg border border-line px-2 py-1.5" />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block font-bold text-ink-secondary">ملاحظات</span>
            <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full rounded-lg border border-line px-2 py-1.5" />
          </label>
        </div>
      </Modal>
    </div>
  );
};
