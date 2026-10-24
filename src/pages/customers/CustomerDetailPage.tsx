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
import { useToast } from '../../components/ui/Toast';
import { format } from 'date-fns';
import { Customer, Product } from '../../types';

type Tab = 'overview' | 'sales' | 'quotations' | 'orders' | 'payments' | 'returns' | 'debts' | 'projects' | 'activities' | 'timeline' | 'prices';

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
  const [tab, setTab] = useState<Tab>('overview');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [lists, setLists] = useState<Record<string, any[]>>({});
  const [overrides, setOverrides] = useState<Array<{ id: string; productId: string; productName: string; priceM2: number; validFrom?: string | null; validTo?: string | null }>>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [overrideForm, setOverrideForm] = useState({ productId: '', priceM2: '', validFrom: '', validTo: '' });
  const [savingOverride, setSavingOverride] = useState(false);
  const toast = useToast();

  const reloadOverrides = (customerId: string) => {
    try { setOverrides(new PricingService().getCustomerOverrides(customerId)); }
    catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (!id) return;
    reloadOverrides(id);
    try { setProducts(new ProductService().getAllProducts()); }
    catch (e) { console.error(e); }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    try {
      const db = DatabaseManager.getInstance();
      setCustomer(new CustomerService().getCustomerById(id));
      setLists({
        sales: db.query(`SELECT id, invoice_number AS n1, date, total_amount AS amount, paid_amount AS paid,
          remaining_amount AS remaining, payment_status AS status FROM sales_invoices
          WHERE customer_id = ? AND invoice_status != 'VOID' ORDER BY date DESC LIMIT 100`, [id]),
        quotations: db.query(`SELECT quotation_number AS n1, date, total_amount AS amount, status,
          valid_until AS extra FROM quotations WHERE customer_id = ? ORDER BY date DESC`, [id]),
        orders: db.query(`SELECT order_number AS n1, date, total_amount AS amount, status,
          expected_delivery_date AS extra FROM orders WHERE customer_id = ? ORDER BY date DESC`, [id]),
        payments: db.query(`SELECT receipt_number AS n1, date, amount, payment_type AS kind,
          COALESCE(notes, '') AS notes FROM customer_payments WHERE customer_id = ? ORDER BY date DESC`, [id]),
        returns: db.query(`SELECT return_number AS n1, date, total_amount AS amount, reason AS notes
          FROM sales_returns WHERE customer_id = ? ORDER BY date DESC`, [id]),
        projects: db.query(`SELECT code AS n1, name, total_value AS amount, status
          FROM projects WHERE customer_id = ? ORDER BY created_at DESC`, [id]),
        activities: db.query(`SELECT subject AS n1, activity_type AS kind, status, created_at AS date,
          COALESCE(body, '') AS notes FROM crm_activities WHERE customer_id = ? ORDER BY created_at DESC`, [id]),
        debts: db.query(`SELECT invoice_number AS n1, date, total_amount AS amount, paid_amount AS paid,
          remaining_amount AS remaining, payment_status AS status FROM sales_invoices
          WHERE customer_id = ? AND remaining_amount > 0.009 ORDER BY date`, [id]),
        timeline: db.query(`SELECT action AS n1, module AS kind, created_at AS date, '' AS notes
          FROM audit_logs WHERE record_id = ? OR new_values LIKE ? ORDER BY created_at DESC LIMIT 100`, [id, `%${id}%`]),
      });
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [id]);

  const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(n ?? 0) + ' ج';
  const date = (v: string) => (v ? format(new Date(v), 'dd/MM/yyyy') : '—');

  if (loading) return <div className="flex items-center justify-center h-full bg-slate-50"><Loader2 className="w-8 h-8 animate-spin text-sky-600" /></div>;
  if (!customer) return (
    <div className="flex flex-col items-center justify-center h-full bg-slate-50 gap-4">
      <AlertTriangle className="w-10 h-10 text-amber-600" />
      <p className="text-slate-700">العميل غير موجود</p>
      <button onClick={() => navigate('/customers')} className="px-4 py-2 bg-sky-600 text-white rounded-lg text-sm">رجوع</button>
    </div>
  );

  const L = (k: string) => lists[k] || [];

  const saveOverride = () => {
    if (!id) return;
    const priceM2 = Number(overrideForm.priceM2);
    if (!overrideForm.productId) { toast.error('اختر المنتج أولًا'); return; }
    if (!Number.isFinite(priceM2) || priceM2 <= 0) { toast.error('أدخل سعرًا صحيحًا أكبر من صفر'); return; }
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
              <span className="text-xl font-black text-pink-600">{customer.name[0]}</span>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-500">{customer.customerType}</span>
                {customer.currentBalance > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 font-bold">مديون {fmt(customer.currentBalance)}</span>}
              </div>
              <h1 className="text-lg font-black text-slate-900">{customer.name}</h1>
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
            ].map((s) => (
              <div key={s.label} className="text-center px-4 py-2 bg-slate-100 rounded-xl">
                <div className={`text-base font-black ${s.color}`}>{s.value}</div>
                <div className="text-[10px] text-slate-500">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-1 mt-4 overflow-x-auto">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${tab === t.id ? 'bg-sky-600 text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}>
                <Icon className="w-3.5 h-3.5" />{t.label}
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
                  { label: 'حد الائتمان', value: customer.creditLimit ? fmt(customer.creditLimit) : 'غير محدد' },
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
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-bold text-slate-900 mb-4">ملخص الحساب</h3>
              <div className="space-y-3">
                {[
                  { label: 'إجمالي المشتريات', value: fmt(customer.totalPurchases), color: 'text-sky-600' },
                  { label: 'الرصيد الحالي', value: fmt(customer.currentBalance), color: customer.currentBalance > 0 ? 'text-rose-600' : 'text-emerald-600' },
                  { label: 'حد الائتمان', value: customer.creditLimit ? fmt(customer.creditLimit) : 'غير محدد', color: 'text-violet-600' },
                  { label: 'عدد الفواتير', value: String(L('sales').length), color: 'text-slate-700' },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <span className="text-xs text-slate-500">{row.label}</span>
                    <span className={`text-sm font-black ${row.color}`}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'sales' && (
          <DataTable headers={['رقم الفاتورة', 'التاريخ', 'الإجمالي', 'المدفوع', 'المتبقي', 'الحالة']} empty="لا توجد فواتير"
            rows={L('sales').map((r) => [
              <span className="font-mono text-sky-600">{r.n1}</span>, date(r.date),
              <b>{fmt(r.amount)}</b>, <span className="text-emerald-600">{fmt(r.paid)}</span>,
              <span className="text-rose-600">{r.remaining > 0 ? fmt(r.remaining) : '—'}</span>,
              <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${PAY_STATUS[r.status] || 'bg-slate-100 text-slate-600'}`}>{PAY_LABEL[r.status] || r.status}</span>,
              <button onClick={() => navigate(`/customers/${id}/imported-products?invoiceId=${encodeURIComponent(r.id)}`)} className="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-[11px] font-bold whitespace-nowrap">متابعة المنتجات الخارجية</button>,
            ])} />
        )}

        {tab === 'quotations' && (
          <DataTable headers={['رقم العرض', 'التاريخ', 'الإجمالي', 'صالح حتى', 'الحالة']} empty="لا توجد عروض أسعار"
            rows={L('quotations').map((r) => [<span className="font-mono text-sky-600">{r.n1}</span>, date(r.date), <b>{fmt(r.amount)}</b>, date(r.extra), r.status])} />
        )}

        {tab === 'orders' && (
          <DataTable headers={['رقم الطلب', 'التاريخ', 'الإجمالي', 'التسليم المتوقع', 'الحالة']} empty="لا توجد طلبات"
            rows={L('orders').map((r) => [<span className="font-mono text-sky-600">{r.n1}</span>, date(r.date), <b>{fmt(r.amount)}</b>, date(r.extra), r.status])} />
        )}

        {tab === 'payments' && (
          <DataTable headers={['رقم الإيصال', 'التاريخ', 'المبلغ', 'طريقة الدفع', 'ملاحظات']} empty="لا توجد مدفوعات"
            rows={L('payments').map((r) => [<span className="font-mono text-sky-600">{r.n1}</span>, date(r.date), <b className="text-emerald-600">{fmt(r.amount)}</b>, r.kind, r.notes || '—'])} />
        )}

        {tab === 'returns' && (
          <DataTable headers={['رقم المرتجع', 'التاريخ', 'القيمة', 'السبب']} empty="لا توجد مرتجعات"
            rows={L('returns').map((r) => [<span className="font-mono text-rose-600">{r.n1}</span>, date(r.date), <b className="text-rose-600">{fmt(r.amount)}</b>, r.notes])} />
        )}

        {tab === 'debts' && (
          <DataTable headers={['رقم الفاتورة', 'التاريخ', 'الإجمالي', 'المدفوع', 'المتبقي', 'الحالة']} empty="لا توجد مديونيات"
            rows={L('debts').map((r) => [<span className="font-mono">{r.n1}</span>, date(r.date), fmt(r.amount), fmt(r.paid), <b className="text-rose-600">{fmt(r.remaining)}</b>, PAY_LABEL[r.status] || r.status])} />
        )}

        {tab === 'projects' && (
          <DataTable headers={['كود المشروع', 'اسم المشروع', 'القيمة', 'الحالة']} empty="لا توجد مشاريع"
            rows={L('projects').map((r) => [<span className="font-mono text-sky-600">{r.n1}</span>, r.name, <b>{fmt(r.amount)}</b>, r.status])} />
        )}

        {tab === 'activities' && (
          <DataTable headers={['الموضوع', 'النوع', 'الحالة', 'التاريخ', 'التفاصيل']} empty="لا توجد أنشطة"
            rows={L('activities').map((r) => [r.n1, r.kind, r.status, date(r.date), r.notes || '—'])} />
        )}

        {tab === 'timeline' && (
          <DataTable headers={['الحدث', 'الوحدة', 'التاريخ']} empty="لا يوجد نشاط مسجل"
            rows={L('timeline').map((r) => [r.n1, r.kind, r.date ? new Date(r.date).toLocaleString('ar-EG') : '—'])} />
        )}

        {tab === 'prices' && (
          <div className="space-y-5">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 mb-1">
                <Tag className="w-4 h-4 text-sky-600" />
                <h3 className="text-sm font-bold text-slate-900">سعر خاص لهذا العميل</h3>
              </div>
              <p className="text-xs text-slate-500 mb-4">
                يتجاوز هذا السعر قوائم الأسعار والعروض الترويجية عند البيع من نقطة البيع لهذا العميل.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">المنتج</label>
                  <select
                    value={overrideForm.productId}
                    onChange={(e) => setOverrideForm((f) => ({ ...f, productId: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="">اختر المنتج</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} — {p.sku}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">السعر / م²</label>
                  <input
                    type="number" min="0" step="0.01"
                    value={overrideForm.priceM2}
                    onChange={(e) => setOverrideForm((f) => ({ ...f, priceM2: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">ساري من</label>
                  <input
                    type="date"
                    value={overrideForm.validFrom}
                    onChange={(e) => setOverrideForm((f) => ({ ...f, validFrom: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">ساري حتى</label>
                  <input
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
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
              <table className="w-full text-sm text-right min-w-[520px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['المنتج', 'السعر / م²', 'ساري من', 'ساري حتى', ''].map((h) => (
                      <th key={h} className="px-4 py-3 text-xs font-bold text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {overrides.length === 0 ? (
                    <tr><td colSpan={5} className="py-12 text-center text-slate-400">لا توجد أسعار خاصة لهذا العميل</td></tr>
                  ) : overrides.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-semibold text-slate-900">{row.productName}</td>
                      <td className="px-4 py-3 font-black text-sky-600">{fmt(row.priceM2)}</td>
                      <td className="px-4 py-3 text-slate-500">{row.validFrom ? date(row.validFrom) : '—'}</td>
                      <td className="px-4 py-3 text-slate-500">{row.validTo ? date(row.validTo) : '—'}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => removeOverride(row.productId)}
                          className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50"
                          title="حذف السعر الخاص"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
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
