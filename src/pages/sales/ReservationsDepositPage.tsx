import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { BookmarkPlus, Loader2, Clock, Plus } from 'lucide-react';
import { ReservationService, StockReservation } from '../../services/ReservationService';
import { OrderService, Order } from '../../services/OrderService';
import { ProductService } from '../../services/ProductService';
import { OperationsService } from '../../services/OperationsService';
import { CustomerService } from '../../services/CustomerService';
import { useToast } from '../../components/ui/Toast';
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
import { usePermission } from '../../hooks/usePermission';

export type ReservationPageMode = 'sales' | 'inventory';
interface ReservationsDepositPageProps { mode?: ReservationPageMode; }

export const ReservationsDepositPage: React.FC<ReservationsDepositPageProps> = ({ mode = 'sales' }) => {
  const toast = useToast();
  const can = usePermission();
  const canViewPage = can(mode === 'sales' ? 'sales.view' : 'inventory.view');
  const canAdjustInventory = can('inventory.adjust');
  const canCreateSales = can('sales.create');
  const resService = useMemo(() => new ReservationService(), []);
  const orderService = useMemo(() => new OrderService(), []);
  const printService = useMemo(() => new PrintService(), []);

  const initialTab: ReservationTab = mode === 'inventory' ? 'reservations' : 'orders';
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
      if (mode === 'inventory') {
        setReservations(resService.getReservations({ status: statusFilter, search }));
        setOrders([]);
      } else {
        setOrders(orderService.getOrders(search, statusFilter === 'ALL' ? 'ALL' : statusFilter as any));
        setReservations([]);
      }
    } catch (e: any) {
      toast.error(e?.message || 'ØªØ¹Ø°Ø± ØªØ­Ù…ÙŠÙ„ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ø­Ø¬ÙˆØ²Ø§Øª.');
    } finally {
      setLoading(false);
    }
  }, [mode, resService, orderService, statusFilter, search, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    try {
      if (mode === 'inventory') {
        setProducts(new ProductService().getAllProducts());
        setWarehouses(new OperationsService().getWarehouses());
      }
      if (mode === 'sales') setCustomers(new CustomerService().getAllCustomers());
    } catch (e: any) {
      console.error(e);
    }
  }, [mode]);

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
    if (!window.confirm('Ù‡Ù„ Ø£Ù†Øª Ù…ØªØ£ÙƒØ¯ Ù…Ù† Ø¥Ù„ØºØ§Ø¡ ÙÙƒ Ø­Ø¬Ø² Ù‡Ø°Ù‡ Ø§Ù„ÙƒÙ…ÙŠØ© ÙˆØ¥Ø¹Ø§Ø¯ØªÙ‡Ø§ Ù„Ù„Ù…Ø®Ø²ÙˆÙ† Ø§Ù„Ø­Ø±ØŸ')) return;
    try {
      resService.releaseReservation(id, 'RELEASED');
      toast.success('ØªÙ… ÙÙƒ Ø­Ø¬Ø² Ø§Ù„ÙƒÙ…ÙŠØ© Ø¨Ù†Ø¬Ø§Ø­.');
      loadData();
    } catch (e: any) {
      toast.error(e?.message || 'ÙØ´Ù„ ÙÙƒ Ø§Ù„Ø­Ø¬Ø².');
    }
  };

  // Handle consume reservation
  const handleConsume = (id: string) => {
    if (!window.confirm('Ù‡Ù„ ØªØ±ÙŠØ¯ ØªØ£ÙƒÙŠØ¯ ØµØ±Ù Ø§Ù„ÙƒÙ…ÙŠØ© Ø§Ù„Ù…Ø­Ø¬ÙˆØ²Ø© Ù…Ù† Ø§Ù„Ù…Ø®Ø²Ù† ÙØ¹Ù„ÙŠØ§Ù‹ØŸ')) return;
    try {
      resService.consumeReservation(id);
      toast.success('ØªÙ… ØµØ±Ù Ø§Ù„ÙƒÙ…ÙŠØ© Ø§Ù„Ù…Ø­Ø¬ÙˆØ²Ø© ÙˆØªØ­Ø¯ÙŠØ« Ø§Ù„Ù…Ø®Ø²ÙˆÙ† Ø¨Ù†Ø¬Ø§Ø­.');
      loadData();
    } catch (e: any) {
      toast.error(e?.message || 'ÙØ´Ù„ ØªÙ†ÙÙŠØ° Ø§Ù„Ø­Ø¬Ø².');
    }
  };

  // Handle create reservation
  const handleCreateReservation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newResForm.productId || !newResForm.warehouseId || !newResForm.quantityM2) {
      toast.warning('ÙŠØ±Ø¬Ù‰ Ù…Ù„Ø¡ Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø­Ù‚ÙˆÙ„ Ø§Ù„Ø¥Ù„Ø²Ø§Ù…ÙŠØ©.');
      return;
    }
    const qty = Number(newResForm.quantityM2);
    if (qty <= 0) {
      toast.warning('Ø§Ù„ÙƒÙ…ÙŠØ© ÙŠØ¬Ø¨ Ø£Ù† ØªÙƒÙˆÙ† Ø£ÙƒØ¨Ø± Ù…Ù† ØµÙØ±.');
      return;
    }
    if (availability && qty > availability.available) {
      const product = products.find((item) => item.id === newResForm.productId);
      const unit = product ? getProductUnitLabel(product) : 'Ø§Ù„ÙˆØ­Ø¯Ø©';
      toast.error(`Ø§Ù„ÙƒÙ…ÙŠØ© Ø§Ù„Ù…ØªØ§Ø­Ø© (${availability.available} ${unit}) ØºÙŠØ± ÙƒØ§ÙÙŠØ©.`);
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
      toast.success('ØªÙ… ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø­Ø¬Ø² ÙˆØªØ¬Ù…ÙŠØ¯ Ø§Ù„ÙƒÙ…ÙŠØ© Ø¨Ø§Ù„Ù…Ø®Ø²Ù† Ø¨Ù†Ø¬Ø§Ø­.');
      setShowNewResModal(false);
      setNewResForm(createEmptyNewReservationForm());
      loadData();
    } catch (e: any) {
      toast.error(e?.message || 'ØªØ¹Ø°Ø± Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ø­Ø¬Ø².');
    }
  };

  // Handle Record Deposit
  const handleSaveDeposit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!depositModalOrder) return;
    const amount = Number(depositAmount);
    if (!amount || amount <= 0) {
      toast.warning('ÙŠØ±Ø¬Ù‰ Ø¥Ø¯Ø®Ø§Ù„ Ù…Ø¨Ù„Øº ØµØ­ÙŠØ­ Ù„Ù„Ø¹Ø±Ø¨ÙˆÙ†.');
      return;
    }
    if (amount > depositModalOrder.remainingAmount) {
      toast.warning(`Ù…Ø¨Ù„Øº Ø§Ù„Ø¹Ø±Ø¨ÙˆÙ† (${amount} Ø¬) ÙŠØªØ¬Ø§ÙˆØ² Ø§Ù„Ù…ØªØ¨Ù‚ÙŠ (${depositModalOrder.remainingAmount} Ø¬).`);
      return;
    }

    setSubmittingDeposit(true);
    try {
      orderService.recordDeposit(depositModalOrder.id, amount, depositPaymentType, depositNotes);
      toast.success(`ØªÙ… ØªØ³Ø¬ÙŠÙ„ Ø¹Ø±Ø¨ÙˆÙ† Ø¨Ù‚ÙŠÙ…Ø© ${fmtCurrency(amount)} Ù„Ù„Ø·Ù„Ø¨ Ø¨Ù†Ø¬Ø§Ø­.`);
      setDepositModalOrder(null);
      setDepositAmount('');
      setDepositNotes('');
      loadData();
    } catch (e: any) {
      toast.error(e?.message || 'ÙØ´Ù„ ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¹Ø±Ø¨ÙˆÙ†.');
    } finally {
      setSubmittingDeposit(false);
    }
  };

  // Handle Convert Order to Invoice
  const handleConvertToInvoice = (order: Order) => {
    if (order.status === 'COMPLETED') {
      toast.info('Ù‡Ø°Ø§ Ø§Ù„Ø·Ù„Ø¨ ØªÙ… Ø¥ØµØ¯Ø§Ø± ÙØ§ØªÙˆØ±Ø© Ù„Ù‡ Ù…Ø³Ø¨Ù‚Ø§Ù‹.');
      return;
    }
    if (!window.confirm(`Ù‡Ù„ ØªØ±ÙŠØ¯ ØªØ­ÙˆÙŠÙ„ Ø§Ù„Ø·Ù„Ø¨ Ø±Ù‚Ù… "${order.orderNumber}" Ø¥Ù„Ù‰ ÙØ§ØªÙˆØ±Ø© Ù…Ø¨ÙŠØ¹Ø§Øª Ù…Ø¹ØªÙ…Ø¯Ø© ÙˆØµØ±Ù Ø§Ù„Ø¨Ø¶Ø§Ø¹Ø©ØŸ`)) return;
    try {
      const inv = orderService.convertToInvoice(order.id, {
        paidAmount: order.paidAmount,
        paymentType: order.remainingAmount <= 0 ? 'CASH' : 'CREDIT',
        notes: `ØªØ­ÙˆÙŠÙ„ Ø·Ù„Ø¨ Ø­Ø¬Ø² Ø±Ù‚Ù… ${order.orderNumber}`,
      });
      toast.success(`ØªÙ… Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„ÙØ§ØªÙˆØ±Ø© Ø¨Ù†Ø¬Ø§Ø­ Ø¨Ø±Ù‚Ù…: ${inv.invoiceNumber}`);
      loadData();
    } catch (e: any) {
      toast.error(e?.message || 'ÙØ´Ù„ ØªØ­ÙˆÙŠÙ„ Ø§Ù„Ø·Ù„Ø¨ Ø¥Ù„Ù‰ ÙØ§ØªÙˆØ±Ø©.');
    }
  };

  // Compute stats
  const { activeReservationsCount, reservedByUnit, pendingOrdersCount, totalDepositsCollected } = computeReservationStats(
    reservations,
    orders,
  );

  if (!canViewPage) {
    return <div className="p-8 text-center text-slate-500">Ù„ÙŠØ³ Ù„Ø¯ÙŠÙƒ ØµÙ„Ø§Ø­ÙŠØ© Ø¹Ø±Ø¶ Ù‡Ø°Ù‡ Ø§Ù„ØµÙØ­Ø©.</div>;
  }

  return (
    <div className="p-6 space-y-6 w-full">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-700">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-sky-600/10 text-sky-600 dark:bg-sky-500/20 dark:text-sky-400">
              <BookmarkPlus className="w-6 h-6" />
            </span>
            Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ø­Ø¬ÙˆØ²Ø§Øª ÙˆØ§Ù„Ø¹Ø±Ø¨ÙˆÙ†Ø§Øª (Sales Reservations & Deposits)
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Ø­Ø¬Ø² ÙƒÙ…ÙŠØ§Øª Ø§Ù„Ø¨Ø¶Ø§Ø¹Ø©ØŒ Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ø¹Ø±Ø¨ÙˆÙ†Ø§Øª ÙˆØ§Ù„Ù…Ù‚Ø¯Ù…Ø§Øª Ù„Ù„Ø·Ù„Ø¨Ø§Øª Ø§Ù„ÙƒØ¨ÙŠØ±Ø©ØŒ ÙˆÙ…Ù†Ø¹ Ø¨ÙŠØ¹ Ø§Ù„Ø¨Ø¶Ø§Ø¹Ø© Ø§Ù„Ù…Ø­Ø¬ÙˆØ²Ø©
          </p>
        </div>

        <div className="flex items-center gap-3">
          {mode === 'inventory' && canAdjustInventory && <button
            onClick={() => {
              const result = resService.expireOverdue();
              loadData();
              if (result.failed > 0) {
                toast.warning(`ØªÙ… ØªØ­Ø¯ÙŠØ« ${result.released} Ø­Ø¬Ø²Ø§Ù‹ØŒ ÙˆØªØ¹Ø°Ø± ØªØ­Ø¯ÙŠØ« ${result.failed} Ø­Ø¬Ø².`);
              } else {
                toast.success(`ØªÙ… ØªØ­Ø¯ÙŠØ« ${result.released} Ù…Ù† Ø£ØµÙ„ ${result.candidates} Ø­Ø¬Ø² Ù…Ù†ØªÙ‡ÙŠ.`);
              }
            }}
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-xl transition flex items-center gap-1.5"
            title="ÙØ­Øµ Ø§Ù„Ø­Ø¬ÙˆØ²Ø§Øª Ø§Ù„Ù…Ù†ØªÙ‡ÙŠØ©"
          >
            <Clock className="w-4 h-4 text-amber-500" />
            ØªØ­Ø¯ÙŠØ« Ø§Ù„ØµÙ„Ø§Ø­ÙŠØ§Øª
          </button>}
          {mode === 'inventory' && canAdjustInventory && <button
            onClick={() => setShowNewResModal(true)}
            className="px-4 py-2 text-sm font-bold text-white bg-sky-600 hover:bg-sky-500 rounded-xl shadow-sm hover:shadow transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Ø­Ø¬Ø² ÙƒÙ…ÙŠØ© Ø¨Ø¶Ø§Ø¹Ø© ÙŠØ¯ÙˆÙŠØ§Ù‹
          </button>}
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
        mode={mode === 'sales' ? 'orders' : 'reservations'}
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
          <p className="text-sm text-slate-500">Ø¬Ø§Ø±ÙŠ ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª...</p>
        </div>
      ) : mode === 'sales' ? (
        /* Orders & Deposits Table */
        <OrdersDepositsTable
          orders={orders}
          canCreate={canCreateSales}
          canInvoice={canCreateSales}
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
          canAdjust={canAdjustInventory}
          onConsume={handleConsume}
          onRelease={handleRelease}
        />
      )}

      {/* Modal: Record Deposit */}
      {mode === 'sales' && canCreateSales && depositModalOrder && (
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
      {mode === 'inventory' && canAdjustInventory && showNewResModal && (
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
