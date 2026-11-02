import React, { useState, useEffect, useRef, useMemo, useContext, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProductService } from '../services/ProductService';
import { InventoryService } from '../services/InventoryService';
import { CustomerService } from '../services/CustomerService';
import { CategoryService, CategoryWithCount } from '../services/CategoryService';
import { SalesService } from '../services/SalesService';
import { AuthService } from '../services/AuthService';
import { BatchService } from '../services/BatchService';
import { CashierService } from '../services/CashierService';
import { HeldOrderService } from '../services/HeldOrderService';
import { LoyaltyService } from '../services/LoyaltyService';
import { PrintService } from '../services/PrintService';
import { PricingService, type AppliedPromotion } from '../services/PricingService';
import { PermissionService } from '../services/PermissionService';
import { Product, Customer, Warehouse, CashRegister, CashShift, PaymentType, SystemSettings, ToneMixingConflict } from '../types';
import { CeramicCalculatorModal } from './CeramicCalculatorModal';
import { DocumentPreviewModal } from './DocumentPreviewModal';
import { LayoutContext } from '../layouts/MainLayout';
import {
  type InvoicePreview, type Toast,
} from './pos/types';
import {
  CloseShiftModal, HeldOrdersModal, ManagerOverrideModal, NewCustomerModal, OpenShiftModal, PinLoginModal,
  PosToast, ShortcutsModal, SuccessInvoiceModal, ToneWarningModal,
} from './pos/PosModals';
import { usePosCart } from './pos/usePosCart';
import { usePosBarcodeSearch } from './pos/usePosBarcodeSearch';
import { usePosCatalog } from './pos/usePosCatalog';
import { usePosCheckout } from './pos/usePosCheckout';
import { usePosCustomerDisplay } from './pos/usePosCustomerDisplay';
import { usePosCustomerCreation } from './pos/usePosCustomerCreation';
import { usePosHeldOrders } from './pos/usePosHeldOrders';
import { usePosShiftActions } from './pos/usePosShiftActions';
import { usePosInvoicePreview } from './pos/usePosInvoicePreview';
import { usePosKeyboardShortcuts } from './pos/usePosKeyboardShortcuts';
import { usePosTotals } from './pos/usePosTotals';
import { PosToolbar } from './pos/PosToolbar';
import { PosCatalogFilters } from './pos/PosCatalogFilters';
import { PosProductGrid } from './pos/PosProductGrid';
import { PosCartPanel } from './pos/PosCartPanel';
import { PosCheckoutPanel } from './pos/PosCheckoutPanel';

