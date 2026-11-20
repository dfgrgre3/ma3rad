import React, { useEffect, useState } from 'react';
import { Ruler, Plus, Search, Layers, Sparkles, Tag, Shield, Compass, Loader2, X } from 'lucide-react';
import { AttributeService, AttributeCategory } from '../../../services/domains/products/AttributeService';
import type { DynamicAttributeDataType } from '../../../services/domains/products/dynamicAttributes';
import { usePermission } from '../../../hooks/domains/auth/usePermission';
import { OperationalFieldsManager } from '../operational-fields/OperationalFieldsManager';

import { useToast } from '../../../components/ui/Toast';
import { ActivityGate } from '../../../components/ui/ActivityGate';
import { PageHeader } from '../../../components/ui/PageHeader';
const ICONS: Record<string, React.ElementType> = {
  TILE_SIZES: Ruler, TILE_FINISH: Sparkles, TILE_APPLICATION: Compass,
  TILE_GRADES: Shield, TILE_EDGES: Layers,
};

const DATA_TYPES: Record<DynamicAttributeDataType, string> = {
  TEXT: 'نص', NUMBER: 'رقم', BOOLEAN: 'نعم/لا', SELECT: 'قائمة اختيار', MULTI_SELECT: 'اختيار متعدد', DATE: 'تاريخ',
};

