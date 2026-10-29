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
import { AuthService } from '../services/AuthService';
import { BatchService } from '../services/BatchService';
import { CashierService } from '../services/CashierService';
import { HeldOrderService } from '../services/HeldOrderService';
import { PromotionService, AppliedPromotion } from '../services/PromotionService';
import { LoyaltyService } from '../services/LoyaltyService';
import { PrintService } from '../services/PrintService';
import { PricingService } from '../services/PricingService';
import { ApprovalService } from '../services/ApprovalService';
import { PermissionService } from '../services/PermissionService';
import { Product, Customer, Warehouse, CashRegister, CashShift, PaymentType, SystemSettings, ToneMixingConflict } from '../types';
import { CeramicMath } from '../utils/ceramicMath';
import { formatProductQuantity, getProductUnitLabel } from '../utils/productUnits';
import {
  basePriceFromUnitPrice, convertQuantity, fromBaseQuantity, getSellableUnits,
  getUomLabel, isWholeUnit, pricePerUnit, toBaseQuantity,
} from '../utils/uom';
import { buildWhatsAppUrl, openExternalShare } from '../utils/externalLinks';
import { CeramicCalculatorModal } from './CeramicCalculatorModal';
import { DocumentPreviewModal } from './DocumentPreviewModal';
import { exportToExcel } from '../utils/export';
import { LayoutContext } from '../layouts/MainLayout';
import {
  HELD_STORAGE_KEY, round2,
  type CartItem, type HeldOrder, type PosUnit, type SortMode, type Toast,
} from './pos/types';
import {
  CloseShiftModal, HeldOrdersModal, ManagerOverrideModal, NewCustomerModal, OpenShiftModal, PinLoginModal,
  PosToast, ShortcutsModal, SuccessInvoiceModal, ToneWarningModal,
} from './pos/PosModals';

const CUSTOMER_TYPE_LABELS: Record<Customer['customerType'], string> = {
  RETAIL: 'قطاعي',
  CONTRACTOR: 'مقاول',
  WHOLESALE: 'جملة',
  ENGINEER: 'مهندس',
};

interface CartLineProps {
  item: CartItem;
  index: number;
  enableNegativeStock: boolean;
  gradeLabel: (grade: Product['grade']) => string;
  onRemove: (index: number) => void;
  onUpdateUnit: (index: number, unit: PosUnit) => void;
  onStepQuantity: (index: number, direction: 1 | -1) => void;
  onUpdateQuantity: (index: number, value: number) => void;
  onUpdatePrice: (index: number, value: number) => void;
  onUpdateLineDiscount: (index: number, value: number) => void;
}

const getCartQuantityStep = (item: CartItem) =>
  isWholeUnit(item.soldBy, item.product) ? 1 : 0.01;

const getCartPriceUnitLabel = (item: CartItem) => getUomLabel(item.soldBy, item.product);

