import React, { useEffect, useState, useMemo } from 'react';
import { Warehouse, Plus, Search, MapPin, Database, Loader2, X, AlertTriangle, Pencil, Power, Star, ArrowLeftRight } from 'lucide-react';
import { OperationsService, WarehouseRow } from '../../../services/domains/operations/OperationsService';
import { PageHeader } from '../../../components/ui/PageHeader';
import { useActivityPageCopy } from '../../../hooks/domains/config/useBusinessTerm';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { CentralLimitGuard } from '../../../components/ui/CentralLimitGuard';
import { OperationalFieldService, type OperationalFieldDefinition } from '../../../services/domains/products/OperationalFieldService';
import { OperationalFieldsForm } from '../../../components/products/OperationalFieldsForm';
import { OperationalFieldsSummary } from '../../../components/products/OperationalFieldsSummary';
import { OperationalFieldsRecordEditor } from '../../../components/products/OperationalFieldsRecordEditor';
import { OperationalFieldsFilter, matchesOperationalFieldFilters, type OperationalFieldFilters } from '../../../components/products/OperationalFieldsFilter';
import { InventoryService } from '../../../services/domains/inventory/InventoryService';
import { isWarehouseType, WAREHOUSE_TYPES, WAREHOUSE_TYPE_LABELS, type WarehouseType } from '../../../types/products/catalog';
import { getProductUnitLabel } from '../../../utils/products/productUnits';

import { useToast } from '../../../components/ui/Toast';
type WarehouseMetrics = {
  quantityByUnit: Record<string, number>;
  availableByUnit: Record<string, number>;
  reservedByUnit: Record<string, number>;
  totalValue: number;
  productCount: number;
  lowStockCount: number;
};

type WarehouseStockItem = ReturnType<InventoryService['getWarehouseStock']>[number];

const isLowStock = (item: WarehouseStockItem) => item.availableM2 <= item.minStockLevel;

const addQuantityByUnit = (totals: Record<string, number>, item: WarehouseStockItem, quantity: number) => {
  const unit = getProductUnitLabel(item);
  totals[unit] = (totals[unit] || 0) + quantity;
};

const formatQuantitiesByUnit = (quantities: Record<string, number>) => {
  const entries = Object.entries(quantities);
  return entries.length
    ? entries.map(([unit, quantity]) => `${Number(quantity.toFixed(2)).toLocaleString('ar-EG', { maximumFractionDigits: 2 })} ${unit}`).join(' • ')
    : '0';
};

