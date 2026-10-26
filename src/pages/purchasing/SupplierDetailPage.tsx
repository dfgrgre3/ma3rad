import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, AlertTriangle, ArrowRight } from 'lucide-react';
import { DatabaseManager } from '../../database/db';
import { SupplierService } from '../../services/SupplierService';
import { ProcurementService, SupplierScorecard } from '../../services/ProcurementService';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import { BranchAccessService } from '../../services/BranchAccessService';
import { Supplier, PaymentType } from '../../types';
import {
  Tab,
  SupplierInvoiceRow,
  SupplierPaymentRow,
  SupplierOrderRow,
  SupplierReturnRow,
  PurchasePriceHistoryRow,
  SupplierStatement,
  EditSupplierFormData,
  RecordPaymentFormData,
} from './supplier-detail/types';
import { SupplierHeader } from './supplier-detail/SupplierHeader';
import { OverviewTab } from './supplier-detail/OverviewTab';
import { InvoicesTab } from './supplier-detail/InvoicesTab';
import { PaymentsTab } from './supplier-detail/PaymentsTab';
import { OrdersTab } from './supplier-detail/OrdersTab';
import { ReturnsTab } from './supplier-detail/ReturnsTab';
import { StatementTab } from './supplier-detail/StatementTab';
import { ScorecardTab } from './supplier-detail/ScorecardTab';
import { PriceHistoryTab } from './supplier-detail/PriceHistoryTab';
import { RecordPaymentModal } from './supplier-detail/RecordPaymentModal';
import { EditSupplierModal } from './supplier-detail/EditSupplierModal';

