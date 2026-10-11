import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Barcode, ShoppingCart, Trash2, Plus, Minus, 
  CreditCard, Banknote, UserCheck, CheckCircle2, Printer, 
  Calculator, AlertCircle, RefreshCw
} from 'lucide-react';
import { ProductService } from '../services/ProductService';
import { InventoryService } from '../services/InventoryService';
import { CustomerService } from '../services/CustomerService';
import { SalesService } from '../services/SalesService';
import { CashierService } from '../services/CashierService';
import { PrintService } from '../services/PrintService';
import { Product, Customer, Warehouse, CashShift, PaymentType } from '../types';
import { CeramicMath } from '../utils/ceramicMath';

interface CartItem {
  product: Product;
  soldBy: 'M2' | 'BOX' | 'PIECE';
  quantityM2: number;
  boxesCount: number;
  piecesCount: number;
  unitPrice: number;
  discountAmount: number;
  availableStockM2: number;
}

export const PosView: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [activeShift, setActiveShift] = useState<CashShift | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [shippingCost, setShippingCost] = useState<number>(0);
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [paymentType, setPaymentType] = useState<PaymentType>('CASH');
  const [notes, setNotes] = useState('');

  const [isProcessing, setIsProcessing] = useState(false);
  const [successInvoice, setSuccessInvoice] = useState<any | null>(null);

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  const productService = new ProductService();
  const inventoryService = new InventoryService();
  const customerService = new CustomerService();
  const salesService = new SalesService();
  const cashierService = new CashierService();
  const printService = new PrintService();

  const loadInitialData = () => {
    try {
      const allProds = productService.getAllProducts();
      const allCusts = customerService.getAllCustomers();
      const allWhs = inventoryService.getAllWarehouses();
      const shift = cashierService.getActiveShift();

      setProducts(allProds);
      setCustomers(allCusts);
      setWarehouses(allWhs);
      setActiveShift(shift);

      if (allWhs.length > 0) {
        setSelectedWarehouseId(allWhs[0].id);
      }
      if (allCusts.length > 0) {
        setSelectedCustomer(allCusts[0]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  // Keyboard shortcut focus
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        barcodeInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Filtered Products
  const filteredProducts = products.filter(p => {
    const matchesSearch = !searchQuery || 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.barcode.includes(searchQuery) ||
      p.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.size.includes(searchQuery);

    const matchesCategory = selectedCategory === 'ALL' || p.categoryId === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleBarcodeSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    const exactMatch = products.find(p => p.barcode === searchQuery.trim() || p.sku === searchQuery.trim());
    if (exactMatch) {
      addToCart(exactMatch);
      setSearchQuery('');
    }
  };

  const addToCart = (product: Product) => {
    const existingIndex = cart.findIndex(item => item.product.id === product.id);
    const metersPerBox = product.metersPerBox || 1.44;
    const piecesPerBox = product.piecesPerBox || 4;

    // Check available stock in selected warehouse
    const stock = inventoryService.getProductStock(product.id, selectedWarehouseId);
    const available = stock ? stock.availableM2 : 0;

    if (existingIndex > -1) {
      const updated = [...cart];
      const current = updated[existingIndex];
      const newM2 = Number((current.quantityM2 + metersPerBox).toFixed(2));
      
      if (newM2 > available) {
        alert(`تنبيه: الكمية المطلوبة (${newM2} م²) تتجاوز الرصيد المتاح بالمخزن (${available} م²).`);
        return;
      }

      current.quantityM2 = newM2;
      current.boxesCount = CeramicMath.calculateBoxes(newM2, metersPerBox, true);
      current.piecesCount = CeramicMath.calculatePiecesFromBoxes(current.boxesCount, piecesPerBox);
      setCart(updated);
    } else {
      const defaultM2 = metersPerBox; // 1 box by default
      if (defaultM2 > available) {
        alert(`تنبيه: الرصيد المتاح في المخزن الحالي (${available} م²) أقل من كرتونة واحدة.`);
      }

      setCart([
        ...cart,
        {
          product,
          soldBy: 'M2',
          quantityM2: defaultM2,
          boxesCount: 1,
          piecesCount: piecesPerBox,
          unitPrice: product.sellingPriceM2,
          discountAmount: 0,
          availableStockM2: available
        }
      ]);
    }
  };

  const updateCartItemQuantity = (index: number, newM2: number) => {
    if (newM2 <= 0) {
      removeFromCart(index);
      return;
    }
    const updated = [...cart];
    const item = updated[index];
    const metersPerBox = item.product.metersPerBox || 1.44;
    const piecesPerBox = item.product.piecesPerBox || 4;

    if (newM2 > item.availableStockM2) {
      alert(`الرصيد المتاح (${item.availableStockM2} م²) غير كافٍ.`);
    }

    item.quantityM2 = Number(newM2.toFixed(2));
    item.boxesCount = CeramicMath.calculateBoxes(newM2, metersPerBox, true);
    item.piecesCount = CeramicMath.calculatePiecesFromBoxes(item.boxesCount, piecesPerBox);
    setCart(updated);
  };

  const updateCartItemPrice = (index: number, newPrice: number) => {
    const updated = [...cart];
    updated[index].unitPrice = Number(newPrice.toFixed(2));
    setCart(updated);
  };

  const removeFromCart = (index: number) => {
    setCart(cart.filter((_, i) => i !== index));
  };

  // Calculations
  const subtotal = cart.reduce((sum, item) => sum + (item.quantityM2 * item.unitPrice) - item.discountAmount, 0);
  const totalAmount = Math.max(0, Number((subtotal - discountAmount + shippingCost).toFixed(2)));
  const remainingAmount = Math.max(0, Number((totalAmount - paidAmount).toFixed(2)));

  // Sync paid amount when total changes if cash
  useEffect(() => {
    if (paymentType === 'CASH') {
      setPaidAmount(totalAmount);
    }
  }, [totalAmount, paymentType]);

  const handleCheckout = () => {
    if (cart.length === 0) {
      alert('السلة فارغة. يرجى إضافة أصناف أولاً.');
      return;
    }
    if (!selectedCustomer) {
      alert('يرجى اختيار العميل.');
      return;
    }
    if (!selectedWarehouseId) {
      alert('يرجى اختيار المخزن.');
      return;
    }

    try {
      setIsProcessing(true);
      const invoice = salesService.createSale({
        customerId: selectedCustomer.id,
        warehouseId: selectedWarehouseId,
        shiftId: activeShift?.id,
        items: cart.map(item => ({
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
        shippingCost,
        paidAmount,
        paymentType,
        notes,
        performedBy: 'usr_admin'
      });

      setSuccessInvoice(invoice);
      // Reset POS cart
      setCart([]);
      setDiscountAmount(0);
      setShippingCost(0);
      setNotes('');
      // Reload products/stock
      setProducts(productService.getAllProducts());
    } catch (e: any) {
      alert(`خطأ أثناء البيع: ${e.message || e}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex h-full overflow-hidden bg-slate-100 dark:bg-slate-950">
      {/* Left: Product Catalog & Fast Search */}
      <div className="flex-1 flex flex-col p-4 space-y-4 overflow-hidden border-l border-slate-200 dark:border-slate-800">
        {/* Search & Filter Header */}
        <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3">
          <form onSubmit={handleBarcodeSearch} className="flex-1 relative">
            <Search className="w-5 h-5 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              ref={barcodeInputRef}
              type="text"
              placeholder="ابحث بالاسم، الباركود، المقاس، كود الصنف (F2)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-4 pr-10 py-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </form>

          {/* Warehouse Selector */}
          <select
            value={selectedWarehouseId}
            onChange={(e) => setSelectedWarehouseId(e.target.value)}
            className="px-3 py-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200"
          >
            {warehouses.map(w => (
              <option key={w.id} value={w.id}>المخزن: {w.name}</option>
            ))}
          </select>
        </div>

        {/* Product Cards Grid */}
        <div className="flex-1 overflow-y-auto grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filteredProducts.length === 0 ? (
            <div className="col-span-full py-16 text-center text-slate-400">
              <AlertCircle className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="font-bold">لا توجد أصناف مطابقة للبحث</p>
            </div>
          ) : (
            filteredProducts.map((p) => {
              const stock = inventoryService.getProductStock(p.id, selectedWarehouseId);
              const available = stock ? stock.availableM2 : 0;
              const isLow = available <= p.minStockLevel;

              return (
                <div
                  key={p.id}
                  onClick={() => addToCart(p)}
                  className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-sky-500 cursor-pointer transition shadow-sm flex flex-col justify-between group"
                >
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-600">
                        {p.grade === 'GRADE_1' ? 'فرز أول' : (p.grade === 'GRADE_2' ? 'فرز ثاني' : 'تجاري')}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">{p.size}</span>
                    </div>
                    <h3 className="font-bold text-xs text-slate-900 dark:text-white line-clamp-2 group-hover:text-sky-600 transition">
                      {p.name}
                    </h3>
                    <div className="text-[11px] text-slate-500 mt-1">
                      الكرتونة: {p.metersPerBox} م² ({p.piecesPerBox} قطع)
                    </div>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-black text-sky-600 dark:text-sky-400">
                        {CeramicMath.formatCurrency(p.sellingPriceM2)} <span className="text-[10px] text-slate-400 font-normal">/م²</span>
                      </div>
                    </div>
                    <div className={`text-[10px] font-bold ${isLow ? 'text-amber-500' : 'text-emerald-500'}`}>
                      المتاح: {available} م²
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right: POS Order Cart & Checkout Panel */}
      <div className="w-96 bg-white dark:bg-slate-900 flex flex-col h-full border-r border-slate-200 dark:border-slate-800 shadow-xl">
        {/* Customer Selector */}
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>العميل</span>
            <span className="text-[11px] text-sky-600 cursor-pointer">عميل جديد +</span>
          </div>
          <select
            value={selectedCustomer?.id || ''}
            onChange={(e) => {
              const cust = customers.find(c => c.id === e.target.value);
              setSelectedCustomer(cust || null);
            }}
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white"
          >
            {customers.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} {c.currentBalance > 0 ? `(مديونية: ${c.currentBalance} ج.م)` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-400">
              <ShoppingCart className="w-12 h-12 mb-2 opacity-30" />
              <p className="text-xs font-bold">السلة فارغة</p>
              <p className="text-[11px]">انقر على أي صنف لإضافته إلى الفاتورة</p>
            </div>
          ) : (
            cart.map((item, idx) => {
              const lineTotal = (item.quantityM2 * item.unitPrice) - item.discountAmount;
              return (
                <div key={idx} className="bg-slate-50 dark:bg-slate-800/80 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700/60 text-xs space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white line-clamp-1">{item.product.name}</div>
                      <div className="text-[10px] text-slate-500">
                        {item.product.size} | {item.boxesCount} كرتونة | {item.piecesCount} قطعة
                      </div>
                    </div>
                    <button
                      onClick={() => removeFromCart(idx)}
                      className="text-slate-400 hover:text-red-500 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Quantity & Unit Price Controllers */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-1">
                      <button
                        onClick={() => updateCartItemQuantity(idx, item.quantityM2 - (item.product.metersPerBox || 1.44))}
                        className="w-5 h-5 flex items-center justify-center text-slate-500 hover:bg-slate-100 rounded"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <input
                        type="number"
                        step="0.01"
                        value={item.quantityM2}
                        onChange={(e) => updateCartItemQuantity(idx, parseFloat(e.target.value) || 0)}
                        className="w-14 text-center font-bold bg-transparent focus:outline-none text-xs"
                      />
                      <span className="text-[10px] text-slate-400">م²</span>
                      <button
                        onClick={() => updateCartItemQuantity(idx, item.quantityM2 + (item.product.metersPerBox || 1.44))}
                        className="w-5 h-5 flex items-center justify-center text-slate-500 hover:bg-slate-100 rounded"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={item.unitPrice}
                        onChange={(e) => updateCartItemPrice(idx, parseFloat(e.target.value) || 0)}
                        className="w-14 text-center font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-1 text-xs"
                      />
                      <span className="text-[10px] text-slate-400">ج.م</span>
                    </div>

                    <div className="font-extrabold text-sky-600 dark:text-sky-400">
                      {CeramicMath.formatCurrency(lineTotal)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Bill Summary & Payment Engine */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-3">
          {/* Discounts and Extras */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label className="text-[10px] font-bold text-slate-500">خصم الفاتورة</label>
              <input
                type="number"
                value={discountAmount || ''}
                placeholder="0"
                onChange={(e) => setDiscountAmount(parseFloat(e.target.value) || 0)}
                className="w-full px-2 py-1 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500">مشال / نقل</label>
              <input
                type="number"
                value={shippingCost || ''}
                placeholder="0"
                onChange={(e) => setShippingCost(parseFloat(e.target.value) || 0)}
                className="w-full px-2 py-1 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold"
              />
            </div>
          </div>

          {/* Payment Type Selection */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 block mb-1">طريقة السداد</label>
            <div className="grid grid-cols-3 gap-1">
              {(['CASH', 'CARD', 'CREDIT'] as PaymentType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setPaymentType(type);
                    if (type === 'CREDIT') setPaidAmount(0);
                    if (type === 'CASH') setPaidAmount(totalAmount);
                  }}
                  className={`py-1.5 rounded-lg text-xs font-bold transition ${
                    paymentType === type
                      ? 'bg-sky-600 text-white'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
                  }`}
                >
                  {type === 'CASH' ? 'نقدي كاش' : (type === 'CARD' ? 'فيزا / بطاقة' : 'آجل بالكامل')}
                </button>
              ))}
            </div>
          </div>

          {/* Paid Amount */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">المبلغ المدفوع:</span>
            <input
              type="number"
              value={paidAmount}
              onChange={(e) => setPaidAmount(parseFloat(e.target.value) || 0)}
              className="w-28 text-left font-black px-2 py-1 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 text-sm"
            />
          </div>

          {/* Totals Box */}
          <div className="bg-sky-500/10 p-2.5 rounded-xl border border-sky-500/20 space-y-1">
            <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
              <span>إجمالي الفاتورة:</span>
              <span className="text-sky-600 dark:text-sky-400 font-extrabold text-sm">{CeramicMath.formatCurrency(totalAmount)}</span>
            </div>
            {remainingAmount > 0 && (
              <div className="flex justify-between text-xs font-bold text-amber-600 dark:text-amber-400">
                <span>المتبقي في حساب العميل:</span>
                <span>{CeramicMath.formatCurrency(remainingAmount)}</span>
              </div>
            )}
          </div>

          {/* Checkout Button */}
          <button
            onClick={handleCheckout}
            disabled={isProcessing || cart.length === 0}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black rounded-xl shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 transition"
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>{isProcessing ? 'جاري الحفظ والخصم من المخزن...' : 'اعتماد وحفظ الفاتورة'}</span>
          </button>
        </div>
      </div>

      {/* Success Modal with Print Trigger */}
      {successInvoice && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-sm w-full text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white">تم إصدار الفاتورة بنجاح!</h3>
            <p className="text-xs text-slate-500 font-medium">
              رقم الفاتورة: <strong className="font-mono text-slate-800 dark:text-slate-200">{successInvoice.invoiceNumber}</strong><br />
              تم خصم الكميات من المخزن وتحديث حساب العميل آلياً.
            </p>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => printService.printInvoice(successInvoice)}
                className="flex-1 py-2.5 bg-sky-600 text-white font-bold rounded-xl flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة الفاتورة</span>
              </button>
              <button
                onClick={() => setSuccessInvoice(null)}
                className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
