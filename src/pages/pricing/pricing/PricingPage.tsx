import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Percent, Plus, Search, Trash2, Loader2, X, Power } from 'lucide-react';
import { PricingService, PriceList, PriceListItem } from '../../../services/domains/sales/PricingService';
import { ProductService } from '../../../services/domains/products/ProductService';
import { ProductPicker } from '../../../components/products/ProductPicker';
import { usePermission } from '../../../hooks/domains/auth/usePermission';
import type { Product } from '../../../types';

import { useToast } from '../../../components/ui/Toast';
const CATEGORY_LABELS: Record<PriceList['customerType'], { label: string; color: string }> = {
  RETAIL: { label: 'بيع قطاعي', color: 'bg-success-soft text-success border-success-border' },
  WHOLESALE: { label: 'جملة الموزعين', color: 'bg-accent-soft text-primary border-accent-border' },
  CONTRACTOR: { label: 'سعر المقاولين', color: 'bg-accent-soft text-primary border-accent-border' },
  VIP: { label: 'عملاء VIP', color: 'bg-warning-soft text-warning border-warning-border' },
  PROJECT: { label: 'مشاريع', color: 'bg-accent-soft text-primary border-accent-border' },
};

const fmt = (n: number) => new Intl.NumberFormat('ar-EG').format(Math.round(n)) + ' ج';

