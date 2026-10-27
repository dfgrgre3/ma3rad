import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { OrderService, Order, OrderStatus, OrderStats, OrderStatusEntry } from '../../services/OrderService';
import { CustomerService } from '../../services/CustomerService';
import { ProductService } from '../../services/ProductService';
import { InventoryService } from '../../services/InventoryService';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import { PrintService } from '../../services/PrintService';
import { Customer, Product, Warehouse, PaymentType } from '../../types';
import { exportToExcel, buildExportHtml } from '../../utils/export';
import { DocumentPreviewModal } from '../../components/DocumentPreviewModal';
import { getProductUnitLabel } from '../../utils/productUnits';
import { PAGE_SIZE, emptyForm, fmt, FormState, Line } from './orders/types';
import { buildOrderExportRows } from './orders/helpers';
import { OrdersHeader } from './orders/OrdersHeader';
import { OrdersStats } from './orders/OrdersStats';
import { OrdersFilters } from './orders/OrdersFilters';
import { OrdersTable } from './orders/OrdersTable';
import { OrderFormModal } from './orders/OrderFormModal';
import { OrderDetailModal } from './orders/OrderDetailModal';
import { DeliveryModal } from './orders/DeliveryModal';
import { TimelineModal } from './orders/TimelineModal';
import { ConvertInvoiceModal } from './orders/ConvertInvoiceModal';

