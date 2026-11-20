import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CalendarDays, Plus, Search, Calendar, CheckCircle2, Check, CreditCard,
} from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { InstallmentService } from '../../../services/domains/finance/InstallmentService';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { CustomerService } from '../../../services/domains/customers/CustomerService';
import { Customer } from '../../../types';
import { localDateString } from '../../../utils/shared/date';

import { useToast } from '../../../components/ui/Toast';
interface InstallmentRow {
  id: string;
  planId: string;
  planNumber: string;
  sequenceNumber: number;
  totalInstallments: number;
  customerId: string;
  customerName: string;
  customerPhone?: string;
  amount: number;
  paidAmount: number;
  dueDate: string;
  paidAt?: string;
  status: 'UPCOMING' | 'DUE' | 'PARTIAL' | 'PAID' | 'OVERDUE';
}

interface InstallmentPlanRecord {
  id: string;
  planNumber: string;
  customerId: string;
  customerName: string;
  totalAmount: number;
  downPayment: number;
  financedAmount: number;
  installmentsCount: number;
  installmentAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: 'ACTIVE' | 'COMPLETED' | 'DEFAULTED';
  startDate: string;
}

interface InstallmentInvoiceOption {
  id: string;
  invoiceNumber: string;
  customerId: string;
  remainingAmount: number;
}

