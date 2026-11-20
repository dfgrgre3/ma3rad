import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardCheck, FileSignature, Plus, RefreshCw, Wrench } from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { ActivityGate } from '../../../components/ui/ActivityGate';
import { Card, StatCard } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { FormField } from '../../../components/ui/FormField';
import { useToast } from '../../../components/ui/Toast';
import { usePermission } from '../../../hooks/domains/auth/usePermission';
import { CustomerService } from '../../../services/domains/customers/CustomerService';
import { ProductService } from '../../../services/domains/products/ProductService';
import type { Customer, Product } from '../../../types';
import {
  WorkshopService,
  type InspectionItem,
  type WorkOrderPart,
  type WorkOrderStatus,
  type WorkshopWorkOrder,
} from '../../../services/domains/workshop/WorkshopService';

const currency = new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 });
const inputCls = 'w-full rounded-lg border border-[var(--cerami-border)] bg-[var(--cerami-surface)] px-3 py-2 text-sm';
const selectCls = inputCls;

const STATUS_LABEL: Record<WorkOrderStatus, string> = {
  RECEIVED: 'مستلم', INSPECTION: 'فحص', WAITING_APPROVAL: 'بانتظار الموافقة',
  APPROVED: 'معتمد', IN_PROGRESS: 'قيد التنفيذ', READY: 'جاهز للتسليم',
  DELIVERED: 'تم التسليم', CANCELLED: 'ملغي',
};
const STATUS_TONE: Record<WorkOrderStatus, string> = {
  RECEIVED: 'bg-surface-sunken text-ink-secondary', INSPECTION: 'bg-accent-soft text-primary',
  WAITING_APPROVAL: 'bg-warning-soft text-warning', APPROVED: 'bg-accent-soft text-primary',
  IN_PROGRESS: 'bg-accent-soft text-primary', READY: 'bg-success-soft text-success',
  DELIVERED: 'bg-success-soft text-success', CANCELLED: 'bg-danger-soft text-danger',
};
const NEXT_ACTION: Partial<Record<WorkOrderStatus, { to: WorkOrderStatus; label: string }[]>> = {
  RECEIVED: [{ to: 'INSPECTION', label: 'بدء الفحص' }],
  INSPECTION: [{ to: 'WAITING_APPROVAL', label: 'إرسال للموافقة' }, { to: 'IN_PROGRESS', label: 'بدء التنفيذ' }],
  WAITING_APPROVAL: [{ to: 'APPROVED', label: 'اعتماد' }],
  APPROVED: [{ to: 'IN_PROGRESS', label: 'بدء التنفيذ' }],
  IN_PROGRESS: [{ to: 'READY', label: 'جاهز' }],
  READY: [{ to: 'DELIVERED', label: 'تسليم' }],
};
const INSP_LABEL: Record<string, string> = { OK: 'سليم', NEEDS_REPAIR: 'يحتاج صيانة', NOT_CHECKED: 'لم يُفحص' };

