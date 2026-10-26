import React, { useState, useEffect, useRef, useMemo, useContext, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Barcode, ShoppingCart, Trash2, Plus, Minus,
  CreditCard, Banknote, CheckCircle2, Printer, Calculator,
  AlertCircle, RefreshCw, X, PauseCircle, PlayCircle, Keyboard,
  Package, UserPlus, Percent, Truck, Wallet, Layers, Receipt,
  ChevronDown, Lock, Unlock, History, Sparkles, Info
} from 'lucide-react';
import { ProductService } from '../services/ProductService';
import { InventoryService } from '../services/InventoryService';
import { CustomerService } from '../services/CustomerService';
import { CategoryService, CategoryWithCount } from '../services/CategoryService';
import { SalesService } from '../services/SalesService';
import { BatchService } from '../services/BatchService';
import { CashierService } from '../services/CashierService';
import { PrintService } from '../services/PrintService';
import { PricingService } from '../services/PricingService';
import { ApprovalService } from '../services/ApprovalService';
import { PermissionService } from '../services/PermissionService';
import { Product, Customer, Warehouse, CashRegister, CashShift, PaymentType, SystemSettings, ToneMixingConflict } from '../types';
import { CeramicMath } from '../utils/ceramicMath';
import { formatProductQuantity, getProductUnitLabel } from '../utils/productUnits';
import { CeramicCalculatorModal } from './CeramicCalculatorModal';
import { DocumentPreviewModal } from './DocumentPreviewModal';
import { exportToExcel } from '../utils/export';
import { LayoutContext } from '../layouts/MainLayout';

type PosUnit = 'M2' | 'BOX' | 'PIECE';
type SortMode = 'NAME' | 'PRICE_ASC' | 'PRICE_DESC' | 'STOCK_DESC';

interface CartItem {
  product: Product;
  soldBy: PosUnit;
  quantityM2: number;
  boxesCount: number;
  piecesCount: number;
  unitPrice: number;
  discountAmount: number;
  availableStockM2: number;
}

interface HeldOrder {
  id: string;
  label: string;
  createdAt: string;
  customerId: string;
  customerName: string;
  warehouseId: string;
  items: CartItem[];
  discountAmount: number;
  shippingCost: number;
  notes: string;
  paidAmount?: number;
  paymentType?: PaymentType;
}

interface Toast {
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
}

