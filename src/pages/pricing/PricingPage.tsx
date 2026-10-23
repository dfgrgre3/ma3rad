import React, { useEffect, useState } from 'react';
import { Percent, Plus, Search, Trash2, Loader2, X, Power } from 'lucide-react';
import { PricingService, PriceList, PriceListItem } from '../../services/PricingService';
import { ProductService } from '../../services/ProductService';
import type { Product } from '../../types';

const CATEGORY_LABELS: Record<PriceList['customerType'], { label: string; color: string }> = {
  RETAIL: { label: 'بيع قطاعي', color: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
  WHOLESALE: { label: 'جملة الموزعين', color: 'bg-violet-50 text-violet-600 border-violet-200' },
  CONTRACTOR: { label: 'سعر المقاولين', color: 'bg-sky-50 text-sky-600 border-sky-200' },
  VIP: { label: 'عملاء VIP', color: 'bg-amber-50 text-amber-600 border-amber-200' },
  PROJECT: { label: 'مشاريع', color: 'bg-indigo-50 text-indigo-600 border-indigo-200' },
};

const fmt = (n: number) => new Intl.NumberFormat('ar-EG').format(Math.round(n)) + ' ج';

export const PricingPage: React.FC = () => {
  const service = new PricingService();
  const [lists, setLists] = useState<PriceList[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', customerType: 'RETAIL', validFrom: '', validTo: '', isDefault: false });

  const [activeList, setActiveList] = useState<PriceList | null>(null);
  const [items, setItems] = useState<PriceListItem[]>([]);
  const [itemForm, setItemForm] = useState({ productId: '', priceM2: '', priceBox: '', minQuantityM2: '' });

  const load = () => {
    setLoading(true);
    try {
      setLists(service.getPriceLists());
      setProducts(new ProductService().getAllProducts());
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل قوائم الأسعار.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const loadItems = (list: PriceList) => {
    setActiveList(list);
    try { setItems(service.getPriceListItems(list.id)); } catch (e: any) { alert(e?.message); }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      service.createPriceList({
        name: form.name,
        customerType: form.customerType as any,
        validFrom: form.validFrom || undefined,
        validTo: form.validTo || undefined,
        isDefault: form.isDefault,
      });
      setCreateOpen(false);
      setForm({ name: '', customerType: 'RETAIL', validFrom: '', validTo: '', isDefault: false });
      load();
    } catch (err: any) {
      alert(err?.message || 'تعذر إنشاء القائمة.');
    } finally {
      setSaving(false);
    }
  };

  const toggle = (list: PriceList) => {
    try { service.togglePriceList(list.id, !list.isActive); load(); } catch (e: any) { alert(e?.message); }
  };

  const addItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeList || !itemForm.productId) return;
    try {
      service.addPriceListItem({
        priceListId: activeList.id,
        productId: itemForm.productId,
        priceM2: Number(itemForm.priceM2),
        priceBox: Number(itemForm.priceBox) || undefined,
        minQuantityM2: Number(itemForm.minQuantityM2) || undefined,
      });
      setItemForm({ productId: '', priceM2: '', priceBox: '', minQuantityM2: '' });
      loadItems(activeList);
      load();
    } catch (err: any) {
      alert(err?.message || 'تعذر إضافة الصنف.');
    }
  };

  const removeItem = (id: string) => {
    if (!activeList) return;
    try { service.deletePriceListItem(id); loadItems(activeList); load(); } catch (e: any) { alert(e?.message); }
  };

  const filtered = lists.filter((p) => p.name.includes(search) || p.code.includes(search));

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center">
            <Percent className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-base font-black text-slate-900">قوائم تسعير السيراميك والمواد</h1>
            <p className="text-xs text-slate-500 font-medium">إعداد الخصومات وقوائم الأسعار المخصصة للمقاولين والتجار وكبار العملاء</p>
          </div>
        </div>
        <button onClick={() => setCreateOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition shrink-0">
          <Plus className="w-4 h-4" /> إنشاء قائمة أسعار
        </button>
      </div>

      <div className="p-4 bg-white border-b border-slate-200">
        <div className="relative">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث باسم أو كود القائمة..." className="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-400" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {error && <div className="mb-3 px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{error}</div>}
        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-emerald-500" /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((list) => {
              const st = CATEGORY_LABELS[list.customerType] || CATEGORY_LABELS.RETAIL;
              return (
                <div key={list.id} className="bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-5 transition flex flex-col justify-between group">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold border ${st.color}`}>{st.label}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${list.isActive ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                        {list.isActive ? 'نشطة' : 'معطلة'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-extrabold text-slate-900 group-hover:text-emerald-600 transition">{list.name}</h3>
                      {list.isDefault && <span className="text-[9px] bg-sky-50 text-sky-600 px-1.5 py-0.5 rounded font-bold border border-sky-200">افتراضية</span>}
                    </div>
                    <p className="text-[10px] font-mono text-slate-400 mb-2">{list.code}</p>
                    <div className="text-xs text-slate-500 font-semibold">تضم {list.itemsCount} صنف بأسعار مخصصة.</div>
                    {(list.validFrom || list.validTo) && (
                      <div className="text-[10px] text-slate-400 mt-1">الصلاحية: {list.validFrom || '—'} → {list.validTo || '—'}</div>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end gap-2">
                    <button onClick={() => toggle(list)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition flex items-center gap-1 ${list.isActive ? 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100' : 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100'}`}>
                      <Power className="w-3 h-3" /> {list.isActive ? 'تعطيل' : 'تفعيل'}
                    </button>
                    <button onClick={() => loadItems(list)} className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 rounded-lg text-xs font-bold transition">
                      عرض الأسعار
                    </button>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="col-span-full py-16 text-center text-slate-500 border-2 border-dashed border-slate-200 rounded-2xl bg-white">
                <Percent className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-sm">لا توجد قوائم أسعار مطابقة</p>
              </div>
            )}
          </div>
        )}
      </div>

      {createOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold text-slate-900">إنشاء قائمة أسعار</h3>
              <button onClick={() => setCreateOpen(false)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">اسم القائمة *</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-semibold" />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">نوع العملاء</label>
                <select value={form.customerType} onChange={(e) => setForm({ ...form, customerType: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">صالح من</label>
                  <input type="date" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">صالح إلى</label>
                  <input type="date" value={form.validTo} onChange={(e) => setForm({ ...form, validTo: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" />
                </div>
              </div>
              <label className="flex items-center gap-2 font-bold text-slate-700">
                <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} className="w-4 h-4 rounded" />
                اجعلها القائمة الافتراضية
              </label>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setCreateOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl">إلغاء</button>
                <button type="submit" disabled={saving} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold rounded-xl flex items-center gap-2">
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} إنشاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeList && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-3xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">أسعار: {activeList.name}</h3>
                <p className="text-[10px] text-slate-500 font-mono">{activeList.code} • {activeList.itemsCount} صنف</p>
              </div>
              <button onClick={() => setActiveList(null)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>

            <form onSubmit={addItem} className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4 text-xs">
              <select required value={itemForm.productId} onChange={(e) => setItemForm({ ...itemForm, productId: e.target.value })} className="col-span-2 px-2 py-2 bg-slate-50 rounded-lg border border-slate-200 font-bold">
                <option value="">— اختر الصنف —</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input required type="number" min="0.01" step="0.01" placeholder="سعر المتر" value={itemForm.priceM2} onChange={(e) => setItemForm({ ...itemForm, priceM2: e.target.value })} className="px-2 py-2 bg-slate-50 rounded-lg border border-slate-200 font-mono" />
              <input type="number" min="0" step="0.01" placeholder="سعر الكرتونة" value={itemForm.priceBox} onChange={(e) => setItemForm({ ...itemForm, priceBox: e.target.value })} className="px-2 py-2 bg-slate-50 rounded-lg border border-slate-200 font-mono" />
              <button type="submit" className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg flex items-center justify-center gap-1">
                <Plus className="w-3.5 h-3.5" /> إضافة
              </button>
            </form>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="p-2.5 font-bold">الصنف</th>
                    <th className="p-2.5 font-bold">الكود</th>
                    <th className="p-2.5 font-bold">سعر المتر</th>
                    <th className="p-2.5 font-bold">سعر الكرتونة</th>
                    <th className="p-2.5 font-bold"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="p-2.5 font-bold text-slate-800">{item.productName}</td>
                      <td className="p-2.5 font-mono text-slate-500">{item.productSku}</td>
                      <td className="p-2.5 font-bold text-emerald-600">{fmt(item.priceM2)}</td>
                      <td className="p-2.5 font-mono text-slate-600">{item.priceBox ? fmt(item.priceBox) : '—'}</td>
                      <td className="p-2.5">
                        <button onClick={() => removeItem(item.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"><Trash2 className="w-3.5 h-3.5" /></button>
                      </td>
                    </tr>
                  ))}
                  {items.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-400">لا توجد أسعار مخصصة — القائمة تستخدم السعر الأساسي للأصناف</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
