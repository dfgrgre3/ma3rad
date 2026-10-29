import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Clock3, Loader2, MapPin, MessageCircle, PackageCheck, Phone, RefreshCw, Search, X } from 'lucide-react';
import { CustomerSupplyService } from '../../services/CustomerSupplyService';
import { usePermission } from '../../hooks/usePermission';
import { formatProductQuantity, getProductUnitLabel } from '../../utils/productUnits';
import { buildWhatsAppUrl, openExternalShare } from '../../utils/externalLinks';

type PendingItem = {
  invoiceId: string; invoiceNumber: string; invoiceDate: string; customerId: string; customerName: string;
  phone: string; address: string; productId: string; productName: string; size: string;
  quantityM2: number; unitPrice: number; totalPrice: number; shippingCost: number;
  warehouseId: string; warehouseName: string; availableM2: number;
  unit: string; productType?: 'CERAMIC' | 'GENERAL'; baseUnit?: string; customUnit?: string;
};
type InvoiceGroup = {
  invoiceId: string; invoiceNumber: string; invoiceDate: string; customerId: string; customerName: string;
  phone: string; address: string; shippingCost: number; warehouseId: string; warehouseName: string; items: PendingItem[];
};
type Draft = { group: InvoiceGroup; fee: string; text: string };

const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n) || 0);

function normalizeEgyptianPhone(value: string): string {
  let phone = value.replace(/\D/g, '');
  if (phone.startsWith('00')) phone = phone.slice(2);
  if (phone.startsWith('0')) phone = `20${phone.slice(1)}`;
  else if (phone.startsWith('1') && phone.length === 10) phone = `20${phone}`;
  return phone;
}