export const WarehousesPage: React.FC = () => {
  const pageCopy = useActivityPageCopy('inventory');
  const toast = useToast();
  const service = new OperationsService();
  const fieldService = new OperationalFieldService();
  const inventoryService = new InventoryService();
  const currentUser = AuthService.getCurrentUser();
  const canManage = PermissionService.can(currentUser, 'ui.warehouses.warehouses.manage');
  const canTransfer = PermissionService.can(currentUser, 'ui.inventory.hub.transfer');
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<WarehouseRow | null>(null);
  const [transferWarehouse, setTransferWarehouse] = useState<WarehouseRow | null>(null);
  const [transferDestinationId, setTransferDestinationId] = useState('');
  const [transferSaving, setTransferSaving] = useState(false);
  const [fields, setFields] = useState<OperationalFieldDefinition[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [valuesByWarehouse, setValuesByWarehouse] = useState<Record<string, Record<string, string>>>({});
  const [fieldFilters, setFieldFilters] = useState<OperationalFieldFilters>({});
  const [form, setForm] = useState<{
    name: string;
    location: string;
    branchId: string;
    warehouseType: WarehouseType;
  }>({
    name: '',
    location: '',
    branchId: '',
    warehouseType: 'BRANCH_WAREHOUSE',
  });
  const [stockByWarehouse, setStockByWarehouse] = useState<Record<string, WarehouseStockItem[]>>({});
  const [metricsByWarehouse, setMetricsByWarehouse] = useState<Record<string, WarehouseMetrics>>({});
  const [stockMetricsLoading, setStockMetricsLoading] = useState(false);
  const [stockMetricsError, setStockMetricsError] = useState<string | null>(null);

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
    if (!warehouses.length) {
      setMetricsByWarehouse({});
      setStockByWarehouse({});
      setStockMetricsError(null);
      setStockMetricsLoading(false);
      return;
    }

    setStockMetricsLoading(true);
    setStockMetricsError(null);
    setMetricsByWarehouse({});
    setStockByWarehouse({});

    try {
      const allStock = [
        ...inventoryService.getWarehouseStock(),
        ...inventoryService.getInactiveWarehouseStock(),
      ];
      const metrics: Record<string, WarehouseMetrics> = {};
      const stockMap: Record<string, WarehouseStockItem[]> = {};

      for (const warehouse of warehouses) {
        const stock = allStock.filter((item) => item.warehouseId === warehouse.id);
        const quantityByUnit: Record<string, number> = {};
        const availableByUnit: Record<string, number> = {};
        const reservedByUnit: Record<string, number> = {};
        let totalValue = 0;

        for (const item of stock) {
          addQuantityByUnit(quantityByUnit, item, item.quantityM2);
          addQuantityByUnit(availableByUnit, item, item.availableM2);
          addQuantityByUnit(reservedByUnit, item, item.reservedM2);
          totalValue += item.quantityM2 * (item.costPrice || 0);
        }

        stockMap[warehouse.id] = stock;
        metrics[warehouse.id] = {
          quantityByUnit,
          availableByUnit,
          reservedByUnit,
          totalValue: Number(totalValue.toFixed(2)),
          productCount: stock.length,
          lowStockCount: stock.filter(isLowStock).length,
        };
      }

      setMetricsByWarehouse(metrics);
      setStockByWarehouse(stockMap);
    } catch (e) {
      console.error('Failed to load warehouse stock metrics:', e);
      setStockMetricsError(e instanceof Error ? e.message : 'تعذر تحميل مؤشرات المخزون.');
    } finally {
      setStockMetricsLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadStockMetrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouses]);

  const handleSaveWarehouse = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const operation = editingWarehouse ? 'update' : 'create';
      fieldService.validateRecordValues('warehouses', values, operation);
      const saved = editingWarehouse
        ? service.updateWarehouse(editingWarehouse.id, {
          name: form.name,
          location: form.location,
          branchId: form.branchId || undefined,
          warehouseType: form.warehouseType,
        })
        : service.createWarehouse({
          name: form.name,
          location: form.location || undefined,
          branchId: form.branchId || undefined,
          warehouseType: form.warehouseType,
        });
      fieldService.setRecordValues('warehouses', saved.id, values, operation);
      setValues({});
      setModalOpen(false);
      setEditingWarehouse(null);
      setForm({ name: '', location: '', branchId: '', warehouseType: 'BRANCH_WAREHOUSE' });
      load();
    } catch (err: any) { toast.error(err?.message || 'تعذر حفظ بيانات المخزن.'); }
    finally { setSaving(false); }
  };

  const openCreate = () => {
    setEditingWarehouse(null);
    setForm({ name: '', location: '', branchId: '', warehouseType: 'BRANCH_WAREHOUSE' });
    setValues({});
    setModalOpen(true);
  };

  const openEdit = (warehouse: WarehouseRow) => {
    setEditingWarehouse(warehouse);
    setForm({
      name: warehouse.name,
      location: warehouse.location || '',
      branchId: warehouse.branchId || '',
      warehouseType: warehouse.warehouseType,
    });
    setValues(valuesByWarehouse[warehouse.id] || {});
    setModalOpen(true);
  };

  const handleWarehouseActivation = (warehouse: WarehouseRow) => {
    try {
      service.setWarehouseActive(warehouse.id, !warehouse.isActive);
      load();
    } catch (err: any) { toast.error(err?.message || 'تعذر تغيير حالة المخزن.'); }
  };

  const handleSetDefault = (warehouse: WarehouseRow) => {
    try {
      service.setDefaultWarehouse(warehouse.id);
      load();
    } catch (err: any) { toast.error(err?.message || 'تعذر تعيين المخزن الافتراضي.'); }
  };

  const openTransfer = (warehouse: WarehouseRow) => {
    const destination = warehouses.find((candidate) => candidate.isActive && candidate.id !== warehouse.id);
    if (!destination) {
      toast.warning('لا يوجد مخزن نشط آخر متاح لنقل الرصيد إليه.');
      return;
    }
    setTransferWarehouse(warehouse);
    setTransferDestinationId(destination.id);
  };

  const handleTransferRequest = () => {
    if (!transferWarehouse || !transferDestinationId) return;
    setTransferSaving(true);
    try {
      const transferId = inventoryService.requestWarehouseStockTransfer(
        transferWarehouse.id,
        transferDestinationId,
        `إخلاء المخزن قبل تعطيله: ${transferWarehouse.name}`
      );
      setTransferWarehouse(null);
      setTransferDestinationId('');
      load();
      toast.success(`تم إنشاء طلب نقل الرصيد (${transferId}). سيظل المخزن نشطًا حتى اعتماد التحويل وإرساله واستلامه؛ بعد ذلك يمكنك تعطيله.`);
    } catch (err: any) { toast.error(err?.message || 'تعذر نقل رصيد المخزن.'); }
    finally { setTransferSaving(false); }
  };

  const handleWarehouseTypeChange = (warehouseId: string, warehouseType: WarehouseType) => {
    try {
      service.updateWarehouseType(warehouseId, warehouseType);
      setWarehouses((current) => current.map((warehouse) =>
        warehouse.id === warehouseId ? { ...warehouse, warehouseType } : warehouse
      ));
    } catch (err: any) {
      toast.error(err?.message || 'تعذر تحديث نوع المخزن.');
    }
  };

  const globalTotals = useMemo(() => {
    const allStock = Object.values(stockByWarehouse).flat();
    const quantities = {
      quantityByUnit: {} as Record<string, number>,
      availableByUnit: {} as Record<string, number>,
      reservedByUnit: {} as Record<string, number>,
    };
    const lowStockProducts = new Set<string>();
    let totalValue = 0;

    for (const item of allStock) {
      addQuantityByUnit(quantities.quantityByUnit, item, item.quantityM2);
      addQuantityByUnit(quantities.availableByUnit, item, item.availableM2);
      addQuantityByUnit(quantities.reservedByUnit, item, item.reservedM2);
      totalValue += item.quantityM2 * (item.costPrice || 0);
      if (isLowStock(item)) lowStockProducts.add(item.productId);
    }

    return {
      ...quantities,
      totalValue: Number(totalValue.toFixed(2)),
      productCount: new Set(allStock.map((item) => item.productId)).size,
      lowStockCount: lowStockProducts.size,
    };
  }, [stockByWarehouse]);

  return (
    <div className="h-full flex flex-col bg-surface-muted text-ink overflow-hidden">
      <div className="bg-surface px-6 pt-4">
        <PageHeader
          icon={<Warehouse className="h-5 w-5" />}
          title={pageCopy?.title || 'المخازن والمستودعات'}
          description={pageCopy?.description || 'متابعة الأرصدة الفعلية، قيمة المخزون، وتنبيهات النقص لكل مخزن'}
          actions={
            <CentralLimitGuard metric="maxWarehouses">
              {canManage && (
                <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary text-white rounded-xl text-sm font-semibold transition shrink-0">
                  <Plus className="w-4 h-4" /> إضافة مخزن جديد
                </button>
              )}
            </CentralLimitGuard>
          }
        />
      </div>

      {/* Global Summary Cards */}
      <div className="p-4 bg-surface border-b border-line">
        {stockMetricsError && <div role="alert" className="mb-3 px-4 py-2.5 rounded-xl bg-danger-soft border border-danger-border text-danger text-xs font-semibold">تعذر تحميل مؤشرات المخزون: {stockMetricsError}</div>}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="bg-surface-muted rounded-xl p-4 border border-line">
            <div className="text-xs text-muted font-semibold mb-1">إجمالي الرصيد حسب الوحدة</div>
            <div className="text-lg font-black text-ink">{stockMetricsLoading || stockMetricsError ? '—' : formatQuantitiesByUnit(globalTotals.quantityByUnit)}</div>
          </div>
          <div className="bg-surface-muted rounded-xl p-4 border border-line">
            <div className="text-xs text-muted font-semibold mb-1">المتاح للبيع حسب الوحدة</div>
            <div className="text-lg font-black text-success">{stockMetricsLoading || stockMetricsError ? '—' : formatQuantitiesByUnit(globalTotals.availableByUnit)}</div>
          </div>
          <div className="bg-surface-muted rounded-xl p-4 border border-line">
            <div className="text-xs text-muted font-semibold mb-1">المحجوز للطلبيات حسب الوحدة</div>
            <div className="text-lg font-black text-warning">{stockMetricsLoading || stockMetricsError ? '—' : formatQuantitiesByUnit(globalTotals.reservedByUnit)}</div>
          </div>
          <div className="bg-surface-muted rounded-xl p-4 border border-line">
            <div className="text-xs text-muted font-semibold mb-1">قيمة المخزون الإجمالية</div>
            <div className="text-lg font-black text-primary">{stockMetricsLoading || stockMetricsError ? '—' : globalTotals.totalValue.toLocaleString('ar-EG', { maximumFractionDigits: 2 })}</div>
          </div>
          <div className="bg-surface-muted rounded-xl p-4 border border-line">
            <div className="text-xs text-muted font-semibold mb-1">أصناف مخزنة</div>
            <div className="text-lg font-black text-primary">{stockMetricsLoading || stockMetricsError ? '—' : globalTotals.productCount}</div>
          </div>
          <div className={`bg-danger-soft rounded-xl p-4 border border-danger-border ${globalTotals.lowStockCount > 0 ? 'border-danger' : 'border-danger-border'}`}>
            <div className="text-xs text-muted font-semibold mb-1 flex items-center gap-1">
              <AlertTriangle className="w-4 h-4 text-danger" /> أصناف منتهية/منخفضة
            </div>
            <div className="text-lg font-black text-danger">{stockMetricsLoading || stockMetricsError ? '—' : globalTotals.lowStockCount}</div>
          </div>
        </div>
      </div>

      <div className="p-4 bg-surface border-b border-line">
        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="relative">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث باسم المخزن أو العنوان ثم اضغط إدخال..." className="w-full pl-4 pr-10 py-2.5 bg-surface border border-line rounded-xl text-sm focus:outline-none focus:border-primary" />
        </form>
        <div className="mt-3"><OperationalFieldsFilter fields={fields} values={fieldFilters} onChange={setFieldFilters} /></div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {error && <div className="mb-3 px-4 py-2.5 rounded-xl bg-danger-soft border border-danger-border text-danger text-xs font-semibold">{error}</div>}
        {loading ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div> : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {warehouses.filter((warehouse) => matchesOperationalFieldFilters(warehouse.id, valuesByWarehouse, fieldFilters)).map((w) => {
              const m = metricsByWarehouse[w.id];
              const stock = stockByWarehouse[w.id] ?? [];
              const hasStock = stock.some((item) =>
                Math.abs(item.quantityM2) > 0.000001 || item.reservedM2 > 0.000001
              );
              const lowStockItems = stock.filter(isLowStock).slice(0, 3);
              return (
                <div key={w.id} className="bg-surface border border-line hover:border-line-strong rounded-xl p-5 transition flex flex-col justify-between group">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-extrabold text-ink group-hover:text-primary transition text-base">{w.name}</h3>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${w.isActive ? 'bg-success-soft text-success border-success-border' : 'bg-surface-sunken text-muted border-line'}`}>{w.isActive ? 'نشط' : 'معطل'}</span>
                    </div>
                    <p className="text-[10px] font-mono text-muted mb-3">{w.code} {w.isDefault && <span className="text-primary font-bold">• افتراضي</span>}</p>
                    <div className="mb-3">
                      {canManage ? (
                        <select
                          aria-label={`نوع ${w.name}`}
                          value={w.warehouseType}
                          onChange={(e) => {
                            if (isWarehouseType(e.target.value)) handleWarehouseTypeChange(w.id, e.target.value);
                          }}
                          className="w-full px-2.5 py-2 bg-surface-muted rounded-lg border border-line text-xs font-bold"
                        >
                          {WAREHOUSE_TYPES.map((warehouseType) => (
                            <option key={warehouseType} value={warehouseType}>{WAREHOUSE_TYPE_LABELS[warehouseType]}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-[10px] text-ink-secondary font-bold">{WAREHOUSE_TYPE_LABELS[w.warehouseType]}</span>
                      )}
                    </div>
                    <div className="space-y-2 text-xs text-muted">
                      <div className="flex items-start gap-1.5"><MapPin className="w-4 h-4 shrink-0 mt-0.5" /><span>{w.location || '—'}</span></div>
                      <div className="flex items-center gap-1.5"><Database className="w-4 h-4" /><span>الفرع: {w.branchName || '—'}</span></div>
                    </div>
                    <div className="mt-3 space-y-2">
                      {stockMetricsError ? (
                        <div role="alert" className="bg-danger-soft rounded-xl p-3 border border-danger-border text-xs font-semibold text-danger">تعذر تحميل مؤشرات هذا المخزن.</div>
                      ) : stockMetricsLoading || !m ? (
                        <div className="bg-surface-muted rounded-xl p-3 border border-line text-xs text-muted">جارٍ تحميل مؤشرات المخزون...</div>
                      ) : (
                        <div className="bg-surface-muted rounded-xl p-3 border border-line">
                          <div className="flex items-start justify-between text-xs mb-1 gap-2">
                            <span className="text-muted shrink-0">إجمالي الرصيد</span>
                            <span className="font-bold text-ink text-left">{formatQuantitiesByUnit(m.quantityByUnit)}</span>
                          </div>
                          <div className="flex items-start justify-between text-xs mb-1 gap-2">
                            <span className="text-muted shrink-0">المتاح للبيع</span>
                            <span className="font-bold text-success text-left">{formatQuantitiesByUnit(m.availableByUnit)}</span>
                          </div>
                          <div className="flex items-start justify-between text-xs mb-1 gap-2">
                            <span className="text-muted shrink-0">المحجوز للطلبيات</span>
                            <span className="font-bold text-warning text-left">{formatQuantitiesByUnit(m.reservedByUnit)}</span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted">قيمة المخزون</span>
                            <span className="font-bold text-primary">{m.totalValue.toLocaleString('ar-EG', { maximumFractionDigits: 2 })}</span>
                          </div>
                        </div>
                      )}
                      {m && m.lowStockCount > 0 && (
                        <div className="bg-danger-soft rounded-xl p-2.5 border border-danger-border">
                          <div className="flex items-center gap-1.5 text-xs">
                            <AlertTriangle className="w-3.5 h-3.5 text-danger" />
                            <span className="text-danger font-semibold">{m.lowStockCount} صنف منتهي أو منخفض</span>
                          </div>
                        </div>
                      )}
                      {!stockMetricsError && !stockMetricsLoading && m && <div className="mt-2 bg-surface-muted rounded-xl p-2 border border-line">
                        <div className="flex items-center justify-between text-[10px] mb-1">
                          <span className="text-muted">أصناف مخزنة</span>
                          <span className="font-bold text-ink">{m.productCount} صنف</span>
                        </div>
                        {lowStockItems.length > 0 && (
                          <div className="text-[10px] text-muted">
                            <div className="mb-1">أصناف منخفضة:</div>
                            <ul className="list-disc list-inside space-y-0.5 text-danger">
                              {lowStockItems.map((item) => (
                                <li key={item.productId}>{item.productName || item.productId}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>}
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
                  {canManage && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <button onClick={() => openEdit(w)} className="flex-1 min-w-[92px] px-2.5 py-2 bg-surface-sunken text-ink font-bold rounded-xl text-xs hover:bg-surface-sunken transition flex items-center justify-center gap-1">
                        <Pencil className="w-3.5 h-3.5" /> تعديل
                      </button>
                      {hasStock && canTransfer && (
                        <button onClick={() => openTransfer(w)} disabled={!w.isActive} className="flex-1 min-w-[105px] px-2.5 py-2 bg-warning-soft text-warning font-bold rounded-xl text-xs hover:bg-warning-soft transition flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed">
                          <ArrowLeftRight className="w-3.5 h-3.5" /> نقل الرصيد
                        </button>
                      )}
                      {w.isActive && !w.isDefault && (
                        <button onClick={() => handleSetDefault(w)} className="flex-1 min-w-[100px] px-2.5 py-2 bg-accent-soft text-primary font-bold rounded-xl text-xs hover:bg-accent-soft transition flex items-center justify-center gap-1">
                          <Star className="w-3.5 h-3.5" /> تعيين افتراضي
                        </button>
                      )}
                      <button
                        onClick={() => handleWarehouseActivation(w)}
                        disabled={w.isActive && (hasStock || stockMetricsLoading || Boolean(stockMetricsError))}
                        title={w.isActive && hasStock ? 'انقل الأرصدة وألغِ الحجوزات قبل تعطيل المخزن' : undefined}
                        className={`flex-1 min-w-[92px] px-2.5 py-2 font-bold rounded-xl text-xs transition flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed ${w.isActive ? 'bg-danger-soft text-danger hover:bg-danger-soft' : 'bg-success-soft text-success hover:bg-success-soft'}`}
                      >
                        <Power className="w-3.5 h-3.5" /> {w.isActive ? 'تعطيل' : 'إعادة تفعيل'}
                      </button>
                      {hasStock && !canTransfer && (
                        <p className="w-full text-[10px] text-warning text-center">
                          يلزم منح صلاحية التحويل المخزني لنقل الرصيد قبل التعطيل.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {warehouses.length === 0 && <div className="col-span-full py-16 text-center text-muted border-2 border-dashed border-line rounded-2xl bg-surface">لا توجد مخازن</div>}
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl border border-line shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold text-ink">{editingWarehouse ? 'تعديل بيانات المخزن' : 'إضافة مخزن جديد'}</h3>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg text-muted hover:bg-surface-sunken"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSaveWarehouse} className="space-y-3 text-xs">
              <div><label className="font-bold text-ink block mb-1">اسم المخزن *</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line font-semibold" /></div>
              <div><label className="font-bold text-ink block mb-1">الموقع</label><input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line" /></div>
              <div>
                <label className="font-bold text-ink block mb-1">نوع المستودع</label>
                <select
                  required
                  value={form.warehouseType}
                  onChange={(e) => {
                    if (isWarehouseType(e.target.value)) setForm({ ...form, warehouseType: e.target.value });
                  }}
                  className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line font-bold"
                >
                  {WAREHOUSE_TYPES.map((warehouseType) => (
                    <option key={warehouseType} value={warehouseType}>{WAREHOUSE_TYPE_LABELS[warehouseType]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-bold text-ink block mb-1">الفرع</label>
                <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line font-bold">
                  <option value="">— بدون فرع —</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <OperationalFieldsForm fields={fields} values={values} onChange={setValues} title="بيانات إضافية للمخزن" />
              <div className="flex justify-end gap-2 pt-3 border-t border-line">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 bg-surface-sunken text-ink font-bold rounded-xl">إلغاء</button>
                <button type="submit" disabled={saving} className="px-5 py-2 bg-primary hover:bg-primary text-white font-bold rounded-xl flex items-center gap-2">{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {editingWarehouse ? 'حفظ التعديلات' : 'إضافة'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {transferWarehouse && (
        <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl border border-line shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold text-ink">طلب نقل الرصيد قبل تعطيل المخزن</h3>
              <button onClick={() => setTransferWarehouse(null)} className="p-1.5 rounded-lg text-muted hover:bg-surface-sunken"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-sm text-ink-secondary mb-4">
              سيتم إنشاء طلب لنقل جميع أرصدة «{transferWarehouse.name}» بما فيها أرصدة الأصناف المعطلة. يبقى المخزن نشطًا حتى اعتماد التحويل وإرساله واستلامه، ثم يمكنك تعطيله. تُرفض المخازن التي لديها حجوزات أو أرصدة سالبة.
            </p>
            <label className="font-bold text-ink block mb-1 text-xs">المخزن المستهدف</label>
            <select value={transferDestinationId} onChange={(e) => setTransferDestinationId(e.target.value)} className="w-full px-3 py-2.5 bg-surface-muted rounded-xl border border-line text-sm font-bold">
              {warehouses.filter((warehouse) => warehouse.isActive && warehouse.id !== transferWarehouse.id).map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>{warehouse.name} — {warehouse.branchName || 'بدون فرع'}</option>
              ))}
            </select>
            <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-line">
              <button type="button" onClick={() => setTransferWarehouse(null)} className="px-4 py-2 bg-surface-sunken text-ink font-bold rounded-xl">إلغاء</button>
              <button type="button" onClick={handleTransferRequest} disabled={transferSaving || !transferDestinationId} className="px-4 py-2 bg-warning hover:bg-warning text-white font-bold rounded-xl flex items-center gap-2 disabled:opacity-50">
                {transferSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} إنشاء طلب نقل
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
