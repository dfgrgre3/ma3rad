import React from 'react';
import {
  ReceiptText,
  Plus,
  Search,
  Download,
  Eye,
  Wallet,
  Ban,
  Trash2,
  Send,
} from 'lucide-react';
import {
  platformAdminService,
  PLATFORM_INVOICE_STATUS_LABELS,
} from '../../services/domains/platform/PlatformAdminService';
import type {
  PlatformInvoice,
  PlatformInvoiceInput,
  PlatformInvoiceItem,
  PlatformInvoiceStatus,
  PlatformPayment,
  PlatformPaymentMethod,
  PlatformPlan,
  PlatformTenant,
} from '../../services/domains/platform/platformTypes';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { useToast } from '../../components/ui/Toast';
import {
  EmptyState,
  Field,
  StatusBadge,
  downloadCsv,
  formatDate,
  formatDateTime,
  formatMoney,
  inputClass,
} from './components/PlatformUI';

const INVOICE_STATUSES: PlatformInvoiceStatus[] = ['DRAFT', 'SENT', 'PARTIAL', 'PAID', 'OVERDUE', 'VOID'];
const PAYMENT_METHODS: Array<{ value: PlatformPaymentMethod; label: string }> = [
  { value: 'CASH', label: 'نقدي' },
  { value: 'BANK', label: 'تحويل بنكي' },
  { value: 'CARD', label: 'بطاقة' },
  { value: 'WALLET', label: 'محفظة إلكترونية' },
  { value: 'OTHER', label: 'أخرى' },
];
const PAYMENT_METHOD_LABELS = Object.fromEntries(PAYMENT_METHODS.map((item) => [item.value, item.label])) as Record<PlatformPaymentMethod, string>;

const today = () => new Date().toISOString().slice(0, 10);

const emptyInvoice: PlatformInvoiceInput = {
  tenantId: '',
  issueDate: today(),
  dueDate: '',
  discount: 0,
  tax: 0,
  notes: '',
  status: 'DRAFT',
  items: [{ description: '', quantity: 1, unitPrice: 0 }],
};

