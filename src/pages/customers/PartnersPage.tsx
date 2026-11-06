import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownLeft, ArrowUpRight, Banknote, Building2, ClipboardList, Pencil, Plus,
  Printer, RefreshCw, Search, Users, X,
} from 'lucide-react';
import { usePermission } from '../../hooks/usePermission';
import { useToast } from '../../components/ui/Toast';
import {
  PartnerService,
  type BusinessPartner,
  type PartnerDraft,
  type PartnerPaymentType,
  type PartnerTransaction,
  type PartnerTransactionType,
  type ProfitAllocation,
} from '../../services/PartnerService';

const formatNumber = new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 });
const formatMoney = (value: number) => `${formatNumber.format(value || 0)} ج.م`;
const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('ar-EG');

const TRANSACTION_LABELS: Record<PartnerTransactionType, string> = {
  CAPITAL_CONTRIBUTION: 'إيداع مساهمة',
  WITHDRAWAL: 'سحب من رأس المال',
  PROFIT_ALLOCATION: 'أرباح مستحقة',
  PROFIT_DISTRIBUTION: 'صرف أرباح',
  PARTNER_EXPENSE_PAID: 'مصروف دفعه الشريك للشركة',
  COMPANY_EXPENSE_FOR_PARTNER: 'مصروف دفعته الشركة للشريك',
};

type Modal = 'partner' | 'transaction' | 'profits' | null;
type TransactionAction = Exclude<PartnerTransactionType, 'PROFIT_ALLOCATION'>;

const CASH_ACTIONS: TransactionAction[] = [
  'CAPITAL_CONTRIBUTION', 'WITHDRAWAL', 'PROFIT_DISTRIBUTION', 'COMPANY_EXPENSE_FOR_PARTNER',
];

const ACTION_OPTIONS: Array<{ value: TransactionAction; label: string }> = [
  { value: 'CAPITAL_CONTRIBUTION', label: 'إيداع مساهمة في رأس المال' },
  { value: 'WITHDRAWAL', label: 'سحب من رأس المال' },
  { value: 'PROFIT_DISTRIBUTION', label: 'صرف أرباح مستحقة' },
  { value: 'PARTNER_EXPENSE_PAID', label: 'مصروف دفعه الشريك نيابة عن الشركة' },
  { value: 'COMPANY_EXPENSE_FOR_PARTNER', label: 'مصروف دفعته الشركة نيابة عن الشريك' },
];

const emptyPartner: PartnerDraft = { name: '', phone: '', email: '', ownershipPercent: 0, capitalAmount: 0, notes: '', isActive: true };