export const SupplierDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState(true);

  // Associated lists
  const [invoices, setInvoices] = useState<SupplierInvoiceRow[]>([]);
  const [payments, setPayments] = useState<SupplierPaymentRow[]>([]);
  const [orders, setOrders] = useState<SupplierOrderRow[]>([]);
  const [returns, setReturns] = useState<SupplierReturnRow[]>([]);
  const [statement, setStatement] = useState<SupplierStatement | null>(null);
  const [statementFrom, setStatementFrom] = useState('');
  const [statementTo, setStatementTo] = useState('');
  const [scorecard, setScorecard] = useState<SupplierScorecard | null>(null);
  const [priceHistory, setPriceHistory] = useState<PurchasePriceHistoryRow[]>([]);

  // Modals state
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFormData, setEditFormData] = useState<EditSupplierFormData>({
    name: '',
    companyName: '',
    phone: '',
    email: '',
    taxNumber: '',
    commercialRecord: '',
    address: '',
    paymentTermsDays: 30,
    notes: '',
  });

  const [paymentData, setPaymentData] = useState<RecordPaymentFormData>({
    amount: 1000,
    paymentType: 'CASH' as PaymentType,
    notes: 'سداد دفعة نقدية لحساب المورد',
  });
  const [paymentError, setPaymentError] = useState('');

  const supplierService = new SupplierService();
  const currentUser = AuthService.getCurrentUser();
  const canUpdate = PermissionService.can(currentUser, 'suppliers.update');
  const canPay = PermissionService.can(currentUser, 'suppliers.payment');

  const loadSupplierData = () => {
    if (!id) return;
    setLoading(true);
    try {
      const db = DatabaseManager.getInstance();
      const branchAccess = new BranchAccessService();
      const invoiceScope = branchAccess.sqlScope(
        'pi.branch_id',
        '(SELECT w.branch_id FROM warehouses w WHERE w.id = pi.warehouse_id)'
      );
      const paymentScope = branchAccess.sqlScope(
        'sp.branch_id',
        '(SELECT cr.branch_id FROM cash_registers cr WHERE cr.id = sp.register_id)'
      );
      const orderScope = branchAccess.warehouseBranchScope('w');
      const returnScope = branchAccess.sqlScope('pi.branch_id', 'w.branch_id');
      const sup = supplierService.getSupplierById(id);
      setSupplier(sup);

      if (sup) {
        setEditFormData({
          name: sup.name || '',
          companyName: sup.companyName || '',
          phone: sup.phone || '',
          email: sup.email || '',
          taxNumber: sup.taxNumber || '',
          commercialRecord: sup.commercialRecord || '',
          address: sup.address || '',
          paymentTermsDays: sup.paymentTermsDays || 30,
          notes: sup.notes || '',
        });

        // Load invoices
        const invs = db.query<any>(
          `SELECT pi.id, pi.invoice_number, pi.date, pi.total_amount, pi.paid_amount, pi.remaining_amount,
                  pi.payment_status, pi.notes, pi.created_at
           FROM purchase_invoices pi
           WHERE pi.supplier_id = ? AND ${invoiceScope.clause}
           ORDER BY pi.date DESC, pi.created_at DESC`,
          [id, ...invoiceScope.params]
        );
        setInvoices(invs);

        // Load payments
        const pays = db.query<any>(
          `SELECT sp.id, sp.receipt_number, sp.date, sp.amount, sp.payment_type, sp.notes,
                  sp.register_id, sp.created_at
           FROM supplier_payments sp
           WHERE sp.supplier_id = ? AND ${paymentScope.clause}
           ORDER BY sp.date DESC, sp.created_at DESC`,
          [id, ...paymentScope.params]
        );
        setPayments(pays);

        // Load purchase orders
        const ords = db.query<any>(
          `SELECT po.id, po.order_number, po.date, po.expected_date AS expected_delivery_date,
                  po.total_amount, po.status, po.created_at
           FROM purchase_orders po
           LEFT JOIN warehouses w ON w.id = po.warehouse_id
           WHERE po.supplier_id = ? AND ${orderScope.clause}
           ORDER BY po.date DESC, po.created_at DESC`,
          [id, ...orderScope.params]
        );
        setOrders(ords);

        // Load purchase returns
        const rets = db.query<any>(
          `SELECT pr.id, pr.return_number, pr.date, pr.total_amount, pr.reason, pr.created_at
           FROM purchase_returns pr
           LEFT JOIN purchase_invoices pi ON pi.id = pr.original_purchase_id
           LEFT JOIN warehouses w ON w.id = pr.warehouse_id
           WHERE pr.supplier_id = ? AND ${returnScope.clause}
           ORDER BY pr.date DESC, pr.created_at DESC`,
          [id, ...returnScope.params]
        );
        setReturns(rets);

        // Load statement
        const stmt = supplierService.getSupplierStatement(sup.id, statementFrom, statementTo);
        setStatement(stmt);

        // Load scorecard & price history
        const proc = new ProcurementService();
        try {
          const sc = proc.getSupplierScorecard(sup.id);
          setScorecard(sc);
        } catch {
          // ignore if no stats yet
        }

        const historyRows = db.query<any>(`
          SELECT
            pi.date,
            pi.invoice_number AS invoiceNumber,
            pii.product_id AS productId,
            pii.product_name AS productName,
            pii.quantity_m2 AS quantityM2,
            pii.unit_cost AS unitCost,
            COALESCE(NULLIF(pii.effective_unit_cost, 0), pii.unit_cost) AS effectiveUnitCost,
            pi.matching_status AS matchingStatus
          FROM purchase_invoice_items pii
          JOIN purchase_invoices pi ON pi.id = pii.purchase_id
          WHERE pi.supplier_id = ? AND ${invoiceScope.clause}
          ORDER BY pi.date DESC, pi.created_at DESC
        `, [sup.id, ...invoiceScope.params]);
        setPriceHistory(historyRows);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSupplierData();
  }, [id, statementFrom, statementTo]);

  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplier) return;
    setPaymentError('');
    try {
      supplierService.recordPayment(
        supplier.id,
        Number(paymentData.amount),
        paymentData.paymentType,
        'cr_main',
        paymentData.notes
      );
      setIsPaymentModalOpen(false);
      loadSupplierData();
    } catch (err: any) {
      setPaymentError(err?.message || 'تعذر تسجيل سند الصرف');
    }
  };

  const handleUpdateSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplier) return;
    try {
      supplierService.updateSupplier(supplier.id, {
        name: editFormData.name,
        companyName: editFormData.companyName || undefined,
        phone: editFormData.phone,
        email: editFormData.email || undefined,
        taxNumber: editFormData.taxNumber || undefined,
        commercialRecord: editFormData.commercialRecord || undefined,
        address: editFormData.address || undefined,
        paymentTermsDays: Number(editFormData.paymentTermsDays),
        notes: editFormData.notes || undefined,
      });
      setIsEditModalOpen(false);
      loadSupplierData();
    } catch (err: any) {
      alert(err?.message || 'تعذر تحديث بيانات المورد');
    }
  };

  const handleToggleStatus = () => {
    if (!supplier) return;
    const nextStatus = supplier.isActive === 0 ? 1 : 0;
    const msg = nextStatus === 1 ? 'هل تريد تفعيل حساب المورد؟' : 'هل تريد تعطيل حساب المورد؟';
    if (!window.confirm(msg)) return;
    try {
      supplierService.updateSupplier(supplier.id, { isActive: nextStatus });
      loadSupplierData();
    } catch (err: any) {
      alert(err?.message || 'تعذر تعديل حالة المورد');
    }
  };

  const openPaymentModal = () => {
    if (!supplier) return;
    setPaymentError('');
    setPaymentData({
      amount: supplier.currentBalance > 0 ? supplier.currentBalance : 1000,
      paymentType: 'CASH',
      notes: `سداد دفعة لحساب المورد ${supplier.name}`,
    });
    setIsPaymentModalOpen(true);
  };

  const exportStatementCsv = () => {
    if (!statement || !supplier) return;
    const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['التاريخ', 'النوع', 'رقم المستند', 'البيان', 'مدين (مسدد)', 'دائن (مستحق)', 'الرصيد بعد الحركة'],
      ...statement.transactions.map((tx) => [
        tx.date,
        tx.type === 'PURCHASE' ? 'فاتورة شراء' : 'سداد دفعة',
        tx.docNumber,
        tx.description,
        tx.debit,
        tx.credit,
        tx.balanceAfter,
      ]),
    ];
    const csv = '\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `كشف-حساب-مورد-${supplier.code}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-sky-600" />
      </div>
    );
  }

  if (!supplier) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center" dir="rtl">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-black text-slate-900">المورد غير موجود</h2>
        <p className="text-sm text-slate-500">لم يتم العثور على مورد بهذا المعرّف، أو ربما تم حذفه.</p>
        <button
          onClick={() => navigate('/suppliers')}
          className="mt-2 inline-flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-sky-700"
        >
          <ArrowRight className="w-4 h-4" />
          <span>العودة لقائمة الموردين</span>
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      {/* Top Header */}
      <SupplierHeader
        supplier={supplier}
        activeTab={tab}
        onTabChange={setTab}
        onBack={() => navigate('/suppliers')}
        invoiceCount={invoices.length}
        paymentCount={payments.length}
        orderCount={orders.length}
        returnCount={returns.length}
        canUpdate={canUpdate}
        canPay={canPay}
        onOpenPaymentModal={openPaymentModal}
        onOpenEditModal={() => setIsEditModalOpen(true)}
        onToggleStatus={handleToggleStatus}
        onPrintStatement={() => {
          setTab('statement');
          setTimeout(() => window.print(), 200);
        }}
      />

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* OVERVIEW TAB */}
        {tab === 'overview' && (
          <OverviewTab
            supplier={supplier}
            invoices={invoices}
            payments={payments}
            orders={orders}
            canUpdate={canUpdate}
            onOpenEditModal={() => setIsEditModalOpen(true)}
            onTabChange={setTab}
          />
        )}

        {/* INVOICES TAB */}
        {tab === 'invoices' && <InvoicesTab invoices={invoices} />}

        {/* PAYMENTS TAB */}
        {tab === 'payments' && (
          <PaymentsTab
            payments={payments}
            canPay={canPay}
            onOpenPaymentModal={openPaymentModal}
          />
        )}

        {/* PURCHASE ORDERS TAB */}
        {tab === 'orders' && <OrdersTab orders={orders} />}

        {/* PURCHASE RETURNS TAB */}
        {tab === 'returns' && <ReturnsTab returns={returns} />}

        {/* STATEMENT TAB */}
        {tab === 'statement' && statement && (
          <StatementTab
            supplierName={supplier.name}
            statement={statement}
            statementFrom={statementFrom}
            statementTo={statementTo}
            onFromChange={setStatementFrom}
            onToChange={setStatementTo}
            onClearFilters={() => {
              setStatementFrom('');
              setStatementTo('');
            }}
            onExportCsv={exportStatementCsv}
            onPrint={() => window.print()}
          />
        )}

        {/* SCORECARD TAB */}
        {tab === 'scorecard' && <ScorecardTab scorecard={scorecard} />}

        {/* PRICE HISTORY TAB */}
        {tab === 'price_history' && <PriceHistoryTab priceHistory={priceHistory} />}
      </div>

      {/* RECORD PAYMENT MODAL */}
      {isPaymentModalOpen && (
        <RecordPaymentModal
          supplier={supplier}
          paymentData={paymentData}
          paymentError={paymentError}
          onChange={setPaymentData}
          onClose={() => setIsPaymentModalOpen(false)}
          onSubmit={handleRecordPayment}
        />
      )}

      {/* EDIT SUPPLIER MODAL */}
      {isEditModalOpen && (
        <EditSupplierModal
          editFormData={editFormData}
          onChange={setEditFormData}
          onClose={() => setIsEditModalOpen(false)}
          onSubmit={handleUpdateSupplier}
        />
      )}
    </div>
  );
};
