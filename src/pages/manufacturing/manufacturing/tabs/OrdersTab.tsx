import React, { useMemo, useState } from 'react';
import { DataTable } from '../../../../components/ui/DataTable';
import { Modal } from '../../../../components/ui/Modal';
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

type OrderActionModal =
  | { kind: 'consume'; material: any }
  | { kind: 'completeOp'; operation: any }
  | { kind: 'skipOp'; operation: any }
  | { kind: 'downtime'; operation: any; order: any }
  | { kind: 'reject'; order: any }
  | { kind: 'receive'; order: any }
  | { kind: 'editOrder'; order: any };

export const OrdersTab: React.FC<TabProps> = ({ service, data, reload, canManage, toast }) => {
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState({
    productId: '', bomId: '', quantity: '', priority: 'MEDIUM',
    startDate: '', dueDate: '', branchId: '', warehouseId: '', notes: '',
  });
  const [operations, setOperations] = useState<OperationDraft[]>([]);
  const [actionModal, setActionModal] = useState<OrderActionModal | null>(null);
  const [modalQty, setModalQty] = useState('');
  const [modalReason, setModalReason] = useState('');
  const [modalBusy, setModalBusy] = useState(false);
  const [editOrderForm, setEditOrderForm] = useState({ priority: 'MEDIUM', startDate: '', dueDate: '', notes: '' });

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

  const openActionModal = (state: OrderActionModal, qty = '') => {
    setActionModal(state);
    setModalQty(qty);
    setModalReason('');
  };

  const consume = (material: any) => {
    const remaining = Number(material.plannedQty) - Number(material.consumedQty);
    if (remaining <= 0) return;
    openActionModal({ kind: 'consume', material }, String(remaining));
  };

  const completeOperation = (operation: any) => {
    openActionModal({ kind: 'completeOp', operation }, String(operation.plannedMinutes || 0));
  };

  const startOperation = (operation: any) => {
    run(() => service.startOperation(operation.id), 'تم تشغيل العملية.');
  };

  const skipOperation = (operation: any) => {
    openActionModal({ kind: 'skipOp', operation });
  };

  const recordOperationDowntime = (operation: any, order: any) => {
    openActionModal({ kind: 'downtime', operation, order }, '30');
  };

  const requestApproval = (order: any) => {
    run(() => service.requestOrderApproval(order.id), 'تم إرسال طلب الاعتماد.');
  };

  const approveOrder = (order: any) => {
    run(() => service.approveProductionOrder(order.id), 'تم اعتماد أمر الإنتاج.');
  };

  const rejectOrder = (order: any) => {
    openActionModal({ kind: 'reject', order });
  };

  const submitActionModal = () => {
    if (!actionModal || modalBusy) return;
    setModalBusy(true);
    try {
      if (actionModal.kind === 'consume') {
        service.consumeMaterial(actionModal.material.id, Number(modalQty));
        toast.success('تم تسجيل صرف المواد.');
      } else if (actionModal.kind === 'completeOp') {
        service.completeOperation(actionModal.operation.id, Number(modalQty));
        toast.success('تم إكمال العملية.');
      } else if (actionModal.kind === 'skipOp') {
        service.skipOperation(actionModal.operation.id, modalReason || undefined);
        toast.success('تم تخطي العملية.');
      } else if (actionModal.kind === 'downtime') {
        service.recordDowntime({
          operationId: actionModal.operation.id,
          workCenterId: actionModal.operation.workCenterId,
          productionOrderId: actionModal.order.id,
          minutes: Number(modalQty),
          reason: modalReason || undefined,
        });
        toast.success('تم تسجيل التوقف.');
      } else if (actionModal.kind === 'reject') {
        service.rejectProductionOrder(actionModal.order.id, modalReason || undefined);
        toast.success('تم رفض أمر الإنتاج.');
      } else if (actionModal.kind === 'receive') {
        const order = actionModal.order;
        const produced = Number(order.producedQty || 0);
        const remaining = Number(order.quantity) - produced;
        const qty = modalQty === '' ? remaining : Number(modalQty);
        const partial = qty < remaining - 1e-6;
        service.completeOrder(order.id, qty);
        toast.success(partial ? 'تم تسجيل استلام إنتاج جزئي.' : 'تم إكمال الأمر.');
      } else if (actionModal.kind === 'editOrder') {
        service.updateProductionOrder(actionModal.order.id, {
          priority: editOrderForm.priority as any,
          startDate: editOrderForm.startDate || null,
          dueDate: editOrderForm.dueDate || null,
          notes: editOrderForm.notes || null,
        });
        toast.success('تم تحديث أمر الإنتاج.');
      }
      setActionModal(null);
      reload();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تنفيذ الإجراء.');
    } finally {
      setModalBusy(false);
    }
  };

  const actionModalInfo = (): { title: string; qtyLabel?: string; showReason?: boolean; qtyDefault: string } => {
    if (!actionModal) return { title: '', qtyDefault: '' };
    if (actionModal.kind === 'consume') {
      const m = actionModal.material;
      return { title: `صرف ${m.productName || m.productId}`, qtyLabel: 'الكمية المصروفة', qtyDefault: String(Number(m.plannedQty || 0) - Number(m.consumedQty || 0)) };
    }
    if (actionModal.kind === 'completeOp') {
      const op = actionModal.operation;
      return { title: `إكمال العملية #${op.sequence}`, qtyLabel: 'الدقائق الفعلية', qtyDefault: String(op.plannedMinutes ?? 0) };
    }
    if (actionModal.kind === 'downtime') {
      return { title: `تسجيل توقف — ${actionModal.order.orderNumber}`, qtyLabel: 'مدة التوقف (دقيقة)', qtyDefault: '30', showReason: true };
    }
    if (actionModal.kind === 'receive') {
      const order = actionModal.order;
      const remaining = Number(order.quantity) - Number(order.producedQty || 0);
      return { title: `استلام إنتاج — ${order.orderNumber}`, qtyLabel: `الكمية المستلمة (المتبقي ${remaining})`, qtyDefault: String(Math.max(0, remaining)) };
    }
    if (actionModal.kind === 'reject') {
      return { title: `رفض اعتماد ${actionModal.order.orderNumber}`, showReason: true, qtyDefault: '' };
    }
    if (actionModal.kind === 'editOrder') {
      return { title: `تعديل ${actionModal.order.orderNumber}`, qtyDefault: '' };
    }
    return { title: 'تخطي العملية', showReason: true, qtyDefault: '' };
  };

  const assignOperator = (operation: any, employeeId: string) => {
    run(() => service.setOperationOperator(operation.id, employeeId || null), 'تم تعيين المشغّل.');
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
          <h4 className="mb-1 text-xs font-black text-ink">المواد</h4>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-start text-muted">
                <th className="py-1 text-start">المادة</th><th className="text-start">مخطط</th><th className="text-start">محجوز</th><th className="text-start">مصروف</th><th className="text-start">الحالة</th><th />
              </tr>
            </thead>
            <tbody>
              {(order.materials || []).map((material: any) => (
                <tr key={material.id} className="border-t border-line">
                  <td className="py-1">{material.productName || material.productId}</td>
                  <td>{material.plannedQty}</td>
                  <td>{material.reservedQty || 0}</td>
                  <td>{material.consumedQty}</td>
                  <td>{material.status}</td>
                  <td>
                    {canManage && !['COMPLETED', 'CONSUMED'].includes(order.status) && Number(material.consumedQty) < Number(material.plannedQty) && (
                      <button className="rounded bg-accent-soft px-2 py-0.5 text-primary" onClick={() => consume(material)}>صرف</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h4 className="mb-1 text-xs font-black text-ink">العمليات</h4>
          {(order.operations || []).length === 0 ? (
            <p className="text-xs text-muted">لا توجد عمليات معرفة.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-start text-muted">
                  <th className="py-1 text-start">مركز العمل</th><th className="text-start">مخطط (د)</th><th className="text-start">فعلي (د)</th><th className="text-start">المشغّل</th><th className="text-start">الحالة</th><th />
                </tr>
              </thead>
              <tbody>
                {(order.operations || []).map((operation: any) => (
                  <tr key={operation.id} className="border-t border-line">
                    <td className="py-1">{operation.workCenterName || operation.workCenterId}</td>
                    <td>{operation.plannedMinutes}</td>
                    <td>{operation.actualMinutes}</td>
                    <td>
                      {canManage && order.status === 'IN_PROGRESS' ? (
                        <select
                          value={operation.operatorId || ''}
                          onChange={(e) => assignOperator(operation, e.target.value)}
                          className="rounded border border-line px-1 py-0.5 text-xs"
                        >
                          <option value="">—</option>
                          {(data.employees || []).map((emp: any) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                        </select>
                      ) : (operation.operatorName || '—')}
                    </td>
                    <td>{operation.status}</td>
                    <td>
                      {canManage && order.status === 'IN_PROGRESS' && operation.status === 'PENDING' && (
                        <span className="flex gap-1">
                          <button className="rounded bg-accent-soft px-2 py-0.5 text-primary" onClick={() => startOperation(operation)}>بدء</button>
                          <button className="rounded bg-surface-muted px-2 py-0.5 text-ink-secondary" onClick={() => skipOperation(operation)}>تخطي</button>
                        </span>
                      )}
                      {canManage && order.status === 'IN_PROGRESS' && operation.status === 'IN_PROGRESS' && (
                        <span className="flex gap-1">
                          <button className="rounded bg-success-soft px-2 py-0.5 text-success" onClick={() => completeOperation(operation)}>إكمال</button>
                          <button className="rounded bg-warning-soft px-2 py-0.5 text-warning" onClick={() => recordOperationDowntime(operation, order)}>توقف</button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {cost && (
            <div className="mt-2 rounded-lg bg-surface-muted p-2 text-xs text-ink-secondary">
              تكلفة الأمر: مواد {cost.materialCost} + عمالة {cost.laborCost} = <b>{cost.totalCost}</b> (للوحدة: {cost.costPerUnit})
            </div>
          )}
          {progress && progress.totalItems > 0 && (
            <div className="mt-2 rounded-lg bg-accent-soft p-2 text-xs text-primary">
              تقدم إنتاج أمر البيع {order.salesOrderNumber}: {progress.producedItems} مكتمل / {progress.inProductionItems} قيد التنفيذ / {progress.pendingItems} معلق
              {progress.allCompleted && ' — كل العناصر المنتجة'}
            </div>
          )}
          {order.approvalStatus && order.approvalStatus !== 'NONE' && (
            <div className={`mt-2 flex flex-wrap items-center gap-2 rounded-lg p-2 text-xs ${
              order.approvalStatus === 'APPROVED' ? 'bg-success-soft text-success'
              : order.approvalStatus === 'REJECTED' ? 'bg-danger-soft text-danger'
              : 'bg-warning-soft text-warning'}`}>
              <span className="font-bold">
                الاعتماد: {order.approvalStatus === 'PENDING' ? 'بانتظار الاعتماد' : order.approvalStatus === 'APPROVED' ? 'معتمد' : 'مرفوض'}
              </span>
              {order.rejectionReason && <span>— {order.rejectionReason}</span>}
              {canManage && order.status === 'PLANNED' && order.approvalStatus !== 'PENDING' && order.approvalStatus !== 'APPROVED' && (
                <button className="rounded bg-surface px-2 py-0.5" onClick={() => requestApproval(order)}>طلب اعتماد</button>
              )}
              {canManage && order.status === 'PLANNED' && order.approvalStatus === 'PENDING' && (
                <>
                  <button className="rounded bg-success px-2 py-0.5 text-white" onClick={() => approveOrder(order)}>اعتماد</button>
                  <button className="rounded bg-danger-soft px-2 py-0.5 text-danger" onClick={() => rejectOrder(order)}>رفض</button>
                </>
              )}
            </div>
          )}
          {canManage && ['PLANNED', 'RELEASED'].includes(order.status) && (() => {
            const openShift = openShiftFor(order.branchId);
            if (!openShift) {
              return order.operationShiftId
                ? <div className="mt-2 text-xs text-muted">مرتبط بورديات التشغيل: {order.operationShiftId}</div>
                : null;
            }
            return (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted">وردية مفتوحة: {openShift.definitionName || openShift.shiftNumber}</span>
                {order.status === 'RELEASED' && !order.operationShiftId && (
                  <button className="rounded bg-accent-soft px-2 py-0.5 text-primary" onClick={() => run(() => service.assignOrderToShift(order.id, openShift.id), 'تم ربط الأمر بالوردية.')}>ربط بالوردية</button>
                )}
                {order.status === 'RELEASED' && (
                  <button className="rounded bg-warning-soft px-2 py-0.5 text-warning" onClick={() => run(() => service.startOrder(order.id, openShift.id), 'تم بدء الأمر بالوردية.')}>بدء بالوردية</button>
                )}
              </div>
            );
          })()}
          {(Number(order.producedQty || 0) > 0 || order.status === 'IN_PROGRESS') && (
            <div className="mt-2 rounded-lg bg-success-soft p-2 text-xs text-success">
              الإنتاج المستلم: {Number(order.producedQty || 0)} / {order.quantity}
              {(() => {
                const held = service.getQcHeldQuantity ? service.getQcHeldQuantity(order.id) : 0;
                return held > 0 ? <span className="mr-2 font-bold text-warning">· محجوز فحص نهائي: {held}</span> : null;
              })()}
            </div>
          )}
          {order.notes && <div className="mt-2 text-xs text-muted">ملاحظات: {order.notes}</div>}
          {(() => {
            try {
              const trace = service.getOrderTraceability?.(order.id);
              if (!trace) return null;
              return (
                <div className="mt-2 rounded-lg border border-line bg-surface-muted p-2 text-xs">
                  <div className="mb-1 font-bold text-ink">سلسلة التتبع</div>
                  {trace.salesOrderNumber && (
                    <div className="text-ink-secondary">أمر البيع: <span className="font-mono">{trace.salesOrderNumber}</span> — {trace.customerName || '—'}</div>
                  )}
                  {trace.producedBatches.length > 0 && (
                    <div className="text-ink-secondary">التشغيلات: {trace.producedBatches.map((b: any) => `${b.batchNumber} (${b.quantityRemaining}/${b.quantity})`).join('، ')}</div>
                  )}
                  {trace.materials.length > 0 && (
                    <div className="text-ink-secondary">
                      الخامات: {trace.materials.slice(0, 6).map((m: any) =>
                        `${m.componentName} ${m.quantity}${m.supplierName ? ` ← ${m.supplierName}` : ''}`
                      ).join('، ')}{trace.materials.length > 6 ? ` +${trace.materials.length - 6}` : ''}
                    </div>
                  )}
                  {trace.operators.length > 0 && (
                    <div className="text-ink-secondary">المشغلون: {trace.operators.map((o: any) => `${o.name} (${o.minutes} د)`).join('، ')}</div>
                  )}
                  {trace.reworkOrders.length > 0 && (
                    <div className="text-primary">أوامر إعادة عمل: {trace.reworkOrders.map((r: any) => `${r.orderNumber} (${r.quantity})`).join('، ')}</div>
                  )}
                </div>
              );
            } catch { return null; }
          })()}
        </div>
      </div>
    );
  };

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <div className="mb-2 flex flex-wrap items-center gap-1">
          <button onClick={() => setStatusFilter('')} className={`rounded-full px-3 py-1 text-xs font-bold ${!statusFilter ? 'bg-primary text-white' : 'bg-surface-sunken text-ink-secondary'}`}>الكل</button>
          {['PLANNED', 'RELEASED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map((status) => (
            <button key={status} onClick={() => setStatusFilter(status)} className={`rounded-full px-3 py-1 text-xs font-bold ${statusFilter === status ? 'bg-primary text-white' : 'bg-surface-sunken text-ink-secondary'}`}>{statusBadge(status)}</button>
          ))}
          <button onClick={exportOrders} className="mr-auto flex items-center gap-1 rounded-full bg-success-soft px-3 py-1 text-xs font-bold text-success" title="تصدير Excel">
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
            {
              key: 'number', header: 'الرقم',
              render: (order) => (
                <span className="font-mono text-xs">
                  {order.orderNumber}
                  {order.reworkOfOrderId && (
                    <span className="mr-1 rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold text-primary" title="أمر إعادة عمل">RW</span>
                  )}
                </span>
              ),
            },
            { key: 'product', header: 'المنتج', render: (order) => order.productName },
            {
              key: 'qty', header: 'الكمية',
              render: (order) => {
                const produced = Number(order.producedQty || 0);
                return produced > 0 ? <span>{produced}/{order.quantity}</span> : order.quantity;
              },
            },
            { key: 'priority', header: 'الأولوية', render: (order) => PRIORITY_OPTIONS.find((p) => p.value === order.priority)?.label || order.priority },
            { key: 'status', header: 'الحالة', render: (order) => statusBadge(order.status) },
            { key: 'sales', header: 'أمر البيع', render: (order) => order.salesOrderNumber ? <span className="font-mono text-xs">{order.salesOrderNumber}</span> : '—' },
            { key: 'customer', header: 'العميل', render: (order) => order.customerName || '—' },
            { key: 'due', header: 'الاستحقاق', render: (order) => order.dueDate || '—' },
            {
              key: 'action', header: 'الإجراء',
              render: (order) => (
                <div className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
                  {canManage && order.status === 'PLANNED' && order.approvalStatus !== 'PENDING' && (
                    <button
                      className="rounded bg-accent-soft px-2 py-1 text-xs text-primary"
                      onClick={() => {
                        setEditOrderForm({
                          priority: order.priority || 'MEDIUM',
                          startDate: order.startDate || '',
                          dueDate: order.dueDate || '',
                          notes: order.notes || '',
                        });
                        openActionModal({ kind: 'editOrder', order });
                      }}
                    >تعديل</button>
                  )}
                  {canManage && order.status === 'PLANNED' && (
                    <>
                      <button className="rounded bg-accent-soft px-2 py-1 text-xs text-primary" onClick={() => run(() => service.releaseOrder(order.id), 'تم إصدار الأمر.')}>إصدار</button>
                      <button className="rounded bg-danger-soft px-2 py-1 text-xs text-danger" onClick={() => { if (window.confirm('إلغاء أمر الإنتاج؟')) run(() => service.cancelOrder(order.id), 'تم إلغاء الأمر.'); }}>إلغاء</button>
                    </>
                  )}
                  {canManage && order.status === 'RELEASED' && (
                    <button className="rounded bg-warning-soft px-2 py-1 text-xs text-warning" onClick={() => run(() => service.startOrder(order.id), 'تم بدء الأمر.')}>بدء</button>
                  )}
                  {canManage && order.status === 'IN_PROGRESS' && (
                    <>
                      <button className="rounded bg-success-soft px-2 py-1 text-xs text-success" onClick={() => {
                        const produced = Number(order.producedQty || 0);
                        const remaining = Number(order.quantity) - produced;
                        openActionModal({ kind: 'receive', order }, String(Math.max(0, remaining)));
                      }}>استلام إنتاج</button>
                      <button className="rounded bg-danger-soft px-2 py-1 text-xs text-danger" onClick={() => { if (window.confirm('إلغاء أمر الإنتاج؟')) run(() => service.cancelOrder(order.id), 'تم إلغاء الأمر.'); }}>إلغاء</button>
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
        <form onSubmit={create} className="space-y-2 rounded-xl border border-line bg-surface p-3 text-xs">
          <h3 className="font-black text-ink">إنشاء أمر إنتاج</h3>
          <ProductPicker
            required
            value={form.productId}
            selectedLabel={data.products.find((product) => product.id === form.productId)?.name}
            placeholder="المنتج"
            ariaLabel="استعراض أصناف أمر الإنتاج"
            onChange={(productId) => setForm({ ...form, productId, bomId: '' })}
          />
          <select required value={form.bomId} onChange={(e) => setForm({ ...form, bomId: e.target.value })} className="w-full rounded-lg border border-line px-2 py-1.5">
            <option value="">BOM نشط{form.productId ? ' للمنتج' : ''}</option>
            {activeBoms.map((bom) => <option key={bom.id} value={bom.id}>{bom.name} ({bom.version})</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input required type="number" min="0.001" step="0.001" placeholder="الكمية" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="rounded-lg border border-line px-2 py-1.5" />
            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="rounded-lg border border-line px-2 py-1.5">
              {PRIORITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-muted">تاريخ البدء<input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="mt-0.5 w-full rounded-lg border border-line px-2 py-1.5" /></label>
            <label className="text-muted">الاستحقاق<input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="mt-0.5 w-full rounded-lg border border-line px-2 py-1.5" /></label>
          </div>
          <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} className="w-full rounded-lg border border-line px-2 py-1.5">
            <option value="">الفرع الافتراضي</option>
            {data.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
          <select value={form.warehouseId} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })} className="w-full rounded-lg border border-line px-2 py-1.5">
            <option value="">المخزن الافتراضي للفرع</option>
            {data.warehouses.map((warehouse: any) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
          </select>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-ink-secondary">العمليات / مراكز العمل</span>
              <button type="button" className="text-primary" onClick={() => setOperations([...operations, { workCenterId: '', plannedMinutes: '' }])}>+ إضافة عملية</button>
            </div>
            {operations.map((op, index) => (
              <div key={index} className="grid grid-cols-[1fr_80px_28px] gap-1">
                <select required value={op.workCenterId} onChange={(e) => setOperations(operations.map((o, i) => i === index ? { ...o, workCenterId: e.target.value } : o))} className="rounded-lg border border-line px-2 py-1.5">
                  <option value="">مركز العمل</option>
                  {data.workCenters.map((wc) => <option key={wc.id} value={wc.id}>{wc.name}</option>)}
                </select>
                <input type="number" min="0" placeholder="دقائق" value={op.plannedMinutes} onChange={(e) => setOperations(operations.map((o, i) => i === index ? { ...o, plannedMinutes: e.target.value } : o))} className="rounded-lg border border-line px-2 py-1.5" />
                <button type="button" className="rounded-lg border border-line text-danger" onClick={() => setOperations(operations.filter((_, i) => i !== index))}>×</button>
              </div>
            ))}
          </div>

          <input placeholder="ملاحظات" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full rounded-lg border border-line px-2 py-1.5" />
          <button type="submit" className="flex w-full items-center justify-center gap-1 rounded-lg bg-primary py-1.5 font-bold text-white">
            <Plus className="h-3.5 w-3.5" /> إنشاء
          </button>
        </form>
      )}

      <Modal
        open={!!actionModal}
        onClose={() => !modalBusy && setActionModal(null)}
        busy={modalBusy}
        size="sm"
        title={actionModalInfo().title}
        footer={
          <div className="flex gap-2">
            <button type="button" className="flex-1 rounded-lg border border-line px-3 py-1.5 text-xs" onClick={() => setActionModal(null)} disabled={modalBusy}>إلغاء</button>
            <button
              type="button"
              className="flex-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
              onClick={submitActionModal}
              disabled={modalBusy || (actionModal != null && !['skipOp', 'reject', 'editOrder'].includes(actionModal.kind) && (!Number.isFinite(Number(modalQty)) || Number(modalQty) < 0))}
            >
              {modalBusy ? 'جارٍ…' : 'تأكيد'}
            </button>
          </div>
        }
      >
        <div className="space-y-2 text-xs">
          {actionModal?.kind === 'editOrder' && (
            <>
              <label className="block">
                <span className="mb-1 block font-bold text-ink-secondary">الأولوية</span>
                <select value={editOrderForm.priority} onChange={(e) => setEditOrderForm({ ...editOrderForm, priority: e.target.value })} className="w-full rounded-lg border border-line px-2 py-1.5">
                  {PRIORITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block font-bold text-ink-secondary">تاريخ البدء</span>
                  <input type="date" value={editOrderForm.startDate} onChange={(e) => setEditOrderForm({ ...editOrderForm, startDate: e.target.value })} className="w-full rounded-lg border border-line px-2 py-1.5" />
                </label>
                <label className="block">
                  <span className="mb-1 block font-bold text-ink-secondary">الاستحقاق</span>
                  <input type="date" value={editOrderForm.dueDate} onChange={(e) => setEditOrderForm({ ...editOrderForm, dueDate: e.target.value })} className="w-full rounded-lg border border-line px-2 py-1.5" />
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block font-bold text-ink-secondary">ملاحظات</span>
                <input type="text" value={editOrderForm.notes} onChange={(e) => setEditOrderForm({ ...editOrderForm, notes: e.target.value })} className="w-full rounded-lg border border-line px-2 py-1.5" />
              </label>
            </>
          )}
          {actionModal?.kind !== 'editOrder' && actionModal?.kind !== 'skipOp' && actionModal?.kind !== 'reject' && actionModalInfo().qtyLabel && (
            <label className="block">
              <span className="mb-1 block font-bold text-ink-secondary">{actionModalInfo().qtyLabel}</span>
              <input
                type="number" min="0" step="any" autoFocus
                value={modalQty}
                onChange={(e) => setModalQty(e.target.value)}
                className="w-full rounded-lg border border-line px-2 py-1.5"
              />
            </label>
          )}
          {actionModalInfo().showReason && (
            <label className="block">
              <span className="mb-1 block font-bold text-ink-secondary">{actionModal?.kind === 'reject' ? 'سبب الرفض' : 'السبب'} (اختياري)</span>
              <input
                type="text"
                value={modalReason}
                onChange={(e) => setModalReason(e.target.value)}
                className="w-full rounded-lg border border-line px-2 py-1.5"
              />
            </label>
          )}
        </div>
      </Modal>
    </div>
  );
};
