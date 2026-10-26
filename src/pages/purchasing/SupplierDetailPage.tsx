import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Building2, Phone, Mail, FileText, ArrowRight, DollarSign,
  Download, Printer, Plus, Pencil, CheckCircle2,
  AlertTriangle, Loader2, CalendarDays, ExternalLink,
  Receipt, ShoppingBag, RotateCcw, Clock, CreditCard,
  ShieldCheck, TrendingDown, Award, Sparkles, Scale, PackageCheck
} from 'lucide-react';
import { DatabaseManager } from '../../database/db';
import { SupplierService } from '../../services/SupplierService';
import { ProcurementService, SupplierScorecard } from '../../services/ProcurementService';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import { Supplier, PaymentType } from '../../types';
import { CeramicMath } from '../../utils/ceramicMath';

type Tab = 'overview' | 'invoices' | 'payments' | 'orders' | 'returns' | 'statement' | 'scorecard' | 'price_history';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'نظرة عامة', icon: Building2 },
  { id: 'invoices', label: 'فواتير الشراء والتوريد', icon: FileText },
  { id: 'payments', label: 'سندات الصرف والمدفوعات', icon: DollarSign },
  { id: 'orders', label: 'أوامر الشراء', icon: ShoppingBag },
  { id: 'returns', label: 'مرتجعات الشراء', icon: RotateCcw },
  { id: 'statement', label: 'كشف الحساب التفصيلي', icon: Receipt },
  { id: 'scorecard', label: 'سجل أداء المورد', icon: ShieldCheck },
  { id: 'price_history', label: 'سجل أسعار الشراء', icon: TrendingDown },
];