export const InstallmentsPage: React.FC = () => {
  const toast = useToast();
  const [installments, setInstallments] = useState<InstallmentRow[]>([]);
  const [plans, setPlans] = useState<InstallmentPlanRecord[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [openInvoices, setOpenInvoices] = useState<InstallmentInvoiceOption[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const _activeTab = useState<'INSTALLMENTS' | 'PLANS'>('INSTALLMENTS')[0];

  // Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [totalFinanced, setTotalFinanced] = useState<number>(0);
  const [downPayment, setDownPayment] = useState<number>(0);
  const [monthsCount, setMonthsCount] = useState<number>(6);
  const [startDate, setStartDate] = useState(localDateString());

  const customerService = useMemo(() => new CustomerService(), []);
  const installmentService = useMemo(() => new InstallmentService(), []);
  const actor = AuthService.getCurrentUser();
  const canManage = PermissionService.can(actor, 'ui.finance.installments.manage');

  const load = useCallback(async () => {
    const currentActor = AuthService.getCurrentUser();
    if (!PermissionService.can(currentActor, 'ui.finance.installments.view') && !PermissionService.can(currentActor, 'ui.finance.installments.manage')) {
      setPlans([]);
      setInstallments([]);
      setCustomers([]);
      return;
    }
    const db = DatabaseManager.getInstance().getDb();
    if (!db) return;

    try {
      const { invoiceRows, planRows, installmentRows } = installmentService.getPageData();
      const invoiceOptions: InstallmentInvoiceOption[] = invoiceRows.map((r: any[]) => ({
        id: String(r[0]), invoiceNumber: String(r[1]), customerId: String(r[2]), remainingAmount: Number(r[3] || 0),
      }));
      setOpenInvoices(invoiceOptions);

      // Check if plans exist
      const visibleCustomerIds = new Set<string>([
        ...invoiceOptions.map((invoice) => invoice.customerId),
        ...planRows.map((row: any[]) => String(row[2])),
      ]);
      const scopedCustomers = (await Promise.all(
        [...visibleCustomerIds].map((customerId) => customerService.getCustomerByIdAsync(customerId))
      )).filter((customer): customer is Customer => !!customer);
      setCustomers(scopedCustomers);
      const selectedCustomerIsVisible = scopedCustomers.some((customer) => customer.id === selectedCustomerId);
      const initialCustomerId = selectedCustomerIsVisible ? selectedCustomerId : (scopedCustomers[0]?.id || '');
      if (initialCustomerId && initialCustomerId !== selectedCustomerId) setSelectedCustomerId(initialCustomerId);
      const selectedInvoiceIsVisible = invoiceOptions.some((invoice) => invoice.id === selectedInvoiceId);
      if (!selectedInvoiceIsVisible) {
        const firstInvoice = invoiceOptions.find((invoice) => invoice.customerId === initialCustomerId);
        if (firstInvoice) {
          setSelectedInvoiceId(firstInvoice.id);
          setTotalFinanced(firstInvoice.remainingAmount);
          setDownPayment(0);
        } else setSelectedInvoiceId('');
      }

      if (planRows.length > 0) {
        const pRows: InstallmentPlanRecord[] = planRows.map((r: any[]) => ({
          id: String(r[0]),
          planNumber: String(r[1]),
          customerId: String(r[2]),
          customerName: String(r[3] || 'عميل'),
          totalAmount: Number(r[4] || 0),
          downPayment: Number(r[5] || 0),
          financedAmount: Number(r[6] || 0),
          installmentsCount: Number(r[7] || 0),
          installmentAmount: Number(r[8] || 0),
          paidAmount: Number(r[9] || 0),
          remainingAmount: Number(r[10] || 0),
          status: (r[11] || 'ACTIVE') as any,
          startDate: String(r[12]),
        }));
        setPlans(pRows);

        // Load all installments
        if (installmentRows.length > 0) {
          const iRows: InstallmentRow[] = installmentRows.map((r: any[]) => {
            const dueDate = String(r[10]);
            let status = String(r[12] || 'UPCOMING');
            const isPaid = status === 'PAID';
            const isOverdue = !isPaid && dueDate < localDateString();
            if (isOverdue) status = 'OVERDUE';

            return {
              id: String(r[0]),
              planId: String(r[1]),
              planNumber: String(r[2]),
              sequenceNumber: Number(r[3]),
              totalInstallments: Number(r[4]),
              customerId: String(r[5]),
              customerName: String(r[6] || 'عميل'),
              customerPhone: r[7] ? String(r[7]) : undefined,
              amount: Number(r[8] || 0),
              paidAmount: Number(r[9] || 0),
              dueDate,
              paidAt: r[11] ? String(r[11]) : undefined,
              status: status as any,
            };
          });
          setInstallments(iRows);
        } else setInstallments([]);
      } else {
        setPlans([]);
        setInstallments([]);
      }
    } catch (e) {
      console.error('Error loading installments', e);
    }
  }, [installmentService, customerService, setPlans, setInstallments, setCustomers, setOpenInvoices, setSelectedCustomerId, setSelectedInvoiceId, setTotalFinanced, setDownPayment, selectedCustomerId, selectedInvoiceId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreatePlan = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { planNumber, downPaymentReceipt } = installmentService.createPlan({ customerId: selectedCustomerId, invoiceId: selectedInvoiceId, totalAmount: totalFinanced, downPayment, installmentsCount: monthsCount, startDate });
      toast.success(`تم إنشاء خطة التقسيط رقم ${planNumber} بنجاح (${monthsCount} أقساط شهرية).${downPaymentReceipt ? ` إيصال المقدم: ${downPaymentReceipt}` : ''}`);
      setShowCreateModal(false);
      load();
    } catch (err: any) {
      toast.error(`خطأ أثناء إنشاء خطة التقسيط: ${err?.message}`);
    }
  };

  const customerInvoices = openInvoices.filter((invoice) => invoice.customerId === selectedCustomerId);

  const handlePayInstallment = (inst: InstallmentRow) => {
    if (inst.status === 'PAID') { toast.warning('هذا القسط مسدد بالفعل.'); return; }
    const confirmPay = window.confirm(`تأكيد استلام وسداد القسط رقم (${inst.sequenceNumber} من ${inst.totalInstallments}) بقيمة ${inst.amount} ج من العميل: ${inst.customerName}؟`);
    if (!confirmPay) return;
    try {
      const result = installmentService.payInstallment(inst.id);
      toast.success(`تم تسجيل سداد القسط بنجاح!\nرقم الإيصال: ${result.receiptNumber}\nتم إضافة ${result.amount} ج إلى الخزينة.`);
      load();
    } catch (err: any) {
      toast.error(`خطأ أثناء سداد القسط: ${err?.message}`);
    }
  };

  const handleReverseInstallment = (inst: InstallmentRow) => {
    if (!canManage || inst.status !== 'PAID') return;
    if (!window.confirm(`عكس سند سداد القسط ${inst.sequenceNumber} من خطة ${inst.planNumber}؟ سيتم إعادة الدين إلى رصيد العميل.`)) return;
    try {
      const result = installmentService.reverseInstallmentPayment(inst.id);
      toast.success(`تم عكس الإيصال ${result.receiptNumber} وإعادة ${fmt(result.amount)} إلى رصيد العميل.`);
      load();
    } catch (err: any) {
      toast.error(`تعذر عكس سداد القسط: ${err?.message}`);
    }
  };

  const handleCancelPlan = (inst: InstallmentRow) => {
    if (!canManage || inst.sequenceNumber !== 1) return;
    if (!window.confirm(`إلغاء خطة ${inst.planNumber}؟ يجب عكس الأقساط المحصلة أولًا.`)) return;
    try {
      const result = installmentService.cancelPlan(inst.planId);
      toast.success(`تم إلغاء خطة ${result.planNumber} وعكس المقدم إن وجد.`);
      load();
    } catch (err: any) {
      toast.error(`تعذر إلغاء الخطة: ${err?.message}`);
    }
  };

  const filteredInstallments = installments.filter(i => {
    const matchesSearch =
      i.customerName.includes(search) ||
      i.planNumber.toLowerCase().includes(search.toLowerCase()) ||
      (i.customerPhone && i.customerPhone.includes(search));
    const matchesStatus = statusFilter === 'ALL' || i.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalFinancedSum = plans.reduce((acc, p) => acc + p.financedAmount, 0);
  const totalPaidSum = plans.reduce((acc, p) => acc + p.paidAmount, 0);
  const overdueCount = installments.filter(i => i.status === 'OVERDUE').length;

  const fmt = (n: number) => new Intl.NumberFormat('ar-EG').format(n) + ' ج';

  return (
    <div className="h-full flex flex-col bg-surface-muted text-ink overflow-hidden">
      {/* Header */}
      <div className="bg-surface px-6 pt-4">
        <PageHeader
          icon={<CalendarDays className="h-5 w-5" />}
          title="إدارة الأقساط والتحصيلات المجدولة (Installment Plans)"
          description="جدولة الأقساط الشهرية، تسجيل سندات السداد، ومتابعة المتأخرات مع إدراجها بالخزينة تلقائياً"
          actions={
            <button
              onClick={() => setShowCreateModal(true)} disabled={!canManage}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-warning to-warning hover:from-warning hover:to-warning text-white rounded-xl text-xs font-bold transition shrink-0 shadow-lg shadow-warning/20 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              إنشاء خطة تقسيط جديدة
            </button>
          }
        />
      </div>

      {/* Metrics Row */}
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-surface border-b border-line">
        <div className="p-3 bg-surface rounded-xl border border-line">
          <span className="text-[11px] text-muted font-semibold block">إجمالي مبالغ التقسيط</span>
          <span className="text-sm font-black text-ink mt-1 block">{fmt(totalFinancedSum)}</span>
        </div>

        <div className="p-3 bg-surface rounded-xl border border-line">
          <span className="text-[11px] text-muted font-semibold block">المحصل من الأقساط</span>
          <span className="text-sm font-black text-success mt-1 block">{fmt(totalPaidSum)}</span>
        </div>

        <div className="p-3 bg-surface rounded-xl border border-line">
          <span className="text-[11px] text-muted font-semibold block">المتبقي قيد التحصيل</span>
          <span className="text-sm font-black text-primary mt-1 block">{fmt(totalFinancedSum - totalPaidSum)}</span>
        </div>

        <div className="p-3 bg-surface rounded-xl border border-line">
          <span className="text-[11px] text-muted font-semibold block">الأقساط المتأخرة</span>
          <span className="text-sm font-black text-danger mt-1 block">{overdueCount} أقساط متأخرة</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="p-4 bg-surface border-b border-line/80 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative flex-1 w-full max-w-md">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            placeholder="بحث باسم العميل أو رقم الخطة..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-4 pr-10 py-2 bg-surface border border-line rounded-xl text-xs text-ink placeholder-muted focus:outline-none focus:border-warning/50 transition font-medium"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-surface border border-line rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-warning"
          >
            <option value="ALL">جميع الحالات</option>
            <option value="OVERDUE">متأخر عن موعده</option>
            <option value="UPCOMING">قادم ومستحق</option>
            <option value="PAID">مسدد بالكامل</option>
          </select>
        </div>
      </div>

      {/* Installments Table / Grid */}
      <div className="flex-1 overflow-y-auto p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredInstallments.map((inst) => (
            <div
              key={inst.id}
              className="bg-surface border border-line hover:border-line-strong rounded-2xl p-5 transition flex flex-col justify-between shadow-sm"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] px-2.5 py-0.5 rounded-lg bg-surface-sunken text-ink font-mono font-bold border border-line-strong">
                    القسط {inst.sequenceNumber} من {inst.totalInstallments}
                  </span>

                  <span
                    className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold border ${
 inst.status === 'PAID'
 ? 'bg-success/10 text-success border-success/20'
 : inst.status === 'OVERDUE'
 ? 'bg-danger/10 border-danger/20 animate-pulse'
 : 'bg-warning/10 border-warning/20'
 }`}
                  >
                    {inst.status === 'PAID' ? 'تم السداد' : inst.status === 'OVERDUE' ? 'متأخر ومستحق' : 'قادم ومستحق'}
                  </span>
                </div>

                <h3 className="font-bold text-ink text-sm mb-1">{inst.customerName}</h3>
                <span className="text-[11px] text-muted font-mono block mb-3">
                  الخطة: {inst.planNumber}
                </span>

                <div className="space-y-1.5 text-xs text-muted mb-4 bg-surface p-3 rounded-xl border border-line/60">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-ink-secondary" />
                      تاريخ الاستحقاق:
                    </span>
                    <span className={`font-mono font-bold ${inst.status === 'OVERDUE' ? 'text-danger' : 'text-ink'}`}>
                      {inst.dueDate}
                    </span>
                  </div>

                  {inst.paidAt && (
                    <div className="flex items-center justify-between text-success">
                      <span className="text-[11px] flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        تاريخ السداد:
                      </span>
                      <span className="font-mono">{inst.paidAt.split('T')[0]}</span>
                    </div>
                  )}
                </div>

                <div className="bg-surface rounded-xl p-3 border border-line flex items-center justify-between">
                  <span className="text-xs text-muted">قيمة القسط:</span>
                  <span className="text-base font-black text-warning">{fmt(inst.amount)}</span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-line/80 flex items-center justify-end gap-2">
                {inst.status !== 'PAID' ? (
                  <button
                    onClick={() => handlePayInstallment(inst)}
                    disabled={!canManage}
                    className="w-full py-2 bg-success hover:bg-success text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-md shadow-success/20 active:scale-95"
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    تسجيل سداد القسط بالخزينة
                  </button>
                ) : (
                  <span className="text-xs text-success font-bold flex items-center gap-1 py-1">
                    <CheckCircle2 className="w-4 h-4" />
                    <button onClick={() => handleReverseInstallment(inst)} disabled={!canManage} className="mr-3 text-[11px] text-danger hover:text-danger font-bold disabled:opacity-40">عكس السداد</button>
                    تم السداد بالكامل
                  </span>
                )}
                {inst.sequenceNumber === 1 && canManage && (
                  <button onClick={() => handleCancelPlan(inst)} className="text-[11px] text-danger hover:text-danger font-bold">إلغاء الخطة</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Create Plan Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface border border-line rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col animate-scaleIn">
            <div className="px-6 py-4 border-b border-line flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <CalendarDays className="w-5 h-5 text-warning" />
                <h3 className="text-base font-black text-ink">إنشاء خطة تقسيط جديدة لعميل</h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-muted hover:text-ink text-lg font-mono p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreatePlan} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-ink mb-1.5">اختر العميل</label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => {
                    const customerId = e.target.value;
                    const invoice = openInvoices.find((item) => item.customerId === customerId);
                    setSelectedCustomerId(customerId);
                    setSelectedInvoiceId(invoice?.id || '');
                    setTotalFinanced(invoice?.remainingAmount || 0);
                    setDownPayment(0);
                  }}
                  className="w-full bg-surface-muted border border-line rounded-xl px-3.5 py-2.5 text-xs text-ink focus:outline-none focus:border-warning"
                >
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-ink mb-1.5">اختر الفاتورة ذات الرصيد المستحق</label>
                <select
                  value={selectedInvoiceId}
                  onChange={(e) => {
                    const invoice = customerInvoices.find((item) => item.id === e.target.value);
                    setSelectedInvoiceId(e.target.value);
                    setTotalFinanced(invoice?.remainingAmount || 0);
                    setDownPayment(0);
                  }}
                  required
                  disabled={customerInvoices.length === 0}
                  className="w-full bg-surface-muted border border-line rounded-xl px-3.5 py-2.5 text-xs text-ink focus:outline-none focus:border-warning"
                >
                  <option value="">{customerInvoices.length ? 'اختر الفاتورة' : 'لا توجد فواتير مستحقة لهذا العميل'}</option>
                  {customerInvoices.map((invoice) => (
                    <option key={invoice.id} value={invoice.id}>{invoice.invoiceNumber} — متبقي {fmt(invoice.remainingAmount)}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink mb-1.5">إجمالي قيمة الفاتورة (ج.م)</label>
                  <input
                    type="number"
                    min="1000"
                    value={totalFinanced}
                    readOnly
                    className="w-full bg-surface-muted border border-line rounded-xl px-3.5 py-2 text-xs text-ink focus:outline-none focus:border-warning font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink mb-1.5">الدفعة المقدمة (مقدماً)</label>
                  <input
                    type="number"
                    min="0"
                    value={downPayment}
                    onChange={(e) => setDownPayment(Number(e.target.value) || 0)}
                    className="w-full bg-surface-muted border border-line rounded-xl px-3.5 py-2 text-xs text-ink focus:outline-none focus:border-warning font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink mb-1.5">عدد الأقساط (شهور)</label>
                  <select
                    value={monthsCount}
                    onChange={(e) => setMonthsCount(Number(e.target.value))}
                    className="w-full bg-surface-muted border border-line rounded-xl px-3.5 py-2 text-xs text-ink focus:outline-none focus:border-warning"
                  >
                    <option value={3}>3 شهور</option>
                    <option value={6}>6 شهور</option>
                    <option value={10}>10 شهور</option>
                    <option value={12}>12 شهر (سنة)</option>
                    <option value={24}>24 شهر (سنتين)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink mb-1.5">تاريخ أول قسط</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-surface-muted border border-line rounded-xl px-3.5 py-2 text-xs text-ink focus:outline-none focus:border-warning font-mono"
                  />
                </div>
              </div>

              {/* Summary Card */}
              <div className="p-4 rounded-2xl bg-warning/10 border border-warning/20 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted">المبلغ المتبقي للتمويل:</span>
                  <span className="font-mono font-bold text-ink">{fmt(totalFinanced - downPayment)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">قيمة القسط الشهري المحسوبة:</span>
                  <span className="font-mono font-black text-warning">
                    {fmt(Math.round((totalFinanced - downPayment) / monthsCount))} / شهر
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-line flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-surface-sunken hover:bg-surface-sunken text-ink rounded-xl text-xs font-semibold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-warning hover:bg-warning text-white rounded-xl text-xs font-bold shadow-lg shadow-warning/20"
                >
                  تأكيد وإنشاء خطة الأقساط
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
