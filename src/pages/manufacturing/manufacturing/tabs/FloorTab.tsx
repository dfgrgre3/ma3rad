import React, { useCallback, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, Factory, PackageCheck, PackageMinus, Play, TimerOff,
} from 'lucide-react';
import { DataTable } from '../../../../components/ui/DataTable';
import { Modal } from '../../../../components/ui/Modal';
import { usePermission } from '../../../../hooks/domains/auth/usePermission';
import { statusBadge } from './OverviewTab';
import type { TabProps } from './OverviewTab';

const PRIORITY_LABEL: Record<string, string> = { LOW: 'منخفضة', MEDIUM: 'متوسطة', HIGH: 'عالية', URGENT: 'عاجلة' };

const OP_STATUS: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'منتظرة', className: 'bg-surface-sunken text-ink-secondary' },
  IN_PROGRESS: { label: 'جارية', className: 'bg-warning-soft text-warning' },
  COMPLETED: { label: 'مكتملة', className: 'bg-success-soft text-success' },
  SKIPPED: { label: 'متخطاة', className: 'bg-surface-sunken text-muted' },
};

const MAT_STATUS: Record<string, string> = {
  PLANNED: 'مخططة', RESERVED: 'محجوزة', ISSUED: 'مصروفة جزئياً', CONSUMED: 'مصروفة', SHORTAGE: 'ناقص',
};

const isOverdue = (dueDate: string | null) => !!dueDate && dueDate < new Date().toISOString().slice(0, 10);

type ModalState =
  | { kind: 'completeOp'; order: any; operation: any }
  | { kind: 'skipOp'; order: any; operation: any }
  | { kind: 'downtime'; order: any; operation?: any }
  | { kind: 'issue'; order: any; material: any }
  | { kind: 'receive'; order: any };

