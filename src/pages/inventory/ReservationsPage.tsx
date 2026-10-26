import React, { useEffect, useMemo, useState } from 'react';
import { BookmarkPlus, Package, Loader2, X, CheckCheck, Clock, RefreshCw, Boxes } from 'lucide-react';
import { ReservationService, StockReservation } from '../../services/ReservationService';
import { ProductService } from '../../services/ProductService';
import { OperationsService } from '../../services/OperationsService';
import { useToast } from '../../components/ui/Toast';
import { Product } from '../../types';
import { formatProductQuantity, getProductUnitLabel } from '../../utils/productUnits';

import { fmt, statusStyles, statusLabels } from './reservationsDisplay';

export const ReservationsPage: React.FC = () => {
  const service = useMemo(() => new ReservationService(), []);
  const toast = useToast();
  const [rows, setRows] = useState<StockReservation[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Array<{ id: string; name: string }>>([]);
  const [status, setStatus] = useState('ACTIVE');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ productId: '', warehouseId: '', quantityM2: '', expiresAt: '', notes: '' });
  const [availability, setAvailability] = useState<{ onHand: number; reserved: number; available: number } | null>(null);

  const load = () => {
    setLoading(true);
    try {
      setRows(service.getReservations({ status, search }));
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تحميل الحجوزات.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);

  useEffect(() => {
    try {
      setProducts(new ProductService().getAllProducts());
      setWarehouses(new OperationsService().getWarehouses());
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تحميل الأصناف أو المخازن.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!form.productId || !form.warehouseId) { setAvailability(null); return; }
    try { setAvailability(service.getAvailability(form.productId, form.warehouseId)); } catch { setAvailability(null); }
  }, [form.productId, form.warehouseId, service]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      service.createReservation({
        productId: form.productId,
        warehouseId: form.warehouseId,
        quantityM2: Number(form.quantityM2),
        referenceType: 'MANUAL',
        expiresAt: form.expiresAt || undefined,
        notes: form.notes || undefined,
      });
      toast.success('تم إنشاء الحجز.');
      setForm({ productId: '', warehouseId: '', quantityM2: '', expiresAt: '', notes: '' });
      setFormOpen(false);
      load();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر إنشاء الحجز.');
    }
  };

  const action = (row: StockReservation, kind: 'release' | 'consume') => {
    const label = kind === 'release' ? 'إفراج' : 'تنفيذ';
    if (!confirm(`هل تريد ${label} حجز ${row.productName} (${fmt(row.quantityM2, row)})؟`)) return;
    try {
      if (kind === 'release') service.releaseReservation(row.id);
      else service.consumeReservation(row.id);
      toast.success(`تم ${label} الحجز.`);
      load();
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تحديث الحجز.');
    }
  };

  const expire = () => {
    try {
      const count = service.expireOverdue();
      toast.success(count > 0 ? `تم إنهاء ${count} حجز منتهي.` : 'لا توجد حجوزات منتهية.');
      load();
    } catch (e: any) {
      toast.error(e?.message || 'تعذر إنهاء الحجوزات.');
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center">
            <BookmarkPlus className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-base font-black">حجوزات المخزون</h1>
            <p className="text-xs text-slate-500 font-medium">حجز كميات دون خصمها من المخزون الفعلي، مع الإفراج أو التنفيذ</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Boxes className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} placeholder="بحث بالصنف..." className="pr-8 pl-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold w-40" />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold">
            <option value="ALL">كل الحالات</option>
            <option value="ACTIVE">نشط</option>
            <option value="CONSUMED">مُنفّذ</option>
            <option value="RELEASED">مُفرج</option>
            <option value="EXPIRED">منتهي</option>
          </select>
          <button onClick={expire} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-600"><Clock className="w-4 h-4" /> إنهاء المنتهية</button>
          <button onClick={() => setFormOpen(true)} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold"><BookmarkPlus className="w-4 h-4" /> حجز جديد</button>
          <button onClick={load} className="p-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-600"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm text-right">
            <thead className="bg-slate-50 text-[11px] text-slate-500 border-b border-slate-200">
              <tr><th className="px-3 py-3">الصنف</th><th className="px-3 py-3">المخزن</th><th className="px-3 py-3">الكمية</th><th className="px-3 py-3">المرجع</th><th className="px-3 py-3">الانتهاء</th><th className="px-3 py-3">الحالة</th><th className="px-3 py-3">إجراءات</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/70">
                  <td className="px-3 py-2.5">
                    <span className="font-bold">{row.productName}</span>
                    <span className="block text-[10px] font-mono text-slate-400">{row.productSku}</span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-600">{row.warehouseName}</td>
                  <td className="px-3 py-2.5 font-mono font-bold">{fmt(row.quantityM2, row)}</td>
                  <td className="px-3 py-2.5 text-[11px] text-slate-500">{row.referenceType}{row.referenceId ? ` · ${row.referenceId}` : ''}</td>
                  <td className="px-3 py-2.5 text-[11px] text-slate-500">{row.expiresAt || '—'}</td>
                  <td className="px-3 py-2.5"><span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${statusStyles[row.status]}`}>{statusLabels[row.status]}</span></td>
                  <td className="px-3 py-2.5">
                    {row.status === 'ACTIVE' ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => action(row, 'consume')} className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50" title="تنفيذ الحجز"><CheckCheck className="w-4 h-4" /></button>
                        <button onClick={() => action(row, 'release')} className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50" title="إفراج"><X className="w-4 h-4" /></button>
                      </div>
                    ) : <span className="text-[10px] text-slate-300">—</span>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && !loading && <tr><td colSpan={7} className="py-12 text-center text-slate-400">لا توجد حجوزات مطابقة.</td></tr>}
              {loading && <tr><td colSpan={7} className="py-12 text-center"><Loader2 className="w-5 h-5 animate-spin text-emerald-500 mx-auto" /></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
          <form onSubmit={submit} className="bg-white rounded-2xl w-full max-w-md p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black flex items-center gap-2"><Package className="w-4 h-4 text-emerald-600" /> حجز مخزون جديد</h3>
              <button type="button" onClick={() => setFormOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>
            <select required value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold">
              <option value="">— اختر الصنف —</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
            </select>
            <select required value={form.warehouseId} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold">
              <option value="">— اختر المخزن —</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            {availability && (
              <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                المتاح: <b className="text-emerald-700">{fmt(availability.available, products.find((product) => product.id === form.productId) || {})}</b>
                {' · '}محجوز: {fmt(availability.reserved, products.find((product) => product.id === form.productId) || {})}
                {' · '}إجمالي: {fmt(availability.onHand, products.find((product) => product.id === form.productId) || {})}
              </p>
            )}
            <input required type="number" step="0.01" min="0.01" value={form.quantityM2} onChange={(e) => setForm({ ...form, quantityM2: e.target.value })} placeholder={`الكمية (${products.find((product) => product.id === form.productId) ? getProductUnitLabel(products.find((product) => product.id === form.productId)!) : 'الوحدة'})`} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold" />
            <input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold" />
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="ملاحظات" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold" />
            <button type="submit" className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-black">حفظ الحجز</button>
          </form>
        </div>
      )}
    </div>
  );
};
