import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronDown, Clock3, PackageCheck, Search, Truck, Warehouse } from 'lucide-react';
import { PurchaseOrderService, PurchaseOrderRow, PurchaseOrderItem } from '../../services/PurchaseOrderService';
import { useToast } from '../../components/ui/Toast';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import { exportToExcel, exportToPdf } from '../../utils/export';
import { localDateString } from '../../utils/date';
import { formatProductQuantity, getProductUnitLabel } from '../../utils/productUnits';

type IncomingOrder = PurchaseOrderRow & { items: PurchaseOrderItem[] };
const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n) || 0);
const left = (item: PurchaseOrderItem) => Math.max(0, item.quantityM2 - item.receivedM2);

export const IncomingProductsPage: React.FC = () => {
  const service = useMemo(() => new PurchaseOrderService(), []);
  const toast = useToast();
  const [orders, setOrders] = useState<IncomingOrder[]>([]);
  const [search, setSearch] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [supplierFilter, setSupplierFilter] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<IncomingOrder | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [receiptNotes, setReceiptNotes] = useState('');

  const load = () => {
    const rows = service.getAllOrders('', 'ALL').filter((row) => ['SENT', 'CONFIRMED', 'PARTIAL'].includes(row.status));
    setOrders(rows.map((row) => service.getOrderById(row.id)).filter((row): row is IncomingOrder => Boolean(row)));
  };
  useEffect(() => { load(); }, [service]);
  const today = localDateString();
  const filtered = orders.filter((o) => `${o.orderNumber} ${o.supplierName || ''} ${o.warehouseName || ''} ${o.items.map((i) => `${i.productName} ${i.productCode || ''} ${i.barcode || ''}`).join(' ')}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()) && (!overdueOnly || Boolean(o.expectedDate && o.expectedDate < today)) && (!supplierFilter || o.supplierId === supplierFilter) && (!warehouseFilter || o.warehouseId === warehouseFilter) && (statusFilter === 'ALL' || o.status === statusFilter) && (!dateFrom || Boolean(o.expectedDate && o.expectedDate >= dateFrom)) && (!dateTo || Boolean(o.expectedDate && o.expectedDate <= dateTo)));
  const canUpdate = PermissionService.can(AuthService.getCurrentUser(), 'purchases.update');
  const updateFollowUp = (order: IncomingOrder, date: string, notes: string) => { try { service.updateFollowUp(order.id, date || null, notes); load(); toast.success('تم تحديث متابعة التوريد.'); } catch (e: any) { toast.error(e?.message || 'تعذر تحديث المتابعة.'); } };
  const exportRows = () => filtered.flatMap(order => order.items.filter(item => left(item)>0).map(item => ({ order:order.orderNumber,supplier:order.supplierName,phone:order.supplierPhone,product:item.productName,code:item.productCode,quantity:item.quantityM2,received:item.receivedM2,remaining:left(item),unit:getProductUnitLabel(item),cost:item.unitCost,remainingValue:left(item)*item.unitCost,warehouse:order.warehouseName,expected:order.expectedDate,status:order.status })));
  const report = (format:'excel'|'pdf') => { const options={title:'تقرير البضائع المنتظرة',columns:[{key:'order',label:'طلب الشراء'},{key:'supplier',label:'المورد'},{key:'phone',label:'الهاتف'},{key:'product',label:'المنتج'},{key:'code',label:'الكود'},{key:'quantity',label:'المطلوب'},{key:'received',label:'المستلم'},{key:'remaining',label:'المتبقي'},{key:'unit',label:'الوحدة'},{key:'cost',label:'سعر الوحدة'},{key:'remainingValue',label:'قيمة المتبقي'},{key:'warehouse',label:'المخزن'},{key:'expected',label:'الوصول المتوقع'},{key:'status',label:'الحالة'}],rows:exportRows(),fileName:'البضائع-المنتظرة'};if(format==='excel')exportToExcel(options);else exportToPdf(options);};
  const openReceipt = (order: IncomingOrder) => {
    setReceipt(order);
    setQuantities(Object.fromEntries(order.items.map((item) => [item.id, left(item) ? String(left(item)) : '0'])));
    setReceiptNotes('');
  };
  const submitReceipt = () => {
    if (!receipt) return;
    try {
      const invoice = service.receiveQuantities(receipt.id, Object.fromEntries(Object.entries(quantities).map(([id, value]) => [id, Number(value)])), receiptNotes);
      toast.success(`تم تسجيل الاستلام في فاتورة ${invoice.invoiceNumber} وتحديث المخزون.`);
      setReceipt(null); load();
    } catch (error: any) { toast.error(error?.message || 'تعذر تسجيل الاستلام.'); }
  };

  return <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
    <header className="bg-white border-b border-slate-200 px-6 py-5 flex items-center gap-3">
      <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center"><PackageCheck className="w-5 h-5 text-amber-700" /></div>
      <div><h1 className="text-lg font-black">البضائع المنتظرة</h1><p className="text-xs text-slate-500">طلبات الشراء المفتوحة والكميات التي لم تصل بعد</p></div>
      <div className="mr-auto rounded-xl bg-amber-50 border border-amber-200 px-4 py-2 text-sm font-black text-amber-800">{filtered.length} طلب مفتوح</div>
    </header>
    <div className="p-4 bg-white border-b border-slate-200 flex flex-wrap gap-3 items-center">
      <div className="relative flex-1 min-w-56"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث بالمنتج أو المورد أو رقم الطلب" className="w-full pr-10 pl-3 py-2.5 rounded-xl border border-slate-200 text-sm" /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} /> المتأخرة فقط</label>
      <select value={supplierFilter} onChange={(e)=>setSupplierFilter(e.target.value)} className="border rounded-xl px-3 py-2 text-sm"><option value="">كل الموردين</option>{Array.from(new Map(orders.map(o=>[o.supplierId,o.supplierName||'—'])).entries()).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>
      <select value={warehouseFilter} onChange={(e)=>setWarehouseFilter(e.target.value)} className="border rounded-xl px-3 py-2 text-sm"><option value="">كل المخازن</option>{Array.from(new Map(orders.map(o=>[o.warehouseId,o.warehouseName||'—'])).entries()).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>
      <select value={statusFilter} onChange={(e)=>setStatusFilter(e.target.value)} className="border rounded-xl px-3 py-2 text-sm"><option value="ALL">كل الحالات</option><option value="SENT">مرسل</option><option value="CONFIRMED">مؤكد</option><option value="PARTIAL">استلام جزئي</option></select>
      <input aria-label="من موعد الوصول المتوقع" type="date" value={dateFrom} onChange={(e)=>setDateFrom(e.target.value)} className="border rounded-xl px-2 py-2 text-sm"/><input aria-label="إلى موعد الوصول المتوقع" type="date" value={dateTo} onChange={(e)=>setDateTo(e.target.value)} className="border rounded-xl px-2 py-2 text-sm"/>
      <button onClick={load} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold">تحديث</button>
      <button onClick={()=>report('excel')} className="px-3 py-2 rounded-xl bg-emerald-700 text-white text-sm">Excel</button><button onClick={()=>report('pdf')} className="px-3 py-2 rounded-xl bg-slate-700 text-white text-sm">طباعة / PDF</button>
    </div>
    <main className="flex-1 overflow-auto p-4 space-y-3">
      {filtered.map((order) => {
        const overdue = Boolean(order.expectedDate && order.expectedDate < today);
        const expandedNow = expanded === order.id;
        return <article key={order.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
            <button className="text-right" onClick={() => setExpanded(expandedNow ? null : order.id)}><div className="font-black">أمر شراء {order.orderNumber} <ChevronDown className={`inline w-4 h-4 transition ${expandedNow ? 'rotate-180' : ''}`} /></div><div className="text-xs text-slate-500 mt-1">المورد: {order.supplierName || '—'} · {order.supplierPhone || 'لا يوجد هاتف'} · {order.supplierAddress || 'لا يوجد عنوان'} · تاريخ الطلب: {order.date}</div></button>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600"><span className="inline-flex items-center gap-1"><Warehouse className="w-3.5 h-3.5"/>{order.warehouseName || '—'}</span><span className="inline-flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5"/>متوقع: {order.expectedDate || 'غير محدد'}</span><span className={`inline-flex items-center gap-1 font-bold ${overdue ? 'text-rose-700' : 'text-amber-700'}`}>{overdue ? <Clock3 className="w-3.5 h-3.5"/> : <Truck className="w-3.5 h-3.5"/>}{overdue ? 'متأخر' : order.status === 'PARTIAL' ? 'وصل جزئيًا' : 'بانتظار الوصول'}</span><button onClick={() => openReceipt(order)} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-600 text-white font-bold"><Check className="w-4 h-4"/> تسجيل استلام</button></div>
          </div>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="text-right p-3">الصنف / الكود</th><th className="text-right p-3">المطلوب</th><th className="text-right p-3">المستلم</th><th className="text-right p-3">المتبقي</th><th className="text-right p-3">سعر الوحدة</th><th className="text-right p-3">القيمة المتبقية</th></tr></thead><tbody>{order.items.filter((i) => left(i) > 0).map((item) => <tr key={item.id} className="border-t border-slate-100"><td className="p-3 font-semibold">{item.productName}<small className="block font-normal text-slate-500">{[item.productCode,item.barcode,item.brandName,item.grade,item.size,item.categoryName].filter(Boolean).join(' · ')}</small></td><td className="p-3">{formatProductQuantity(item.quantityM2, item)}</td><td className="p-3">{formatProductQuantity(item.receivedM2, item)}</td><td className="p-3 font-black text-amber-700">{formatProductQuantity(left(item), item)}</td><td className="p-3">{fmt(item.unitCost)} ج.م / {getProductUnitLabel(item)}</td><td className="p-3">{fmt(left(item) * item.unitCost)} ج.م</td></tr>)}</tbody></table></div>
          {canUpdate && <div className="px-4 pb-4 flex flex-wrap gap-3"><label className="text-xs">موعد الوصول المتوقع<input type="date" defaultValue={order.expectedDate || ''} onBlur={(e)=>updateFollowUp(order,e.target.value,order.notes || '')} className="mr-2 border rounded-lg p-1.5"/></label><label className="text-xs flex-1">ملاحظات المتابعة<input type="text" defaultValue={order.notes || ''} onBlur={(e)=>updateFollowUp(order,order.expectedDate || '',e.target.value)} className="mr-2 w-full border rounded-lg p-1.5"/></label></div>}
          {expandedNow && <div className="p-4 bg-slate-50 border-t text-xs"><strong>سجل الاستلام:</strong>{service.getReceiptHistory(order.id).length ? service.getReceiptHistory(order.id).map((r) => <div key={`${r.id}-${r.productName}`} className="mt-2">{r.receivedAt} · فاتورة {r.invoiceNumber} · {r.productName}: {formatProductQuantity(r.quantity, r)} {r.notes ? `· ${r.notes}` : ''}</div>) : <span className="text-slate-500"> لا توجد استلامات سابقة.</span>}</div>}
        </article>;
      })}
      {!filtered.length && <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-12 text-center text-slate-500">لا توجد بضائع منتظرة مطابقة للبحث</div>}
    </main>
    {receipt && <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4"><section className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-5 max-h-[90vh] overflow-auto"><h2 className="font-black text-lg">استلام من أمر {receipt.orderNumber}</h2><p className="text-xs text-slate-500 mt-1">سيضاف للمخزون فقط ما تسجله هنا.</p><div className="mt-4 space-y-3">{receipt.items.filter((i) => left(i) > 0).map((item) => <label key={item.id} className="grid grid-cols-[1fr_9rem] gap-3 items-center border rounded-xl p-3"><span className="text-sm font-bold">{item.productName}<small className="block text-slate-500 font-normal">متبقي {formatProductQuantity(left(item), item)}</small></span><input type="number" min="0" max={left(item)} step="0.01" value={quantities[item.id] || ''} onChange={(e) => setQuantities((prev) => ({ ...prev, [item.id]: e.target.value }))} className="border rounded-lg px-3 py-2" /></label>)}</div><textarea value={receiptNotes} onChange={(e) => setReceiptNotes(e.target.value)} placeholder="ملاحظات الاستلام" className="mt-3 w-full border rounded-xl p-3 text-sm"/><div className="mt-4 flex justify-end gap-2"><button onClick={() => setReceipt(null)} className="px-4 py-2 rounded-lg bg-slate-100">إلغاء</button><button onClick={submitReceipt} className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-bold">تأكيد الاستلام</button></div></section></div>}
  </div>;
};