export const FloorTab: React.FC<TabProps> = ({ service, data, reload, canManage, toast }) => {
  const can = usePermission();
  const canExecute = canManage || can('manufacturing.orders.execute');
  const canRecordDowntime = canManage || can('manufacturing.maintenance.manage');

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, any>>({});
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
  const [modal, setModal] = useState<ModalState | null>(null);
  const [modalQty, setModalQty] = useState('');
  const [modalReason, setModalReason] = useState('');
  const [busy, setBusy] = useState(false);

  const loadDetail = useCallback((orderId: string) => {
    if (details[orderId]) return;
    try {
      const order = service.getProductionOrder(orderId);
      setDetails((prev) => ({ ...prev, [orderId]: order }));
      setDetailErrors((prev) => ({ ...prev, [orderId]: '' }));
    } catch (error: any) {
      setDetailErrors((prev) => ({ ...prev, [orderId]: error?.message || 'تعذر تحميل التفاصيل.' }));
    }
  }, [service, details]);

  const toggleRow = (row: any) => {
    const next = expandedId === row.orderId ? null : row.orderId;
    setExpandedId(next);
    if (next) loadDetail(next);
  };

  const refresh = useCallback(() => {
    setDetails({});
    reload();
  }, [reload]);

  const run = (action: () => void, success: string) => {
    try {
      action();
      toast.success(success);
      refresh();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تنفيذ الإجراء.');
    }
  };

  const openModal = (state: ModalState, qty = '') => {
    setModal(state);
    setModalQty(qty);
    setModalReason('');
  };

  const submitModal = () => {
    if (!modal || busy) return;
    setBusy(true);
    try {
      if (modal.kind === 'completeOp') {
        service.completeOperation(modal.operation.id, Number(modalQty));
        toast.success('تم إكمال العملية.');
      } else if (modal.kind === 'skipOp') {
        service.skipOperation(modal.operation.id, modalReason || undefined);
        toast.success('تم تخطي العملية.');
      } else if (modal.kind === 'downtime') {
        service.recordDowntime({
          operationId: modal.operation?.id,
          workCenterId: modal.operation?.workCenterId,
          productionOrderId: modal.order.id,
          minutes: Number(modalQty),
          reason: modalReason || undefined,
        });
        toast.success('تم تسجيل التوقف.');
      } else if (modal.kind === 'issue') {
        service.consumeMaterial(modal.material.id, Number(modalQty));
        toast.success('تم تسجيل صرف المواد.');
      } else if (modal.kind === 'receive') {
        const produced = Number(modal.order.producedQty || 0);
        const remaining = Number(modal.order.quantity) - produced;
        const qty = modalQty === '' ? remaining : Number(modalQty);
        service.completeOrder(modal.order.id, qty);
        toast.success('تم استلام الإنتاج.');
      }
      setModal(null);
      refresh();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تنفيذ الإجراء.');
    } finally {
      setBusy(false);
    }
  };

  const modalDefaults = (): { title: string; qtyLabel?: string; qtyDefault: string; showReason?: boolean } => {
    if (!modal) return { title: '', qtyDefault: '' };
    if (modal.kind === 'completeOp') {
      return { title: `إكمال العملية #${modal.operation.sequence} — ${modal.operation.workCenterName || ''}`, qtyLabel: 'الدقائق الفعلية', qtyDefault: String(modal.operation.plannedMinutes ?? 0) };
    }
    if (modal.kind === 'downtime') {
      return { title: `تسجيل توقف — ${modal.order.orderNumber}`, qtyLabel: 'مدة التوقف (دقيقة)', qtyDefault: '30', showReason: true };
    }
    if (modal.kind === 'issue') {
      const remaining = Number(modal.material.plannedQty || 0) - Number(modal.material.consumedQty || 0);
      return { title: `صرف ${modal.material.productName || modal.material.productId}`, qtyLabel: 'الكمية المصروفة', qtyDefault: String(Math.max(0, remaining)) };
    }
    if (modal.kind === 'receive') {
      const remaining = Number(modal.order.quantity) - Number(modal.order.producedQty || 0);
      return { title: `استلام إنتاج — ${modal.order.orderNumber}`, qtyLabel: 'الكمية المستلمة', qtyDefault: String(Math.max(0, remaining)) };
    }
    return { title: 'تخطي العملية', showReason: true, qtyDefault: '' };
  };

  const rows = data.productionFloor || [];
  const inProgress = rows.filter((row) => row.status === 'IN_PROGRESS').length;
  const withShortages = rows.filter((row) => row.materialsShort > 0).length;
  const overdue = rows.filter((row) => isOverdue(row.dueDate)).length;

  const renderExpanded = (row: any) => {
    const order = details[row.orderId];
    if (!order) {
      return (
        <div className="p-4 text-xs text-muted">
          {detailErrors[row.orderId] || 'جارٍ تحميل تفاصيل الأمر…'}
        </div>
      );
    }
    const operations = order.operations || [];
    const materials = order.materials || [];
    const canIssue = canExecute && ['RELEASED', 'IN_PROGRESS'].includes(order.status);

    return (
      <div className="grid gap-3 p-3 lg:grid-cols-2">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <h4 className="text-xs font-black text-ink">العمليات ({operations.length})</h4>
            {canExecute && order.status === 'RELEASED' && (
              <button
                className="flex items-center gap-1 rounded-lg bg-warning px-2 py-1 text-xs font-bold text-white"
                onClick={() => run(() => service.startOrder(order.id, order.operationShiftId || undefined), 'تم بدء أمر الإنتاج.')}
              >
                <Play className="h-3 w-3" /> بدء الأمر
              </button>
            )}
            {canExecute && order.status === 'IN_PROGRESS' && Number(order.quantity) - Number(order.producedQty || 0) > 0 && (
              <button
                className="flex items-center gap-1 rounded-lg bg-success px-2 py-1 text-xs font-bold text-white"
                onClick={() => openModal({ kind: 'receive', order })}
              >
                <PackageCheck className="h-3 w-3" /> استلام إنتاج
              </button>
            )}
          </div>
          {operations.length === 0 ? (
            <p className="text-xs text-muted">لا توجد عمليات معرفة — يمكن صرف المواد مباشرة.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-start text-muted">
                  <th className="py-1 text-start">#</th>
                  <th className="text-start">مركز العمل</th>
                  <th className="text-start">مخطط (د)</th>
                  <th className="text-start">فعلي (د)</th>
                  <th className="text-start">المشغّل</th>
                  <th className="text-start">الحالة</th>
                  <th className="text-start">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {operations.map((operation: any) => {
                  const opMeta = OP_STATUS[operation.status] || { label: operation.status, className: 'bg-surface-sunken text-ink-secondary' };
                  return (
                    <tr key={operation.id} className="border-t border-line">
                      <td className="py-1">{operation.sequence}</td>
                      <td>{operation.workCenterName || '—'}</td>
                      <td>{operation.plannedMinutes}</td>
                      <td>{operation.actualMinutes || '—'}</td>
                      <td>
                        {canExecute && order.status === 'IN_PROGRESS' ? (
                          <select
                            value={operation.operatorId || ''}
                            onChange={(e) => run(() => service.setOperationOperator(operation.id, e.target.value || null), 'تم تعيين المشغّل.')}
                            className="rounded border border-line px-1 py-0.5 text-xs"
                          >
                            <option value="">—</option>
                            {(data.employees || []).map((emp: any) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                          </select>
                        ) : (operation.operatorName || '—')}
                      </td>
                      <td><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${opMeta.className}`}>{opMeta.label}</span></td>
                      <td>
                        {canExecute && order.status === 'IN_PROGRESS' && operation.status === 'PENDING' && (
                          <span className="flex gap-1">
                            <button className="rounded bg-accent-soft px-2 py-0.5 text-primary" onClick={() => run(() => service.startOperation(operation.id), 'تم تشغيل العملية.')}>بدء</button>
                            <button className="rounded bg-surface-muted px-2 py-0.5 text-ink-secondary" onClick={() => openModal({ kind: 'skipOp', order, operation })}>تخطي</button>
                          </span>
                        )}
                        {canExecute && order.status === 'IN_PROGRESS' && operation.status === 'IN_PROGRESS' && (
                          <span className="flex gap-1">
                            <button className="rounded bg-success-soft px-2 py-0.5 text-success" onClick={() => openModal({ kind: 'completeOp', order, operation }, String(operation.plannedMinutes ?? ''))}>إكمال</button>
                            {canRecordDowntime && (
                              <button className="rounded bg-warning-soft px-2 py-0.5 text-warning" onClick={() => openModal({ kind: 'downtime', order, operation })}>توقف</button>
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {order.notes && <p className="mt-1 text-[11px] text-muted">ملاحظات: {order.notes}</p>}
        </div>

        <div>
          <h4 className="mb-1 text-xs font-black text-ink">المواد ({materials.length})</h4>
          {materials.length === 0 ? (
            <p className="text-xs text-muted">لا توجد مواد معرفة.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-start text-muted">
                  <th className="py-1 text-start">المادة</th>
                  <th className="text-start">مخطط</th>
                  <th className="text-start">محجوز</th>
                  <th className="text-start">مصروف</th>
                  <th className="text-start">الحالة</th>
                  <th className="text-start">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {materials.map((material: any) => {
                  const remaining = Number(material.plannedQty || 0) - Number(material.consumedQty || 0);
                  const canIssueMaterial = canIssue && remaining > 0 && !['CONSUMED'].includes(material.status);
                  return (
                    <tr key={material.id} className="border-t border-line">
                      <td className="py-1">{material.productName || material.productId}</td>
                      <td>{material.plannedQty}</td>
                      <td>{material.reservedQty || 0}</td>
                      <td>{material.consumedQty}</td>
                      <td>{MAT_STATUS[material.status] || material.status}</td>
                      <td>
                        {canIssueMaterial && (
                          <button
                            className="flex items-center gap-1 rounded bg-accent-soft px-2 py-0.5 text-primary"
                            onClick={() => openModal({ kind: 'issue', order, material }, String(Math.max(0, remaining)))}
                          >
                            <PackageMinus className="h-3 w-3" /> صرف
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {canExecute && order.status === 'IN_PROGRESS' && (
            <button
              className="mt-2 flex items-center gap-1 rounded-lg bg-warning-soft px-2 py-1 text-xs font-bold text-warning"
              onClick={() => openModal({ kind: 'downtime', order })}
            >
              <TimerOff className="h-3 w-3" /> تسجيل توقف عام للأمر
            </button>
          )}
          {canRecordDowntime && order.status === 'IN_PROGRESS' && !operations.some((op: any) => op.status === 'IN_PROGRESS') && (
            <p className="mt-1 text-[10px] text-muted">التوقف العام لا يرتبط بعملية محددة.</p>
          )}
        </div>
      </div>
    );
  };

  const modalInfo = modalDefaults();
  const modalNeedsQty = modal?.kind !== 'skipOp';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-xs font-bold text-muted">أوامر نشطة</p>
          <p className="mt-1 text-2xl font-black text-ink">{rows.length}</p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-xs font-bold text-muted">قيد التنفيذ</p>
          <p className="mt-1 text-2xl font-black text-warning">{inProgress}</p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-xs font-bold text-muted">بنواقص مواد</p>
          <p className={`mt-1 text-2xl font-black ${withShortages > 0 ? 'text-danger' : 'text-success'}`}>{withShortages}</p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-xs font-bold text-muted">متجاوزة للاستحقاق</p>
          <p className={`mt-1 text-2xl font-black ${overdue > 0 ? 'text-danger' : 'text-ink'}`}>{overdue}</p>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-surface">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <Factory className="h-4 w-4 text-muted" />
          <h3 className="text-sm font-black text-ink">أوامر على أرضية الإنتاج</h3>
          <span className="text-[11px] text-muted">اضغط على أي أمر لعرض عملياته ومواده وتنفيذها</span>
        </div>
        {rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted">لا توجد أوامر صادرة أو قيد التنفيذ حالياً.</p>
        ) : (
          <DataTable
            ariaLabel="أرضية الإنتاج"
            rows={rows}
            rowKey={(row) => row.orderId}
            onRowClick={toggleRow}
            isRowExpanded={(row) => expandedId === row.orderId}
            renderExpandedRow={renderExpanded}
            columns={[
              { key: 'number', header: 'الرقم', render: (row) => <span className="font-mono text-xs">{row.orderNumber}</span> },
              { key: 'product', header: 'المنتج', render: (row) => row.productName },
              {
                key: 'qty', header: 'الكمية',
                render: (row) => (
                  <span>
                    {Number(row.producedQty || 0) > 0
                      ? <span>{Number(row.producedQty)}/{row.quantity}</span>
                      : row.quantity}
                    {(row.qcHeldQty || 0) > 0 && (
                      <span className="mr-1 rounded bg-warning-soft px-1.5 py-0.5 text-[10px] font-bold text-warning">
                        محجوز فحص {row.qcHeldQty}
                      </span>
                    )}
                  </span>
                ),
              },
              { key: 'priority', header: 'الأولوية', render: (row) => PRIORITY_LABEL[row.priority] || row.priority },
              { key: 'status', header: 'الحالة', render: (row) => statusBadge(row.status) },
              {
                key: 'progress', header: 'التقدم',
                render: (row) => (
                  <div className="w-32">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
                      <div className="h-full rounded-full bg-success" style={{ width: `${row.progressPercent}%` }} />
                    </div>
                    <p className="mt-1 text-[11px] text-muted">
                      {row.opsCompleted}/{row.opsTotal} عملية · {row.progressPercent}%
                    </p>
                  </div>
                ),
              },
              {
                key: 'current', header: 'العملية الحالية',
                render: (row) => row.currentOperation ? (
                  <span className="text-xs text-ink-secondary">
                    {row.currentOperation.workCenterName || '—'} #{row.currentOperation.sequence}
                    {row.currentOperation.status === 'IN_PROGRESS' && <span className="mr-1 text-warning">●</span>}
                  </span>
                ) : '—',
              },
              {
                key: 'materials', header: 'المواد',
                render: (row) => (
                  <span className={`text-xs ${row.materialsShort > 0 ? 'font-bold text-danger' : 'text-ink-secondary'}`}>
                    {Math.round(row.materialsConsumedQty * 10) / 10}/{Math.round(row.materialsPlannedQty * 10) / 10}
                    {row.materialsShort > 0 && (
                      <span className="mr-1 inline-flex items-center gap-0.5 text-danger"><AlertTriangle className="h-3 w-3" />{row.materialsShort}</span>
                    )}
                  </span>
                ),
              },
              { key: 'shift', header: 'الوردية', render: (row) => row.operationShiftId ? <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-primary">مربوطة</span> : '—' },
              {
                key: 'due', header: 'الاستحقاق',
                render: (row) => (
                  <span className={`text-xs ${isOverdue(row.dueDate) ? 'font-bold text-danger' : 'text-ink-secondary'}`}>
                    {row.dueDate || '—'}
                  </span>
                ),
              },
              { key: 'sales', header: 'أمر البيع', render: (row) => row.salesOrderNumber ? <span className="font-mono text-xs">{row.salesOrderNumber}</span> : '—' },
              { key: 'customer', header: 'العميل', render: (row) => row.customerName || '—' },
            ]}
          />
        )}
      </div>

      <Modal
        open={!!modal}
        onClose={() => !busy && setModal(null)}
        busy={busy}
        size="sm"
        title={modalInfo.title}
        icon={<CheckCircle2 className="h-4 w-4 text-primary" />}
        footer={
          <div className="flex gap-2">
            <button type="button" className="flex-1 rounded-lg border border-line px-3 py-1.5 text-xs" onClick={() => setModal(null)} disabled={busy}>إلغاء</button>
            <button
              type="button"
              className="flex-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
              onClick={submitModal}
              disabled={busy || (modalNeedsQty && (!Number.isFinite(Number(modalQty)) || Number(modalQty) < 0))}
            >
              {busy ? 'جارٍ…' : 'تأكيد'}
            </button>
          </div>
        }
      >
        <div className="space-y-2 text-xs">
          {modalNeedsQty && modalInfo.qtyLabel && (
            <label className="block">
              <span className="mb-1 block font-bold text-ink-secondary">{modalInfo.qtyLabel}</span>
              <input
                type="number" min="0" step="any" autoFocus
                value={modalQty}
                onChange={(e) => setModalQty(e.target.value)}
                className="w-full rounded-lg border border-line px-2 py-1.5"
              />
            </label>
          )}
          {modalInfo.showReason && (
            <label className="block">
              <span className="mb-1 block font-bold text-ink-secondary">السبب (اختياري)</span>
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
