import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  BookmarkPlus, Package, Loader2, X, CheckCheck, Clock, RefreshCw, Boxes,
  DollarSign, Search, Calendar, ChevronLeft, ChevronRight, AlertTriangle,
  Receipt, ArrowUpRight, CheckCircle2, ShieldAlert, Plus, Printer, User, Warehouse
} from 'lucide-react';
import { ReservationService, StockReservation } from '../../services/ReservationService';
import { OrderService, Order } from '../../services/OrderService';
import { ProductService } from '../../services/ProductService';
import { OperationsService } from '../../services/OperationsService';
import { CustomerService } from '../../services/CustomerService';
import { useToast } from '../../components/ui/Toast';
import { Product, Customer } from '../../types';
import { PrintService } from '../../services/PrintService';
import { formatProductQuantity, getProductUnitLabel } from '../../utils/productUnits';

const fmtCurrency = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n) || 0) + ' ج';

const reservationStatusStyles: Record<string, string> = {
  ACTIVE: 'bg-sky-50 text-sky-700 border-sky-200',
  RELEASED: 'bg-slate-100 text-slate-500 border-slate-200',
  CONSUMED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  EXPIRED: 'bg-amber-50 text-amber-700 border-amber-200',
};

const reservationStatusLabels: Record<string, string> = {
  ACTIVE: 'نشط ومحجوز',
  RELEASED: 'مُفرج عنه',
  CONSUMED: 'تم التنفيذ والصرف',
  EXPIRED: 'منتهي الصلاحية',
};

const orderStatusLabels: Record<string, string> = {
  PENDING: 'قيد الانتظار',
  CONFIRMED: 'مؤكد',
  PROCESSING: 'قيد التجهيز',
  PARTIAL: 'تسليم جزئي',
  COMPLETED: 'مكتمل ومفوتر',
  CANCELLED: 'ملغي',
};

const orderStatusBadges: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  CONFIRMED: 'bg-blue-50 text-blue-700 border-blue-200',
  PROCESSING: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  PARTIAL: 'bg-purple-50 text-purple-700 border-purple-200',
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CANCELLED: 'bg-rose-50 text-rose-700 border-rose-200',
};