const CartLine: React.FC<CartLineProps> = ({
  item,
  index,
  enableNegativeStock,
  gradeLabel,
  onRemove,
  onUpdateUnit,
  onStepQuantity,
  onUpdateQuantity,
  onUpdatePrice,
  onUpdateLineDiscount,
}) => {
  const lineTotal = round2(item.quantityM2 * item.unitPrice - item.discountAmount);
  const isGeneral = item.product.productType === 'GENERAL' || item.product.baseUnit === 'SERVICE';
  // General goods and services are not stock-tracked, so an availability
  // shortage must never block their sale from the POS.
  const tracksStock = !isGeneral;
  const sellableUnits = getSellableUnits(item.product);
  const displayPrice = round2(pricePerUnit(item.unitPrice, item.soldBy, item.product));
  const overStock = tracksStock && item.quantityM2 > item.availableStockM2 && !enableNegativeStock;

  return (
    <div
      className={`bg-white p-2.5 rounded-xl border text-xs space-y-2 ${overStock ? 'border-rose-500/50' : 'border-slate-200/80'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-bold text-slate-900 line-clamp-1">{item.product.name}</div>
          <div className="text-[10px] text-slate-500">
            {isGeneral ? `الوحدة الأساسية: ${getProductUnitLabel(item.product)}` : `${item.product.size} • ${gradeLabel(item.product.grade)}`} • متاح {formatProductQuantity(item.availableStockM2, item.product)}
          </div>
        </div>
        <button
          onClick={() => onRemove(index)}
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

      {sellableUnits.length > 1 && <div className="flex flex-wrap items-center gap-1">
        {sellableUnits.map((unit) => (
          <button
            key={unit}
            type="button"
            onClick={() => onUpdateUnit(index, unit)}
            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${item.soldBy === unit ? 'bg-sky-600 text-slate-900 border-sky-500' : 'bg-white border-slate-200'}`}
          >{getUomLabel(unit, item.product)}</button>
        ))}
        <span className="text-[10px] text-slate-500 mr-auto">
          {round2(item.quantityM2)} {getProductUnitLabel(item.product)}
          {item.product?.productType !== 'GENERAL' ? ` • ${item.boxesCount} كرتونة` : ''}
        </span>
      </div>}

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5">
          <button
            onClick={() => onStepQuantity(index, -1)}
            className="w-6 h-6 flex items-center justify-center text-slate-500 hover:bg-slate-100 rounded"
          >
            <Minus className="w-3 h-3" />
          </button>
          <input
            type="number"
            step={getCartQuantityStep(item)}
            value={item.soldQuantity}
            onChange={(e) => { if (e.target.value !== '') onUpdateQuantity(index, Number.parseFloat(e.target.value)); }}
            aria-label={`تغيير الكمية للمنتج ${item.product.name}`}
            className="w-14 text-center font-bold bg-transparent focus:outline-none text-xs text-slate-900"
          />
          <button
            onClick={() => onStepQuantity(index, 1)}
            className="w-6 h-6 flex items-center justify-center text-slate-500 hover:bg-slate-100 rounded"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <input
            type="number"
            value={displayPrice}
            onChange={(e) => { if (e.target.value !== '') onUpdatePrice(index, Number.parseFloat(e.target.value)); }}
            aria-label={`تغيير السعر للمنتج ${item.product.name}`}
            className="w-16 text-center font-bold bg-white border border-slate-200 rounded-lg p-1 text-xs text-slate-900"
          />
          <span className="text-[10px] text-slate-500">ج.م</span>
          <span className="text-[10px] text-slate-500">/{getCartPriceUnitLabel(item)}</span>
        </div>

        <div className="font-black text-sky-600 w-20 text-left">{CeramicMath.formatCurrency(lineTotal)}</div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[10px] text-slate-500">خصم الصنف</span>
        <input
          type="number"
          value={item.discountAmount || ''}
          placeholder="0"
          onChange={(e) => onUpdateLineDiscount(index, e.target.value === '' ? 0 : Number.parseFloat(e.target.value))}
          aria-label={`خصم الصنف ${item.product.name}`}
          className="w-20 px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-bold text-slate-900"
        />
      </div>
    </div>
  );
};

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

  const [heldOrders, setHeldOrders] = useState<HeldOrder[]>([]);
  const heldOrdersRef = useRef<HeldOrder[]>([]);
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
  const promotionService = useMemo(() => new PromotionService(), []);
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
    try {
      const dbRows = heldOrderService.getAll();
      let restored: HeldOrder[] = [];
      if (dbRows.length > 0) {
        restored = dbRows.map((r) => { try { return JSON.parse(r.data) as HeldOrder; } catch { return null; } }).filter(Boolean) as HeldOrder[];
      } else {
        const raw = localStorage.getItem(HELD_STORAGE_KEY);
        if (raw) {
          const parsed: unknown = JSON.parse(raw);
          restored = Array.isArray(parsed) ? parsed as HeldOrder[] : [];
          restored.forEach((h) => heldOrderService.save(h.id, JSON.stringify(h), currentUser?.id));
        }
      }
      heldOrdersRef.current = restored;
      setHeldOrders(restored);
    } catch {
      heldOrdersRef.current = [];
      setHeldOrders([]);
    }
  }, [loadInitialData, heldOrderService, currentUser?.id]);

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
      const tracksStock = p.productType !== 'GENERAL' && p.baseUnit !== 'SERVICE';
      const matchesStock = !inStockOnly || !tracksStock || stockOf(p.id) > 0;
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

  const visibleCategories = useMemo(() => {
    const counts = new Map<string, number>();
    products.forEach((product) => {
      if (product.categoryId) counts.set(product.categoryId, (counts.get(product.categoryId) || 0) + 1);
    });
    return categories
      .filter((category) => counts.has(category.id))
      .map((category) => ({ ...category, productCount: counts.get(category.id) || 0 }));
  }, [categories, products]);
  const visibleBrands = useMemo(() => [...new Map(products.filter((p) => p.brandId).map((p) => [p.brandId, p.brandName || ''])).entries()], [products]);
  // Ceramic-only controls (grade, size, tiling calculator) are hidden for
  // service-only or general-goods catalogues.
  const hasCeramicCatalog = useMemo(
    () => products.some((p) => p.productType !== 'GENERAL' && p.baseUnit !== 'SERVICE'),
    [products]
  );
  const visibleSizes = useMemo(
    () => [...new Set(products
      .filter((p) => p.productType !== 'GENERAL' && p.baseUnit !== 'SERVICE')
      .map((p) => p.size)
      .filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar', { numeric: true })),
    [products]
  );
  const visibleColors = useMemo(
    () => [...new Set(products.map((p) => p.color).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'ar')),
    [products]
  );

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
    // Default to the configured selling unit when it is usable, otherwise the
    // base unit. Quantity is always kept in the base unit for stock math.
    const sellable = getSellableUnits(product);
    const preferred = product.sellUnit && sellable.includes(product.sellUnit) ? product.sellUnit : (product.baseUnit || 'M2');
    const soldBy = sellable.includes(preferred) ? preferred : sellable[0];
    return {
      product,
      soldBy,
      soldQuantity: round2(fromBaseQuantity(quantityM2, soldBy, product)),
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
      const sellable = getSellableUnits(product);
      const preferred = product.sellUnit && sellable.includes(product.sellUnit)
        ? product.sellUnit
        : (product.baseUnit || 'M2');
      // One press adds one whole selling unit when that unit is countable
      // (a box of 12 pieces, a carton of tiles, a ton); otherwise one base unit.
      const oneSellUnitInBase = toBaseQuantity(1, preferred, product).quantity;
      const stepM2 = requestedM2
        ?? (product.productType === 'GENERAL'
          ? (preferred !== (product.baseUnit || 'M2') ? oneSellUnitInBase : 1)
          : (product.metersPerBox || 1.44));
      if (existingIndex > -1) {
        const updated = [...prev];
        const current = { ...updated[existingIndex] };
        const newM2 = round2(current.quantityM2 + stepM2);
        current.quantityM2 = newM2;
        current.soldQuantity = round2(fromBaseQuantity(newM2, current.soldBy, current.product));
        if (current.product.productType === 'GENERAL') {
          current.boxesCount = current.product.baseUnit === 'BOX' ? newM2 : 0;
          current.piecesCount = current.product.baseUnit === 'PIECE' ? newM2 : 0;
        } else {
          current.boxesCount = CeramicMath.calculateBoxes(newM2, current.product.metersPerBox || 1.44, true);
          current.piecesCount = CeramicMath.calculatePiecesFromBoxes(current.boxesCount, current.product.piecesPerBox || 4);
        }
        try {
          current.unitPrice = pricingService.getEffectivePrice(current.product.id, selectedCustomer?.id, newM2).priceM2;
        } catch {
          // Keep the current price if a pricing rule cannot be resolved.
        }
        updated[existingIndex] = current;
        return updated;
      }
      return [...prev, makeCartItem(product, stepM2)];
    });
  }, [stockOf, selectedCustomer, pricingService]);

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
      const item = { ...updated[index] };
      let baseQuantity: number;
      try {
        baseQuantity = round2(convertQuantity(value, item.soldBy, item.product.baseUnit || 'M2', item.product));
      } catch {
        // The selected unit is not convertible for this product; keep the line.
        return prev;
      }
      item.soldQuantity = round2(value);
      item.quantityM2 = baseQuantity;
      const metersPerBox = item.product.metersPerBox || 1.44;
      const piecesPerBox = item.product.piecesPerBox || 4;
      const soldInBoxes = String(item.soldBy).toUpperCase() === 'BOX';
      const soldInPieces = String(item.soldBy).toUpperCase() === 'PIECE';

      if (item.product.productType === 'GENERAL' || item.product.baseUnit === 'SERVICE') {
        item.boxesCount = soldInBoxes ? value : item.product.baseUnit === 'BOX' ? baseQuantity : 0;
        item.piecesCount = soldInPieces ? value : item.product.baseUnit === 'PIECE' ? baseQuantity : 0;
      } else {
        item.boxesCount = soldInBoxes
          ? round2(value)
          : CeramicMath.calculateBoxes(baseQuantity, metersPerBox, true);
        item.piecesCount = soldInPieces
          ? Math.round(value)
          : CeramicMath.calculatePiecesFromBoxes(item.boxesCount, piecesPerBox);
      }
      updated[index] = item;
      return updated;
    });
  };

  const stepCartQuantity = (index: number, direction: 1 | -1) => {
    const item = cart[index];
    if (!item) return;
    const step = getCartQuantityStep(item);
    const next = round2(item.soldQuantity + direction * step);
    if (next <= 0) {
      removeFromCart(index);
      return;
    }
    updateCartQuantity(index, next);
  };

  const updateCartUnit = (index: number, unit: PosUnit) => {
    setCart((prev) => {
      const updated = [...prev];
      const item = { ...updated[index] };
      if (item.soldBy === unit) return prev;
      try {
        item.soldBy = unit;
        // Base quantity and base price stay untouched; only the entry unit and
        // the quantity shown against it change.
        item.soldQuantity = round2(fromBaseQuantity(item.quantityM2, unit, item.product));
      } catch {
        return prev;
      }
      updated[index] = item;
      return updated;
    });
  };

  const updateCartPrice = (index: number, value: number) => {
    if (!Number.isFinite(value) || value < 0) return;
    if (!can('sales.approve')) {
      notify('لا تملك صلاحية تعديل سعر الصنف', 'error');
      return;
    }
    setCart((prev) => {
      const updated = [...prev];
      const item = { ...updated[index] };
      item.unitPrice = round2(basePriceFromUnitPrice(value, item.soldBy, item.product));
      updated[index] = item;
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
  const taxableBase = round2(Math.max(0, subtotal - discountAmount - promotionDiscount - loyaltyDiscount));
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
    const unit = getUomLabel(item.soldBy, item.product);
    generalQuantitiesByUnit.set(unit, (generalQuantitiesByUnit.get(unit) || 0) + item.soldQuantity);
  });
  const cartQuantitySummary = [
    totalItems > 0 ? `${totalItems} م² / ${totalBoxes} كرتونة` : '',
    ...[...generalQuantitiesByUnit].map(([unit, quantity]) => `${round2(quantity)} ${unit}`),
  ].filter(Boolean).join(' · ');

  // Cash sales auto-fill the paid amount with the grand total.
  useEffect(() => {
    if (paymentType === 'CASH') {
      setPaidAmount(totalAmount);
    }
    if (paymentType === 'CREDIT') {
      setPaidAmount(0);
    }
  }, [totalAmount, paymentType]);

  // ── Barcode / search submit ─────────────────────────────────────────────────
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const term = searchQuery.trim();
    if (!term) return;
    const normalizedTerm = term.toLocaleLowerCase('ar-EG');
    const exact = products.find(
      (p) => (p.barcode || '').trim().toLocaleLowerCase('ar-EG') === normalizedTerm
        || (p.sku || '').trim().toLocaleLowerCase('ar-EG') === normalizedTerm
    );
    if (exact) {
      addToCart(exact);
      setSearchQuery('');
      barcodeInputRef.current?.focus();
      notify(`تمت إضافة ${exact.name}`, 'success');
      return;
    }
    if (filteredProducts.length === 1) {
      addToCart(filteredProducts[0]);
      setSearchQuery('');
      barcodeInputRef.current?.focus();
      notify(`تمت إضافة ${filteredProducts[0].name}`, 'success');
      return;
    }
    if (filteredProducts.length > 1) {
      notify('توجد عدة نتائج؛ اختر الصنف المطلوب من القائمة.', 'warning');
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
  const persistHeld = (orders: HeldOrder[] | ((current: HeldOrder[]) => HeldOrder[])) => {
    const next = typeof orders === 'function' ? orders(heldOrdersRef.current) : orders;
    heldOrdersRef.current = next;
    setHeldOrders(next);
    try {
      localStorage.setItem(HELD_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage full — ignore */
    }
    // Mirror to DB for crash recovery.
    try {
      heldOrderService.clearAll();
      next.forEach((h) => heldOrderService.save(h.id, JSON.stringify(h), currentUser?.id));
    } catch {
      /* ignore */
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
      taxPercentage,
      shippingCost,
      notes,
      paidAmount,
      paymentType
    };
    persistHeld((prev) => [hold, ...prev]);
    setCart([]);
    setDiscountAmount(0);
    setTaxPercentage(settings?.defaultTaxPercentage || 0);
    setShippingCost(0);
    setNotes('');
    setPaidAmount(0);
    notify('تم تعليق الطلب وإمكانية استرجاعه لاحقاً', 'success');
  };

  const resumeHeldOrder = (order: HeldOrder) => {
    const cust = customers.find((c) => c.id === order.customerId) || null;
    setSelectedCustomer(cust);
    if (order.warehouseId) setSelectedWarehouseId(order.warehouseId);
    // Held orders saved before per-line selling units existed only carry a
    // base-unit quantity; derive the sell-unit quantity on the way in.
    setCart((order.items || []).map((item) => ({
      ...item,
      soldBy: item.soldBy || item.product.baseUnit || 'M2',
      soldQuantity: Number.isFinite(item.soldQuantity)
        ? item.soldQuantity
        : round2(fromBaseQuantity(item.quantityM2, item.soldBy || item.product.baseUnit || 'M2', item.product)),
    })));
    setDiscountAmount(order.discountAmount || 0);
    setTaxPercentage(order.taxPercentage ?? settings?.defaultTaxPercentage ?? 0);
    setShippingCost(order.shippingCost || 0);
    setNotes(order.notes || '');
    setPaidAmount(order.paidAmount || 0);
    setPaymentType(order.paymentType || 'CASH');
    persistHeld((prev) => prev.filter((h) => h.id !== order.id));
    setIsHeldModalOpen(false);
    notify(`تم استرجاع الطلب: ${order.customerName}`, 'success');
  };

  const deleteHeldOrder = (id: string) => {
    persistHeld((prev) => prev.filter((h) => h.id !== id));
  };

  useEffect(() => {
    if (isCloseShiftModalOpen && activeShift) {
      setClosingCash(expectedClosingCash);
    }
  }, [isCloseShiftModalOpen, activeShift, expectedClosingCash]);

  // ── Shifts ──────────────────────────────────────────────────────────────────
  const handleOpenShift = () => {
    if (!can('cashier.shift.open')) {
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
    if (!can('cashier.shift.close')) {
      notify('غير مصرح لك بإغلاق وردية الكاشير', 'error');
      return;
    }
    try {
      cashierService.closeShift(activeShift.id, Math.max(0, closingCash), closingNotes, effectiveUser?.id || currentUser?.id || 'usr_admin');
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
  const validateCartAndPermissions = useCallback(() => {
    if (!Number.isFinite(discountAmount) || discountAmount < 0
      || !Number.isFinite(shippingCost) || shippingCost < 0
      || !Number.isFinite(taxPercentage) || taxPercentage < 0
      || !Number.isFinite(paidAmount) || paidAmount < 0) {
      notify('تحقق من أن الخصم والضريبة والشحن والمدفوع أرقام صحيحة غير سالبة', 'error');
      return false;
    }
    const invalidItem = cart.find((item) => !Number.isFinite(item.quantityM2) || item.quantityM2 <= 0
      || !Number.isFinite(item.unitPrice) || item.unitPrice < 0
      || !Number.isFinite(item.discountAmount) || item.discountAmount < 0
      || item.discountAmount > item.quantityM2 * item.unitPrice);
    if (invalidItem) {
      notify(`تحقق من الكمية والسعر والخصم للصنف «${invalidItem.product.name}»`, 'error');
      return false;
    }
    if (cart.length === 0) {
      notify('السلة فارغة، أضف أصنافاً أولاً', 'error');
      return false;
    }
    if (!selectedCustomer) {
      notify('يرجى اختيار العميل', 'error');
      return false;
    }
    if (!selectedWarehouseId) {
      notify('يرجى اختيار المخزن', 'error');
      return false;
    }
    if (!can('sales.create')) {
      notify('لا تملك صلاحية إنشاء فاتورة بيع', 'error');
      return false;
    }
    if (remainingAmount > 0 && !can('sales.credit')) {
      notify('لا تملك صلاحية البيع الآجل أو ترك مبلغ متبقٍ', 'error');
      return false;
    }

    return true;
  }, [cart, discountAmount, shippingCost, taxPercentage, paidAmount, selectedCustomer, selectedWarehouseId, can, remainingAmount, notify]);

  const validateStockAvailability = useCallback(() => {
    if (settings?.enableNegativeStock ?? false) return true;
    for (const item of cart) {
      const available = stockOf(item.product.id);
      if (item.quantityM2 > available) {
        notify(
          `الرصيد المتاح من «${item.product.name}» ${formatProductQuantity(available, item.product)} فقط، والمطلوب ${formatProductQuantity(item.quantityM2, item.product)}`,
          'error'
        );
        return false;
      }
    }
    return true;
  }, [cart, settings, stockOf, notify]);

  const validateMinimumPrices = useCallback(() => {
    for (const item of cart) {
      const min = item.product.minSellingPriceM2 || 0;
      if (min > 0 && item.unitPrice < min && !can('sales.approve')) {
        notify(`سعر «${item.product.name}» أقل من الحد الأدنى المسموح (${min}). يلزم اعتماد المسؤول`, 'error');
        return false;
      }
    }
    return true;
  }, [cart, can, notify]);

  const validateDiscount = useCallback(() => {
    const totalDiscount = round2(discountAmount + lineDiscountTotal);
    if (totalDiscount > lineSubtotal) {
      notify('إجمالي الخصومات لا يمكن أن يتجاوز قيمة الأصناف', 'error');
      return false;
    }
    if (totalDiscount > 0 && !can('sales.discount')) {
      notify('غير مصرح لك بمنح خصم على الفاتورة', 'error');
      return false;
    }
    if (totalDiscount > 0) {
      const discountPercent = lineSubtotal > 0 ? (totalDiscount / lineSubtotal) * 100 : 0;
      const threshold = settings?.discountApprovalThresholdPercent ?? 10;
      if (discountPercent > threshold && !can('sales.approve')) {
        try {
          const request = new ApprovalService().createRequest({
            requestType: 'DISCOUNT',
            title: `اعتماد خصم ${discountPercent.toFixed(1)}% على فاتورة بيع`,
            description: `العميل: ${selectedCustomer?.name ?? ''} — قيمة الخصم ${totalDiscount} ج.م من إجمالي ${lineSubtotal} ج.م (الحد المسموح ${threshold}%).`,
            requestedValue: totalDiscount,
            currentValue: lineSubtotal,
            priority: 'HIGH',
            referenceType: 'POS',
          });
          notify(`الخصم يتجاوز الحد المسموح (${threshold}%). تم إرسال طلب اعتماد رقم ${request.requestNumber}`, 'warning');
        } catch (error: any) {
          notify(error?.message || 'الخصم يتجاوز الحد المسموح ويلزم اعتماد المسؤول', 'error');
        }
        return false;
      }
    }
    return true;
  }, [
    discountAmount, lineDiscountTotal, can, lineSubtotal, settings,
    selectedCustomer, notify,
  ]);

  const validateCreditLimit = useCallback(() => {
    if (selectedCustomer && remainingAmount > 0 && selectedCustomer.creditLimit > 0) {
      const projected = round2((selectedCustomer.currentBalance || 0) + remainingAmount);
      if (projected > selectedCustomer.creditLimit) {
        notify(
          `تجاوز حد الائتمان للعميل. الرصيد الحالي ${selectedCustomer.currentBalance} + الآجل ${remainingAmount} > الحد ${selectedCustomer.creditLimit}`,
          'error'
        );
        return false;
      }
    }
    return true;
  }, [remainingAmount, selectedCustomer, notify]);

  const confirmActiveShift = useCallback(() => {
    if (!activeShift) {
      const proceed = window.confirm(
        'لا توجد وردية كاشير مفتوحة. سيتم تسجيل الفاتورة بدون ربطها بوردية. هل تريد المتابعة؟'
      );
      if (!proceed) return false;
    }
    return true;
  }, [activeShift]);

  const validateCheckoutDetails = useCallback(() => (
    validateCartAndPermissions()
      && validateStockAvailability()
      && validateMinimumPrices()
      && validateDiscount()
      && validateCreditLimit()
      && confirmActiveShift()
  ), [
    validateCartAndPermissions, validateStockAvailability, validateMinimumPrices,
    validateDiscount, validateCreditLimit, confirmActiveShift,
  ]);

  const showToneMixingWarning = useCallback(() => {
    const checkItems = cart
      .filter((ci) => ci.product.productType !== 'GENERAL')
      .map((ci) => ({
        productId:   ci.product.id,
        productName: ci.product.name,
        warehouseId: selectedWarehouseId,
        quantityM2:  ci.quantityM2,
      }));
    if (checkItems.length === 0) return false;

    const conflicts = batchService.checkToneMixing(checkItems);
    if (conflicts.length === 0) return false;
    setToneConflicts(conflicts);
    setIsToneWarningOpen(true);
    return true;
  }, [cart, selectedWarehouseId, batchService]);

  const handleCheckout = useCallback((skipToneCheck = false) => {
    if (isProcessing || !validateCheckoutDetails() || !selectedCustomer) return;

    try {
      setIsProcessing(true);

      // ── Tone/Shade mixing guard ─────────────────────────────────────────────
      // Only run when not already bypassed via the warning modal
      if (!skipToneCheck && showToneMixingWarning()) {
        setIsProcessing(false);
        return; // wait for user to confirm or cancel
      }
      // ── End tone guard ──────────────────────────────────────────────────────

      const invoice = salesService.createSale({
        customerId: selectedCustomer.id,
        warehouseId: selectedWarehouseId,
        shiftId: activeShift?.id,
        items: cart.map((item) => ({
          productId: item.product.id,
          soldBy: item.soldBy,
          uom: item.soldBy,
          quantity: item.soldQuantity,
          quantityM2: item.quantityM2,
          boxesCount: item.boxesCount,
          piecesCount: item.piecesCount,
          // The service treats `unitPrice` as per `uom` when `quantity` is sent.
          unitPrice: round2(pricePerUnit(item.unitPrice, item.soldBy, item.product)),
          unitCost: item.product.costPrice,
          discountAmount: item.discountAmount
        })),
        discountAmount: round2(discountAmount + promotionDiscount + loyaltyDiscount),
        taxPercentage,
        taxAmount,
        shippingCost,
        paidAmount,
        paymentType,
        payments: paymentType === 'MIXED' ? ([
          { method: 'CASH', amount: splitCash },
          { method: 'CARD', amount: splitCard },
          { method: 'BANK_TRANSFER', amount: splitBank },
          { method: 'CHEQUE', amount: splitCheque },
        ].filter((p) => p.amount > 0) as { method: PaymentType; amount: number }[]) : undefined,
        notes,
        performedBy: effectiveUser?.id || currentUser?.id || 'usr_admin'
      });

      setSuccessInvoice(invoice);
      // Record promotion usage
      if (appliedPromotion) {
        try { promotionService.recordUsage(appliedPromotion.promotionId, invoice.id, couponCode || undefined, appliedPromotion.discountAmount); } catch { /* ignore */ }
      }
      // Earn loyalty points (1 point per 10 currency units of total)
      if (selectedCustomer?.id) {
        try {
          const points = Math.floor((invoice.totalAmount || 0) / 10);
          if (points > 0) loyaltyService.earnPoints({ customerId: selectedCustomer.id, points, referenceType: 'SALES_INVOICE', referenceId: invoice.id, description: `نقاط من فاتورة ${invoice.invoiceNumber}` });
        } catch { /* ignore */ }
      }
      setCart([]);
      setDiscountAmount(0);
      setPromotionDiscount(0);
      setLoyaltyDiscount(0);
      setAppliedPromotion(null);
      setCouponCode('');
      setRedeemPoints(0);
      setShippingCost(0);
      setNotes('');
      setPaidAmount(0);
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
    cart, selectedCustomer, selectedWarehouseId, isProcessing,
    discountAmount, activeShift, taxPercentage,
    taxAmount, shippingCost, paidAmount, paymentType, notes, currentUser,
    salesService, productService, cashierService, loadStock, notify,
    validateCheckoutDetails, showToneMixingWarning,
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
      permission: 'sales.export',
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
        openExternalShare(buildWhatsAppUrl(phone, text), decodeURIComponent(text));
      } : undefined,
    });
  };

  const [pendingVoid, setPendingVoid] = useState<{ invoice: any; reason: string } | null>(null);
  const [isOverrideOpen, setIsOverrideOpen] = useState(false);
  const [isPinLoginOpen, setIsPinLoginOpen] = useState(false);
  const [touchMode, setTouchMode] = useState(false);
  const customerDisplayRef = useRef<Window | null>(null);

  // Auto-evaluate promotions on cart/coupon change
  useEffect(() => {
    if (cart.length === 0) { setAppliedPromotion(null); setPromotionDiscount(0); return; }
    const cartItems = cart.map((item) => ({
      productId: item.product.id,
      categoryId: (item.product as any).categoryId,
      qty: item.quantityM2,
      unitPrice: item.unitPrice,
      amount: item.quantityM2 * item.unitPrice,
    }));
    const applied = promotionService.evaluate(cartItems, couponCode || undefined);
    if (applied) {
      setAppliedPromotion(applied);
      setPromotionDiscount(applied.discountAmount);
    } else {
      setAppliedPromotion(null);
      setPromotionDiscount(0);
    }
  }, [cart, couponCode, promotionService]);

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
  }, [salesService, selectedWarehouseId, loadStock, cashierService, notify]);

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

  const openCustomerDisplay = useCallback(() => {
    if (customerDisplayRef.current && !customerDisplayRef.current.closed) {
      customerDisplayRef.current.focus();
      return;
    }
    const w = window.open('', 'pos-customer-display', 'width=420,height=720');
    if (!w) { notify('يرجى السماح بالنوافذ المنبثقة', 'error'); return; }
    customerDisplayRef.current = w;
    w.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>عرض العميل</title>
<style>body{font-family:Tahoma,sans-serif;margin:0;padding:16px;background:#0f172a;color:#fff;} .total{font-size:48px;font-weight:900;color:#38bdf8;} .item{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #334155;font-size:16px;} .change{font-size:32px;color:#34d399;font-weight:800;}</style></head><body>
<div id="root"><div style="text-align:center;opacity:.5;">في انتظار عناصر...</div></div>
<script>
const ch = new BroadcastChannel('pos-customer-display');
ch.onmessage = (e) => {
  const d = e.data;
  let html = '';
  if (d.items && d.items.length) {
    html += d.items.map(i => '<div class="item"><span>'+i.name+'</span><span>'+i.qty+' × '+i.price+'</span></div>').join('');
  }
  html += '<div style="margin-top:16px;border-top:2px solid #38bdf8;padding-top:12px;">';
  html += '<div class="item"><span>المجموع الفرعي</span><span>'+d.subtotal+'</span></div>';
  if (d.discount>0) html += '<div class="item"><span>خصم</span><span>-'+d.discount+'</span></div>';
  if (d.tax>0) html += '<div class="item"><span>ضريبة</span><span>'+d.tax+'</span></div>';
  html += '<div class="total">الإجمالي: '+d.total+'</div>';
  if (d.paid>0) html += '<div class="item"><span>المدفوع</span><span>'+d.paid+'</span></div>';
  if (d.change>0) html += '<div class="change">الباقي: '+d.change+'</div>';
  html += '</div>';
  document.getElementById('root').innerHTML = html;
};
</script></body></html>`);
    w.document.close();
  }, [notify]);

  // Sync cart to customer display
  useEffect(() => {
    if (!customerDisplayRef.current || customerDisplayRef.current.closed) return;
    try {
      const ch = new BroadcastChannel('pos-customer-display');
      ch.postMessage({
        items: cart.map((i) => ({ name: i.product.name, qty: i.soldQuantity, price: i.unitPrice })),
        subtotal: lineSubtotal,
        discount: round2(discountAmount + promotionDiscount + loyaltyDiscount),
        tax: taxAmount,
        total: totalAmount,
        paid: paidAmount,
        change: changeDue,
      });
      ch.close();
    } catch { /* ignore */ }
  }, [cart, lineSubtotal, discountAmount, promotionDiscount, loyaltyDiscount, taxAmount, totalAmount, paidAmount, changeDue]);

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

  const printZReport = useCallback(() => {
    if (!activeShift) return;
    const w = window.open('', '_blank', 'width=420,height=720');
    if (!w) { notify('يرجى السماح بالنوافذ المنبثقة', 'error'); return; }
    const html = `
      <!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>Z-Report ${activeShift.shiftNumber}</title>
      <style>body{font-family:Tahoma,sans-serif;width:76mm;margin:0 auto;padding:6px;font-size:12px;} .c{text-align:center;} .b{font-weight:800;} .row{display:flex;justify-content:space-between;} .div{border-top:1px dashed #000;margin:6px 0;}</style></head><body>
      <div class="c b">${activeShift.shiftNumber ? 'تقرير Z - إقفال الوردية' : ''}</div>
      <div class="div"></div>
      <div class="row"><span>رقم الوردية</span><span>${activeShift.shiftNumber}</span></div>
      <div class="row"><span>الافتتاحي</span><span>${CeramicMath.formatCurrency(activeShift.openingBalance)}</span></div>
      <div class="row"><span>مبيعات نقدية</span><span>${CeramicMath.formatCurrency(activeShift.totalSalesCash)}</span></div>
      <div class="row"><span>تحصيلات العملاء</span><span>${CeramicMath.formatCurrency(activeShift.totalCustomerPayments)}</span></div>
      <div class="row"><span>مصروفات/مرتجعات</span><span>${CeramicMath.formatCurrency((activeShift.totalExpenses || 0) + (activeShift.totalRefunds || 0))}</span></div>
      <div class="row b"><span>النقد المتوقع</span><span>${CeramicMath.formatCurrency(expectedClosingCash)}</span></div>
      <div class="row"><span>النقد الفعلي</span><span>${CeramicMath.formatCurrency(closingCash)}</span></div>
      <div class="row"><span>الفرق</span><span>${CeramicMath.formatCurrency(closingCash - expectedClosingCash)}</span></div>
      <div class="div"></div>
      <div class="c" style="font-size:10px;">${new Date().toLocaleString('ar')}</div>
      <script>window.onload=function(){window.print();setTimeout(function(){window.close();},500);}</script>
      </body></html>`;
    w.document.write(html);
    w.document.close();
  }, [activeShift, expectedClosingCash, closingCash, notify]);

  const latest = useRef<any>({});
  latest.current = { handleCheckout, cart, isCalculatorOpen, isCustomerModalOpen, isHeldModalOpen, isShortcutsOpen, isShiftModalOpen, isCloseShiftModalOpen, isToneWarningOpen, invoicePreview, successInvoice, hasCeramicCatalog };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const s = latest.current;
      const target = e.target as HTMLElement | null;
      const isTyping = !!target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      if (e.key === 'F9' && (s.isCalculatorOpen || s.isCustomerModalOpen || s.isHeldModalOpen || s.isShortcutsOpen || s.isShiftModalOpen || s.isCloseShiftModalOpen || s.isToneWarningOpen || s.invoicePreview || s.successInvoice)) return;
      if (isTyping && !['F1', 'F8', 'Escape'].includes(e.key)) return;
      if (e.key === 'F2') {
        e.preventDefault();
        barcodeInputRef.current?.focus();
      } else if (e.key === 'F4') {
        e.preventDefault();
        paidInputRef.current?.focus();
      } else if (e.key === 'F8') {
        e.preventDefault();
        if (s.hasCeramicCatalog) setIsCalculatorOpen((v) => !v);
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

  return (
    <div className={`flex h-full min-h-0 overflow-hidden bg-slate-50 text-slate-900 max-[900px]:flex-col ${touchMode ? 'pos-touch-mode' : ''}`} dir="rtl">
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
                {can('cashier.shift.close') && <button onClick={() => setIsCloseShiftModalOpen(true)} className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition"><Lock className="w-4 h-4" /> إغلاق الوردية</button>}
                <button onClick={() => setIsPinLoginOpen(true)} className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition"><UserPlus className="w-4 h-4" /> {actingUser ? actingUser.fullName : 'تبديل المستخدم'}</button>
                {actingUser && (
                  <button onClick={() => { setActingUser(null); notify('تم العودة للمستخدم الأصلي', 'info'); }} className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl text-xs font-bold transition">عودة</button>
                )}
                <button onClick={openCustomerDisplay} className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition">عرض العميل</button>
                <button onClick={() => setTouchMode((v) => !v)} className={`flex items-center gap-1.5 px-3 py-2 border rounded-xl text-xs font-bold transition ${touchMode ? 'bg-sky-600 text-white border-sky-500' : 'bg-slate-50 text-slate-700 border-slate-200'}`}>Touch</button>
              </>
            )}
            {!activeShift && can('cashier.shift.open') && (
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
              <label htmlFor="pos-product-search" className="sr-only">بحث عن منتج</label>
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                id="pos-product-search"
                ref={barcodeInputRef}
                type="text"
                aria-label="بحث عن منتج"
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

            <label htmlFor="pos-warehouse-filter" className="sr-only">اختيار المخزن</label>
            <select
              id="pos-warehouse-filter"
              aria-label="اختيار المخزن"
              value={selectedWarehouseId}
              onChange={(e) => {
                const warehouseId = e.target.value;
                const warehouse = warehouses.find((item) => item.id === warehouseId);
                setSelectedWarehouseId(warehouseId);
                loadStock(warehouseId);
                setActiveShift(cashierService.getActiveShift(currentUser?.id, warehouse?.branchId));
                const branchRegister = registers.find((register) => register.branchId === warehouse?.branchId && register.isDefault)
                  || registers.find((register) => register.branchId === warehouse?.branchId);
                if (branchRegister) setShiftRegisterId(branchRegister.id);
              }}
              className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-sky-500"
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>المخزن: {w.name}</option>
              ))}
            </select>

            <label htmlFor="pos-sort-mode" className="sr-only">ترتيب المنتجات</label>
            <select
              id="pos-sort-mode"
              aria-label="ترتيب المنتجات"
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

            <label htmlFor="pos-brand-filter" className="sr-only">فلتر الماركة</label>
            <select id="pos-brand-filter" aria-label="فلتر الماركة" value={selectedBrand} onChange={(e) => setSelectedBrand(e.target.value)} className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800">
              <option value="ALL">كل الماركات</option>{visibleBrands.map(([id, name]) => <option key={id} value={id}>{name || 'بدون ماركة'}</option>)}
            </select>
            {hasCeramicCatalog && (<>
            <label htmlFor="pos-grade-filter" className="sr-only">فلتر الفرز</label>
            <select id="pos-grade-filter" aria-label="فلتر الفرز" value={selectedGrade} onChange={(e) => setSelectedGrade(e.target.value)} className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800">
              <option value="ALL">كل الأنواع والفرز</option><option value="GRADE_1">فرز أول</option><option value="GRADE_2">فرز ثاني</option><option value="GRADE_3">فرز ثالث</option><option value="COMMERCIAL">تجاري</option>
            </select>
            {visibleSizes.length > 0 && (<>
            <label htmlFor="pos-size-filter" className="sr-only">فلتر المقاس</label>
            <select id="pos-size-filter" aria-label="فلتر المقاس" value={selectedSize} onChange={(e) => setSelectedSize(e.target.value)} className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800">
              <option value="ALL">كل المقاسات</option>{visibleSizes.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
            </>)}
            </>)}
            {visibleColors.length > 0 && (<>
              <label htmlFor="pos-color-filter" className="sr-only">فلتر اللون</label>
              <select id="pos-color-filter" aria-label="فلتر اللون" value={selectedColor} onChange={(e) => setSelectedColor(e.target.value)} className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800">
                <option value="ALL">كل الألوان</option>{visibleColors.map((color) => <option key={color} value={color}>{color}</option>)}
              </select>
            </>)}

            {hasCeramicCatalog && (
            <button
              type="button"
              onClick={() => setIsCalculatorOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 border border-amber-500/30 rounded-xl text-xs font-bold transition"
            >
              <Calculator className="w-4 h-4" /> حاسبة المقايسة (F8)
            </button>
            )}
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>النتائج: <strong className="text-slate-700">{filteredProducts.length}</strong> صنف</span>
            {(searchQuery || selectedCategory !== 'ALL' || selectedBrand !== 'ALL' || selectedGrade !== 'ALL' || selectedSize !== 'ALL' || selectedColor !== 'ALL' || inStockOnly) && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery(''); setSelectedCategory('ALL'); setSelectedBrand('ALL');
                  setSelectedGrade('ALL'); setSelectedSize('ALL'); setSelectedColor('ALL'); setInStockOnly(false);
                }}
                className="font-bold text-sky-700 hover:text-sky-900"
              >مسح البحث والفلاتر</button>
            )}
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
              id="pos-customer-search"
              value={selectedCustomer ? selectedCustomer.name : customerSearch}
              onChange={(e) => { setCustomerSearch(e.target.value); setSelectedCustomer(null); }}
              placeholder="ابحث عن عميل بالاسم أو الهاتف..."
              aria-label="بحث العميل"
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
              <span className="text-slate-500">{CUSTOMER_TYPE_LABELS[selectedCustomer.customerType]}</span>
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
            cart.map((item, index) => (
              <CartLine
                key={item.product.id}
                item={item}
                index={index}
                enableNegativeStock={settings?.enableNegativeStock ?? false}
                gradeLabel={gradeLabel}
                onRemove={removeFromCart}
                onUpdateUnit={updateCartUnit}
                onStepQuantity={stepCartQuantity}
                onUpdateQuantity={updateCartQuantity}
                onUpdatePrice={updateCartPrice}
                onUpdateLineDiscount={updateCartLineDiscount}
              />
            ))
          )}
        </div>

        {/* Totals & payment */}
        <div className="p-3 border-t border-slate-200 bg-white space-y-3 max-h-[58%] overflow-y-auto shadow-[0_-8px_24px_rgba(15,23,42,0.04)] max-[900px]:max-h-[65%]">
          {/* Order extras */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <label htmlFor="pos-invoice-discount" className="text-[10px] font-bold text-slate-500 flex items-center gap-1"><Percent className="w-3 h-3" /> خصم الفاتورة</label>
              <input
                id="pos-invoice-discount"
                type="number"
                value={discountAmount || ''}
                placeholder="0"
                onChange={(e) => setDiscountAmount(e.target.value === '' ? 0 : Math.max(0, Number.parseFloat(e.target.value) || 0))}
                className="w-full px-2 py-1.5 bg-white rounded-lg border border-slate-200 text-xs font-bold text-slate-900 mt-0.5"
              />
            </div>
            <div>
              <label htmlFor="pos-tax-percentage" className="text-[10px] font-bold text-slate-500 flex items-center gap-1"><Percent className="w-3 h-3" /> ضريبة %</label>
              <input
                id="pos-tax-percentage"
                type="number"
                value={taxPercentage || ''}
                placeholder="0"
                onChange={(e) => setTaxPercentage(e.target.value === '' ? 0 : Math.max(0, Number.parseFloat(e.target.value) || 0))}
                className="w-full px-2 py-1.5 bg-white rounded-lg border border-slate-200 text-xs font-bold text-slate-900 mt-0.5"
              />
            </div>
            <div>
              <label htmlFor="pos-shipping-cost" className="text-[10px] font-bold text-slate-500 flex items-center gap-1"><Truck className="w-3 h-3" /> مشال / نقل</label>
              <input
                id="pos-shipping-cost"
                type="number"
                value={shippingCost || ''}
                placeholder="0"
                onChange={(e) => setShippingCost(e.target.value === '' ? 0 : Math.max(0, Number.parseFloat(e.target.value) || 0))}
                className="w-full px-2 py-1.5 bg-white rounded-lg border border-slate-200 text-xs font-bold text-slate-900 mt-0.5"
              />
            </div>
          </div>

          {/* Payment type */}
          <div>
            <p className="text-[10px] font-bold text-slate-500 block mb-1">طريقة السداد</p>
            <div role="group" aria-label="طريقة السداد" className="grid grid-cols-3 gap-1">
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

          {paymentType === 'MIXED' && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-[10px] font-bold text-slate-500">نقداً</label>
                <input type="number" min="0" step="0.01" value={splitCash || ''} onChange={(e) => setSplitCash(Number.parseFloat(e.target.value) || 0)} className="w-full px-2 py-1.5 bg-white rounded-lg border border-slate-200 text-xs font-bold text-slate-900 mt-0.5" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500">بطاقة</label>
                <input type="number" min="0" step="0.01" value={splitCard || ''} onChange={(e) => setSplitCard(Number.parseFloat(e.target.value) || 0)} className="w-full px-2 py-1.5 bg-white rounded-lg border border-slate-200 text-xs font-bold text-slate-900 mt-0.5" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500">تحويل بنكي</label>
                <input type="number" min="0" step="0.01" value={splitBank || ''} onChange={(e) => setSplitBank(Number.parseFloat(e.target.value) || 0)} className="w-full px-2 py-1.5 bg-white rounded-lg border border-slate-200 text-xs font-bold text-slate-900 mt-0.5" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500">شيك</label>
                <input type="number" min="0" step="0.01" value={splitCheque || ''} onChange={(e) => setSplitCheque(Number.parseFloat(e.target.value) || 0)} className="w-full px-2 py-1.5 bg-white rounded-lg border border-slate-200 text-xs font-bold text-slate-900 mt-0.5" />
              </div>
              <div className="col-span-2 text-[10px] text-slate-500">
                مجموع الدفع: {CeramicMath.formatCurrency(splitCash + splitCard + splitBank + splitCheque)}
                {Math.abs((splitCash + splitCard + splitBank + splitCheque) - paidAmount) > 0.001 && (
                  <span className="text-rose-600 font-bold"> — يجب أن يساوي المبلغ المدفوع {CeramicMath.formatCurrency(paidAmount)}</span>
                )}
              </div>
            </div>
          )}

          {/* Coupon code */}
          <div className="flex items-center gap-2">
            <input value={couponCode} onChange={(e) => setCouponCode(e.target.value)} placeholder="رمز القسيمة (coupon)" className="flex-1 px-2 py-1.5 bg-white rounded-lg border border-slate-200 text-xs text-slate-900" />
            {appliedPromotion && <span className="text-[10px] font-bold text-emerald-600">✓ {appliedPromotion.name} (-{appliedPromotion.discountAmount})</span>}
          </div>

          {/* Loyalty redeem */}
          {selectedCustomer && (
            <div className="flex items-center gap-2">
              <input type="number" min={0} value={redeemPoints || ''} onChange={(e) => setRedeemPoints(Number.parseFloat(e.target.value) || 0)} placeholder="استبدال نقاط" className="w-28 px-2 py-1.5 bg-white rounded-lg border border-slate-200 text-xs text-slate-900" />
              <button type="button" onClick={() => {
                if (!redeemPoints || redeemPoints <= 0) return;
                try {
                  loyaltyService.redeemPoints({ customerId: selectedCustomer.id, points: redeemPoints, referenceType: 'SALES_INVOICE', description: 'استبدال نقاط' });
                  setLoyaltyDiscount(redeemPoints);
                  notify(`تم استبدال ${redeemPoints} نقطة`, 'success');
                } catch (e: any) { notify(e?.message || 'فشل الاستبدال', 'error'); }
              }} className="px-2 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg text-xs font-bold">استبدال</button>
            </div>
          )}

          {/* Paid amount */}
          <div className="flex items-center justify-between">
            <label htmlFor="pos-paid-amount" className="text-xs font-bold text-slate-500">المبلغ المدفوع (F4):</label>
            <input
              id="pos-paid-amount"
              ref={paidInputRef}
              type="number"
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value === '' ? 0 : Number.parseFloat(e.target.value))}
              aria-label="المبلغ المدفوع"
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
                    <label htmlFor="pos-notes" className="sr-only">ملاحظات الفاتورة</label>
          <input
            id="pos-notes"
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="ملاحظات على الفاتورة (اختياري)..."
            aria-label="ملاحظات الفاتورة"
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
            {hasCeramicCatalog && (
            <button
              onClick={() => setIsCalculatorOpen(true)}
              className="py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition"
            >
              <Calculator className="w-4 h-4" /> مقايسة
            </button>
            )}
          </div>

          <button
            onClick={() => handleCheckout()}
            disabled={isProcessing || cart.length === 0}
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black rounded-xl shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 transition active:scale-[0.99]"
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>{isProcessing ? 'جاري الحفظ والخصم من المخزن...' : 'اعتماد وحفظ الفاتورة (F9)'}</span>
          </button>
        </div>
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

// ─── Local presentational helper ────────────────────────────────────────────
const RotateCcwIcon: React.FC = () => <RefreshCw className="w-4 h-4" />;

export default PosView;
