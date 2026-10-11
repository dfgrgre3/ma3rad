import React, { useState } from 'react';
import { Truck, Plus, Search, MapPin, Clock, CheckCircle2, AlertCircle } from 'lucide-react';

interface Delivery {
  id: string;
  orderCode: string;
  customerName: string;
  address: string;
  driverName: string;
  vehiclePlate: string;
  status: 'PENDING' | 'IN_TRANSIT' | 'COMPLETED' | 'FAILED';
  deliveryDate: string;
}

const INITIAL_DELIVERIES: Delivery[] = [
  { id: '1', orderCode: 'ORD-5401', customerName: 'أحمد رأفت جلال', address: 'ش الهرم، الجيزة، عمارة 12', driverName: 'سعيد عبد المولى', vehiclePlate: 'أ ج د 5421', status: 'IN_TRANSIT', deliveryDate: '2026-08-21' },
  { id: '2', orderCode: 'ORD-5398', customerName: 'معتز محمود', address: 'مصر الجديدة، القاهرة، فيلا 4', driverName: 'رمضان حسن', vehiclePlate: 'ق ر ب 9865', status: 'COMPLETED', deliveryDate: '2026-08-20' },
  { id: '3', orderCode: 'ORD-5412', customerName: 'مؤسسة الصفوة', address: 'مدينة السادس من أكتوبر، الحي المتميز', driverName: 'سعيد عبد المولى', vehiclePlate: 'أ ج د 5421', status: 'PENDING', deliveryDate: '2026-08-21' },
];

const STATUS_CONFIG: Record<Delivery['status'], { label: string; color: string }> = {
  PENDING: { label: 'بانتظار التحميل', color: 'bg-slate-500/10 text-slate-400 border-slate-500/20' },
  IN_TRANSIT: { label: 'في الطريق لتسليم', color: 'bg-sky-500/10 text-sky-400 border-sky-500/20' },
  COMPLETED: { label: 'تم التسليم بنجاح', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  FAILED: { label: 'فشل التسليم / مرتجع', color: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
};

export const DeliveriesPage: React.FC = () => {
  const [deliveries] = useState<Delivery[]>(INITIAL_DELIVERIES);
  const [search, setSearch] = useState('');

  const filtered = deliveries.filter(d =>
    d.orderCode.includes(search) || d.customerName.includes(search) || d.driverName.includes(search)
  );

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
            <Truck className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <h1 className="text-base font-black text-white">إدارة شحن وتوصيل الطلبات</h1>
            <p className="text-xs text-slate-400 font-medium">جدولة سيارات الشحن والمندوبين وإثبات تسليم الفواتير للعملاء</p>
          </div>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-sm font-semibold transition shrink-0">
          <Plus className="w-4 h-4" />
          جدولة شحنة جديدة
        </button>
      </div>

      {/* Search toolbar */}
      <div className="p-4 bg-slate-900/50 border-b border-slate-900 flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="بحث برقم الفاتورة، اسم العميل، أو السائق..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-4 pr-10 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500/50 transition"
          />
        </div>
      </div>

      {/* Grid view of deliveries */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((d) => {
            const st = STATUS_CONFIG[d.status];
            return (
              <div key={d.id} className="bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-xl p-5 transition flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-mono font-bold text-sky-400">#{d.orderCode}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${st.color}`}>
                      {st.label}
                    </span>
                  </div>

                  <h3 className="font-extrabold text-white mb-2">{d.customerName}</h3>

                  <div className="space-y-1.5 text-xs text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-500" />
                      <span className="truncate">{d.address}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5 text-slate-500" />
                      <span>{d.driverName} — <span className="font-mono text-[11px] text-slate-300">{d.vehiclePlate}</span></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      <span>تاريخ الشحن: {d.deliveryDate}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-850 flex justify-end gap-2">
                  <button className="px-3 py-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-850 rounded-lg text-xs font-bold text-slate-300 transition">
                    تفاصيل الرحلة
                  </button>
                  {d.status === 'IN_TRANSIT' && (
                    <button className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition">
                      تأكيد التسليم
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="col-span-full py-16 flex flex-col items-center justify-center text-slate-500 bg-slate-900/20 border-2 border-dashed border-slate-800 rounded-2xl">
              <Truck className="w-12 h-12 text-slate-700 mb-3" />
              <p className="text-sm">لا توجد شحنات مطابقة للبحث حالياً</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};