const PAY_STATUS_BADGES: Record<string, { label: string; className: string }> = {
  PAID: { label: 'مدفوع بالكامل', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  PARTIAL: { label: 'مدفوع جزئياً', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  UNPAID: { label: 'غير مسدد (آجل)', className: 'bg-rose-50 text-rose-700 border-rose-200' },
};

const ORDER_STATUS_BADGES: Record<string, { label: string; className: string }> = {
  DRAFT: { label: 'مسودة', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  PENDING: { label: 'معلق', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  SENT: { label: 'مرسل للمورد', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  PARTIALLY_RECEIVED: { label: 'مستلم جزئياً', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  RECEIVED: { label: 'مستلم بالكامل', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  CANCELLED: { label: 'ملغي', className: 'bg-rose-50 text-rose-700 border-rose-200' },
};

export const SupplierDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState(true);

  // Associated lists
  const [invoices, setInvoices] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [returns, setReturns] = useState<any[]>([]);
  const [statement, setStatement] = useState<any | null>(null);
  const [statementFrom, setStatementFrom] = useState('');
  const [statementTo, setStatementTo] = useState('');
  const [scorecard, setScorecard] = useState<SupplierScorecard | null>(null);
  const [priceHistory, setPriceHistory] = useState<any[]>([]);

  // Modals state
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({
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

  const [paymentData, setPaymentData] = useState({
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
          `SELECT id, invoice_number, date, total_amount, paid_amount, remaining_amount, payment_status, notes, created_at
           FROM purchase_invoices WHERE supplier_id = ? ORDER BY date DESC, created_at DESC`,
          [id]
        );
        setInvoices(invs);

        // Load payments
        const pays = db.query<any>(
          `SELECT id, receipt_number, date, amount, payment_type, notes, register_id, created_at
           FROM supplier_payments WHERE supplier_id = ? ORDER BY date DESC, created_at DESC`,
          [id]
        );
        setPayments(pays);

        // Load purchase orders
        const ords = db.query<any>(
          `SELECT id, order_number, date, expected_delivery_date, total_amount, status, created_at
           FROM purchase_orders WHERE supplier_id = ? ORDER BY date DESC, created_at DESC`,
          [id]
        );
        setOrders(ords);

        // Load purchase returns
        const rets = db.query<any>(
          `SELECT id, return_number, date, total_amount, reason, created_at
           FROM purchase_returns WHERE supplier_id = ? ORDER BY date DESC, created_at DESC`,
          [id]
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
          WHERE pi.supplier_id = ?
          ORDER BY pi.date DESC, pi.created_at DESC
        `, [sup.id]);
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

  const exportStatementCsv = () => {
    if (!statement || !supplier) return;
    const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['التاريخ', 'النوع', 'رقم المستند', 'البيان', 'مدين (مسدد)', 'دائن (مستحق)', 'الرصيد بعد الحركة'],
      ...statement.transactions.map((tx: any) => [
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
      <div className="bg-white border-b border-slate-200 px-6 py-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/suppliers')}
              className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 transition"
              title="رجوع لقائمة الموردين"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white flex items-center justify-center font-black text-2xl shadow-md shadow-sky-500/20">
              {supplier.name[0]}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-xs font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                  {supplier.code}
                </span>
                {supplier.isActive === 0 ? (
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-500">
                    غير نشط
                  </span>
                ) : (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                    نشط
                  </span>
                )}
                {supplier.currentBalance > 0 && (
                  <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-[10px] font-black text-rose-700 border border-rose-200">
                    مستحق للمورد: {CeramicMath.formatCurrency(supplier.currentBalance)}
                  </span>
                )}
              </div>
              <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                <span>{supplier.name}</span>
                {supplier.companyName && (
                  <span className="text-sm font-normal text-slate-500">({supplier.companyName})</span>
                )}
              </h1>
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 mt-1">
                {supplier.phone && (
                  <a href={`tel:${supplier.phone}`} className="flex items-center gap-1 hover:text-sky-600 font-mono">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span>{supplier.phone}</span>
                  </a>
                )}
                {supplier.email && (
                  <a href={`mailto:${supplier.email}`} className="flex items-center gap-1 hover:text-sky-600">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    <span>{supplier.email}</span>
                  </a>
                )}
                {supplier.taxNumber && (
                  <span className="flex items-center gap-1">
                    <span className="text-slate-400">الرقم الضريبي:</span>
                    <span className="font-mono font-bold text-slate-700">{supplier.taxNumber}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {canPay && (
              <button
                onClick={() => {
                  setPaymentError('');
                  setPaymentData({
                    amount: supplier.currentBalance > 0 ? supplier.currentBalance : 1000,
                    paymentType: 'CASH',
                    notes: `سداد دفعة لحساب المورد ${supplier.name}`,
                  });
                  setIsPaymentModalOpen(true);
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/30 transition"
              >
                <DollarSign className="w-4 h-4" />
                <span>سند صرف دفعة</span>
              </button>
            )}

            {canUpdate && (
              <button
                onClick={() => setIsEditModalOpen(true)}
                className="px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>تعديل البيانات</span>
              </button>
            )}

            {canUpdate && (
              <button
                onClick={handleToggleStatus}
                className={`px-3 py-2 rounded-xl text-xs font-bold border transition ${
                  supplier.isActive === 0
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {supplier.isActive === 0 ? 'إعادة التفعيل' : 'تعطيل الحساب'}
              </button>
            )}

            <button
              onClick={() => {
                setTab('statement');
                setTimeout(() => window.print(), 200);
              }}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs flex items-center gap-1.5 transition"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>طباعة كشف الحساب</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 mt-4 overflow-x-auto border-t border-slate-100 pt-3">
          {TABS.map((t) => {
            const Icon = t.icon;
            const isActive = tab === t.id;
            let countBadge: number | null = null;
            if (t.id === 'invoices') countBadge = invoices.length;
            if (t.id === 'payments') countBadge = payments.length;
            if (t.id === 'orders') countBadge = orders.length;
            if (t.id === 'returns') countBadge = returns.length;

            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition whitespace-nowrap ${
                  isActive
                    ? 'bg-sky-600 text-white shadow-md shadow-sky-600/20'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{t.label}</span>
                {countBadge !== null && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                      isActive ? 'bg-sky-700 text-white' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {countBadge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* OVERVIEW TAB */}
        {tab === 'overview' && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <span className="text-xs font-bold text-slate-500">إجمالي المشتريات والتوريدات</span>
                <div className="mt-2 text-2xl font-black text-slate-900">
                  {CeramicMath.formatCurrency(supplier.totalPurchases)}
                </div>
                <div className="mt-1 text-[11px] text-slate-400">{invoices.length} فاتورة مسجلة</div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <span className="text-xs font-bold text-slate-500">الرصيد المستحق الحالي للمورد</span>
                <div
                  className={`mt-2 text-2xl font-black ${
                    supplier.currentBalance > 0
                      ? 'text-rose-600'
                      : supplier.currentBalance < 0
                      ? 'text-emerald-600'
                      : 'text-slate-600'
                  }`}
                >
                  {CeramicMath.formatCurrency(supplier.currentBalance)}
                </div>
                <div className="mt-1 text-[11px] text-slate-400">
                  {supplier.currentBalance > 0
                    ? 'مستحقات واجبة السداد'
                    : supplier.currentBalance < 0
                    ? 'رصيد دائن لصالح المعرض'
                    : 'الحساب خالص'}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <span className="text-xs font-bold text-slate-500">إجمالي المدفوعات المسددة</span>
                <div className="mt-2 text-2xl font-black text-emerald-600">
                  {CeramicMath.formatCurrency(payments.reduce((s, p) => s + Number(p.amount || 0), 0))}
                </div>
                <div className="mt-1 text-[11px] text-slate-400">{payments.length} سند صرف مسجل</div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <span className="text-xs font-bold text-slate-500">أوامر الشراء المفتوحة</span>
                <div className="mt-2 text-2xl font-black text-indigo-600">
                  {orders.filter((o) => o.status !== 'RECEIVED' && o.status !== 'CANCELLED').length}
                </div>
                <div className="mt-1 text-[11px] text-slate-400">من إجمالي {orders.length} أمر شراء</div>
              </div>
            </div>

            {/* Two Column Layout: Details Card + Recent Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Supplier Info Profile */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                <h3 className="text-sm font-extrabold text-slate-900 border-b border-slate-100 pb-3 flex items-center justify-between">
                  <span>بيانات الاتصال والملف التجاري</span>
                  {canUpdate && (
                    <button
                      onClick={() => setIsEditModalOpen(true)}
                      className="text-xs text-sky-600 hover:text-sky-700 font-bold"
                    >
                      تعديل
                    </button>
                  )}
                </h3>
                <div className="space-y-3 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-500">كود المورد:</span>
                    <span className="font-mono font-bold text-slate-900">{supplier.code}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-500">اسم المورد:</span>
                    <span className="font-bold text-slate-900">{supplier.name}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-500">اسم الشركة / المصنع:</span>
                    <span className="font-bold text-slate-900">{supplier.companyName || '—'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-500">الهاتف:</span>
                    <span className="font-mono font-bold text-slate-900">{supplier.phone || '—'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-500">البريد الإلكتروني:</span>
                    <span className="font-mono text-slate-900">{supplier.email || '—'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-500">الرقم الضريبي:</span>
                    <span className="font-mono font-bold text-slate-900">{supplier.taxNumber || '—'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-500">السجل التجاري:</span>
                    <span className="font-mono font-bold text-slate-900">{supplier.commercialRecord || '—'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-500">فترة السداد المعتادة:</span>
                    <span className="font-bold text-slate-900">{supplier.paymentTermsDays || 30} يوم</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-500">العنوان:</span>
                    <span className="font-normal text-slate-700">{supplier.address || '—'}</span>
                  </div>
                  {supplier.notes && (
                    <div className="pt-2">
                      <span className="text-slate-500 block mb-1">ملاحظات:</span>
                      <p className="rounded-xl bg-slate-50 p-2.5 text-slate-700 text-xs leading-relaxed">
                        {supplier.notes}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Recent Invoices & Payments summary */}
              <div className="lg:col-span-2 space-y-6">
                {/* Recent Invoices */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-sky-600" />
                      <span>آخر فواتير التوريد</span>
                    </h3>
                    <button
                      onClick={() => setTab('invoices')}
                      className="text-xs text-sky-600 hover:text-sky-700 font-bold"
                    >
                      عرض الكل ({invoices.length})
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-right">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="p-2.5">رقم الفاتورة</th>
                          <th className="p-2.5">التاريخ</th>
                          <th className="p-2.5">الإجمالي</th>
                          <th className="p-2.5">المسدد</th>
                          <th className="p-2.5">المتبقي</th>
                          <th className="p-2.5">الحالة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {invoices.slice(0, 5).map((inv) => (
                          <tr key={inv.id} className="hover:bg-slate-50">
                            <td className="p-2.5 font-mono font-bold text-slate-900">{inv.invoice_number}</td>
                            <td className="p-2.5 text-slate-600">{inv.date}</td>
                            <td className="p-2.5 font-bold text-slate-900">
                              {CeramicMath.formatCurrency(inv.total_amount)}
                            </td>
                            <td className="p-2.5 text-emerald-700 font-bold">
                              {CeramicMath.formatCurrency(inv.paid_amount)}
                            </td>
                            <td className="p-2.5 text-rose-700 font-bold">
                              {CeramicMath.formatCurrency(inv.remaining_amount)}
                            </td>
                            <td className="p-2.5">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                  PAY_STATUS_BADGES[inv.payment_status]?.className ||
                                  'bg-slate-100 text-slate-600 border-slate-200'
                                }`}
                              >
                                {PAY_STATUS_BADGES[inv.payment_status]?.label || inv.payment_status}
                              </span>
                            </td>
                          </tr>
                        ))}
                        {invoices.length === 0 && (
                          <tr>
                            <td colSpan={6} className="p-6 text-center text-slate-400">
                              لا توجد فواتير توريد مسجلة لهذا المورد حتى الآن.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Recent Payments */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-emerald-600" />
                      <span>آخر سندات الصرف والمدفوعات</span>
                    </h3>
                    <button
                      onClick={() => setTab('payments')}
                      className="text-xs text-sky-600 hover:text-sky-700 font-bold"
                    >
                      عرض الكل ({payments.length})
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-right">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="p-2.5">رقم السند</th>
                          <th className="p-2.5">التاريخ</th>
                          <th className="p-2.5">المبلغ</th>
                          <th className="p-2.5">طريقة الدفع</th>
                          <th className="p-2.5">البيان / ملاحظات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {payments.slice(0, 5).map((pay) => (
                          <tr key={pay.id} className="hover:bg-slate-50">
                            <td className="p-2.5 font-mono font-bold text-slate-900">{pay.receipt_number}</td>
                            <td className="p-2.5 text-slate-600">{pay.date}</td>
                            <td className="p-2.5 font-black text-emerald-700">
                              {CeramicMath.formatCurrency(pay.amount)}
                            </td>
                            <td className="p-2.5 font-bold text-slate-700">
                              {pay.payment_type === 'CASH'
                                ? 'نقدي'
                                : pay.payment_type === 'BANK'
                                ? 'تحويل بنكي'
                                : pay.payment_type === 'CHEQUE'
                                ? 'شيك'
                                : pay.payment_type}
                            </td>
                            <td className="p-2.5 text-slate-500 truncate max-w-xs">{pay.notes || '—'}</td>
                          </tr>
                        ))}
                        {payments.length === 0 && (
                          <tr>
                            <td colSpan={5} className="p-6 text-center text-slate-400">
                              لا توجد سندات صرف مسجلة لهذا المورد.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* INVOICES TAB */}
        {tab === 'invoices' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">سجل فواتير التوريد والشراء</h3>
                <p className="text-xs text-slate-500">كل الفواتير الصادرة من هذا المورد مع حالة السداد والمتبقي</p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to="/purchases"
                  className="px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>فاتورة شراء جديدة</span>
                </Link>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right min-w-[700px]">
                <thead className="bg-slate-50 text-slate-500 font-bold">
                  <tr>
                    <th className="p-3">رقم الفاتورة</th>
                    <th className="p-3">التاريخ</th>
                    <th className="p-3">الإجمالي</th>
                    <th className="p-3">المدفوع</th>
                    <th className="p-3">المتبقي</th>
                    <th className="p-3">حالة السداد</th>
                    <th className="p-3">ملاحظات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50">
                      <td className="p-3 font-mono font-bold text-slate-900">{inv.invoice_number}</td>
                      <td className="p-3 text-slate-600">{inv.date}</td>
                      <td className="p-3 font-black text-slate-900">
                        {CeramicMath.formatCurrency(inv.total_amount)}
                      </td>
                      <td className="p-3 font-bold text-emerald-700">
                        {CeramicMath.formatCurrency(inv.paid_amount)}
                      </td>
                      <td className="p-3 font-bold text-rose-700">
                        {CeramicMath.formatCurrency(inv.remaining_amount)}
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                            PAY_STATUS_BADGES[inv.payment_status]?.className ||
                            'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {PAY_STATUS_BADGES[inv.payment_status]?.label || inv.payment_status}
                        </span>
                      </td>
                      <td className="p-3 text-slate-500">{inv.notes || '—'}</td>
                    </tr>
                  ))}
                  {invoices.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-10 text-center text-slate-400">
                        لا توجد فواتير مسجلة لهذا المورد.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* PAYMENTS TAB */}
        {tab === 'payments' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">سندات الصرف والمدفوعات</h3>
                <p className="text-xs text-slate-500">سجل الدفعات المسددة للمورد وتأثيرها على رصيد الحساب</p>
              </div>
              {canPay && (
                <button
                  onClick={() => {
                    setPaymentError('');
                    setPaymentData({
                      amount: supplier.currentBalance > 0 ? supplier.currentBalance : 1000,
                      paymentType: 'CASH',
                      notes: `سداد دفعة لحساب المورد ${supplier.name}`,
                    });
                    setIsPaymentModalOpen(true);
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/30"
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  <span>تسجيل سند صرف جديد</span>
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right min-w-[700px]">
                <thead className="bg-slate-50 text-slate-500 font-bold">
                  <tr>
                    <th className="p-3">رقم السند</th>
                    <th className="p-3">التاريخ</th>
                    <th className="p-3">المبلغ المسدد</th>
                    <th className="p-3">طريقة الدفع</th>
                    <th className="p-3">الخزينة / المصدر</th>
                    <th className="p-3">البيان / ملاحظات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="p-3 font-mono font-bold text-slate-900">{p.receipt_number}</td>
                      <td className="p-3 text-slate-600">{p.date}</td>
                      <td className="p-3 font-black text-emerald-700 text-sm">
                        {CeramicMath.formatCurrency(p.amount)}
                      </td>
                      <td className="p-3 font-bold text-slate-800">
                        {p.payment_type === 'CASH'
                          ? 'نقدي'
                          : p.payment_type === 'BANK'
                          ? 'تحويل بنكي'
                          : p.payment_type === 'CHEQUE'
                          ? 'شيك'
                          : p.payment_type}
                      </td>
                      <td className="p-3 font-mono text-slate-500">{p.register_id || 'cr_main'}</td>
                      <td className="p-3 text-slate-600">{p.notes || '—'}</td>
                    </tr>
                  ))}
                  {payments.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-10 text-center text-slate-400">
                        لا توجد سندات صرف مسجلة لهذا المورد.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* PURCHASE ORDERS TAB */}
        {tab === 'orders' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">أوامر الشراء والتوريد</h3>
                <p className="text-xs text-slate-500">أوامر التوريد الصادرة ومتابعة حالة الاستلام</p>
              </div>
              <Link
                to="/purchases/orders"
                className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إنشاء أمر شراء جديد</span>
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right min-w-[700px]">
                <thead className="bg-slate-50 text-slate-500 font-bold">
                  <tr>
                    <th className="p-3">رقم الأمر</th>
                    <th className="p-3">تاريخ الأمر</th>
                    <th className="p-3">تاريخ التسليم المتوقع</th>
                    <th className="p-3">الإجمالي التقديري</th>
                    <th className="p-3">حالة الأمر</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.map((ord) => (
                    <tr key={ord.id} className="hover:bg-slate-50">
                      <td className="p-3 font-mono font-bold text-slate-900">{ord.order_number}</td>
                      <td className="p-3 text-slate-600">{ord.date}</td>
                      <td className="p-3 text-slate-600">{ord.expected_delivery_date || '—'}</td>
                      <td className="p-3 font-bold text-slate-900">
                        {CeramicMath.formatCurrency(ord.total_amount)}
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                            ORDER_STATUS_BADGES[ord.status]?.className ||
                            'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {ORDER_STATUS_BADGES[ord.status]?.label || ord.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {orders.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-10 text-center text-slate-400">
                        لا توجد أوامر شراء مسجلة لهذا المورد.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* PURCHASE RETURNS TAB */}
        {tab === 'returns' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">مرتجعات الشراء للمورد</h3>
                <p className="text-xs text-slate-500">حركات إرجاع البضاعة والتسويات المدينة على المورد</p>
              </div>
              <Link
                to="/purchases/returns"
                className="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>تسجيل مرتجع شراء</span>
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right min-w-[700px]">
                <thead className="bg-slate-50 text-slate-500 font-bold">
                  <tr>
                    <th className="p-3">رقم المرتجع</th>
                    <th className="p-3">التاريخ</th>
                    <th className="p-3">قيمة المرتجع</th>
                    <th className="p-3">سبب الإرجاع</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {returns.map((ret) => (
                    <tr key={ret.id} className="hover:bg-slate-50">
                      <td className="p-3 font-mono font-bold text-slate-900">{ret.return_number}</td>
                      <td className="p-3 text-slate-600">{ret.date}</td>
                      <td className="p-3 font-black text-rose-700">
                        {CeramicMath.formatCurrency(ret.total_amount)}
                      </td>
                      <td className="p-3 text-slate-700">{ret.reason || '—'}</td>
                    </tr>
                  ))}
                  {returns.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-10 text-center text-slate-400">
                        لا توجد مرتجعات شراء مسجلة لهذا المورد.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* STATEMENT TAB */}
        {tab === 'statement' && statement && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    كشف حساب المورد: {supplier.name}
                  </h3>
                  <p className="text-xs text-slate-500">
                    حركات الشراء وسندات الصرف ورصيد الحساب التراكمي
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 text-xs">
                    <label className="font-bold text-slate-600">من:</label>
                    <input
                      type="date"
                      value={statementFrom}
                      onChange={(e) => setStatementFrom(e.target.value)}
                      className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs"
                    />
                    <label className="font-bold text-slate-600">إلى:</label>
                    <input
                      type="date"
                      value={statementTo}
                      onChange={(e) => setStatementTo(e.target.value)}
                      className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs"
                    />
                    {(statementFrom || statementTo) && (
                      <button
                        onClick={() => {
                          setStatementFrom('');
                          setStatementTo('');
                        }}
                        className="text-xs text-rose-600 font-bold hover:underline"
                      >
                        إلغاء التصفية
                      </button>
                    )}
                  </div>

                  <button
                    onClick={exportStatementCsv}
                    className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>تصدير CSV</span>
                  </button>

                  <button
                    onClick={() => window.print()}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs flex items-center gap-1.5"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>طباعة كشف الحساب</span>
                  </button>
                </div>
              </div>

              {/* Statement Balances Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl">
                <div>
                  <span className="text-xs text-slate-500 font-bold">رصيد أول المدة:</span>
                  <div className="text-lg font-black text-slate-800">
                    {CeramicMath.formatCurrency(statement.openingBalance)}
                  </div>
                </div>
                <div>
                  <span className="text-xs text-slate-500 font-bold">إجمالي الحركات في الفترة:</span>
                  <div className="text-lg font-bold text-slate-700">
                    {statement.transactions.length} حركة
                  </div>
                </div>
                <div>
                  <span className="text-xs text-slate-500 font-bold">الرصيد الختامي المستحق:</span>
                  <div
                    className={`text-lg font-black ${
                      statement.closingBalance > 0
                        ? 'text-rose-600'
                        : statement.closingBalance < 0
                        ? 'text-emerald-600'
                        : 'text-slate-800'
                    }`}
                  >
                    {CeramicMath.formatCurrency(statement.closingBalance)}
                  </div>
                </div>
              </div>

              {/* Transactions Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-right min-w-[700px]">
                  <thead className="bg-slate-100 text-slate-700 font-bold">
                    <tr>
                      <th className="p-3">التاريخ</th>
                      <th className="p-3">النوع</th>
                      <th className="p-3">رقم المستند</th>
                      <th className="p-3">البيان والتفاصيل</th>
                      <th className="p-3 text-emerald-700">مدين (سداد)</th>
                      <th className="p-3 text-rose-700">دائن (توريد)</th>
                      <th className="p-3">الرصيد بعد الحركة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {statement.transactions.map((tx: any) => (
                      <tr key={tx.id} className="hover:bg-slate-50">
                        <td className="p-3 text-slate-600 font-mono">{tx.date}</td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              tx.type === 'PURCHASE'
                                ? 'bg-indigo-50 text-indigo-700'
                                : 'bg-emerald-50 text-emerald-700'
                            }`}
                          >
                            {tx.type === 'PURCHASE' ? 'فاتورة شراء' : 'سداد دفعة'}
                          </span>
                        </td>
                        <td className="p-3 font-mono font-bold text-slate-900">{tx.docNumber}</td>
                        <td className="p-3 text-slate-700">{tx.description}</td>
                        <td className="p-3 font-black text-emerald-700">
                          {tx.debit > 0 ? CeramicMath.formatCurrency(tx.debit) : '—'}
                        </td>
                        <td className="p-3 font-black text-rose-700">
                          {tx.credit > 0 ? CeramicMath.formatCurrency(tx.credit) : '—'}
                        </td>
                        <td className="p-3 font-black text-slate-900 font-mono">
                          {CeramicMath.formatCurrency(tx.balanceAfter)}
                        </td>
                      </tr>
                    ))}
                    {statement.transactions.length === 0 && (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-400">
                          لا توجد حركات في الفترة المحددة.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* SCORECARD TAB */}
        {tab === 'scorecard' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-indigo-600" />
                    <span>سجل تقييم وأداء المورد الشامل</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    تحليل مؤشرات الالتزام بمواعيد التوريد، نسب التلف والجودة، ومطالبات العيوب
                  </p>
                </div>

                {scorecard && (
                  <div className="flex items-center gap-3 bg-gradient-to-l from-indigo-50 to-purple-50 px-4 py-2 rounded-2xl border border-indigo-100">
                    <span className="text-xs font-bold text-slate-600">التقييم الإجمالي:</span>
                    <span
                      className={`text-sm font-black px-3 py-1 rounded-xl border ${
                        scorecard.ratingLabel === 'ممتاز'
                          ? 'bg-emerald-500 text-white border-emerald-600'
                          : scorecard.ratingLabel === 'جيد جداً'
                          ? 'bg-blue-500 text-white border-blue-600'
                          : scorecard.ratingLabel === 'جيد'
                          ? 'bg-amber-500 text-white border-amber-600'
                          : 'bg-rose-500 text-white border-rose-600'
                      }`}
                    >
                      {scorecard.ratingLabel} ({scorecard.overallScore}/100)
                    </span>
                  </div>
                )}
              </div>

              {scorecard ? (
                <>
                  {/* KPI Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                        <span>الالتزام بموعد التوريد</span>
                        <Clock className="w-4 h-4 text-sky-600" />
                      </div>
                      <div className="text-2xl font-black text-slate-900">
                        {scorecard.onTimeDeliveryRate}%
                      </div>
                      <div className="text-[11px] text-slate-500">
                        توريدات في موعدها: {scorecard.onTimeDeliveries} من {scorecard.receivedOrders}
                      </div>
                    </div>

                    <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                        <span>معدل قبول الفحص الفني</span>
                        <PackageCheck className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div className="text-2xl font-black text-emerald-600">
                        {scorecard.acceptanceRate}%
                      </div>
                      <div className="text-[11px] text-slate-500">
                        إجمالي المقبول: {scorecard.totalAcceptedM2} م²
                      </div>
                    </div>

                    <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                        <span>نسبة التالف والكسر</span>
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                      </div>
                      <div className="text-2xl font-black text-amber-600">
                        {scorecard.damageRate}%
                      </div>
                      <div className="text-[11px] text-slate-500">
                        إجمالي التالف: {scorecard.totalDamagedM2} م²
                      </div>
                    </div>

                    <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                        <span>مطالبات العيوب والنقص</span>
                        <Scale className="w-4 h-4 text-rose-600" />
                      </div>
                      <div className="text-2xl font-black text-rose-600">
                        {scorecard.totalClaimsCount}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        إجمالي القيمة: {CeramicMath.formatCurrency(scorecard.totalClaimedAmount)}
                      </div>
                    </div>
                  </div>

                  {/* Summary Box */}
                  <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 to-indigo-950 text-white space-y-3">
                    <div className="flex items-center gap-2 font-bold text-sm text-indigo-300">
                      <Sparkles className="w-4 h-4" />
                      <span>ملخص التوريدات المنجزة</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
                      <div>
                        <span className="text-slate-400 block">إجمالي أوامر الشراء:</span>
                        <span className="text-base font-black text-white">{scorecard.totalOrders} أمر شراء</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">الأوامر المستلمة:</span>
                        <span className="text-base font-black text-emerald-400">{scorecard.receivedOrders} أمر</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">إجمالي حجم المشتريات:</span>
                        <span className="text-base font-black text-white">
                          {CeramicMath.formatCurrency(scorecard.totalPurchases)}
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-12 text-center text-slate-400">
                  لا تتوفر بيانات تقييم كافية لهذا المورد بعد (يلزم تسجيل أوامر وأذونات استلام).
                </div>
              )}
            </div>
          </div>
        )}

        {/* PRICE HISTORY TAB */}
        {tab === 'price_history' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                    <TrendingDown className="w-5 h-5 text-sky-600" />
                    <span>سجل أسعار الشراء وتطور التكلفة</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    تتبع أسعار توريد الأصناف ومقارنة سعر الفاتورة بالتكلفة المحملة (Landed Cost)
                  </p>
                </div>
                <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-xl">
                  {priceHistory.length} صنف / حركة
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-right">
                  <thead className="bg-slate-50 text-slate-600 font-bold">
                    <tr>
                      <th className="p-3">التاريخ</th>
                      <th className="p-3">رقم الفاتورة</th>
                      <th className="p-3">اسم المنتج / الصنف</th>
                      <th className="p-3">الكمية (م² / قطعة)</th>
                      <th className="p-3">سعر التوريد الفاتورة</th>
                      <th className="p-3 text-indigo-700">تكلفة الوصول الفعلية</th>
                      <th className="p-3">حالة المطابقة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {priceHistory.map((row: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-3 font-mono text-slate-600">{row.date}</td>
                        <td className="p-3 font-mono font-bold text-slate-900">{row.invoiceNumber}</td>
                        <td className="p-3 font-bold text-slate-800">{row.productName}</td>
                        <td className="p-3 font-mono font-bold text-slate-700">{row.quantityM2}</td>
                        <td className="p-3 font-bold text-slate-800">
                          {CeramicMath.formatCurrency(row.unitCost)}
                        </td>
                        <td className="p-3 font-black text-indigo-700">
                          {CeramicMath.formatCurrency(row.effectiveUnitCost)}
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              row.matchingStatus === 'MATCHED'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : row.matchingStatus === 'DISCREPANCY'
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : 'bg-slate-50 text-slate-600 border-slate-200'
                            }`}
                          >
                            {row.matchingStatus === 'MATCHED'
                              ? 'مطابق'
                              : row.matchingStatus === 'DISCREPANCY'
                              ? 'يوجد فروق'
                              : 'مستقل'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {priceHistory.length === 0 && (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-400">
                          لا يوجد سجل أسعار مسجل لهذا المورد حتى الآن.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* RECORD PAYMENT MODAL */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4" dir="rtl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-600" />
                <span>سند صرف دفعة للمورد</span>
              </h3>
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            {paymentError && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs font-bold text-rose-800">
                {paymentError}
              </div>
            )}

            <form onSubmit={handleRecordPayment} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">المورد المستفيد</label>
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-2.5 text-xs font-bold text-slate-800">
                  {supplier.name} ({supplier.code})
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">المبلغ المراد سداده</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={paymentData.amount}
                  onChange={(e) => setPaymentData({ ...paymentData, amount: Number(e.target.value) })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-black text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">طريقة الدفع</label>
                <select
                  value={paymentData.paymentType}
                  onChange={(e) => setPaymentData({ ...paymentData, paymentType: e.target.value as PaymentType })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-800"
                >
                  <option value="CASH">نقدي (خزينة المعرض)</option>
                  <option value="BANK">تحويل بنكي</option>
                  <option value="CHEQUE">شيك مصرفي</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">البيان / ملاحظات</label>
                <textarea
                  rows={2}
                  value={paymentData.notes}
                  onChange={(e) => setPaymentData({ ...paymentData, notes: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-600/20"
                >
                  تأكيد وسداد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT SUPPLIER MODAL */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto" dir="rtl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                <Pencil className="w-4 h-4 text-sky-600" />
                <span>تعديل بيانات المورد</span>
              </h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateSupplier} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">اسم المورد *</label>
                  <input
                    type="text"
                    required
                    value={editFormData.name}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">اسم الشركة / المصنع</label>
                  <input
                    type="text"
                    value={editFormData.companyName}
                    onChange={(e) => setEditFormData({ ...editFormData, companyName: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">الهاتف *</label>
                  <input
                    type="text"
                    required
                    value={editFormData.phone}
                    onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">البريد الإلكتروني</label>
                  <input
                    type="email"
                    value={editFormData.email}
                    onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">الرقم الضريبي</label>
                  <input
                    type="text"
                    value={editFormData.taxNumber}
                    onChange={(e) => setEditFormData({ ...editFormData, taxNumber: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">السجل التجاري</label>
                  <input
                    type="text"
                    value={editFormData.commercialRecord}
                    onChange={(e) => setEditFormData({ ...editFormData, commercialRecord: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">فترة السداد (بالأيام)</label>
                  <input
                    type="number"
                    min="0"
                    value={editFormData.paymentTermsDays}
                    onChange={(e) => setEditFormData({ ...editFormData, paymentTermsDays: Number(e.target.value) })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">العنوان</label>
                  <input
                    type="text"
                    value={editFormData.address}
                    onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">ملاحظات</label>
                <textarea
                  rows={2}
                  value={editFormData.notes}
                  onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 shadow-md shadow-sky-600/20"
                >
                  حفظ التعديلات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