export const PosView: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useContext(LayoutContext);
  const [actingUser, setActingUser] = useState<any>(null);
  const effectiveUser = actingUser || currentUser;

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<CategoryWithCount[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [registers, setRegisters] = useState<CashRegister[]>([]);
  const [activeShift, setActiveShift] = useState<CashShift | null>(null);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [stockMap, setStockMap] = useState<Record<string, number>>({});

  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [shippingCost, setShippingCost] = useState<number>(0);
  const [taxPercentage, setTaxPercentage] = useState<number>(0);
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [paymentType, setPaymentType] = useState<PaymentType>('CASH');
  const [splitCash, setSplitCash] = useState<number>(0);
  const [splitCard, setSplitCard] = useState<number>(0);
  const [splitBank, setSplitBank] = useState<number>(0);
  const [splitCheque, setSplitCheque] = useState<number>(0);
  const [couponCode, setCouponCode] = useState<string>('');
  const [appliedPromotion, setAppliedPromotion] = useState<AppliedPromotion | null>(null);
  const [promotionDiscount, setPromotionDiscount] = useState<number>(0);
  const [redeemPoints, setRedeemPoints] = useState<number>(0);
  const [loyaltyDiscount, setLoyaltyDiscount] = useState<number>(0);
  const [notes, setNotes] = useState('');

  const [successInvoice, setSuccessInvoice] = useState<any | null>(null);
  const [invoicePreview, setInvoicePreview] = useState<InvoicePreview | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isHeldModalOpen, setIsHeldModalOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [isCloseShiftModalOpen, setIsCloseShiftModalOpen] = useState(false);
  const [closingCash, setClosingCash] = useState(0);
  const [closingNotes, setClosingNotes] = useState('');
  // Tone/Shade mixing warning before checkout
  const [toneConflicts, setToneConflicts] = useState<ToneMixingConflict[]>([]);
  const [isToneWarningOpen, setIsToneWarningOpen] = useState(false);

  // New-customer form
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustType, setNewCustType] = useState<Customer['customerType']>('RETAIL');
  const [newCustCredit, setNewCustCredit] = useState(0);
  const [customerError, setCustomerError] = useState('');

  // Open-shift form
  const [shiftRegisterId, setShiftRegisterId] = useState('cr_main');
  const [openingBalance, setOpeningBalance] = useState(0);

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const paidInputRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number | null>(null);

  const productService = useMemo(() => new ProductService(), []);
  const inventoryService = useMemo(() => new InventoryService(), []);
  const customerService = useMemo(() => new CustomerService(), []);
  const categoryService = useMemo(() => new CategoryService(), []);
  const salesService  = useMemo(() => new SalesService(), []);
  const batchService  = useMemo(() => new BatchService(), []);
  const cashierService = useMemo(() => new CashierService(), []);
  const heldOrderService = useMemo(() => new HeldOrderService(), []);
  const loyaltyService = useMemo(() => new LoyaltyService(), []);
  const printService = useMemo(() => new PrintService(), []);
  const pricingService = useMemo(() => new PricingService(), []);

  useEffect(() => {
    if (!registers.length) {
      if (shiftRegisterId) setShiftRegisterId('');
      return;
    }
    if (registers.some((register) => register.id === shiftRegisterId)) return;
    const selected = registers.find((register) => register.isDefault) || registers[0];
    setShiftRegisterId(selected.id);
    setOpeningBalance(cashierService.getSuggestedOpeningBalance(selected.id));
  }, [cashierService, registers, shiftRegisterId]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const notify = useCallback((message: string, type: Toast['type'] = 'info') => {
    setToast({ message, type });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4200);
  }, []);

  const can = useCallback(
    (permission: string) => PermissionService.can(effectiveUser, permission),
    [effectiveUser]
  );

  const stockOf = useCallback(
    (productId: string) => stockMap[productId] ?? 0,
    [stockMap]
  );

  const {
    searchQuery, setSearchQuery,
    selectedCategory, setSelectedCategory,
    selectedBrand, setSelectedBrand,
    selectedGrade, setSelectedGrade,
    selectedSize, setSelectedSize,
    selectedColor, setSelectedColor,
    customerSearch, setCustomerSearch,
    inStockOnly, setInStockOnly,
    sortMode, setSortMode,
    filteredProducts, visibleCategories, visibleBrands, hasCeramicCatalog,
    visibleSizes, visibleColors, filteredCustomers, hasActiveFilters, clearFilters,
  } = usePosCatalog({ products, categories, customers, stockOf });

  const {
    cart,
    setCart,
    applyCustomerPricing,
    addToCart,
    addCalculatedToCart,
    updateCartQuantity,
    stepCartQuantity,
    updateCartUnit,
    updateCartPrice,
    updateCartLineDiscount,
    removeFromCart,
  } = usePosCart({
    can,
    notify,
    pricingService,
    selectedCustomer,
    stockOf,
    allowDuplicateItems: settings?.posAllowDuplicateItems ?? false,
  });
  const handleSearchSubmit = usePosBarcodeSearch({
    products,
    filteredProducts,
    searchQuery,
    setSearchQuery,
    barcodeInputRef,
    addToCart,
    notify,
  });
  const { handleCreateCustomer } = usePosCustomerCreation({
    can,
    notify,
    customerService,
    customers,
    setCustomers,
    applyCustomerPricing,
    setSelectedCustomer,
    name: newCustName,
    setName: setNewCustName,
    phone: newCustPhone,
    setPhone: setNewCustPhone,
    customerType: newCustType,
    setCustomerType: setNewCustType,
    creditLimit: newCustCredit,
    setCreditLimit: setNewCustCredit,
    setError: setCustomerError,
    setIsOpen: setIsCustomerModalOpen,
  });
  const loadStock = useCallback((warehouseId: string) => {
    if (!warehouseId) return;
    try {
      const rows = inventoryService.getWarehouseStock(warehouseId);
      const map: Record<string, number> = {};
      for (const r of rows) {
        map[(r as any).productId] = r.availableM2 ?? r.quantityM2 ?? 0;
      }
      setStockMap(map);
    } catch (e) {
      console.error(e);
    }
  }, [inventoryService]);

  const loadInitialData = useCallback(() => {
    try {
      const allProds = productService.getAllProducts();
      const allCusts = customerService.getAllCustomers();
      const allWhs = inventoryService.getAllWarehouses();
      const allCats = categoryService.getAllCategories();
      const allRegs = cashierService.getAllRegisters();
      const sysSettings = printService.getSettings();
      const defaultWarehouse = allWhs[0];
      const shift = cashierService.getActiveShift();

      setProducts(allProds);
      setCustomers(allCusts);
      setWarehouses(allWhs);
      setCategories(allCats);
      setRegisters(allRegs);
      setActiveShift(shift);
      setSettings(sysSettings);
      setTaxPercentage(sysSettings.defaultTaxPercentage || 0);
      if (sysSettings.posShowCashButton === false) {
        setPaymentType('CREDIT');
      }

      const defaultWarehouseId = defaultWarehouse?.id || '';
      setSelectedWarehouseId(defaultWarehouseId);
      if (defaultWarehouseId) loadStock(defaultWarehouseId);

      const walkIn = allCusts.find((c) => c.id === 'cust_cash') || allCusts[0] || null;
      setSelectedCustomer(walkIn);

      const defaultReg = allRegs.find((r) => r.isDefault) || allRegs[0];
      if (defaultReg) setShiftRegisterId(defaultReg.id);
    } catch (e) {
      console.error(e);
      notify('تعذر تحميل بيانات نقطة البيع', 'error');
    }
  }, [productService, customerService, inventoryService, categoryService, cashierService, printService, loadStock, notify]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  const { heldOrders, holdCurrentOrder, resumeHeldOrder, deleteHeldOrder } = usePosHeldOrders({
    heldOrderService,
    currentUserId: currentUser?.id,
    cart,
    setCart,
    selectedCustomer,
    setSelectedCustomer,
    customers,
    selectedWarehouseId,
    setSelectedWarehouseId,
    discountAmount,
    setDiscountAmount,
    taxPercentage,
    setTaxPercentage,
    defaultTaxPercentage: settings?.defaultTaxPercentage,
    shippingCost,
    setShippingCost,
    notes,
    setNotes,
    paidAmount,
    setPaidAmount,
    paymentType,
    setPaymentType,
    setIsHeldModalOpen,
    notify,
  });

  useEffect(() => {
    if (selectedWarehouseId) loadStock(selectedWarehouseId);
  }, [selectedWarehouseId, loadStock]);

  // ── Cart operations ────────────────────────────────────────────────────────
  const clearCart = () => {
    if (cart.length === 0) return;
    if (!window.confirm('هل تريد إفراغ سلة البيع بالكامل؟')) return;
    setCart([]);
    setDiscountAmount(0);
    setShippingCost(0);
    setNotes('');
    setPaidAmount(0);
  };

  const {
    lineSubtotal, lineDiscountTotal, taxAmount, totalAmount,
    remainingAmount, changeDue, expectedClosingCash, cartQuantitySummary,
  } = usePosTotals({
    cart, discountAmount, promotionDiscount, loyaltyDiscount, taxPercentage,
    shippingCost, paidAmount, activeShift,
  });
  const { isProcessing, setIsProcessing, handleCheckout } = usePosCheckout({
    can,
    notify,
    cart,
    setCart,
    selectedCustomer,
    selectedWarehouseId,
    activeShift,
    settings,
    stockOf,
    discountAmount,
    setDiscountAmount,
    promotionDiscount,
    setPromotionDiscount,
    loyaltyDiscount,
    setLoyaltyDiscount,
    appliedPromotion,
    setAppliedPromotion,
    couponCode,
    setCouponCode,
    setRedeemPoints,
    taxPercentage,
    taxAmount,
    shippingCost,
    setShippingCost,
    paidAmount,
    setPaidAmount,
    paymentType,
    splitCash,
    splitCard,
    splitBank,
    splitCheque,
    notes,
    setNotes,
    remainingAmount,
    lineSubtotal,
    lineDiscountTotal,
    setSuccessInvoice,
    setProducts,
    setActiveShift,
    setToneConflicts,
    setIsToneWarningOpen,
    salesService,
    productService,
    cashierService,
    batchService,
    loyaltyService,
    pricingService,
    performedBy: effectiveUser?.id || currentUser?.id || 'usr_admin',
    loadStock,
  });
  const { openCustomerDisplay } = usePosCustomerDisplay({
    cart,
    lineSubtotal,
    discountAmount,
    promotionDiscount,
    loyaltyDiscount,
    taxAmount,
    totalAmount,
    paidAmount,
    changeDue,
    notify,
  });
  const { handleOpenShift, handleCloseShift, printZReport } = usePosShiftActions({
    can,
    notify,
    cashierService,
    registerId: shiftRegisterId,
    openingBalance,
    setOpeningBalance,
    currentUserId: currentUser?.id,
    effectiveUserId: effectiveUser?.id,
    activeShift,
    expectedClosingCash,
    setActiveShift,
    closingCash,
    setClosingCash,
    closingNotes,
    setClosingNotes,
    setIsOpenShiftModalOpen: setIsShiftModalOpen,
    setIsCloseShiftModalOpen,
  });
  const { openInvoicePreview } = usePosInvoicePreview({ printService, setInvoicePreview });

  // Cash sales auto-fill the paid amount with the grand total.
  useEffect(() => {
    if (paymentType === 'CASH') {
      setPaidAmount(totalAmount);
    }
    if (paymentType === 'CREDIT') {
      setPaidAmount(0);
    }
  }, [totalAmount, paymentType]);

  useEffect(() => {
    if (isCloseShiftModalOpen && activeShift) {
      setClosingCash(expectedClosingCash);
    }
  }, [isCloseShiftModalOpen, activeShift, expectedClosingCash]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  const [pendingVoid, setPendingVoid] = useState<{ invoice: any; reason: string } | null>(null);
  const [isOverrideOpen, setIsOverrideOpen] = useState(false);
  const [isPinLoginOpen, setIsPinLoginOpen] = useState(false);
  const [touchMode, setTouchMode] = useState(false);

  // Auto-evaluate promotions on cart/coupon change
  useEffect(() => {
    if (cart.length === 0) { setAppliedPromotion(null); setPromotionDiscount(0); return; }
    const cartItems = cart.map((item) => ({
      productId: item.product.id,
      categoryId: (item.product as any).categoryId,
      brandId: (item.product as any).brandId,
      qty: item.quantityM2,
      unitPrice: item.unitPrice,
      amount: item.quantityM2 * item.unitPrice,
    }));
    const applied = pricingService.evaluatePromotions(cartItems, couponCode || undefined);
    if (applied) {
      setAppliedPromotion(applied);
      setPromotionDiscount(applied.discountAmount);
    } else {
      setAppliedPromotion(null);
      setPromotionDiscount(0);
    }
  }, [cart, couponCode, pricingService]);

  const doVoidInvoice = useCallback(async (invoice: any, reason: string) => {
    try {
      setIsProcessing(true);
      salesService.voidInvoice(invoice.id, reason);
      setSuccessInvoice(null);
      if (selectedWarehouseId) loadStock(selectedWarehouseId);
      setActiveShift(cashierService.getActiveShift());
      notify(`تم إلغاء الفاتورة ${invoice.invoiceNumber}`, 'success');
    } catch (e: any) {
      notify(e?.message || 'فشل إلغاء الفاتورة', 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [salesService, selectedWarehouseId, loadStock, cashierService, notify, setIsProcessing]);

  const handleVoidInvoice = useCallback(async (invoice: any) => {
    if (!invoice?.id) return;
    const reason = window.prompt('سبب إلغاء الفاتورة:');
    if (!reason || !reason.trim()) {
      notify('يرجى إدخال سبب الإلغاء', 'warning');
      return;
    }
    if (!can('sales.void')) {
      setPendingVoid({ invoice, reason: reason.trim() });
      setIsOverrideOpen(true);
      return;
    }
    await doVoidInvoice(invoice, reason.trim());
  }, [can, doVoidInvoice, notify]);

  const handlePinLogin = useCallback(async (pin: string): Promise<boolean> => {
    try {
      const u = AuthService.loginByPin(pin);
      setActingUser(u);
      notify(`تم التبديل إلى ${u.fullName}`, 'success');
      return true;
    } catch (e: any) {
      notify(e?.message || 'رمز PIN غير صحيح', 'error');
      return false;
    }
  }, [notify]);

  const handleManagerOverride = useCallback(async (username: string, password: string): Promise<boolean> => {
    try {
      const u = AuthService.login(username, password);
      if (!PermissionService.can(u, 'sales.void')) {
        notify('المستخدم المحدد لا يملك صلاحية إلغاء الفاتورة', 'error');
        return false;
      }
      if (pendingVoid) {
        await doVoidInvoice(pendingVoid.invoice, pendingVoid.reason);
        setPendingVoid(null);
      }
      setIsOverrideOpen(false);
      return true;
    } catch (e: any) {
      notify(e?.message || 'فشل التحقق', 'error');
      return false;
    }
  }, [pendingVoid, doVoidInvoice, notify]);

  usePosKeyboardShortcuts({
    handleCheckout,
    hasCeramicCatalog,
    isCalculatorOpen,
    setIsCalculatorOpen,
    isCustomerModalOpen,
    setIsCustomerModalOpen,
    isHeldModalOpen,
    setIsHeldModalOpen,
    isShortcutsOpen,
    setIsShortcutsOpen,
    isShiftModalOpen,
    setIsShiftModalOpen,
    isCloseShiftModalOpen,
    isToneWarningOpen,
    invoicePreview,
    successInvoice,
    barcodeInputRef,
    paidInputRef,
  });

  const gradeLabel = (grade: Product['grade']) =>
    grade === 'GRADE_1' ? 'فرز أول' : grade === 'GRADE_2' ? 'فرز ثاني' : grade === 'GRADE_3' ? 'فرز ثالث' : 'تجاري';

  return (
    <div className={`flex h-full min-h-0 overflow-hidden bg-slate-50 text-slate-900 max-[900px]:flex-col ${touchMode ? 'pos-touch-mode' : ''}`} dir="rtl">
      {/* ═══ Left: Catalog ═══ */}
      <div className="flex-1 flex flex-col overflow-hidden border-l border-slate-200 min-w-0">
        <PosToolbar
          activeShift={activeShift}
          actingUserName={actingUser?.fullName}
          canCloseShift={can('cashier.shift.close')}
          canOpenShift={can('cashier.shift.open')}
          touchMode={touchMode}
          heldCount={heldOrders.length}
          onCloseShift={() => setIsCloseShiftModalOpen(true)}
          onSwitchUser={() => setIsPinLoginOpen(true)}
          onResetActingUser={() => { setActingUser(null); notify('تم العودة للمستخدم الأصلي', 'info'); }}
          onOpenCustomerDisplay={openCustomerDisplay}
          onToggleTouchMode={() => setTouchMode((v) => !v)}
          onOpenShift={() => {
            setOpeningBalance(cashierService.getSuggestedOpeningBalance(shiftRegisterId));
            setIsShiftModalOpen(true);
          }}
          onOpenCashboxes={() => navigate('/cashboxes')}
          onOpenHeldOrders={() => setIsHeldModalOpen(true)}
          onOpenShortcuts={() => setIsShortcutsOpen(true)}
        />

        <PosCatalogFilters
          barcodeInputRef={barcodeInputRef}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          onSearchSubmit={handleSearchSubmit}
          warehouses={warehouses}
          selectedWarehouseId={selectedWarehouseId}
          onWarehouseChange={(warehouseId) => {
            const warehouse = warehouses.find((item) => item.id === warehouseId);
            setSelectedWarehouseId(warehouseId);
            loadStock(warehouseId);
            setActiveShift(cashierService.getActiveShift(currentUser?.id, warehouse?.branchId));
            const branchRegister = registers.find((register) => register.branchId === warehouse?.branchId && register.isDefault)
              || registers.find((register) => register.branchId === warehouse?.branchId);
            if (branchRegister) setShiftRegisterId(branchRegister.id);
          }}
          sortMode={sortMode}
          onSortModeChange={setSortMode}
          inStockOnly={inStockOnly}
          onToggleInStockOnly={() => setInStockOnly((v) => !v)}
          visibleBrands={visibleBrands}
          selectedBrand={selectedBrand}
          onBrandChange={setSelectedBrand}
          hasCeramicCatalog={hasCeramicCatalog}
          selectedGrade={selectedGrade}
          onGradeChange={setSelectedGrade}
          visibleSizes={visibleSizes}
          selectedSize={selectedSize}
          onSizeChange={setSelectedSize}
          visibleColors={visibleColors}
          selectedColor={selectedColor}
          onColorChange={setSelectedColor}
          onOpenCalculator={() => setIsCalculatorOpen(true)}
          productsCount={products.length}
          visibleCategories={visibleCategories}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          resultCount={filteredProducts.length}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={clearFilters}
        />

        <PosProductGrid
          products={filteredProducts}
          cart={cart}
          stockOf={stockOf}
          gradeLabel={gradeLabel}
          onAddToCart={addToCart}
          onAddMultipleToCart={(prods) => {
            prods.forEach((prod) => addToCart(prod));
            notify(`تمت إضافة ${prods.length} أصناف إلى السلة بنجاح`, 'success');
          }}
          multiSelectEnabled={!!settings?.posMultiSelectSearch}
        />
      </div>

      {/* ═══ Right: Cart & Checkout ═══ */}
      <div className="w-[26rem] max-w-[90vw] bg-white flex flex-col h-full border-r border-slate-200 shadow-2xl shrink-0 max-[900px]:w-full max-[900px]:max-w-none max-[900px]:h-[48%] max-[900px]:border-t max-[900px]:border-r-0">
        <PosCartPanel
          selectedCustomer={selectedCustomer}
          customerSearch={customerSearch}
          filteredCustomers={filteredCustomers}
          canCreateCustomer={can('customers.create')}
          onCustomerSearchChange={(value) => { setCustomerSearch(value); setSelectedCustomer(null); }}
          onSelectCustomer={(customer) => { setSelectedCustomer(customer); applyCustomerPricing(customer); setCustomerSearch(''); }}
          onCreateNewCustomer={() => { setCustomerError(''); setIsCustomerModalOpen(true); }}
          cart={cart}
          cartQuantitySummary={cartQuantitySummary}
          enableNegativeStock={settings?.enableNegativeStock ?? false}
          gradeLabel={gradeLabel}
          onRemove={removeFromCart}
          onUpdateUnit={updateCartUnit}
          onStepQuantity={stepCartQuantity}
          onUpdateQuantity={updateCartQuantity}
          onUpdatePrice={updateCartPrice}
          onUpdateLineDiscount={updateCartLineDiscount}
          sellingPriceTiersCount={settings?.sellingPriceTiersCount ?? 1}
          sellingPriceTierNames={settings?.sellingPriceTierNames}
        />

        <PosCheckoutPanel
          cartLength={cart.length}
          cartQuantitySummary={cartQuantitySummary}
          lineSubtotal={lineSubtotal}
          lineDiscountTotal={lineDiscountTotal}
          discountAmount={discountAmount}
          setDiscountAmount={setDiscountAmount}
          taxPercentage={taxPercentage}
          setTaxPercentage={setTaxPercentage}
          taxAmount={taxAmount}
          shippingCost={shippingCost}
          setShippingCost={setShippingCost}
          paymentType={paymentType}
          setPaymentType={setPaymentType}
          showCashButton={settings?.posShowCashButton !== false}
          splitCash={splitCash}
          setSplitCash={setSplitCash}
          splitCard={splitCard}
          setSplitCard={setSplitCard}
          splitBank={splitBank}
          setSplitBank={setSplitBank}
          splitCheque={splitCheque}
          setSplitCheque={setSplitCheque}
          couponCode={couponCode}
          setCouponCode={setCouponCode}
          appliedPromotion={appliedPromotion}
          selectedCustomer={selectedCustomer}
          redeemPoints={redeemPoints}
          setRedeemPoints={setRedeemPoints}
          onRedeemPoints={() => {
            if (!redeemPoints || redeemPoints <= 0 || !selectedCustomer) return;
            try {
              loyaltyService.redeemPoints({ customerId: selectedCustomer.id, points: redeemPoints, referenceType: 'SALES_INVOICE', description: 'استبدال نقاط' });
              setLoyaltyDiscount(redeemPoints);
              notify(`تم استبدال ${redeemPoints} نقطة`, 'success');
            } catch (e: any) { notify(e?.message || 'فشل الاستبدال', 'error'); }
          }}
          paidAmount={paidAmount}
          setPaidAmount={setPaidAmount}
          paidInputRef={paidInputRef}
          totalAmount={totalAmount}
          remainingAmount={remainingAmount}
          changeDue={changeDue}
          notes={notes}
          setNotes={setNotes}
          hasCeramicCatalog={hasCeramicCatalog}
          isProcessing={isProcessing}
          onHoldOrder={holdCurrentOrder}
          onClearOrder={clearCart}
          onOpenCalculator={() => setIsCalculatorOpen(true)}
          onCheckout={() => handleCheckout()}
        />
      </div>

      <PosToast toast={toast} />

      {successInvoice && (
        <SuccessInvoiceModal
          invoice={successInvoice}
          onPrintThermal={() => printService.printThermalReceipt(successInvoice)}
          onPreview={() => openInvoicePreview(successInvoice)}
          onClose={() => setSuccessInvoice(null)}
          canVoid={can('sales.void')}
          onVoid={() => handleVoidInvoice(successInvoice)}
        />
      )}

      {isOverrideOpen && (
        <ManagerOverrideModal
          onConfirm={handleManagerOverride}
          onClose={() => { setIsOverrideOpen(false); setPendingVoid(null); }}
        />
      )}

      {isPinLoginOpen && (
        <PinLoginModal
          onConfirm={handlePinLogin}
          onClose={() => setIsPinLoginOpen(false)}
        />
      )}

      {invoicePreview && (
        <DocumentPreviewModal
          title={invoicePreview.title}
          subtitle={invoicePreview.subtitle}
          fileName={invoicePreview.fileName}
          html={invoicePreview.html}
          onClose={() => setInvoicePreview(null)}
          onDownloadExcel={invoicePreview.excel}
          onWhatsApp={invoicePreview.whatsapp}
        />
      )}

      {isHeldModalOpen && (
        <HeldOrdersModal
          orders={heldOrders}
          onResume={resumeHeldOrder}
          onDelete={deleteHeldOrder}
          onClose={() => setIsHeldModalOpen(false)}
        />
      )}

      {isCustomerModalOpen && (
        <NewCustomerModal
          name={newCustName}
          phone={newCustPhone}
          type={newCustType}
          creditLimit={newCustCredit}
          error={customerError}
          onNameChange={setNewCustName}
          onPhoneChange={setNewCustPhone}
          onTypeChange={setNewCustType}
          onCreditLimitChange={setNewCustCredit}
          onSave={handleCreateCustomer}
          onClose={() => setIsCustomerModalOpen(false)}
        />
      )}

      {isShiftModalOpen && (
        <OpenShiftModal
          registers={registers}
          registerId={shiftRegisterId}
          openingBalance={openingBalance}
          onRegisterChange={(registerId) => {
            setShiftRegisterId(registerId);
            setOpeningBalance(cashierService.getSuggestedOpeningBalance(registerId));
          }}
          onOpeningBalanceChange={setOpeningBalance}
          onConfirm={handleOpenShift}
          onClose={() => setIsShiftModalOpen(false)}
        />
      )}

      {isCloseShiftModalOpen && activeShift && (
        <CloseShiftModal
          shift={activeShift}
          expectedClosingCash={expectedClosingCash}
          actualClosingCash={closingCash}
          notes={closingNotes}
          onActualClosingCashChange={(value) => setClosingCash(Math.max(0, Number(value) || 0))}
          onNotesChange={setClosingNotes}
          onConfirm={handleCloseShift}
          hideExpected={settings?.blindCloseShift === true && currentUser?.role !== 'ADMIN'}
          onPrintZReport={printZReport}
          onClose={() => {
            setIsCloseShiftModalOpen(false);
            setClosingCash(expectedClosingCash);
          }}
        />
      )}

      {isToneWarningOpen && toneConflicts.length > 0 && (
        <ToneWarningModal
          conflicts={toneConflicts}
          onCancel={() => {
            setIsToneWarningOpen(false);
            setToneConflicts([]);
          }}
          onContinue={() => {
            setIsToneWarningOpen(false);
            setToneConflicts([]);
            handleCheckout(true);
          }}
        />
      )}

      {isShortcutsOpen && <ShortcutsModal onClose={() => setIsShortcutsOpen(false)} />}

      <CeramicCalculatorModal
        isOpen={isCalculatorOpen}
        onClose={() => setIsCalculatorOpen(false)}
        products={products}
        onAddToCart={addCalculatedToCart}
      />
    </div>
  );
};

export default PosView;
