import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight, Banknote, BarChart3, Building2, ClipboardList, Download,
  History, Plus, RefreshCw, Users, Wallet,
} from 'lucide-react';
import { usePermission } from '../../../hooks/domains/auth/usePermission';
import { useToast } from '../../../components/ui/Toast';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Button } from '../../../components/ui/Button';
import {
  PartnerService,
  type BusinessPartner,
  type PartnerDraft,
  type PartnerOverview,
  type PartnerPaymentType,
  type PartnerBankAccount,
  type PartnerCapitalHistory,
  type PartnerAttachment,
  type PartnerProfitBatch,
  type PartnerProfitBatchLine,
  type PartnerStatement,
  type PartnerTransaction,
  type PartnerTransactionAction,
  type PartnerTransactionType,
  type ProfitAllocation,
} from '../../../services/domains/customers/PartnerService';
import {
  CASH_ACTIONS, TRANSACTION_LABELS, downloadCsv, emptyOverview, emptyPartner,
  formatMoney, formatNumber, paymentTypeLabel, today,
  type InitialPaymentStatus, type PartnerModal, type Tab,
} from './PartnersPage/partnersModel';
import { SummaryCard } from './PartnersPage/PartnerUi';
import { PartnerList } from './PartnersPage/PartnerList';
import { PartnerOverviewTab } from './PartnersPage/PartnerOverviewTab';
import { PartnerDistributionsTab } from './PartnersPage/PartnerDistributionsTab';
import { PartnerStatementTab } from './PartnersPage/PartnerStatementTab';
import { PartnerFormModal } from './PartnersPage/PartnerFormModal';
import { TransactionModal } from './PartnersPage/TransactionModal';
import { ReversalModal } from './PartnersPage/ReversalModal';
import { ProfitsModal } from './PartnersPage/ProfitsModal';