export const ReservationsDepositPage: React.FC = () => {
  const toast = useToast();
  const resService = useMemo(() => new ReservationService(), []);
  const orderService = useMemo(() => new OrderService(), []);
  const printService = useMemo(() => new PrintService(), []);

  const [activeTab, setActiveTab] = useState<'orders' | 'reservations'>('orders');
  const [loading, setLoading] = useState(true);

  // Data states
  const [reservations, setReservations] = useState<StockReservation[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Array<{ id: string; name: string }>>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  // Filter states
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modal states
  const [showNewResModal, setShowNewResModal] = useState(false);
  const [newResForm, setNewResForm] = useState({
    productId: '',
    warehouseId: '',
    quantityM2: '',
    referenceType: 'MANUAL' as 'ORDER' | 'QUOTATION' | 'PROJECT' | 'MANUAL',
    referenceId: '',
    expiresAt: '',
    notes: '',
  });
  const [availability, setAvailability] = useState<{ onHand: number; reserved: number; available: number } | null>(null);

  // Deposit modal
  const [depositModalOrder, setDepositModalOrder] = useState<Order | null>(null);
  const [depositAmount, setDepositAmount] = useState<string>('');
  const [depositPaymentType, setDepositPaymentType] = useState<'CASH' | 'CARD' | 'BANK_TRANSFER'>('CASH');
  const [depositNotes, setDepositNotes] = useState('');
  const [submittingDeposit, setSubmittingDeposit] = useState(false);

  // Load all data
  const loadData = useCallback(() => {
    setLoading(true);
    try {
      setReservations(resService.getReservations({ status: statusFilter, search }));
      setOrders(orderService.getOrders(search, statusFilter === 'ALL' ? 'ALL' : statusFilter as any));
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تحميل بيانات الحجوزات.');
    } finally {
      setLoading(false);
    }
  }, [resService, orderService, statusFilter, search, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    try {
      setProducts(new ProductService().getAllProducts());
      setWarehouses(new OperationsService().getWarehouses());
      setCustomers(new CustomerService().getAllCustomers());
    } catch (e: any) {
      console.error(e);
    }
  }, []);

  // Update availability when product/warehouse change in new reservation form
  useEffect(() => {
    if (!newResForm.productId || !newResForm.warehouseId) {
      setAvailability(null);
      return;
    }
    try {
      setAvailability(resService.getAvailability(newResForm.productId, newResForm.warehouseId));
    } catch {
      setAvailability(null);
    }
  }, [newResForm.productId, newResForm.warehouseId, resService]);

  // Handle release reservation
  const handleRelease = (id: string) => {
    if (!window.confirm('هل أنت متأكد من إلغاء فك حجز هذه الكمية وإعادتها للمخزون الحر؟')) return;
    try {
      resService.releaseReservation(id, 'RELEASED');
      toast.success('تم فك حجز الكمية بنجاح.');
      loadData();
    } catch (e: any) {
      toast.error(e?.message || 'فشل فك الحجز.');
    }
  };

  // Handle consume reservation
  const handleConsume = (id: string) => {
    if (!window.confirm('هل تريد تأكيد صرف الكمية المحجوزة من المخزن فعلياً؟')) return;
    try {
      resService.consumeReservation(id);
      toast.success('تم صرف الكمية المحجوزة وتحديث المخزون بنجاح.');
      loadData();
    } catch (e: any) {
      toast.error(e?.message || 'فشل تنفيذ الحجز.');
    }
  };

  // Handle create reservation
  const handleCreateReservation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newResForm.productId || !newResForm.warehouseId || !newResForm.quantityM2) {
      toast.warning('يرجى ملء جميع الحقول الإلزامية.');
      return;
    }
    const qty = Number(newResForm.quantityM2);
    if (qty <= 0) {
      toast.warning('الكمية يجب أن تكون أكبر من صفر.');
      return;
    }
    if (availability && qty > availability.available) {
      const product = products.find((item) => item.id === newResForm.productId);
      const unit = product ? getProductUnitLabel(product) : 'الوحدة';
      toast.error(`الكمية المتاحة (${availability.available} ${unit}) غير كافية.`);
      return;
    }

    try {
      resService.createReservation({
        productId: newResForm.productId,
        warehouseId: newResForm.warehouseId,
        quantityM2: qty,
        referenceType: newResForm.referenceType,
        referenceId: newResForm.referenceId || undefined,
        expiresAt: newResForm.expiresAt || undefined,
        notes: newResForm.notes || undefined,
      });
      toast.success('تم تسجيل الحجز وتجميد الكمية بالمخزن بنجاح.');
      setShowNewResModal(false);
      setNewResForm({
        productId: '',
        warehouseId: '',
        quantityM2: '',
        referenceType: 'MANUAL',
        referenceId: '',
        expiresAt: '',
        notes: '',
      });
      loadData();
    } catch (e: any) {
      toast.error(e?.message || 'تعذر إنشاء الحجز.');
    }
  };

  // Handle Record Deposit
  const handleSaveDeposit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!depositModalOrder) return;
    const amount = Number(depositAmount);
    if (!amount || amount <= 0) {
      toast.warning('يرجى إدخال مبلغ صحيح للعربون.');
      return;
    }
    if (amount > depositModalOrder.remainingAmount) {
      toast.warning(`مبلغ العربون (${amount} ج) يتجاوز المتبقي (${depositModalOrder.remainingAmount} ج).`);
      return;
    }

    setSubmittingDeposit(true);
    try {
      orderService.recordDeposit(depositModalOrder.id, amount, depositPaymentType, depositNotes);
      toast.success(`تم تسجيل عربون بقيمة ${fmtCurrency(amount)} للطلب بنجاح.`);
      setDepositModalOrder(null);
      setDepositAmount('');
      setDepositNotes('');
      loadData();
    } catch (e: any) {
      toast.error(e?.message || 'فشل تسجيل العربون.');
    } finally {
      setSubmittingDeposit(false);
    }
  };

  // Handle Convert Order to Invoice
  const handleConvertToInvoice = (order: Order) => {
    if (order.status === 'COMPLETED') {
      toast.info('هذا الطلب تم إصدار فاتورة له مسبقاً.');
      return;
    }
    if (!window.confirm(`هل تريد تحويل الطلب رقم "${order.orderNumber}" إلى فاتورة مبيعات معتمدة وصرف البضاعة؟`)) return;
    try {
      const inv = orderService.convertToInvoice(order.id, {
        paidAmount: order.paidAmount,
        paymentType: order.remainingAmount <= 0 ? 'CASH' : 'CREDIT',
        notes: `تحويل طلب حجز رقم ${order.orderNumber}`,
      });
      toast.success(`تم إنشاء الفاتورة بنجاح برقم: ${inv.invoiceNumber}`);
      loadData();
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحويل الطلب إلى فاتورة.');
    }
  };

  // Compute stats
  const activeReservationsCount = reservations.filter((r) => r.status === 'ACTIVE').length;
  const reservedByUnit = new Map<string, number>();
  reservations.filter((r) => r.status === 'ACTIVE').forEach((reservation) => {
    const unit = getProductUnitLabel(reservation);
    reservedByUnit.set(unit, (reservedByUnit.get(unit) || 0) + Number(reservation.quantityM2 || 0));
  });
  const pendingOrdersCount = orders.filter((o) => o.status === 'PENDING' || o.status === 'CONFIRMED').length;
  const totalDepositsCollected = orders.reduce((sum, o) => sum + Number(o.paidAmount || 0), 0);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-700">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-sky-600/10 text-sky-600 dark:bg-sky-500/20 dark:text-sky-400">
              <BookmarkPlus className="w-6 h-6" />
            </span>
            إدارة الحجوزات والعربونات (Sales Reservations & Deposits)
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            حجز كميات البضاعة، إدارة العربونات والمقدمات للطلبات الكبيرة، ومنع بيع البضاعة المحجوزة
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              resService.expireOverdue();
              loadData();
              toast.info('تم فحص وتحديث الحجوزات منتهية الصلاحية تلقائياً.');
            }}
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-xl transition flex items-center gap-1.5"
            title="فحص الحجوزات المنتهية"
          >
            <Clock className="w-4 h-4 text-amber-500" />
            تحديث الصلاحيات
          </button>
          <button
            onClick={() => setShowNewResModal(true)}
            className="px-4 py-2 text-sm font-bold text-white bg-sky-600 hover:bg-sky-500 rounded-xl shadow-sm hover:shadow transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            حجز كمية بضاعة يدوياً
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-sky-50 dark:bg-sky-950/50 flex items-center justify-center text-sky-600 dark:text-sky-400">
            <BookmarkPlus className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">حجوزات نشطة حالياً</div>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">{activeReservationsCount}</div>
            <div className="text-[11px] text-sky-600 dark:text-sky-400 font-semibold mt-0.5">بضاعة محجوزة ومجمدة</div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <Boxes className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">إجمالي الكمية المحجوزة</div>
            <div className="text-lg font-black text-slate-900 dark:text-white mt-0.5">{[...reservedByUnit].map(([unit, quantity]) => `${quantity.toLocaleString('ar-EG')} ${unit}`).join(' · ') || '0'}</div>
            <div className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold mt-0.5">في جميع المخازن</div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600 dark:text-amber-400">
            <Receipt className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">طلبات حجز بانتظار الفوترة</div>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">{pendingOrdersCount}</div>
            <div className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold mt-0.5">طلبات معلقة ومؤكدة</div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">إجمالي العربونات المحصلة</div>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">{fmtCurrency(totalDepositsCollected)}</div>
            <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">مقدمات طلبات العملاء</div>
          </div>
        </div>
      </div>

      {/* Tabs & Controls */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
        {/* Navigation Tabs */}
        <div className="flex bg-slate-100 dark:bg-slate-700/60 p-1 rounded-xl w-full md:w-auto">
          <button
            onClick={() => setActiveTab('orders')}
            className={`flex-1 md:flex-initial px-5 py-2 rounded-lg text-sm font-bold transition flex items-center justify-center gap-2 ${
              activeTab === 'orders'
                ? 'bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
            }`}
          >
            <Receipt className="w-4 h-4" />
            طلبات الحجز والعربونات ({orders.length})
          </button>
          <button
            onClick={() => setActiveTab('reservations')}
            className={`flex-1 md:flex-initial px-5 py-2 rounded-lg text-sm font-bold transition flex items-center justify-center gap-2 ${
              activeTab === 'reservations'
                ? 'bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
            }`}
          >
            <BookmarkPlus className="w-4 h-4" />
            سجل حجز الأصناف بالمخازن ({reservations.length})
          </button>
        </div>

        {/* Search & Filters */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="بحث بالرقم أو العميل أو الصنف..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-3 pr-9 py-2 text-sm bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="ALL">جميع الحالات</option>
            {activeTab === 'orders' ? (
              <>
                <option value="PENDING">قيد الانتظار</option>
                <option value="CONFIRMED">مؤكد</option>
                <option value="PROCESSING">قيد التجهيز</option>
                <option value="COMPLETED">مكتمل ومفوتر</option>
                <option value="CANCELLED">ملغي</option>
              </>
            ) : (
              <>
                <option value="ACTIVE">نشط</option>
                <option value="RELEASED">مُفرج</option>
                <option value="CONSUMED">مُنفّذ</option>
                <option value="EXPIRED">منتهي</option>
              </>
            )}
          </select>

          <button
            onClick={loadData}
            className="p-2 text-slate-600 hover:text-sky-600 dark:text-slate-300 dark:hover:text-sky-400 bg-slate-100 dark:bg-slate-700 rounded-xl transition"
            title="تحديث البيانات"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-16 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700">
          <Loader2 className="w-8 h-8 text-sky-600 animate-spin mb-3" />
          <p className="text-sm text-slate-500">جاري تحميل البيانات...</p>
        </div>
      ) : activeTab === 'orders' ? (
        /* Orders & Deposits Table */
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-3.5">رقم الطلب</th>
                  <th className="p-3.5">العميل</th>
                  <th className="p-3.5">المخزن</th>
                  <th className="p-3.5">إجمالي الطلب</th>
                  <th className="p-3.5">العربون المدفوع</th>
                  <th className="p-3.5">المتبقي</th>
                  <th className="p-3.5">نسبة العربون</th>
                  <th className="p-3.5">الحالة</th>
                  <th className="p-3.5 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-12 text-center text-slate-400">
                      لا توجد طلبات حجز مطابقة لخيارات البحث.
                    </td>
                  </tr>
                ) : (
                  orders.map((o) => {
                    const percentPaid = o.totalAmount > 0 ? Math.round((o.paidAmount / o.totalAmount) * 100) : 0;
                    return (
                      <tr key={o.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-700/30 transition">
                        <td className="p-3.5 font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <Receipt className="w-4 h-4 text-sky-600" />
                          {o.orderNumber}
                        </td>
                        <td className="p-3.5 font-semibold text-slate-800 dark:text-slate-200">
                          {o.customerName || 'عميل نقدي'}
                        </td>
                        <td className="p-3.5 text-slate-600 dark:text-slate-300">
                          {o.warehouseName || 'المخزن الرئيسي'}
                        </td>
                        <td className="p-3.5 font-bold text-slate-900 dark:text-white">
                          {fmtCurrency(o.totalAmount)}
                        </td>
                        <td className="p-3.5 font-bold text-emerald-600 dark:text-emerald-400">
                          {fmtCurrency(o.paidAmount)}
                        </td>
                        <td className="p-3.5 font-bold text-rose-600 dark:text-rose-400">
                          {fmtCurrency(o.remainingAmount)}
                        </td>
                        <td className="p-3.5">
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${
                                  percentPaid >= 100
                                    ? 'bg-emerald-500'
                                    : percentPaid > 0
                                    ? 'bg-amber-500'
                                    : 'bg-slate-300'
                                }`}
                                style={{ width: `${Math.min(100, percentPaid)}%` }}
                              />
                            </div>
                            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                              {percentPaid}%
                            </span>
                          </div>
                        </td>
                        <td className="p-3.5">
                          <span
                            className={`px-2.5 py-1 text-xs font-bold rounded-lg border ${
                              orderStatusBadges[o.status] || 'bg-slate-50 text-slate-600 border-slate-200'
                            }`}
                          >
                            {orderStatusLabels[o.status] || o.status}
                          </span>
                        </td>
                        <td className="p-3.5">
                          <div className="flex items-center justify-center gap-1.5">
                            {o.status !== 'COMPLETED' && o.status !== 'CANCELLED' && (
                              <button
                                onClick={() => {
                                  setDepositModalOrder(o);
                                  setDepositAmount('');
                                  setDepositNotes('');
                                }}
                                className="px-2.5 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 rounded-lg transition flex items-center gap-1"
                                title="تسجيل دفعة أو عربون"
                              >
                                <DollarSign className="w-3.5 h-3.5" />
                                عربون
                              </button>
                            )}

                            {o.status !== 'COMPLETED' && o.status !== 'CANCELLED' && (
                              <button
                                onClick={() => handleConvertToInvoice(o)}
                                className="px-2.5 py-1.5 text-xs font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/40 dark:text-sky-300 rounded-lg transition flex items-center gap-1"
                                title="إصدار فاتورة مبيعات وخصم العربون"
                              >
                                <ArrowUpRight className="w-3.5 h-3.5" />
                                فوترة
                              </button>
                            )}

                            {o.invoiceNumber && (
                              <span className="text-[11px] font-bold text-slate-500 px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded">
                                فـ: {o.invoiceNumber}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Stock Reservations Table */
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-3.5">رقم الحجز</th>
                  <th className="p-3.5">الصنف</th>
                  <th className="p-3.5">المخزن</th>
                  <th className="p-3.5">الكمية المحجوزة</th>
                  <th className="p-3.5">المرجع</th>
                  <th className="p-3.5">تاريخ الحجز</th>
                  <th className="p-3.5">تاريخ الانتهاء</th>
                  <th className="p-3.5">الحالة</th>
                  <th className="p-3.5 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {reservations.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-12 text-center text-slate-400">
                      لا توجد سجلات حجز مطابقة لخيارات البحث.
                    </td>
                  </tr>
                ) : (
                  reservations.map((r) => {
                    const isExpired = r.status === 'ACTIVE' && r.expiresAt && new Date(r.expiresAt) < new Date();
                    return (
                      <tr key={r.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-700/30 transition">
                        <td className="p-3.5 font-mono text-xs font-bold text-slate-900 dark:text-white">
                          {r.id}
                        </td>
                        <td className="p-3.5">
                          <div className="font-bold text-slate-900 dark:text-white">{r.productName}</div>
                          <div className="text-xs text-slate-400 font-mono">{r.productSku}</div>
                        </td>
                        <td className="p-3.5 text-slate-600 dark:text-slate-300">
                          {r.warehouseName}
                        </td>
                        <td className="p-3.5 font-bold text-sky-700 dark:text-sky-300">
                          {formatProductQuantity(r.quantityM2, r)}
                        </td>
                        <td className="p-3.5 text-xs text-slate-600 dark:text-slate-300">
                          <span className="font-semibold">{r.referenceType}</span>
                          {r.referenceId && <span className="font-mono text-slate-400"> ({r.referenceId})</span>}
                        </td>
                        <td className="p-3.5 text-xs text-slate-500 font-mono">
                          {r.createdAt ? r.createdAt.substring(0, 10) : '—'}
                        </td>
                        <td className="p-3.5 text-xs font-mono">
                          {r.expiresAt ? (
                            <span className={isExpired ? 'text-rose-600 font-bold' : 'text-slate-600'}>
                              {r.expiresAt.substring(0, 10)}
                            </span>
                          ) : (
                            <span className="text-slate-400">بدون انتهاء</span>
                          )}
                        </td>
                        <td className="p-3.5">
                          <span
                            className={`px-2.5 py-1 text-xs font-bold rounded-lg border ${
                              reservationStatusStyles[r.status] || 'bg-slate-50 text-slate-600 border-slate-200'
                            }`}
                          >
                            {reservationStatusLabels[r.status] || r.status}
                          </span>
                        </td>
                        <td className="p-3.5">
                          <div className="flex items-center justify-center gap-1.5">
                            {r.status === 'ACTIVE' && (
                              <>
                                <button
                                  onClick={() => handleConsume(r.id)}
                                  className="px-2.5 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition"
                                  title="صرف وتنفيذ الحجز"
                                >
                                  صرف
                                </button>
                                <button
                                  onClick={() => handleRelease(r.id)}
                                  className="px-2.5 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg transition"
                                  title="فك الحجز"
                                >
                                  إلغاء الحجز
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Record Deposit */}
      {depositModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 dark:border-slate-700">
              <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-600" />
                تسجيل عربون / دفعة مقدمة
              </h3>
              <button
                onClick={() => setDepositModalOrder(null)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDeposit} className="space-y-4 mt-4">
              <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600 dark:text-slate-300">
                  <span>رقم الطلب:</span>
                  <span className="font-bold text-slate-900 dark:text-white">{depositModalOrder.orderNumber}</span>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-300">
                  <span>العميل:</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{depositModalOrder.customerName || 'نقدي'}</span>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-300">
                  <span>إجمالي الطلب:</span>
                  <span className="font-bold text-slate-900 dark:text-white">{fmtCurrency(depositModalOrder.totalAmount)}</span>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-300">
                  <span>المدفوع مسبقاً:</span>
                  <span className="font-semibold text-emerald-600">{fmtCurrency(depositModalOrder.paidAmount)}</span>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-300 font-bold border-t border-slate-200 dark:border-slate-600 pt-1">
                  <span>المبلغ المتبقي:</span>
                  <span className="text-rose-600">{fmtCurrency(depositModalOrder.remainingAmount)}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  مبلغ العربون الجديد (ج.م) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  max={depositModalOrder.remainingAmount}
                  placeholder="0.00"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="w-full px-3 py-2 text-base font-bold text-slate-900 dark:text-white bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  طريقة الدفع
                </label>
                <select
                  value={depositPaymentType}
                  onChange={(e) => setDepositPaymentType(e.target.value as any)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="CASH">نقدي (خزينة المعرض)</option>
                  <option value="CARD">بطاقة بنكية / فيزا</option>
                  <option value="BANK_TRANSFER">تحويل بنكي / إنستاباي</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  ملاحظات الدفعة / رقم الإيصال
                </label>
                <input
                  type="text"
                  placeholder="ملاحظات العربون أو رقم المرجع البنكي..."
                  value={depositNotes}
                  onChange={(e) => setDepositNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDepositModalOrder(null)}
                  className="flex-1 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-xl transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submittingDeposit}
                  className="flex-1 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow transition flex items-center justify-center gap-1.5"
                >
                  {submittingDeposit ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
                  تأكيد وحفظ العربون
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: New Stock Reservation */}
      {showNewResModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 dark:border-slate-700">
              <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                <BookmarkPlus className="w-5 h-5 text-sky-600" />
                حجز كمية بضاعة بالمخزن
              </h3>
              <button
                onClick={() => setShowNewResModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateReservation} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  اختر الصنف *
                </label>
                <select
                  required
                  value={newResForm.productId}
                  onChange={(e) => setNewResForm({ ...newResForm, productId: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="">-- اختر الصنف --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku}) — {getProductUnitLabel(p)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  المخزن *
                </label>
                <select
                  required
                  value={newResForm.warehouseId}
                  onChange={(e) => setNewResForm({ ...newResForm, warehouseId: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="">-- اختر المخزن --</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Live Availability Indicator */}
              {availability && (
                <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl text-center text-xs">
                  <div>
                    <span className="text-slate-500 block">الرصيد الفعلي:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{formatProductQuantity(availability.onHand, products.find((product) => product.id === newResForm.productId) || {})}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">المحجوز حالياً:</span>
                    <span className="font-bold text-amber-600">{formatProductQuantity(availability.reserved, products.find((product) => product.id === newResForm.productId) || {})}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">المتاح للحجز:</span>
                    <span className="font-bold text-emerald-600">{formatProductQuantity(availability.available, products.find((product) => product.id === newResForm.productId) || {})}</span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    الكمية المطلوبة ({products.find((product) => product.id === newResForm.productId) ? getProductUnitLabel(products.find((product) => product.id === newResForm.productId)!) : 'بوحدة الصنف'}) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={newResForm.quantityM2}
                    onChange={(e) => setNewResForm({ ...newResForm, quantityM2: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    تاريخ انتهاء الحجز
                  </label>
                  <input
                    type="date"
                    value={newResForm.expiresAt}
                    onChange={(e) => setNewResForm({ ...newResForm, expiresAt: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    نوع المرجع
                  </label>
                  <select
                    value={newResForm.referenceType}
                    onChange={(e) => setNewResForm({ ...newResForm, referenceType: e.target.value as any })}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl"
                  >
                    <option value="MANUAL">حجز يدوي مباشر</option>
                    <option value="ORDER">مرتبط بطلب عميل</option>
                    <option value="QUOTATION">مرتبط بعرض سعر</option>
                    <option value="PROJECT">مرتبط بمشروع</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    رقم أو كود المرجع
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: ORD-1025"
                    value={newResForm.referenceId}
                    onChange={(e) => setNewResForm({ ...newResForm, referenceId: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  ملاحظات الحجز
                </label>
                <textarea
                  rows={2}
                  placeholder="سبب الحجز أو اسم العميل أو الملاحظات..."
                  value={newResForm.notes}
                  onChange={(e) => setNewResForm({ ...newResForm, notes: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewResModal(false)}
                  className="flex-1 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-xl transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 rounded-xl shadow transition flex items-center justify-center gap-1.5"
                >
                  <BookmarkPlus className="w-4 h-4" />
                  تأكيد حجز الكمية
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default ReservationsDepositPage;
