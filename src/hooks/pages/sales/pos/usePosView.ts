import { useState, useEffect, useRef, useMemo, useContext, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProductService } from '../../../../services/domains/products/ProductService';
import { OperationalFieldService, type ProductGradeOption } from '../../../../services/domains/products/OperationalFieldService';
import { InventoryService } from '../../../../services/domains/inventory/InventoryService';
import { CustomerService } from '../../../../services/domains/customers/CustomerService';
import { CategoryService, CategoryWithCount } from '../../../../services/domains/products/CategoryService';
import { SalesService } from '../../../../services/domains/sales/SalesService';
import { AuthService } from '../../../../services/domains/auth/AuthService';
import { BatchService } from '../../../../services/domains/inventory/BatchService';
import { CashierService } from '../../../../services/domains/finance/CashierService';
import { HeldOrderService } from '../../../../services/domains/sales/HeldOrderService';
import { LoyaltyService } from '../../../../services/domains/sales/LoyaltyService';
import { PrintService } from '../../../../services/shared/PrintService';
import { PricingService, type AppliedPromotion } from '../../../../services/domains/sales/PricingService';
import { PermissionService } from '../../../../services/domains/auth/PermissionService';
import { FinanceEnterpriseService } from '../../../../services/domains/finance/FinanceEnterpriseService';
import { Product, Customer, Warehouse, CashRegister, CashShift, PaymentType, SystemSettings, ToneMixingConflict } from '../../../../types';
import type { BankAccount } from '../../../../types/finance';
import { LayoutContext } from '../../../../contexts/LayoutContext';
import {
  type InvoicePreview, type Toast, round2,
} from '../../../../types/pos';
import { usePosCart } from './usePosCart';
import { usePosBarcodeSearch } from './usePosBarcodeSearch';
import { usePosCatalog } from './usePosCatalog';
import { usePosCheckout } from './usePosCheckout';
import { usePosCustomerDisplay } from './usePosCustomerDisplay';
import { usePosCustomerCreation } from './usePosCustomerCreation';
import { usePosHeldOrders } from './usePosHeldOrders';
import { usePosShiftActions } from './usePosShiftActions';
import { usePosInvoicePreview } from './usePosInvoicePreview';
import { usePosKeyboardShortcuts } from './usePosKeyboardShortcuts';
import { usePosTotals } from './usePosTotals';
import { gradeLabel as configuredGradeLabel, setConfiguredGradeLabels } from '../../../../components/products/productFormModel';
import { EmployeeService } from '../../../../services/domains/hr/EmployeeService';