export const PartnersPage: React.FC = () => {
  const can = usePermission();
  const toast = useToast();
  const service = useMemo(() => new PartnerService(), []);
  const canManage = can('partners.manage');
  const canTransact = can('partners.transactions');
  const canDistribute = can('partners.profits.distribute');
  const canPrint = can('partners.print');
  const [partners, setPartners] = useState<BusinessPartner[]>([]);
  const [registers, setRegisters] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<Modal>(null);
  const [editingPartner, setEditingPartner] = useState<BusinessPartner | null>(null);
  const [partnerDraft, setPartnerDraft] = useState<PartnerDraft>(emptyPartner);
  const [action, setAction] = useState<TransactionAction>('CAPITAL_CONTRIBUTION');
  const [transactionDraft, setTransactionDraft] = useState({
    amount: '',
    transactionDate: new Date().toISOString().slice(0, 10),
    paymentType: 'CASH' as PartnerPaymentType,
    registerId: '',
    description: '',
  });
  const [profitTotal, setProfitTotal] = useState('');
  const [allocations, setAllocations] = useState<ProfitAllocation[]>([]);
  const [statement, setStatement] = useState<{ partner: BusinessPartner; transactions: PartnerTransaction[] } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback((keepSelection = true) => {
    setLoading(true);
    setError('');
    try {
      const next = service.getPartners();
      setPartners(next);
      setSelectedId((current) => keepSelection && next.some((partner) => partner.id === current)
        ? current
        : next.find((partner) => partner.isActive)?.id || next[0]?.id || '');
      if (canTransact) {
        try {
          setRegisters(service.getAvailableRegisters());
        } catch (registerError) {
          console.error('Could not load partner transaction registers:', registerError);
          setRegisters([]);
        }
      } else {
        setRegisters([]);
      }
    } catch (loadError) {
      console.error('Could not load partners:', loadError);
      setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل بيانات الشركاء.');
    } finally {
      setLoading(false);
    }
  }, [canTransact, service]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selectedId) {
      setStatement(null);
      return;
    }
    try {
      setStatement(service.getPartnerStatement(selectedId));
    } catch (statementError) {
      console.error('Could not load partner statement:', statementError);
      setStatement(null);
      setError(statementError instanceof Error ? statementError.message : 'تعذر تحميل كشف الحساب.');
    }
  }, [selectedId, partners, service]);

  const visiblePartners = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return partners.filter((partner) =>
      !term || [partner.name, partner.phone, partner.email]
        .some((value) => value?.toLocaleLowerCase().includes(term))
    );
  }, [partners, search]);
  const selected = statement?.partner ?? partners.find((partner) => partner.id === selectedId) ?? null;
  const activeOwnership = partners.filter((partner) => partner.isActive)
    .reduce((sum, partner) => sum + Number(partner.ownershipPercent), 0);

  const refresh = () => load();

  const openNewPartner = () => {
    setEditingPartner(null);
    setPartnerDraft(emptyPartner);
    setModal('partner');
  };

  const openEditPartner = (partner: BusinessPartner) => {
    setEditingPartner(partner);
    setPartnerDraft({
      name: partner.name,
      phone: partner.phone || '',
      email: partner.email || '',
      ownershipPercent: partner.ownershipPercent,
      capitalAmount: partner.capitalAmount,
      notes: partner.notes || '',
      isActive: partner.isActive,
    });
    setModal('partner');
  };

  const openTransaction = (nextAction: TransactionAction) => {
    if (!selected) return;
    setAction(nextAction);
    setTransactionDraft((current) => ({
      ...current,
      amount: '',
      paymentType: 'CASH',
      registerId: registers[0]?.id || '',
      description: '',
    }));
    setModal('transaction');
  };

  const openProfitDistribution = () => {
    if (Math.abs(activeOwnership - 100) > 0.005) {
      toast.error('تعذر توزيع الأرباح', 'يجب أن يكون مجموع نسب الشراكة النشطة 100%.');
      return;
    }
    const active = partners.filter((partner) => partner.isActive);
    setProfitTotal('');
    setAllocations(active.map((partner) => ({ partnerId: partner.id, amount: 0 })));
    setModal('profits');
  };

  const savePartner = (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const saved = editingPartner
        ? service.updatePartner(editingPartner.id, partnerDraft)
        : service.createPartner(partnerDraft);
      setModal(null);
      setSelectedId(saved.id);
      load();
      toast.success(editingPartner ? 'تم تحديث بيانات الشريك' : 'تمت إضافة الشريك');
    } catch (saveError) {
      toast.error('تعذر حفظ بيانات الشريك', saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  const saveTransaction = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    try {
      service.postTransaction({
        partnerId: selected.id,
        transactionType: action,
        amount: Number(transactionDraft.amount),
        transactionDate: transactionDraft.transactionDate,
        paymentType: CASH_ACTIONS.includes(action) ? transactionDraft.paymentType : undefined,
        registerId: transactionDraft.registerId || undefined,
        description: transactionDraft.description,
      });
      setModal(null);
      load();
      toast.success('تم تسجيل العملية وترحيلها محاسبيًا');
    } catch (saveError) {
      toast.error('تعذر تسجيل العملية', saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  const setProfitAmount = (partnerId: string, value: string) => {
    setAllocations((current) => current.map((allocation) => allocation.partnerId === partnerId
      ? { ...allocation, amount: Number(value) || 0 }
      : allocation));
  };

  const fillAutomaticShares = (value: string) => {
    const total = Number(value);
    setProfitTotal(value);
    if (!Number.isFinite(total) || total < 0) {
      setAllocations((current) => current.map((allocation) => ({ ...allocation, amount: 0 })));
      return;
    }
    const active = partners.filter((partner) => partner.isActive);
    let remainingCents = Math.round(total * 100);
    const next = active.map((partner, index) => {
      const cents = index === active.length - 1
        ? remainingCents
        : Math.round(total * partner.ownershipPercent);
      remainingCents -= cents;
      return { partnerId: partner.id, amount: cents / 100 };
    });
    setAllocations(next);
  };

  const saveProfitDistribution = (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      service.distributeProfits(Number(profitTotal), allocations, transactionDraft.transactionDate);
      setModal(null);
      load();
      toast.success('تم توزيع الأرباح على حسابات الشركاء');
    } catch (saveError) {
      toast.error('تعذر توزيع الأرباح', saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  const printStatement = () => {
    if (!canPrint || !selected) return;
    window.print();
  };

  return (
    <div className="space-y-5 p-4 sm:p-6" dir="rtl">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .partner-print-area, .partner-print-area * { visibility: visible !important; }
          .partner-print-area {
            position: absolute !important;
            inset: 0 !important;
            width: 100% !important;
            padding: 0 !important;
            color: #111 !important;
            background: #fff !important;
          }
          .partner-print-hidden { display: none !important; }
        }
      `}</style>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 dark:text-slate-100">حسابات الشركاء</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            نسب الملكية ورأس المال والمساهمات والمسحوبات والأرباح وكشوف الحساب.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={refresh} disabled={loading} className="icon-action">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> تحديث
          </button>
          {canDistribute && (
            <button type="button" onClick={openProfitDistribution} disabled={!partners.some((partner) => partner.isActive)} className="primary-action">
              <Banknote className="h-4 w-4" /> توزيع أرباح
            </button>
          )}
          {canManage && (
            <button type="button" onClick={openNewPartner} className="primary-action">
              <Plus className="h-4 w-4" /> إضافة شريك
            </button>
          )}
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="ملخص حسابات الشركاء">
        <SummaryCard label="عدد الشركاء النشطين" value={formatNumber.format(partners.filter((partner) => partner.isActive).length)} icon={Users} />
        <SummaryCard label="إجمالي رأس المال المساهم" value={formatMoney(partners.reduce((sum, partner) => sum + partner.capitalContributions, 0))} icon={Building2} />
        <SummaryCard label="أرباح مستحقة غير موزعة" value={formatMoney(partners.reduce((sum, partner) => sum + partner.profitsDue - partner.profitsDistributed, 0))} icon={Banknote} />
        <SummaryCard label="إجمالي صافي أرصدة الشركاء" value={formatMoney(partners.reduce((sum, partner) => sum + partner.netBalance, 0))} icon={ClipboardList} />
      </section>

      {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-200 p-3 dark:border-slate-700">
            <label className="relative block">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث عن شريك..." className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pr-9 pl-3 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
            </label>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {loading ? <p className="p-6 text-center text-sm text-slate-500">جارٍ تحميل الشركاء...</p>
              : visiblePartners.length === 0 ? (
                <div className="p-7 text-center">
                  <Users className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                  <p className="text-sm font-bold text-slate-600 dark:text-slate-300">{search ? 'لا توجد نتائج مطابقة.' : 'لم تتم إضافة شركاء بعد.'}</p>
                  {canManage && !search && <button type="button" onClick={openNewPartner} className="mt-3 text-sm font-bold text-sky-700 hover:underline dark:text-sky-300">أضف أول شريك</button>}
                </div>
              ) : visiblePartners.map((partner) => (
                <button key={partner.id} type="button" onClick={() => setSelectedId(partner.id)} className={`block w-full border-b border-slate-100 p-4 text-right transition dark:border-slate-800 ${selectedId === partner.id ? 'bg-sky-50 dark:bg-sky-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-extrabold text-slate-800 dark:text-slate-100">{partner.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${partner.isActive ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-500'}`}>
                      {partner.isActive ? 'نشط' : 'غير نشط'}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                    <span>{formatNumber.format(partner.ownershipPercent)}% ملكية</span>
                    <span className={partner.netBalance < 0 ? 'font-bold text-rose-600' : 'font-bold text-slate-700 dark:text-slate-300'}>{formatMoney(partner.netBalance)}</span>
                  </div>
                </button>
              ))}
          </div>
        </section>

        <section className="partner-print-area min-w-0 space-y-4">
          {!selected ? (
            <div className="flex min-h-64 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
              اختر شريكًا لعرض حسابه وتفاصيل حركاته.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                <div>
                  <p className="mb-1 hidden text-center text-lg font-extrabold print:block">كشف حساب الشريك</p>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-extrabold text-slate-900 dark:text-slate-100">{selected.name}</h2>
                    {!selected.isActive && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">غير نشط</span>}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {selected.phone || 'بدون هاتف'}{selected.email ? ` · ${selected.email}` : ''}
                    {' · '}نسبة الملكية {formatNumber.format(selected.ownershipPercent)}%
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canTransact && (
                    <select aria-label="إضافة حركة للشريك" value="" onChange={(event) => event.target.value && openTransaction(event.target.value as TransactionAction)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                      <option value="">تسجيل عملية...</option>
                      {ACTION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  )}
                  {canManage && <button type="button" onClick={() => openEditPartner(selected)} className="icon-action"><Pencil className="h-4 w-4" /> تعديل</button>}
                  {canPrint && <button type="button" onClick={printStatement} className="icon-action partner-print-hidden"><Printer className="h-4 w-4" /> طباعة الكشف</button>}
                </div>
              </div>

              <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="ملخص حساب الشريك">
                <SummaryCard label="رأس المال المتفق عليه" value={formatMoney(selected.capitalAmount)} icon={Building2} />
                <SummaryCard label="إجمالي المساهمات الفعلية" value={formatMoney(selected.capitalContributions)} icon={Building2} />
                <SummaryCard label="المسحوبات من رأس المال" value={formatMoney(selected.withdrawals)} icon={ArrowUpRight} />
                <SummaryCard label="الأرباح المستحقة" value={formatMoney(selected.profitsDue)} icon={Banknote} />
                <SummaryCard label="الأرباح الموزعة / المصروفة" value={formatMoney(selected.profitsDistributed)} icon={ArrowDownLeft} />
                <SummaryCard label="مصروفات دفعها الشريك" value={formatMoney(selected.expensesPaid)} icon={ArrowDownLeft} />
                <SummaryCard label="صافي رصيد الشريك" value={formatMoney(selected.netBalance)} icon={ClipboardList} />
              </section>
              <p className="text-xs text-slate-500">
                الرصيد الموجب مستحق للشريك على الشركة، والرصيد السالب مستحق للشركة على الشريك.
              </p>
              {selected.expensesForPartner > 0 && (
                <p className="text-xs text-slate-500">مصروفات دفعتها الشركة عن الشريك: {formatMoney(selected.expensesForPartner)}</p>
              )}

              <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
                  <h3 className="font-extrabold text-slate-800 dark:text-slate-100">كشف حساب تفصيلي</h3>
                  <span className="text-xs text-slate-500">{formatNumber.format(statement?.transactions.length || 0)} عملية</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] text-right text-xs">
                    <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800">
                      <tr>
                        {['التاريخ', 'البيان', 'نوع العملية', 'الفرع', 'طريقة الدفع', 'مدين', 'دائن', 'الرصيد', 'رقم القيد', 'سجلها'].map((heading) => <th key={heading} className="px-3 py-3 font-bold">{heading}</th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {!statement?.transactions.length ? (
                        <tr><td colSpan={10} className="py-12 text-center text-slate-500">لا توجد حركات مسجلة لهذا الشريك.</td></tr>
                      ) : statement.transactions.map((transaction) => {
                        const incoming = ['CAPITAL_CONTRIBUTION', 'PROFIT_ALLOCATION', 'PARTNER_EXPENSE_PAID'].includes(transaction.transactionType);
                        return (
                          <tr key={transaction.id} className="text-slate-700 dark:text-slate-300">
                            <td className="whitespace-nowrap px-3 py-3">{formatDate(transaction.transactionDate)}</td>
                            <td className="max-w-56 px-3 py-3">{transaction.description}</td>
                            <td className="px-3 py-3">{TRANSACTION_LABELS[transaction.transactionType]}</td>
                            <td className="px-3 py-3">{transaction.branchName}</td>
                            <td className="px-3 py-3">{paymentTypeLabel(transaction.paymentType)}</td>
                            <td className="px-3 py-3">{incoming ? '—' : formatMoney(transaction.amount)}</td>
                            <td className="px-3 py-3">{incoming ? formatMoney(transaction.amount) : '—'}</td>
                            <td className={`px-3 py-3 font-extrabold ${transaction.runningBalance < 0 ? 'text-rose-600' : ''}`}>{formatMoney(transaction.runningBalance)}</td>
                            <td className="whitespace-nowrap px-3 py-3 font-mono">{transaction.journalEntryNumber}</td>
                            <td className="px-3 py-3">{transaction.createdByName}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </section>
      </div>

      {modal === 'partner' && (
        <ModalShell title={editingPartner ? 'تعديل بيانات الشريك' : 'إضافة شريك جديد'} onClose={() => setModal(null)}>
          <form onSubmit={savePartner} className="space-y-3">
            <Field label="اسم الشريك" required><input required value={partnerDraft.name} onChange={(event) => setPartnerDraft({ ...partnerDraft, name: event.target.value })} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="رقم الهاتف"><input value={partnerDraft.phone || ''} onChange={(event) => setPartnerDraft({ ...partnerDraft, phone: event.target.value })} /></Field>
              <Field label="البريد الإلكتروني"><input type="email" value={partnerDraft.email || ''} onChange={(event) => setPartnerDraft({ ...partnerDraft, email: event.target.value })} /></Field>
            </div>
            <Field label="رأس المال المتفق عليه"><input type="number" min="0" step="0.01" value={partnerDraft.capitalAmount} onChange={(event) => setPartnerDraft({ ...partnerDraft, capitalAmount: Number(event.target.value) })} /></Field>
            <Field label="نسبة الملكية (%)" required><input type="number" min="0" max="100" step="0.01" required value={partnerDraft.ownershipPercent} onChange={(event) => setPartnerDraft({ ...partnerDraft, ownershipPercent: Number(event.target.value) })} /></Field>
            <Field label="ملاحظات"><textarea rows={3} value={partnerDraft.notes || ''} onChange={(event) => setPartnerDraft({ ...partnerDraft, notes: event.target.value })} /></Field>
            {editingPartner && (
              <label className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                <input type="checkbox" checked={partnerDraft.isActive !== false} onChange={(event) => setPartnerDraft({ ...partnerDraft, isActive: event.target.checked })} />
                شريك نشط
              </label>
            )}
            <p className="text-xs text-slate-500">مجموع نسب الشركاء النشطين حاليًا: {formatNumber.format(activeOwnership)}% (الحد الأقصى 100%).</p>
            <ModalActions onCancel={() => setModal(null)} saving={saving} submitLabel={editingPartner ? 'حفظ التعديلات' : 'إضافة الشريك'} />
          </form>
        </ModalShell>
      )}

      {modal === 'transaction' && selected && (
        <ModalShell title={TRANSACTION_LABELS[action]} onClose={() => setModal(null)}>
          <form onSubmit={saveTransaction} className="space-y-3">
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{selected.name}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="المبلغ" required><input type="number" min="0.01" step="0.01" required value={transactionDraft.amount} onChange={(event) => setTransactionDraft({ ...transactionDraft, amount: event.target.value })} /></Field>
              <Field label="التاريخ" required><input type="date" required value={transactionDraft.transactionDate} onChange={(event) => setTransactionDraft({ ...transactionDraft, transactionDate: event.target.value })} /></Field>
            </div>
            {CASH_ACTIONS.includes(action) && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="طريقة الدفع" required>
                  <select value={transactionDraft.paymentType} onChange={(event) => setTransactionDraft({ ...transactionDraft, paymentType: event.target.value as PartnerPaymentType })}>
                    <option value="CASH">نقدي</option><option value="BANK_TRANSFER">تحويل بنكي</option><option value="CARD">بطاقة</option><option value="CHEQUE">شيك</option>
                  </select>
                </Field>
                {transactionDraft.paymentType === 'CASH' && (
                  <Field label="الخزينة" required>
                    <select required value={transactionDraft.registerId} onChange={(event) => setTransactionDraft({ ...transactionDraft, registerId: event.target.value })}>
                      {registers.map((register) => <option key={register.id} value={register.id}>{register.name}</option>)}
                    </select>
                  </Field>
                )}
              </div>
            )}
            {CASH_ACTIONS.includes(action) && transactionDraft.paymentType === 'CASH' && registers.length === 0 && (
              <p role="alert" className="text-xs font-bold text-rose-600">لا توجد خزينة نشطة متاحة في الفرع الحالي؛ اختر طريقة دفع أخرى أو فعّل خزينة.</p>
            )}
            <Field label="البيان" required><textarea required rows={3} value={transactionDraft.description} onChange={(event) => setTransactionDraft({ ...transactionDraft, description: event.target.value })} placeholder="سبب العملية أو تفاصيلها" /></Field>
            <p className="text-xs text-amber-700 dark:text-amber-300">سيتم حفظ الحركة في سجل الشريك وترحيل قيد محاسبي متوازن.</p>
            <ModalActions onCancel={() => setModal(null)} saving={saving} submitLabel="تسجيل وترحيل" />
          </form>
        </ModalShell>
      )}

      {modal === 'profits' && (
        <ModalShell title="توزيع أرباح على الشركاء" onClose={() => setModal(null)}>
          <form onSubmit={saveProfitDistribution} className="space-y-3">
            <p className="text-xs text-slate-500">يتم اقتراح التوزيع حسب نسب الملكية، ويمكن تعديل حصة أي شريك يدويًا. يجب أن يطابق مجموع الحصص إجمالي المبلغ.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="إجمالي الأرباح المراد توزيعها" required><input type="number" min="0.01" step="0.01" required value={profitTotal} onChange={(event) => fillAutomaticShares(event.target.value)} /></Field>
              <Field label="تاريخ التوزيع" required><input type="date" required value={transactionDraft.transactionDate} onChange={(event) => setTransactionDraft({ ...transactionDraft, transactionDate: event.target.value })} /></Field>
            </div>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {partners.filter((partner) => partner.isActive).map((partner) => (
                <div key={partner.id} className="grid grid-cols-[minmax(0,1fr)_100px] items-center gap-3 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                  <div><p className="text-sm font-bold text-slate-800 dark:text-slate-100">{partner.name}</p><p className="text-xs text-slate-500">{formatNumber.format(partner.ownershipPercent)}%</p></div>
                  <input aria-label={`حصة أرباح ${partner.name}`} type="number" min="0" step="0.01" value={allocations.find((allocation) => allocation.partnerId === partner.id)?.amount ?? 0} onChange={(event) => setProfitAmount(partner.id, event.target.value)} />
                </div>
              ))}
            </div>
            <p className={`text-sm font-bold ${Math.abs(allocations.reduce((sum, allocation) => sum + allocation.amount, 0) - Number(profitTotal || 0)) > 0.005 ? 'text-rose-600' : 'text-emerald-700'}`}>
              مجموع الحصص: {formatMoney(allocations.reduce((sum, allocation) => sum + allocation.amount, 0))}
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-300">سيُرفض التوزيع إذا تجاوز رصيد الأرباح المحتجزة في الحسابات.</p>
            <ModalActions onCancel={() => setModal(null)} saving={saving} submitLabel="اعتماد التوزيع" />
          </form>
        </ModalShell>
      )}
    </div>
  );
};

const SummaryCard: React.FC<{ label: string; value: string; icon: typeof Users }> = ({ label, value, icon: Icon }) => (
  <div className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
    <span className="rounded-lg bg-sky-50 p-2 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"><Icon className="h-5 w-5" /></span>
    <div className="min-w-0"><p className="truncate text-xs font-bold text-slate-500 dark:text-slate-400">{label}</p><p className="mt-1 truncate text-base font-extrabold text-slate-900 dark:text-slate-100">{value}</p></div>
  </div>
);

const ModalShell: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-label={title} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-5 shadow-2xl dark:bg-slate-900">
      <div className="mb-4 flex items-center justify-between gap-3"><h2 className="font-extrabold text-slate-900 dark:text-slate-100">{title}</h2><button type="button" onClick={onClose} aria-label="إغلاق" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button></div>
      {children}
    </section>
  </div>
);

const Field: React.FC<{ label: string; required?: boolean; children: React.ReactNode }> = ({ label, required, children }) => (
  <label className="block space-y-1 text-xs font-bold text-slate-600 dark:text-slate-300">
    <span>{label}{required && <span className="text-rose-600"> *</span>}</span>
    {React.cloneElement(children as React.ReactElement<{ className?: string }>, {
      className: 'w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100',
    })}
  </label>
);

const ModalActions: React.FC<{ onCancel: () => void; saving: boolean; submitLabel: string }> = ({ onCancel, saving, submitLabel }) => (
  <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
    <button type="button" onClick={onCancel} disabled={saving} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 dark:border-slate-700 dark:text-slate-300">إلغاء</button>
    <button type="submit" disabled={saving} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? 'جارٍ الحفظ...' : submitLabel}</button>
  </div>
);

function paymentTypeLabel(type: PartnerTransaction['paymentType']): string {
  switch (type) {
    case 'CASH': return 'نقدي';
    case 'CARD': return 'بطاقة';
    case 'BANK_TRANSFER': return 'تحويل بنكي';
    case 'CHEQUE': return 'شيك';
    default: return '—';
  }
}
