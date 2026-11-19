import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { DataTable } from '../ui/DataTable';
import { ArrowLeftRight, Boxes, Search } from 'lucide-react';
import { InventoryService } from '../../services/domains/inventory/InventoryService';
import { ProductService } from '../../services/domains/products/ProductService';
import { AuthService } from '../../services/domains/auth/AuthService';
import { PermissionService } from '../../services/domains/auth/PermissionService';
import { Product } from '../../types';
import type { Warehouse } from '../../types/products/catalog';
import type { InventoryTransaction } from '../../types/inventory/transactions';
import { CeramicMath } from '../../utils/products/ceramicMath';
import { formatProductQuantity, getProductUnitLabel } from '../../utils/products/productUnits';
import { gradeLabel } from '../products/productFormModel';
import { ProductPicker } from '../products/ProductPicker';
import { PageHeader } from '../ui/PageHeader';
import { Button } from '../ui/Button';
import { FilterToolbar } from '../ui/FilterToolbar';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { useBusinessProfileMeta, useBusinessTerm } from '../../hooks/domains/config/useBusinessTerm';

export const InventoryView: React.FC = () => {
  const inventoryLabel = useBusinessTerm('modules.inventory');
  const { label: businessProfileLabel } = useBusinessProfileMeta();
  const [stockList, setStockList] = useState<any[]>([]);
  const [inactiveStockList, setInactiveStockList] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'STOCK' | 'INACTIVE_STOCK' | 'LOGS'>('STOCK');
  const displayedStockList = activeTab === 'INACTIVE_STOCK' ? inactiveStockList : stockList;

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

  const inventoryService = useMemo(() => new InventoryService(), []);
  const productService = useMemo(() => new ProductService(), []);
  const currentUser = AuthService.getCurrentUser();
  const canTransfer = PermissionService.can(currentUser, 'inventory.transfer');
  const canAdjust = PermissionService.can(currentUser, 'inventory.adjust');
  const canViewFinancials = PermissionService.can(currentUser, 'ui.finance.overview.view');
  const toast = useToast();

  const loadData = useCallback(async () => {
    try {
      const [whs, stks, inactiveStks, txs, prods] = await Promise.all([
        inventoryService.getAllWarehousesAsync(),
        inventoryService.getWarehouseStockAsync(selectedWarehouseId || undefined, search),
        inventoryService.getInactiveWarehouseStockAsync(selectedWarehouseId || undefined, search),
        inventoryService.getTransactionsAsync(100),
        productService.getAllProductsAsync(),
      ]);

      setWarehouses(whs);
      setStockList(stks);
      setInactiveStockList(inactiveStks);
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
  }, [selectedWarehouseId, search, inventoryService, productService, transferData.fromWarehouseId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleStockTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      inventoryService.createTransferRequest({
        fromWarehouseId: transferData.fromWarehouseId,
        toWarehouseId: transferData.toWarehouseId,
        items: [{
          productId: transferData.productId,
          quantityM2: transferData.quantityM2,
          notes: transferData.notes,
        }],
        notes: transferData.notes,
      });
      setIsTransferModalOpen(false);
      loadData();
      toast.success('تم إنشاء طلب التحويل', 'بانتظار الاعتماد والتجهيز والشحن والاستلام.');
    } catch (err: any) {
      toast.error('تعذر إنشاء التحويل', err?.message || String(err));
    }
  };

  const handleStockAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const difference = Number((adjustData.actualM2 - adjustData.currentM2).toFixed(3));
      if (difference === 0) {
        setIsAdjustModalOpen(false);
        return;
      }
      inventoryService.createAdjustment({
        productId: adjustData.productId,
        warehouseId: adjustData.warehouseId,
        type: difference > 0 ? 'ADD' : 'SUBTRACT',
        quantity: Math.abs(difference),
        reason: adjustData.reason,
      });
      setIsAdjustModalOpen(false);
      loadData();
      toast.success('تم إنشاء طلب التسوية', 'بانتظار اعتماد مستخدم آخر ثم ترحيلها.');
    } catch (err: any) {
      toast.error('تعذر إنشاء التسوية', err?.message || String(err));
    }
  };

  return (
    <div className="erp-page">
      <PageHeader
        title={`إدارة ${inventoryLabel}`}
        description={`مراقبة الأرصدة بوحدة كل صنف، والتحويلات بين المخازن، وسجل الحركات · ${businessProfileLabel}`}
        icon={<Boxes className="h-5 w-5" />}
        actions={
          canTransfer ? (
            <Button
              variant="primary"
              leadingIcon={<ArrowLeftRight className="h-4 w-4" />}
              onClick={() => setIsTransferModalOpen(true)}
            >
              تحويل بين المخازن
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="أقسام المخزون">
        {([
          ['STOCK', 'أرصدة المخازن الحالية'],
          ['INACTIVE_STOCK', `المخزون المتوقف (${inactiveStockList.length})`],
          ['LOGS', 'سجل حركات المخزون'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={activeTab === key}
            onClick={() => setActiveTab(key)}
            className={`px-3 py-1.5 rounded-[var(--ui-radius-sm)] text-xs font-bold transition ${
              activeTab === key
                ? 'bg-[var(--win-accent-soft)] text-[var(--win-accent-readable)]'
                : 'text-[var(--win-text-secondary)] hover:bg-[var(--win-surface-sunken)] hover:text-[var(--win-text)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab !== 'LOGS' ? (
        <div className="space-y-4">
          {activeTab === 'INACTIVE_STOCK' && (
            <p className="text-xs text-[var(--cerami-warning)]">
              أصناف معطلة ما زالت لها كميات فعلية بالمخزون؛ لا تُحتسب ضمن القائمة الرئيسية للأصناف النشطة.
            </p>
          )}
          <FilterToolbar ariaLabel="بحث وتصفية المخزون" className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <label htmlFor="inventory-stock-search" className="sr-only">بحث في المخزون</label>
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--cerami-muted)]" />
              <input
                id="inventory-stock-search"
                type="text"
                aria-label="بحث في المخزون"
                placeholder="بحث في المخزون بالصنف أو الكود..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="ui-input w-full pe-9"
              />
            </div>

            <label htmlFor="inventory-warehouse-filter" className="sr-only">تصفية حسب المخزن</label>
            <select
              id="inventory-warehouse-filter"
              aria-label="تصفية حسب المخزن"
              value={selectedWarehouseId}
              onChange={(e) => setSelectedWarehouseId(e.target.value)}
              className="ui-input px-3 py-2 font-bold"
            >
              <option value="">جميع المخازن</option>
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </FilterToolbar>

          <div className="ui-table-scroll">
            <DataTable
            ariaLabel="أرصدة المخزون"
            rows={displayedStockList}
            rowKey={(stk: any) => String(stk.id)}
            columns={[
              { key: 'warehouse', header: 'المخزن', render: (stk: any) => <span className="font-bold text-[var(--cerami-primary-readable)]">{stk.warehouseName}</span> },
              {
                key: 'product', header: 'اسم صنف السيراميك',
                render: (stk: any) => (
                  <span>
                    <span className="block font-bold">{stk.productName}</span>
                    <span className="block text-[10px] text-[var(--cerami-muted)]">كود: {stk.sku} | باركود: {stk.barcode}</span>
                  </span>
                ),
              },
              { key: 'size', header: 'المقاس والفرز', render: (stk: any) => <span className="font-semibold">{stk.productType === 'GENERAL' ? getProductUnitLabel(stk) : `${stk.size} (${gradeLabel(stk.grade)})`}</span> },
              { key: 'balance', header: 'الرصيد بوحدة الصنف', render: (stk: any) => <span className="font-black text-sm text-[var(--cerami-success)]">{stk.productType === 'GENERAL' ? formatProductQuantity(stk.quantityM2, stk) : CeramicMath.formatM2(stk.quantityM2)}</span> },
              { key: 'in', header: 'الوارد', render: (stk: any) => <span className="font-bold text-[var(--cerami-primary-readable)]">{formatProductQuantity(stk.quantityIn || 0, stk)}</span> },
              { key: 'out', header: 'الصادر', render: (stk: any) => <span className="font-bold text-[var(--cerami-danger)]">{formatProductQuantity(stk.quantityOut || 0, stk)}</span> },
              { key: 'boxes', header: 'الرصيد بالكرتونة', render: (stk: any) => <span className="font-bold">{stk.productType === 'GENERAL' ? '—' : `${stk.quantityBoxes} كرتونة`}</span> },
              { key: 'pieces', header: 'الرصيد بالقطع', render: (stk: any) => stk.productType === 'GENERAL' ? '—' : `${stk.quantityPieces} قطعة` },
              ...(canViewFinancials ? [{
                key: 'value', header: 'قيمة الرصيد (تكلفة)',
                render: (stk: any) => <span className="font-mono font-bold">{CeramicMath.formatCurrency(stk.quantityM2 * stk.costPrice)}</span>,
              }] : []),
              {
                key: 'actions', header: 'إجراءات', align: 'center' as const,
                render: (stk: any) => canAdjust ? (
                  <Button
                    variant="secondary"
                    size="sm"
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
                  >
                    تسوية جردية
                  </Button>
                ) : null,
              },
            ]}
            emptyTitle="لا يوجد رصيد مسجل بالمخازن المحددة."
          />
          </div>
        </div>
      ) : (
        <div className="ui-table-scroll">
          <DataTable
            ariaLabel="حركات المخزون"
            rows={transactions}
            rowKey={(tx: any) => String(tx.id)}
            columns={[
              { key: 'num', header: 'رقم الحركة', render: (tx: any) => <span className="font-mono font-bold">{tx.transactionNumber}</span> },
              {
                key: 'type', header: 'نوع الحركة',
                render: (tx: any) => {
                  const typeBadge = tx.type === 'SALE'
                    ? 'erp-badge--danger'
                    : tx.type === 'PURCHASE'
                      ? 'erp-badge--success'
                      : tx.type === 'SALES_RETURN'
                        ? 'erp-badge--warning'
                        : 'erp-badge--primary';
                  return <span className={`erp-badge ${typeBadge}`}>{tx.type}</span>;
                },
              },
              { key: 'product', header: 'الصنف', render: (tx: any) => <span className="font-bold">{tx.productName}</span> },
              { key: 'warehouse', header: 'المخزن', render: (tx: any) => tx.warehouseName },
              {
                key: 'qty', header: 'الكمية',
                render: (tx: any) => {
                  const isPositive = tx.quantityM2 > 0;
                  return <span className={`font-black text-sm ${isPositive ? 'text-[var(--cerami-success)]' : 'text-[var(--cerami-danger)]'}`}>{isPositive ? `+${formatProductQuantity(tx.quantityM2, tx)}` : formatProductQuantity(tx.quantityM2, tx)}</span>;
                },
              },
              { key: 'notes', header: 'البيان والملاحظات', render: (tx: any) => <span className="block max-w-xs truncate">{tx.notes || '-'}</span> },
              { key: 'user', header: 'المستخدم', render: (tx: any) => tx.performedByName || 'المدير' },
              { key: 'date', header: 'التاريخ والوقت', render: (tx: any) => <span className="font-mono text-[11px] text-[var(--cerami-muted)]">{tx.createdAt}</span> },
            ]}
          />
        </div>
      )}

      <Modal
        open={isTransferModalOpen && canTransfer}
        onClose={() => setIsTransferModalOpen(false)}
        title="طلب تحويل مخزني بين الفروع والمخازن"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsTransferModalOpen(false)}>إلغاء</Button>
            <Button variant="primary" type="submit" form="transfer-form">إرسال الطلب للاعتماد</Button>
          </>
        }
      >
        <form id="transfer-form" onSubmit={handleStockTransfer} className="space-y-3 text-xs">
          <div>
            <label htmlFor="transfer-from-warehouse" className="font-bold block mb-1">من مخزن (المصدر)</label>
            <select
              id="transfer-from-warehouse"
              value={transferData.fromWarehouseId}
              onChange={(e) => setTransferData({ ...transferData, fromWarehouseId: e.target.value })}
              className="ui-input w-full font-bold"
            >
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="transfer-to-warehouse" className="font-bold block mb-1">إلى مخزن (الوجهة)</label>
            <select
              id="transfer-to-warehouse"
              value={transferData.toWarehouseId}
              onChange={(e) => setTransferData({ ...transferData, toWarehouseId: e.target.value })}
              className="ui-input w-full font-bold"
            >
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="transfer-product" className="font-bold block mb-1">الصنف المراد تحويله</label>
            <ProductPicker
              id="transfer-product"
              value={transferData.productId}
              selectedLabel={transferringProduct?.name}
              ariaLabel="استعراض أصناف التحويل المخزني"
              onChange={(productId) => setTransferData({ ...transferData, productId })}
            />
          </div>

          <div>
            <label htmlFor="transfer-quantity" className="font-bold block mb-1">{`الكمية المراد تحويلها (${transferringProduct ? getProductUnitLabel(transferringProduct) : 'م²'})`}</label>
            <input
              id="transfer-quantity"
              type="number"
              step="0.01"
              required
              value={transferData.quantityM2}
              onChange={(e) => setTransferData({ ...transferData, quantityM2: Number.parseFloat(e.target.value) || 0 })}
              className="ui-input w-full font-bold"
            />
          </div>

          <div>
            <label htmlFor="transfer-notes" className="font-bold block mb-1">ملاحظات التحويل</label>
            <input
              id="transfer-notes"
              type="text"
              placeholder="مثال: نقل عينات لصالة العرض"
              value={transferData.notes}
              onChange={(e) => setTransferData({ ...transferData, notes: e.target.value })}
              className="ui-input w-full"
            />
          </div>
        </form>
      </Modal>

      <Modal
        open={isAdjustModalOpen && canAdjust}
        onClose={() => setIsAdjustModalOpen(false)}
        title="طلب تسوية جردية للمخزون"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsAdjustModalOpen(false)}>إلغاء</Button>
            <Button variant="primary" type="submit" form="adjust-form">إرسال الطلب للاعتماد</Button>
          </>
        }
      >
        <form id="adjust-form" onSubmit={handleStockAdjustment} className="space-y-3 text-xs">
          <div className="rounded-[var(--ui-radius-sm)] bg-[var(--cerami-surface-muted)] p-3">
            <div className="text-[var(--cerami-muted)]">الرصيد الدفتري الحالي:</div>
            <div className="text-lg font-black text-[var(--cerami-primary-readable)]">{adjustingProduct ? formatProductQuantity(adjustData.currentM2, adjustingProduct) : `${adjustData.currentM2} م²`}</div>
          </div>

          <div>
            <label htmlFor="adjust-actual-m2" className="font-bold block mb-1">{`الرصيد الفعلي بعد الجرد (${adjustingProduct ? getProductUnitLabel(adjustingProduct) : 'م²'}) *`}</label>
            <input
              id="adjust-actual-m2"
              type="number"
              step="0.01"
              required
              value={adjustData.actualM2}
              onChange={(e) => setAdjustData({ ...adjustData, actualM2: Number.parseFloat(e.target.value) || 0 })}
              className="ui-input w-full font-black text-sm"
            />
          </div>

          <div>
            <label htmlFor="adjust-reason" className="font-bold block mb-1">سبب التسوية / الفروقات *</label>
            <input
              id="adjust-reason"
              type="text"
              required
              value={adjustData.reason}
              onChange={(e) => setAdjustData({ ...adjustData, reason: e.target.value })}
              className="ui-input w-full"
            />
          </div>
        </form>
      </Modal>
    </div>
  );
};
