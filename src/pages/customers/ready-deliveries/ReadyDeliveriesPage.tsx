import React, { useEffect, useMemo, useState } from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { PageHeader } from '../../../components/ui/PageHeader';
import { CheckCircle2, Loader2, MessageCircle, Search, Truck } from 'lucide-react';
import { CustomerSupplyService, CustomerSupplyRequest } from '../../../services/domains/customers/CustomerSupplyService';
import { formatProductQuantity, getProductUnitLabel } from '../../../utils/products/productUnits';
import { normalizeWhatsAppPhone, openWhatsAppChat } from '../../../utils/shared/externalLinks';
import { usePermission } from '../../../hooks/domains/auth/usePermission';

const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n) || 0);

export const ReadyDeliveriesPage: React.FC = () => {
  const service = useMemo(() => new CustomerSupplyService(), []);
  const canView = usePermission()('sales.view');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<CustomerSupplyRequest[]>([]);
  const [error, setError] = useState('');

  const shareReadyDelivery = (request: CustomerSupplyRequest) => {
    const itemLines = request.items.map((item, index) =>
      `${index + 1}. ${item.productName}${item.size ? ` (${item.size})` : ''} — المطلوب: ${formatProductQuantity(item.quantityRequested, item)}، المستلم: ${formatProductQuantity(item.quantityReceived, item)}`
    );
    const message = [
      `مرحبًا ${request.customerName}،`,
      `طلبكم رقم ${request.invoiceNumber || request.id} جاهز للتسليم.`,
      ...itemLines,
      request.warehouseName ? `المخزن: ${request.warehouseName}` : '',
      request.expectedDeliveryDate ? `موعد التسليم: ${request.expectedDeliveryDate}` : '',
      request.address ? `عنوان التوصيل: ${request.address}` : '',
      request.notes ? `ملاحظات: ${request.notes}` : '',
      'يرجى التواصل معنا لتنسيق الاستلام أو التوصيل.',
    ].filter(Boolean).join('\n');
    openWhatsAppChat(request.phone || '', message);
  };

  useEffect(() => {
    const load = () => {
      if (!canView) {
        setRows([]);
        setError('ليس لديك صلاحية عرض هذه الصفحة.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      try {
        setRows(service.getReadyForDelivery({ search: search.trim() || undefined }));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'تعذر تحميل الطلبات الجاهزة للتسليم.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [canView, search, service]);

  if (!canView) return <div className="h-full flex items-center justify-center bg-slate-50 text-rose-700">ليس لديك صلاحية عرض هذه الصفحة.</div>;

  return <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden">
    <header className="bg-white border-b border-slate-200 px-6 pt-4">
      <PageHeader
        icon={<Truck className="w-5 h-5" />}
        title="طلبات جاهزة للتسليم"
        description="الطلبات التي اكتملت فيها الكمية المطلوبة وتهيأت للتسليم"
        meta={<span className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2 text-sm font-black text-emerald-800">{rows.length} جاهزة</span>}
      />
    </header>
    <div className="p-4 bg-white border-b border-slate-200"><div className="relative"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث باسم العميل أو الفاتورة أو المنتج" className="w-full pr-10 pl-3 py-2.5 rounded-xl border border-slate-200 text-sm" /></div></div>
    <main className="flex-1 overflow-auto p-4 space-y-4">
      {error && <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm">{error}</div>}
      {loading ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-emerald-600" /></div> : rows.map((request) => <article key={request.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100">
          <div>
            <div className="font-black text-slate-900">{request.customerName}</div>
            <div className="text-xs text-slate-500 mt-1">فاتورة {request.invoiceNumber || request.id} · {request.createdAt.slice(0,10)}</div>
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold"><CheckCircle2 className="w-4 h-4" />جاهزة</div>
        </div>
        <div className="overflow-x-auto"><DataTable
          ariaLabel="أصناف طلب التسليم"
          rows={request.items}
          rowKey={(item: any) => String(item.id)}
          dense
          tableClassName="text-sm"
          columns={[
            { key: 'product', header: 'المنتج', render: (item: any) => <span className="font-semibold">{item.productName}</span> },
            { key: 'req', header: 'المطلوب', render: (item: any) => formatProductQuantity(item.quantityRequested, item) },
            { key: 'recv', header: 'الوارد', render: (item: any) => <span className="font-bold text-emerald-700">{formatProductQuantity(item.quantityReceived, item)}</span> },
            { key: 'price', header: 'السعر / الوحدة', render: (item: any) => `${fmt(item.unitPrice)} ج / ${getProductUnitLabel(item)}` },
          ]}
        /></div>
        <div className="px-5 py-3 bg-slate-50/70 flex flex-wrap justify-between items-center gap-3"><div className="text-xs text-slate-600">المخزن: <b>{request.warehouseName || '—'}</b></div><button onClick={() => shareReadyDelivery(request)} disabled={!normalizeWhatsAppPhone(request.phone || '')} title={!normalizeWhatsAppPhone(request.phone || '') ? 'لا يوجد رقم هاتف صحيح للعميل' : 'فتح محادثة العميل على واتساب'} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-bold"><MessageCircle className="w-4 h-4"/>إرسال واتساب</button></div>
      </article>)}
      {!loading && rows.length === 0 && <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-12 text-center text-slate-500">لا توجد طلبات جاهزة للتسليم حاليًا</div>}
    </main>
  </div>;
};
