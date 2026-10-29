import React, { useEffect, useState } from 'react';
import { Ruler, Plus, Search, Layers, Sparkles, Tag, Shield, Compass, Loader2, X } from 'lucide-react';
import { AttributeService, AttributeCategory } from '../../services/AttributeService';
import type { DynamicAttributeDataType } from '../../services/dynamicAttributes';

const ICONS: Record<string, React.ElementType> = {
  TILE_SIZES: Ruler, TILE_FINISH: Sparkles, TILE_APPLICATION: Compass,
  TILE_GRADES: Shield, TILE_EDGES: Layers,
};

const DATA_TYPES: Record<DynamicAttributeDataType, string> = {
  TEXT: 'نص', NUMBER: 'رقم', BOOLEAN: 'نعم/لا', SELECT: 'قائمة اختيار', MULTI_SELECT: 'اختيار متعدد', DATE: 'تاريخ',
};

export const ProductAttributesPage: React.FC = () => {
  const service = new AttributeService();
  const [categories, setCategories] = useState<AttributeCategory[]>([]);
  const [selectedCatId, setSelectedCatId] = useState<string>('');
  const [newValue, setNewValue] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{
    name: string;
    code: string;
    dataType: DynamicAttributeDataType;
    unit: string;
    isRequired: boolean;
    isFilterable: boolean;
    options: string;
  }>({
    name: '',
    code: '',
    dataType: 'SELECT',
    unit: '',
    isRequired: false,
    isFilterable: true,
    options: '',
  });

  const load = () => {
    setLoading(true);
    try {
      const rows = service.getCategories();
      setCategories(rows);
      setSelectedCatId((prev) => (rows.some((c) => c.id === prev) ? prev : rows[0]?.id || ''));
      setError(null);
    } catch (e: any) { setError(e?.message || 'تعذر تحميل الخصائص.'); }
    finally { setLoading(false); }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const activeCategory = categories.find((c) => c.id === selectedCatId) || categories[0];

  const handleAddValue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCategory || !newValue.trim()) return;
    try { service.addValue(activeCategory.id, newValue); setNewValue(''); load(); }
    catch (err: any) { alert(err?.message); }
  };

  const handleRemoveValue = (optionId: string) => {
    if (!confirm('حذف هذه القيمة؟')) return;
    try { service.removeValue(optionId); load(); } catch (err: any) { alert(err?.message); }
  };

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      service.addCategory({
        name: form.name,
        code: form.code.toUpperCase(),
        dataType: form.dataType,
        unit: form.unit || undefined,
        isRequired: form.isRequired,
        isFilterable: form.isFilterable,
        options: form.options.split(/\r?\n/),
      });
      setModalOpen(false);
      setForm({
        name: '',
        code: '',
        dataType: 'SELECT',
        unit: '',
        isRequired: false,
        isFilterable: true,
        options: '',
      });
      load();
    } catch (err: any) { alert(err?.message); }
    finally { setSaving(false); }
  };

  const filteredValues = (activeCategory?.values || []).filter((v) =>
    v.label.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-600"><Ruler className="w-5 h-5" /></div>
          <div>
            <h1 className="text-base font-black text-slate-900">الخصائص والمواصفات الفنية (Tile Attributes)</h1>
            <p className="text-xs text-slate-500 font-medium">تعريف مقاسات السيراميك، التشطيبات، الفئات وأماكن الاستخدام</p>
          </div>
        </div>
        <button onClick={() => setModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold transition shrink-0">
          <Plus className="w-4 h-4" /> خاصية جديدة
        </button>
      </div>

      {error && <div className="mx-4 mt-3 px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{error}</div>}

      <div className="flex-1 overflow-hidden p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-3 overflow-y-auto">
          <span className="text-xs font-bold text-slate-500 block px-1">مجموعات الخصائص</span>
          {loading ? <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-teal-500" /></div> : categories.map((cat) => {
            const Icon = ICONS[cat.code] || Tag;
            return (
              <button key={cat.id} onClick={() => setSelectedCatId(cat.id)} className={`w-full text-right p-4 rounded-2xl border transition flex flex-col gap-1 ${selectedCatId === cat.id ? 'bg-teal-50 border-teal-300 text-teal-700 font-bold shadow-sm' : 'bg-white border-slate-200 hover:border-slate-300'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold flex items-center gap-1.5"><Icon className="w-4 h-4" />{cat.name}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-50 font-mono text-slate-500 border border-slate-200">{cat.values.length} قيمة</span>
                </div>
                <p className="text-[11px] text-slate-500 line-clamp-1">{DATA_TYPES[cat.dataType] || cat.dataType}{cat.unit ? ` • ${cat.unit}` : ''}</p>
              </button>
            );
          })}
          {!loading && categories.length === 0 && <div className="py-10 text-center text-xs text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl">لا توجد خصائص معرفة</div>}
        </div>

        <div className="md:col-span-2 bg-white border border-slate-200 rounded-3xl p-6 flex flex-col overflow-hidden">
          {activeCategory ? (
            <>
              <div className="space-y-5 flex-1 overflow-y-auto">
                <div className="border-b border-slate-200 pb-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-black text-slate-900">{activeCategory.name}</h2>
                    <span className="text-xs font-mono text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">{activeCategory.code}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    النوع: {DATA_TYPES[activeCategory.dataType] || activeCategory.dataType}
                    {activeCategory.unit ? ` • الوحدة: ${activeCategory.unit}` : ''}
                    {activeCategory.isRequired ? ' • مطلوب' : ''}
                    {activeCategory.isFilterable ? ' • مفعّل لإعداد التصفية' : ''}
                  </p>
                </div>

                <form onSubmit={handleAddValue} className="flex gap-2">
                  <input value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder={`أدخل قيمة جديدة لـ ${activeCategory.name}...`} className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-teal-500 font-medium" />
                  <button type="submit" className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0"><Plus className="w-4 h-4" /> إضافة</button>
                </form>

                <div className="relative">
                  <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث في القيم..." className="w-full pl-3 pr-9 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-teal-500" />
                </div>

                <div className="flex flex-wrap gap-2.5 pt-2">
                  {filteredValues.map((val) => (
                    <div key={val.id} className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 flex items-center gap-2 hover:border-slate-300 transition">
                      <span>{val.label}</span>
                      <button onClick={() => handleRemoveValue(val.id)} className="text-slate-400 hover:text-rose-600 text-xs font-mono p-0.5 transition" title="حذف">✕</button>
                    </div>
                  ))}
                  {filteredValues.length === 0 && <span className="text-xs text-slate-400">لا توجد قيم مطابقة</span>}
                </div>
              </div>
              <div className="pt-4 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between">
                <span>تظهر هذه القيم تلقائياً في شاشة المنتج لتحديد المواصفات</span>
                <span className="font-mono text-teal-600 font-bold">{filteredValues.length} قيمة</span>
              </div>
            </>
          ) : <div className="m-auto text-xs text-slate-400">اختر مجموعة خصائص أو أضف واحدة جديدة</div>}
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold text-slate-900">خاصية جديدة</h3>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleAddCategory} className="space-y-3 text-xs">
              <div><label className="font-bold text-slate-700 block mb-1">الاسم *</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-semibold" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="font-bold text-slate-700 block mb-1">الرمز *</label><input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="TILE_COLOR" className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" /></div>
                <div><label className="font-bold text-slate-700 block mb-1">الوحدة</label><input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="م² / سم" className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" /></div>
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">نوع البيانات</label>
                <select value={form.dataType} onChange={(e) => setForm({ ...form, dataType: e.target.value as DynamicAttributeDataType })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                  {Object.entries(DATA_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              {['SELECT', 'MULTI_SELECT'].includes(form.dataType) && (
                <div>
                  <label className="font-bold text-slate-700 block mb-1">خيارات الاختيار (خيار لكل سطر)</label>
                  <textarea
                    rows={3}
                    value={form.options}
                    onChange={(event) => setForm({ ...form, options: event.target.value })}
                    className="w-full resize-y px-3 py-2 bg-slate-50 rounded-xl border border-slate-200"
                    placeholder={'أحمر\nأزرق\nأخضر'}
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 font-semibold">
                  <input
                    type="checkbox"
                    checked={form.isRequired}
                    onChange={(event) => setForm({ ...form, isRequired: event.target.checked })}
                  />
                  مطلوب عند حفظ المنتج
                </label>
                <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 font-semibold">
                  <input
                    type="checkbox"
                    checked={form.isFilterable}
                    onChange={(event) => setForm({ ...form, isFilterable: event.target.checked })}
                  />
                  تفعيل إعداد التصفية
                </label>
                <p className="col-span-2 text-[11px] text-slate-500">
                  يُحفظ هذا الإعداد مع الخاصية؛ لم يُربط بعد بقائمة تصفية المنتجات.
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl">إلغاء</button>
                <button type="submit" disabled={saving} className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl flex items-center gap-2">{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} إضافة</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