export const CustomerImportedProductsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const canView = usePermission()('sales.view');
  const supplyService = useMemo(() => new CustomerSupplyService(), []);
  const [groups, setGroups] = useState<InvoiceGroup[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);

  const refresh = useCallback(() => {
    if (!canView) {
      setError('ليس لديك صلاحية عرض هذه الصفحة.');
      setLoading(false);
      return;
    }
    setError('');
    try {
      const requests = supplyService.getOpenRequests({ customerId: id && id !== 'imported-products' ? id : undefined });
      const rows: PendingItem[] = requests.flatMap((request) => request.items.map((item) => ({
        invoiceId: request.invoiceId || request.id,
        invoiceNumber: request.invoiceNumber || request.id,
        invoiceDate: request.createdAt.slice(0, 10),
        customerId: request.customerId,
        customerName: request.customerName,
        phone: request.phone || '',
        address: request.address || '',
        productId: item.productId,
        productName: item.productName,
        size: item.size || '',
        quantityM2: Number(item.quantityRequested || 0),
        unitPrice: Number(item.unitPrice || 0),
        totalPrice: Number(item.totalPrice || 0),
        shippingCost: 0,
        warehouseId: request.warehouseId || '',
        warehouseName: request.warehouseName || 'المخزن',
        availableM2: Number(item.quantityReceived || 0),
        unit: item.unit,
        productType: item.productType,
        baseUnit: item.baseUnit,
        customUnit: item.customUnit,
      })));

      const grouped = new Map<string, InvoiceGroup>();
      rows.forEach((item) => {
        const group = grouped.get(item.invoiceId) || {
          invoiceId: item.invoiceId, invoiceNumber: item.invoiceNumber, invoiceDate: item.invoiceDate,
          customerId: item.customerId, customerName: item.customerName, phone: item.phone, address: item.address,
          shippingCost: Number(item.shippingCost || 0), warehouseId: item.warehouseId,
          warehouseName: item.warehouseName, items: [],
        };
        group.items.push(item);
        grouped.set(item.invoiceId, group);
      });
      setGroups(Array.from(grouped.values()));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل المنتجات المطلوبة.');
    } finally { setLoading(false); }
  }, [canView, id, supplyService]);

  useEffect(() => {
    refresh();
    if (!canView) return;
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [canView, refresh]);

  const buildMessage = (group: InvoiceGroup, fee: number) => {
    const lines = group.items.map((item) => `• ${item.productName}${item.size ? ` (${item.size})` : ''} — ${formatProductQuantity(item.quantityM2, item)} × ${fmt(item.unitPrice)} ج = ${fmt(item.totalPrice)} ج`).join('\n');
    const ready = group.items.every((item) => item.availableM2 >= item.quantityM2);
    return `أهلًا ${group.customerName}،\n${ready ? 'المنتجات المطلوبة في الفاتورة' : 'نتابع معك المنتجات المطلوبة في الفاتورة'} رقم ${group.invoiceNumber}:\n${lines}\n\nالتوصيل: ${fmt(fee)} ج\n${ready ? 'الكمية المطلوبة متوفرة بالكامل. يمكن ترتيب الاستلام أو التوصيل.' : 'سنتواصل معك فور اكتمال الكمية المطلوبة.'}${group.address ? `\nالعنوان المسجل: ${group.address}` : ''}`;
  };

  const visible = groups.filter((group) => `${group.customerName} ${group.invoiceNumber} ${group.items.map((item) => item.productName).join(' ')}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const sendWhatsApp = () => {
    if (!draft) return;
    const phone = normalizeEgyptianPhone(draft.group.phone);
    if (!phone) return;
    openExternalShare(buildWhatsAppUrl(phone, encodeURIComponent(draft.text)), draft.text);
  };

  if (!canView) return <div className="h-full flex items-center justify-center bg-slate-50 text-rose-700" dir="rtl">ليس لديك صلاحية عرض هذه الصفحة.</div>;

  return <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
    <header className="bg-white border-b border-slate-200 px-6 py-5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3"><button onClick={() => navigate(id && id !== 'imported-products' ? `/customers/${id}` : '/customers')} className="p-2 rounded-lg hover:bg-slate-100" title="رجوع"><ArrowRight className="w-4 h-4" /></button><div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center"><PackageCheck className="w-5 h-5 text-emerald-700" /></div><div><h1 className="text-lg font-black">منتجات العملاء المطلوبة من الخارج</h1><p className="text-xs text-slate-500">تابع الكميات المطلوبة وتواصل مع العميل عند توفرها</p></div></div>
      <button onClick={refresh} disabled={loading} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold hover:bg-slate-50"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />تحديث</button>
    </header>
    <div className="p-4 bg-white border-b border-slate-200"><div className="relative"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث باسم العميل أو رقم الفاتورة أو المنتج" className="w-full pr-10 pl-3 py-2.5 rounded-xl border border-slate-200 text-sm" /></div></div>
    <main className="flex-1 overflow-auto p-4 space-y-4">
      {error && <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm">{error}</div>}
      {loading ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-emerald-600"/></div> : visible.map((group) => {
        const ready = group.items.every((item) => item.availableM2 >= item.quantityM2);
        return <article key={group.invoiceId} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100"><div><button onClick={() => navigate(`/customers/${group.customerId}`)} className="font-black text-slate-900 hover:text-sky-700">{group.customerName}</button><div className="text-xs text-slate-500 mt-1">فاتورة {group.invoiceNumber} · {group.invoiceDate} · {group.warehouseName || 'المخزن'}</div><div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">{group.phone && <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3"/>{group.phone}</span>}{group.address && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3"/>{group.address}</span>}</div></div><div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${ready ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{ready ? <CheckCircle2 className="w-4 h-4"/> : <Clock3 className="w-4 h-4"/>}{ready ? 'الكمية المطلوبة متوفرة' : 'بانتظار اكتمال الكمية'}</div></div>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="text-right p-3">المنتج</th><th className="text-right p-3">المطلوب</th><th className="text-right p-3">المتوفر</th><th className="text-right p-3">سعر الوحدة</th><th className="text-right p-3">الإجمالي</th></tr></thead><tbody>{group.items.map((item, index) => <tr key={`${item.productId}-${index}`} className="border-t border-slate-100"><td className="p-3 font-semibold">{item.productName} {item.size && <span className="text-xs text-slate-400">({item.size})</span>}</td><td className="p-3">{formatProductQuantity(item.quantityM2, item)}</td><td className={`p-3 font-bold ${item.availableM2 >= item.quantityM2 ? 'text-emerald-700' : 'text-amber-700'}`}>{formatProductQuantity(item.availableM2, item)}</td><td className="p-3">{fmt(item.unitPrice)} ج / {getProductUnitLabel(item)}</td><td className="p-3">{fmt(item.totalPrice)} ج</td></tr>)}</tbody></table></div>
          <div className="px-5 py-3 bg-slate-50/70 flex flex-wrap justify-between items-center gap-3"><div className="text-xs text-slate-600">التوصيل: <b>{fmt(group.shippingCost)} ج</b></div><button onClick={() => { const fee = group.shippingCost; setDraft({ group, fee: String(fee), text: buildMessage(group, fee) }); }} disabled={!normalizeEgyptianPhone(group.phone)} title={!normalizeEgyptianPhone(group.phone) ? 'أضف رقم هاتف صحيح للعميل أولاً' : undefined} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-bold"><MessageCircle className="w-4 h-4"/>معاينة رسالة واتساب</button></div>
        </article>;
      })}
      {!loading && visible.length === 0 && !error && <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-12 text-center text-slate-500">لا توجد فواتير مسجلة للمتابعة. افتح بطاقة العميل ثم اختر «متابعة المنتجات الخارجية» بجوار الفاتورة.</div>}
    </main>
    {draft && <div className="fixed inset-0 z-50 p-4 flex items-center justify-center"><button type="button" aria-label="إغلاق معاينة رسالة العميل" onClick={() => setDraft(null)} className="absolute inset-0 bg-slate-950/50"/><section role="dialog" aria-modal="true" aria-labelledby="customer-message-preview-title" className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden" dir="rtl"><header className="p-5 border-b border-slate-100 flex items-center justify-between"><div><h2 id="customer-message-preview-title" className="font-black">معاينة رسالة العميل</h2><p className="text-xs text-slate-500 mt-1">{draft.group.customerName} · فاتورة {draft.group.invoiceNumber}</p></div><button onClick={() => setDraft(null)} className="p-2 rounded-lg hover:bg-slate-100"><X className="w-4 h-4"/></button></header><div className="p-5 space-y-3"><label htmlFor="delivery-fee" className="block text-xs font-bold text-slate-600">سعر التوصيل</label><div className="flex items-center gap-2"><input id="delivery-fee" type="number" min="0" value={draft.fee} onChange={(event) => { const fee = event.target.value; const parsedFee = Number(fee) || 0; setDraft((current) => current ? { ...current, fee, text: buildMessage(current.group, parsedFee) } : current); }} className="w-48 px-3 py-2 border border-slate-200 rounded-lg text-sm"/><span className="text-sm text-slate-500">جنيه</span></div><label htmlFor="customer-message-text" className="block text-xs font-bold text-slate-600">نص الرسالة (يمكنك تعديله)</label><textarea id="customer-message-text" rows={12} value={draft.text} onChange={(event) => setDraft((current) => current ? { ...current, text: event.target.value } : current)} className="w-full p-3 border border-slate-200 rounded-xl text-sm leading-7 resize-y"/><p className="text-[11px] text-slate-500">سيتم فتح واتساب بالرسالة جاهزة للمراجعة والإرسال من حسابك.</p></div><footer className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2"><button onClick={() => setDraft(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm">إغلاق</button><button onClick={sendWhatsApp} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold inline-flex gap-2 items-center"><MessageCircle className="w-4 h-4"/>فتح واتساب</button></footer></section></div>}
  </div>;
};
