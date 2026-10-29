import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChefHat, CirclePlus, Coffee, RefreshCw, Utensils } from 'lucide-react';
import type { Customer, PaymentType, Product, Warehouse } from '../../types';
import { CustomerService } from '../../services/CustomerService';
import { InventoryService } from '../../services/InventoryService';
import { ManufacturingService, type BillOfMaterials } from '../../services/ManufacturingService';
import { ProductService } from '../../services/ProductService';
import { isServiceProduct } from '../../utils/productUnits';
import {
  RestaurantService,
  type RestaurantKitchenStatus,
  type RestaurantMenuItem,
  type RestaurantOrder,
  type RestaurantServiceMode,
  type RestaurantTable,
} from '../../services/RestaurantService';
import { usePermission } from '../../hooks/usePermission';
import { useToast } from '../../components/ui/Toast';

type OrderLineDraft = { productId: string; quantity: string; notes: string };
type RecipeLineDraft = { componentProductId: string; quantity: string; unit: string };

const KITCHEN_ACTION: Record<RestaurantKitchenStatus, { next: RestaurantKitchenStatus; label: string }> = {
  NEW: { next: 'PREPARING', label: 'بدء التحضير' },
  PREPARING: { next: 'READY', label: 'جاهز' },
  READY: { next: 'SERVED', label: 'تم التقديم' },
  SERVED: { next: 'SERVED', label: 'مكتمل' },
};

const KITCHEN_LABEL: Record<RestaurantKitchenStatus, string> = {
  NEW: 'جديد',
  PREPARING: 'قيد التحضير',
  READY: 'جاهز',
  SERVED: 'تم التقديم',
};

const SERVICE_MODE_LABEL: Record<RestaurantServiceMode, string> = {
  DINE_IN: 'داخل المطعم',
  TAKEAWAY: 'استلام',
  DELIVERY: 'توصيل',
};

const currency = new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 });
const emptyRecipeLine = (): RecipeLineDraft => ({ componentProductId: '', quantity: '1', unit: 'PIECE' });