export const OrdersPage: React.FC = () => {
  const service = useMemo(() => new OrderService(), []);
  const customerService = useMemo(() => new CustomerService(), []);
  const productService = useMemo(() => new ProductService(), []);
  const inventoryService = useMemo(() => new InventoryService(), []);
  const printService = useMemo(() => new PrintService(), []);
  const user = AuthService.getCurrentUser();
  const canCreate = PermissionService.can(user, 'sales.create');
  const canUpdate = PermissionService.can(user, 'sales.approve');

  const [docPreview, setDocPreview] = useState<{
    title: string;
    subtitle?: string;
    fileName: string;
    html: string;
    excel?: () => void;
  } | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<OrderStats | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | OrderStatus>('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  const [detail, setDetail] = useState<Order | null>(null);
  const [timeline, setTimeline] = useState<{ order: Order; entries: OrderStatusEntry[] } | null>(null);
  const [deliveryTarget, setDeliveryTarget] = useState<Order | null>(null);
  const [deliveryLines, setDeliveryLines] = useState<Record<string, number>>({});
  const [deliveryNote, setDeliveryNote] = useState('');
  const [convertTarget, setConvertTarget] = useState<Order | null>(null);
  const [convertPaymentType, setConvertPaymentType] = useState<PaymentType>('CREDIT');
  const [convertPaid, setConvertPaid] = useState('');
  const [convertNotes, setConvertNotes] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    try {
      setOrders(service.getOrders(search.trim(), statusFilter, dateFrom || undefined, dateTo || undefined));
      setStats(service.getStats());
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل الطلبات.');
    } finally {
      setLoading(false);
    }
  }, [service, search, statusFilter, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, statusFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(orders.length / PAGE_SIZE));
  const pageItems = orders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const loadReferences = () => {
    setCustomers(customerService.getAllCustomers());
    setProducts(productService.getAllProducts());
    const whs = inventoryService.getAllWarehouses();
    setWarehouses(whs);
    return whs;
  };

  const openCreate = () => {
    try {
      const whs = loadReferences();
      setEditingId(null);
      setForm({ ...emptyForm(), warehouseId: whs.find((w) => w.isDefault)?.id || whs[0]?.id || '' });
      setFormOpen(true);
    } catch (e: any) { alert(e?.message || 'تعذر تحميل بيانات الطلب.'); }
  };

  const openEdit = (order: Order) => {
    try {
      loadReferences();
      const full = service.getOrder(order.id) || order;
      setEditingId(order.id);
      setForm({
        customerId: full.customerId,
        warehouseId: full.warehouseId,
        deliveryDate: full.expectedDeliveryDate || '',
        notes: full.notes || '',
        shipping: String(full.shippingCost || ''),
        discount: String(full.discountAmount || ''),
        tax: String(full.taxAmount || ''),
        lines: (full.items || []).map((i) => ({
          productId: i.productId,
          quantityM2: i.quantityM2,
          unitPrice: i.unitPrice,
          discountAmount: i.discountAmount || 0,
        })),
      });
      setFormOpen(true);
    } catch (e: any) { alert(e?.message || 'تعذر تحميل بيانات الطلب.'); }
  };

  const setLine = (idx: number, patch: Partial<Line>) =>
    setForm((prev) => ({ ...prev, lines: prev.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)) }));

  const getFormUnit = (productId: string) => {
    const product = products.find((item) => item.id === productId);
    return product ? getProductUnitLabel(product) : 'وحدة';
  };

  const pickProduct = (idx: number, productId: string) => {
    const p = products.find((x) => x.id === productId);
    setLine(idx, { productId, unitPrice: p ? p.sellingPriceM2 : 0 });
  };

  const stockOf = (productId: string, warehouseId: string): number => {
    if (!productId || !warehouseId) return 0;
    try {
      const stock = inventoryService.getProductStock(productId, warehouseId);
      return Math.max(0, Number(stock?.availableM2 ?? stock?.quantityM2 ?? 0));
    } catch { return 0; }
  };

  const subtotal = form.lines.reduce((s, l) => s + l.quantityM2 * l.unitPrice - (l.discountAmount || 0), 0);
  const total = Math.max(0, subtotal - (Number(form.discount) || 0) + (Number(form.tax) || 0) + (Number(form.shipping) || 0));

  const submitForm = (e: React.FormEvent) => {
    e.preventDefault();
    const items = form.lines.filter((l) => l.productId && l.quantityM2 > 0);
    if (!form.customerId) return alert('اختر العميل.');
    if (!form.warehouseId) return alert('اختر المخزن.');
    if (items.length === 0) return alert('أضف صنفاً واحداً على الأقل بكمية أكبر من صفر.');
    setSaving(true);
    try {
      const payload = {
        customerId: form.customerId,
        warehouseId: form.warehouseId,
        expectedDeliveryDate: form.deliveryDate || undefined,
        notes: form.notes || undefined,
        shippingCost: Number(form.shipping) || 0,
        discountAmount: Number(form.discount) || 0,
        taxAmount: Number(form.tax) || 0,
        items,
      };
      if (editingId) service.updateOrder(editingId, payload);
      else service.createOrder(payload);
      setFormOpen(false);
      load();
    } catch (err: any) {
      alert(err?.message || 'تعذر حفظ الطلب.');
    } finally {
      setSaving(false);
    }
  };

  const advance = (order: Order) => {
    const next: Partial<Record<OrderStatus, OrderStatus>> = {
      PENDING: 'CONFIRMED', CONFIRMED: 'PROCESSING',
    };
    const target = next[order.status];
    if (!target) return;
    try { service.updateStatus(order.id, target); load(); setDetail(null); }
    catch (e: any) { alert(e?.message); }
  };

  const cancel = (order: Order) => {
    if (!window.confirm(`إلغاء الطلب ${order.orderNumber}؟ سيتم تحرير الكميات المحجوزة من المخزن.`)) return;
    try { service.cancelOrder(order.id); load(); setDetail(null); }
    catch (e: any) { alert(e?.message); }
  };

  const openTimeline = (order: Order) => {
    const full = service.getOrder(order.id) || order;
    setTimeline({ order: full, entries: service.getStatusHistory(order.id) });
  };

  const openDelivery = (order: Order) => {
    const full = service.getOrder(order.id) || order;
    const init: Record<string, number> = {};
    (full.items || []).forEach((item) => {
      const remaining = Math.max(0, Number(item.quantityM2) - Number(item.deliveredM2 || 0));
      init[item.id] = remaining;
    });
    setDeliveryTarget(full);
    setDeliveryLines(init);
    setDeliveryNote('');
  };

  const submitDelivery = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deliveryTarget) return;
    const lines = Object.entries(deliveryLines)
      .map(([itemId, quantityM2]) => ({ itemId, quantityM2: Number(quantityM2) || 0 }))
      .filter((line) => line.quantityM2 > 0);
    if (lines.length === 0) return alert('أدخل كمية تسليم أكبر من صفر لبند واحد على الأقل.');
    setSaving(true);
    try {
      service.recordDelivery(deliveryTarget.id, lines, deliveryNote || undefined);
      setDeliveryTarget(null);
      setDetail(null);
      load();
      alert('تم تسجيل التسليم وتحديث حالة الطلب بنجاح.');
    } catch (err: any) {
      alert(err?.message || 'تعذر تسجيل التسليم.');
    } finally {
      setSaving(false);
    }
  };

  const removeOrder = (order: Order) => {
    if (!window.confirm(`حذف الطلب الملغي ${order.orderNumber} نهائياً؟`)) return;
    try { service.deleteCancelledOrder(order.id); load(); setDetail(null); }
    catch (e: any) { alert(e?.message); }
  };

  const shareOnWhatsApp = (order: Order) => {
    const phone = (order.customerPhone || '').replace(/[^0-9]/g, '');
    const text = encodeURIComponent(
      `مرحباً ${order.customerName || ''}\nطلبكم رقم ${order.orderNumber} بتاريخ ${order.date}\n` +
      `الإجمالي: ${fmt(order.totalAmount)}\n` +
      (order.expectedDeliveryDate ? `موعد التسليم المتوقع: ${order.expectedDeliveryDate}\n` : '') +
      `شكراً لتعاملكم معنا.`
    );
    window.open(phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`, '_blank');
  };

  const openConvert = (order: Order) => {
    const full = service.getOrder(order.id) || order;
    setConvertTarget(full);
    setConvertPaymentType('CREDIT');
    setConvertPaid('0');
    setConvertNotes('');
  };

  const submitConvert = (e: React.FormEvent) => {
    e.preventDefault();
    if (!convertTarget) return;
    setSaving(true);
    try {
      const invoice = service.convertToInvoice(convertTarget.id, {
        paymentType: convertPaymentType,
        paidAmount: Number(convertPaid) || 0,
        notes: convertNotes || undefined,
      });
      setConvertTarget(null);
      setDetail(null);
      load();
      alert(`تم إصدار الفاتورة ${invoice.invoiceNumber} بنجاح وإتمام الطلب.`);
    } catch (err: any) {
      alert(err?.message || 'تعذر إصدار الفاتورة.');
    } finally {
      setSaving(false);
    }
  };

  const openDetail = (order: Order) => setDetail(service.getOrder(order.id));

  const printOrder = (order: Order) => {
    const full = service.getOrder(order.id);
    if (full) printService.printOrder(full);
  };

  const exportRows = () => buildOrderExportRows(orders);

  const doExport = (kind: 'excel' | 'pdf') => {
    const options = {
      title: 'سجل طلبات وحجوزات العملاء',
      subtitle: `عدد الطلبات: ${orders.length}`,
      columns: [
        { key: 'orderNumber', label: 'رقم الطلب' },
        { key: 'date', label: 'التاريخ' },
        { key: 'customer', label: 'العميل' },
        { key: 'phone', label: 'الهاتف' },
        { key: 'warehouse', label: 'المخزن' },
        { key: 'delivery', label: 'التسليم المتوقع' },
        { key: 'items', label: 'عدد البنود' },
        { key: 'total', label: 'الإجمالي' },
        { key: 'status', label: 'الحالة' },
        { key: 'invoice', label: 'الفاتورة' },
      ],
      rows: exportRows(),
      fileName: 'sales-orders',
    };
    setDocPreview({
      title: 'معاينة سجل أوامر البيع',
      subtitle: options.subtitle,
      fileName: options.fileName,
      html: buildExportHtml(options),
      excel: () => exportToExcel(options),
    });
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <OrdersHeader canCreate={canCreate} onExport={doExport} onCreate={openCreate} />

      <div className="p-4 bg-white border-b border-slate-200 space-y-3">
        <OrdersStats stats={stats} />

        <OrdersFilters
          search={search}
          statusFilter={statusFilter}
          dateFrom={dateFrom}
          dateTo={dateTo}
          loading={loading}
          onSearchChange={setSearch}
          onStatusChange={setStatusFilter}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
          onRefresh={load}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {error && <div className="mb-3 px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{error}</div>}
        {loading ? <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-violet-500" /></div> : (
          <OrdersTable
            orders={orders}
            pageItems={pageItems}
            page={page}
            totalPages={totalPages}
            pageSize={PAGE_SIZE}
            canCreate={canCreate}
            canUpdate={canUpdate}
            onViewDetails={openDetail}
            onPrintOrder={printOrder}
            onOpenTimeline={openTimeline}
            onShareOnWhatsApp={shareOnWhatsApp}
            onEditOrder={openEdit}
            onOpenDelivery={openDelivery}
            onOpenConvert={openConvert}
            onRemoveOrder={removeOrder}
            onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
            onNextPage={() => setPage((p) => Math.min(totalPages, p + 1))}
          />
        )}
      </div>

      {/* Create / edit modal */}
      {formOpen && (
        <OrderFormModal
          editingId={editingId}
          form={form}
          setForm={setForm}
          customers={customers}
          products={products}
          warehouses={warehouses}
          saving={saving}
          onClose={() => setFormOpen(false)}
          onSubmit={submitForm}
          setLine={setLine}
          pickProduct={pickProduct}
          getFormUnit={getFormUnit}
          stockOf={stockOf}
          total={total}
        />
      )}

      {/* Detail modal */}
      {detail && (
        <OrderDetailModal
          order={detail}
          canUpdate={canUpdate}
          onClose={() => setDetail(null)}
          onPrint={printOrder}
          onShareOnWhatsApp={shareOnWhatsApp}
          onOpenTimeline={openTimeline}
          onOpenDelivery={openDelivery}
          onAdvance={advance}
          onOpenConvert={openConvert}
          onCancel={cancel}
        />
      )}

      {/* Delivery modal */}
      {deliveryTarget && (
        <DeliveryModal
          target={deliveryTarget}
          lines={deliveryLines}
          setLines={setDeliveryLines}
          note={deliveryNote}
          setNote={setDeliveryNote}
          saving={saving}
          batchSummaryItems={detail?.items}
          onClose={() => setDeliveryTarget(null)}
          onSubmit={submitDelivery}
        />
      )}

      {/* Timeline modal */}
      {timeline && (
        <TimelineModal order={timeline.order} entries={timeline.entries} onClose={() => setTimeline(null)} />
      )}

      {/* Convert modal */}
      {convertTarget && (
        <ConvertInvoiceModal
          target={convertTarget}
          paymentType={convertPaymentType}
          setPaymentType={setConvertPaymentType}
          paid={convertPaid}
          setPaid={setConvertPaid}
          notes={convertNotes}
          setNotes={setConvertNotes}
          saving={saving}
          onClose={() => setConvertTarget(null)}
          onSubmit={submitConvert}
        />
      )}

      {docPreview && (
        <DocumentPreviewModal
          title={docPreview.title}
          subtitle={docPreview.subtitle}
          fileName={docPreview.fileName}
          html={docPreview.html}
          onClose={() => setDocPreview(null)}
          onDownloadExcel={docPreview.excel}
        />
      )}
    </div>
  );
};
