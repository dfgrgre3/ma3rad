import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Users, ShoppingCart, FileText, Package2, CreditCard,
  RotateCcw as RotateCcl, Banknote, Boxes, Activity,
  Clock, Phone, MapPin, AlertTriangle, Loader2, Tag, Plus, Trash2,
} from 'lucide-react';
import { DatabaseManager } from '../../database/db';
import { CustomerService } from '../../services/CustomerService';
import { PricingService } from '../../services/PricingService';
import { ProductService } from '../../services/ProductService';
import { BranchAccessService } from '../../services/BranchAccessService';
import { usePermission } from '../../hooks/usePermission';
import { useToast } from '../../components/ui/Toast';
import { format, isValid } from 'date-fns';
import { Customer, Product } from '../../types';
import { useBusinessProfileMeta, useBusinessTerm } from '../../hooks/useBusinessTerm';

type Tab = 'overview' | 'sales' | 'quotations' | 'orders' | 'payments' | 'returns' | 'debts' | 'projects' | 'activities' | 'timeline' | 'prices';

type CustomerDetailRow = {
  id?: string;
  n1?: string;
  date?: string | null;
  amount?: number | null;
  paid?: number | null;
  remaining?: number | null;
  status?: string | null;
  extra?: string | null;
  kind?: string | null;
  notes?: string | null;
  name?: string | null;
};

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'نظرة عامة', icon: Users },
  { id: 'sales', label: 'المبيعات', icon: ShoppingCart },
  { id: 'quotations', label: 'عروض الأسعار', icon: FileText },
  { id: 'orders', label: 'الطلبات', icon: Package2 },
  { id: 'payments', label: 'المدفوعات', icon: CreditCard },
  { id: 'returns', label: 'المرتجعات', icon: RotateCcl },
  { id: 'debts', label: 'الديون', icon: Banknote },
  { id: 'projects', label: 'المشاريع', icon: Boxes },
  { id: 'activities', label: 'الأنشطة', icon: Activity },
  { id: 'timeline', label: 'الجدول الزمني', icon: Clock },
  { id: 'prices', label: 'أسعار خاصة', icon: Tag },
];

const TAB_PERMISSIONS: Partial<Record<Tab, string>> = {
  sales: 'sales.view',
  quotations: 'quotations.view',
  orders: 'orders.view',
  payments: 'finance.debts.view',
  returns: 'returns.view',
  debts: 'finance.debts.view',
  projects: 'projects.view',
  activities: 'crm.view',
  timeline: 'audit.view',
  prices: 'pricing.view',
};

const PAY_STATUS: Record<string, string> = { PAID: 'bg-emerald-50 text-emerald-600', PARTIAL: 'bg-amber-50 text-amber-600', UNPAID: 'bg-rose-50 text-rose-600' };
const PAY_LABEL: Record<string, string> = { PAID: 'مدفوع', PARTIAL: 'جزئي', UNPAID: 'آجل' };