export function usePosView() {
  const navigate = useNavigate();
  const { currentUser } = useContext(LayoutContext);
  const [actingUser, setActingUser] = useState<any>(null);
  const effectiveUser = actingUser || currentUser;

  const [products, setProducts] = useState<Product[]>([]);
  const [productsTotal, setProductsTotal] = useState(0);
  const [productPage, setProductPage] = useState(1);
  const [gradeOptions, setGradeOptions] = useState<ProductGradeOption[]>([]);
  const [categories, setCategories] = useState<CategoryWithCount[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerPage, setCustomerPage] = useState(1);
  const [customersTotal, setCustomersTotal] = useState(0);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [registers, setRegisters] = useState<CashRegister[]>([]);
  const [activeShift, setActiveShift] = useState<CashShift | null>(null);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  const [discountedStocks, setDiscountedStocks] = useState<any[]>([]);
  const [isDiscountedStocksOpen, setIsDiscountedStocksOpen] = useState(false);

  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [salesRepId, setSalesRepId] = useState<string>('');
  const [salesReps, setSalesReps] = useState<ReturnType<typeof EmployeeService.getSalesReps>>([]);

  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [discountMode, setDiscountMode] = useState<'percent' | 'amount'>('amount');
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [shippingCost, setShippingCost] = useState<number>(0);
  const [extraFees, setExtraFees] = useState<number>(0);
  const [taxPercentage, setTaxPercentage] = useState<number>(0);
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [paymentType, setPaymentType] = useState<PaymentType>('CASH');
  const [splitCash, setSplitCash] = useState<number>(0);
  const [splitCard, setSplitCard] = useState<number>(0);
  const [splitBank, setSplitBank] = useState<number>(0);
  const [paymentBankAccountId, setPaymentBankAccountId] = useState('');
  const [paymentBankAccounts, setPaymentBankAccounts] = useState<BankAccount[]>([]);
  const [splitCheque, setSplitCheque] = useState<number>(0);
  const [splitCredit, setSplitCredit] = useState<number>(0);
  const [activeCartIndex, setActiveCartIndex] = useState<number | null>(null);
  const [productViewMode, setProductViewMode] = useState<'grid' | 'list'>('grid');
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
  const operationalFieldService = useMemo(() => new OperationalFieldService(), []);
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
  const financeEnterpriseService = useMemo(() => new FinanceEnterpriseService(), []);

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

  useEffect(() => {
    try {
      const result = productService.getProductsPage(searchQuery.trim(), selectedCategory === 'ALL' ? undefined : selectedCategory,
        selectedBrand === 'ALL' ? undefined : selectedBrand, 1, 48, { status: 'active' });
      setProductPage(1);
      setProducts(result.items);
      setProductsTotal(result.totalItems);
    } catch (error: any) {
      notify(error?.message || 'تعذر البحث عن الأصناف', 'error');
    }
  }, [productService, searchQuery, selectedCategory, selectedBrand, notify]);

  const loadMoreProducts = useCallback(() => {
    const nextPage = productPage + 1;
    const result = productService.getProductsPage(searchQuery.trim(), selectedCategory === 'ALL' ? undefined : selectedCategory,
      selectedBrand === 'ALL' ? undefined : selectedBrand, nextPage, 48, { status: 'active' });
    setProducts((current) => [...current, ...result.items]);
    setProductPage(nextPage);
  }, [productPage, productService, searchQuery, selectedCategory, selectedBrand]);

  useEffect(() => {
    if (!customerSearch.trim()) { setCustomers([]); setCustomersTotal(0); setCustomerPage(1); return; }
    try {
      const result = customerService.getCustomersPage(customerSearch.trim(), 1, 40, {}, { includeTaxNumber: can('customers.update') });
      setCustomerPage(1);
      setCustomers(result.items);
      setCustomersTotal(result.totalItems);
    } catch (error: any) {
      notify(error?.message || 'تعذر البحث عن العملاء', 'error');
    }
  }, [can, customerService, customerSearch, notify]);

  const loadMoreCustomers = useCallback(() => {
    const nextPage = customerPage + 1;
    const result = customerService.getCustomersPage(customerSearch.trim(), nextPage, 40, {}, { includeTaxNumber: can('customers.update') });
    setCustomers((current) => [...current, ...result.items]);
    setCustomerPage(nextPage);
    setCustomersTotal(result.totalItems);
  }, [can, customerPage, customerService, customerSearch]);

  const {
    cart,
    setCart,
    applyCustomerPricing,
    addToCart,
    addDiscountedToCart,
    addCalculatedToCart,
    updateCartQuantity,
    stepCartQuantity,
    updateCartUnit,
    updateCartPrice,
    updateCartLineDiscount,
    removeFromCart,
    recentlyRemoved,
    undoRemoveFromCart,
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
    setCustomers,
    applyCustomerPricing,
    setSelectedCustomer,
    setRedeemPoints,
    setLoyaltyDiscount,
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
    } catch (error: any) {
      notify(error?.message || 'تعذر تحميل أرصدة المخزون.', 'error');
    }
    try {
      setDiscountedStocks(inventoryService.getDiscountedSaleStocks(warehouseId));
    } catch (error: any) {
      setDiscountedStocks([]);
      notify(error?.message || 'تعذر تحميل مخزون البيع المخفض.', 'error');
    }
  }, [inventoryService, notify]);

  const loadInitialData = useCallback(() => {
    try {
      const firstProductsPage = productService.getProductsPage('', undefined, undefined, 1, 48, { status: 'active' });
      const allCusts = customerService.getCustomersPage('', 1, 1).items;
      const allWhs = inventoryService.getAllWarehouses();
      const allCats = categoryService.getAllCategories();
      const allRegs = cashierService.getAllRegisters();
      const sysSettings = printService.getSettings();
      const configuredGrades = operationalFieldService.getProductGradeOptions();
      setGradeOptions(configuredGrades);
      setConfiguredGradeLabels(configuredGrades);
      const defaultWarehouse = allWhs[0];
      const shift = cashierService.getActiveShift();

      setProducts(firstProductsPage.items);
      setProductsTotal(firstProductsPage.totalItems);
      setCustomers([]);
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

      const walkIn = customerService.getCustomerById('cust_cash') || allCusts[0] || null;
      setSelectedCustomer(walkIn);

      const defaultReg = allRegs.find((r) => r.isDefault) || allRegs[0];
      if (defaultReg) setShiftRegisterId(defaultReg.id);
    } catch (e) {
      console.error(e);
      notify('تعذر تحميل بيانات نقطة البيع', 'error');
    }
  }, [productService, operationalFieldService, customerService, inventoryService, categoryService, cashierService, printService, loadStock, notify]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    try {
      const accounts = financeEnterpriseService.getBankAccounts().filter((account) => account.isActive);
      setPaymentBankAccounts(accounts);
      setPaymentBankAccountId(accounts[0]?.id || '');
    } catch {
      setPaymentBankAccounts([]);
      setPaymentBankAccountId('');
    }
  }, [financeEnterpriseService]);

  const { heldOrders, holdCurrentOrder, resumeHeldOrder, deleteHeldOrder } = usePosHeldOrders({
    heldOrderService,
    currentUserId: currentUser?.id,
    cart,
    setCart,
    selectedCustomer,
    setSelectedCustomer,
    customerService,
    selectedWarehouseId,
    setSelectedWarehouseId,
    discountAmount,
    setDiscountAmount,
    taxPercentage,
    setTaxPercentage,
    defaultTaxPercentage: settings?.defaultTaxPercentage,
    shippingCost,
    setShippingCost,
    extraFees,
    setExtraFees,
    splitCash,
    setSplitCash,
    splitCard,
    setSplitCard,
    splitBank,
    setSplitBank,
    splitCheque,
    setSplitCheque,
    splitCredit,
    setSplitCredit,
    notes,
    setNotes,
    paidAmount,
    setPaidAmount,
    paymentType,
    setPaymentType,
    couponCode,
    setCouponCode,
    redeemPoints,
    setRedeemPoints,
    loyaltyDiscount,
    setLoyaltyDiscount,
    setIsHeldModalOpen,
    notify,
  });

  useEffect(() => {
    if (selectedWarehouseId) loadStock(selectedWarehouseId);
  }, [selectedWarehouseId, loadStock]);

  useEffect(() => {
    const branchId = warehouses.find((w) => w.id === selectedWarehouseId)?.branchId;
    setSalesReps(EmployeeService.getSalesReps(branchId));
  }, [selectedWarehouseId, warehouses]);

  // ── Cart operations ────────────────────────────────────────────────────────
  const clearCart = () => {
    if (cart.length === 0) return;
    if (!window.confirm('هل تريد إفراغ سلة البيع بالكامل؟')) return;
    setCart([]);
    setDiscountAmount(0);
    setDiscountPercent(0);
    setShippingCost(0);
    setExtraFees(0);
    setSplitCash(0);
    setSplitCard(0);
    setSplitBank(0);
    setSplitCheque(0);
    setSplitCredit(0);
    setNotes('');
    setPaidAmount(0);
    setCouponCode('');
    setRedeemPoints(0);
    setLoyaltyDiscount(0);
  };

  const {
    lineSubtotal, lineDiscountTotal, taxAmount, totalAmount,
    remainingAmount, changeDue, expectedClosingCash, cartQuantitySummary,
  } = usePosTotals({
    cart, discountAmount, promotionDiscount, loyaltyDiscount, taxPercentage,
    shippingCost, extraFees, paidAmount, activeShift,
  });

  const visiblePaymentTypes = useMemo<PaymentType[]>(() => {
    const types: PaymentType[] = [];
    if (settings?.posShowCashButton !== false) types.push('CASH');
    if (settings?.posShowCardButton !== false) types.push('CARD');
    if (settings?.posShowBankTransferButton !== false) types.push('BANK_TRANSFER');
    if (settings?.posShowChequeButton !== false) types.push('CHEQUE');
    if (settings?.posShowCreditButton !== false) types.push('CREDIT');
    if (settings?.posShowMixedPaymentButton !== false) types.push('MIXED');
    return types.length > 0 ? types : ['CASH'];
  }, [settings]);

  // Keep the percentage discount and the stored amount in sync.
  useEffect(() => {
    if (discountMode !== 'percent') return;
    const base = Math.max(0, lineSubtotal - lineDiscountTotal);
    setDiscountAmount(round2(base * (discountPercent || 0) / 100));
  }, [discountMode, discountPercent, lineSubtotal, lineDiscountTotal]);

  // Never leave a hidden payment method selected.
  useEffect(() => {
    if (!visiblePaymentTypes.includes(paymentType)) {
      setPaymentType(visiblePaymentTypes[0]);
    }
  }, [visiblePaymentTypes, paymentType]);

  const handleDiscountPercentChange = useCallback((value: number) => {
    setDiscountPercent(value);
  }, []);

  const cyclePaymentType = useCallback(() => {
    if (visiblePaymentTypes.length === 0) return;
    setPaymentType((current) => {
      const index = visiblePaymentTypes.indexOf(current);
      return visiblePaymentTypes[(index + 1) % visiblePaymentTypes.length];
    });
  }, [visiblePaymentTypes]);
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
    redeemPoints,
    setRedeemPoints,
    taxPercentage,
    taxAmount,
    shippingCost,
    setShippingCost,
    extraFees,
    setExtraFees,
    discountPercentage: discountPercent,
    paidAmount,
    setPaidAmount,
    paymentType,
    bankAccountId: paymentBankAccountId || undefined,
    splitCash,
    setSplitCash,
    splitCard,
    setSplitCard,
    splitBank,
    setSplitBank,
    splitCheque,
    setSplitCheque,
    splitCredit,
    setSplitCredit,
    notes,
    setNotes,
    salesRepId,
    remainingAmount,
    lineSubtotal,
    lineDiscountTotal,
    setSuccessInvoice,
    setActiveShift,
    setToneConflicts,
    setIsToneWarningOpen,
    salesService,
    cashierService,
    batchService,
    loyaltyService,
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
    if (paymentType === 'MIXED') {
      setPaidAmount(round2(splitCash + splitCard + splitBank + splitCheque));
    }
  }, [totalAmount, paymentType, splitCash, splitCard, splitBank, splitCheque]);

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
  const [isMobileCheckoutOpen, setIsMobileCheckoutOpen] = useState(false);
  const mobileCheckoutTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileCheckoutCloseRef = useRef<HTMLButtonElement>(null);
  const mobileCheckoutPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isMobileCheckoutOpen) return;

    const closeButton = mobileCheckoutCloseRef.current;
    const triggerButton = mobileCheckoutTriggerRef.current;
    const panel = mobileCheckoutPanelRef.current;
    closeButton?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMobileCheckoutOpen(false);
      if (event.key !== 'Tab' || !panel) return;

      const focusableElements = Array.from(panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )).filter((element) => element.getClientRects().length > 0);
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      if (!firstElement || !lastElement) return;

      if (!panel.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? lastElement : firstElement).focus();
      } else if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (document.activeElement === closeButton) triggerButton?.focus();
    };
  }, [isMobileCheckoutOpen]);

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
      if (!PermissionService.can(u, 'ui.sales.pos.void')) {
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
    refreshCatalog: loadInitialData,
    cyclePaymentType,
    holdCurrentOrder,
    deleteActiveCartLine: () => {
      if (activeCartIndex === null) return;
      const removedIndex = activeCartIndex;
      removeFromCart(removedIndex);
      setActiveCartIndex(cart.length > 1 ? Math.min(removedIndex, cart.length - 2) : null);
    },
    stepActiveCartLine: (direction) => {
      if (activeCartIndex === null) return;
      stepCartQuantity(activeCartIndex, direction);
    },
  });

  const gradeLabel = (grade: Product['grade']) => configuredGradeLabel(grade);

  return {
    navigate,
    currentUser, actingUser, setActingUser, effectiveUser,
    products, setProducts, productsTotal, productPage, setProductPage,
    gradeOptions,
    categories, customers, setCustomers, customersTotal, setCustomersTotal,
    warehouses, registers, activeShift, setActiveShift, settings,
    stockMap, setStockMap, discountedStocks, isDiscountedStocksOpen, setIsDiscountedStocksOpen,
    selectedWarehouseId, setSelectedWarehouseId, selectedCustomer, setSelectedCustomer,
    salesRepId, setSalesRepId, salesReps,
    discountAmount, setDiscountAmount, discountMode, setDiscountMode, discountPercent, setDiscountPercent,
    shippingCost, setShippingCost, extraFees, setExtraFees, taxPercentage, setTaxPercentage,
    paidAmount, setPaidAmount, paymentType, setPaymentType,
    splitCash, setSplitCash, splitCard, setSplitCard, splitBank, setSplitBank,
    paymentBankAccountId, setPaymentBankAccountId, paymentBankAccounts,
    splitCheque, setSplitCheque, splitCredit, setSplitCredit,
    activeCartIndex, setActiveCartIndex, productViewMode, setProductViewMode,
    couponCode, setCouponCode, appliedPromotion, promotionDiscount, redeemPoints, setRedeemPoints,
    loyaltyDiscount, setLoyaltyDiscount, notes, setNotes,
    successInvoice, setSuccessInvoice, invoicePreview, setInvoicePreview, toast,
    isCalculatorOpen, setIsCalculatorOpen, isCustomerModalOpen, setIsCustomerModalOpen,
    isHeldModalOpen, setIsHeldModalOpen, isShortcutsOpen, setIsShortcutsOpen,
    isShiftModalOpen, setIsShiftModalOpen, isCloseShiftModalOpen, setIsCloseShiftModalOpen,
    closingCash, setClosingCash, closingNotes, setClosingNotes,
    toneConflicts, setToneConflicts, isToneWarningOpen, setIsToneWarningOpen,
    newCustName, setNewCustName, newCustPhone, setNewCustPhone, newCustType, setNewCustType,
    newCustCredit, setNewCustCredit, customerError, setCustomerError,
    shiftRegisterId, setShiftRegisterId, openingBalance, setOpeningBalance,
    barcodeInputRef, paidInputRef,
    productService, operationalFieldService, inventoryService, customerService,
    categoryService, salesService, batchService, cashierService, heldOrderService,
    loyaltyService, printService, pricingService, financeEnterpriseService,
    notify, can, stockOf,
    searchQuery, setSearchQuery, selectedCategory, setSelectedCategory,
    selectedBrand, setSelectedBrand, selectedGrade, setSelectedGrade,
    selectedSize, setSelectedSize, selectedColor, setSelectedColor,
    customerSearch, setCustomerSearch, inStockOnly, setInStockOnly,
    sortMode, setSortMode,
    filteredProducts, visibleCategories, visibleBrands, hasCeramicCatalog,
    visibleSizes, visibleColors, filteredCustomers, hasActiveFilters, clearFilters,
    cart, setCart, applyCustomerPricing, addToCart, addDiscountedToCart, addCalculatedToCart,
    updateCartQuantity, stepCartQuantity, updateCartUnit, updateCartPrice,
    updateCartLineDiscount, removeFromCart, recentlyRemoved, undoRemoveFromCart,
    handleSearchSubmit, handleCreateCustomer, loadStock, loadInitialData,
    loadMoreProducts, loadMoreCustomers,
    lineSubtotal, lineDiscountTotal, taxAmount, totalAmount,
    remainingAmount, changeDue, expectedClosingCash, cartQuantitySummary,
    visiblePaymentTypes, handleDiscountPercentChange, cyclePaymentType,
    isProcessing, setIsProcessing, handleCheckout,
    openCustomerDisplay, handleOpenShift, handleCloseShift, printZReport,
    openInvoicePreview, clearCart,
    pendingVoid, setPendingVoid, isOverrideOpen, setIsOverrideOpen,
    isPinLoginOpen, setIsPinLoginOpen, touchMode, setTouchMode,
    isMobileCheckoutOpen, setIsMobileCheckoutOpen,
    mobileCheckoutTriggerRef, mobileCheckoutCloseRef, mobileCheckoutPanelRef,
    handleVoidInvoice, handlePinLogin, handleManagerOverride, gradeLabel,
    heldOrders, holdCurrentOrder, resumeHeldOrder, deleteHeldOrder,
  };
}

export type PosViewVm = ReturnType<typeof usePosView>;