export const RestaurantPage: React.FC = () => {
  const service = useMemo(() => new RestaurantService(), []);
  const manufacturing = useMemo(() => new ManufacturingService(), []);
  const toast = useToast();
  const can = usePermission();
  const canCreate = can('orders.create');
  const canUpdate = can('orders.update');
  const canCreateOrder = canCreate && can('customers.view') && can('products.view') && can('inventory.view');
  const canManageRecipes = can('manufacturing.manage');
  const canViewRecipes = can('manufacturing.view');

  const [tab, setTab] = useState<'floor' | 'kitchen' | 'recipes'>('floor');
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [menuItems, setMenuItems] = useState<RestaurantMenuItem[]>([]);
  const [orders, setOrders] = useState<RestaurantOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [recipes, setRecipes] = useState<BillOfMaterials[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [tableNumber, setTableNumber] = useState('');
  const [tableCapacity, setTableCapacity] = useState('2');
  const [menuProductId, setMenuProductId] = useState('');
  const [serviceMode, setServiceMode] = useState<RestaurantServiceMode>('DINE_IN');
  const [tableId, setTableId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [paymentType, setPaymentType] = useState<PaymentType>('CASH');
  const [orderNotes, setOrderNotes] = useState('');
  const [orderLines, setOrderLines] = useState<OrderLineDraft[]>([{ productId: '', quantity: '1', notes: '' }]);

  const [recipeProductId, setRecipeProductId] = useState('');
  const [recipeName, setRecipeName] = useState('');
  const [recipeLines, setRecipeLines] = useState<RecipeLineDraft[]>([emptyRecipeLine()]);

  const load = useCallback(() => {
    setLoading(true);
    try {
      setTables(service.getTables());
      setOrders(service.getOpenOrders());
      setProducts(can('products.view') ? new ProductService().getAllProducts() : []);
      setMenuItems(can('products.view') ? service.getMenuItems() : []);
      setCustomers(can('customers.view') ? new CustomerService().getAllCustomers() : []);
      setWarehouses(can('inventory.view') ? new InventoryService().getAllWarehouses() : []);
      setRecipes(canViewRecipes ? manufacturing.getBoms() : []);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'تعذر تحميل بيانات المطعم.';
      toast.error('تعذر تحميل بيانات المطعم', message);
    } finally {
      setLoading(false);
    }
  }, [can, canViewRecipes, manufacturing, service, toast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!customerId && customers.length) {
      setCustomerId(customers.find((customer) => customer.id === 'cust_cash')?.id || customers[0].id);
    }
    if (!warehouseId && warehouses.length) {
      setWarehouseId(warehouses.find((warehouse) => warehouse.isDefault)?.id || warehouses[0].id);
    }
    const branchId = warehouses.find((warehouse) => warehouse.id === warehouseId)?.branchId;
    const currentTableIsAvailable = tables.some((table) =>
      table.id === tableId && table.isActive && !table.occupied
      && (!branchId || table.branchId === branchId)
    );
    if (tableId && !currentTableIsAvailable) setTableId('');
    else if (!tableId) {
      const firstAvailable = tables.find((table) =>
        table.isActive && !table.occupied && (!branchId || table.branchId === branchId)
      );
      if (firstAvailable) setTableId(firstAvailable.id);
    }
  }, [customers, tableId, tables, warehouseId, warehouses, customerId]);

  const refresh = () => {
    try {
      setTables(service.getTables());
      setOrders(service.getOpenOrders());
      setMenuItems(can('products.view') ? service.getMenuItems() : []);
      setRecipes(canViewRecipes ? manufacturing.getBoms() : []);
    } catch (error) {
      toast.error('تعذر تحديث البيانات', error instanceof Error ? error.message : undefined);
    }
  };

  const addTable = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      service.createTable(Number(tableNumber), Number(tableCapacity));
      setTableNumber('');
      setTableCapacity('2');
      toast.success('تمت إضافة الطاولة.');
      refresh();
    } catch (error) {
      toast.error('تعذر إضافة الطاولة', error instanceof Error ? error.message : undefined);
    }
  };

  const addMenuItem = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      service.addMenuItem(menuProductId, warehouseId);
      setMenuProductId('');
      toast.success('تمت إضافة الصنف إلى قائمة هذا الفرع.');
      refresh();
    } catch (error) {
      toast.error('تعذر تعديل قائمة الطعام', error instanceof Error ? error.message : undefined);
    }
  };

  const toggleMenuItem = (item: RestaurantMenuItem) => {
    try {
      service.setMenuItemAvailability(item.id, !item.isAvailable);
      toast.success(item.isAvailable ? 'تم إيقاف الصنف في القائمة.' : 'تم تفعيل الصنف في القائمة.');
      refresh();
    } catch (error) {
      toast.error('تعذر تحديث الصنف', error instanceof Error ? error.message : undefined);
    }
  };

  const createOrder = (event: React.FormEvent) => {
    event.preventDefault();
    const items = orderLines
      .filter((line) => line.productId)
      .map((line) => ({ productId: line.productId, quantity: Number(line.quantity), notes: line.notes }));
    setBusy(true);
    try {
      service.createOrder({
        serviceMode,
        tableId: serviceMode === 'DINE_IN' ? tableId : undefined,
        customerId,
        warehouseId,
        notes: orderNotes,
        items,
      });
      setOrderLines([{ productId: '', quantity: '1', notes: '' }]);
      setOrderNotes('');
      toast.success('تم إرسال الطلب إلى المطبخ.');
      refresh();
    } catch (error) {
      toast.error('تعذر إنشاء الطلب', error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const updateKitchen = (itemId: string, nextStatus: RestaurantKitchenStatus) => {
    setBusy(true);
    try {
      service.updateKitchenStatus(itemId, nextStatus);
      toast.success(`تم تحديث حالة الصنف إلى «${KITCHEN_LABEL[nextStatus]}».`);
      refresh();
    } catch (error) {
      toast.error('تعذر تحديث طلب المطبخ', error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const billOrder = (orderId: string) => {
    setBusy(true);
    try {
      const invoice = service.billOrder(orderId, paymentType);
      toast.success(`تم إصدار الفاتورة ${invoice.invoiceNumber}.`);
      refresh();
    } catch (error) {
      toast.error('تعذر إصدار الفاتورة', error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const cancelOrder = (orderId: string) => {
    setBusy(true);
    try {
      service.cancelOrder(orderId);
      toast.success('تم إلغاء الطلب.');
      refresh();
    } catch (error) {
      toast.error('تعذر إلغاء الطلب', error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const saveRecipe = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const items = recipeLines
        .filter((line) => line.componentProductId)
        .map((line) => ({
          componentProductId: line.componentProductId,
          quantity: Number(line.quantity),
          unit: String(products.find((product) => product.id === line.componentProductId)?.baseUnit || line.unit),
        }));
      manufacturing.createBom({
        productId: recipeProductId,
        name: recipeName,
        items,
      });
      setRecipeProductId('');
      setRecipeName('');
      setRecipeLines([emptyRecipeLine()]);
      toast.success('تم حفظ الوصفة كمسودة.');
      refresh();
    } catch (error) {
      toast.error('تعذر حفظ الوصفة', error instanceof Error ? error.message : undefined);
    }
  };

  const updateRecipe = (recipeId: string, action: 'activate' | 'archive') => {
    try {
      if (action === 'activate') manufacturing.activateBom(recipeId);
      else manufacturing.archiveBom(recipeId);
      toast.success(action === 'activate' ? 'تم تفعيل الوصفة.' : 'تم أرشفة الوصفة.');
      refresh();
    } catch (error) {
      toast.error('تعذر تحديث الوصفة', error instanceof Error ? error.message : undefined);
    }
  };

  const menuProducts = products.filter((product) => product.isActive);
  const selectedWarehouse = warehouses.find((warehouse) => warehouse.id === warehouseId);
  const branchMenuItems = menuItems.filter((item) =>
    !selectedWarehouse?.branchId || item.branchId === selectedWarehouse.branchId
  );
  const activeMenuProductIds = new Set(branchMenuItems.filter((item) => item.isAvailable).map((item) => item.productId));
  const orderMenuProducts = menuProducts.filter((product) => activeMenuProductIds.has(product.id));
  const addableMenuProducts = menuProducts.filter((product) => !activeMenuProductIds.has(product.id));
  const availableTables = tables.filter((table) =>
    table.isActive && !table.occupied
    && (!selectedWarehouse?.branchId || selectedWarehouse.branchId === table.branchId)
  );

  return (
    <div className="space-y-5 p-4 md:p-6" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800">
            <Utensils className="h-5 w-5 text-emerald-600" /> إدارة المطعم
          </h1>
          <p className="mt-1 text-sm text-slate-500">الطاولات والطلبات والمطبخ والوصفات والمخزون.</p>
        </div>
        <button onClick={load} className="inline-flex items-center gap-2 rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
          <RefreshCw className="h-4 w-4" /> تحديث
        </button>
      </header>

      <nav className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        <button onClick={() => setTab('floor')} className={`rounded px-3 py-2 text-sm ${tab === 'floor' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'}`}>الصالة والطلبات</button>
        <button onClick={() => setTab('kitchen')} className={`rounded px-3 py-2 text-sm ${tab === 'kitchen' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'}`}>شاشة المطبخ ({orders.length})</button>
        {canViewRecipes && <button onClick={() => setTab('recipes')} className={`rounded px-3 py-2 text-sm ${tab === 'recipes' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'}`}>الوصفات</button>}
      </nav>

      {loading ? (
        <div className="rounded border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">جارٍ تحميل بيانات المطعم…</div>
      ) : tab === 'floor' ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">الطاولات</h2>
              <span className="text-xs text-slate-500">{tables.filter((table) => table.isActive).length} نشطة</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {tables.map((table) => (
                <article key={table.id} className={`rounded border p-3 ${table.occupied ? 'border-amber-300 bg-amber-50' : table.isActive ? 'border-emerald-200 bg-white' : 'border-slate-200 bg-slate-100 opacity-60'}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-bold">طاولة {table.tableNumber}</span>
                    <Coffee className={`h-4 w-4 ${table.occupied ? 'text-amber-600' : 'text-emerald-600'}`} />
                  </div>
                  <div className="mt-1 text-xs text-slate-500">السعة {table.capacity} · {table.occupied ? 'مشغولة' : table.isActive ? 'متاحة' : 'متوقفة'}</div>
                  {canUpdate && !table.occupied && (
                    <button
                      onClick={() => {
                        try {
                          service.setTableActive(table.id, !table.isActive);
                          refresh();
                        } catch (error) {
                          toast.error('تعذر تحديث الطاولة', error instanceof Error ? error.message : undefined);
                        }
                      }}
                      className="mt-2 text-xs text-sky-700 hover:underline"
                    >{table.isActive ? 'إيقاف' : 'تفعيل'}</button>
                  )}
                </article>
              ))}
              {tables.length === 0 && <p className="col-span-full rounded border border-dashed p-6 text-center text-sm text-slate-500">أضف الطاولات لبدء إدارة الصالة.</p>}
            </div>

            {canCreate && (
              <form onSubmit={addTable} className="flex flex-wrap items-end gap-2 rounded border border-slate-200 bg-white p-3">
                <label className="text-xs text-slate-600">رقم الطاولة<input required type="number" min="1" value={tableNumber} onChange={(event) => setTableNumber(event.target.value)} className="mt-1 block w-28 rounded border px-2 py-1.5 text-sm" /></label>
                <label className="text-xs text-slate-600">السعة<input required type="number" min="1" value={tableCapacity} onChange={(event) => setTableCapacity(event.target.value)} className="mt-1 block w-24 rounded border px-2 py-1.5 text-sm" /></label>
                <button className="rounded bg-slate-800 px-3 py-2 text-sm text-white">إضافة طاولة</button>
              </form>
            )}

            <section className="space-y-3 rounded border border-slate-200 bg-white p-3">
              <div>
                <h2 className="font-semibold text-slate-800">قائمة الطعام لهذا الفرع</h2>
                <p className="mt-1 text-xs text-slate-500">تظهر الأصناف المفعّلة فقط عند تسجيل الطلب.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {branchMenuItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-2 rounded bg-slate-50 px-3 py-2">
                    <span className="min-w-0 truncate text-sm">{item.productName} · {currency.format(item.unitPrice)}</span>
                    <span className={`shrink-0 text-xs ${item.isAvailable ? 'text-emerald-700' : 'text-slate-400'}`}>{item.isAvailable ? 'متاح' : 'متوقف'}</span>
                    {canUpdate && <button type="button" onClick={() => toggleMenuItem(item)} className="shrink-0 text-xs text-sky-700 hover:underline">{item.isAvailable ? 'إيقاف' : 'تفعيل'}</button>}
                  </div>
                ))}
                {branchMenuItems.length === 0 && <p className="text-sm text-slate-500">لا توجد أصناف في القائمة بعد.</p>}
              </div>
              {canCreateOrder && (
                <form onSubmit={addMenuItem} className="flex flex-wrap gap-2">
                  <select required value={menuProductId} onChange={(event) => setMenuProductId(event.target.value)} className="min-w-0 flex-1 rounded border px-2 py-2 text-sm">
                    <option value="">اختر صنفاً لإضافته للقائمة</option>
                    {addableMenuProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                  </select>
                  <button disabled={!warehouseId || !addableMenuProducts.length} className="rounded bg-slate-800 px-3 py-2 text-sm text-white disabled:opacity-50">إضافة للقائمة</button>
                </form>
              )}
            </section>
          </section>

          <section className="rounded border border-slate-200 bg-white p-4">
            <h2 className="mb-4 font-semibold text-slate-800">طلب جديد</h2>
            {!canCreateOrder ? (
              <p className="text-sm text-slate-500">لا تملك صلاحية إنشاء طلب مطعم.</p>
            ) : (
              <form onSubmit={createOrder} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs text-slate-600">نوع الخدمة
                    <select value={serviceMode} onChange={(event) => setServiceMode(event.target.value as RestaurantServiceMode)} className="mt-1 block w-full rounded border px-2 py-2 text-sm">
                      {Object.entries(SERVICE_MODE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  {serviceMode === 'DINE_IN' && <label className="text-xs text-slate-600">الطاولة
                    <select required value={tableId} onChange={(event) => setTableId(event.target.value)} className="mt-1 block w-full rounded border px-2 py-2 text-sm">
                      <option value="">اختر طاولة</option>
                      {availableTables.map((table) => <option key={table.id} value={table.id}>طاولة {table.tableNumber} · {table.capacity} مقاعد</option>)}
                    </select>
                  </label>}
                  <label className="text-xs text-slate-600">العميل
                    <select required value={customerId} onChange={(event) => setCustomerId(event.target.value)} className="mt-1 block w-full rounded border px-2 py-2 text-sm">
                      <option value="">اختر العميل</option>
                      {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-slate-600">مخزن المكونات
                    <select required value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} className="mt-1 block w-full rounded border px-2 py-2 text-sm">
                      <option value="">اختر المخزن</option>
                      {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
                    </select>
                  </label>
                </div>

                <div className="space-y-2">
                  {orderLines.map((line, index) => (
                    <div key={index} className="grid gap-2 rounded bg-slate-50 p-2 sm:grid-cols-[minmax(0,1fr)_90px_minmax(0,0.8fr)_auto]">
                      <select aria-label="الصنف" required value={line.productId} onChange={(event) => setOrderLines((previous) => previous.map((item, i) => i === index ? { ...item, productId: event.target.value } : item))} className="min-w-0 rounded border bg-white px-2 py-2 text-sm">
                        <option value="">اختر صنفاً من القائمة</option>
                        {orderMenuProducts.map((product) => <option key={product.id} value={product.id}>{product.name} · {currency.format(product.sellingPriceM2)}</option>)}
                      </select>
                      <input aria-label="الكمية" required type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => setOrderLines((previous) => previous.map((item, i) => i === index ? { ...item, quantity: event.target.value } : item))} className="rounded border px-2 py-2 text-sm" />
                      <input aria-label="ملاحظة الصنف" value={line.notes} onChange={(event) => setOrderLines((previous) => previous.map((item, i) => i === index ? { ...item, notes: event.target.value } : item))} placeholder="ملاحظة للمطبخ" className="rounded border px-2 py-2 text-sm" />
                      <button type="button" onClick={() => setOrderLines((previous) => previous.length > 1 ? previous.filter((_, i) => i !== index) : previous)} className="rounded px-2 text-xs text-red-600" aria-label="حذف الصنف">حذف</button>
                    </div>
                  ))}
                  <button type="button" onClick={() => setOrderLines((previous) => [...previous, { productId: '', quantity: '1', notes: '' }])} className="inline-flex items-center gap-1 text-sm text-emerald-700">
                    <CirclePlus className="h-4 w-4" /> إضافة صنف
                  </button>
                </div>

                <label className="block text-xs text-slate-600">ملاحظات الطلب
                  <textarea rows={2} value={orderNotes} onChange={(event) => setOrderNotes(event.target.value)} className="mt-1 block w-full rounded border px-2 py-2 text-sm" />
                </label>
                <button disabled={busy || (serviceMode === 'DINE_IN' && !availableTables.length)} className="w-full rounded bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">
                  إرسال الطلب للمطبخ
                </button>
              </form>
            )}
          </section>
        </div>
      ) : tab === 'kitchen' ? (
        <section className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {orders.map((order) => {
            const total = order.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
            const canBill = order.items.length > 0 && order.items.every((item) => item.kitchenStatus === 'SERVED');
            return (
              <article key={order.id} className="rounded border border-slate-200 bg-white">
                <header className="flex items-start justify-between border-b border-slate-100 p-3">
                  <div>
                    <div className="font-semibold text-slate-800">{order.orderNumber} · {order.tableNumber ? `طاولة ${order.tableNumber}` : SERVICE_MODE_LABEL[order.serviceMode]}</div>
                    <div className="mt-1 text-xs text-slate-500">{order.customerName} · {order.warehouseName}</div>
                  </div>
                  <span className="text-sm font-semibold">{currency.format(total)}</span>
                </header>
                <div className="space-y-3 p-3">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex items-start justify-between gap-3 rounded bg-slate-50 p-2.5">
                      <div className="min-w-0">
                        <div className="font-medium">{item.productName} × {item.quantity} {item.baseUnit}</div>
                        <div className="mt-1 text-xs text-slate-500">{KITCHEN_LABEL[item.kitchenStatus]}{item.notes ? ` · ${item.notes}` : ''}</div>
                      </div>
                      {canUpdate && item.kitchenStatus !== 'SERVED' && (
                        <button disabled={busy} onClick={() => updateKitchen(item.id, KITCHEN_ACTION[item.kitchenStatus].next)} className="shrink-0 rounded bg-slate-800 px-2.5 py-1.5 text-xs text-white disabled:opacity-50">
                          {KITCHEN_ACTION[item.kitchenStatus].label}
                        </button>
                      )}
                    </div>
                  ))}
                  {order.notes && <p className="text-xs text-slate-500">ملاحظة: {order.notes}</p>}
                  <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                    {canBill && can('sales.create') && (
                      <label className="text-xs text-slate-600">التحصيل
                        <select value={paymentType} onChange={(event) => setPaymentType(event.target.value as PaymentType)} className="mr-2 rounded border px-2 py-1.5 text-xs">
                          <option value="CASH">نقدي</option>
                          <option value="CARD">بطاقة</option>
                          <option value="BANK_TRANSFER">تحويل بنكي</option>
                        </select>
                      </label>
                    )}
                    {canBill && can('sales.create') && <button disabled={busy} onClick={() => billOrder(order.id)} className="rounded bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-50">إصدار الفاتورة وتحصيلها</button>}
                    {canUpdate && order.items.every((item) => item.kitchenStatus === 'NEW') && <button disabled={busy} onClick={() => cancelOrder(order.id)} className="rounded border border-red-200 px-3 py-2 text-sm text-red-700 disabled:opacity-50">إلغاء الطلب</button>}
                    <span className="mr-auto text-xs text-slate-500">{order.items.filter((item) => item.kitchenStatus === 'SERVED').length}/{order.items.length} أصناف مقدمة</span>
                  </div>
                </div>
              </article>
            );
          })}
          {orders.length === 0 && <div className="col-span-full rounded border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">لا توجد طلبات مفتوحة للمطبخ.</div>}
        </section>
      ) : (
        <section className="grid gap-5 xl:grid-cols-[minmax(340px,0.8fr)_minmax(0,1.2fr)]">
          {canManageRecipes && (
            <form onSubmit={saveRecipe} className="space-y-3 rounded border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 font-semibold text-slate-800"><ChefHat className="h-4 w-4 text-emerald-600" /> وصفة قائمة جديدة</div>
              <label className="block text-xs text-slate-600">الصنف المُحضّر
                <select required value={recipeProductId} onChange={(event) => setRecipeProductId(event.target.value)} className="mt-1 block w-full rounded border px-2 py-2 text-sm">
                  <option value="">اختر صنفاً</option>
                  {orderMenuProducts.filter((product) => !isServiceProduct(product)).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                </select>
              </label>
              <label className="block text-xs text-slate-600">اسم الوصفة<input required value={recipeName} onChange={(event) => setRecipeName(event.target.value)} className="mt-1 block w-full rounded border px-2 py-2 text-sm" /></label>
              <div className="space-y-2">
                {recipeLines.map((line, index) => (
                  <div key={index} className="grid grid-cols-[minmax(0,1fr)_90px_minmax(80px,0.5fr)_auto] gap-2">
                    <select required aria-label="المكوّن" value={line.componentProductId} onChange={(event) => {
                      const component = products.find((product) => product.id === event.target.value);
                      setRecipeLines((previous) => previous.map((item, i) => i === index ? {
                        ...item,
                        componentProductId: event.target.value,
                        unit: String(component?.baseUnit || ''),
                      } : item));
                    }} className="min-w-0 rounded border px-2 py-2 text-xs">
                      <option value="">المكوّن</option>
                      {menuProducts.filter((product) => product.id !== recipeProductId && !isServiceProduct(product)).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                    </select>
                    <input required aria-label="كمية المكوّن" type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => setRecipeLines((previous) => previous.map((item, i) => i === index ? { ...item, quantity: event.target.value } : item))} className="rounded border px-2 py-2 text-xs" />
                    <span className="self-center text-xs text-slate-500">{line.unit || 'الوحدة'}</span>
                    <button type="button" onClick={() => setRecipeLines((previous) => previous.length > 1 ? previous.filter((_, i) => i !== index) : previous)} className="px-1 text-xs text-red-600" aria-label="حذف المكوّن">×</button>
                  </div>
                ))}
                <button type="button" onClick={() => setRecipeLines((previous) => [...previous, emptyRecipeLine()])} className="text-sm text-emerald-700">+ إضافة مكوّن</button>
              </div>
              <p className="text-xs leading-relaxed text-slate-500">تتحول الوصفة إلى أمر إنتاج عند بدء تحضير الصنف؛ ويخصم النظام المكونات من المخزون عند اكتمال التحضير.</p>
              <button className="w-full rounded bg-emerald-600 px-3 py-2 text-sm text-white">حفظ الوصفة كمسودة</button>
            </form>
          )}

          <div className="space-y-3">
            <h2 className="font-semibold text-slate-800">وصفات الأصناف</h2>
            {recipes.map((recipe) => (
              <article key={recipe.id} className="rounded border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">{recipe.productName} · {recipe.name}</div>
                    <div className="mt-1 text-xs text-slate-500">الإصدار {recipe.version} · {recipe.status === 'ACTIVE' ? 'نشطة' : recipe.status === 'DRAFT' ? 'مسودة' : 'مؤرشفة'}</div>
                  </div>
                  <div className="flex gap-2">
                    {canManageRecipes && recipe.status === 'DRAFT' && <button onClick={() => updateRecipe(recipe.id, 'activate')} className="rounded border border-emerald-200 px-2.5 py-1.5 text-xs text-emerald-700">تفعيل</button>}
                    {canManageRecipes && recipe.status === 'ACTIVE' && <button onClick={() => updateRecipe(recipe.id, 'archive')} className="rounded border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600">أرشفة</button>}
                  </div>
                </div>
                <ul className="mt-3 space-y-1 text-sm text-slate-600">
                  {recipe.items.map((item) => <li key={item.id}>{item.componentName} — {item.quantity} {item.unit}</li>)}
                </ul>
              </article>
            ))}
            {recipes.length === 0 && <div className="rounded border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">لا توجد وصفات محفوظة بعد.</div>}
            {!canManageRecipes && <p className="text-xs text-slate-500">تحتاج صلاحية إدارة التصنيع لإنشاء الوصفات وتفعيلها.</p>}
          </div>
        </section>
      )}
    </div>
  );
};
