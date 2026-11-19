import React, { useMemo, useState } from 'react';
import { DataTable } from '../../../../components/ui/DataTable';
import { ProductPicker } from '../../../../components/products/ProductPicker';
import { OperationsShiftService } from '../../../../services/domains/operations/OperationsShiftService';
import { exportToExcel } from '../../../../utils/export/export';
import { Download, Plus } from 'lucide-react';
import { statusBadge } from './OverviewTab';
import type { TabProps } from './OverviewTab';

const PRIORITY_OPTIONS = [
  { value: 'LOW', label: 'منخفضة' },
  { value: 'MEDIUM', label: 'متوسطة' },
  { value: 'HIGH', label: 'عالية' },
  { value: 'URGENT', label: 'عاجلة' },
];

interface OperationDraft { workCenterId: string; plannedMinutes: string }

export const OrdersTab: React.FC<TabProps> = ({ service, data, reload, canManage, toast }) => {
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState({
    productId: '', bomId: '', quantity: '', priority: 'MEDIUM',
    startDate: '', dueDate: '', branchId: '', warehouseId: '', notes: '',
  });
  const [operations, setOperations] = useState<OperationDraft[]>([]);

  const costByOrder = useMemo(() => {
    const map = new Map<string, any>();
    for (const row of data.costReport.orders) map.set(row.orderId, row);
    return map;
  }, [data.costReport.orders]);

  const activeBoms = data.boms.filter((bom) => bom.status === 'ACTIVE' && (!form.productId || bom.productId === form.productId));
  const orders = statusFilter ? data.orders.filter((o) => o.status === statusFilter) : data.orders;

  const create = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      service.createProductionOrder({
        productId: form.productId,
        bomId: form.bomId,
        quantity: Number(form.quantity) || 0,
        priority: form.priority as any,
        startDate: form.startDate || undefined,
        dueDate: form.dueDate || undefined,
        branchId: form.branchId || undefined,
        warehouseId: form.warehouseId || undefined,
        notes: form.notes || undefined,
        operations: operations
          .filter((op) => op.workCenterId)
          .map((op) => ({ workCenterId: op.workCenterId, plannedMinutes: Number(op.plannedMinutes) || 0 })),
      });
      setForm({ productId: '', bomId: '', quantity: '', priority: 'MEDIUM', startDate: '', dueDate: '', branchId: '', warehouseId: '', notes: '' });
      setOperations([]);
      toast.success('تم إنشاء أمر الإنتاج.');
      reload();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر إنشاء أمر الإنتاج.');
    }
  };

  const run = (action: () => void, success: string) => {
    try { action(); toast.success(success); reload(); }
    catch (error: any) { toast.error(error?.message || 'تعذر تنفيذ الإجراء.'); }
  };

  const consume = (material: any) => {
    const remaining = Number(material.plannedQty) - Number(material.consumedQty);
    if (remaining <= 0) return;
    const qty = window.prompt('كمية الصرف:', String(remaining));
    if (qty === null) return;
    run(() => service.consumeMaterial(material.id, Number(qty)), 'تم تسجيل صرف المواد.');
  };

  const completeOperation = (operation: any) => {
    const minutes = window.prompt('الدقائق الفعلية:', String(operation.plannedMinutes || 0));
    if (minutes === null) return;
    run(() => service.completeOperation(operation.id, Number(minutes)), 'تم إكمال العملية.');
  };

  const openShiftFor = (branchId: string) => {
    try { return new OperationsShiftService().getOpenShiftForBranch(branchId); }
    catch { return null; }
  };

  const exportOrders = () => {
    exportToExcel({
      title: 'تقرير أوامر الإنتاج',
      columns: [
        { key: 'orderNumber', label: 'رقم الأمر' },
        { key: 'productName', label: 'المنتج' },
        { key: 'quantity', label: 'الكمية' },
        { key: 'priority', label: 'الأولوية' },
        { key: 'status', label: 'الحالة' },
        { key: 'salesOrderNumber', label: 'أمر البيع' },
        { key: 'customerName', label: 'العميل' },
        { key: 'startDate', label: 'البدء' },
        { key: 'dueDate', label: 'الاستحقاق' },
      ],
      rows: orders.map((order) => ({
        orderNumber: order.orderNumber,
        productName: order.productName,
        quantity: order.quantity,
        priority: PRIORITY_OPTIONS.find((p) => p.value === order.priority)?.label || order.priority,
        status: ({ PLANNED: 'مخطط', RELEASED: 'صادر', IN_PROGRESS: 'قيد التنفيذ', COMPLETED: 'مكتمل', CANCELLED: 'ملغى' } as Record<string, string>)[order.status] || order.status,
        salesOrderNumber: order.salesOrderNumber || '',
        customerName: order.customerName || '',
        startDate: order.startDate || '',
        dueDate: order.dueDate || '',
      })),
      fileName: 'production-orders',
      kpis: [
        { label: 'إجمالي الأوامر', value: orders.length },
        { label: 'قيد التنفيذ', value: orders.filter((o) => o.status === 'IN_PROGRESS').length },
        { label: 'مكتملة', value: orders.filter((o) => o.status === 'COMPLETED').length },
      ],
      permission: 'manufacturing.export',
    });
  };

  const salesProgress = (salesOrderId: string | null) => {
    if (!salesOrderId) return null;
    try { return service.getSalesOrderProductionProgress(salesOrderId); }
    catch { return null; }
  };

  const renderExpanded = (order: any) => {
    const cost = costByOrder.get(order.id);
    const progress = salesProgress(order.salesOrderId);
    return (
      <div className="grid gap-3 p-3 md:grid-cols-2">
        <div>
          <h4 className="mb-1 text-xs font-black text-slate-700">المواد</h4>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-start text-slate-500">
                <th className="py-1 text-start">المادة</th><th className="text-start">مخطط</th><th className="text-start">مصروف</th><th className="text-start">الحالة</th><th />
              </tr>
            </thead>
            <tbody>
              {(order.materials || []).map((material: any) => (
                <tr key={material.id} className="border-t border-slate-100">
                  <td className="py-1">{material.productName || material.productId}</td>
                  <td>{material.plannedQty}</td>
                  <td>{material.consumedQty}</td>
                  <td>{material.status}</td>
                  <td>
                    {canManage && !['COMPLETED', 'CONSUMED'].includes(order.status) && Number(material.consumedQty) < Number(material.plannedQty) && (
                      <button className="rounded bg-sky-50 px-2 py-0.5 text-sky-700" onClick={() => consume(material)}>صرف</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h4 className="mb-1 text-xs font-black text-slate-700">العمليات</h4>
          {(order.operations || []).length === 0 ? (
            <p className="text-xs text-slate-400">لا توجد عمليات معرفة.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-start text-slate-500">
                  <th className="py-1 text-start">مركز العمل</th><th className="text-start">مخطط (د)</th><th className="text-start">فعلي (د)</th><th className="text-start">الحالة</th><th />
                </tr>
              </thead>
              <tbody>
                {(order.operations || []).map((operation: any) => (
                  <tr key={operation.id} className="border-t border-slate-100">
                    <td className="py-1">{operation.workCenterName || operation.workCenterId}</td>
                    <td>{operation.plannedMinutes}</td>
                    <td>{operation.actualMinutes}</td>
                    <td>{operation.status}</td>
                    <td>
                      {canManage && order.status === 'IN_PROGRESS' && ['PENDING', 'IN_PROGRESS'].includes(operation.status) && (
                        <button className="rounded bg-emerald-50 px-2 py-0.5 text-emerald-700" onClick={() => completeOperation(operation)}>إكمال</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {cost && (
            <div className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
              تكلفة الأمر: مواد {cost.materialCost} + عمالة {cost.laborCost} = <b>{cost.totalCost}</b> (للوحدة: {cost.costPerUnit})
            </div>
          )}
          {progress && progress.totalItems > 0 && (
            <div className="mt-2 rounded-lg bg-sky-50 p-2 text-xs text-sky-800">
              تقدم إنتاج أمر البيع {order.salesOrderNumber}: {progress.producedItems} مكتمل / {progress.inProductionItems} قيد التنفيذ / {progress.pendingItems} معلق
              {progress.allCompleted && ' — كل العناصر المنتجة'}
            </div>
          )}
          {canManage && ['PLANNED', 'RELEASED'].includes(order.status) && (() => {
            const openShift = openShiftFor(order.branchId);
            if (!openShift) {
              return order.operationShiftId
                ? <div className="mt-2 text-xs text-slate-500">مرتبط بورديات التشغيل: {order.operationShiftId}</div>
                : null;
            }
            return (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-500">وردية مفتوحة: {openShift.definitionName || openShift.shiftNumber}</span>
                {order.status === 'RELEASED' && !order.operationShiftId && (
                  <button className="rounded bg-sky-50 px-2 py-0.5 text-sky-700" onClick={() => run(() => service.assignOrderToShift(order.id, openShift.id), 'تم ربط الأمر بالوردية.')}>ربط بالوردية</button>
                )}
                {order.status === 'RELEASED' && (
                  <button className="rounded bg-amber-50 px-2 py-0.5 text-amber-700" onClick={() => run(() => service.startOrder(order.id, openShift.id), 'تم بدء الأمر بالوردية.')}>بدء بالوردية</button>
                )}
              </div>
            );
          })()}
          {order.notes && <div className="mt-2 text-xs text-slate-500">ملاحظات: {order.notes}</div>}
        </div>
      </div>
    );
  };

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <div className="mb-2 flex flex-wrap items-center gap-1">
          <button onClick={() => setStatusFilter('')} className={`rounded-full px-3 py-1 text-xs font-bold ${!statusFilter ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600'}`}>الكل</button>
          {['PLANNED', 'RELEASED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map((status) => (
            <button key={status} onClick={() => setStatusFilter(status)} className={`rounded-full px-3 py-1 text-xs font-bold ${statusFilter === status ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{statusBadge(status)}</button>
          ))}
          <button onClick={exportOrders} className="mr-auto flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700" title="تصدير Excel">
            <Download className="h-3.5 w-3.5" /> تصدير
          </button>
        </div>
        <DataTable
          ariaLabel="أوامر الإنتاج"
          rows={orders}
          rowKey={(order) => order.id}
          onRowClick={(order) => setExpandedId(expandedId === order.id ? null : order.id)}
          isRowExpanded={(order) => expandedId === order.id}
          renderExpandedRow={renderExpanded}
          columns={[
            { key: 'number', header: 'الرقم', render: (order) => <span className="font-mono text-xs">{order.orderNumber}</span> },
            { key: 'product', header: 'المنتج', render: (order) => order.productName },
            { key: 'qty', header: 'الكمية', render: (order) => order.quantity },
            { key: 'priority', header: 'الأولوية', render: (order) => PRIORITY_OPTIONS.find((p) => p.value === order.priority)?.label || order.priority },
            { key: 'status', header: 'الحالة', render: (order) => statusBadge(order.status) },
            { key: 'sales', header: 'أمر البيع', render: (order) => order.salesOrderNumber ? <span className="font-mono text-xs">{order.salesOrderNumber}</span> : '—' },
            { key: 'customer', header: 'العميل', render: (order) => order.customerName || '—' },
            { key: 'due', header: 'الاستحقاق', render: (order) => order.dueDate || '—' },
            {
              key: 'action', header: 'الإجراء',
              render: (order) => (
                <div className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
                  {canManage && order.status === 'PLANNED' && (
                    <>
                      <button className="rounded bg-sky-50 px-2 py-1 text-xs text-sky-700" onClick={() => run(() => service.releaseOrder(order.id), 'تم إصدار الأمر.')}>إصدار</button>
                      <button className="rounded bg-rose-50 px-2 py-1 text-xs text-rose-700" onClick={() => { if (window.confirm('إلغاء أمر الإنتاج؟')) run(() => service.cancelOrder(order.id), 'تم إلغاء الأمر.'); }}>إلغاء</button>
                    </>
                  )}
                  {canManage && order.status === 'RELEASED' && (
                    <button className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-700" onClick={() => run(() => service.startOrder(order.id), 'تم بدء الأمر.')}>بدء</button>
                  )}
                  {canManage && order.status === 'IN_PROGRESS' && (
                    <>
                      <button className="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-700" onClick={() => { if (window.confirm('إكمال أمر الإنتاج؟ سيتم صرف جميع المواد.')) run(() => service.completeOrder(order.id), 'تم إكمال الأمر.'); }}>إكمال</button>
                      <button className="rounded bg-rose-50 px-2 py-1 text-xs text-rose-700" onClick={() => { if (window.confirm('إلغاء أمر الإنتاج؟')) run(() => service.cancelOrder(order.id), 'تم إلغاء الأمر.'); }}>إلغاء</button>
                    </>
                  )}
                </div>
              ),
            },
          ]}
          emptyTitle="لا توجد أوامر إنتاج."
        />
      </div>

      {canManage && (
        <form onSubmit={create} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-xs">
          <h3 className="font-black text-slate-900">إنشاء أمر إنتاج</h3>
          <ProductPicker
            required
            value={form.productId}
            selectedLabel={data.products.find((product) => product.id === form.productId)?.name}
            placeholder="المنتج"
            ariaLabel="استعراض أصناف أمر الإنتاج"
            onChange={(productId) => setForm({ ...form, productId, bomId: '' })}
          />
          <select required value={form.bomId} onChange={(e) => setForm({ ...form, bomId: e.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-1.5">
            <option value="">BOM نشط{form.productId ? ' للمنتج' : ''}</option>
            {activeBoms.map((bom) => <option key={bom.id} value={bom.id}>{bom.name} ({bom.version})</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input required type="number" min="0.001" step="0.001" placeholder="الكمية" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="rounded-lg border border-slate-200 px-2 py-1.5" />
            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="rounded-lg border border-slate-200 px-2 py-1.5">
              {PRIORITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-slate-500">تاريخ البدء<input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5" /></label>
            <label className="text-slate-500">الاستحقاق<input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5" /></label>
          </div>
          <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-1.5">
            <option value="">الفرع الافتراضي</option>
            {data.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
          <select value={form.warehouseId} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-1.5">
            <option value="">المخزن الافتراضي للفرع</option>
            {data.warehouses.map((warehouse: any) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
          </select>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-600">العمليات / مراكز العمل</span>
              <button type="button" className="text-sky-600" onClick={() => setOperations([...operations, { workCenterId: '', plannedMinutes: '' }])}>+ إضافة عملية</button>
            </div>
            {operations.map((op, index) => (
              <div key={index} className="grid grid-cols-[1fr_80px_28px] gap-1">
                <select required value={op.workCenterId} onChange={(e) => setOperations(operations.map((o, i) => i === index ? { ...o, workCenterId: e.target.value } : o))} className="rounded-lg border border-slate-200 px-2 py-1.5">
                  <option value="">مركز العمل</option>
                  {data.workCenters.map((wc) => <option key={wc.id} value={wc.id}>{wc.name}</option>)}
                </select>
                <input type="number" min="0" placeholder="دقائق" value={op.plannedMinutes} onChange={(e) => setOperations(operations.map((o, i) => i === index ? { ...o, plannedMinutes: e.target.value } : o))} className="rounded-lg border border-slate-200 px-2 py-1.5" />
                <button type="button" className="rounded-lg border border-slate-200 text-rose-500" onClick={() => setOperations(operations.filter((_, i) => i !== index))}>×</button>
              </div>
            ))}
          </div>

          <input placeholder="ملاحظات" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-1.5" />
          <button type="submit" className="flex w-full items-center justify-center gap-1 rounded-lg bg-sky-600 py-1.5 font-bold text-white">
            <Plus className="h-3.5 w-3.5" /> إنشاء
          </button>
        </form>
      )}
    </div>
  );
};