const HELD_STORAGE_KEY = 'ceramisys_pos_held_orders';
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export const PosView: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useContext(LayoutContext);

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<CategoryWithCount[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [registers, setRegisters] = useState<CashRegister[]>([]);
  const [activeShift, setActiveShift] = useState<CashShift | null>(null);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [stockMap, setStockMap] = useState<Record<string, number>>({});

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedBrand, setSelectedBrand] = useState<string>('ALL');
  const [selectedGrade, setSelectedGrade] = useState<string>('ALL');
  const [selectedSize, setSelectedSize] = useState<string>('ALL');
  const [selectedColor, setSelectedColor] = useState<string>('ALL');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('NAME');

  const [cart, setCart] = useState<CartItem[]>([]);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [shippingCost, setShippingCost] = useState<number>(0);
  const [taxPercentage, setTaxPercentage] = useState<number>(0);
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [paymentType, setPaymentType] = useState<PaymentType>('CASH');
  const [notes, setNotes] = useState('');

  const [heldOrders, setHeldOrders] = useState<HeldOrder[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [successInvoice, setSuccessInvoice] = useState<any | null>(null);
  const [invoicePreview, setInvoicePreview] = useState<{
    title: string;
    subtitle?: string;
    fileName: string;
    html: string;
    excel?: () => void;
    whatsapp?: () => void;
  } | null>(null);
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
  const [pendingCheckout, setPendingCheckout] = useState(false);

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
  const printService = useMemo(() => new PrintService(), []);
  const pricingService = useMemo(() => new PricingService(), []);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const notify = useCallback((message: string, type: Toast['type'] = 'info') => {
    setToast({ message, type });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4200);
  }, []);

  const can = useCallback(
    (permission: string) => PermissionService.can(currentUser, permission),
    [currentUser]
  );

  const stockOf = useCallback(
    (productId: string) => stockMap[productId] ?? 0,
    [stockMap]
  );

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
      const shift = cashierService.getActiveShift();
      const sysSettings = printService.getSettings();

      setProducts(allProds);
      setCustomers(allCusts);
      setWarehouses(allWhs);
      setCategories(allCats);
      setRegisters(allRegs);
      setActiveShift(shift);
      setSettings(sysSettings);
      setTaxPercentage(sysSettings.defaultTaxPercentage || 0);

      const defaultWarehouse = allWhs[0]?.id || '';
      setSelectedWarehouseId(defaultWarehouse);
      if (defaultWarehouse) loadStock(defaultWarehouse);

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
    try {
      const raw = localStorage.getItem(HELD_STORAGE_KEY);
      if (raw) setHeldOrders(JSON.parse(raw));
    } catch {
      setHeldOrders([]);
    }
  }, [loadInitialData]);

  useEffect(() => {
    if (selectedWarehouseId) loadStock(selectedWarehouseId);
  }, [selectedWarehouseId, loadStock]);

  // ── Derived catalog ─────────────────────────────────────────────────────────
  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = products.filter((p) => {
      const matchesSearch = !q ||
        p.name.toLowerCase().includes(q) ||
        (p.barcode || '').includes(q) ||
        (p.sku || '').toLowerCase().includes(q) ||
        (p.size || '').includes(q) ||
        (p.brandName || '').toLowerCase().includes(q) ||
        (p.color || '').toLowerCase().includes(q);
      const matchesCategory = selectedCategory === 'ALL' || p.categoryId === selectedCategory;
      const matchesBrand = selectedBrand === 'ALL' || p.brandId === selectedBrand;
      const matchesGrade = selectedGrade === 'ALL' || p.grade === selectedGrade;
      const matchesSize = selectedSize === 'ALL' || p.size === selectedSize;
      const matchesColor = selectedColor === 'ALL' || (p.color || '') === selectedColor;
      const matchesStock = !inStockOnly || stockOf(p.id) > 0;
      return matchesSearch && matchesCategory && matchesBrand && matchesGrade && matchesSize && matchesColor && matchesStock;
    });

    list = [...list].sort((a, b) => {
      switch (sortMode) {
        case 'PRICE_ASC': return a.sellingPriceM2 - b.sellingPriceM2;
        case 'PRICE_DESC': return b.sellingPriceM2 - a.sellingPriceM2;
        case 'STOCK_DESC': return stockOf(b.id) - stockOf(a.id);
        default: return a.name.localeCompare(b.name, 'ar');
      }
    });
    return list;
  }, [products, searchQuery, selectedCategory, selectedBrand, selectedGrade, selectedSize, selectedColor, inStockOnly, sortMode, stockOf]);

  const visibleCategories = useMemo(
    () => categories.filter((c) => c.productCount > 0),
    [categories]
  );
  const visibleBrands = useMemo(() => [...new Map(products.filter((p) => p.brandId).map((p) => [p.brandId, p.brandName || ''])).entries()], [products]);
  const visibleSizes = useMemo(() => [...new Set(products.map((p) => p.size).filter(Boolean))].sort(), [products]);
  const visibleColors = useMemo(() => [...new Set(products.map((p) => p.color).filter(Boolean) as string[])].sort(), [products]);

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers.slice(0, 40);
    return customers
      .filter((c) => c.name.toLowerCase().includes(q) || (c.phone || '').includes(q) || (c.code || '').toLowerCase().includes(q))
      .slice(0, 40);
  }, [customers, customerSearch]);

  // ── Cart operations ────────────────────────────────────────────────────────
  const makeCartItem = (product: Product, quantityM2: number): CartItem => {
    const metersPerBox = product.metersPerBox || 1.44;
    const piecesPerBox = product.piecesPerBox || 4;
    const isGeneral = product.productType === 'GENERAL';
    const boxes = isGeneral
      ? product.baseUnit === 'BOX' ? quantityM2 : 0
      : CeramicMath.calculateBoxes(quantityM2, metersPerBox, true);
    let unitPrice = product.sellingPriceM2;
    try {
      unitPrice = pricingService.getEffectivePrice(product.id, selectedCustomer?.id, quantityM2).priceM2;
    } catch {
      unitPrice = product.sellingPriceM2;
    }
    return {
      product,
      soldBy: isGeneral && (product.baseUnit === 'BOX' || product.baseUnit === 'PIECE') ? product.baseUnit : 'M2',
      quantityM2: round2(quantityM2),
      boxesCount: boxes,
      piecesCount: isGeneral
        ? product.baseUnit === 'PIECE' ? quantityM2 : 0
        : CeramicMath.calculatePiecesFromBoxes(boxes, piecesPerBox),
      unitPrice,
      discountAmount: 0,
      availableStockM2: stockOf(product.id)
    };
  };

  const applyCustomerPricing = useCallback((customer: Customer | null) => {
    setCart((prev) => prev.map((item) => {
      try {
        return { ...item, unitPrice: pricingService.getEffectivePrice(item.product.id, customer?.id, item.quantityM2).priceM2 };
      } catch {
        return item;
      }
    }));
  }, [pricingService]);

  const addToCart = useCallback((product: Product, requestedM2?: number) => {
    setCart((prev) => {
      const existingIndex = prev.findIndex((item) => item.product.id === product.id);
      const stepM2 = requestedM2 ?? (product.productType === 'GENERAL' ? 1 : (product.metersPerBox || 1.44));
      if (existingIndex > -1) {
        const updated = [...prev];
        const current = updated[existingIndex];
        const newM2 = round2(current.quantityM2 + stepM2);
        current.quantityM2 = newM2;
        if (current.product.productType === 'GENERAL') {
          current.boxesCount = current.product.baseUnit === 'BOX' ? newM2 : 0;
          current.piecesCount = current.product.baseUnit === 'PIECE' ? newM2 : 0;
        } else {
          current.boxesCount = CeramicMath.calculateBoxes(newM2, current.product.metersPerBox || 1.44, true);
          current.piecesCount = CeramicMath.calculatePiecesFromBoxes(current.boxesCount, current.product.piecesPerBox || 4);
        }
        return updated;
      }
      return [...prev, makeCartItem(product, stepM2)];
    });
  }, [stockOf]);

  const addCalculatedToCart = (product: Product, quantityM2: number) => {
    addToCart(product, quantityM2);
    notify(`تمت إضافة ${product.name} (${formatProductQuantity(quantityM2, product)}) إلى السلة`, 'success');
  };

  const updateCartQuantity = (index: number, value: number) => {
    if (!Number.isFinite(value) || value < 0) return;
    if (value === 0) {
      removeFromCart(index);
      return;
    }
    setCart((prev) => {
      const updated = [...prev];
      const item = updated[index];
      if (item.product.productType === 'GENERAL') {
        item.quantityM2 = round2(value);
        item.boxesCount = item.product.baseUnit === 'BOX' ? value : 0;
        item.piecesCount = item.product.baseUnit === 'PIECE' ? value : 0;
        return updated;
      }
      const metersPerBox = item.product.metersPerBox || 1.44;
      if (item.soldBy === 'BOX') {
        item.boxesCount = round2(value);
        item.quantityM2 = round2(value * metersPerBox);
        item.piecesCount = CeramicMath.calculatePiecesFromBoxes(item.boxesCount, item.product.piecesPerBox || 4);
      } else {
        item.quantityM2 = round2(value);
        item.boxesCount = CeramicMath.calculateBoxes(value, metersPerBox, true);
        item.piecesCount = CeramicMath.calculatePiecesFromBoxes(item.boxesCount, item.product.piecesPerBox || 4);
      }
      return updated;
    });
  };

  const stepCartQuantity = (index: number, direction: 1 | -1) => {
    const item = cart[index];
    if (!item) return;
    if (item.product.productType === 'GENERAL') {
      const step = item.product.baseUnit === 'BOX' || item.product.baseUnit === 'PIECE' || item.product.baseUnit === 'SET' ? 1 : 0.01;
      updateCartQuantity(index, round2(item.quantityM2 + direction * step));
      return;
    }
    const metersPerBox = item.product.metersPerBox || 1.44;
    if (item.soldBy === 'BOX') {
      updateCartQuantity(index, round2(item.boxesCount + direction));
    } else {
      updateCartQuantity(index, round2(item.quantityM2 + direction * metersPerBox));
    }
  };

  const updateCartUnit = (index: number, unit: PosUnit) => {
    setCart((prev) => {
      const updated = [...prev];
      const item = { ...updated[index] };
      if (item.soldBy !== unit) {
        if (item.product.productType === 'GENERAL') return prev;
        const metersPerBox = item.product.metersPerBox || 1.44;
        item.soldBy = unit;
        item.unitPrice = unit === 'BOX'
          ? round2(item.unitPrice * metersPerBox)
          : round2(item.unitPrice / metersPerBox);
        updated[index] = item;
      }
      return updated;
    });
  };

  const updateCartPrice = (index: number, value: number) => {
    if (!can('sales.approve')) {
      notify('لا تملك صلاحية تعديل سعر الصنف', 'error');
      return;
    }
    setCart((prev) => {
      const updated = [...prev];
      const item = updated[index];
      if (item.product.productType === 'GENERAL') {
        item.unitPrice = round2(value);
        return updated;
      }
      const metersPerBox = item.product.metersPerBox || 1.44;
      item.unitPrice = item.soldBy === 'BOX'
        ? round2(value / metersPerBox)
        : round2(value);
      return updated;
    });
  };

  const updateCartLineDiscount = (index: number, value: number) => {
    setCart((prev) => {
      const updated = [...prev];
      const item = { ...updated[index] };
      item.discountAmount = Math.min(item.quantityM2 * item.unitPrice, Math.max(0, round2(Number.isFinite(value) ? value : 0)));
      updated[index] = item;
      return updated;
    });
  };

  const removeFromCart = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  const clearCart = () => {
    if (cart.length === 0) return;
    if (!window.confirm('هل تريد إفراغ سلة البيع بالكامل؟')) return;
    setCart([]);
    setDiscountAmount(0);
    setShippingCost(0);
    setNotes('');
    setPaidAmount(0);
  };

  // ── Totals ──────────────────────────────────────────────────────────────────
  const lineSubtotal = round2(cart.reduce((sum, item) => sum + item.quantityM2 * item.unitPrice, 0));
  const lineDiscountTotal = round2(cart.reduce((sum, item) => sum + item.discountAmount, 0));
  const subtotal = round2(lineSubtotal - lineDiscountTotal);
  const taxableBase = round2(Math.max(0, subtotal - discountAmount));
  const taxAmount = round2(taxableBase * (taxPercentage || 0) / 100);
  const totalAmount = round2(Math.max(0, taxableBase + taxAmount + (shippingCost || 0)));
  const remainingAmount = round2(Math.max(0, totalAmount - (paidAmount || 0)));
  const changeDue = round2(Math.max(0, (paidAmount || 0) - totalAmount));
  const expectedClosingCash = round2((activeShift?.openingBalance || 0) + (activeShift?.totalSalesCash || 0) + (activeShift?.totalCustomerPayments || 0) - (activeShift?.totalSupplierPayments || 0) - (activeShift?.totalExpenses || 0) - (activeShift?.totalRefunds || 0));
  const ceramicCart = cart.filter((item) => item.product.productType !== 'GENERAL');
  const totalItems = round2(ceramicCart.reduce((sum, item) => sum + item.quantityM2, 0));
  const totalBoxes = round2(ceramicCart.reduce((sum, item) => sum + item.boxesCount, 0));
  const generalQuantitiesByUnit = new Map<string, number>();
  cart.filter((item) => item.product.productType === 'GENERAL').forEach((item) => {
    const unit = getProductUnitLabel(item.product);
    generalQuantitiesByUnit.set(unit, (generalQuantitiesByUnit.get(unit) || 0) + item.quantityM2);
  });
  const cartQuantitySummary = [
    totalItems > 0 ? `${totalItems} م² / ${totalBoxes} كرتونة` : '',
    ...[...generalQuantitiesByUnit].map(([unit, quantity]) => `${round2(quantity)} ${unit}`),
  ].filter(Boolean).join(' · ');

  // Cash sales auto-fill the paid amount with the grand total.
  useEffect(() => {
    if (paymentType === 'CASH') setPaidAmount(totalAmount);
    if (paymentType === 'CREDIT') setPaidAmount(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalAmount, paymentType]);

  // ── Barcode / search submit ─────────────────────────────────────────────────
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const term = searchQuery.trim();
    if (!term) return;
    const exact = products.find(
      (p) => p.barcode === term || p.sku.toLowerCase() === term.toLowerCase()
    );
    if (exact) {
      addToCart(exact);
      setSearchQuery('');
      barcodeInputRef.current?.focus();
      notify(`تمت إضافة ${exact.name}`, 'success');
      return;
    }
    if (filteredProducts.length >= 1) {
      addToCart(filteredProducts[0]);
      setSearchQuery('');
      barcodeInputRef.current?.focus();
      notify(`تمت إضافة ${filteredProducts[0].name}`, 'success');
      return;
    }
    notify(`لا يوجد صنف مطابق للباركود: ${term}`, 'error');
  };

  // ── Customers ───────────────────────────────────────────────────────────────
  const handleCreateCustomer = () => {
    if (!can('customers.create')) {
      notify('لا تملك صلاحية إضافة عميل', 'error');
      return;
    }
    if (!newCustName.trim() || !newCustPhone.trim()) {
      notify('يرجى إدخال اسم العميل ورقم الهاتف', 'error');
      return;
    }
    try {
      const normalizedPhone = newCustPhone.trim().replace(/\s+/g, '');
      if (customers.some((customer) => (customer.phone || '').replace(/\s+/g, '') === normalizedPhone)) {
        setCustomerError('رقم الهاتف مرتبط بعميل موجود. ابحث عنه واختره بدلاً من إنشاء سجل مكرر.');
        return;
      }
      const created = customerService.createCustomer({
        code: '',
        name: newCustName.trim(),
        phone: newCustPhone.trim(),
        customerType: newCustType,
        creditLimit: newCustCredit || 0,
        currentBalance: 0,
        totalPurchases: 0
      } as any);
      const all = customerService.getAllCustomers();
      setCustomers(all);
      setSelectedCustomer(created);
      applyCustomerPricing(created);
      setIsCustomerModalOpen(false);
      setCustomerError('');
      setNewCustName('');
      setNewCustPhone('');
      setNewCustCredit(0);
      setNewCustType('RETAIL');
      notify(`تم إنشاء العميل: ${created.name}`, 'success');
    } catch (e: any) {
      notify(e.message || 'تعذر إنشاء العميل', 'error');
    }
  };

  // ── Held orders ─────────────────────────────────────────────────────────────
  const persistHeld = (orders: HeldOrder[]) => {
    setHeldOrders(orders);
    try {
      localStorage.setItem(HELD_STORAGE_KEY, JSON.stringify(orders));
    } catch {
      /* storage full — ignore */
    }
  };

  const holdCurrentOrder = () => {
    if (cart.length === 0) {
      notify('لا يوجد أصناف لتعليقها', 'error');
      return;
    }
    const hold: HeldOrder = {
      id: `hold_${Date.now()}`,
      label: `طلب معلّق (${new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })})`,
      createdAt: new Date().toISOString(),
      customerId: selectedCustomer?.id || '',
      customerName: selectedCustomer?.name || 'عميل نقدي',
      warehouseId: selectedWarehouseId,
      items: cart,
      discountAmount,
      shippingCost,
      notes,
      paidAmount,
      paymentType
    };
    persistHeld([hold, ...heldOrders]);
    setCart([]);
    setDiscountAmount(0);
    setShippingCost(0);
    setNotes('');
    notify('تم تعليق الطلب وإمكانية استرجاعه لاحقاً', 'success');
  };

  const resumeHeldOrder = (order: HeldOrder) => {
    const cust = customers.find((c) => c.id === order.customerId) || null;
    setSelectedCustomer(cust);
    if (order.warehouseId) setSelectedWarehouseId(order.warehouseId);
    setCart(order.items);
    setDiscountAmount(order.discountAmount || 0);
    setShippingCost(order.shippingCost || 0);
    setNotes(order.notes || '');
    setPaidAmount(order.paidAmount || 0);
    setPaymentType(order.paymentType || 'CASH');
    persistHeld(heldOrders.filter((h) => h.id !== order.id));
    setIsHeldModalOpen(false);
    notify(`تم استرجاع الطلب: ${order.customerName}`, 'success');
  };

  const deleteHeldOrder = (id: string) => {
    persistHeld(heldOrders.filter((h) => h.id !== id));
  };

  // ── Shifts ──────────────────────────────────────────────────────────────────
  const handleOpenShift = () => {
    if (!can('cashier.shift')) {
      notify('غير مصرح لك بفتح وردية كاشير', 'error');
      return;
    }
    try {
      const shift = cashierService.openShift(
        shiftRegisterId,
        currentUser?.id || 'usr_admin',
        openingBalance || 0
      );
      setActiveShift(shift);
      setIsShiftModalOpen(false);
      setOpeningBalance(0);
      notify(`تم فتح الوردية ${shift.shiftNumber}`, 'success');
    } catch (e: any) {
      notify(e.message || 'تعذر فتح الوردية', 'error');
    }
  };

  const handleCloseShift = () => {
    if (!activeShift) return;
    if (!can('cashier.shift')) {
      notify('غير مصرح لك بإغلاق وردية الكاشير', 'error');
      return;
    }
    try {
      cashierService.closeShift(activeShift.id, Math.max(0, closingCash), closingNotes, currentUser?.id || 'usr_admin');
      setActiveShift(null);
      setIsCloseShiftModalOpen(false);
      setClosingCash(0);
      setClosingNotes('');
      notify('تم إغلاق الوردية وحفظ فرق الصندوق', 'success');
    } catch (e: any) {
      notify(e.message || 'تعذر إغلاق الوردية', 'error');
    }
  };

  // ── Checkout ────────────────────────────────────────────────────────────────
  const handleCheckout = useCallback(() => {
    if (isProcessing) return;
    if (cart.length === 0) {
      notify('السلة فارغة، أضف أصنافاً أولاً', 'error');
      return;
    }
    if (!selectedCustomer) {
      notify('يرجى اختيار العميل', 'error');
      return;
    }
    if (!selectedWarehouseId) {
      notify('يرجى اختيار المخزن', 'error');
      return;
    }
    if (!can('sales.create')) {
      notify('لا تملك صلاحية إنشاء فاتورة بيع', 'error');
      return;
    }
    if (remainingAmount > 0 && !can('sales.credit')) {
      notify('لا تملك صلاحية البيع الآجل أو ترك مبلغ متبقٍ', 'error');
      return;
    }

    // Stock guard (respects the negative-stock setting)
    const allowNegative = settings?.enableNegativeStock ?? false;
    if (!allowNegative) {
      for (const item of cart) {
        const available = stockOf(item.product.id);
        if (item.quantityM2 > available) {
          notify(
            `الرصيد المتاح من «${item.product.name}» ${formatProductQuantity(available, item.product)} فقط، والمطلوب ${formatProductQuantity(item.quantityM2, item.product)}`,
            'error'
          );
          return;
        }
      }
    }

    // Minimum price guard (requires sales.approve)
    for (const item of cart) {
      const min = item.product.minSellingPriceM2 || 0;
      if (min > 0 && item.unitPrice < min && !can('sales.approve')) {
        notify(`سعر «${item.product.name}» أقل من الحد الأدنى المسموح (${min}). يلزم اعتماد المسؤول`, 'error');
        return;
      }
    }

    // Discount guard + approval threshold
    const totalDiscount = round2(discountAmount + lineDiscountTotal);
    if (totalDiscount > 0 && !can('sales.discount')) {
      notify('غير مصرح لك بمنح خصم على الفاتورة', 'error');
      return;
    }
    if (totalDiscount > 0) {
      const discountPercent = lineSubtotal > 0 ? (totalDiscount / lineSubtotal) * 100 : 0;
      const threshold = settings?.discountApprovalThresholdPercent ?? 10;
      if (discountPercent > threshold && !can('sales.approve')) {
        try {
          const request = new ApprovalService().createRequest({
            requestType: 'DISCOUNT',
            title: `اعتماد خصم ${discountPercent.toFixed(1)}% على فاتورة بيع`,
            description: `العميل: ${selectedCustomer.name} — قيمة الخصم ${totalDiscount} ج.م من إجمالي ${lineSubtotal} ج.م (الحد المسموح ${threshold}%).`,
            requestedValue: totalDiscount,
            currentValue: lineSubtotal,
            priority: 'HIGH',
            referenceType: 'POS',
          });
          notify(`الخصم يتجاوز الحد المسموح (${threshold}%). تم إرسال طلب اعتماد رقم ${request.requestNumber}`, 'warning');
        } catch (error: any) {
          notify(error?.message || 'الخصم يتجاوز الحد المسموح ويلزم اعتماد المسؤول', 'error');
        }
        return;
      }
    }

    // Credit limit guard
    if (remainingAmount > 0 && selectedCustomer.creditLimit > 0) {
      const projected = round2((selectedCustomer.currentBalance || 0) + remainingAmount);
      if (projected > selectedCustomer.creditLimit) {
        notify(
          `تجاوز حد الائتمان للعميل. الرصيد الحالي ${selectedCustomer.currentBalance} + الآجل ${remainingAmount} > الحد ${selectedCustomer.creditLimit}`,
          'error'
        );
        return;
      }
    }

    if (!activeShift) {
      const proceed = window.confirm(
        'لا توجد وردية كاشير مفتوحة. سيتم تسجيل الفاتورة بدون ربطها بوردية. هل تريد المتابعة؟'
      );
      if (!proceed) return;
    }

    try {
      setIsProcessing(true);

      // ── Tone/Shade mixing guard ─────────────────────────────────────────────
      // Only run when not already bypassed via the warning modal
      if (!pendingCheckout) {
        const checkItems = cart
          .filter((ci) => ci.product.productType !== 'GENERAL')
          .map((ci) => ({
            productId:   ci.product.id,
            productName: ci.product.name,
            warehouseId: selectedWarehouseId,
            quantityM2:  ci.quantityM2,
          }));
        if (checkItems.length > 0) {
          const conflicts = batchService.checkToneMixing(checkItems);
          if (conflicts.length > 0) {
            setToneConflicts(conflicts);
            setIsToneWarningOpen(true);
            setIsProcessing(false);
            return; // wait for user to confirm or cancel
          }
        }
      }
      setPendingCheckout(false);
      // ── End tone guard ──────────────────────────────────────────────────────

      const invoice = salesService.createSale({
        customerId: selectedCustomer.id,
        warehouseId: selectedWarehouseId,
        shiftId: activeShift?.id,
        items: cart.map((item) => ({
          productId: item.product.id,
          soldBy: item.soldBy,
          quantityM2: item.quantityM2,
          boxesCount: item.boxesCount,
          piecesCount: item.piecesCount,
          unitPrice: item.unitPrice,
          unitCost: item.product.costPrice,
          discountAmount: item.discountAmount
        })),
        discountAmount,
        taxPercentage,
        taxAmount,
        shippingCost,
        paidAmount,
        paymentType,
        notes,
        performedBy: currentUser?.id || 'usr_admin'
      });

      setSuccessInvoice(invoice);
      setCart([]);
      setDiscountAmount(0);
      setShippingCost(0);
      setNotes('');
      setPaidAmount(0);
      setPendingCheckout(false);
      setProducts(productService.getAllProducts());
      if (selectedWarehouseId) loadStock(selectedWarehouseId);
      setActiveShift(cashierService.getActiveShift());
      notify(`تم إصدار الفاتورة ${invoice.invoiceNumber} بنجاح`, 'success');
    } catch (e: any) {
      notify(e.message || 'خطأ أثناء حفظ الفاتورة', 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [
    cart, selectedCustomer, selectedWarehouseId, settings, stockOf, can, isProcessing,
    discountAmount, lineDiscountTotal, remainingAmount, activeShift, taxPercentage,
    taxAmount, shippingCost, paidAmount, paymentType, notes, currentUser,
    salesService, batchService, productService, cashierService, loadStock, notify,
    pendingCheckout,
  ]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  const openInvoicePreview = (inv: any) => {
    if (!inv) return;
    const excel = {
      title: `فاتورة مبيعات ${inv.invoiceNumber}`,
      subtitle: `${inv.customerName || 'عميل نقدي'} • ${inv.date}`,
      columns: [
        { key: 'idx', label: '#' },
        { key: 'product', label: 'الصنف' },
        { key: 'sku', label: 'الكود' },
        { key: 'qty', label: 'الكمية' },
        { key: 'boxes', label: 'الكراتين' },
        { key: 'price', label: 'سعر الوحدة' },
        { key: 'discount', label: 'الخصم' },
        { key: 'total', label: 'الإجمالي' },
      ],
      rows: (inv.items || []).map((item: any, idx: number) => ({
        idx: idx + 1,
        product: item.productName,
        sku: item.productSku || '',
        qty: formatProductQuantity(item.quantityM2, item),
        boxes: item.productType === 'GENERAL' ? '' : item.boxesCount,
        price: item.unitPrice,
        discount: item.discountAmount,
        total: item.totalPrice,
      })),
      fileName: `invoice-${inv.invoiceNumber}`,
    };
    setInvoicePreview({
      title: `معاينة الفاتورة ${inv.invoiceNumber}`,
      subtitle: `${inv.customerName || 'عميل نقدي'} • ${inv.date} • ${CeramicMath.formatCurrency(inv.totalAmount)}`,
      fileName: `invoice-${inv.invoiceNumber}`,
      html: printService.getInvoiceHtml(inv),
      excel: () => exportToExcel(excel),
      whatsapp: inv.customerPhone ? () => {
        const phone = String(inv.customerPhone).replace(/[^0-9]/g, '');
        const text = encodeURIComponent(
          `فاتورة مبيعات ${inv.invoiceNumber}\nالإجمالي: ${CeramicMath.formatCurrency(inv.totalAmount)}\n` +
          `المدفوع: ${CeramicMath.formatCurrency(inv.paidAmount)}\n` +
          (inv.remainingAmount > 0 ? `المتبقي: ${CeramicMath.formatCurrency(inv.remainingAmount)}\n` : '') +
          `شكراً لتعاملكم معنا.`
        );
        window.open(phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`, '_blank');
      } : undefined,
    });
  };

  const latest = useRef<any>({});
  latest.current = { handleCheckout, cart, isCalculatorOpen, isCustomerModalOpen, isHeldModalOpen, isShortcutsOpen, isShiftModalOpen, successInvoice };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const s = latest.current;
      const target = e.target as HTMLElement | null;
      const isTyping = !!target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      if (isTyping && !['F1', 'F8', 'Escape'].includes(e.key)) return;
      if (e.key === 'F2') {
        e.preventDefault();
        barcodeInputRef.current?.focus();
      } else if (e.key === 'F4') {
        e.preventDefault();
        paidInputRef.current?.focus();
      } else if (e.key === 'F8') {
        e.preventDefault();
        setIsCalculatorOpen((v) => !v);
      } else if (e.key === 'F9') {
        e.preventDefault();
        s.handleCheckout();
      } else if (e.key === 'F1') {
        e.preventDefault();
        setIsShortcutsOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setIsCalculatorOpen(false);
        setIsCustomerModalOpen(false);
        setIsHeldModalOpen(false);
        setIsShortcutsOpen(false);
        setIsShiftModalOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Render helpers ──────────────────────────────────────────────────────────
  const gradeLabel = (grade: Product['grade']) =>
    grade === 'GRADE_1' ? 'فرز أول' : grade === 'GRADE_2' ? 'فرز ثاني' : grade === 'GRADE_3' ? 'فرز ثالث' : 'تجاري';

  const paymentLabel = (type: PaymentType) => ({ CASH: 'نقدي', CARD: 'بطاقة', BANK_TRANSFER: 'تحويل بنكي', CHEQUE: 'شيك', CREDIT: 'آجل', MIXED: 'دفع مختلط' }[type]);

  const toastColor: Record<Toast['type'], string> = {
    success: 'bg-emerald-600 border-emerald-400',
    error: 'bg-rose-600 border-rose-400',
    info: 'bg-sky-600 border-sky-400',
    warning: 'bg-amber-500 border-amber-400'
  };

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-slate-50 text-slate-900 max-[900px]:flex-col" dir="rtl">
      {/* ═══ Left: Catalog ═══ */}
      <div className="flex-1 flex flex-col overflow-hidden border-l border-slate-200 min-w-0">
        {/* Header / shift bar */}
        <div className="px-4 py-3 bg-white border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
              <ShoppingCart className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-black text-slate-900 leading-tight">نقطة البيع السريعة</h1>
              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                {activeShift ? (
                  <>
                    <span className="flex items-center gap-1 text-emerald-600 font-bold">
                      <Unlock className="w-3 h-3" /> وردية مفتوحة
                    </span>
                    <span className="font-mono">{activeShift.shiftNumber}</span>
                    <span>•</span>
                    <span>{activeShift.registerName}</span>
                  </>
                ) : (
                  <span className="flex items-center gap-1 text-amber-600 font-bold">
                    <Lock className="w-3 h-3" /> لا توجد وردية مفتوحة
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {activeShift && (
              <>
                <div className="hidden xl:flex items-center gap-3 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px]">
                  <span className="text-slate-500">كاش الوردية:</span>
                  <span className="font-black text-emerald-600">{CeramicMath.formatCurrency(activeShift.totalSalesCash)}</span>
                  <span className="text-slate-500">بطاقة:</span>
                  <span className="font-black text-sky-600">{CeramicMath.formatCurrency(activeShift.totalSalesCard)}</span>
                </div>
                {can('cashier.shift') && <button onClick={() => { setClosingCash(expectedClosingCash); setIsCloseShiftModalOpen(true); }} className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition"><Lock className="w-4 h-4" /> إغلاق الوردية</button>}
              </>
            )}
            {!activeShift && (
              <button
                onClick={() => {
                  setOpeningBalance(cashierService.getSuggestedOpeningBalance(shiftRegisterId));
                  setIsShiftModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-600 border border-emerald-500/30 rounded-xl text-xs font-bold transition"
              >
                <Unlock className="w-4 h-4" /> فتح وردية
              </button>
            )}
            <button
              onClick={() => navigate('/cashboxes')}
              className="hidden md:flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition"
            >
              <Wallet className="w-4 h-4" /> الخزينة
            </button>
            <button
              onClick={() => setIsHeldModalOpen(true)}
              className="relative flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition"
            >
              <PauseCircle className="w-4 h-4" /> المعلّقة
              {heldOrders.length > 0 && (
                <span className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-black flex items-center justify-center">
                  {heldOrders.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setIsShortcutsOpen(true)}
              title="اختصارات لوحة المفاتيح (F1)"
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition"
            >
              <Keyboard className="w-4 h-4" /> F1
            </button>
          </div>
        </div>

        {/* Search + filters */}
        <div className="px-4 py-3 bg-white border-b border-slate-200 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <form onSubmit={handleSearchSubmit} className="flex-1 min-w-[220px] relative">
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                ref={barcodeInputRef}
                autoFocus
                type="text"
                placeholder="امسح الباركود أو ابحث بالاسم/الكود/المقاس (F2)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-900"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </form>

              <select
              value={selectedWarehouseId}
              onChange={(e) => { setSelectedWarehouseId(e.target.value); loadStock(e.target.value); }}
              className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-sky-500"
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>المخزن: {w.name}</option>
              ))}
            </select>

            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-sky-500"
            >
              <option value="NAME">ترتيب: الاسم</option>
              <option value="PRICE_ASC">الأرخص أولاً</option>
              <option value="PRICE_DESC">الأغلى أولاً</option>
              <option value="STOCK_DESC">الأكثر رصيداً</option>
            </select>

            <button
              type="button"
              onClick={() => setInStockOnly((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold border transition ${
 inStockOnly
 ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30'
 : 'bg-slate-50 border-slate-200 hover:border-slate-300'
 }`}
            >
              <Package className="w-4 h-4" /> المتوفر فقط
            </button>

            <select value={selectedBrand} onChange={(e) => setSelectedBrand(e.target.value)} className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800">
              <option value="ALL">كل الماركات</option>{visibleBrands.map(([id, name]) => <option key={id} value={id}>{name || 'بدون ماركة'}</option>)}
            </select>
            <select value={selectedGrade} onChange={(e) => setSelectedGrade(e.target.value)} className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800">
              <option value="ALL">كل الأنواع والفرز</option><option value="GRADE_1">فرز أول</option><option value="GRADE_2">فرز ثاني</option><option value="GRADE_3">فرز ثالث</option><option value="COMMERCIAL">تجاري</option>
            </select>
            <select value={selectedSize} onChange={(e) => setSelectedSize(e.target.value)} className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800">
              <option value="ALL">كل المقاسات</option>{visibleSizes.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
            {visibleColors.length > 0 && <select value={selectedColor} onChange={(e) => setSelectedColor(e.target.value)} className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800">
              <option value="ALL">كل الألوان</option>{visibleColors.map((color) => <option key={color} value={color}>{color}</option>)}
            </select>}

            <button
              type="button"
              onClick={() => setIsCalculatorOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 border border-amber-500/30 rounded-xl text-xs font-bold transition"
            >
              <Calculator className="w-4 h-4" /> حاسبة المقايسة (F8)
            </button>
          </div>

          {/* Category chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <button
              onClick={() => setSelectedCategory('ALL')}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition ${
                selectedCategory === 'ALL'
 ? 'bg-sky-600 text-white border-sky-500 shadow-sm'
 : 'bg-slate-50 border-slate-200 hover:border-slate-300'
 }`}
            >
              <Layers className="w-3.5 h-3.5 inline ml-1" />
              الكل ({products.length})
            </button>
            {visibleCategories.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCategory(c.id)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition ${
                selectedCategory === c.id
 ? 'bg-sky-600 text-white border-sky-500 shadow-sm'
 : 'bg-slate-50 border-slate-200 hover:border-slate-300'
 }`}
              >
                {c.name} ({c.productCount})
              </button>
            ))}
          </div>
        </div>

        {/* Product grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredProducts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-500">
              <Search className="w-12 h-12 mb-3 opacity-40" />
              <p className="font-bold">لا توجد أصناف مطابقة</p>
              <p className="text-xs mt-1">جرّب تغيير كلمة البحث أو الفلتر</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
              {filteredProducts.map((p) => {
                const available = stockOf(p.id);
                const isLow = p.minStockLevel > 0 && available <= p.minStockLevel;
                const inCart = cart.find((c) => c.product.id === p.id);
                return (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => addToCart(p)}
                    aria-label={`إضافة ${p.name} إلى السلة`}
                    className="relative text-right bg-white p-3 rounded-2xl border border-slate-200 hover:border-sky-500 hover:shadow-md focus-visible:ring-2 focus-visible:ring-sky-500 cursor-pointer transition flex flex-col justify-between group overflow-hidden min-h-[154px]"
                  >
                    {inCart && (
                      <span className="absolute top-0 left-0 bg-sky-600 text-white text-[10px] font-black px-2 py-0.5 rounded-br-xl">
                        في السلة: {formatProductQuantity(inCart.quantityM2, p)}
                      </span>
                    )}
                    <div>
                      {p.imagePath && <img src={p.imagePath} alt={p.name} loading="lazy" className="w-full h-24 object-cover rounded-xl mb-2 bg-slate-100" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-600">
                          {p.productType === 'GENERAL' ? getProductUnitLabel(p) : gradeLabel(p.grade)}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">{p.size || p.sku}</span>
                      </div>
                      <h3 className="font-bold text-xs text-slate-900 line-clamp-2 group-hover:text-sky-600 transition min-h-[2rem]">
                        {p.name}
                      </h3>
                      {p.productType !== 'GENERAL' && <div className="text-[10px] text-slate-500 mt-1">
                        الكرتونة: {p.metersPerBox} م² ({p.piecesPerBox} قطع)
                      </div>}
                      {(p.brandName || p.color) && (
                        <div className="text-[10px] text-slate-500 truncate">{[p.brandName, p.color].filter(Boolean).join(' • ')}</div>
                      )}
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-200 flex items-center justify-between">
                      <div className="text-xs font-black text-sky-600">
                        {CeramicMath.formatCurrency(p.sellingPriceM2)}
                        <span className="text-[10px] text-slate-500 font-normal"> /{getProductUnitLabel(p)}</span>
                      </div>
                      <div className={`text-[10px] font-bold ${isLow ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {formatProductQuantity(available, p)}
                      </div>
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-1 text-[10px] font-bold text-sky-700">
                      <span className="flex items-center gap-1"><Plus className="w-3 h-3" /> إضافة للسلة</span>
                      {inCart && <span className="text-slate-500">{formatProductQuantity(inCart.quantityM2, p)}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ═══ Right: Cart & Checkout ═══ */}
      <div className="w-[26rem] max-w-[90vw] bg-white flex flex-col h-full border-r border-slate-200 shadow-2xl shrink-0 max-[900px]:w-full max-[900px]:max-w-none max-[900px]:h-[48%] max-[900px]:border-t max-[900px]:border-r-0">
        {/* Customer selector */}
        <div className="p-3 border-b border-slate-200 space-y-2 bg-slate-50/70">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span className="flex items-center gap-1"><UserPlus className="w-3.5 h-3.5" /> العميل</span>
          {can('customers.create') && <button
            onClick={() => { setCustomerError(''); setIsCustomerModalOpen(true); }}
            className="text-[11px] text-sky-600 hover:text-sky-700"
          >+ عميل جديد</button>}
          </div>
          <div className="relative">
            <input
              value={selectedCustomer ? selectedCustomer.name : customerSearch}
              onChange={(e) => { setCustomerSearch(e.target.value); setSelectedCustomer(null); }}
              placeholder="ابحث عن عميل بالاسم أو الهاتف..."
              className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:border-sky-500"
            />
            {!selectedCustomer && customerSearch.trim() && (
              <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-slate-50 border border-slate-200 rounded-xl shadow-2xl">
                {filteredCustomers.length === 0 ? (
                  <div className="p-3 text-[11px] text-slate-500">لا نتائج</div>
                ) : (
                  filteredCustomers.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => { setSelectedCustomer(c); applyCustomerPricing(c); setCustomerSearch(''); }}
                      className="w-full text-right px-3 py-2 hover:bg-slate-100 text-xs text-slate-800 border-b border-slate-200 last:border-0"
                    >
                      <div className="font-bold">{c.name}</div>
                      <div className="text-[10px] text-slate-500">{c.phone} {c.currentBalance > 0 ? `• مديونية ${c.currentBalance}` : ''}</div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          {selectedCustomer && (
            <div className="flex items-center justify-between text-[11px] bg-white rounded-lg px-2.5 py-1.5 border border-slate-200">
              <span className="text-slate-500">{selectedCustomer.customerType === 'WHOLESALE' ? 'جملة' : selectedCustomer.customerType === 'CONTRACTOR' ? 'مقاول' : selectedCustomer.customerType === 'ENGINEER' ? 'مهندس' : 'قطاعي'}</span>
              <span className={selectedCustomer.currentBalance > 0 ? 'text-amber-600 font-bold' : 'text-slate-500'}>
                الرصيد: {CeramicMath.formatCurrency(selectedCustomer.currentBalance)}
              </span>
            </div>
          )}
        </div>

        {/* Cart lines */}
        <div className="px-3 pt-3 pb-2 flex items-center justify-between text-[11px]">
          <span className="font-black text-slate-700">سلة البيع <span className="text-slate-400 font-semibold">({cart.length} أصناف)</span></span>
          {cart.length > 0 && <span className="text-slate-500">{cart.length} بنود{cartQuantitySummary ? ` · ${cartQuantitySummary}` : ''}</span>}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 space-y-2.5">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-600">
              <ShoppingCart className="w-12 h-12 mb-2 opacity-40" />
              <p className="text-xs font-bold">السلة فارغة</p>
              <p className="text-[11px]">انقر على أي صنف لإضافته، أو امسح الباركود</p>
            </div>
          ) : (
            cart.map((item, idx) => {
              const metersPerBox = item.product.metersPerBox || 1.44;
              const lineTotal = round2(item.quantityM2 * item.unitPrice - item.discountAmount);
              const isGeneral = item.product.productType === 'GENERAL';
              const displayQty = !isGeneral && item.soldBy === 'BOX' ? item.boxesCount : item.quantityM2;
              const displayPrice = !isGeneral && item.soldBy === 'BOX' ? round2(item.unitPrice * metersPerBox) : item.unitPrice;
              const overStock = item.quantityM2 > item.availableStockM2 && !(settings?.enableNegativeStock);
              return (
                <div
                  key={item.product.id}
                  className={`bg-white p-2.5 rounded-xl border text-xs space-y-2 ${overStock ? 'border-rose-500/50' : 'border-slate-200/80'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 line-clamp-1">{item.product.name}</div>
                      <div className="text-[10px] text-slate-500">
                        {isGeneral ? `الوحدة: ${getProductUnitLabel(item.product)}` : `${item.product.size} • ${gradeLabel(item.product.grade)}`} • متاح {formatProductQuantity(item.availableStockM2, item.product)}
                      </div>
                    </div>
                    <button
                      onClick={() => removeFromCart(idx)}
                      className="text-slate-500 hover:text-rose-600 transition shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {overStock && (
                    <div className="text-[10px] text-rose-600 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> الكمية تتجاوز الرصيد المتاح
                    </div>
                  )}

                  {/* Unit toggle */}
                  {!isGeneral && <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => updateCartUnit(idx, 'M2')}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border ${item.soldBy === 'M2' ? 'bg-sky-600 text-slate-900 border-sky-500' : 'bg-white border-slate-200'}`}
                    >م²</button>
                    <button
                      type="button"
                      onClick={() => updateCartUnit(idx, 'BOX')}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border ${item.soldBy === 'BOX' ? 'bg-sky-600 text-slate-900 border-sky-500' : 'bg-white border-slate-200'}`}
                    >كرتونة</button>
                    <span className="text-[10px] text-slate-500 mr-auto">
                      {item.piecesCount} قطعة • {item.boxesCount} كرتونة
                    </span>
                  </div>}

                  {/* Quantity + price */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5">
                      <button
                        onClick={() => stepCartQuantity(idx, -1)}
                        className="w-6 h-6 flex items-center justify-center text-slate-500 hover:bg-slate-100 rounded"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <input
                        type="number"
                        step={isGeneral
                          ? item.product.baseUnit === 'BOX' || item.product.baseUnit === 'PIECE' || item.product.baseUnit === 'SET' ? 1 : 0.01
                          : item.soldBy === 'BOX' ? 1 : 0.01}
                        value={displayQty}
                        onChange={(e) => { if (e.target.value !== '') updateCartQuantity(idx, parseFloat(e.target.value)); }}
                        className="w-14 text-center font-bold bg-transparent focus:outline-none text-xs text-slate-900"
                      />
                      <button
                        onClick={() => stepCartQuantity(idx, 1)}
                        className="w-6 h-6 flex items-center justify-center text-slate-500 hover:bg-slate-100 rounded"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={displayPrice}
                        onChange={(e) => { if (e.target.value !== '') updateCartPrice(idx, parseFloat(e.target.value)); }}
                        className="w-16 text-center font-bold bg-white border border-slate-200 rounded-lg p-1 text-xs text-slate-900"
                      />
                      <span className="text-[10px] text-slate-500">ج.م</span>
                      <span className="text-[10px] text-slate-500">/{isGeneral ? getProductUnitLabel(item.product) : item.soldBy === 'BOX' ? 'كرتونة' : 'م²'}</span>
                    </div>

                    <div className="font-black text-sky-600 w-20 text-left">{CeramicMath.formatCurrency(lineTotal)}</div>
                  </div>

                  {/* Line discount */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500">خصم الصنف</span>
                    <input
                      type="number"
                      value={item.discountAmount || ''}
                      placeholder="0"
                      onChange={(e) => updateCartLineDiscount(idx, e.target.value === '' ? 0 : parseFloat(e.target.value))}
                      className="w-20 px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-bold text-slate-900"
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Totals & payment */}
        <div className="p-3 border-t border-slate-200 bg-white space-y-3 max-h-[58%] overflow-y-auto shadow-[0_-8px_24px_rgba(15,23,42,0.04)] max-[900px]:max-h-[65%]">
          {/* Order extras */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <label className="text-[10px] font-bold text-slate-500 flex items-center gap-1"><Percent className="w-3 h-3" /> خصم الفاتورة</label>
              <input
                type="number"
                value={discountAmount || ''}
                placeholder="0"
                onChange={(e) => setDiscountAmount(e.target.value === '' ? 0 : Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full px-2 py-1.5 bg-white rounded-lg border border-slate-200 text-xs font-bold text-slate-900 mt-0.5"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 flex items-center gap-1"><Percent className="w-3 h-3" /> ضريبة %</label>
              <input
                type="number"
                value={taxPercentage || ''}
                placeholder="0"
                onChange={(e) => setTaxPercentage(e.target.value === '' ? 0 : Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full px-2 py-1.5 bg-white rounded-lg border border-slate-200 text-xs font-bold text-slate-900 mt-0.5"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 flex items-center gap-1"><Truck className="w-3 h-3" /> مشال / نقل</label>
              <input
                type="number"
                value={shippingCost || ''}
                placeholder="0"
                onChange={(e) => setShippingCost(e.target.value === '' ? 0 : Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full px-2 py-1.5 bg-white rounded-lg border border-slate-200 text-xs font-bold text-slate-900 mt-0.5"
              />
            </div>
          </div>

          {/* Payment type */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 block mb-1">طريقة السداد</label>
            <div className="grid grid-cols-3 gap-1">
              {(['CASH', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT', 'MIXED'] as PaymentType[]).map((type) => {
                const Icon = type === 'CASH' ? Banknote : CreditCard;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setPaymentType(type)}
                    className={`py-1.5 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 ${
 paymentType === type
 ? 'bg-sky-600 text-white'
 : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'
 }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {paymentLabel(type)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Paid amount */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">المبلغ المدفوع (F4):</span>
            <input
              ref={paidInputRef}
              type="number"
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value === '' ? 0 : parseFloat(e.target.value))}
              className="w-32 text-left font-black px-2 py-1.5 bg-white rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-sky-500"
            />
          </div>

          {/* Totals */}
          <div className="bg-sky-500/10 p-3 rounded-xl border border-sky-500/20 space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-500">
              <span>إجمالي البنود ({cart.length} صنف{cartQuantitySummary ? ` / ${cartQuantitySummary}` : ''})</span>
              <span>{CeramicMath.formatCurrency(lineSubtotal)}</span>
            </div>
            {lineDiscountTotal > 0 && (
              <div className="flex justify-between text-rose-600">
                <span>خصومات البنود</span>
                <span>-{CeramicMath.formatCurrency(lineDiscountTotal)}</span>
              </div>
            )}
            {discountAmount > 0 && (
              <div className="flex justify-between text-rose-600">
                <span>خصم الفاتورة</span>
                <span>-{CeramicMath.formatCurrency(discountAmount)}</span>
              </div>
            )}
            {taxAmount > 0 && (
              <div className="flex justify-between text-slate-500">
                <span>ضريبة ({taxPercentage}%)</span>
                <span>+{CeramicMath.formatCurrency(taxAmount)}</span>
              </div>
            )}
            {shippingCost > 0 && (
              <div className="flex justify-between text-slate-500">
                <span>مشال ونقل</span>
                <span>+{CeramicMath.formatCurrency(shippingCost)}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-2 border-t border-sky-500/20">
              <span className="font-bold text-slate-700">صافي الفاتورة</span>
              <span className="text-sky-700 font-black text-xl">{CeramicMath.formatCurrency(totalAmount)} <span className="text-[10px] font-bold">ج.م</span></span>
            </div>
            {remainingAmount > 0 && (
              <div className="flex justify-between font-bold text-amber-600">
                <span>المتبقي (على الحساب)</span>
                <span>{CeramicMath.formatCurrency(remainingAmount)}</span>
              </div>
            )}
            {changeDue > 0 && (
              <div className="flex justify-between font-bold text-emerald-600">
                <span>الباقي للعميل</span>
                <span>{CeramicMath.formatCurrency(changeDue)}</span>
              </div>
            )}
          </div>

          {/* Notes */}
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="ملاحظات على الفاتورة (اختياري)..."
            className="w-full px-3 py-2 bg-white rounded-lg border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-sky-500"
          />

          {/* Actions */}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={holdCurrentOrder}
              disabled={cart.length === 0}
              className="py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-800 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition"
            >
              <PauseCircle className="w-4 h-4" /> تعليق
            </button>
            <button
              onClick={clearCart}
              disabled={cart.length === 0}
              className="py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-800 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition"
            >
              <RotateCcwIcon /> إفراغ
            </button>
            <button
              onClick={() => setIsCalculatorOpen(true)}
              className="py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition"
            >
              <Calculator className="w-4 h-4" /> مقايسة
            </button>
          </div>

          <button
            onClick={handleCheckout}
            disabled={isProcessing || cart.length === 0}
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black rounded-xl shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 transition active:scale-[0.99]"
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>{isProcessing ? 'جاري الحفظ والخصم من المخزن...' : 'اعتماد وحفظ الفاتورة (F9)'}</span>
          </button>
        </div>
      </div>

      {/* ═══ Toast ═══ */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-xl border text-slate-900 text-xs font-bold shadow-2xl flex items-center gap-2 ${toastColor[toast.type]}`}>
          {toast.type === 'error' ? <AlertCircle className="w-4 h-4" /> : toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <Info className="w-4 h-4" />}
          {toast.message}
        </div>
      )}

      {/* ═══ Success modal ═══ */}
      {successInvoice && (
        <div className="fixed inset-0 bg-white backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h3 className="text-lg font-black text-slate-900">تم إصدار الفاتورة بنجاح</h3>
            <div className="text-xs text-slate-500 space-y-1">
              <p>رقم الفاتورة: <strong className="font-mono text-slate-800">{successInvoice.invoiceNumber}</strong></p>
              <p>الإجمالي: <strong className="text-sky-600">{CeramicMath.formatCurrency(successInvoice.totalAmount)}</strong></p>
              {successInvoice.remainingAmount > 0 && (
                <p>المتبقي: <strong className="text-amber-600">{CeramicMath.formatCurrency(successInvoice.remainingAmount)}</strong></p>
              )}
              <p className="text-[11px]">تم خصم الكميات من المخزن وتحديث حساب العميل آلياً.</p>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1">
              <button
                onClick={() => printService.printThermalReceipt(successInvoice)}
                className="py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5"
              >
                <Receipt className="w-4 h-4" /> إيصال حراري
              </button>
              <button
                onClick={() => openInvoicePreview(successInvoice)}
                className="py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5"
              >
                <Printer className="w-4 h-4" /> معاينة وطباعة
              </button>
              <button
                onClick={() => setSuccessInvoice(null)}
                className="py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Held orders modal ═══ */}
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
        <Modal title="الطلبات المعلّقة" icon={<History className="w-5 h-5" />} onClose={() => setIsHeldModalOpen(false)}>
          {heldOrders.length === 0 ? (
            <div className="text-center text-slate-500 text-xs py-10">لا توجد طلبات معلّقة حالياً</div>
          ) : (
            <div className="space-y-2">
              {heldOrders.map((h) => (
                <div key={h.id} className="bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 truncate">{h.customerName}</div>
                    <div className="text-[10px] text-slate-500">
                      {h.items.length} صفوف • {new Date(h.createdAt).toLocaleString('ar-EG')}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => resumeHeldOrder(h)}
                      className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-[11px] font-bold flex items-center gap-1"
                    >
                      <PlayCircle className="w-3.5 h-3.5" /> استرجاع
                    </button>
                    <button
                      onClick={() => deleteHeldOrder(h.id)}
                      className="p-1.5 text-slate-500 hover:text-rose-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {/* ═══ New customer modal ═══ */}
      {isCustomerModalOpen && (
        <Modal title="إضافة عميل سريع" icon={<UserPlus className="w-5 h-5" />} onClose={() => setIsCustomerModalOpen(false)}>
          <div className="space-y-3">
            <Field label="اسم العميل *">
              <input value={newCustName} onChange={(e) => setNewCustName(e.target.value)} placeholder="مثال: أحمد محمد" className={inputCls} />
            </Field>
            <Field label="رقم الهاتف *">
              <input value={newCustPhone} onChange={(e) => setNewCustPhone(e.target.value)} placeholder="01xxxxxxxxx" className={inputCls} />
            </Field>
            {customerError && <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800">{customerError}</div>}
            <div className="grid grid-cols-2 gap-3">
              <Field label="نوع العميل">
                <select value={newCustType} onChange={(e) => setNewCustType(e.target.value as Customer['customerType'])} className={inputCls}>
                  <option value="RETAIL">قطاعي</option>
                  <option value="WHOLESALE">جملة</option>
                  <option value="CONTRACTOR">مقاول</option>
                  <option value="ENGINEER">مهندس</option>
                </select>
              </Field>
              <Field label="حد الائتمان">
                <input type="number" value={newCustCredit || ''} placeholder="0" onChange={(e) => setNewCustCredit(parseFloat(e.target.value) || 0)} className={inputCls} />
              </Field>
            </div>
            <button
              onClick={handleCreateCustomer}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2"
            >
              <UserPlus className="w-4 h-4" /> حفظ واختيار العميل
            </button>
          </div>
        </Modal>
      )}

      {/* ═══ Open shift modal ═══ */}
      {isShiftModalOpen && (
        <Modal title="فتح وردية كاشير" icon={<Unlock className="w-5 h-5" />} onClose={() => setIsShiftModalOpen(false)}>
          <div className="space-y-3">
            <Field label="الخزينة / نقطة الكاشير">
              <select
                value={shiftRegisterId}
                onChange={(e) => {
                  setShiftRegisterId(e.target.value);
                  setOpeningBalance(cashierService.getSuggestedOpeningBalance(e.target.value));
                }}
                className={inputCls}
              >
                {registers.length === 0 ? (
                  <option value="cr_main">الخزينة الرئيسية</option>
                ) : (
                  registers.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))
                )}
              </select>
            </Field>
            <Field label="الرصيد الافتتاحي (نقدي)">
              <input type="number" value={openingBalance || ''} placeholder="0" onChange={(e) => setOpeningBalance(parseFloat(e.target.value) || 0)} className={inputCls} />
            </Field>
            <button
              onClick={handleOpenShift}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2"
            >
              <Unlock className="w-4 h-4" /> فتح الوردية
            </button>
          </div>
        </Modal>
      )}

      {isCloseShiftModalOpen && activeShift && (
        <Modal title="إقفال الوردية ومطابقة الصندوق" icon={<Lock className="w-5 h-5" />} onClose={() => setIsCloseShiftModalOpen(false)}>
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">رقم الوردية</span><strong>{activeShift.shiftNumber}</strong></div>
              <div className="flex justify-between"><span className="text-slate-500">الرصيد الافتتاحي</span><strong>{CeramicMath.formatCurrency(activeShift.openingBalance)}</strong></div>
              <div className="flex justify-between"><span className="text-slate-500">مبيعات نقدية</span><strong>{CeramicMath.formatCurrency(activeShift.totalSalesCash)}</strong></div>
              <div className="flex justify-between"><span className="text-slate-500">تحصيلات العملاء</span><strong>{CeramicMath.formatCurrency(activeShift.totalCustomerPayments)}</strong></div>
              <div className="flex justify-between"><span className="text-slate-500">مصروفات / مرتجعات</span><strong>{CeramicMath.formatCurrency((activeShift.totalExpenses || 0) + (activeShift.totalRefunds || 0))}</strong></div>
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base"><span className="font-bold">النقد المتوقع بالصندوق</span><strong className="text-emerald-700">{CeramicMath.formatCurrency(expectedClosingCash)}</strong></div>
            </div>
            <Field label="النقد الفعلي بعد العد">
              <input type="number" min="0" step="0.01" value={closingCash} onChange={(e) => setClosingCash(e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)))} className={inputCls} />
            </Field>
            <div className={`rounded-xl px-3 py-2 text-sm font-bold ${round2(closingCash - expectedClosingCash) === 0 ? 'bg-emerald-50 text-emerald-700' : closingCash > expectedClosingCash ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}>
              فرق الصندوق: {CeramicMath.formatCurrency(closingCash - expectedClosingCash)}
            </div>
            <Field label="ملاحظات الإقفال">
              <textarea rows={2} value={closingNotes} onChange={(e) => setClosingNotes(e.target.value)} placeholder="سبب العجز أو الزيادة، إن وجد..." className={inputCls} />
            </Field>
            <button onClick={handleCloseShift} className="w-full py-3 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl">تأكيد عدّ النقد وإغلاق الوردية</button>
          </div>
        </Modal>
      )}

      {/* ═══ Tone/Shade Mixing Warning Modal ═══ */}
      {isToneWarningOpen && toneConflicts.length > 0 && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-amber-200">
            {/* Header */}
            <div className="px-6 py-4 bg-amber-50 border-b border-amber-200 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h2 className="text-sm font-black text-slate-900">تحذير: خلط نغمات ألوان مختلفة</h2>
                <p className="text-xs text-amber-700">الكمية المطلوبة ستُسحب من دفعات بنغمات أو عيارات مختلفة</p>
              </div>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4 max-h-[55vh] overflow-y-auto">
              {toneConflicts.map((conflict) => (
                <div key={conflict.productId} className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <div className="font-bold text-slate-900 text-sm mb-3">{conflict.productName}</div>
                  <div className="space-y-2">
                    {conflict.batches.map((b, i) => (
                      <div key={i} className="flex items-center justify-between bg-white border border-amber-100 rounded-lg px-3 py-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold bg-violet-100 text-violet-700">
                            نغمة: {b.toneShade}
                          </span>
                          {b.caliber && b.caliber !== '0' && (
                            <span className="px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-700">
                              عيار: {b.caliber}
                            </span>
                          )}
                          <span className="font-mono text-slate-500">دفعة: {b.batchNumber}</span>
                        </div>
                        <span className="font-mono font-bold text-sky-700">{b.requiredM2.toFixed(2)} م²</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-amber-700 mt-3">
                    ⚠️ قد يؤدي خلط هذه الدفعات إلى تباين في لون البلاط عند التركيب في موقع العميل.
                  </p>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex gap-3">
              <button
                onClick={() => {
                  setIsToneWarningOpen(false);
                  setToneConflicts([]);
                  setPendingCheckout(false);
                }}
                className="flex-1 px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-sm font-bold transition"
              >
                إلغاء — مراجعة الكميات
              </button>
              <button
                onClick={() => {
                  setIsToneWarningOpen(false);
                  setToneConflicts([]);
                  setPendingCheckout(true); // bypass check on retry
                  // trigger checkout immediately
                  setTimeout(handleCheckout, 0);
                }}
                className="flex-1 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-bold transition"
              >
                متابعة على مسؤوليتي
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Shortcuts modal ═══ */}
      {isShortcutsOpen && (
        <Modal title="اختصارات لوحة المفاتيح" icon={<Keyboard className="w-5 h-5" />} onClose={() => setIsShortcutsOpen(false)}>
          <div className="space-y-1.5 text-xs">
            {[
              ['F1', 'عرض شاشة الاختصارات'],
              ['F2', 'التركيز على حقل البحث / الباركود'],
              ['F4', 'التركيز على المبلغ المدفوع'],
              ['F8', 'فتح حاسبة السيراميك والمقايسة'],
              ['F9', 'اعتماد وحفظ الفاتورة'],
              ['Esc', 'إغلاق النوافذ المفتوحة'],
            ].map(([key, desc]) => (
              <div key={key} className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-3 py-2">
                <span className="text-slate-700">{desc}</span>
                <kbd className="font-mono bg-slate-100 text-sky-700 px-2 py-0.5 rounded text-[11px]">{key}</kbd>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* ═══ Calculator ═══ */}
      <CeramicCalculatorModal
        isOpen={isCalculatorOpen}
        onClose={() => setIsCalculatorOpen(false)}
        products={products}
        onAddToCart={addCalculatedToCart}
      />
    </div>
  );
};

// ─── Small presentational helpers ───────────────────────────────────────────
const inputCls = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-sky-500';

const RotateCcwIcon: React.FC = () => <RefreshCw className="w-4 h-4" />;

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="block text-[11px] font-bold text-slate-500 mb-1">{label}</label>
    {children}
  </div>
);

const Modal: React.FC<{ title: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode }> = ({ title, icon, onClose, children }) => (
  <div className="fixed inset-0 z-50 bg-white backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
    <div
      className="bg-white border border-slate-200 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sky-600">
          {icon}
          <h2 className="text-sm font-black text-slate-900">{title}</h2>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-900">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="p-5 max-h-[70vh] overflow-y-auto">{children}</div>
    </div>
  </div>
);

export default PosView;