export const WorkshopPage: React.FC = () => {
  const service = useMemo(() => new WorkshopService(), []);
  const toast = useToast();
  const can = usePermission();
  const canManage = can('operations.view') && (can('orders.update') || can('orders.create'));

  const [orders, setOrders] = useState<WorkshopWorkOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<WorkshopWorkOrder | null>(null);
  const [detailTab, setDetailTab] = useState<'inspection' | 'parts' | 'approval'>('inspection');
  const [inspection, setInspection] = useState<InspectionItem[]>([]);
  const [parts, setParts] = useState<WorkOrderPart[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [stats, setStats] = useState<ReturnType<WorkshopService['getDashboardStats']> | null>(null);
  const [statusFilter, setStatusFilter] = useState('');

  const [orderModal, setOrderModal] = useState(false);
  const [orderForm, setOrderForm] = useState({ customerId: '', vehiclePlate: '', vehicleMake: '', vehicleModel: '', vehicleYear: '', vin: '', odometerKm: '', complaint: '', promisedDate: '' });
  const [partModal, setPartModal] = useState(false);
  const [partForm, setPartForm] = useState({ productId: '', partName: '', quantity: '1', unitPrice: '0' });
  const [approveModal, setApproveModal] = useState(false);
  const [approveForm, setApproveForm] = useState({ approvedByName: '', notes: '', signatureData: '' });

  const run = useCallback((fn: () => void) => {
    try { fn(); } catch (e: any) { toast.error('خطأ', e?.message || 'حدث خطأ'); }
  }, [toast]);

  const loadOrders = useCallback(() => {
    setLoading(true);
    try {
      setOrders(service.getWorkOrders(statusFilter ? { status: statusFilter as WorkOrderStatus } : undefined));
      setStats(service.getDashboardStats());
      setCustomers(can('customers.view') ? new CustomerService().getAllCustomers() : []);
      setProducts(can('products.view') ? new ProductService().getAllProducts() : []);
    } catch (e: any) {
      toast.error('تعذر تحميل أوامر العمل', e?.message);
    } finally {
      setLoading(false);
    }
  }, [service, statusFilter, can, toast]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const openDetail = (order: WorkshopWorkOrder) => {
    setSelected(order);
    setInspection(service.getInspectionItems(order.id));
    setParts(service.getWorkOrderParts(order.id));
    setApprovals(service.getApprovals(order.id));
    setDetailTab('inspection');
  };

  const refreshDetail = () => {
    if (!selected) return;
    const fresh = service.getWorkOrderById(selected.id);
    if (fresh) { setSelected(fresh); openDetail(fresh); }
    loadOrders();
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="ورشة صيانة السيارات"
        description="أوامر العمل، الفحص الفني، طلبات القطع وموافقة العميل بالتوقيع."
        icon={<Wrench className="w-6 h-6" />}
        actions={<div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={loadOrders} leadingIcon={<RefreshCw className="w-4 h-4" />}>تحديث</Button>
          {canManage && <ActivityGate element="new-work-order"><Button size="sm" onClick={() => { setOrderForm({ customerId: '', vehiclePlate: '', vehicleMake: '', vehicleModel: '', vehicleYear: '', vin: '', odometerKm: '', complaint: '', promisedDate: '' }); setOrderModal(true); }} leadingIcon={<Plus className="w-4 h-4" />}>أمر عمل جديد</Button></ActivityGate>}
        </div>}
      />

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="مستلمة / فحص" value={stats.openOrders} />
          <StatCard label="بانتظار موافقة" value={stats.waitingApproval} tone="warning" />
          <StatCard label="قيد التنفيذ" value={stats.inProgress} tone="warning" />
          <StatCard label="جاهزة للتسليم" value={stats.ready} tone="success" />
          <StatCard label="إيراد الشهر" value={currency.format(stats.revenueThisMonth)} />
        </div>
      )}

      <div className="flex gap-2 items-center">
        <select className={`${selectCls} w-52`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">كل الحالات</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Orders list */}
        <Card padding="none" className="lg:col-span-2">
          <div className="max-h-[70vh] overflow-y-auto">
            {orders.map((o) => (
              <button key={o.id} onClick={() => openDetail(o)}
                className={`w-full text-right p-3 border-b border-[var(--cerami-border)] last:border-0 hover:bg-[var(--cerami-bg)] ${selected?.id === o.id ? 'bg-[var(--cerami-bg)]' : ''}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-semibold text-sm">{o.vehiclePlate} — {o.vehicleMake || ''} {o.vehicleModel || ''}</div>
                    <div className="text-xs text-[var(--cerami-muted)]">{o.orderNumber} • {o.customerName || 'عميل نقدي'}</div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] ${STATUS_TONE[o.status]}`}>{STATUS_LABEL[o.status]}</span>
                </div>
                <div className="text-xs text-[var(--cerami-muted)] mt-1">{currency.format(o.grandTotal)} • {o.inspectionCount} بند فحص • {o.partsCount} قطعة</div>
              </button>
            ))}
            {!loading && orders.length === 0 && <p className="p-8 text-center text-sm text-[var(--cerami-muted)]">لا توجد أوامر عمل.</p>}
          </div>
        </Card>

        {/* Detail */}
        <div className="lg:col-span-3 space-y-4">
          {!selected ? (
            <Card><p className="text-center text-sm text-[var(--cerami-muted)] py-16">اختر أمر عمل من القائمة لعرض التفاصيل.</p></Card>
          ) : (
            <>
              <Card padding="sm">
                <div className="flex justify-between items-start flex-wrap gap-2">
                  <div>
                    <h3 className="font-bold text-lg">{selected.vehiclePlate} <span className="text-sm font-normal text-[var(--cerami-muted)]">{selected.vehicleMake} {selected.vehicleModel} {selected.vehicleYear || ''}</span></h3>
                    <p className="text-xs text-[var(--cerami-muted)]">{selected.orderNumber} • {selected.customerName || 'عميل نقدي'} • عداد: {selected.odometerKm ?? '—'} كم</p>
                    {selected.vin && <p className="text-xs text-[var(--cerami-muted)]">VIN: {selected.vin}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_TONE[selected.status]}`}>{STATUS_LABEL[selected.status]}</span>
                    <div className="text-sm font-bold">{currency.format(selected.grandTotal)}</div>
                  </div>
                </div>
                {selected.complaint && <p className="mt-2 text-sm bg-[var(--cerami-bg)] rounded-lg p-2"><span className="font-semibold">شكوى العميل: </span>{selected.complaint}</p>}
                <div className="flex flex-wrap gap-1 mt-3">
                  {(NEXT_ACTION[selected.status] || []).map((a) => (
                    <Button key={a.to} size="sm" onClick={() => run(() => { service.transitionStatus(selected.id, a.to); refreshDetail(); })}>{a.label}</Button>
                  ))}
                </div>
              </Card>

              <Card padding="none">
                <div className="flex border-b border-[var(--cerami-border)]">
                  {([['inspection', 'الفحص الفني', ClipboardCheck], ['parts', 'القطع والعمالة', Wrench], ['approval', 'موافقة العميل', FileSignature]] as const).map(([id, label, Icon]) => (
                    <button key={id} onClick={() => setDetailTab(id)} className={`px-4 py-2.5 text-sm font-medium flex items-center gap-1.5 border-b-2 -mb-px ${detailTab === id ? 'border-[var(--cerami-primary)] text-[var(--cerami-primary)]' : 'border-transparent text-[var(--cerami-muted)]'}`}>
                      <Icon className="w-4 h-4" />{label}
                    </button>
                  ))}
                </div>

                {detailTab === 'inspection' && (
                  <div className="p-4 space-y-3">
                    {canManage && (
                      <div className="flex gap-2">
                        <input className={`${inputCls} flex-1`} placeholder="بند فحص جديد" id="new-insp" />
                        <Button size="sm" variant="secondary" onClick={() => {
                          const el = document.getElementById('new-insp') as HTMLInputElement;
                          if (!el?.value.trim()) return;
                          run(() => { service.saveInspectionItem({ workOrderId: selected.id, itemName: el.value.trim(), category: 'عام' }); el.value = ''; setInspection(service.getInspectionItems(selected.id)); });
                        }}>+ إضافة</Button>
                      </div>
                    )}
                    {inspection.map((item) => (
                      <div key={item.id} className="flex items-center gap-3 border-b border-[var(--cerami-border)] pb-2 last:border-0">
                        <span className="text-xs text-[var(--cerami-muted)] w-20 shrink-0">{item.category}</span>
                        <span className="flex-1 text-sm">{item.itemName}</span>
                        {canManage ? (
                          <select className={`${selectCls} w-40`} value={item.status}
                            onChange={(e) => run(() => { service.saveInspectionItem({ id: item.id, workOrderId: item.workOrderId, itemName: item.itemName, category: item.category, status: e.target.value as any, notes: item.notes || undefined }); setInspection(service.getInspectionItems(selected.id)); })}>
                            {Object.entries(INSP_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                        ) : (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${item.status === 'OK' ? 'bg-success-soft text-success' : item.status === 'NEEDS_REPAIR' ? 'bg-danger-soft text-danger' : 'bg-surface-sunken text-muted'}`}>{INSP_LABEL[item.status]}</span>
                        )}
                        {canManage && <Button size="sm" variant="ghost" onClick={() => run(() => { service.deleteInspectionItem(item.id); setInspection(service.getInspectionItems(selected.id)); })}>×</Button>}
                      </div>
                    ))}
                    {inspection.length === 0 && <p className="text-sm text-[var(--cerami-muted)] text-center py-4">لا توجد بنود فحص.</p>}

                    {canManage && (
                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[var(--cerami-border)]">
                        <FormField label="التشخيص"><input className={inputCls} defaultValue={selected.diagnosis || ''} onBlur={(e) => service.updateWorkOrder(selected.id, { diagnosis: e.target.value })} /></FormField>
                        <FormField label="إجمالي العمالة"><input type="number" step="0.01" className={inputCls} defaultValue={selected.laborTotal} onBlur={(e) => run(() => { service.updateWorkOrder(selected.id, { laborTotal: Number(e.target.value) }); refreshDetail(); })} /></FormField>
                        <FormField label="تاريخ التسليم"><input type="date" className={inputCls} defaultValue={selected.promisedDate || ''} onBlur={(e) => service.updateWorkOrder(selected.id, { promisedDate: e.target.value || undefined })} /></FormField>
                      </div>
                    )}
                  </div>
                )}

                {detailTab === 'parts' && (
                  <div className="p-4 space-y-3">
                    {canManage && (
                      <Button size="sm" variant="secondary" onClick={() => { setPartForm({ productId: '', partName: '', quantity: '1', unitPrice: '0' }); setPartModal(true); }}>+ إضافة قطعة / خدمة</Button>
                    )}
                    <table className="w-full text-sm">
                      <thead><tr className="text-right text-[var(--cerami-muted)] border-b border-[var(--cerami-border)]"><th className="p-2">القطعة</th><th className="p-2">الكمية</th><th className="p-2">السعر</th><th className="p-2">الإجمالي</th><th className="p-2">الحالة</th>{canManage && <th className="p-2"></th>}</tr></thead>
                      <tbody>
                        {parts.map((p) => (
                          <tr key={p.id} className="border-b border-[var(--cerami-border)] last:border-0">
                            <td className="p-2">{p.partName}</td>
                            <td className="p-2">{p.quantity}</td>
                            <td className="p-2">{currency.format(p.unitPrice)}</td>
                            <td className="p-2 font-semibold">{currency.format(p.quantity * p.unitPrice)}</td>
                            <td className="p-2">{canManage ? (
                              <select className={`${selectCls} w-32`} value={p.status} onChange={(e) => run(() => { service.updatePartStatus(p.id, e.target.value as any); setParts(service.getWorkOrderParts(selected.id)); refreshDetail(); })}>
                                <option value="REQUESTED">مطلوبة</option><option value="APPROVED">معتمدة</option><option value="ISSUED">مصروفة</option><option value="RETURNED">مرتجعة</option>
                              </select>
                            ) : p.status}</td>
                            {canManage && <td className="p-2"></td>}
                          </tr>
                        ))}
                        {parts.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-[var(--cerami-muted)]">لا توجد قطع.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                )}

                {detailTab === 'approval' && (
                  <div className="p-4 space-y-3">
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="bg-[var(--cerami-bg)] rounded-lg p-3"><div className="text-xs text-[var(--cerami-muted)]">العمالة</div><div className="font-bold">{currency.format(selected.laborTotal)}</div></div>
                      <div className="bg-[var(--cerami-bg)] rounded-lg p-3"><div className="text-xs text-[var(--cerami-muted)]">القطع</div><div className="font-bold">{currency.format(selected.partsTotal)}</div></div>
                      <div className="bg-[var(--cerami-bg)] rounded-lg p-3"><div className="text-xs text-[var(--cerami-muted)]">الإجمالي</div><div className="font-bold text-lg">{currency.format(selected.grandTotal)}</div></div>
                    </div>
                    {approvals.length > 0 && (
                      <div className="space-y-2">
                        {approvals.map((a) => (
                          <div key={a.id} className="flex items-center gap-2 text-sm border border-[var(--cerami-border)] rounded-lg p-2">
                            <CheckCircle2 className="w-4 h-4 text-success" />
                            <span>اعتمدها <strong>{a.approvedByName}</strong> بمبلغ {currency.format(a.approvedTotal)} — {a.createdAt}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {canManage && !['DELIVERED', 'CANCELLED'].includes(selected.status) && (
                      <Button onClick={() => setApproveModal(true)} leadingIcon={<FileSignature className="w-4 h-4" />}>اعتماد العميل (توقيع)</Button>
                    )}
                    {selected.customerSignature && (
                      <div className="border border-dashed border-[var(--cerami-border)] rounded-lg p-3">
                        <div className="text-xs text-[var(--cerami-muted)] mb-1">توقيع العميل:</div>
                        <img src={selected.customerSignature} alt="توقيع" className="max-h-24" />
                      </div>
                    )}
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      </div>

      {/* New work order modal */}
      <Modal open={orderModal} onClose={() => setOrderModal(false)} title="أمر عمل صيانة جديد" size="lg"
        footer={<div className="flex gap-2 justify-end"><Button variant="ghost" onClick={() => setOrderModal(false)}>إلغاء</Button><Button onClick={() => run(() => { service.createWorkOrder({ branchId: '', customerId: orderForm.customerId || undefined, vehiclePlate: orderForm.vehiclePlate, vehicleMake: orderForm.vehicleMake || undefined, vehicleModel: orderForm.vehicleModel || undefined, vehicleYear: orderForm.vehicleYear ? Number(orderForm.vehicleYear) : undefined, vin: orderForm.vin || undefined, odometerKm: orderForm.odometerKm ? Number(orderForm.odometerKm) : undefined, complaint: orderForm.complaint || undefined, promisedDate: orderForm.promisedDate || undefined }); setOrderModal(false); loadOrders(); })}>إنشاء</Button></div>}>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="العميل"><select className={selectCls} value={orderForm.customerId} onChange={(e) => setOrderForm({ ...orderForm, customerId: e.target.value })}><option value="">— نقدي —</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></FormField>
          <FormField label="لوحة السيارة" required><input className={inputCls} value={orderForm.vehiclePlate} onChange={(e) => setOrderForm({ ...orderForm, vehiclePlate: e.target.value })} placeholder="مثال: أ ب ج 1234" /></FormField>
          <FormField label="الماركة"><input className={inputCls} value={orderForm.vehicleMake} onChange={(e) => setOrderForm({ ...orderForm, vehicleMake: e.target.value })} /></FormField>
          <FormField label="الموديل"><input className={inputCls} value={orderForm.vehicleModel} onChange={(e) => setOrderForm({ ...orderForm, vehicleModel: e.target.value })} /></FormField>
          <FormField label="سنة الصنع"><input type="number" className={inputCls} value={orderForm.vehicleYear} onChange={(e) => setOrderForm({ ...orderForm, vehicleYear: e.target.value })} /></FormField>
          <FormField label="قراءة العداد (كم)"><input type="number" className={inputCls} value={orderForm.odometerKm} onChange={(e) => setOrderForm({ ...orderForm, odometerKm: e.target.value })} /></FormField>
          <FormField label="رقم الشاسيه VIN"><input className={inputCls} value={orderForm.vin} onChange={(e) => setOrderForm({ ...orderForm, vin: e.target.value })} /></FormField>
          <FormField label="موعد التسليم"><input type="date" className={inputCls} value={orderForm.promisedDate} onChange={(e) => setOrderForm({ ...orderForm, promisedDate: e.target.value })} /></FormField>
          <div className="col-span-2"><FormField label="شكوى / طلب العميل"><textarea className={inputCls} rows={2} value={orderForm.complaint} onChange={(e) => setOrderForm({ ...orderForm, complaint: e.target.value })} /></FormField></div>
        </div>
      </Modal>

      {/* Part modal */}
      <Modal open={partModal} onClose={() => setPartModal(false)} title="إضافة قطعة / خدمة" size="sm"
        footer={<div className="flex gap-2 justify-end"><Button variant="ghost" onClick={() => setPartModal(false)}>إلغاء</Button><Button onClick={() => run(() => { if (selected) { const prod = products.find((p) => p.id === partForm.productId); service.addPart({ workOrderId: selected.id, productId: partForm.productId || undefined, partName: partForm.partName || prod?.name || '', quantity: Number(partForm.quantity), unitPrice: Number(partForm.unitPrice) }); setPartModal(false); refreshDetail(); } })}>إضافة</Button></div>}>
        <div className="space-y-3">
          <FormField label="منتج من المخزون (اختياري)"><select className={selectCls} value={partForm.productId} onChange={(e) => { const p = products.find((x) => x.id === e.target.value); setPartForm({ ...partForm, productId: e.target.value, partName: p?.name || partForm.partName, unitPrice: p ? String(p.sellingPriceM2 ?? 0) : partForm.unitPrice }); }}><option value="">— قطعة يدوية —</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></FormField>
          <FormField label="اسم القطعة / الخدمة" required><input className={inputCls} value={partForm.partName} onChange={(e) => setPartForm({ ...partForm, partName: e.target.value })} /></FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="الكمية"><input type="number" step="0.01" className={inputCls} value={partForm.quantity} onChange={(e) => setPartForm({ ...partForm, quantity: e.target.value })} /></FormField>
            <FormField label="سعر الوحدة"><input type="number" step="0.01" className={inputCls} value={partForm.unitPrice} onChange={(e) => setPartForm({ ...partForm, unitPrice: e.target.value })} /></FormField>
          </div>
        </div>
      </Modal>

      {/* Approval modal */}
      <Modal open={approveModal} onClose={() => setApproveModal(false)} title="اعتماد العميل — توقيع" size="md"
        footer={<div className="flex gap-2 justify-end"><Button variant="ghost" onClick={() => setApproveModal(false)}>إلغاء</Button><Button onClick={() => run(() => { if (selected) { service.approveWorkOrder(selected.id, { approvedByName: approveForm.approvedByName, notes: approveForm.notes, signatureData: approveForm.signatureData || undefined }); setApproveModal(false); refreshDetail(); } })}>تسجيل الاعتماد</Button></div>}>
        <div className="space-y-3">
          <div className="bg-[var(--cerami-bg)] rounded-lg p-3 text-sm">
            إجمالي أمر العمل المعتمد: <strong className="text-lg">{currency.format(selected?.grandTotal ?? 0)}</strong>
          </div>
          <FormField label="اسم الموافق (العميل)" required><input className={inputCls} value={approveForm.approvedByName} onChange={(e) => setApproveForm({ ...approveForm, approvedByName: e.target.value })} /></FormField>
          <FormField label="ملاحظات"><input className={inputCls} value={approveForm.notes} onChange={(e) => setApproveForm({ ...approveForm, notes: e.target.value })} /></FormField>
          <FormField label="التوقيع (ارسم أو الصق base64)"><textarea className={inputCls} rows={3} value={approveForm.signatureData} onChange={(e) => setApproveForm({ ...approveForm, signatureData: e.target.value })} placeholder="data:image/png;base64,..." /></FormField>
        </div>
      </Modal>
    </div>
  );
};

export default WorkshopPage;