export const PartnersPage: React.FC = () => {
  const can = usePermission();
  const toast = useToast();
  const service = useMemo(() => new PartnerService(), []);
  const canManage = can('partners.manage');
  const canTransact = can('partners.transactions');
  const canAdjust = can('partners.adjust');
  const canReverse = can('partners.reverse');
  const canDistribute = can('partners.profits.distribute');
  const canPrint = can('partners.print');
  const canExport = can('partners.export');

  const [partners, setPartners] = useState<BusinessPartner[]>([]);
  const [overview, setOverview] = useState<PartnerOverview>(emptyOverview);
  const [registers, setRegisters] = useState<Array<{ id: string; name: string }>>([]);
  const [bankAccounts, setBankAccounts] = useState<PartnerBankAccount[]>([]);
  const [capitalHistory, setCapitalHistory] = useState<PartnerCapitalHistory[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('statement');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<PartnerModal>(null);

  const [editingPartner, setEditingPartner] = useState<BusinessPartner | null>(null);
  const [partnerDraft, setPartnerDraft] = useState<PartnerDraft>(emptyPartner);
  const [initialPaymentStatus, setInitialPaymentStatus] = useState<InitialPaymentStatus>('UNPAID');
  const [action, setAction] = useState<PartnerTransactionAction>('CAPITAL_CONTRIBUTION');
  const [transactionDraft, setTransactionDraft] = useState({
    amount: '',
    transactionDate: today(),
    paymentType: 'CASH' as PartnerPaymentType,
    registerId: '',
    bankAccountId: '',
    referenceNumber: '',
    description: '',
  });
  const [profitTotal, setProfitTotal] = useState('');
  const [profitNotes, setProfitNotes] = useState('');
  const [allocations, setAllocations] = useState<ProfitAllocation[]>([]);
  const [reversalTarget, setReversalTarget] = useState<PartnerTransaction | null>(null);
  const [reversalReason, setReversalReason] = useState('');

  const [statement, setStatement] = useState<PartnerStatement | null>(null);
  const [transactionAttachments, setTransactionAttachments] = useState<PartnerAttachment[]>([]);
  const [statementFilters, setStatementFilters] = useState({
    from: '', to: '', type: 'ALL' as 'ALL' | PartnerTransactionType, search: '',
  });
  const [distributionHistory, setDistributionHistory] = useState<PartnerProfitBatch[]>([]);
  const [openBatchId, setOpenBatchId] = useState('');
  const [batchLines, setBatchLines] = useState<PartnerProfitBatchLine[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback((keepSelection = true) => {
    setLoading(true);
    setError('');
    try {
      const next = service.getPartners();
      setPartners(next);
      setOverview(service.getOverview());
      setDistributionHistory(service.getProfitDistributionHistory());
      setSelectedId((current) => keepSelection && next.some((partner) => partner.id === current)
        ? current
        : next.find((partner) => partner.isActive)?.id || next[0]?.id || '');
      if (canTransact) {
        try {
          setRegisters(service.getAvailableRegisters());
          setBankAccounts(service.getAvailableBankAccounts());
        } catch (registerError) {
          console.error('Could not load partner transaction registers:', registerError);
          setRegisters([]);
          setBankAccounts([]);
        }
      } else {
        setRegisters([]);
        setBankAccounts([]);
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
      setCapitalHistory([]);
      return;
    }
    try {
      setStatement(service.getPartnerStatement(selectedId, {
        from: statementFilters.from || undefined,
        to: statementFilters.to || undefined,
        types: statementFilters.type === 'ALL' ? undefined : [statementFilters.type],
        search: statementFilters.search || undefined,
      }));
      setCapitalHistory(service.getPartnerCapitalHistory(selectedId));
    } catch (statementError) {
      console.error('Could not load partner statement:', statementError);
      setStatement(null);
      setCapitalHistory([]);
      setError(statementError instanceof Error ? statementError.message : 'تعذر تحميل كشف الحساب.');
    }
  }, [selectedId, partners, statementFilters, service]);

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
  const activeProfitShare = partners.filter((partner) => partner.isActive)
    .reduce((sum, partner) => sum + Number(partner.profitSharePercent), 0);
  const pendingProfits = Math.max(0, overview.totalProfitsDue - overview.totalProfitsDistributed);
  const outstandingLoans = Math.max(0, overview.totalLoansReceived - overview.totalLoansRepaid);
  const ownershipPreview = (() => {
    const basis = partnerDraft.ownershipBasis || 'AGREED_CAPITAL';
    const active = partners.filter((partner) => partner.isActive && partner.id !== editingPartner?.id);
    const targetWeight = basis === 'AGREED_CAPITAL'
      ? Number(partnerDraft.capitalAmount || 0)
      : editingPartner
        ? Math.max(0, editingPartner.capitalContributions - editingPartner.withdrawals)
        : Number(partnerDraft.initialPaidAmount || 0);
    const otherWeight = active.reduce((sum, partner) => sum + Math.max(0,
      basis === 'AGREED_CAPITAL'
        ? Number(partner.capitalAmount)
        : Number(partner.capitalContributions) - Number(partner.withdrawals)), 0);
    const total = targetWeight + otherWeight;
    return total > 0 ? Math.round((targetWeight / total) * 10000) / 100 : 0;
  })();

  const refresh = () => load();

  const selectPartner = (partnerId: string) => {
    setSelectedId(partnerId);
    setTab('statement');
  };

  const openNewPartner = () => {
    setEditingPartner(null);
    setInitialPaymentStatus('UNPAID');
    const alignedProfitShares = partners.filter((partner) => partner.isActive)
      .every((partner) => Math.abs(partner.profitSharePercent - partner.ownershipPercent) <= 0.005);
    setPartnerDraft({
      ...emptyPartner,
      ownershipBasis: service.getOwnershipBasis(),
      initialRegisterId: registers[0]?.id || '',
      profitSharePercent: alignedProfitShares ? undefined : 0,
    });
    setModal('partner');
  };

  const openEditPartner = (partner: BusinessPartner) => {
    setEditingPartner(partner);
    setInitialPaymentStatus('UNPAID');
    setPartnerDraft({
      name: partner.name,
      phone: partner.phone || '',
      email: partner.email || '',
      ownershipPercent: partner.ownershipPercent,
      profitSharePercent: partner.profitSharePercent,
      capitalAmount: partner.capitalAmount,
      ownershipMode: 'AUTO',
      ownershipBasis: service.getOwnershipBasis(),
      ownershipEffectiveDate: today(),
      ownershipChangeReason: '',
      capitalEffectiveDate: today(),
      capitalChangeReason: '',
      initialPaidAmount: 0,
      notes: partner.notes || '',
      isActive: partner.isActive,
    });
    setModal('partner');
  };

  const openTransaction = (nextAction: PartnerTransactionAction) => {
    if (!selected) return;
    setAction(nextAction);
    setTransactionDraft((current) => ({
      ...current,
      amount: '',
      paymentType: 'CASH',
      registerId: registers[0]?.id || '',
      bankAccountId: bankAccounts[0]?.id || '',
      referenceNumber: '',
      description: '',
    }));
    setTransactionAttachments([]);
    setModal('transaction');
  };

  const openProfitDistribution = () => {
    if (!partners.some((partner) => partner.isActive)) {
      toast.error('تعذر توزيع الأرباح', 'أضف شريكًا نشطًا واحدًا على الأقل.');
      return;
    }
    const active = partners.filter((partner) => partner.isActive);
    setProfitTotal('');
    setProfitNotes('');
    setAllocations(active.map((partner) => ({ partnerId: partner.id, amount: 0 })));
    setModal('profits');
  };

  const openReversal = (transaction: PartnerTransaction) => {
    setReversalTarget(transaction);
    setReversalReason('');
    setModal('reversal');
  };

  const savePartner = (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const draft = {
        ...partnerDraft,
        initialPaidAmount: editingPartner || !canTransact || initialPaymentStatus === 'UNPAID'
          ? 0
          : initialPaymentStatus === 'FULL'
            ? Number(partnerDraft.capitalAmount || 0)
            : Number(partnerDraft.initialPaidAmount || 0),
        ownershipPercent: partnerDraft.ownershipMode === 'AUTO' ? ownershipPreview : partnerDraft.ownershipPercent,
      };
      const saved = editingPartner
        ? service.updatePartner(editingPartner.id, draft)
        : service.createPartner(draft);
      setModal(null);
      setSelectedId(saved.id);
      load();
      toast.success(
        editingPartner ? 'تم تحديث بيانات الشريك وتوثيق تغييرات الملكية ورأس المال'
          : 'تمت إضافة الشريك وحساب نسب الملكية تلقائيًا'
      );
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
        registerId: CASH_ACTIONS.includes(action) ? transactionDraft.registerId || undefined : undefined,
        bankAccountId: CASH_ACTIONS.includes(action) && transactionDraft.paymentType === 'BANK_TRANSFER'
          ? transactionDraft.bankAccountId || undefined
          : undefined,
        referenceNumber: transactionDraft.referenceNumber || undefined,
        description: transactionDraft.description,
        attachments: transactionAttachments,
      });
      setModal(null);
      setTransactionAttachments([]);
      load();
      toast.success('تم تسجيل العملية وترحيلها محاسبيًا');
    } catch (saveError) {
      toast.error('تعذر تسجيل العملية', saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  const saveReversal = (event: React.FormEvent) => {
    event.preventDefault();
    if (!reversalTarget) return;
    setSaving(true);
    try {
      service.reverseTransaction(reversalTarget.id, reversalReason);
      setModal(null);
      setReversalTarget(null);
      load();
      toast.success('تم عكس الحركة بقيد محاسبي عكسي');
    } catch (reverseError) {
      toast.error('تعذر عكس الحركة', reverseError instanceof Error ? reverseError.message : String(reverseError));
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
    const weights = active.map((partner) => Number(partner.profitSharePercent));
    const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
    if (weightTotal <= 0) {
      toast.error('تعذر احتساب الحصص', 'أدخل نسب مشاركة في الأرباح للشركاء النشطين أولًا.');
      return;
    }
    let remainingCents = Math.round(total * 100);
    const next = active.map((partner, index) => {
      const cents = index === active.length - 1
        ? remainingCents
        : Math.round(total * weights[index] / weightTotal);
      remainingCents -= cents;
      return { partnerId: partner.id, amount: cents / 100 };
    });
    setAllocations(next);
  };

  const saveProfitDistribution = (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      service.distributeProfits(Number(profitTotal), allocations, transactionDraft.transactionDate, profitNotes);
      setModal(null);
      load();
      toast.success('تم توزيع الأرباح على حسابات الشركاء');
    } catch (saveError) {
      toast.error('تعذر توزيع الأرباح', saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  const toggleBatch = (batchId: string) => {
    if (openBatchId === batchId) {
      setOpenBatchId('');
      setBatchLines([]);
      return;
    }
    try {
      setBatchLines(service.getProfitDistributionBatch(batchId));
      setOpenBatchId(batchId);
    } catch (batchError) {
      toast.error('تعذر تحميل تفاصيل التوزيع', batchError instanceof Error ? batchError.message : String(batchError));
    }
  };

  const exportCsv = () => {
    if (!canExport) return;
    try {
      if (tab === 'overview') {
        downloadCsv(`partners-balances-${today()}.csv`, [
          ['الشريك', 'نسبة الملكية %', 'نسبة الأرباح %', 'رأس المال المتفق', 'المسدد', 'المتبقي', 'المساهمات', 'المسحوبات',
            'قروض واردة', 'سداد القروض', 'مسحوبات شخصية', 'تسويات', 'أرباح مستحقة',
            'أرباح مصروفة', 'مصروفات دفعها', 'مصروفات عنه', 'صافي الرصيد', 'الحالة'],
          ...partners.map((partner) => [
            partner.name, partner.ownershipPercent, partner.profitSharePercent, partner.capitalAmount,
            partner.capitalPaid, partner.remainingCapital, partner.capitalContributions,
            partner.withdrawals, partner.loansReceived, partner.loansRepaid, partner.personalDrawings,
            partner.adjustments, partner.profitsDue, partner.profitsDistributed, partner.expensesPaid,
            partner.expensesForPartner, partner.netBalance, partner.isActive ? 'نشط' : 'غير نشط',
          ]),
        ]);
      } else if (tab === 'distributions') {
        downloadCsv(`partners-profit-distributions-${today()}.csv`, [
          ['رقم الدفعة', 'التاريخ', 'إجمالي الموزع', 'عدد الشركاء'],
          ...distributionHistory.map((batch) => [
            batch.batchId, batch.transactionDate, batch.totalAmount, batch.partnersCount,
          ]),
        ]);
      } else if (selected && statement) {
        downloadCsv(`partner-statement-${selected.name}-${today()}.csv`, [
          ['الشريك', selected.name],
          ['من تاريخ', statement.from || 'البداية'],
          ['إلى تاريخ', statement.to || 'الآن'],
          ['الرصيد الافتتاحي', statement.openingBalance],
          [],
          ['التاريخ', 'البيان', 'نوع العملية', 'الفرع', 'طريقة الدفع', 'مدين', 'دائن', 'الرصيد', 'رقم القيد', 'سجلها'],
          ...statement.transactions.map((transaction) => [
            transaction.transactionDate, transaction.description,
            TRANSACTION_LABELS[transaction.transactionType], transaction.branchName,
            paymentTypeLabel(transaction.paymentType),
            transaction.balanceEffect < 0 ? Math.abs(transaction.balanceEffect) : '',
            transaction.balanceEffect > 0 ? transaction.balanceEffect : '',
            transaction.runningBalance, transaction.journalEntryNumber, transaction.createdByName,
          ]),
          [],
          ['إجمالي الوارد', statement.periodInflows],
          ['إجمالي الصادر', statement.periodOutflows],
          ['الرصيد الختامي', statement.closingBalance],
        ]);
      }
      toast.success('تم تصدير التقرير');
    } catch (exportError) {
      toast.error('تعذر التصدير', exportError instanceof Error ? exportError.message : String(exportError));
    }
  };

  const printStatement = () => {
    if (!canPrint || !selected) return;
    window.print();
  };
    <div className="erp-page">
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

      <PageHeader
        icon={<Users className="h-5 w-5" />}
        title="حسابات الشركاء"
        description="نسب الملكية ورأس المال والقروض والمسحوبات والأرباح والتسويات وكشوف الحساب."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={refresh} disabled={loading} leadingIcon={<RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />}>
              تحديث
            </Button>
            {canExport && (
              <Button variant="secondary" size="sm" onClick={exportCsv} disabled={loading} leadingIcon={<Download className="h-4 w-4" />}>
                تصدير CSV
              </Button>
            )}
            {canDistribute && (
              <Button variant="secondary" size="sm" onClick={openProfitDistribution} disabled={!partners.some((partner) => partner.isActive)} leadingIcon={<Banknote className="h-4 w-4" />}>
                توزيع أرباح
              </Button>
            )}
            {canManage && (
              <Button variant="primary" size="sm" onClick={openNewPartner} leadingIcon={<Plus className="h-4 w-4" />}>
                إضافة شريك
              </Button>
            )}
          </>
        }
      />

      <section className="erp-stat-grid" aria-label="ملخص حسابات الشركاء">
        <SummaryCard label="الشركاء النشطون" value={`${formatNumber.format(overview.activePartnersCount)} من ${formatNumber.format(overview.partnersCount)}`} icon={Users} />
        <SummaryCard label="إجمالي رأس المال المساهم" value={formatMoney(overview.totalContributions)} icon={Building2} />
        <SummaryCard label="أرباح مستحقة غير موزعة" value={formatMoney(pendingProfits)} icon={Banknote} tone="emerald" />
        <SummaryCard label="قروض شركاء مستحقة" value={formatMoney(outstandingLoans)} icon={Wallet} tone="amber" />
        <SummaryCard label="مسحوبات شخصية" value={formatMoney(overview.totalDrawings)} icon={ArrowUpRight} tone="rose" />
        <SummaryCard label="إجمالي صافي أرصدة الشركاء" value={formatMoney(overview.totalNetBalance)} icon={ClipboardList} tone={overview.totalNetBalance < 0 ? 'rose' : 'sky'} />
      </section>

      {error && <div role="alert" className="rounded-[var(--win-radius)] border border-[var(--win-danger-border)] bg-[var(--win-danger-soft)] px-3 py-2 text-[var(--ui-font-sm)] text-[var(--win-danger-text)]">{error}</div>}

      <div className="grid gap-3 xl:grid-cols-[300px_minmax(0,1fr)]">
        <PartnerList
          search={search}
          setSearch={setSearch}
          loading={loading}
          visiblePartners={visiblePartners}
          selectedId={selectedId}
          tab={tab}
          canManage={canManage}
          selectPartner={selectPartner}
          openNewPartner={openNewPartner}
        />
        <section className="min-w-0 space-y-4">
          <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
            {([
              { key: 'statement', label: 'كشف الحساب', icon: ClipboardList },
              { key: 'overview', label: 'أرصدة الشركاء', icon: BarChart3 },
              { key: 'distributions', label: 'سجل توزيع الأرباح', icon: History },
            ] as Array<{ key: Tab; label: string; icon: typeof Users }>).map(({ key, label, icon: Icon }) => (
              <button key={key} type="button" onClick={() => setTab(key)} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition ${tab === key ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
          {tab === 'overview' && (
            <PartnerOverviewTab
              partners={partners}
              overview={overview}
              activeOwnership={activeOwnership}
              activeProfitShare={activeProfitShare}
              outstandingLoans={outstandingLoans}
              selectPartner={selectPartner}
            />
          )}

          {tab === 'distributions' && (
            <PartnerDistributionsTab
              distributionHistory={distributionHistory}
              openBatchId={openBatchId}
              batchLines={batchLines}
              toggleBatch={toggleBatch}
            />
          )}

          {tab === 'statement' && (
            <PartnerStatementTab
              selected={selected}
              capitalHistory={capitalHistory}
              statement={statement}
              statementFilters={statementFilters}
              setStatementFilters={setStatementFilters}
              canManage={canManage}
              canTransact={canTransact}
              canAdjust={canAdjust}
              canReverse={canReverse}
              canPrint={canPrint}
              openEditPartner={openEditPartner}
              openTransaction={openTransaction}
              openReversal={openReversal}
              printStatement={printStatement}
            />
          )}
        </section>
      </div>

      {modal === 'partner' && (
        <PartnerFormModal
          editingPartner={editingPartner}
          partnerDraft={partnerDraft}
          setPartnerDraft={setPartnerDraft}
          initialPaymentStatus={initialPaymentStatus}
          setInitialPaymentStatus={setInitialPaymentStatus}
          canTransact={canTransact}
          registers={registers}
          bankAccounts={bankAccounts}
          saving={saving}
          activeOwnership={activeOwnership}
          ownershipPreview={ownershipPreview}
          savePartner={savePartner}
          setModal={setModal}
        />
      )}

      {modal === 'transaction' && selected && (
        <TransactionModal
          toast={toast}
          registers={registers}
          bankAccounts={bankAccounts}
          action={action}
          selected={selected}
          transactionDraft={transactionDraft}
          setTransactionDraft={setTransactionDraft}
          transactionAttachments={transactionAttachments}
          setTransactionAttachments={setTransactionAttachments}
          saving={saving}
          saveTransaction={saveTransaction}
          setModal={setModal}
        />
      )}

      {modal === 'reversal' && reversalTarget && (
        <ReversalModal
          reversalTarget={reversalTarget}
          reversalReason={reversalReason}
          setReversalReason={setReversalReason}
          saving={saving}
          saveReversal={saveReversal}
          setModal={setModal}
        />
      )}

      {modal === 'profits' && (
        <ProfitsModal
          partners={partners}
          profitTotal={profitTotal}
          profitNotes={profitNotes}
          setProfitNotes={setProfitNotes}
          allocations={allocations}
          transactionDraft={transactionDraft}
          setTransactionDraft={setTransactionDraft}
          saving={saving}
          setProfitAmount={setProfitAmount}
          fillAutomaticShares={fillAutomaticShares}
          saveProfitDistribution={saveProfitDistribution}
          setModal={setModal}
        />
      )}
    </div>
  );
};
