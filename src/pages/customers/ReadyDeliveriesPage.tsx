import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, MessageCircle, Search, Truck } from 'lucide-react';
import { CustomerSupplyService, CustomerSupplyRequest } from '../../services/CustomerSupplyService';
import { formatProductQuantity, getProductUnitLabel } from '../../utils/productUnits';

const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n) || 0);

export const ReadyDeliveriesPage: React.FC = () => {
  const service = useMemo(() => new CustomerSupplyService(), []);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<CustomerSupplyRequest[]>([]);

  useEffect(() => {
    const load = () => {
      setLoading(true);
      try {
        setRows(service.getReadyForDelivery({ search: search.trim() || undefined }));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [search, service]);

  return <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
    <header className="bg-white border-b border-slate-200 px-6 py-5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center"><Truck className="w-5 h-5 text-emerald-700" /></div>
        <div>
          <h1 className="text-lg font-black">طلبات جاهزة للتسليم</h1>
          <p className="text-xs text-slate-500">الطلبات التي اكتملت فيها الكمية المطلوبة وتهيأت للتسليم</p>
        </div>
      </div>
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2 text-sm font-black text-emerald-800">{rows.length} جاهزة</div>
    </header>
    <div className="p-4 bg-white border-b border-slate-200"><div className="relative"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث باسم العميل أو الفاتورة أو المنتج" className="w-full pr-10 pl-3 py-2.5 rounded-xl border border-slate-200 text-sm" /></div></div>
    <main className="flex-1 overflow-auto p-4 space-y-4">
      {loading ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-emerald-600" /></div> : rows.map((request) => <article key={request.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100">
          <div>
            <div className="font-black text-slate-900">{request.customerName}</div>
            <div className="text-xs text-slate-500 mt-1">فاتورة {request.invoiceNumber || request.id} · {request.createdAt.slice(0,10)}</div>
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold"><CheckCircle2 className="w-4 h-4" />جاهزة</div>
        </div>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="text-right p-3">المنتج</th><th className="text-right p-3">المطلوب</th><th className="text-right p-3">الوارد</th><th className="text-right p-3">السعر / الوحدة</th></tr></thead><tbody>{request.items.map((item) => <tr key={item.id} className="border-t border-slate-100"><td className="p-3 font-semibold">{item.productName}</td><td className="p-3">{formatProductQuantity(item.quantityRequested, item)}</td><td className="p-3 text-emerald-700 font-bold">{formatProductQuantity(item.quantityReceived, item)}</td><td className="p-3">{fmt(item.unitPrice)} ج / {getProductUnitLabel(item)}</td></tr>)}</tbody></table></div>
        <div className="px-5 py-3 bg-slate-50/70 flex flex-wrap justify-between items-center gap-3"><div className="text-xs text-slate-600">المخزن: <b>{request.warehouseName || '—'}</b></div><button className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"><MessageCircle className="w-4 h-4"/>إرسال واتساب</button></div>
      </article>)}
      {!loading && rows.length === 0 && <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-12 text-center text-slate-500">لا توجد طلبات جاهزة للتسليم حاليًا</div>}
    </main>
  </div>;
};
