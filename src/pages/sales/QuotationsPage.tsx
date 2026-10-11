import React, { useState, useEffect } from 'react';
import {
  FileText, Plus, Search, Calendar, CheckCircle2, ChevronRight, User,
  Printer, ArrowRight, Trash2, Calculator, Check, AlertCircle, Sparkles,
  DollarSign, Clock, ShieldCheck
} from 'lucide-react';
import { DatabaseManager } from '../../database/db';
import { CustomerService } from '../../services/CustomerService';
import { ProductService } from '../../services/ProductService';
import { InventoryService } from '../../services/InventoryService';
import { CloudSyncService } from '../../services/CloudSyncService';
import { PrintService } from '../../services/PrintService';
import { Customer, Product, Warehouse } from '../../types';
import { v4 as uuidv4 } from 'uuid';

interface QuotationItem {
  id?: string;
  productId: string;
  productName: string;
  size?: string;
  grade?: string;
  quantityM2: number;
  boxesCount: number;
  unitPrice: number;
  totalPrice: number;
  metersPerBox: number;
}

interface QuotationRecord {
  id: string;
  quotationNumber: string;
  date: string;
  validUntil: string;
  customerId: string;
  customerName: string;
  customerPhone?: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  status: 'PENDING' | 'CONVERTED' | 'EXPIRED' | 'CANCELLED';
  notes?: string;
  items?: QuotationItem[];
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'بانتظار موافقة العميل', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  CONVERTED: { label: 'تم التحويل لفاتورة مبيعات', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  EXPIRED: { label: 'منتهي الصلاحية', color: 'bg-slate-700 text-slate-400 border-slate-650' },
  CANCELLED: { label: 'ملغي', color: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
};

export const QuotationsPage: React.FC = () => {
  const [quotations, setQuotations] = useState<QuotationRecord[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [isLoading, setIsLoading] = useState(true);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState<QuotationRecord | null>(null);

  // Form states
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [validDays, setValidDays] = useState(15);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [quoteNotes, setQuoteNotes] = useState('');
  const [items, setItems] = useState<QuotationItem[]>([]);

  // Item form inside modal
  const [selectedProdId, setSelectedProdId] = useState('');
  const [itemQuantityM2, setItemQuantityM2] = useState<number>(14.4);

  const customerService = new CustomerService();
  const productService = new ProductService();
  const inventoryService = new InventoryService();
  const syncService = new CloudSyncService();
  const printService = new PrintService();

  const loadData = () => {
    setIsLoading(true);
    const db = DatabaseManager.getInstance().getDb();
    if (!db) {
      setIsLoading(false);
      return;
    }

    try {
      const allCusts = customerService.getAllCustomers();
      const allProds = productService.getAllProducts();
      const allWhs = inventoryService.getAllWarehouses();
      setCustomers(allCusts);
      setProducts(allProds);
      setWarehouses(allWhs);

      if (allCusts.length > 0 && !selectedCustomerId) {
        setSelectedCustomerId(allCusts[0].id);
      }
      if (allProds.length > 0 && !selectedProdId) {
        setSelectedProdId(allProds[0].id);
      }

      // Query quotations
      const res = db.exec(`
        SELECT q.id, q.quotation_number, q.date, q.valid_until, q.customer_id,
               c.name as customer_name, c.phone as customer_phone,
               q.subtotal, q.discount_amount, q.tax_amount, q.total_amount,
               q.status, q.notes
        FROM quotations q
        LEFT JOIN customers c ON q.customer_id = c.id
        ORDER BY q.date DESC, q.created_at DESC
      `);

      if (res.length > 0 && res[0].values.length > 0) {
        const rows = res[0].values.map((r: any[]) => ({
          id: String(r[0]),
          quotationNumber: String(r[1]),
          date: String(r[2]),
          validUntil: String(r[3]),
          customerId: String(r[4]),
          customerName: String(r[5] || 'عميل نقدي'),
          customerPhone: r[6] ? String(r[6]) : undefined,
          subtotal: Number(r[7] || 0),
          discountAmount: Number(r[8] || 0),
          taxAmount: Number(r[9] || 0),
          totalAmount: Number(r[10] || 0),
          status: (r[11] || 'PENDING') as any,
          notes: r[12] ? String(r[12]) : undefined,
        }));
        setQuotations(rows);
      } else {
        // Seed initial quotations if none exist
        if (allCusts.length > 0 && allProds.length > 0) {
          const cust = allCusts[0];
          const prod = allProds[0];
          const today = new Date().toISOString().split('T')[0];
          const nextWeek = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
          const seedId = uuidv4();
          const qM2 = 45;
          const price = prod.sellingPriceM2 || 180;
          const total = qM2 * price;

          db.run(`
            INSERT INTO quotations (id, quotation_number, date, valid_until, customer_id, customer_name, subtotal, total_amount, status, created_by)
            VALUES (?, 'QTN-2026-001', ?, ?, ?, ?, ?, ?, 'PENDING', 'usr_admin')
          `, [seedId, today, nextWeek, cust.id, cust.name, total, total]);

          db.run(`
            INSERT INTO quotation_items (id, quotation_id, product_id, product_name, grade, quantity_m2, boxes_count, unit_price, total_price)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [uuidv4(), seedId, prod.id, prod.name, prod.grade, qM2, Math.ceil(qM2 / (prod.metersPerBox || 1.44)), price, total]);

          DatabaseManager.getInstance().saveToStorage();
          loadData();
          return;
        }
      }
    } catch (e) {
      console.error('Error loading quotations', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddItem = () => {
    const prod = products.find(p => p.id === selectedProdId);
    if (!prod) return;

    const metersPerBox = prod.metersPerBox || 1.44;
    const boxes = Math.ceil(itemQuantityM2 / metersPerBox);
    const unitPrice = prod.sellingPriceM2 || 0;
    const totalPrice = itemQuantityM2 * unitPrice;

    setItems(prev => [
      ...prev,
      {
        productId: prod.id,
        productName: prod.name,
        size: prod.size,
        grade: prod.grade,
        quantityM2: itemQuantityM2,
        boxesCount: boxes,
        unitPrice,
        totalPrice,
        metersPerBox,
      }
    ]);
  };

  const handleRemoveItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const subtotal = items.reduce((acc, i) => acc + i.totalPrice, 0);
  const totalAmount = Math.max(0, subtotal - discountAmount);

  const handleCreateQuotation = (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) {
      alert('يرجى إضافة بند واحد على الأقل لعرض السعر');
      return;
    }

    const db = DatabaseManager.getInstance().getDb();
    if (!db) return;

    try {
      const qId = uuidv4();
      const qNum = `QTN-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
      const dateStr = new Date().toISOString().split('T')[0];
      const validUntilStr = new Date(Date.now() + validDays * 86400000).toISOString().split('T')[0];

      const cust = customers.find(c => c.id === selectedCustomerId);

      db.run(`
        INSERT INTO quotations (id, quotation_number, date, valid_until, customer_id, customer_name, customer_phone, subtotal, discount_amount, total_amount, status, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, 'usr_admin')
      `, [
        qId,
        qNum,
        dateStr,
        validUntilStr,
        selectedCustomerId,
        cust?.name || 'عميل نقدي',
        cust?.phone || '',
        subtotal,
        discountAmount,
        totalAmount,
        quoteNotes
      ]);

      for (const itm of items) {
        db.run(`
          INSERT INTO quotation_items (id, quotation_id, product_id, product_name, grade, quantity_m2, boxes_count, unit_price, total_price)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          uuidv4(),
          qId,
          itm.productId,
          itm.productName,
          itm.grade || 'GRADE_1',
          itm.quantityM2,
          itm.boxesCount,
          itm.unitPrice,
          itm.totalPrice
        ]);
      }

      DatabaseManager.getInstance().saveToStorage();
      syncService.queueChange('quotations', qId, 'INSERT', { quotationNumber: qNum, totalAmount });

      setShowCreateModal(false);
      setItems([]);
      setDiscountAmount(0);
      setQuoteNotes('');
      loadData();
    } catch (err: any) {
      alert(`خطأ أثناء إنشاء عرض السعر: ${err?.message}`);
    }
  };

  const handleConvertToInvoice = (quote: QuotationRecord) => {
    if (quote.status === 'CONVERTED') {
      alert('تم تحويل هذا العرض إلى فاتورة بالفعل.');
      return;
    }

    const confirmConvert = window.confirm(`هل أنت متأكد من تحويل عرض السعر (${quote.quotationNumber}) إلى فاتورة مبيعات معتمدة؟ سيتم خصم الكميات من المخزن.`);
    if (!confirmConvert) return;

    const db = DatabaseManager.getInstance().getDb();
    if (!db) return;

    try {
      const whId = warehouses[0]?.id || 'wh_main';
      const invId = uuidv4();
      const invNum = `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const nowStr = new Date().toISOString();

      // Retrieve items
      const itemsRes = db.exec(`
        SELECT qi.product_id, qi.product_name, qi.quantity_m2, qi.boxes_count, qi.unit_price, qi.total_price,
               p.sku, p.cost_price, p.meters_per_box, p.pieces_per_box, p.grade, p.size
        FROM quotation_items qi
        JOIN products p ON qi.product_id = p.id
        WHERE qi.quotation_id = ?
      `, [quote.id]);

      let invoiceItems: any[] = [];
      let totalCost = 0;

      if (itemsRes.length > 0 && itemsRes[0].values.length > 0) {
        invoiceItems = itemsRes[0].values.map((r: any[]) => {
          const cost = Number(r[7] || 0) * Number(r[2] || 0);
          totalCost += cost;
          return {
            id: uuidv4(),
            productId: String(r[0]),
            productName: String(r[1]),
            quantityM2: Number(r[2]),
            boxesCount: Number(r[3]),
            unitPrice: Number(r[4]),
            totalPrice: Number(r[5]),
            sku: String(r[6]),
            unitCost: Number(r[7] || 0),
            metersPerBox: Number(r[8] || 1.44),
            piecesPerBox: Number(r[9] || 4),
            grade: String(r[10] || 'GRADE_1'),
            size: String(r[11] || '60x60'),
          };
        });
      }

      // Insert Sales Invoice
      db.run(`
        INSERT INTO sales_invoices (
          id, invoice_number, date, customer_id, warehouse_id,
          subtotal, discount_amount, total_amount, paid_amount, remaining_amount,
          payment_type, payment_status, invoice_status, total_cost, gross_profit,
          notes, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CREDIT', 'UNPAID', 'COMPLETED', ?, ?, ?, 'usr_admin', ?, ?)
      `, [
        invId,
        invNum,
        nowStr.split('T')[0],
        quote.customerId,
        whId,
        quote.subtotal,
        quote.discountAmount,
        quote.totalAmount,
        0,
        quote.totalAmount,
        totalCost,
        quote.totalAmount - totalCost,
        `تم التحويل من عرض سعر: ${quote.quotationNumber}`,
        nowStr,
        nowStr
      ]);

      // Insert Items and deduct stock
      for (const item of invoiceItems) {
        db.run(`
          INSERT INTO sales_invoice_items (
            id, invoice_id, product_id, product_name, product_sku, product_grade, size,
            sold_by, quantity_m2, boxes_count, pieces_count, unit_price, original_unit_price,
            unit_cost, total_price, total_cost, profit, meters_per_box, pieces_per_box
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'M2', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          item.id,
          invId,
          item.productId,
          item.productName,
          item.sku,
          item.grade,
          item.size,
          item.quantityM2,
          item.boxesCount,
          item.boxesCount * item.piecesPerBox,
          item.unitPrice,
          item.unitPrice,
          item.unitCost,
          item.totalPrice,
          item.quantityM2 * item.unitCost,
          item.totalPrice - (item.quantityM2 * item.unitCost),
          item.metersPerBox,
          item.piecesPerBox
        ]);

        // Deduct warehouse stock
        db.run(`
          UPDATE warehouse_stock
          SET quantity_m2 = quantity_m2 - ?,
              last_updated = CURRENT_TIMESTAMP
          WHERE warehouse_id = ? AND product_id = ?
        `, [item.quantityM2, whId, item.productId]);

        // Add inventory transaction
        db.run(`
          INSERT INTO inventory_transactions (
            id, transaction_number, type, product_id, warehouse_id,
            quantity_m2, boxes_count, unit_cost, total_cost, reference_type,
            reference_id, notes, performed_by
          ) VALUES (?, ?, 'SALE', ?, ?, ?, ?, ?, ?, 'INVOICE', ?, ?, 'usr_admin')
        `, [
          uuidv4(),
          `TX-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          item.productId,
          whId,
          -item.quantityM2,
          item.boxesCount,
          item.unitCost,
          item.quantityM2 * item.unitCost,
          invId,
          `تحويل من عرض سعر ${quote.quotationNumber}`
        ]);
      }

      // Update customer balance
      db.run(`
        UPDATE customers
        SET current_balance = current_balance + ?,
            total_purchases = total_purchases + ?
        WHERE id = ?
      `, [quote.totalAmount, quote.totalAmount, quote.customerId]);

      // Mark quote as converted
      db.run(`UPDATE quotations SET status = 'CONVERTED' WHERE id = ?`, [quote.id]);

      DatabaseManager.getInstance().saveToStorage();
      syncService.queueChange('sales_invoices', invId, 'INSERT', { invoiceNumber: invNum, totalAmount: quote.totalAmount });

      alert(`✅ تم تحويل عرض السعر بنجاح إلى فاتورة مبيعات معتمدة رقم: ${invNum}\nتم خصم المخزون وتحديث رصيد العميل.`);
      loadData();
    } catch (err: any) {
      alert(`خطأ أثناء تحويل العرض: ${err?.message}`);
    }
  };

  const handleOpenPrint = (quote: QuotationRecord) => {
    const db = DatabaseManager.getInstance().getDb();
    if (!db) return;

    try {
      const itemsRes = db.exec(`
        SELECT qi.product_name, qi.quantity_m2, qi.boxes_count, qi.unit_price, qi.total_price, p.size, qi.grade
        FROM quotation_items qi
        LEFT JOIN products p ON qi.product_id = p.id
        WHERE qi.quotation_id = ?
      `, [quote.id]);

      let quoteItems: QuotationItem[] = [];
      if (itemsRes.length > 0 && itemsRes[0].values.length > 0) {
        quoteItems = itemsRes[0].values.map((r: any[]) => ({
          productId: '',
          productName: String(r[0]),
          quantityM2: Number(r[1]),
          boxesCount: Number(r[2]),
          unitPrice: Number(r[3]),
          totalPrice: Number(r[4]),
          size: r[5] ? String(r[5]) : '',
          grade: r[6] ? String(r[6]) : '',
          metersPerBox: 1.44,
        }));
      }

      setShowPrintModal({ ...quote, items: quoteItems });
    } catch (e) {
      console.error(e);
    }
  };

  const filtered = quotations.filter(q => {
    const matchesSearch =
      q.quotationNumber.toLowerCase().includes(search.toLowerCase()) ||
      q.customerName.includes(search) ||
      (q.customerPhone && q.customerPhone.includes(search));
    const matchesStatus = statusFilter === 'ALL' || q.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const fmt = (n: number) => new Intl.NumberFormat('ar-EG').format(n) + ' ج';

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <FileText className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-base font-black text-white">إدارة عروض الأسعار والمقايسات (Quotations & Estimates)</h1>
            <p className="text-xs text-slate-400 font-medium">
              إنشاء مقايسات السيراميك، طباعة العروض الرسمية، والتحويل المباشر إلى فواتير مبيعات معتمدة
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white rounded-xl text-xs font-bold transition shrink-0 shadow-lg shadow-amber-600/20 active:scale-95"
        >
          <Plus className="w-4 h-4" />
          إنشاء عرض أسعار جديد
        </button>
      </div>

      {/* Toolbar & Filters */}
      <div className="p-4 bg-slate-900/50 border-b border-slate-800/80 flex flex-col sm:flex-row gap-3 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="بحث برقم العرض، اسم العميل، أو الهاتف..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-4 pr-10 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/50 transition font-medium"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">جميع الحالات</option>
            <option value="PENDING">بانتظار الرد (نشط)</option>
            <option value="CONVERTED">تم التحويل لفاتورة</option>
            <option value="EXPIRED">منتهي الصلاحية</option>
          </select>
        </div>
      </div>

      {/* Quotations Cards Grid */}
      <div className="flex-1 overflow-y-auto p-5">
        {filtered.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center">
            <FileText className="w-12 h-12 text-slate-700 mb-2" />
            <div className="text-sm font-bold text-slate-400">لا توجد عروض أسعار مطابقة للبحث</div>
            <p className="text-xs text-slate-500 mt-1">اضغط على زر "إنشاء عرض أسعار جديد" لإصدار مقايسة للعميل.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((q) => {
              const st = STATUS_LABELS[q.status] || STATUS_LABELS.PENDING;
              return (
                <div
                  key={q.id}
                  className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 transition flex flex-col justify-between shadow-sm"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/20">
                        {q.quotationNumber}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${st.color}`}>
                        {st.label}
                      </span>
                    </div>

                    <h3 className="font-bold text-white text-sm mb-1">{q.customerName}</h3>
                    {q.customerPhone && (
                      <p className="text-[11px] text-slate-500 mb-3 font-mono">{q.customerPhone}</p>
                    )}

                    <div className="space-y-1.5 text-xs text-slate-400 mb-4 bg-slate-950/40 p-3 rounded-xl border border-slate-800/60">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-slate-500 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-600" />
                          تاريخ العرض:
                        </span>
                        <span className="font-mono text-slate-300">{q.date}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-slate-500 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-600" />
                          صالح لغاية:
                        </span>
                        <span className="font-mono text-slate-300">{q.validUntil}</span>
                      </div>
                    </div>

                    <div className="bg-slate-950/80 rounded-xl p-3 border border-slate-800 flex items-center justify-between">
                      <span className="text-xs text-slate-400">إجمالي قيمة المقايسة:</span>
                      <span className="text-sm font-black text-emerald-400">{fmt(q.totalAmount)}</span>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleOpenPrint(q)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      معاينة وطباعة
                    </button>

                    {q.status === 'PENDING' && (
                      <button
                        onClick={() => handleConvertToInvoice(q)}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-emerald-600/20 active:scale-95"
                      >
                        <Check className="w-3.5 h-3.5" />
                        تحويل لفاتورة
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Quotation Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh] animate-scaleIn">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
              <div className="flex items-center gap-2.5">
                <FileText className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-black text-white">إصدار مقايسة وعرض أسعار سيراميك جديد</h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white text-lg font-mono p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateQuotation} className="p-6 overflow-y-auto space-y-5 flex-1">
              {/* Customer & Validity */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">العميل المستهدف</label>
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">مدة صلاحية العرض (أيام)</label>
                  <input
                    type="number"
                    min="1"
                    max="90"
                    value={validDays}
                    onChange={(e) => setValidDays(Number(e.target.value) || 15)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
              </div>

              {/* Add Item Row */}
              <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80 space-y-3">
                <span className="text-xs font-bold text-slate-300 block">إضافة أصناف السيراميك إلى المقايسة</span>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                  <div className="sm:col-span-7">
                    <label className="block text-[11px] text-slate-400 mb-1">الصنف</label>
                    <select
                      value={selectedProdId}
                      onChange={(e) => setSelectedProdId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                    >
                      {products.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.size}) - {p.sellingPriceM2} ج/م²
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-3">
                    <label className="block text-[11px] text-slate-400 mb-1">الكمية بالمتر (م²)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.1"
                      value={itemQuantityM2}
                      onChange={(e) => setItemQuantityM2(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <button
                      type="button"
                      onClick={handleAddItem}
                      className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      إضافة
                    </button>
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <div>
                <span className="text-xs font-bold text-slate-300 block mb-2">بنود المقايسة المضافة ({items.length})</span>
                {items.length === 0 ? (
                  <div className="p-6 rounded-2xl bg-slate-950/40 border border-slate-800/60 text-center text-xs text-slate-500">
                    لم يتم إضافة أي أصناف بعد. اختر صنفاً وأضفه أعلاه.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-800">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                        <tr>
                          <th className="p-2.5">الصنف</th>
                          <th className="p-2.5">المقاس والفرز</th>
                          <th className="p-2.5">الكمية (م²)</th>
                          <th className="p-2.5">الكراتين</th>
                          <th className="p-2.5">سعر المتر</th>
                          <th className="p-2.5">الإجمالي</th>
                          <th className="p-2.5 text-center">إجراء</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50 bg-slate-900/40">
                        {items.map((itm, idx) => (
                          <tr key={idx} className="hover:bg-slate-850/40">
                            <td className="p-2.5 font-bold text-white">{itm.productName}</td>
                            <td className="p-2.5 text-slate-400">{itm.size || '60x60'} - فرز أول</td>
                            <td className="p-2.5 font-mono text-amber-400">{itm.quantityM2} م²</td>
                            <td className="p-2.5 font-mono text-slate-300">{itm.boxesCount} كرتونة</td>
                            <td className="p-2.5 font-mono text-slate-300">{fmt(itm.unitPrice)}</td>
                            <td className="p-2.5 font-mono font-bold text-emerald-400">{fmt(itm.totalPrice)}</td>
                            <td className="p-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(idx)}
                                className="text-rose-400 hover:text-rose-300 p-1"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Discount & Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">الخصم الإجمالي (ج.م)</label>
                  <input
                    type="number"
                    min="0"
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(Number(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">شروط وملاحظات المقايسة</label>
                  <input
                    type="text"
                    placeholder="مثال: الأسعار شاملة المشال والنقل لأرض الموقع"
                    value={quoteNotes}
                    onChange={(e) => setQuoteNotes(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Total Summary */}
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between">
                <span className="text-xs font-bold text-amber-300">صافي قيمة المقايسة النهائية:</span>
                <span className="text-base font-black text-emerald-400">{fmt(totalAmount)}</span>
              </div>

              {/* Actions */}
              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-amber-600/20 transition active:scale-95"
                >
                  حفظ وتأكيد عرض السعر
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Print Preview Modal */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white text-slate-900 rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[95vh] animate-scaleIn">
            <div className="bg-slate-100 px-6 py-4 border-b border-slate-200 flex items-center justify-between no-print">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-slate-700" />
                <span className="text-sm font-bold text-slate-800">معاينة طباعة المقايسة الرسمية A4</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold"
                >
                  طباعة الآن
                </button>
                <button
                  onClick={() => setShowPrintModal(null)}
                  className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-semibold font-mono"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-8 overflow-y-auto space-y-6 flex-1 text-slate-900" id="quotation-print-sheet">
              {/* Showroom Header */}
              <div className="flex items-start justify-between border-b-2 border-slate-900 pb-5">
                <div>
                  <h1 className="text-xl font-black text-slate-900">معرض الأندلس للسيراميك والبورسلين</h1>
                  <p className="text-xs text-slate-600 mt-1">كافة أنواع السيراميك والبورسلين والتشطيبات الفاخرة</p>
                  <p className="text-xs text-slate-500 mt-0.5">الهاتف: 01012345678 - 01234567890 | الرقم الضريبي: 123-456-789</p>
                </div>
                <div className="text-left font-mono">
                  <div className="text-sm font-black text-slate-900">عرض أسعار رسمي</div>
                  <div className="text-xs font-bold text-sky-700 mt-1">{showPrintModal.quotationNumber}</div>
                  <div className="text-[11px] text-slate-500 mt-1">التاريخ: {showPrintModal.date}</div>
                </div>
              </div>

              {/* Customer Box */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-500 block">السيد / السادة المحترمون:</span>
                  <span className="text-sm font-bold text-slate-900">{showPrintModal.customerName}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">صالح لغاية:</span>
                  <span className="font-bold font-mono text-slate-800">{showPrintModal.validUntil}</span>
                </div>
              </div>

              {/* Items Table */}
              <table className="w-full text-right text-xs border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-900 bg-slate-100">
                    <th className="p-2">#</th>
                    <th className="p-2">بيان الصنف والمقاس</th>
                    <th className="p-2">الكمية (م²)</th>
                    <th className="p-2">الكراتين</th>
                    <th className="p-2">سعر المتر</th>
                    <th className="p-2">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {showPrintModal.items?.map((itm, i) => (
                    <tr key={i}>
                      <td className="p-2 font-mono">{i + 1}</td>
                      <td className="p-2 font-bold">{itm.productName} ({itm.size || '60x60'})</td>
                      <td className="p-2 font-mono">{itm.quantityM2} م²</td>
                      <td className="p-2 font-mono">{itm.boxesCount}</td>
                      <td className="p-2 font-mono">{fmt(itm.unitPrice)}</td>
                      <td className="p-2 font-mono font-bold">{fmt(itm.totalPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Total Calculation */}
              <div className="flex justify-end pt-4 border-t-2 border-slate-900">
                <div className="w-64 space-y-2 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>الإجمالي قبل الخصم:</span>
                    <span className="font-mono font-bold">{fmt(showPrintModal.subtotal)}</span>
                  </div>
                  {showPrintModal.discountAmount > 0 && (
                    <div className="flex justify-between text-rose-600">
                      <span>الخصم الممنوح:</span>
                      <span className="font-mono font-bold">-{fmt(showPrintModal.discountAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-black border-t pt-2 border-slate-300">
                    <span>الصافي المطلوب:</span>
                    <span className="font-mono text-sky-800">{fmt(showPrintModal.totalAmount)}</span>
                  </div>
                </div>
              </div>

              {/* Signatures */}
              <div className="pt-10 grid grid-cols-2 gap-8 text-center text-xs text-slate-600">
                <div>
                  <p className="font-bold mb-8">توقيع المستلم / العميل بالقبول</p>
                  <p className="border-b border-dashed border-slate-400 w-48 mx-auto"></p>
                </div>
                <div>
                  <p className="font-bold mb-8">إدارة المبيعات / المعرض</p>
                  <p className="border-b border-dashed border-slate-400 w-48 mx-auto"></p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};