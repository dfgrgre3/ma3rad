import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Building2, Package, RefreshCw, Search, Warehouse as WarehouseIcon } from 'lucide-react';
import { formatProductQuantity } from '../../../utils/products/productUnits';
import { InventoryService } from '../../../services/domains/inventory/InventoryService';
import { ProductService } from '../../../services/domains/products/ProductService';
import { usePermission } from '../../../hooks/domains/auth/usePermission';
import type { Product, Warehouse } from '../../../types';

type LocationStockPageProps = {
  mode: 'warehouse' | 'showroom';
};

type StockRow = ReturnType<InventoryService['getWarehouseStock']>[number];
type ComparisonFilter = 'all' | 'showroom-only' | 'warehouse-only' | 'both' | 'neither';

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
  const can = usePermission();
  const canView = mode === 'showroom' ? can('inventory.showroom_stock.view') : can('inventory.warehouse_stock.view');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [nextWarehouses, nextProducts, nextStock] = await Promise.all([
        inventoryService.getAllWarehousesAsync(),
        productService.getAllProductsAsync(),
        inventoryService.getWarehouseStockAsync(),
      ]);
      setWarehouses(nextWarehouses);
      setProducts(nextProducts);
      setStock(nextStock);

      const showrooms = nextWarehouses.filter((warehouse) => warehouse.warehouseType === 'SHOWROOM');
      const stores = nextWarehouses.filter((warehouse) => warehouse.warehouseType !== 'SHOWROOM');
      setShowroomWarehouseId((current) =>
        showrooms.some((warehouse) => warehouse.id === current)
          ? current
          : showrooms[0]?.id || ''
      );
      setStoreWarehouseId((current) =>
        stores.some((warehouse) => warehouse.id === current)
          ? current
          : stores[0]?.id || ''
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
  }, [inventoryService, productService, setLoading, setWarehouses, setProducts, setStock, setShowroomWarehouseId, setStoreWarehouseId, setSelectedWarehouseId, setError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
  const showroomWarehouses = warehouses.filter((warehouse) => warehouse.warehouseType === 'SHOWROOM');
  const storeWarehouses = warehouses.filter((warehouse) => warehouse.warehouseType !== 'SHOWROOM');

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
    if (!locationSelected) return <span className="font-semibold text-muted">اختر المخزن أولًا</span>;
    if (!row) return <span className="font-bold text-danger">غير مسجل</span>;
    if (row.quantityM2 <= 0) return <span className="font-bold text-warning">غير متوفر (الرصيد صفر)</span>;
    return (
      <div>
        <div className="font-black text-success">{formatProductQuantity(row.quantityM2, row)}</div>
        {row.productType !== 'GENERAL' && <div className="mt-1 text-[11px] text-muted">{formatBoxes(row.quantityBoxes)} كرتونة</div>}
      </div>
    );
  };

  if (!canView) {
    return (
      <div className="m-8 rounded-2xl border border-warning-border bg-warning-soft p-6 text-sm font-bold text-warning">
        لا تملك صلاحية عرض أرصدة المخازن.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-surface-muted p-4 sm:p-6">
      <div className="mb-5 bg-surface px-5 pt-4 rounded-2xl border border-line shadow-sm">
        <PageHeader
          icon={isComparison
            ? <Building2 className="h-5 w-5" />
            : <WarehouseIcon className="h-5 w-5" />}
          title={isComparison ? 'مخزون المعرض ومقارنته بالمخزن' : 'الأصناف الموجودة في المخزن'}
          description={isComparison
            ? 'قارن أرصدة جميع الأصناف بين المعرض والمخزن، بما فيها الأصناف غير المسجلة بأحدهما.'
            : 'عرض كل الأصناف ذات الرصيد الموجود في المخازن.'}
          actions={
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-bold text-ink transition hover:bg-surface-sunken disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              تحديث البيانات
            </button>
          }
        />
      </div>

      <div className="mb-4 grid gap-3 rounded-2xl border border-line bg-surface p-3 shadow-sm md:grid-cols-2">
        <label className="relative block">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="بحث باسم الصنف أو الكود أو المقاس..."
            className="w-full rounded-xl border border-line bg-surface-muted py-2.5 pl-3 pr-9 text-xs focus:border-primary focus:outline-none"
          />
        </label>

        {isComparison ? (
          <>
            <label className="flex items-center gap-2">
              <span className="shrink-0 text-xs font-bold text-ink-secondary">مخزن المعرض</span>
              <select
                value={showroomWarehouseId}
                onChange={(event) => {
                  const nextId = event.target.value;
                  setShowroomWarehouseId(nextId);
                  if (nextId && nextId === storeWarehouseId) setStoreWarehouseId('');
                }}
                className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 text-xs font-semibold"
              >
                <option value="">اختر مخزن المعرض</option>
                {showroomWarehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className="shrink-0 text-xs font-bold text-ink-secondary">المخزن</span>
              <select
                value={storeWarehouseId}
                onChange={(event) => {
                  const nextId = event.target.value;
                  setStoreWarehouseId(nextId);
                  if (nextId && nextId === showroomWarehouseId) setShowroomWarehouseId('');
                }}
                className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 text-xs font-semibold"
              >
                <option value="">اختر المخزن</option>
                {storeWarehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className="shrink-0 text-xs font-bold text-ink-secondary">فلترة الأصناف</span>
              <select
                value={comparisonFilter}
                onChange={(event) => setComparisonFilter(event.target.value as ComparisonFilter)}
                className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 text-xs font-semibold"
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
            <span className="shrink-0 text-xs font-bold text-ink-secondary">المخزن</span>
            <select
              value={selectedWarehouseId}
              onChange={(event) => setSelectedWarehouseId(event.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 text-xs font-semibold"
            >
              <option value="">كل المخازن</option>
              {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
            </select>
          </label>
        )}
      </div>

      {error && <div role="alert" className="mb-4 rounded-xl border border-danger-border bg-danger-soft px-4 py-3 text-xs font-semibold text-danger">{error}</div>}

      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-sm font-semibold text-muted">جاري تحميل بيانات المخزون...</div>
        ) : isComparison ? (
          <div className="overflow-x-auto">
            <DataTable
              ariaLabel="مقارنة المخزون"
              rows={comparisonItems}
              rowKey={(row) => row.product.id}
              minWidth={760}
              dense
              tableClassName="text-xs"
              columns={[
                {
                  key: 'product', header: 'الصنف',
                  render: ({ product }) => (
                    <span className="flex items-start gap-2">
                      <Package className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                      <span>
                        <span className="block font-bold text-ink">{product.name}</span>
                        <span className="mt-1 block text-[10px] text-muted">كود: {product.sku} · المقاس: {product.size}</span>
                      </span>
                    </span>
                  ),
                },
                { key: 'showroom', header: `المعرض — ${warehouses.find((item) => item.id === showroomWarehouseId)?.name || 'غير محدد'}`, align: 'center', render: ({ showroom }) => renderQuantity(showroom, Boolean(showroomWarehouseId)) },
                { key: 'store', header: `المخزن — ${warehouses.find((item) => item.id === storeWarehouseId)?.name || 'غير محدد'}`, align: 'center', render: ({ warehouse }) => renderQuantity(warehouse, Boolean(storeWarehouseId)) },
              ]}
              emptyTitle="لا توجد أصناف تطابق الفلتر المحدد."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <DataTable
              ariaLabel="رصيد المخازن"
              rows={warehouseItems}
              rowKey={(row) => row.id}
              minWidth={640}
              dense
              tableClassName="text-xs"
              columns={[
                { key: 'warehouse', header: 'المخزن', render: (row) => <span className="font-bold text-primary">{row.warehouseName}</span> },
                {
                  key: 'product', header: 'الصنف',
                  render: (row) => (
                    <span>
                      <span className="block font-bold text-ink">{row.productName}</span>
                      <span className="mt-1 block text-[10px] text-muted">كود: {row.sku}</span>
                    </span>
                  ),
                },
                { key: 'size', header: 'المقاس', render: (row) => <span className="font-semibold text-ink">{row.size}</span> },
                { key: 'qty', header: 'الرصيد بوحدة الصنف', render: (row) => <span className="font-black text-success">{formatProductQuantity(row.quantityM2, row)}</span> },
                { key: 'boxes', header: 'الرصيد بالكرتونة', render: (row) => <span className="font-semibold text-ink">{row.productType === 'GENERAL' ? '—' : `${formatBoxes(row.quantityBoxes)} كرتونة`}</span> },
              ]}
              emptyTitle="لا يوجد رصيد متوفر في المخزن المحدد."
            />
          </div>
        )}
      </div>

      {!loading && (
        <p className="mt-3 text-[11px] font-medium text-muted">
          {isComparison ? `عدد الأصناف المعروضة: ${comparisonItems.length}` : `عدد سجلات الأصناف المتوفرة: ${warehouseItems.length}`}
        </p>
      )}
    </div>
  );
};
