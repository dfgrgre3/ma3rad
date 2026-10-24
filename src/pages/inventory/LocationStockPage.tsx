import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Package, RefreshCw, Search, Warehouse as WarehouseIcon } from 'lucide-react';
import { CeramicMath } from '../../utils/ceramicMath';
import { InventoryService } from '../../services/InventoryService';
import { ProductService } from '../../services/ProductService';
import type { Product, Warehouse } from '../../types';

type LocationStockPageProps = {
  mode: 'warehouse' | 'showroom';
};

type StockRow = ReturnType<InventoryService['getWarehouseStock']>[number];
type ComparisonFilter = 'all' | 'showroom-only' | 'warehouse-only' | 'both' | 'neither';

const formatQuantity = (quantity: number) => CeramicMath.formatM2(quantity);
const formatBoxes = (boxes: number) =>
  new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(boxes);

const matchesSearch = (value: string, search: string) =>
  value.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());

export const LocationStockPage: React.FC<LocationStockPageProps> = ({ mode }) => {
  const inventoryService = useMemo(() => new InventoryService(), []);
  const productService = useMemo(() => new ProductService(), []);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [showroomWarehouseId, setShowroomWarehouseId] = useState('');
  const [storeWarehouseId, setStoreWarehouseId] = useState('');
  const [search, setSearch] = useState('');
  const [comparisonFilter, setComparisonFilter] = useState<ComparisonFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isComparison = mode === 'showroom';

  const loadData = () => {
    setLoading(true);
    try {
      const nextWarehouses = inventoryService.getAllWarehouses();
      setWarehouses(nextWarehouses);
      setProducts(productService.getAllProducts());
      setStock(inventoryService.getWarehouseStock());

      const showroom = nextWarehouses.find((warehouse) => /معرض|صالة العرض/i.test(warehouse.name));
      const store = nextWarehouses.find((warehouse) =>
        warehouse.id !== showroom?.id && /مخزن|مستودع/i.test(warehouse.name)
      );
      setShowroomWarehouseId((current) =>
        nextWarehouses.some((warehouse) => warehouse.id === current)
          ? current
          : showroom?.id || nextWarehouses[0]?.id || ''
      );
      setStoreWarehouseId((current) =>
        nextWarehouses.some((warehouse) => warehouse.id === current)
          ? current
          : store?.id || nextWarehouses.find((warehouse) => warehouse.id !== (showroom?.id || nextWarehouses[0]?.id))?.id || ''
      );
      setSelectedWarehouseId((current) =>
        current === '' || nextWarehouses.some((warehouse) => warehouse.id === current) ? current : ''
      );
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل بيانات المخزون.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [inventoryService, productService]);

  const searchableProducts = useMemo(
    () => products.filter((product) => {
      if (!search.trim()) return true;
      return [product.name, product.sku, product.barcode, product.size]
        .some((value) => matchesSearch(value || '', search));
    }),
    [products, search]
  );

  const warehouseItems = useMemo(() => {
    const visibleIds = new Set(warehouses.map((warehouse) => warehouse.id));
    const searchableProductIds = new Set(searchableProducts.map((product) => product.id));
    return stock.filter((row) =>
      row.quantityM2 > 0 &&
      visibleIds.has(row.warehouseId) &&
      (!selectedWarehouseId || row.warehouseId === selectedWarehouseId) &&
      searchableProductIds.has(row.productId)
    );
  }, [searchableProducts, selectedWarehouseId, stock, warehouses]);

  const comparisonItems = useMemo(() => {
    const showroomStock = new Map(
      stock.filter((row) => row.warehouseId === showroomWarehouseId).map((row) => [row.productId, row])
    );
    const storeStock = new Map(
      stock.filter((row) => row.warehouseId === storeWarehouseId).map((row) => [row.productId, row])
    );

    return searchableProducts
      .map((product) => ({
        product,
        showroom: showroomStock.get(product.id),
        warehouse: storeStock.get(product.id),
      }))
      .filter(({ showroom, warehouse }) => {
        const inShowroom = (showroom?.quantityM2 ?? 0) > 0;
        const inWarehouse = (warehouse?.quantityM2 ?? 0) > 0;
        if (comparisonFilter === 'showroom-only') return inShowroom && !inWarehouse;
        if (comparisonFilter === 'warehouse-only') return inWarehouse && !inShowroom;
        if (comparisonFilter === 'both') return inShowroom && inWarehouse;
        if (comparisonFilter === 'neither') return !inShowroom && !inWarehouse;
        return true;
      });
  }, [comparisonFilter, searchableProducts, showroomWarehouseId, stock, storeWarehouseId]);

  const renderQuantity = (row: StockRow | undefined, locationSelected: boolean) => {
    if (!locationSelected) return <span className="font-semibold text-slate-400">اختر المخزن أولًا</span>;
    if (!row) return <span className="font-bold text-rose-600">غير مسجل</span>;
    if (row.quantityM2 <= 0) return <span className="font-bold text-amber-600">غير متوفر (الرصيد صفر)</span>;
    return (
      <div>
        <div className="font-black text-emerald-700">{formatQuantity(row.quantityM2)}</div>
        <div className="mt-1 text-[11px] text-slate-500">
          {formatBoxes(row.quantityBoxes)} كرتونة
        </div>
      </div>
    );
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-4 sm:p-6" dir="rtl">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${isComparison ? 'border-sky-200 bg-sky-50' : 'border-violet-200 bg-violet-50'}`}>
            {isComparison
              ? <Building2 className="h-5 w-5 text-sky-600" />
              : <WarehouseIcon className="h-5 w-5 text-violet-600" />}
          </div>
          <div>
            <h1 className="text-base font-black text-slate-900">
              {isComparison ? 'مخزون المعرض ومقارنته بالمخزن' : 'الأصناف الموجودة في المخزن'}
            </h1>
            <p className="text-xs text-slate-500">
              {isComparison
                ? 'قارن أرصدة جميع الأصناف بين المعرض والمخزن، بما فيها الأصناف غير المسجلة بأحدهما.'
                : 'عرض كل الأصناف ذات الرصيد الموجود في المخازن.'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          تحديث البيانات
        </button>
      </div>

      <div className="mb-4 grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:grid-cols-2">
        <label className="relative block">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="بحث باسم الصنف أو الكود أو المقاس..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-3 pr-9 text-xs focus:border-sky-400 focus:outline-none"
          />
        </label>

        {isComparison ? (
          <>
            <label className="flex items-center gap-2">
              <span className="shrink-0 text-xs font-bold text-slate-600">مخزن المعرض</span>
              <select
                value={showroomWarehouseId}
                onChange={(event) => {
                  const nextId = event.target.value;
                  setShowroomWarehouseId(nextId);
                  if (nextId && nextId === storeWarehouseId) setStoreWarehouseId('');
                }}
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold"
              >
                <option value="">اختر مخزن المعرض</option>
                {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className="shrink-0 text-xs font-bold text-slate-600">المخزن</span>
              <select
                value={storeWarehouseId}
                onChange={(event) => {
                  const nextId = event.target.value;
                  setStoreWarehouseId(nextId);
                  if (nextId && nextId === showroomWarehouseId) setShowroomWarehouseId('');
                }}
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold"
              >
                <option value="">اختر المخزن</option>
                {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className="shrink-0 text-xs font-bold text-slate-600">فلترة الأصناف</span>
              <select
                value={comparisonFilter}
                onChange={(event) => setComparisonFilter(event.target.value as ComparisonFilter)}
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold"
              >
                <option value="all">كل الأصناف</option>
                <option value="showroom-only">موجود في المعرض فقط</option>
                <option value="warehouse-only">موجود في المخزن فقط</option>
                <option value="both">موجود في الاثنين</option>
                <option value="neither">غير متوفر في الاثنين</option>
              </select>
            </label>
          </>
        ) : (
          <label className="flex items-center gap-2">
            <span className="shrink-0 text-xs font-bold text-slate-600">المخزن</span>
            <select
              value={selectedWarehouseId}
              onChange={(event) => setSelectedWarehouseId(event.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold"
            >
              <option value="">كل المخازن</option>
              {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
            </select>
          </label>
        )}
      </div>

      {error && <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">{error}</div>}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-sm font-semibold text-slate-500">جاري تحميل بيانات المخزون...</div>
        ) : isComparison ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-right text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="p-3.5">الصنف</th>
                  <th className="p-3.5 text-center">المعرض — {warehouses.find((item) => item.id === showroomWarehouseId)?.name || 'غير محدد'}</th>
                  <th className="p-3.5 text-center">المخزن — {warehouses.find((item) => item.id === storeWarehouseId)?.name || 'غير محدد'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {comparisonItems.map(({ product, showroom, warehouse }) => (
                  <tr key={product.id} className="hover:bg-slate-50">
                    <td className="p-3.5">
                      <div className="flex items-start gap-2">
                        <Package className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                        <div>
                          <div className="font-bold text-slate-900">{product.name}</div>
                          <div className="mt-1 text-[10px] text-slate-500">كود: {product.sku} · المقاس: {product.size}</div>
                        </div>
                      </div>
                    </td>
                    <td className="border-r border-slate-100 p-3.5 text-center">{renderQuantity(showroom, Boolean(showroomWarehouseId))}</td>
                    <td className="border-r border-slate-100 p-3.5 text-center">{renderQuantity(warehouse, Boolean(storeWarehouseId))}</td>
                  </tr>
                ))}
                {comparisonItems.length === 0 && (
                  <tr><td colSpan={3} className="py-12 text-center text-slate-500">لا توجد أصناف تطابق الفلتر المحدد.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-right text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="p-3.5">المخزن</th>
                  <th className="p-3.5">الصنف</th>
                  <th className="p-3.5">المقاس</th>
                  <th className="p-3.5">الرصيد بالمتر</th>
                  <th className="p-3.5">الرصيد بالكرتونة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {warehouseItems.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="p-3.5 font-bold text-violet-700">{row.warehouseName}</td>
                    <td className="p-3.5">
                      <div className="font-bold text-slate-900">{row.productName}</div>
                      <div className="mt-1 text-[10px] text-slate-500">كود: {row.sku}</div>
                    </td>
                    <td className="p-3.5 font-semibold text-slate-700">{row.size}</td>
                    <td className="p-3.5 font-black text-emerald-700">{formatQuantity(row.quantityM2)}</td>
                    <td className="p-3.5 font-semibold text-slate-700">{formatBoxes(row.quantityBoxes)} كرتونة</td>
                  </tr>
                ))}
                {warehouseItems.length === 0 && (
                  <tr><td colSpan={5} className="py-12 text-center text-slate-500">لا يوجد رصيد متوفر في المخزن المحدد.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!loading && (
        <p className="mt-3 text-[11px] font-medium text-slate-500">
          {isComparison ? `عدد الأصناف المعروضة: ${comparisonItems.length}` : `عدد سجلات الأصناف المتوفرة: ${warehouseItems.length}`}
        </p>
      )}
    </div>
  );
};