export const PlatformBillingPage: React.FC = () => {
  const toast = useToast();
  const [tab, setTab] = React.useState<'invoices' | 'payments'>('invoices');
  const [invoices, setInvoices] = React.useState<PlatformInvoice[]>([]);
  const [payments, setPayments] = React.useState<PlatformPayment[]>([]);
  const [tenants, setTenants] = React.useState<PlatformTenant[]>([]);
  const [plans, setPlans] = React.useState<PlatformPlan[]>([]);
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [invoiceOpen, setInvoiceOpen] = React.useState(false);
  const [invoiceForm, setInvoiceForm] = React.useState<PlatformInvoiceInput>(emptyInvoice);
  const [savingInvoice, setSavingInvoice] = React.useState(false);

  const [detail, setDetail] = React.useState<PlatformInvoice | null>(null);

  const [payOpen, setPayOpen] = React.useState(false);
  const [payForm, setPayForm] = React.useState({
    tenantId: '',
    invoiceId: '',
    amount: 0,
    method: 'CASH' as PlatformPaymentMethod,
    reference: '',
    paidAt: today(),
    notes: '',
  });

  const load = React.useCallback(() => {
    setLoading(true);
    try {
      setInvoices(platformAdminService.listInvoices(search, status));
      setPayments(platformAdminService.listPayments());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل بيانات المبيعات.');
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  React.useEffect(() => { load(); }, [load]);

  React.useEffect(() => {
    try {
      setTenants(platformAdminService.listTenants());
      setPlans(platformAdminService.listPlans(false));
    } catch {
      /* handled by the list error */
    }
  }, []);

  const subtotal = invoiceForm.items.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
    0
  );
  const total = Math.max(0, subtotal - (Number(invoiceForm.discount) || 0) + (Number(invoiceForm.tax) || 0));

  const openCreateInvoice = () => {
    setInvoiceForm({ ...emptyInvoice, items: [{ description: '', quantity: 1, unitPrice: 0 }] });
    setInvoiceOpen(true);
  };

  const applyPlan = (planId: string) => {
    const plan = plans.find((item) => item.id === planId);
    if (!plan) return;
    const cycleLabel = plan.billingCycle === 'MONTHLY' ? 'شهري'
      : plan.billingCycle === 'QUARTERLY' ? 'ربع سنوي'
      : plan.billingCycle === 'LIFETIME' ? 'مدى الحياة' : 'سنوي';
    setInvoiceForm((current) => ({
      ...current,
      items: [
        { description: `اشتراك ${plan.name} (${cycleLabel})`, quantity: 1, unitPrice: plan.price },
      ],
    }));
  };

  const updateItem = (index: number, patch: Partial<PlatformInvoiceItem>) => {
    setInvoiceForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    }));
  };

  const addItem = () => {
    setInvoiceForm((current) => ({ ...current, items: [...current.items, { description: '', quantity: 1, unitPrice: 0 }] }));
  };

  const removeItem = (index: number) => {
    setInvoiceForm((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }));
  };

  const saveInvoice = () => {
    if (!invoiceForm.tenantId) {
      toast.error('اختر العميل أولاً');
      return;
    }
    const items = invoiceForm.items.filter((item) => item.description.trim());
    if (items.length === 0) {
      toast.error('أضف بنداً واحداً على الأقل');
      return;
    }
    setSavingInvoice(true);
    try {
      const invoice = platformAdminService.createInvoice({
        ...invoiceForm,
        dueDate: invoiceForm.dueDate || undefined,
        items,
      });
      toast.success('تم إنشاء الفاتورة', invoice.number);
      setInvoiceOpen(false);
      load();
    } catch (err) {
      toast.error('تعذر إنشاء الفاتورة', err instanceof Error ? err.message : undefined);
    } finally {
      setSavingInvoice(false);
    }
  };

  const sendInvoice = (invoice: PlatformInvoice) => {
    try {
      platformAdminService.setInvoiceStatus(invoice.id, 'SENT');
      toast.success('تم إرسال الفاتورة', invoice.number);
      load();
    } catch (err) {
      toast.error('تعذر تحديث الفاتورة', err instanceof Error ? err.message : undefined);
    }
  };

  const voidInvoice = (invoice: PlatformInvoice) => {
    if (!window.confirm(`إلغاء الفاتورة ${invoice.number}؟ لن يمكن التراجع.`)) return;
    try {
      platformAdminService.voidInvoice(invoice.id);
      toast.success('تم إلغاء الفاتورة');
      setDetail(null);
      load();
    } catch (err) {
      toast.error('تعذر إلغاء الفاتورة', err instanceof Error ? err.message : undefined);
    }
  };

  const openDetail = (invoice: PlatformInvoice) => {
    try {
      setDetail(platformAdminService.getInvoice(invoice.id));
    } catch (err) {
      toast.error('تعذر تحميل الفاتورة', err instanceof Error ? err.message : undefined);
    }
  };

  const openPayment = (invoice?: PlatformInvoice) => {
    setPayForm({
      tenantId: invoice?.tenantId ?? '',
      invoiceId: invoice?.id ?? '',
      amount: invoice ? Math.max(0, invoice.total - invoice.paidAmount) : 0,
      method: 'CASH',
      reference: '',
      paidAt: today(),
      notes: '',
    });
    setPayOpen(true);
  };

  const savePayment = () => {
    if (!payForm.tenantId) {
      toast.error('اختر العميل أولاً');
      return;
    }
    if (!(payForm.amount > 0)) {
      toast.error('قيمة الدفعة يجب أن تكون أكبر من صفر');
      return;
    }
    try {
      platformAdminService.addPayment({
        tenantId: payForm.tenantId,
        invoiceId: payForm.invoiceId || null,
        amount: payForm.amount,
        method: payForm.method,
        reference: payForm.reference,
        paidAt: payForm.paidAt,
        notes: payForm.notes,
      });
      toast.success('تم تسجيل الدفعة');
      setPayOpen(false);
      setDetail(null);
      load();
    } catch (err) {
      toast.error('تعذر تسجيل الدفعة', err instanceof Error ? err.message : undefined);
    }
  };

  const voidPayment = (payment: PlatformPayment) => {
    if (!window.confirm('إلغاء هذه الدفعة؟ سيُعاد احتساب الفاتورة المرتبطة.')) return;
    try {
      platformAdminService.voidPayment(payment.id);
      toast.success('تم إلغاء الدفعة');
      load();
    } catch (err) {
      toast.error('تعذر إلغاء الدفعة', err instanceof Error ? err.message : undefined);
    }
  };

  const exportInvoices = () => {
    downloadCsv('platform-invoices.csv', [
      ['الرقم', 'العميل', 'الحالة', 'الإجمالي', 'المدفوع', 'المتبقي', 'تاريخ الاستحقاق'],
      ...invoices.map((invoice) => [
        invoice.number,
        invoice.tenantName ?? '',
        PLATFORM_INVOICE_STATUS_LABELS[invoice.status],
        invoice.total,
        invoice.paidAmount,
        invoice.total - invoice.paidAmount,
        invoice.dueDate ?? '',
      ]),
    ]);
  };

  const invoiceRows = invoices.filter((invoice) => {
    if (!search.trim()) return true;
    const term = search.trim().toLowerCase();
    return invoice.number.toLowerCase().includes(term) || (invoice.tenantName ?? '').toLowerCase().includes(term);
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="المبيعات والفواتير"
        description="إدارة فواتير العملاء والمدفوعات والمستحقات."
        icon={<ReceiptText className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" leadingIcon={<Download className="h-3.5 w-3.5" />} onClick={exportInvoices}>
              تصدير الفواتير
            </Button>
            <Button variant="secondary" size="sm" leadingIcon={<Wallet className="h-3.5 w-3.5" />} onClick={() => openPayment()}>
              تسجيل دفعة
            </Button>
            <Button variant="primary" size="sm" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={openCreateInvoice}>
              فاتورة جديدة
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="inline-flex rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setTab('invoices')}
            className={`rounded-md px-3 py-1.5 text-[12px] font-bold transition ${tab === 'invoices' ? 'bg-white text-slate-900 shadow' : 'text-slate-500'}`}
          >
            الفواتير ({invoices.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('payments')}
            className={`rounded-md px-3 py-1.5 text-[12px] font-bold transition ${tab === 'payments' ? 'bg-white text-slate-900 shadow' : 'text-slate-500'}`}
          >
            المدفوعات ({payments.length})
          </button>
        </div>
        {tab === 'invoices' && (
          <>
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="ابحث برقم الفاتورة أو العميل..."
                className={`${inputClass} pr-8`}
              />
            </div>
            <select value={status} onChange={(event) => setStatus(event.target.value)} className={`${inputClass} max-w-[170px]`}>
              <option value="">كل الحالات</option>
              {INVOICE_STATUSES.map((value) => (
                <option key={value} value={value}>{PLATFORM_INVOICE_STATUS_LABELS[value]}</option>
              ))}
            </select>
          </>
        )}
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700">{error}</div>
      )}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-sm font-semibold text-slate-500">جارٍ تحميل البيانات...</div>
        ) : tab === 'invoices' ? (
          invoiceRows.length === 0 ? (
            <EmptyState icon={<ReceiptText className="h-5 w-5" />} title="لا توجد فواتير" description="أنشئ فاتورة جديدة لعميل." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-right">
                <thead className="bg-slate-50">
                  <tr className="text-[10.5px] text-slate-500">
                    <th className="px-4 py-2.5 font-semibold">الرقم</th>
                    <th className="px-4 py-2.5 font-semibold">العميل</th>
                    <th className="px-4 py-2.5 font-semibold">الحالة</th>
                    <th className="px-4 py-2.5 font-semibold">الإجمالي</th>
                    <th className="px-4 py-2.5 font-semibold">المدفوع</th>
                    <th className="px-4 py-2.5 font-semibold">المتبقي</th>
                    <th className="px-4 py-2.5 font-semibold">الاستحقاق</th>
                    <th className="px-4 py-2.5 font-semibold">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceRows.map((invoice) => {
                    const remaining = invoice.total - invoice.paidAmount;
                    return (
                      <tr key={invoice.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                        <td className="px-4 py-2.5 font-mono text-[11px] font-bold text-slate-800" dir="ltr">{invoice.number}</td>
                        <td className="px-4 py-2.5 text-[12px] font-semibold text-slate-700">{invoice.tenantName || '—'}</td>
                        <td className="px-4 py-2.5"><StatusBadge value={invoice.status} label={PLATFORM_INVOICE_STATUS_LABELS[invoice.status]} /></td>
                        <td className="px-4 py-2.5 text-[11.5px] font-bold text-slate-800">{formatMoney(invoice.total, invoice.currency)}</td>
                        <td className="px-4 py-2.5 text-[11px] text-emerald-700">{formatMoney(invoice.paidAmount, invoice.currency)}</td>
                        <td className={`px-4 py-2.5 text-[11px] font-bold ${remaining > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{formatMoney(remaining, invoice.currency)}</td>
                        <td className="px-4 py-2.5 text-[11px] text-slate-600">{formatDate(invoice.dueDate)}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => openDetail(invoice)} className="rounded p-1.5 text-slate-500 hover:bg-sky-50 hover:text-sky-700" title="عرض">
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            {invoice.status === 'DRAFT' && (
                              <button type="button" onClick={() => sendInvoice(invoice)} className="rounded p-1.5 text-slate-500 hover:bg-indigo-50 hover:text-indigo-700" title="إرسال">
                                <Send className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {invoice.status !== 'VOID' && invoice.status !== 'PAID' && remaining > 0 && (
                              <button type="button" onClick={() => openPayment(invoice)} className="rounded p-1.5 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700" title="تسجيل دفعة">
                                <Wallet className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {invoice.status !== 'VOID' && (
                              <button type="button" onClick={() => voidInvoice(invoice)} className="rounded p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-700" title="إلغاء">
                                <Ban className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : payments.length === 0 ? (
          <EmptyState icon={<Wallet className="h-5 w-5" />} title="لا توجد مدفوعات" description="سجّل دفعة من صفحة الفواتير." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-right">
              <thead className="bg-slate-50">
                <tr className="text-[10.5px] text-slate-500">
                  <th className="px-4 py-2.5 font-semibold">التاريخ</th>
                  <th className="px-4 py-2.5 font-semibold">العميل</th>
                  <th className="px-4 py-2.5 font-semibold">الفاتورة</th>
                  <th className="px-4 py-2.5 font-semibold">الطريقة</th>
                  <th className="px-4 py-2.5 font-semibold">المرجع</th>
                  <th className="px-4 py-2.5 font-semibold">المبلغ</th>
                  <th className="px-4 py-2.5 font-semibold">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="px-4 py-2.5 text-[11px] text-slate-600">{formatDateTime(payment.paidAt)}</td>
                    <td className="px-4 py-2.5 text-[12px] font-semibold text-slate-700">{payment.tenantName || '—'}</td>
                    <td className="px-4 py-2.5 font-mono text-[10.5px] text-slate-600" dir="ltr">{payment.invoiceNumber || '—'}</td>
                    <td className="px-4 py-2.5 text-[11px] text-slate-600">{PAYMENT_METHOD_LABELS[payment.method]}</td>
                    <td className="px-4 py-2.5 font-mono text-[10.5px] text-slate-500" dir="ltr">{payment.reference || '—'}</td>
                    <td className="px-4 py-2.5 text-[12px] font-bold text-emerald-700">{formatMoney(payment.amount)}</td>
                    <td className="px-4 py-2.5">
                      <button type="button" onClick={() => voidPayment(payment)} className="rounded p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-700" title="إلغاء الدفعة">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Create invoice */}
      <Modal
        open={invoiceOpen}
        onClose={() => setInvoiceOpen(false)}
        title="فاتورة جديدة"
        description="اختر العميل وأضف بنود الفاتورة."
        size="lg"
        busy={savingInvoice}
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[12px] font-bold text-slate-700">الإجمالي: {formatMoney(total)}</span>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setInvoiceOpen(false)} disabled={savingInvoice}>إلغاء</Button>
              <Button variant="primary" onClick={saveInvoice} loading={savingInvoice}>إنشاء الفاتورة</Button>
            </div>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="العميل" required>
            <select className={inputClass} value={invoiceForm.tenantId} onChange={(event) => setInvoiceForm({ ...invoiceForm, tenantId: event.target.value })}>
              <option value="">اختر العميل</option>
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>{tenant.name} — {tenant.code}</option>
              ))}
            </select>
          </Field>
          <Field label="الخطة (لتعبئة البنود تلقائياً)">
            <select className={inputClass} defaultValue="" onChange={(event) => applyPlan(event.target.value)}>
              <option value="">اختياري</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>{plan.name}</option>
              ))}
            </select>
          </Field>
          <Field label="تاريخ الإصدار">
            <input type="date" className={inputClass} value={invoiceForm.issueDate ?? ''} onChange={(event) => setInvoiceForm({ ...invoiceForm, issueDate: event.target.value })} />
          </Field>
          <Field label="تاريخ الاستحقاق">
            <input type="date" className={inputClass} value={invoiceForm.dueDate ?? ''} onChange={(event) => setInvoiceForm({ ...invoiceForm, dueDate: event.target.value })} />
          </Field>
        </div>

        <div className="mt-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] font-bold text-slate-800">بنود الفاتورة</span>
            <Button variant="ghost" size="sm" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={addItem}>إضافة بند</Button>
          </div>
          <div className="space-y-2">
            {invoiceForm.items.map((item, index) => (
              <div key={index} className="grid grid-cols-[1fr_70px_90px_90px_36px] items-end gap-2">
                <Field label={index === 0 ? 'الوصف' : ''}>
                  <input className={inputClass} value={item.description} onChange={(event) => updateItem(index, { description: event.target.value })} />
                </Field>
                <Field label={index === 0 ? 'الكمية' : ''}>
                  <input type="number" min={1} className={inputClass} value={item.quantity} onChange={(event) => updateItem(index, { quantity: Number(event.target.value) })} />
                </Field>
                <Field label={index === 0 ? 'السعر' : ''}>
                  <input type="number" min={0} className={inputClass} value={item.unitPrice} onChange={(event) => updateItem(index, { unitPrice: Number(event.target.value) })} />
                </Field>
                <div className="pb-2 text-left text-[11px] font-bold text-slate-700">
                  {formatMoney((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0))}
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  className="mb-1 flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  title="حذف البند"
                  disabled={invoiceForm.items.length === 1}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="خصم">
            <input type="number" min={0} className={inputClass} value={invoiceForm.discount ?? 0} onChange={(event) => setInvoiceForm({ ...invoiceForm, discount: Number(event.target.value) })} />
          </Field>
          <Field label="ضريبة">
            <input type="number" min={0} className={inputClass} value={invoiceForm.tax ?? 0} onChange={(event) => setInvoiceForm({ ...invoiceForm, tax: Number(event.target.value) })} />
          </Field>
          <Field label="ملاحظات" className="sm:col-span-2">
            <textarea rows={2} className={inputClass} value={invoiceForm.notes ?? ''} onChange={(event) => setInvoiceForm({ ...invoiceForm, notes: event.target.value })} />
          </Field>
        </div>

        <div className="mt-3 flex justify-end">
          <div className="w-full max-w-xs rounded-lg bg-slate-50 p-3 text-[11.5px]">
            <div className="flex justify-between"><span className="text-slate-500">المجموع</span><b>{formatMoney(subtotal)}</b></div>
            <div className="mt-1 flex justify-between"><span className="text-slate-500">الخصم</span><b>- {formatMoney(Number(invoiceForm.discount) || 0)}</b></div>
            <div className="mt-1 flex justify-between"><span className="text-slate-500">الضريبة</span><b>+ {formatMoney(Number(invoiceForm.tax) || 0)}</b></div>
            <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-[13px]"><span className="font-bold text-slate-700">الإجمالي</span><b className="text-emerald-700">{formatMoney(total)}</b></div>
          </div>
        </div>
      </Modal>

      {/* Invoice detail */}
      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail ? `فاتورة ${detail.number}` : 'الفاتورة'}
        description={detail?.tenantName}
        size="lg"
        footer={
          detail && (
            <div className="flex flex-wrap justify-end gap-2">
              {detail.status !== 'VOID' && detail.total - detail.paidAmount > 0 && (
                <Button variant="success" leadingIcon={<Wallet className="h-3.5 w-3.5" />} onClick={() => openPayment(detail)}>تسجيل دفعة</Button>
              )}
              {detail.status !== 'VOID' && (
                <Button variant="danger" leadingIcon={<Ban className="h-3.5 w-3.5" />} onClick={() => voidInvoice(detail)}>إلغاء الفاتورة</Button>
              )}
            </div>
          )
        }
      >
        {detail && (
          <div className="space-y-3">
            <div className="grid gap-2 rounded-xl bg-slate-50 p-3 text-[11.5px] sm:grid-cols-3">
              <div><span className="text-slate-500">الحالة:</span> <StatusBadge value={detail.status} label={PLATFORM_INVOICE_STATUS_LABELS[detail.status]} /></div>
              <div><span className="text-slate-500">الإصدار:</span> <b>{formatDate(detail.issueDate)}</b></div>
              <div><span className="text-slate-500">الاستحقاق:</span> <b>{formatDate(detail.dueDate)}</b></div>
              <div><span className="text-slate-500">الإجمالي:</span> <b>{formatMoney(detail.total, detail.currency)}</b></div>
              <div><span className="text-slate-500">المدفوع:</span> <b className="text-emerald-700">{formatMoney(detail.paidAmount, detail.currency)}</b></div>
              <div><span className="text-slate-500">المتبقي:</span> <b className="text-rose-600">{formatMoney(detail.total - detail.paidAmount, detail.currency)}</b></div>
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-right">
                <thead className="bg-slate-50 text-[10px] text-slate-500">
                  <tr>
                    <th className="px-2 py-2">الوصف</th>
                    <th className="px-2 py-2">الكمية</th>
                    <th className="px-2 py-2">السعر</th>
                    <th className="px-2 py-2">الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {(detail.items ?? []).map((item, index) => (
                    <tr key={item.id ?? index} className="border-t border-slate-100 text-[11px]">
                      <td className="px-2 py-1.5">{item.description}</td>
                      <td className="px-2 py-1.5">{item.quantity}</td>
                      <td className="px-2 py-1.5">{formatMoney(item.unitPrice, detail.currency)}</td>
                      <td className="px-2 py-1.5 font-bold">{formatMoney(item.total ?? item.quantity * item.unitPrice, detail.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {detail.notes && <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800">{detail.notes}</p>}
          </div>
        )}
      </Modal>

      {/* Record payment */}
      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="تسجيل دفعة"
        description="يمكن ربط الدفعة بفاتورة مفتوحة للعميل."
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPayOpen(false)}>إلغاء</Button>
            <Button variant="primary" onClick={savePayment}>تسجيل الدفعة</Button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="العميل" required>
            <select
              className={inputClass}
              value={payForm.tenantId}
              onChange={(event) => setPayForm({ ...payForm, tenantId: event.target.value, invoiceId: '' })}
            >
              <option value="">اختر العميل</option>
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>{tenant.name} — {tenant.code}</option>
              ))}
            </select>
          </Field>
          <Field label="الفاتورة" hint="اتركها فارغة لدفعة غير مرتبطة بفاتورة">
            <select className={inputClass} value={payForm.invoiceId} onChange={(event) => {
              const invoice = invoices.find((item) => item.id === event.target.value);
              setPayForm({
                ...payForm,
                invoiceId: event.target.value,
                tenantId: invoice?.tenantId ?? payForm.tenantId,
                amount: invoice ? Math.max(0, invoice.total - invoice.paidAmount) : payForm.amount,
              });
            }}>
              <option value="">بدون فاتورة</option>
              {invoices
                .filter((invoice) => !payForm.tenantId || invoice.tenantId === payForm.tenantId)
                .filter((invoice) => invoice.status !== 'VOID' && invoice.status !== 'PAID')
                .map((invoice) => (
                  <option key={invoice.id} value={invoice.id}>{invoice.number} — {formatMoney(invoice.total - invoice.paidAmount)}</option>
                ))}
            </select>
          </Field>
          <Field label="المبلغ" required>
            <input type="number" min={0} className={inputClass} value={payForm.amount} onChange={(event) => setPayForm({ ...payForm, amount: Number(event.target.value) })} />
          </Field>
          <Field label="طريقة الدفع">
            <select className={inputClass} value={payForm.method} onChange={(event) => setPayForm({ ...payForm, method: event.target.value as PlatformPaymentMethod })}>
              {PAYMENT_METHODS.map((method) => (
                <option key={method.value} value={method.value}>{method.label}</option>
              ))}
            </select>
          </Field>
          <Field label="تاريخ الدفع">
            <input type="date" className={inputClass} value={payForm.paidAt} onChange={(event) => setPayForm({ ...payForm, paidAt: event.target.value })} />
          </Field>
          <Field label="المرجع">
            <input dir="ltr" className={inputClass} value={payForm.reference} onChange={(event) => setPayForm({ ...payForm, reference: event.target.value })} />
          </Field>
          <Field label="ملاحظات" className="sm:col-span-2">
            <textarea rows={2} className={inputClass} value={payForm.notes} onChange={(event) => setPayForm({ ...payForm, notes: event.target.value })} />
          </Field>
        </div>
      </Modal>
    </div>
  );
};

export default PlatformBillingPage;