const DataTable: React.FC<{ headers: string[]; rows: React.ReactNode[][]; empty: string }> = ({ headers, rows, empty }) => (
  <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
    <table className="w-full text-sm text-right min-w-[520px]">
      <thead className="bg-slate-50 border-b border-slate-200">
        <tr>{[...headers, ...(rows[0]?.length > headers.length ? ['إجراء'] : [])].map((h) => <th key={h} className="px-4 py-3 text-xs font-bold text-slate-500">{h}</th>)}</tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.length === 0 ? (
          <tr><td colSpan={headers.length} className="py-12 text-center text-slate-400">{empty}</td></tr>
        ) : rows.map((cells, i) => (
          <tr key={i} className="hover:bg-slate-50/70">{cells.map((c, j) => <td key={j} className="px-4 py-3">{c}</td>)}</tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const CustomerDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const can = usePermission();
  const customersLabel = useBusinessTerm('entities.customers.plural');
  const customerSingularLabel = useBusinessTerm('entities.customers.singular');
  const productsLabel = useBusinessTerm('entities.products.plural');
  const productSingularLabel = useBusinessTerm('entities.products.singular');
  const projectsLabel = useBusinessTerm('entities.projects.plural');
  const salesLabel = useBusinessTerm('modules.sales');
  const { label: businessProfileLabel } = useBusinessProfileMeta();
  const [tab, setTab] = useState<Tab>('overview');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [lists, setLists] = useState<Record<string, CustomerDetailRow[]>>({});
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Array<{ id: string; productId: string; productName: string; priceM2: number; validFrom?: string | null; validTo?: string | null }>>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [overrideForm, setOverrideForm] = useState({ productId: '', priceM2: '', validFrom: '', validTo: '' });
  const [savingOverride, setSavingOverride] = useState(false);
  const toast = useToast();

  const reloadOverrides = (customerId: string) => {
    if (!can('pricing.view')) {
      setOverrides([]);
      setPricingError(null);
      return;
    }
    try {
      setOverrides(new PricingService().getCustomerOverrides(customerId));
      setPricingError(null);
    } catch (error) {
      console.error(error);
      setOverrides([]);
      setPricingError(error instanceof Error ? error.message : 'تعذر تحميل الأسعار الخاصة');
    }
  };

  useEffect(() => {
    if (!id) return;
    reloadOverrides(id);
    if (can('pricing.update') && can('products.view')) {
      try {
        setProducts(new ProductService().getAllProducts());
      } catch (error) {
        console.error(error);
        setProducts([]);
        setPricingError(error instanceof Error ? error.message : 'تعذر تحميل المنتجات');
      }
    } else {
      setProducts([]);
    }
  }, [id, can]);

  useEffect(() => {
    if (!id) {
      setCustomer(null);
      setLists({});
      setLoadError('معرّف العميل غير صالح');
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setLoadError(null);
    setCustomer(null);
    setLists({});
    try {
      const db = DatabaseManager.getInstance();
      const branchAccess = new BranchAccessService();
      // Customer master data is shared, but every transactional row shown here must
      // stay inside the branches the current user is allowed to see.
      const invoiceScope = branchAccess.sqlScope(
        'si.branch_id',
        '(SELECT w.branch_id FROM warehouses w WHERE w.id = si.warehouse_id)'
      );
      const paymentScope = branchAccess.sqlScope(
        'cp.branch_id',
        '(SELECT cr.branch_id FROM cash_registers cr WHERE cr.id = cp.register_id)'
      );
      const orderScope = branchAccess.sqlScope(
        'o.branch_id',
        '(SELECT w.branch_id FROM warehouses w WHERE w.id = o.warehouse_id)'
      );
      const quotationScope = branchAccess.sqlScope(
        '(SELECT w.branch_id FROM warehouses w WHERE w.id = q.warehouse_id)'
      );
      const quotationClause = `(q.warehouse_id IS NULL OR ${quotationScope.clause})`;
      const projectScope = branchAccess.sqlScope('pr.branch_id');
      const projectClause = `(pr.branch_id IS NULL OR ${projectScope.clause})`;
      setCustomer(new CustomerService().getCustomerById(id));
      const availableLists: Record<string, CustomerDetailRow[]> = {};
      if (can('sales.view')) {
        const debtColumns = can('finance.debts.view')
          ? 'si.paid_amount AS paid, si.remaining_amount AS remaining, si.payment_status AS status'
          : 'NULL AS paid, NULL AS remaining, NULL AS status';
        availableLists.sales = db.query<CustomerDetailRow>(`SELECT si.id, si.invoice_number AS n1, si.date, si.total_amount AS amount,
          ${debtColumns}
          FROM sales_invoices si
          WHERE si.customer_id = ? AND si.invoice_status != 'VOID' AND ${invoiceScope.clause}
          ORDER BY si.date DESC LIMIT 100`, [id, ...invoiceScope.params]);
      }
      if (can('quotations.view')) availableLists.quotations = db.query<CustomerDetailRow>(`SELECT q.quotation_number AS n1, q.date, q.total_amount AS amount, q.status,
          q.valid_until AS extra FROM quotations q
          WHERE q.customer_id = ? AND ${quotationClause} ORDER BY q.date DESC`, [id, ...quotationScope.params]);
      if (can('orders.view')) availableLists.orders = db.query<CustomerDetailRow>(`SELECT o.order_number AS n1, o.date, o.total_amount AS amount, o.status,
          o.expected_delivery_date AS extra FROM orders o
          WHERE o.customer_id = ? AND ${orderScope.clause} ORDER BY o.date DESC`, [id, ...orderScope.params]);
      if (can('finance.debts.view')) availableLists.payments = db.query<CustomerDetailRow>(`SELECT cp.receipt_number AS n1, cp.date, cp.amount, cp.payment_type AS kind,
          COALESCE(cp.notes, '') AS notes FROM customer_payments cp
          WHERE cp.customer_id = ? AND ${paymentScope.clause} ORDER BY cp.date DESC`, [id, ...paymentScope.params]);
      if (can('returns.view')) availableLists.returns = db.query<CustomerDetailRow>(`SELECT sr.return_number AS n1, sr.date, sr.total_amount AS amount, sr.reason AS notes
          FROM sales_returns sr
          LEFT JOIN sales_invoices si ON si.id = sr.original_invoice_id
          WHERE sr.customer_id = ? AND ${invoiceScope.clause} ORDER BY sr.date DESC`, [id, ...invoiceScope.params]);
      if (can('projects.view')) availableLists.projects = db.query<CustomerDetailRow>(`SELECT pr.code AS n1, pr.name, pr.contract_value AS amount, pr.status
          FROM projects pr WHERE pr.customer_id = ? AND ${projectClause}
          ORDER BY pr.created_at DESC`, [id, ...projectScope.params]);
      if (can('crm.view')) availableLists.activities = db.query<CustomerDetailRow>(`SELECT subject AS n1, activity_type AS kind, status, created_at AS date,
          COALESCE(body, '') AS notes FROM crm_activities WHERE customer_id = ? ORDER BY created_at DESC`, [id]);
      if (can('finance.debts.view')) availableLists.debts = db.query<CustomerDetailRow>(`SELECT si.invoice_number AS n1, si.date, si.total_amount AS amount,
          si.paid_amount AS paid, si.remaining_amount AS remaining, si.payment_status AS status
          FROM sales_invoices si
          WHERE si.customer_id = ? AND si.remaining_amount > 0.009 AND ${invoiceScope.clause}
          ORDER BY si.date`, [id, ...invoiceScope.params]);
      if (can('audit.view')) availableLists.timeline = db.query<CustomerDetailRow>(`SELECT action AS n1, module AS kind, created_at AS date, '' AS notes
          FROM audit_logs WHERE module = 'CUSTOMERS' AND (record_id = ? OR new_values LIKE ?)
          ORDER BY created_at DESC LIMIT 100`, [id, `%${id}%`]);
      setLists(availableLists);
    } catch (error) {
      console.error(error);
      if (active) {
        setCustomer(null);
        setLists({});
        setLoadError(error instanceof Error ? error.message : 'تعذر تحميل بيانات العميل');
      }
    } finally {
      if (active) setLoading(false);
    }
    return () => { active = false; };
  }, [id, can, reloadKey]);

  useEffect(() => {
    if (tab !== 'overview' && TAB_PERMISSIONS[tab] && !can(TAB_PERMISSIONS[tab]!)) setTab('overview');
  }, [tab, can]);

  const fmt = (n: number | null | undefined) => {
    const value = Number(n);
    return `${new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0)} ج`;
  };
  const date = (v?: string | null) => {
    if (!v) return '—';
    const parsed = new Date(v);
    return isValid(parsed) ? format(parsed, 'dd/MM/yyyy') : '—';
  };

  if (loading) return <div role="status" aria-label="جارٍ تحميل بيانات العميل" className="flex items-center justify-center h-full bg-slate-50"><Loader2 className="w-8 h-8 animate-spin text-sky-600" /></div>;
  if (loadError) return (
    <div role="alert" className="flex flex-col items-center justify-center h-full bg-slate-50 gap-4 p-6 text-center">
      <AlertTriangle className="w-10 h-10 text-rose-600" />
      <p className="text-slate-700">{loadError}</p>
      <div className="flex items-center gap-2">
        <button onClick={() => setReloadKey((key) => key + 1)} className="px-4 py-2 bg-sky-600 text-white rounded-lg text-sm">إعادة المحاولة</button>
        <button onClick={() => navigate('/customers')} className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm">رجوع</button>
      </div>
    </div>
  );
  if (!customer) return (
    <div className="flex flex-col items-center justify-center h-full bg-slate-50 gap-4">
      <AlertTriangle className="w-10 h-10 text-amber-600" />
      <p className="text-slate-700">{customerSingularLabel} غير موجود</p>
      <button onClick={() => navigate('/customers')} className="px-4 py-2 bg-sky-600 text-white rounded-lg text-sm">رجوع</button>
    </div>
  );

  const L = (k: string): CustomerDetailRow[] => lists[k] || [];

  const saveOverride = () => {
    if (!can('pricing.update')) return;
    if (!id) return;
    const priceM2 = Number(overrideForm.priceM2);
    if (!overrideForm.productId) { toast.error('اختر المنتج أولًا'); return; }
    if (!Number.isFinite(priceM2) || priceM2 <= 0) { toast.error('أدخل سعرًا صحيحًا أكبر من صفر'); return; }
    if (overrideForm.validFrom && overrideForm.validTo && overrideForm.validFrom > overrideForm.validTo) {
      toast.error('تاريخ بداية الصلاحية يجب أن يسبق تاريخ نهايتها');
      return;
    }
    setSavingOverride(true);
    try {
      new PricingService().setCustomerOverride({
        customerId: id,
        productId: overrideForm.productId,
        priceM2,
        validFrom: overrideForm.validFrom || undefined,
        validTo: overrideForm.validTo || undefined,
      });
      setOverrideForm({ productId: '', priceM2: '', validFrom: '', validTo: '' });
      reloadOverrides(id);
      toast.success('تم حفظ السعر الخاص للعميل');
    } catch (e: any) {
      toast.error(e?.message || 'تعذر حفظ السعر الخاص');
    } finally {
      setSavingOverride(false);
    }
  };

  const removeOverride = (productId: string) => {
    if (!can('pricing.update')) return;
    if (!id) return;
    if (!window.confirm('هل تريد حذف السعر الخاص لهذا المنتج؟')) return;
    try {
      new PricingService().deleteCustomerOverride(id, productId);
      reloadOverrides(id);
      toast.success('تم حذف السعر الخاص');
    } catch (e: any) {
      toast.error(e?.message || 'تعذر حذف السعر الخاص');
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center">
              <span className="text-xl font-black text-pink-600">{customer.name?.trim().charAt(0) || '؟'}</span>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-500">{customer.customerType}</span>
                {can('finance.debts.view') && customer.currentBalance > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 font-bold">مديون {fmt(customer.currentBalance)}</span>}
              </div>
              <h1 className="text-lg font-black text-slate-900">{customer.name}</h1>
              <div className="mt-1 text-[11px] font-bold text-sky-700">{customersLabel} · {businessProfileLabel}</div>
              <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                <span className="font-mono">{customer.code}</span>
                {customer.phone && <a href={`tel:${customer.phone}`} className="flex items-center gap-1 hover:text-sky-600"><Phone className="w-3 h-3" />{customer.phone}</a>}
                {customer.address && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{customer.address}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {[
              { label: 'إجمالي المشتريات', value: fmt(customer.totalPurchases), color: 'text-sky-600' },
              { label: 'الرصيد المستحق', value: fmt(customer.currentBalance), color: customer.currentBalance > 0 ? 'text-rose-600' : 'text-emerald-600' },
              ].filter((s) => s.label === 'إجمالي المشتريات' ? can('sales.view') : can('finance.debts.view')).map((s) => (
              <div key={s.label} className="text-center px-4 py-2 bg-slate-100 rounded-xl">
                <div className={`text-base font-black ${s.color}`}>{s.value}</div>
                <div className="text-[10px] text-slate-500">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-1 mt-4 overflow-x-auto">
          {TABS.filter((t) => !TAB_PERMISSIONS[t.id] || can(TAB_PERMISSIONS[t.id]!)).map((t) => {
            const Icon = t.icon;
            const label = t.id === 'sales'
              ? salesLabel
              : t.id === 'projects'
                ? projectsLabel
                : t.label;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${tab === t.id ? 'bg-sky-600 text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}>
                <Icon className="w-3.5 h-3.5" />{label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-bold text-slate-900 mb-4">البيانات الأساسية</h3>
              <dl className="space-y-3">
                {[
                  { label: 'الاسم', value: customer.name },
                  { label: 'الهاتف', value: customer.phone },
                  { label: 'هاتف إضافي', value: customer.phone2 },
                  { label: 'العنوان', value: customer.address },
                  { label: 'المدينة', value: customer.city },
                  { label: 'الرقم القومي', value: customer.nationalId },
                  ...(can('finance.debts.view') ? [{ label: 'حد الائتمان', value: customer.creditLimit ? fmt(customer.creditLimit) : 'غير محدد' }] : []),
                  { label: 'تاريخ التسجيل', value: date(customer.createdAt) },
                  { label: 'ملاحظات', value: customer.notes },
                ].filter((r) => r.value).map((row) => (
                  <div key={row.label} className="flex justify-between py-1.5 border-b border-slate-100 last:border-0">
                    <dt className="text-xs text-slate-500">{row.label}</dt>
                    <dd className="text-sm font-semibold text-slate-900 text-left">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            {(can('sales.view') || can('finance.debts.view')) && <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-bold text-slate-900 mb-4">ملخص الحساب</h3>
              <div className="space-y-3">
                {[
                  ...(can('sales.view') ? [
                    { label: 'إجمالي المشتريات', value: fmt(customer.totalPurchases), color: 'text-sky-600' },
                    { label: 'عدد الفواتير', value: String(L('sales').length), color: 'text-slate-700' },
                  ] : []),
                  ...(can('finance.debts.view') ? [
                    { label: 'الرصيد الحالي', value: fmt(customer.currentBalance), color: customer.currentBalance > 0 ? 'text-rose-600' : 'text-emerald-600' },
                    { label: 'حد الائتمان', value: customer.creditLimit ? fmt(customer.creditLimit) : 'غير محدد', color: 'text-violet-600' },
                  ] : []),
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <span className="text-xs text-slate-500">{row.label}</span>
                    <span className={`text-sm font-black ${row.color}`}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>}
          </div>
        )}

        {tab === 'sales' && can('sales.view') && (
          <DataTable
            headers={[
              'رقم الفاتورة',
              'التاريخ',
              'الإجمالي',
              ...(can('finance.debts.view') ? ['المدفوع', 'المتبقي', 'الحالة'] : []),
              `متابعة ${productsLabel}`,
            ]}
            empty="لا توجد فواتير"
            rows={L('sales').map((r) => [
              <span className="font-mono text-sky-600">{r.n1}</span>,
              date(r.date),
              <b>{fmt(r.amount)}</b>,
              ...(can('finance.debts.view') ? [
                <span className="text-emerald-600">{fmt(r.paid)}</span>,
                <span className="text-rose-600">{Number(r.remaining) > 0 ? fmt(r.remaining) : '—'}</span>,
                <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${PAY_STATUS[r.status || ''] || 'bg-slate-100 text-slate-600'}`}>{PAY_LABEL[r.status || ''] || r.status}</span>,
              ] : []),
              <button onClick={() => r.id && navigate(`/customers/${id}/imported-products?invoiceId=${encodeURIComponent(r.id)}`)} disabled={!r.id} className="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-[11px] font-bold whitespace-nowrap disabled:opacity-50">متابعة {productsLabel} الخارجية</button>,
            ])}
          />
        )}

        {tab === 'quotations' && can('quotations.view') && (
          <DataTable headers={['رقم العرض', 'التاريخ', 'الإجمالي', 'صالح حتى', 'الحالة']} empty="لا توجد عروض أسعار"
            rows={L('quotations').map((r) => [<span className="font-mono text-sky-600">{r.n1}</span>, date(r.date), <b>{fmt(r.amount)}</b>, date(r.extra), r.status])} />
        )}

        {tab === 'orders' && can('orders.view') && (
          <DataTable headers={['رقم الطلب', 'التاريخ', 'الإجمالي', 'التسليم المتوقع', 'الحالة']} empty="لا توجد طلبات"
            rows={L('orders').map((r) => [<span className="font-mono text-sky-600">{r.n1}</span>, date(r.date), <b>{fmt(r.amount)}</b>, date(r.extra), r.status])} />
        )}

        {tab === 'payments' && can('finance.debts.view') && (
          <DataTable headers={['رقم الإيصال', 'التاريخ', 'المبلغ', 'طريقة الدفع', 'ملاحظات']} empty="لا توجد مدفوعات"
            rows={L('payments').map((r) => [<span className="font-mono text-sky-600">{r.n1}</span>, date(r.date), <b className="text-emerald-600">{fmt(r.amount)}</b>, r.kind, r.notes || '—'])} />
        )}

        {tab === 'returns' && can('returns.view') && (
          <DataTable headers={['رقم المرتجع', 'التاريخ', 'القيمة', 'السبب']} empty="لا توجد مرتجعات"
            rows={L('returns').map((r) => [<span className="font-mono text-rose-600">{r.n1}</span>, date(r.date), <b className="text-rose-600">{fmt(r.amount)}</b>, r.notes])} />
        )}

        {tab === 'debts' && can('finance.debts.view') && (
          <DataTable headers={['رقم الفاتورة', 'التاريخ', 'الإجمالي', 'المدفوع', 'المتبقي', 'الحالة']} empty="لا توجد مديونيات"
            rows={L('debts').map((r) => [<span className="font-mono">{r.n1}</span>, date(r.date), fmt(r.amount), fmt(r.paid), <b className="text-rose-600">{fmt(r.remaining)}</b>, PAY_LABEL[r.status || ''] || r.status])} />
        )}

        {tab === 'projects' && can('projects.view') && (
          <DataTable headers={['كود المشروع', 'اسم المشروع', 'القيمة', 'الحالة']} empty="لا توجد مشاريع"
            rows={L('projects').map((r) => [<span className="font-mono text-sky-600">{r.n1}</span>, r.name, <b>{fmt(r.amount)}</b>, r.status])} />
        )}

        {tab === 'activities' && can('crm.view') && (
          <DataTable headers={['الموضوع', 'النوع', 'الحالة', 'التاريخ', 'التفاصيل']} empty="لا توجد أنشطة"
            rows={L('activities').map((r) => [r.n1, r.kind, r.status, date(r.date), r.notes || '—'])} />
        )}

        {tab === 'timeline' && can('audit.view') && (
          <DataTable headers={['الحدث', 'الوحدة', 'التاريخ']} empty="لا يوجد نشاط مسجل"
            rows={L('timeline').map((r) => [r.n1, r.kind, r.date ? new Date(r.date).toLocaleString('ar-EG') : '—'])} />
        )}

        {tab === 'prices' && can('pricing.view') && (
          <div className="space-y-5">
            {pricingError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{pricingError}</div>}
            {can('pricing.update') && can('products.view') && <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 mb-1">
                <Tag className="w-4 h-4 text-sky-600" />
                <h3 className="text-sm font-bold text-slate-900">سعر خاص لـ {customerSingularLabel}</h3>
              </div>
              <p className="text-xs text-slate-500 mb-4">
                يتجاوز هذا السعر قوائم الأسعار والعروض الترويجية عند البيع من نقطة البيع لهذا السجل.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <div className="md:col-span-2">
                  <label htmlFor="customer-override-product" className="block text-[11px] font-semibold text-slate-600 mb-1">{productSingularLabel}</label>
                  <select
                    id="customer-override-product"
                    value={overrideForm.productId}
                    onChange={(e) => setOverrideForm((f) => ({ ...f, productId: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="">اختر {productSingularLabel}</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} — {p.sku}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="customer-override-price" className="block text-[11px] font-semibold text-slate-600 mb-1">السعر / م²</label>
                  <input
                    id="customer-override-price"
                    type="number" min="0" step="0.01"
                    value={overrideForm.priceM2}
                    onChange={(e) => setOverrideForm((f) => ({ ...f, priceM2: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label htmlFor="customer-override-valid-from" className="block text-[11px] font-semibold text-slate-600 mb-1">ساري من</label>
                  <input
                    id="customer-override-valid-from"
                    type="date"
                    value={overrideForm.validFrom}
                    onChange={(e) => setOverrideForm((f) => ({ ...f, validFrom: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label htmlFor="customer-override-valid-to" className="block text-[11px] font-semibold text-slate-600 mb-1">ساري حتى</label>
                  <input
                    id="customer-override-valid-to"
                    type="date"
                    value={overrideForm.validTo}
                    onChange={(e) => setOverrideForm((f) => ({ ...f, validTo: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>
              <div className="flex justify-end mt-3">
                <button
                  onClick={saveOverride}
                  disabled={savingOverride}
                  className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-semibold hover:bg-sky-700 disabled:opacity-60"
                >
                  {savingOverride ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  حفظ السعر
                </button>
              </div>
            </div>}

            <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
              <table className="w-full text-sm text-right min-w-[520px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {[productSingularLabel, 'السعر / م²', 'ساري من', 'ساري حتى', ...(can('pricing.update') ? [''] : [])].map((h) => (
                      <th key={h} className="px-4 py-3 text-xs font-bold text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {overrides.length === 0 ? (
                    <tr><td colSpan={can('pricing.update') ? 5 : 4} className="py-12 text-center text-slate-400">لا توجد أسعار خاصة لهذا السجل</td></tr>
                  ) : overrides.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-semibold text-slate-900">{row.productName}</td>
                      <td className="px-4 py-3 font-black text-sky-600">{fmt(row.priceM2)}</td>
                      <td className="px-4 py-3 text-slate-500">{row.validFrom ? date(row.validFrom) : '—'}</td>
                      <td className="px-4 py-3 text-slate-500">{row.validTo ? date(row.validTo) : '—'}</td>
                      {can('pricing.update') && <td className="px-4 py-3">
                        <button
                          onClick={() => removeOverride(row.productId)}
                          className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50"
                          title="حذف السعر الخاص"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