export const ProductAttributesPage: React.FC = () => {
  const toast = useToast();
  const service = new AttributeService();
  const canManage = usePermission()('products.attributes.manage');
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
    if (!canManage) return;
    if (!activeCategory || !newValue.trim()) return;
    try { service.addValue(activeCategory.id, newValue); setNewValue(''); load(); }
    catch (err: any) { toast.error(err?.message); }
  };

  const handleRemoveValue = (optionId: string) => {
    if (!canManage) return;
    if (!confirm('حذف هذه القيمة؟')) return;
    try { service.removeValue(optionId); load(); } catch (err: any) { toast.error(err?.message); }
  };

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
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
    } catch (err: any) { toast.error(err?.message); }
    finally { setSaving(false); }
  };

  const filteredValues = (activeCategory?.values || []).filter((v) =>
    v.label.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col bg-surface-muted text-ink overflow-hidden">
      <div className="bg-surface border-b border-line px-6 pt-4">
        <PageHeader
          icon={<Ruler className="w-5 h-5" />}
          title="الخصائص والمواصفات الفنية (Tile Attributes)"
          description="تعريف مقاسات السيراميك، التشطيبات، الفئات وأماكن الاستخدام"
          actions={canManage && (
            <ActivityGate element="new-attribute"><button onClick={() => setModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-success hover:bg-success text-white rounded-xl text-sm font-semibold transition shrink-0">
              <Plus className="w-4 h-4" /> خاصية جديدة
            </button></ActivityGate>
          )}
        />
      </div>

      {error && <div className="mx-4 mt-3 px-4 py-2.5 rounded-xl bg-danger-soft border border-danger-border text-danger text-xs font-semibold">{error}</div>}

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
        <section className="rounded-2xl border border-success-border bg-surface p-4 sm:p-5">
          <div className="mb-4 border-b border-success-border pb-3">
            <h2 className="text-sm font-black text-ink">مواصفات المنتج الفنية</h2>
            <p className="mt-1 text-xs leading-5 text-ink-secondary">هذه الخصائص الأساسية مثل المقاس والتشطيب والفرز تُستخدم مباشرةً في نماذج المنتجات وبياناتها الحالية.</p>
          </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-3 overflow-y-auto">
          <span className="text-xs font-bold text-muted block px-1">مجموعات الخصائص</span>
          {loading ? <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-success" /></div> : categories.map((cat) => {
            const Icon = ICONS[cat.code] || Tag;
            return (
              <button key={cat.id} onClick={() => setSelectedCatId(cat.id)} className={`w-full text-right p-4 rounded-2xl border transition flex flex-col gap-1 ${selectedCatId === cat.id ? 'bg-success-soft border-success text-success font-bold shadow-sm' : 'bg-surface border-line hover:border-line-strong'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold flex items-center gap-1.5"><Icon className="w-4 h-4" />{cat.name}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-muted font-mono text-muted border border-line">{cat.values.length} قيمة</span>
                </div>
                <p className="text-[11px] text-muted line-clamp-1">{DATA_TYPES[cat.dataType] || cat.dataType}{cat.unit ? ` • ${cat.unit}` : ''}</p>
              </button>
            );
          })}
          {!loading && categories.length === 0 && <div className="py-10 text-center text-xs text-muted border-2 border-dashed border-line rounded-2xl">لا توجد خصائص معرفة</div>}
        </div>

        <div className="md:col-span-2 bg-surface border border-line rounded-3xl p-6 flex flex-col overflow-hidden">
          {activeCategory ? (
            <>
              <div className="space-y-5 flex-1 overflow-y-auto">
                <div className="border-b border-line pb-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-black text-ink">{activeCategory.name}</h2>
                    <span className="text-xs font-mono text-muted bg-surface-muted px-2.5 py-1 rounded-lg border border-line">{activeCategory.code}</span>
                  </div>
                  <p className="text-xs text-muted mt-1">
                    النوع: {DATA_TYPES[activeCategory.dataType] || activeCategory.dataType}
                    {activeCategory.unit ? ` • الوحدة: ${activeCategory.unit}` : ''}
                    {activeCategory.isRequired ? ' • مطلوب' : ''}
                    {activeCategory.isFilterable ? ' • مفعّل لإعداد التصفية' : ''}
                  </p>
                </div>

                {canManage && (
                  <form onSubmit={handleAddValue} className="flex gap-2">
                    <input value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder={`أدخل قيمة جديدة لـ ${activeCategory.name}...`} className="flex-1 bg-surface-muted border border-line rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-success font-medium" />
                    <button type="submit" className="px-5 py-2.5 bg-success hover:bg-success text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0"><Plus className="w-4 h-4" /> إضافة</button>
                  </form>
                )}

                <div className="relative">
                  <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-muted" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث في القيم..." className="w-full pl-3 pr-9 py-2 bg-surface border border-line rounded-xl text-xs focus:outline-none focus:border-success" />
                </div>

                <div className="flex flex-wrap gap-2.5 pt-2">
                  {filteredValues.map((val) => (
                    <div key={val.id} className="px-3.5 py-2 rounded-xl bg-surface-muted border border-line text-xs font-semibold text-ink flex items-center gap-2 hover:border-line-strong transition">
                      <span>{val.label}</span>
                      {canManage && (
                        <button onClick={() => handleRemoveValue(val.id)} className="text-muted hover:text-danger text-xs font-mono p-0.5 transition" title="حذف">✕</button>
                      )}
                    </div>
                  ))}
                  {filteredValues.length === 0 && <span className="text-xs text-muted">لا توجد قيم مطابقة</span>}
                </div>
              </div>
              <div className="pt-4 border-t border-line text-xs text-muted flex items-center justify-between">
                <span>تظهر هذه القيم تلقائياً في شاشة المنتج لتحديد المواصفات</span>
                <span className="font-mono text-success font-bold">{filteredValues.length} قيمة</span>
              </div>
            </>
          ) : <div className="m-auto text-xs text-muted">اختر مجموعة خصائص أو أضف واحدة جديدة</div>}
        </div>
      </div>
        </section>

        <details className="group rounded-2xl border border-line bg-surface-sunken/70 p-3 sm:p-4">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-3 rounded-xl p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-success">
            <span>
              <span className="block text-sm font-black text-ink">حقول إضافية للسجلات التشغيلية</span>
              <span className="mt-1 block max-w-3xl text-xs leading-5 text-ink-secondary">نظام منفصل عن مواصفات المنتج الأساسية: أضف حقولًا مخصصة للمنتجات أو العملاء أو الفواتير وغيرها من السجلات التشغيلية.</span>
            </span>
            <span aria-hidden="true" className="shrink-0 rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-[11px] font-bold text-ink-secondary group-open:hidden">إظهار الإعدادات</span>
            <span aria-hidden="true" className="hidden shrink-0 rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-[11px] font-bold text-ink-secondary group-open:inline-flex">إخفاء الإعدادات</span>
          </summary>
          <div className="mt-3 border-t border-line pt-3">
            <OperationalFieldsManager />
          </div>
        </details>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-primary/40 p-2 backdrop-blur-sm sm:items-center sm:p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-attribute-title"
            className="max-h-[calc(100dvh-1rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface p-4 shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 id="product-attribute-title" className="text-base font-extrabold text-ink">خاصية جديدة</h3>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg text-muted hover:bg-surface-sunken"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleAddCategory} className="space-y-3 text-xs">
              <div><label className="font-bold text-ink block mb-1">الاسم *</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line font-semibold" /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div><label className="font-bold text-ink block mb-1">الرمز *</label><input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="TILE_COLOR" className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line font-mono" /></div>
                <div><label className="font-bold text-ink block mb-1">الوحدة</label><input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="م² / سم" className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line" /></div>
              </div>
              <div>
                <label className="font-bold text-ink block mb-1">نوع البيانات</label>
                <select value={form.dataType} onChange={(e) => setForm({ ...form, dataType: e.target.value as DynamicAttributeDataType })} className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line font-bold">
                  {Object.entries(DATA_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              {['SELECT', 'MULTI_SELECT'].includes(form.dataType) && (
                <div>
                  <label className="font-bold text-ink block mb-1">خيارات الاختيار (خيار لكل سطر)</label>
                  <textarea
                    rows={3}
                    value={form.options}
                    onChange={(event) => setForm({ ...form, options: event.target.value })}
                    className="w-full resize-y px-3 py-2 bg-surface-muted rounded-xl border border-line"
                    placeholder={'أحمر\nأزرق\nأخضر'}
                  />
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 font-semibold">
                  <input
                    type="checkbox"
                    checked={form.isRequired}
                    onChange={(event) => setForm({ ...form, isRequired: event.target.checked })}
                  />
                  مطلوب عند حفظ المنتج
                </label>
                <label className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 font-semibold">
                  <input
                    type="checkbox"
                    checked={form.isFilterable}
                    onChange={(event) => setForm({ ...form, isFilterable: event.target.checked })}
                  />
                  تفعيل إعداد التصفية
                </label>
                <p className="col-span-2 text-[11px] text-muted">
                  يُحفظ هذا الإعداد مع الخاصية؛ لم يُربط بعد بقائمة تصفية المنتجات.
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-line">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 bg-surface-sunken text-ink font-bold rounded-xl">إلغاء</button>
                <button type="submit" disabled={saving} className="px-5 py-2 bg-success hover:bg-success text-white font-bold rounded-xl flex items-center gap-2">{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} إضافة</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
