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
import { centralPlatformClient } from '../../services/domains/platform/CentralPlatformClient';
import { getCentralDataSourceState } from '../../hooks/platform/useCentralDataSource';
import { canPlatform } from '../../hooks/platform/usePlatformPermission';
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

import { DataTable } from '../../components/ui/DataTable';
import { useToast } from '../../components/ui/Toast';
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
  const canManageBilling = canPlatform('billing');
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

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const centralState = getCentralDataSourceState();
      if (centralState.active) {
        const [invoiceRows, paymentRows] = await Promise.all([
          centralPlatformClient.listInvoices({ search, status }),
          centralPlatformClient.listPayments(),
        ]);
        setInvoices(invoiceRows);
        setPayments(paymentRows);
      } else {
        setInvoices(platformAdminService.listInvoices(search, status));
        setPayments(platformAdminService.listPayments());
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل بيانات المبيعات.');
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  React.useEffect(() => { void load(); }, [load]);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const centralState = getCentralDataSourceState();
        if (centralState.active) {
          const [tenantRows, planRows] = await Promise.all([
            centralPlatformClient.listTenants(),
            centralPlatformClient.listPlans(),
          ]);
          if (!cancelled) {
            setTenants(tenantRows);
            setPlans(planRows);
          }
          return;
        }
        setTenants(platformAdminService.listTenants());
        setPlans(platformAdminService.listPlans(false));
      } catch {
        /* handled by the list error */
      }
    })();
    return () => { cancelled = true; };
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

  const saveInvoice = async () => {
    if (!canManageBilling) { toast.error('لا تملك صلاحية إدارة الفوترة'); return; }
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
      const payload = {
        ...invoiceForm,
        dueDate: invoiceForm.dueDate || undefined,
        items,
      };
      const centralState = getCentralDataSourceState();
      const invoice = centralState.active
        ? await centralPlatformClient.createInvoice(payload)
        : platformAdminService.createInvoice(payload);
      toast.success('تم إنشاء الفاتورة', invoice.number);
      setInvoiceOpen(false);
      void load();
    } catch (err) {
      toast.error('تعذر إنشاء الفاتورة', err instanceof Error ? err.message : undefined);
    } finally {
      setSavingInvoice(false);
    }
  };

  const sendInvoice = async (invoice: PlatformInvoice) => {
    if (!canManageBilling) { toast.error('لا تملك صلاحية إدارة الفوترة'); return; }
    try {
      if (getCentralDataSourceState().active) {
        await centralPlatformClient.setInvoiceStatus(invoice.id, 'SENT');
      } else {
        platformAdminService.setInvoiceStatus(invoice.id, 'SENT');
      }
      toast.success('تم إرسال الفاتورة', invoice.number);
      void load();
    } catch (err) {
      toast.error('تعذر تحديث الفاتورة', err instanceof Error ? err.message : undefined);
    }
  };

  const voidInvoice = async (invoice: PlatformInvoice) => {
    if (!canManageBilling) { toast.error('لا تملك صلاحية إدارة الفوترة'); return; }
    if (!window.confirm(`إلغاء الفاتورة ${invoice.number}؟ لن يمكن التراجع.`)) return;
    try {
      if (getCentralDataSourceState().active) {
        await centralPlatformClient.voidInvoice(invoice.id);
      } else {
        platformAdminService.voidInvoice(invoice.id);
      }
      toast.success('تم إلغاء الفاتورة');
      setDetail(null);
      void load();
    } catch (err) {
      toast.error('تعذر إلغاء الفاتورة', err instanceof Error ? err.message : undefined);
    }
  };

  const openDetail = async (invoice: PlatformInvoice) => {
    try {
      if (getCentralDataSourceState().active) {
        setDetail(await centralPlatformClient.getInvoice(invoice.id));
      } else {
        setDetail(platformAdminService.getInvoice(invoice.id));
      }
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

  const savePayment = async () => {
    if (!canManageBilling) { toast.error('لا تملك صلاحية إدارة الفوترة'); return; }
    if (!payForm.tenantId) {
      toast.error('اختر العميل أولاً');
      return;
    }
    if (!(payForm.amount > 0)) {
      toast.error('قيمة الدفعة يجب أن تكون أكبر من صفر');
      return;
    }
    try {
      const payload = {
        tenantId: payForm.tenantId,
        invoiceId: payForm.invoiceId || null,
        amount: payForm.amount,
        method: payForm.method,
        reference: payForm.reference,
        paidAt: payForm.paidAt,
        notes: payForm.notes,
      };
      if (getCentralDataSourceState().active) {
        await centralPlatformClient.addPayment(payload);
      } else {
        platformAdminService.addPayment(payload);
      }
      toast.success('تم تسجيل الدفعة');
      setPayOpen(false);
      setDetail(null);
      void load();
    } catch (err) {
      toast.error('تعذر تسجيل الدفعة', err instanceof Error ? err.message : undefined);
    }
  };

  const voidPayment = async (payment: PlatformPayment) => {
    if (!canManageBilling) { toast.error('لا تملك صلاحية إدارة الفوترة'); return; }
    if (!window.confirm('إلغاء هذه الدفعة؟ سيُعاد احتساب الفاتورة المرتبطة.')) return;
    try {
      if (getCentralDataSourceState().active) {
        await centralPlatformClient.voidPayment(payment.id);
      } else {
        platformAdminService.voidPayment(payment.id);
      }
      toast.success('تم إلغاء الدفعة');
      void load();
    } catch (err) {
      toast.error('تعذر إلغاء الدفعة', err instanceof Error ? err.message : undefined);
    }
  };

  const exportInvoices = () => {
    if (!canManageBilling) { toast.error('لا تملك صلاحية إدارة الفوترة'); return; }
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
            {canManageBilling && (
              <>
                <Button variant="ghost" size="sm" leadingIcon={<Download className="h-3.5 w-3.5" />} onClick={exportInvoices}>
                  تصدير الفواتير
                </Button>
                <Button variant="secondary" size="sm" leadingIcon={<Wallet className="h-3.5 w-3.5" />} onClick={() => openPayment()}>
                  تسجيل دفعة
                </Button>
                <Button variant="primary" size="sm" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={openCreateInvoice}>
                  فاتورة جديدة
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-2 shadow-sm">
        <div className="inline-flex rounded-lg bg-surface-sunken p-1">
          <button
            type="button"
            onClick={() => setTab('invoices')}
            className={`rounded-md px-3 py-1.5 text-[12px] font-bold transition ${tab === 'invoices' ? 'bg-surface text-ink shadow' : 'text-muted'}`}
          >
            الفواتير ({invoices.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('payments')}
            className={`rounded-md px-3 py-1.5 text-[12px] font-bold transition ${tab === 'payments' ? 'bg-surface text-ink shadow' : 'text-muted'}`}
          >
            المدفوعات ({payments.length})
          </button>
        </div>
        {tab === 'invoices' && (
          <>
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
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
        <div role="alert" className="rounded-lg border border-danger-border bg-danger-soft px-4 py-2.5 text-xs font-semibold text-danger">{error}</div>
      )}

      <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-sm font-semibold text-muted">جارٍ تحميل البيانات...</div>
        ) : tab === 'invoices' ? (
          invoiceRows.length === 0 ? (
            <EmptyState icon={<ReceiptText className="h-5 w-5" />} title="لا توجد فواتير" description="أنشئ فاتورة جديدة لعميل." />
          ) : (
            <DataTable
                          ariaLabel="فواتير المنصة"
                          rows={invoiceRows}
                          rowKey={(invoice) => invoice.id}
                          minWidth={900}
                          dense
                          columns={[
                            { key: 'number', header: 'الرقم', render: (invoice) => <span className="font-mono text-[11px] font-bold text-ink" dir="ltr">{invoice.number}</span> },
                            { key: 'tenant', header: 'العميل', render: (invoice) => <span className="text-[12px] font-semibold text-ink">{invoice.tenantName || '—'}</span> },
                            { key: 'status', header: 'الحالة', render: (invoice) => <StatusBadge value={invoice.status} label={PLATFORM_INVOICE_STATUS_LABELS[invoice.status]} /> },
                            { key: 'total', header: 'الإجمالي', render: (invoice) => <span className="text-[11.5px] font-bold text-ink">{formatMoney(invoice.total, invoice.currency)}</span> },
                            { key: 'paid', header: 'المدفوع', render: (invoice) => <span className="text-[11px] text-success">{formatMoney(invoice.paidAmount, invoice.currency)}</span> },
                            {
                              key: 'remaining', header: 'المتبقي',
                              render: (invoice) => {
                                const remaining = invoice.total - invoice.paidAmount;
                                return <span className={`text-[11px] font-bold ${remaining > 0 ? 'text-danger' : 'text-muted'}`}>{formatMoney(remaining, invoice.currency)}</span>;
                              },
                            },
                            { key: 'due', header: 'الاستحقاق', render: (invoice) => <span className="text-[11px] text-ink-secondary">{formatDate(invoice.dueDate)}</span> },
                            {
                              key: 'actions', header: 'إجراءات',
                              render: (invoice) => {
                                const remaining = invoice.total - invoice.paidAmount;
                                return (
                                  <div className="flex items-center gap-1">
                                    <button type="button" onClick={() => openDetail(invoice)} className="rounded p-1.5 text-muted hover:bg-accent-soft hover:text-primary" title="عرض"><Eye className="h-3.5 w-3.5" /></button>
                                    {canManageBilling && invoice.status === 'DRAFT' && (
                                      <button type="button" onClick={() => sendInvoice(invoice)} className="rounded p-1.5 text-muted hover:bg-accent-soft hover:text-primary" title="إرسال"><Send className="h-3.5 w-3.5" /></button>
                                    )}
                                    {canManageBilling && invoice.status !== 'VOID' && invoice.status !== 'PAID' && remaining > 0 && (
                                      <button type="button" onClick={() => openPayment(invoice)} className="rounded p-1.5 text-muted hover:bg-success-soft hover:text-success" title="تسجيل دفعة"><Wallet className="h-3.5 w-3.5" /></button>
                                    )}
                                    {canManageBilling && invoice.status !== 'VOID' && (
                                      <button type="button" onClick={() => voidInvoice(invoice)} className="rounded p-1.5 text-muted hover:bg-danger-soft hover:text-danger" title="إلغاء"><Ban className="h-3.5 w-3.5" /></button>
                                    )}
                                  </div>
                                );
                              },
                            },
                          ]}
                        />

          )
        ) : payments.length === 0 ? (
          <EmptyState icon={<Wallet className="h-5 w-5" />} title="لا توجد مدفوعات" description="سجّل دفعة من صفحة الفواتير." />
        ) : (
          <DataTable
                      ariaLabel="مدفوعات المنصة"
                      rows={payments}
                      rowKey={(payment) => payment.id}
                      minWidth={800}
                      dense
                      columns={[
                        { key: 'date', header: 'التاريخ', render: (payment) => <span className="text-[11px] text-ink-secondary">{formatDateTime(payment.paidAt)}</span> },
                        { key: 'tenant', header: 'العميل', render: (payment) => <span className="text-[12px] font-semibold text-ink">{payment.tenantName || '—'}</span> },
                        { key: 'invoice', header: 'الفاتورة', render: (payment) => <span className="font-mono text-[10.5px] text-ink-secondary" dir="ltr">{payment.invoiceNumber || '—'}</span> },
                        { key: 'method', header: 'الطريقة', render: (payment) => <span className="text-[11px] text-ink-secondary">{PAYMENT_METHOD_LABELS[payment.method]}</span> },
                        { key: 'reference', header: 'المرجع', render: (payment) => <span className="font-mono text-[10.5px] text-muted" dir="ltr">{payment.reference || '—'}</span> },
                        { key: 'amount', header: 'المبلغ', render: (payment) => <span className="text-[12px] font-bold text-success">{formatMoney(payment.amount)}</span> },
                        {
                          key: 'action', header: 'إجراء',
                          render: (payment) => canManageBilling ? (
                            <button type="button" onClick={() => voidPayment(payment)} className="rounded p-1.5 text-muted hover:bg-danger-soft hover:text-danger" title="إلغاء الدفعة"><Trash2 className="h-3.5 w-3.5" /></button>
                          ) : null,
                        },
                      ]}
                    />

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
            <span className="text-[12px] font-bold text-ink">الإجمالي: {formatMoney(total)}</span>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setInvoiceOpen(false)} disabled={savingInvoice}>إلغاء</Button>
              <Button variant="primary" onClick={saveInvoice} loading={savingInvoice} disabled={!canManageBilling}>إنشاء الفاتورة</Button>
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
            <span className="text-[12px] font-bold text-ink">بنود الفاتورة</span>
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
                <div className="pb-2 text-left text-[11px] font-bold text-ink">
                  {formatMoney((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0))}
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  className="mb-1 flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-danger-soft hover:text-danger"
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
          <div className="w-full max-w-xs rounded-lg bg-surface-muted p-3 text-[11.5px]">
            <div className="flex justify-between"><span className="text-muted">المجموع</span><b>{formatMoney(subtotal)}</b></div>
            <div className="mt-1 flex justify-between"><span className="text-muted">الخصم</span><b>- {formatMoney(Number(invoiceForm.discount) || 0)}</b></div>
            <div className="mt-1 flex justify-between"><span className="text-muted">الضريبة</span><b>+ {formatMoney(Number(invoiceForm.tax) || 0)}</b></div>
            <div className="mt-2 flex justify-between border-t border-line pt-2 text-[13px]"><span className="font-bold text-ink">الإجمالي</span><b className="text-success">{formatMoney(total)}</b></div>
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
              {canManageBilling && detail.status !== 'VOID' && detail.total - detail.paidAmount > 0 && (
                <Button variant="success" leadingIcon={<Wallet className="h-3.5 w-3.5" />} onClick={() => openPayment(detail)}>تسجيل دفعة</Button>
              )}
              {canManageBilling && detail.status !== 'VOID' && (
                <Button variant="danger" leadingIcon={<Ban className="h-3.5 w-3.5" />} onClick={() => voidInvoice(detail)}>إلغاء الفاتورة</Button>
              )}
            </div>
          )
        }
      >
        {detail && (
          <div className="space-y-3">
            <div className="grid gap-2 rounded-xl bg-surface-muted p-3 text-[11.5px] sm:grid-cols-3">
              <div><span className="text-muted">الحالة:</span> <StatusBadge value={detail.status} label={PLATFORM_INVOICE_STATUS_LABELS[detail.status]} /></div>
              <div><span className="text-muted">الإصدار:</span> <b>{formatDate(detail.issueDate)}</b></div>
              <div><span className="text-muted">الاستحقاق:</span> <b>{formatDate(detail.dueDate)}</b></div>
              <div><span className="text-muted">الإجمالي:</span> <b>{formatMoney(detail.total, detail.currency)}</b></div>
              <div><span className="text-muted">المدفوع:</span> <b className="text-success">{formatMoney(detail.paidAmount, detail.currency)}</b></div>
              <div><span className="text-muted">المتبقي:</span> <b className="text-danger">{formatMoney(detail.total - detail.paidAmount, detail.currency)}</b></div>
            </div>
            <DataTable
                            ariaLabel="بنود الفاتورة"
                            rows={detail.items ?? []}
                            rowKey={(item: any) => item.id ?? String(item.description)}
                            dense
                            columns={[
                              { key: 'desc', header: 'الوصف', render: (item: any) => item.description },
                              { key: 'qty', header: 'الكمية', render: (item: any) => item.quantity },
                              { key: 'price', header: 'السعر', render: (item: any) => formatMoney(item.unitPrice, detail.currency) },
                              { key: 'total', header: 'الإجمالي', render: (item: any) => <span className="font-bold">{formatMoney(item.total ?? item.quantity * item.unitPrice, detail.currency)}</span> },
                            ]}
                          />

            {detail.notes && <p className="rounded-lg bg-warning-soft px-3 py-2 text-[11px] text-warning">{detail.notes}</p>}
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
            <Button variant="primary" onClick={savePayment} disabled={!canManageBilling}>تسجيل الدفعة</Button>
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
