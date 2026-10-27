import React, { useEffect, useState } from 'react';
import { Star, Plus, Search, Calendar, Tag, Loader2, X, Power, Trash2 } from 'lucide-react';
import { PricingService, Promotion } from '../../services/PricingService';
import { localDateString } from '../../utils/date';

const TYPE_LABELS: Record<Promotion['promotionType'], string> = {
  PERCENTAGE: 'نسبة خصم %',
  FIXED_AMOUNT: 'خصم مبلغ ثابت',
  BUY_X_GET_Y: 'اشترِ X واحصل على Y',
  BUNDLE_PRICE: 'سعر حزمة',
};

const APPLIES_LABELS: Record<Promotion['appliesTo'], string> = {
  ALL: 'كل الأصناف',
  PRODUCTS: 'أصناف محددة',
  CATEGORIES: 'تصنيفات',
  BRANDS: 'ماركات',
};

const fmt = (n: number) => new Intl.NumberFormat('ar-EG').format(n) + ' ج';

export const PromotionsPage: React.FC = () => {
  const service = new PricingService();
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const today = localDateString();
  const [form, setForm] = useState({
    name: '', promotionType: 'PERCENTAGE', discountPercentage: '', discountAmount: '',
    buyQuantity: '', getQuantity: '', minOrderAmount: '', appliesTo: 'ALL',
    startsAt: today, endsAt: today, usageLimit: '', notes: '',
  });

  const load = () => {
    setLoading(true);
    try {
      setPromotions(service.getPromotions(search));
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل العروض.');
    } finally {
      setLoading(false);
    }
  };

  // Initial data load only; subsequent loads are triggered by user actions.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      service.createPromotion({
        name: form.name,
        promotionType: form.promotionType as any,
        discountPercentage: Number(form.discountPercentage) || 0,
        discountAmount: Number(form.discountAmount) || 0,
        buyQuantity: Number(form.buyQuantity) || 0,
        getQuantity: Number(form.getQuantity) || 0,
        minOrderAmount: Number(form.minOrderAmount) || 0,
        appliesTo: form.appliesTo as any,
        startsAt: form.startsAt,
        endsAt: form.endsAt,
        usageLimit: form.usageLimit ? Number(form.usageLimit) : undefined,
        notes: form.notes || undefined,
      });
      setModalOpen(false);
      setForm({ name: '', promotionType: 'PERCENTAGE', discountPercentage: '', discountAmount: '', buyQuantity: '', getQuantity: '', minOrderAmount: '', appliesTo: 'ALL', startsAt: today, endsAt: today, usageLimit: '', notes: '' });
      load();
    } catch (err: any) {
      alert(err?.message || 'تعذر إنشاء العرض.');
    } finally {
      setSaving(false);
    }
  };

  const toggle = (p: Promotion) => {
    try { service.togglePromotion(p.id, !p.isActive); load(); } catch (e: any) { alert(e?.message); }
  };

  const remove = (p: Promotion) => {
    if (!confirm(`حذف العرض "${p.name}"؟`)) return;
    try { service.deletePromotion(p.id); load(); } catch (e: any) { alert(e?.message); }
  };

  const describe = (p: Promotion) => {
    switch (p.promotionType) {
      case 'PERCENTAGE': return `خصم ${p.discountPercentage}%`;
      case 'FIXED_AMOUNT': return `خصم ${fmt(p.discountAmount)}`;
      case 'BUY_X_GET_Y': return `اشترِ ${p.buyQuantity} واحصل على ${p.getQuantity}`;
      case 'BUNDLE_PRICE': return 'سعر حزمة خاص';
      default: return '';
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center">
            <Star className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-base font-black text-slate-900">العروض الترويجية والخصومات</h1>
            <p className="text-xs text-slate-500 font-medium">إنشاء وجدولة الحملات الترويجية والخصومات الموسمية للمعارض</p>
          </div>
        </div>
        <button onClick={() => setModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-semibold transition shrink-0">
          <Plus className="w-4 h-4" /> إنشاء عرض جديد
        </button>
      </div>

      <div className="p-4 bg-white border-b border-slate-200">
        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="relative">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالعروض الترويجية ثم Enter..." className="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-amber-400" />
        </form>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {error && <div className="mb-3 px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{error}</div>}
        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-amber-500" /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {promotions.map((p) => (
              <div key={p.id} className="bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-5 transition flex flex-col justify-between group">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] px-2.5 py-1 rounded-full font-bold bg-amber-50 text-amber-600 border border-amber-200 flex items-center gap-1">
                      <Tag className="w-3 h-3" /> {describe(p)}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${p.currentlyRunning ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : p.isActive ? 'bg-sky-50 text-sky-600 border-sky-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                      {p.currentlyRunning ? 'نشط حالياً' : p.isActive ? 'مفعّل' : 'معطّل'}
                    </span>
                  </div>
                  <h3 className="font-extrabold text-slate-900 group-hover:text-amber-600 transition mb-1">{p.name}</h3>
                  <p className="text-[10px] font-mono text-slate-400 mb-2">{p.code}</p>
                  {p.notes && <p className="text-xs text-slate-500 leading-relaxed mb-3">{p.notes}</p>}
                  <div className="space-y-1.5 text-xs text-slate-500">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>من: {p.startsAt} — إلى: {p.endsAt}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Star className="w-3.5 h-3.5" />
                      <span>يطبق على: {APPLIES_LABELS[p.appliesTo]}</span>
                    </div>
                    {p.minOrderAmount > 0 && <div className="text-[10px]">الحد الأدنى للطلب: {fmt(p.minOrderAmount)}</div>}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end gap-2">
                  <button onClick={() => toggle(p)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition flex items-center gap-1 ${p.isActive ? 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100' : 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100'}`}>
                    <Power className="w-3 h-3" /> {p.isActive ? 'تعطيل' : 'تفعيل'}
                  </button>
                  <button onClick={() => remove(p)} className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-lg text-xs font-bold transition flex items-center gap-1">
                    <Trash2 className="w-3 h-3" /> حذف
                  </button>
                </div>
              </div>
            ))}
            {promotions.length === 0 && (
              <div className="col-span-full py-16 text-center text-slate-500 border-2 border-dashed border-slate-200 rounded-2xl bg-white">
                <Star className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-sm">لا توجد عروض ترويجية حالياً</p>
              </div>
            )}
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold text-slate-900">إنشاء عرض ترويجي</h3>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">اسم العرض *</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-semibold" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">نوع العرض</label>
                  <select value={form.promotionType} onChange={(e) => setForm({ ...form, promotionType: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                    {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">يطبق على</label>
                  <select value={form.appliesTo} onChange={(e) => setForm({ ...form, appliesTo: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                    {Object.entries(APPLIES_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                {form.promotionType === 'PERCENTAGE' && (
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">نسبة الخصم %</label>
                    <input type="number" min="0" max="100" step="0.01" value={form.discountPercentage} onChange={(e) => setForm({ ...form, discountPercentage: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" />
                  </div>
                )}
                {form.promotionType === 'FIXED_AMOUNT' && (
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">مبلغ الخصم (ج)</label>
                    <input type="number" min="0" step="0.01" value={form.discountAmount} onChange={(e) => setForm({ ...form, discountAmount: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" />
                  </div>
                )}
                {form.promotionType === 'BUY_X_GET_Y' && (
                  <>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">اشترِ (كمية)</label>
                      <input type="number" min="0" value={form.buyQuantity} onChange={(e) => setForm({ ...form, buyQuantity: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">احصل على (كمية)</label>
                      <input type="number" min="0" value={form.getQuantity} onChange={(e) => setForm({ ...form, getQuantity: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" />
                    </div>
                  </>
                )}
                <div>
                  <label className="font-bold text-slate-700 block mb-1">حد أدنى للطلب (ج)</label>
                  <input type="number" min="0" step="0.01" value={form.minOrderAmount} onChange={(e) => setForm({ ...form, minOrderAmount: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">حد الاستخدام</label>
                  <input type="number" min="0" value={form.usageLimit} onChange={(e) => setForm({ ...form, usageLimit: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">من تاريخ *</label>
                  <input required type="date" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">إلى تاريخ *</label>
                  <input required type="date" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" />
                </div>
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">ملاحظات</label>
                <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl">إلغاء</button>
                <button type="submit" disabled={saving} className="px-5 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-bold rounded-xl flex items-center gap-2">
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} إنشاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
