import React, { useState, useEffect } from 'react';
import { 
  ArrowLeftRight, Warehouse, Plus, RefreshCw, 
  History, AlertTriangle, CheckCircle2, Search, SlidersHorizontal
} from 'lucide-react';
import { InventoryService } from '../services/InventoryService';
import { ProductService } from '../services/ProductService';
import { AuthService } from '../services/AuthService';
import { PermissionService } from '../services/PermissionService';
import { WarehouseStock, InventoryTransaction, Warehouse as IWarehouse, Product } from '../types';
import { CeramicMath } from '../utils/ceramicMath';
import { formatProductQuantity, getProductUnitLabel } from '../utils/productUnits';
import { useBusinessProfileMeta, useBusinessTerm } from '../hooks/useBusinessTerm';

export const InventoryView: React.FC = () => {
  const inventoryLabel = useBusinessTerm('modules.inventory');
  const { label: businessProfileLabel } = useBusinessProfileMeta();
  const [stockList, setStockList] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<IWarehouse[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'STOCK' | 'TRANSFERS' | 'LOGS'>('STOCK');

  // Transfer Modal State
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferData, setTransferData] = useState({
    fromWarehouseId: '',
    toWarehouseId: '',
    productId: '',
    quantityM2: 10,
    notes: ''
  });

  // Adjust Modal State
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [adjustData, setAdjustData] = useState({
    warehouseId: '',
    productId: '',
    currentM2: 0,
    actualM2: 0,
    reason: 'جرد فعلي دوري'
  });
  const adjustingProduct = products.find((product) => product.id === adjustData.productId);
  const transferringProduct = products.find((product) => product.id === transferData.productId);

  const inventoryService = new InventoryService();
  const productService = new ProductService();
  const currentUser = AuthService.getCurrentUser();
  const canTransfer = PermissionService.can(currentUser, 'inventory.transfer');
  const canAdjust = PermissionService.can(currentUser, 'inventory.adjust');
  const canViewFinancials = PermissionService.can(currentUser, 'finance.view');

  const loadData = () => {
    try {
      const whs = inventoryService.getAllWarehouses();
      const stks = inventoryService.getWarehouseStock(selectedWarehouseId || undefined, search);
      const txs = inventoryService.getTransactions(100);
      const prods = productService.getAllProducts();

      setWarehouses(whs);
      setStockList(stks);
      setTransactions(txs);
      setProducts(prods);

      if (whs.length > 0 && !transferData.fromWarehouseId) {
        setTransferData(prev => ({
          ...prev,
          fromWarehouseId: whs[0].id,
          toWarehouseId: whs[1]?.id || whs[0].id,
          productId: prods[0]?.id || ''
        }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedWarehouseId, search]);

  const handleStockTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      inventoryService.transferStock(
        transferData.fromWarehouseId,
        transferData.toWarehouseId,
        transferData.productId,
        transferData.quantityM2,
        transferData.notes
      );
      setIsTransferModalOpen(false);
      loadData();
      alert('تم التحويل المخزني بنجاح وتحديث أرصدة المخازن.');
    } catch (err: any) {
      alert(`خطأ في التحويل: ${err.message || err}`);
    }
  };

  const handleStockAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      inventoryService.adjustStock(
        adjustData.productId,
        adjustData.warehouseId,
        adjustData.actualM2,
        adjustData.reason
      );
      setIsAdjustModalOpen(false);
      loadData();
      alert('تم اعتماد التسوية الجردية بنجاح.');
    } catch (err: any) {
      alert(`خطأ في التسوية: ${err.message || err}`);
    }
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      {/* Header Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">
            إدارة {inventoryLabel}
            <span className="ml-2 text-sm font-bold text-sky-700">· {businessProfileLabel}</span>
          </h2>
          <p className="text-xs text-slate-500">مراقبة الأرصدة بوحدة كل صنف، والتحويلات بين المخازن، وسجل الحركات</p>
        </div>

        <div className="flex gap-2">
          {canTransfer && <button
            onClick={() => setIsTransferModalOpen(true)}
            className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-sky-600/30 transition text-xs"
          >
            <ArrowLeftRight className="w-4 h-4" />
            <span>تحويل بين المخازن</span>
          </button>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('STOCK')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
 activeTab === 'STOCK'
 ? 'bg-sky-600 text-slate-900 shadow-md'
 : 'bg-white text-slate-500'
 }`}
        >
          أرصدة المخازن الحالية
        </button>
        <button
          onClick={() => setActiveTab('LOGS')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
 activeTab === 'LOGS'
 ? 'bg-sky-600 text-slate-900 shadow-md'
 : 'bg-white text-slate-500'
 }`}
        >
          سجل حركات المخزون (Audit Trail)
        </button>
      </div>

      {activeTab === 'STOCK' ? (
        <div className="space-y-4">
          {/* Filters */}
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[240px] relative">
              <label htmlFor="inventory-stock-search" className="sr-only">بحث في المخزون</label>
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                id="inventory-stock-search"
                type="text"
                aria-label="بحث في المخزون"
                placeholder="بحث في المخزون بالصنف أو الكود..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-4 pr-9 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-medium focus:outline-none"
              />
            </div>

            <label htmlFor="inventory-warehouse-filter" className="sr-only">تصفية حسب المخزن</label>
            <select
              id="inventory-warehouse-filter"
              aria-label="تصفية حسب المخزن"
              value={selectedWarehouseId}
              onChange={(e) => setSelectedWarehouseId(e.target.value)}
              className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 "
            >
              <option value="">جميع المخازن</option>
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>

          {/* Stock Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3.5">المخزن</th>
                    <th className="p-3.5">اسم صنف السيراميك</th>
                    <th className="p-3.5">المقاس والفرز</th>
                    <th className="p-3.5">الرصيد بوحدة الصنف</th>
                    <th className="p-3.5">الوارد</th>
                    <th className="p-3.5">الصادر</th>
                    <th className="p-3.5">الرصيد بالكرتونة</th>
                    <th className="p-3.5">الرصيد بالقطع</th>
                    {canViewFinancials && <th className="p-3.5">قيمة الرصيد (تكلفة)</th>}
                    <th className="p-3.5 text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 ">
                  {stockList.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-500">
                        لا يوجد رصيد مسجل بالمخازن المحددة.
                      </td>
                    </tr>
                  ) : (
                    stockList.map((stk) => (
                      <tr key={stk.id} className="hover:bg-slate-100 transition">
                        <td className="p-3.5 font-bold text-sky-600">{stk.warehouseName}</td>
                        <td className="p-3.5">
                          <div className="font-bold text-slate-900">{stk.productName}</div>
                          <div className="text-[10px] text-slate-500">كود: {stk.sku} | باركود: {stk.barcode}</div>
                        </td>
                        <td className="p-3.5 font-semibold text-slate-700">
                          {stk.productType === 'GENERAL' ? getProductUnitLabel(stk) : `${stk.size} (${stk.grade === 'GRADE_1' ? 'فرز أول' : 'فرز تجاري'})`}
                        </td>
                        <td className="p-3.5 font-black text-emerald-600 text-sm">
                          {stk.productType === 'GENERAL' ? formatProductQuantity(stk.quantityM2, stk) : CeramicMath.formatM2(stk.quantityM2)}
                        </td>
                        <td className="p-3.5 font-bold text-sky-700">
                          {formatProductQuantity(stk.quantityIn || 0, stk)}
                        </td>
                        <td className="p-3.5 font-bold text-rose-700">
                          {formatProductQuantity(stk.quantityOut || 0, stk)}
                        </td>
                        <td className="p-3.5 font-bold text-slate-900">
                          {stk.productType === 'GENERAL' ? '—' : `${stk.quantityBoxes} كرتونة`}
                        </td>
                        <td className="p-3.5 text-slate-600 ">
                          {stk.productType === 'GENERAL' ? '—' : `${stk.quantityPieces} قطعة`}
                        </td>
                        {canViewFinancials && <td className="p-3.5 font-mono font-bold text-slate-700">
                          {CeramicMath.formatCurrency(stk.quantityM2 * stk.costPrice)}
                        </td>}
                        <td className="p-3.5 text-center">
                          {canAdjust && <button
                            onClick={() => {
                              setAdjustData({
                                warehouseId: stk.warehouseId,
                                productId: stk.productId,
                                currentM2: stk.quantityM2,
                                actualM2: stk.quantityM2,
                                reason: 'جرد فعلي دوري'
                              });
                              setIsAdjustModalOpen(true);
                            }}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-sky-500 hover:text-slate-900 rounded-lg text-[11px] font-bold transition"
                          >
                            تسوية جردية
                          </button>}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Inventory Transaction Log */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3.5">رقم الحركة</th>
                  <th className="p-3.5">نوع الحركة</th>
                  <th className="p-3.5">الصنف</th>
                  <th className="p-3.5">المخزن</th>
                  <th className="p-3.5">الكمية</th>
                  <th className="p-3.5">البيان والملاحظات</th>
                  <th className="p-3.5">المستخدم</th>
                  <th className="p-3.5">التاريخ والوقت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 ">
                {transactions.map((tx) => {
                  const isPositive = tx.quantityM2 > 0;
                  return (
                    <tr key={tx.id} className="hover:bg-slate-100">
                      <td className="p-3.5 font-mono font-bold text-slate-900">{tx.transactionNumber}</td>
                      <td className="p-3.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
 tx.type === 'SALE' ? 'bg-red-500/10 text-red-600' :
 tx.type === 'PURCHASE' ? 'bg-emerald-500/10 text-emerald-600' :
 tx.type === 'SALES_RETURN' ? 'bg-amber-500/10 text-amber-600' : 'bg-sky-500/10 text-sky-600'
 }`}>
                          {tx.type}
                        </span>
                      </td>
                      <td className="p-3.5 font-bold">{tx.productName}</td>
                      <td className="p-3.5 text-slate-600 ">{tx.warehouseName}</td>
                      <td className={`p-3.5 font-black text-sm ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                        {isPositive ? `+${formatProductQuantity(tx.quantityM2, tx)}` : formatProductQuantity(tx.quantityM2, tx)}
                      </td>
                      <td className="p-3.5 text-slate-500 max-w-xs truncate">{tx.notes || '-'}</td>
                      <td className="p-3.5 text-slate-600">{tx.performedByName || 'المدير'}</td>
                      <td className="p-3.5 font-mono text-[11px] text-slate-500">{tx.createdAt}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Stock Transfer Modal */}
      {isTransferModalOpen && canTransfer && (
        <div className="fixed inset-0 bg-white backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-extrabold text-slate-900">تحويل مخزني بين الفروع والمخازن</h3>

            <form onSubmit={handleStockTransfer} className="space-y-3 text-xs">
              <div>
                <label htmlFor="transfer-from-warehouse" className="font-bold text-slate-700 block mb-1">من مخزن (المصدر)</label>
                <select
                  id="transfer-from-warehouse"
                  value={transferData.fromWarehouseId}
                  onChange={(e) => setTransferData({ ...transferData, fromWarehouseId: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold"
                >
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="transfer-to-warehouse" className="font-bold text-slate-700 block mb-1">إلى مخزن (الوجهة)</label>
                <select
                  id="transfer-to-warehouse"
                  value={transferData.toWarehouseId}
                  onChange={(e) => setTransferData({ ...transferData, toWarehouseId: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold"
                >
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="transfer-product" className="font-bold text-slate-700 block mb-1">الصنف المراد تحويله</label>
                <select
                  id="transfer-product"
                  value={transferData.productId}
                  onChange={(e) => setTransferData({ ...transferData, productId: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold"
                >
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name}{p.productType === 'GENERAL' ? ` (${getProductUnitLabel(p)})` : ` (${p.size})`}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="transfer-quantity" className="font-bold text-slate-700 block mb-1">{`الكمية المراد تحويلها (${transferringProduct ? getProductUnitLabel(transferringProduct) : 'م²'})`}</label>
                <input
                  id="transfer-quantity"
                  type="number"
                  step="0.01"
                  required
                  value={transferData.quantityM2}
                  onChange={(e) => setTransferData({ ...transferData, quantityM2: Number.parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold"
                />
              </div>

              <div>
                <label htmlFor="transfer-notes" className="font-bold text-slate-700 block mb-1">ملاحظات التحويل</label>
                <input
                  id="transfer-notes"
                  type="text"
                  placeholder="مثال: نقل عينات لصالة العرض"
                  value={transferData.notes}
                  onChange={(e) => setTransferData({ ...transferData, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 "
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 ">
                <button
                  type="button"
                  onClick={() => setIsTransferModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl shadow-lg shadow-sky-600/30"
                >
                  تنفيذ التحويل
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Adjust Modal */}
      {isAdjustModalOpen && canAdjust && (
        <div className="fixed inset-0 bg-white backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-extrabold text-slate-900">تسوية جردية للمخزون</h3>

            <form onSubmit={handleStockAdjustment} className="space-y-3 text-xs">
              <div className="bg-slate-50 p-3 rounded-xl">
                <div className="text-slate-500">الرصيد الدفتري الحالي:</div>
                <div className="text-lg font-black text-sky-600">{adjustingProduct ? formatProductQuantity(adjustData.currentM2, adjustingProduct) : `${adjustData.currentM2} م²`}</div>
              </div>

              <div>
                <label htmlFor="adjust-actual-m2" className="font-bold text-slate-700 block mb-1">{`الرصيد الفعلي بعد الجرد (${adjustingProduct ? getProductUnitLabel(adjustingProduct) : 'م²'}) *`}</label>
                <input
                  id="adjust-actual-m2"
                  type="number"
                  step="0.01"
                  required
                  value={adjustData.actualM2}
                  onChange={(e) => setAdjustData({ ...adjustData, actualM2: Number.parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-black text-sm"
                />
              </div>

              <div>
                <label htmlFor="adjust-reason" className="font-bold text-slate-700 block mb-1">سبب التسوية / الفروقات *</label>
                <input
                  id="adjust-reason"
                  type="text"
                  required
                  value={adjustData.reason}
                  onChange={(e) => setAdjustData({ ...adjustData, reason: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 "
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 ">
                <button
                  type="button"
                  onClick={() => setIsAdjustModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/30"
                >
                  اعتماد التسوية
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