export const PricingPage: React.FC = () => {
  const toast = useToast();
  const service = useMemo(() => new PricingService(), []);
  const canManage = usePermission()('pricing.update');
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setLists(service.getPriceLists());
      setProducts(await new ProductService().getAllProductsAsync());
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل قوائم الأسعار.');
    } finally {
      setLoading(false);
    }
  }, [service]);

  useEffect(() => { load(); }, [load]);

  const loadItems = (list: PriceList) => {
    setActiveList(list);
    try { setItems(service.getPriceListItems(list.id)); } catch (e: any) { toast.warning(e?.message); }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
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
      toast.error(err?.message || 'تعذر إنشاء القائمة.');
    } finally {
      setSaving(false);
    }
  };

  const toggle = (list: PriceList) => {
    if (!canManage) return;
    try { service.togglePriceList(list.id, !list.isActive); load(); } catch (e: any) { toast.warning(e?.message); }
  };

  const addItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
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
      toast.error(err?.message || 'تعذر إضافة الصنف.');
    }
  };

  const removeItem = (id: string) => {
    if (!canManage || !activeList) return;
    try { service.deletePriceListItem(id); loadItems(activeList); load(); } catch (e: any) { toast.warning(e?.message); }
  };

  const filtered = lists.filter((p) => p.name.includes(search) || p.code.includes(search));

  return (
    <div className="h-full flex flex-col bg-surface-muted text-ink overflow-hidden">
      <div className="bg-surface border-b border-line px-6 pt-4">
        <PageHeader
          icon={<Percent className="w-5 h-5" />}
          title="قوائم تسعير السيراميك والمواد"
          description="إعداد الخصومات وقوائم الأسعار المخصصة للمقاولين والتجار وكبار العملاء"
          actions={canManage && (
            <button onClick={() => setCreateOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-success hover:bg-success text-white rounded-xl text-sm font-semibold transition shrink-0">
              <Plus className="w-4 h-4" /> إنشاء قائمة أسعار
            </button>
          )}
        />
      </div>

      <div className="p-4 bg-surface border-b border-line">
        <div className="relative">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث باسم أو كود القائمة..." className="w-full pl-4 pr-10 py-2.5 bg-surface border border-line rounded-xl text-sm focus:outline-none focus:border-success" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {error && <div className="mb-3 px-4 py-2.5 rounded-xl bg-danger-soft border border-danger-border text-danger text-xs font-semibold">{error}</div>}
        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-success" /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((list) => {
              const st = CATEGORY_LABELS[list.customerType] || CATEGORY_LABELS.RETAIL;
              return (
                <div key={list.id} className="bg-surface border border-line hover:border-line-strong rounded-xl p-5 transition flex flex-col justify-between group">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold border ${st.color}`}>{st.label}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${list.isActive ? 'bg-success-soft text-success border-success-border' : 'bg-surface-sunken text-muted border-line'}`}>
                        {list.isActive ? 'نشطة' : 'معطلة'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-extrabold text-ink group-hover:text-success transition">{list.name}</h3>
                      {list.isDefault && <span className="text-[9px] bg-accent-soft text-primary px-1.5 py-0.5 rounded font-bold border border-accent-border">افتراضية</span>}
                    </div>
                    <p className="text-[10px] font-mono text-muted mb-2">{list.code}</p>
                    <div className="text-xs text-muted font-semibold">تضم {list.itemsCount} صنف بأسعار مخصصة.</div>
                    {(list.validFrom || list.validTo) && (
                      <div className="text-[10px] text-muted mt-1">الصلاحية: {list.validFrom || '—'} → {list.validTo || '—'}</div>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-line flex justify-end gap-2">
                    {canManage && (
                      <button onClick={() => toggle(list)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition flex items-center gap-1 ${list.isActive ? 'bg-surface-muted text-ink-secondary border-line hover:bg-surface-sunken' : 'bg-success-soft text-success border-success-border hover:bg-success-soft'}`}>
                        <Power className="w-3 h-3" /> {list.isActive ? 'تعطيل' : 'تفعيل'}
                      </button>
                    )}
                    <button onClick={() => loadItems(list)} className="px-3 py-1.5 bg-success-soft hover:bg-success-soft text-success border border-success-border rounded-lg text-xs font-bold transition">
                      عرض الأسعار
                    </button>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="col-span-full py-16 text-center text-muted border-2 border-dashed border-line rounded-2xl bg-surface">
                <Percent className="w-12 h-12 text-muted mx-auto mb-3" />
                <p className="text-sm">لا توجد قوائم أسعار مطابقة</p>
              </div>
            )}
          </div>
        )}
      </div>

      {canManage && createOpen && (
        <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl border border-line shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold text-ink">إنشاء قائمة أسعار</h3>
              <button onClick={() => setCreateOpen(false)} className="p-1.5 rounded-lg text-muted hover:bg-surface-sunken"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-ink block mb-1">اسم القائمة *</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line font-semibold" />
              </div>
              <div>
                <label className="font-bold text-ink block mb-1">نوع العملاء</label>
                <select value={form.customerType} onChange={(e) => setForm({ ...form, customerType: e.target.value })} className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line font-bold">
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-ink block mb-1">صالح من</label>
                  <input type="date" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line font-mono" />
                </div>
                <div>
                  <label className="font-bold text-ink block mb-1">صالح إلى</label>
                  <input type="date" value={form.validTo} onChange={(e) => setForm({ ...form, validTo: e.target.value })} className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line font-mono" />
                </div>
              </div>
              <label className="flex items-center gap-2 font-bold text-ink">
                <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} className="w-4 h-4 rounded" />
                اجعلها القائمة الافتراضية
              </label>
              <div className="flex justify-end gap-2 pt-3 border-t border-line">
                <button type="button" onClick={() => setCreateOpen(false)} className="px-4 py-2 bg-surface-sunken text-ink font-bold rounded-xl">إلغاء</button>
                <button type="submit" disabled={saving} className="px-5 py-2 bg-success hover:bg-success disabled:opacity-60 text-white font-bold rounded-xl flex items-center gap-2">
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} إنشاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeList && (
        <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl border border-line shadow-2xl max-w-3xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-extrabold text-ink">أسعار: {activeList.name}</h3>
                <p className="text-[10px] text-muted font-mono">{activeList.code} • {activeList.itemsCount} صنف</p>
              </div>
              <button onClick={() => setActiveList(null)} className="p-1.5 rounded-lg text-muted hover:bg-surface-sunken"><X className="w-4 h-4" /></button>
            </div>

            {canManage && (
              <form onSubmit={addItem} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-2 mb-4 text-xs">
                <ProductPicker
                  required
                  value={itemForm.productId}
                  selectedLabel={products.find((product) => product.id === itemForm.productId)?.name}
                  ariaLabel="استعراض أصناف قائمة الأسعار"
                  onChange={(productId) => setItemForm({ ...itemForm, productId })}
                  className="col-span-2"
                />
                <input required type="number" min="0.01" step="0.01" placeholder="سعر المتر" value={itemForm.priceM2} onChange={(e) => setItemForm({ ...itemForm, priceM2: e.target.value })} className="px-2 py-2 bg-surface-muted rounded-lg border border-line font-mono" />
                <input type="number" min="0" step="0.01" placeholder="سعر الكرتونة" value={itemForm.priceBox} onChange={(e) => setItemForm({ ...itemForm, priceBox: e.target.value })} className="px-2 py-2 bg-surface-muted rounded-lg border border-line font-mono" />
                <input type="number" min="0" step="0.01" placeholder="الحد الأدنى للمتر" value={itemForm.minQuantityM2} onChange={(e) => setItemForm({ ...itemForm, minQuantityM2: e.target.value })} className="px-2 py-2 bg-surface-muted rounded-lg border border-line font-mono" />
                <button type="submit" className="px-3 py-2 bg-success hover:bg-success text-white font-bold rounded-lg flex items-center justify-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> إضافة
                </button>
              </form>
            )}

            <div className="border border-line rounded-xl overflow-hidden">
              <DataTable
              ariaLabel="أسعار مخصصة"
              rows={items}
              rowKey={(item: any) => String(item.id)}
              dense
              tableClassName="text-xs"
              rowClassName={() => 'transition hover:bg-surface-muted'}
              columns={[
                { key: 'product', header: 'الصنف', render: (item: any) => <span className="font-bold text-ink">{item.productName}</span> },
                { key: 'sku', header: 'الكود', render: (item: any) => <span className="font-mono text-muted">{item.productSku}</span> },
                { key: 'm2', header: 'سعر المتر', render: (item: any) => <span className="font-bold text-success">{fmt(item.priceM2)}</span> },
                { key: 'box', header: 'سعر الكرتونة', render: (item: any) => <span className="font-mono text-ink-secondary">{item.priceBox ? fmt(item.priceBox) : '—'}</span> },
                { key: 'min', header: 'الحد الأدنى', render: (item: any) => <span className="font-mono text-ink-secondary">{item.minQuantityM2 || 0}</span> },
                {
                  key: 'del', header: '',
                  render: (item: any) => canManage ? (
                    <button onClick={() => removeItem(item.id)} className="rounded-lg p-1.5 text-muted transition hover:bg-danger-soft hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
                  ) : null,
                },
              ]}
              emptyTitle="لا توجد أسعار مخصصة — القائمة تستخدم السعر الأساسي للأصناف"
            />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
