import React, { useEffect, useState, useMemo } from 'react';
import { Warehouse, Plus, Search, MapPin, Database, Loader2, X, AlertTriangle } from 'lucide-react';
import { OperationsService, WarehouseRow } from '../../../services/domains/operations/OperationsService';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { CentralLimitGuard } from '../../../components/ui/CentralLimitGuard';
import { OperationalFieldService, type OperationalFieldDefinition } from '../../../services/domains/products/OperationalFieldService';
import { OperationalFieldsForm } from '../../../components/products/OperationalFieldsForm';
import { OperationalFieldsSummary } from '../../../components/products/OperationalFieldsSummary';
import { OperationalFieldsRecordEditor } from '../../../components/products/OperationalFieldsRecordEditor';
import { OperationalFieldsFilter, matchesOperationalFieldFilters, type OperationalFieldFilters } from '../../../components/products/OperationalFieldsFilter';
import { InventoryService } from '../../../services/domains/inventory/InventoryService';
import type { WarehouseStock } from '../../../types';

type WarehouseMetrics = {
  totalQtyM2: number;
  availableM2: number;
  reservedM2: number;
  totalValue: number;
  productCount: number;
  lowStockCount: number;
};

export const WarehousesPage: React.FC = () => {
  const service = new OperationsService();
  const fieldService = new OperationalFieldService();
  const inventoryService = new InventoryService();
  const currentUser = AuthService.getCurrentUser();
  const canCreate = PermissionService.can(currentUser, 'ui.warehouses.warehouses.create');
  const canManage = PermissionService.can(currentUser, 'ui.warehouses.warehouses.manage');
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState<OperationalFieldDefinition[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [valuesByWarehouse, setValuesByWarehouse] = useState<Record<string, Record<string, string>>>({});
  const [fieldFilters, setFieldFilters] = useState<OperationalFieldFilters>({});
  const [form, setForm] = useState({ name: '', location: '', branchId: '' });
  const [stockByWarehouse, setStockByWarehouse] = useState<Record<string, WarehouseStock[]>>({});
  const [metricsByWarehouse, setMetricsByWarehouse] = useState<Record<string, WarehouseMetrics>>({});

  const load = () => {
    setLoading(true);
    try {
      const currentWarehouses = service.getWarehouses(search);
      setWarehouses(currentWarehouses);
      setFields(fieldService.getDefinitions('warehouses'));
      setValuesByWarehouse(fieldService.getRecordValuesForRecords('warehouses', currentWarehouses.map((warehouse) => warehouse.id)));
      setBranches(service.getBranches().map((b) => ({ id: b.id, name: b.name })));
      setError(null);
    } catch (e: any) { setError(e?.message || 'تعذر تحميل المخازن.'); }
    finally { setLoading(false); }
  };

  const loadStockMetrics = () => {
    const metrics: Record<string, WarehouseMetrics> = {};
    const stockMap: Record<string, WarehouseStock[]> = {};

    for (const w of warehouses) {
      try {
        const stock = inventoryService.getWarehouseStock(w.id);
        stockMap[w.id] = stock;

        const totalQtyM2 = stock.reduce((sum, s) => sum + s.quantityM2, 0);
        const availableM2 = stock.reduce((sum, s) => sum + s.availableM2, 0);
        const reservedM2 = stock.reduce((sum, s) => sum + s.reservedM2, 0);
        const totalValue = stock.reduce((sum, s) => sum + (s.quantityM2 * (s.costPrice || 0)), 0);
        const lowStockCount = stock.filter((s) => s.availableM2 <= 0).length;

        metrics[w.id] = {
          totalQtyM2: Number(totalQtyM2.toFixed(2)),
          availableM2: Number(availableM2.toFixed(2)),
          reservedM2: Number(reservedM2.toFixed(2)),
          totalValue: Number(totalValue.toFixed(2)),
          productCount: stock.length,
          lowStockCount,
        };
      } catch (e) {
        console.error(`Failed to load stock for warehouse ${w.id}:`, e);
        metrics[w.id] = { totalQtyM2: 0, availableM2: 0, reservedM2: 0, totalValue: 0, productCount: 0, lowStockCount: 0 };
        stockMap[w.id] = [];
      }
    }

    setMetricsByWarehouse(metrics);
    setStockByWarehouse(stockMap);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadStockMetrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouses, search]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      fieldService.validateRecordValues('warehouses', values, 'create');
      const created = service.createWarehouse({ name: form.name, location: form.location || undefined, branchId: form.branchId || undefined });
      fieldService.setRecordValues('warehouses', created.id, values, 'create');
      setValues({});
      setModalOpen(false);
      setForm({ name: '', location: '', branchId: '' });
      load();
    } catch (err: any) { alert(err?.message || 'تعذر إضافة المخزن.'); }
    finally { setSaving(false); }
  };

  const globalTotals = useMemo(() => {
    return warehouses.reduce((acc, w) => {
      const m = metricsByWarehouse[w.id] ?? { totalQtyM2: 0, availableM2: 0, reservedM2: 0, totalValue: 0, productCount: 0, lowStockCount: 0 };
      return {
        totalQtyM2: acc.totalQtyM2 + m.totalQtyM2,
        availableM2: acc.availableM2 + m.availableM2,
        reservedM2: acc.reservedM2 + m.reservedM2,
        totalValue: acc.totalValue + m.totalValue,
        productCount: acc.productCount + m.productCount,
        lowStockCount: acc.lowStockCount + m.lowStockCount,
      };
    }, { totalQtyM2: 0, availableM2: 0, reservedM2: 0, totalValue: 0, productCount: 0, lowStockCount: 0 });
  }, [warehouses, metricsByWarehouse]);

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-200 flex items-center justify-center"><Warehouse className="w-5 h-5 text-violet-600" /></div>
          <div>
            <h1 className="text-base font-black text-slate-900">المخازن والمستودعات</h1>
            <p className="text-xs text-slate-500 font-medium">متابعة الأرصدة الفعلية، قيمة المخزون، وتنبيهات النقص لكل مخزن</p>
          </div>
        </div>
        <CentralLimitGuard metric="maxWarehouses">
          {(canCreate || canManage) && (
            <button onClick={() => setModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold transition shrink-0">
              <Plus className="w-4 h-4" /> إضافة مخزن جديد
            </button>
          )}
        </CentralLimitGuard>
      </div>

      {/* Global Summary Cards */}
      <div className="p-4 bg-white border-b border-slate-200">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <div className="text-xs text-slate-500 font-semibold mb-1">إجمالي المخزون (م²)</div>
            <div className="text-lg font-black text-slate-900">{globalTotals.totalQtyM2.toLocaleString('ar-EG', { maximumFractionDigits: 2 })}</div>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <div className="text-xs text-slate-500 font-semibold mb-1">المتاح للبيع (م²)</div>
            <div className="text-lg font-black text-emerald-600">{globalTotals.availableM2.toLocaleString('ar-EG', { maximumFractionDigits: 2 })}</div>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <div className="text-xs text-slate-500 font-semibold mb-1">المحجوز للطلبيات (م²)</div>
            <div className="text-lg font-black text-amber-600">{globalTotals.reservedM2.toLocaleString('ar-EG', { maximumFractionDigits: 2 })}</div>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <div className="text-xs text-slate-500 font-semibold mb-1">قيمة المخزون الإجمالية</div>
            <div className="text-lg font-black text-violet-600">{globalTotals.totalValue.toLocaleString('ar-EG', { maximumFractionDigits: 2 })}</div>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <div className="text-xs text-slate-500 font-semibold mb-1">أصناف مخزنة</div>
            <div className="text-lg font-black text-sky-600">{globalTotals.productCount}</div>
          </div>
          <div className={`bg-rose-50 rounded-xl p-4 border border-rose-200 ${globalTotals.lowStockCount > 0 ? 'border-rose-300' : 'border-rose-200'}`}>
            <div className="text-xs text-slate-500 font-semibold mb-1 flex items-center gap-1">
              <AlertTriangle className="w-4 h-4 text-rose-600" /> أصناف منتهية/منخفضة
            </div>
            <div className="text-lg font-black text-rose-600">{globalTotals.lowStockCount}</div>
          </div>
        </div>
      </div>

      <div className="p-4 bg-white border-b border-slate-200">
        <form onSubmit={(e) => { e.preventDefault(); load(); loadStockMetrics(); }} className="relative">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث باسم المخزن أو العنوان ثم اضغط إدخال..." className="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-violet-400" />
        </form>
        <div className="mt-3"><OperationalFieldsFilter fields={fields} values={fieldFilters} onChange={setFieldFilters} /></div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {error && <div className="mb-3 px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{error}</div>}
        {loading ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-violet-500" /></div> : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {warehouses.filter((warehouse) => matchesOperationalFieldFilters(warehouse.id, valuesByWarehouse, fieldFilters)).map((w) => {
              const m = metricsByWarehouse[w.id] ?? { totalQtyM2: 0, availableM2: 0, reservedM2: 0, totalValue: 0, productCount: 0, lowStockCount: 0 };
              const stock = stockByWarehouse[w.id] ?? [];
              const lowStockItems = stock.filter((s) => s.availableM2 <= 0).slice(0, 3);
              return (
                <div key={w.id} className="bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-5 transition flex flex-col justify-between group">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-extrabold text-slate-900 group-hover:text-violet-600 transition text-base">{w.name}</h3>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${w.isActive ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>{w.isActive ? 'نشط' : 'معطل'}</span>
                    </div>
                    <p className="text-[10px] font-mono text-slate-400 mb-3">{w.code} {w.isDefault && <span className="text-violet-600 font-bold">• افتراضي</span>}</p>
                    <div className="space-y-2 text-xs text-slate-500">
                      <div className="flex items-start gap-1.5"><MapPin className="w-4 h-4 shrink-0 mt-0.5" /><span>{w.location || '—'}</span></div>
                      <div className="flex items-center gap-1.5"><Database className="w-4 h-4" /><span>الفرع: {w.branchName || '—'}</span></div>
                    </div>
                    <div className="mt-3 space-y-2">
                      <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-slate-500">إجمالي الرصيد</span>
                          <span className="font-bold text-slate-900">{m.totalQtyM2.toLocaleString('ar-EG', { maximumFractionDigits: 2 })} م²</span>
                        </div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-slate-500">المتاح للبيع</span>
                          <span className="font-bold text-emerald-600">{m.availableM2.toLocaleString('ar-EG', { maximumFractionDigits: 2 })} م²</span>
                        </div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-slate-500">المحجوز للطلبيات</span>
                          <span className="font-bold text-amber-600">{m.reservedM2.toLocaleString('ar-EG', { maximumFractionDigits: 2 })} م²</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">قيمة المخزون</span>
                          <span className="font-bold text-violet-600">{m.totalValue.toLocaleString('ar-EG', { maximumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                      {m.lowStockCount > 0 && (
                        <div className="bg-rose-50 rounded-xl p-2.5 border border-rose-200">
                          <div className="flex items-center gap-1.5 text-xs">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                            <span className="text-rose-700 font-semibold">{m.lowStockCount} صنف منتهي أو منخفض</span>
                          </div>
                        </div>
                      )}
                      <div className="mt-2 bg-slate-50 rounded-xl p-2 border border-slate-100">
                        <div className="flex items-center justify-between text-[10px] mb-1">
                          <span className="text-slate-500">أصناف مخزنة</span>
                          <span className="font-bold text-slate-900">{m.productCount} صنف</span>
                        </div>
                        {lowStockItems.length > 0 && (
                          <div className="text-[10px] text-slate-500">
                            <div className="mb-1">أصناف منخفضة:</div>
                            <ul className="list-disc list-inside space-y-0.5 text-rose-600">
                              {lowStockItems.map((item) => (
                                <li key={item.productId}>{item.productName || item.productId}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                    <OperationalFieldsSummary fields={fields} values={valuesByWarehouse[w.id] || {}} />
                    <OperationalFieldsRecordEditor
                      recordLabel={w.name}
                      fields={fields}
                      initialValues={valuesByWarehouse[w.id] || {}}
                      canEdit={canManage}
                      onSave={(next) => {
                        fieldService.setRecordValues('warehouses', w.id, next, 'update');
                        setValuesByWarehouse((previous) => ({ ...previous, [w.id]: next }));
                      }}
                    />
                  </div>
                  <div className="mt-3 flex gap-1.5">
                    <button
                      onClick={() => setModalOpen(false)}
                      className="flex-1 px-3 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-200 transition"
                    >
                      إغلاق
                    </button>
                  </div>
                </div>
              );
            })}
            {warehouses.length === 0 && <div className="col-span-full py-16 text-center text-slate-500 border-2 border-dashed border-slate-200 rounded-2xl bg-white">لا توجد مخازن</div>}
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold text-slate-900">إضافة مخزن جديد</h3>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div><label className="font-bold text-slate-700 block mb-1">اسم المخزن *</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-semibold" /></div>
              <div><label className="font-bold text-slate-700 block mb-1">الموقع</label><input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" /></div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">الفرع</label>
                <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                  <option value="">— بدون فرع —</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <OperationalFieldsForm fields={fields} values={values} onChange={setValues} title="بيانات إضافية للمخزن" />
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl">إلغاء</button>
                <button type="submit" disabled={saving} className="px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-xl flex items-center gap-2">{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} إضافة</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
