import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePermission } from '../../../domains/auth/usePermission';
import { useToast } from '../../../../components/ui/Toast';
import {
  PartnerService,
  type BusinessPartner,
  type PartnerBankAccount,
  type PartnerCapitalHistory,
  type PartnerDraft,
  type PartnerOverview,
  type PartnerPaymentType,
  type PartnerAttachment,
  type PartnerProfitBatch,
  type PartnerProfitBatchLine,
  type PartnerStatement,
  type PartnerTransaction,
  type PartnerTransactionAction,
  type PartnerTransactionType,
  type ProfitAllocation,
} from '../../../../services/domains/customers/PartnerService';
import {
  CASH_ACTIONS, TRANSACTION_LABELS, downloadCsv, emptyOverview, emptyPartner,
  paymentTypeLabel, today,
  type InitialPaymentStatus, type PartnerModal, type StatementFilters,
  type Tab, type TransactionDraft,
} from '../../../../pages/customers/partners/PartnersPage/partnersModel';

export function usePartnersPage() {
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
  const [transactionDraft, setTransactionDraft] = useState<TransactionDraft>({
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
  const [statementFilters, setStatementFilters] = useState<StatementFilters>({
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

  return {
    can, toast, service,
    canManage, canTransact, canAdjust, canReverse, canDistribute, canPrint, canExport,
    partners, overview, registers, bankAccounts, capitalHistory,
    selectedId, setSelectedId, search, setSearch, tab, setTab,
    loading, error, modal, setModal,
    editingPartner, setEditingPartner,
    partnerDraft, setPartnerDraft,
    initialPaymentStatus, setInitialPaymentStatus,
    action, setAction,
    transactionDraft, setTransactionDraft,
    profitTotal, setProfitTotal,
    profitNotes, setProfitNotes,
    allocations, setAllocations,
    reversalTarget, setReversalTarget,
    reversalReason, setReversalReason,
    statement, setStatement,
    transactionAttachments, setTransactionAttachments,
    statementFilters, setStatementFilters,
    distributionHistory,
    openBatchId, setOpenBatchId,
    batchLines, setBatchLines,
    saving,
    visiblePartners, selected,
    activeOwnership, activeProfitShare,
    pendingProfits, outstandingLoans, ownershipPreview,
    refresh, selectPartner,
    openNewPartner, openEditPartner, openTransaction,
    openProfitDistribution, openReversal,
    savePartner, saveTransaction, saveReversal,
    setProfitAmount, fillAutomaticShares, saveProfitDistribution,
    toggleBatch, exportCsv, printStatement,
  };
}

export type PartnersPageVm = ReturnType<typeof usePartnersPage>;
