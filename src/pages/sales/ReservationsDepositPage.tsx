import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { BookmarkPlus, Loader2, Clock, Plus } from 'lucide-react';
import { ReservationService, StockReservation } from '../../services/ReservationService';
import { OrderService, Order } from '../../services/OrderService';
import { ProductService } from '../../services/ProductService';
import { OperationsService } from '../../services/OperationsService';
import { CustomerService } from '../../services/CustomerService';
import { useToast } from '../../components/ui/Toast';
import { useSearchParams } from 'react-router-dom';
import { Product, Customer } from '../../types';
import { PrintService } from '../../services/PrintService';
import { getProductUnitLabel } from '../../utils/productUnits';
import { fmtCurrency } from './reservations/helpers';
import {
  computeReservationStats,
  createEmptyNewReservationForm,
  DepositPaymentType,
  NewReservationForm,
  ReservationAvailability,
  ReservationTab,
  WarehouseOption,
} from './reservations/types';
import { ReservationStatsCards } from './reservations/ReservationStatsCards';
import { ReservationsToolbar } from './reservations/ReservationsToolbar';
import { OrdersDepositsTable } from './reservations/OrdersDepositsTable';
import { StockReservationsTable } from './reservations/StockReservationsTable';
import { DepositModal } from './reservations/DepositModal';
import { NewReservationModal } from './reservations/NewReservationModal';

export const ReservationsDepositPage: React.FC = () => {
  const toast = useToast();
  const resService = useMemo(() => new ReservationService(), []);
  const orderService = useMemo(() => new OrderService(), []);
  const printService = useMemo(() => new PrintService(), []);

  const [searchParams] = useSearchParams();
  const initialTab: ReservationTab = searchParams.get('tab') === 'reservations' ? 'reservations' : 'orders';
  const [activeTab, setActiveTab] = useState<ReservationTab>(initialTab);
  const [loading, setLoading] = useState(true);

  // Data states
  const [reservations, setReservations] = useState<StockReservation[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  // Filter states
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modal states
  const [showNewResModal, setShowNewResModal] = useState(false);
  const [newResForm, setNewResForm] = useState<NewReservationForm>(() => createEmptyNewReservationForm());
  const [availability, setAvailability] = useState<ReservationAvailability | null>(null);

  // Deposit modal
  const [depositModalOrder, setDepositModalOrder] = useState<Order | null>(null);
  const [depositAmount, setDepositAmount] = useState<string>('');
  const [depositPaymentType, setDepositPaymentType] = useState<DepositPaymentType>('CASH');
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
      setNewResForm(createEmptyNewReservationForm());
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
  const { activeReservationsCount, reservedByUnit, pendingOrdersCount, totalDepositsCollected } = computeReservationStats(
    reservations,
    orders,
  );

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
      <ReservationStatsCards
        activeReservationsCount={activeReservationsCount}
        reservedByUnit={reservedByUnit}
        pendingOrdersCount={pendingOrdersCount}
        totalDepositsCollected={totalDepositsCollected}
      />

      {/* Tabs & Controls */}
      <ReservationsToolbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        onRefresh={loadData}
        loading={loading}
        ordersCount={orders.length}
        reservationsCount={reservations.length}
      />

      {/* Main Content Area */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-16 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700">
          <Loader2 className="w-8 h-8 text-sky-600 animate-spin mb-3" />
          <p className="text-sm text-slate-500">جاري تحميل البيانات...</p>
        </div>
      ) : activeTab === 'orders' ? (
        /* Orders & Deposits Table */
        <OrdersDepositsTable
          orders={orders}
          onRecordDeposit={(order) => {
            setDepositModalOrder(order);
            setDepositAmount('');
            setDepositNotes('');
          }}
          onConvertToInvoice={handleConvertToInvoice}
        />
      ) : (
        /* Stock Reservations Table */
        <StockReservationsTable
          reservations={reservations}
          onConsume={handleConsume}
          onRelease={handleRelease}
        />
      )}

      {/* Modal: Record Deposit */}
      {depositModalOrder && (
        <DepositModal
          order={depositModalOrder}
          amount={depositAmount}
          onAmountChange={setDepositAmount}
          paymentType={depositPaymentType}
          onPaymentTypeChange={setDepositPaymentType}
          notes={depositNotes}
          onNotesChange={setDepositNotes}
          submitting={submittingDeposit}
          onSubmit={handleSaveDeposit}
          onClose={() => setDepositModalOrder(null)}
        />
      )}

      {/* Modal: New Stock Reservation */}
      {showNewResModal && (
        <NewReservationModal
          form={newResForm}
          onFormChange={setNewResForm}
          products={products}
          warehouses={warehouses}
          availability={availability}
          onSubmit={handleCreateReservation}
          onClose={() => setShowNewResModal(false)}
        />
      )}
    </div>
  );
};
export default ReservationsDepositPage;
