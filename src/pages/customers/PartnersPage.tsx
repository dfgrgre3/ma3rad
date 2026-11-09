import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownLeft, ArrowUpRight, Banknote, BarChart3, Building2, ClipboardList, Download,
  History, Pencil, Plus, Printer, RefreshCw, RotateCcw, Search, TrendingUp, Users, Wallet,
} from 'lucide-react';
import { usePermission } from '../../hooks/usePermission';
import { useToast } from '../../components/ui/Toast';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { localDateString } from '../../utils/date';
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
} from '../../services/PartnerService';

const formatNumber = new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 });
const formatMoney = (value: number) => `${formatNumber.format(value || 0)} ج.م`;
const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('ar-EG');

const TRANSACTION_LABELS: Record<PartnerTransactionType, string> = {
  CAPITAL_CONTRIBUTION: 'سداد مساهمة رأس المال',
  WITHDRAWAL: 'سحب من رأس المال',
  PROFIT_ALLOCATION: 'أرباح مستحقة',
  PROFIT_DISTRIBUTION: 'صرف أرباح',
  PARTNER_EXPENSE_PAID: 'مصروف دفعه الشريك للشركة',
  COMPANY_EXPENSE_FOR_PARTNER: 'مصروف دفعته الشركة للشريك',
  PARTNER_LOAN: 'قرض من الشريك',
  LOAN_REPAYMENT: 'سداد قرض الشريك',
  PERSONAL_DRAWING: 'مسحوبات شخصية',
  ADJUSTMENT_INCREASE: 'تسوية بالزيادة',
  ADJUSTMENT_DECREASE: 'تسوية بالنقص',
  REVERSAL: 'عكس حركة',
};

type Modal = 'partner' | 'transaction' | 'profits' | 'reversal' | null;
type Tab = 'statement' | 'overview' | 'distributions';
type InitialPaymentStatus = 'UNPAID' | 'PARTIAL' | 'FULL' | 'CUSTOM';

const CASH_ACTIONS: PartnerTransactionAction[] = [
  'CAPITAL_CONTRIBUTION', 'WITHDRAWAL', 'PROFIT_DISTRIBUTION', 'COMPANY_EXPENSE_FOR_PARTNER',
  'PARTNER_LOAN', 'LOAN_REPAYMENT', 'PERSONAL_DRAWING',
];

const ACTION_OPTIONS: Array<{ value: PartnerTransactionAction; label: string; group: string }> = [
  { value: 'CAPITAL_CONTRIBUTION', label: 'تسجيل سداد المساهمة', group: 'رأس المال' },
  { value: 'WITHDRAWAL', label: 'سحب من رأس المال', group: 'رأس المال' },
  { value: 'PROFIT_DISTRIBUTION', label: 'صرف أرباح مستحقة', group: 'الأرباح' },
  { value: 'PARTNER_EXPENSE_PAID', label: 'مصروف دفعه الشريك نيابة عن الشركة', group: 'المصروفات' },
  { value: 'COMPANY_EXPENSE_FOR_PARTNER', label: 'مصروف دفعته الشركة نيابة عن الشريك', group: 'المصروفات' },
  { value: 'PARTNER_LOAN', label: 'قرض من الشريك للشركة (نقدية داخلة)', group: 'القروض والسلف' },
  { value: 'LOAN_REPAYMENT', label: 'سداد قرض الشريك (نقدية خارجة)', group: 'القروض والسلف' },
  { value: 'PERSONAL_DRAWING', label: 'مسحوبات شخصية للشريك', group: 'القروض والسلف' },
  { value: 'ADJUSTMENT_INCREASE', label: 'تسوية رصيد الشريك بالزيادة', group: 'التسويات' },
  { value: 'ADJUSTMENT_DECREASE', label: 'تسوية رصيد الشريك بالنقص', group: 'التسويات' },
];

const FILTER_TYPES: PartnerTransactionType[] = [
  'CAPITAL_CONTRIBUTION', 'WITHDRAWAL', 'PROFIT_ALLOCATION', 'PROFIT_DISTRIBUTION',
  'PARTNER_EXPENSE_PAID', 'COMPANY_EXPENSE_FOR_PARTNER', 'PARTNER_LOAN', 'LOAN_REPAYMENT',
  'PERSONAL_DRAWING', 'ADJUSTMENT_INCREASE', 'ADJUSTMENT_DECREASE', 'REVERSAL',
];

const today = () => localDateString();

const emptyPartner: PartnerDraft = {
  name: '', phone: '', email: '', ownershipPercent: 0, capitalAmount: 0,
  ownershipMode: 'AUTO', ownershipBasis: 'AGREED_CAPITAL', ownershipEffectiveDate: today(),
  ownershipChangeReason: '', capitalEffectiveDate: today(), capitalChangeReason: '',
  initialPaidAmount: 0, initialPaymentType: 'CASH', profitShareChangeReason: '',
  notes: '', isActive: true,
};

const emptyOverview: PartnerOverview = {
  partnersCount: 0, activePartnersCount: 0, ownershipTotal: 0, totalCapitalAgreed: 0,
  totalContributions: 0, totalWithdrawals: 0, totalProfitsDue: 0, totalProfitsDistributed: 0,
  totalExpensesPaid: 0, totalExpensesForPartner: 0, totalLoansReceived: 0, totalLoansRepaid: 0,
  totalDrawings: 0, totalAdjustments: 0, totalNetBalance: 0,
};

function csvCell(value: string | number | null | undefined): string {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(fileName: string, rows: Array<Array<string | number | null | undefined>>): void {
  const csv = '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function readPartnerAttachment(file: File): Promise<PartnerAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error(`تعذر قراءة الملف ${file.name}.`));
        return;
      }
      resolve({ name: file.name, type: file.type, dataUrl: reader.result });
    };
    reader.onerror = () => reject(reader.error || new Error(`تعذر قراءة الملف ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

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
  const [modal, setModal] = useState<Modal>(null);

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

  return (
    <div className="erp-page" dir="rtl">
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
                <button key={partner.id} type="button" onClick={() => selectPartner(partner.id)} className={`block w-full border-b border-slate-100 p-4 text-right transition dark:border-slate-800 ${selectedId === partner.id && tab === 'statement' ? 'bg-sky-50 dark:bg-sky-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}>
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
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
                <div>
                  <h3 className="font-extrabold text-slate-800 dark:text-slate-100">أرصدة جميع الشركاء</h3>
                  <p className="text-xs text-slate-500">
                    الملكية النشطة: {formatNumber.format(activeOwnership)}% · مشاركة الأرباح النشطة: {formatNumber.format(activeProfitShare)}%.
                  </p>
                </div>
                {(Math.abs(activeOwnership - 100) > 0.005 || Math.abs(activeProfitShare - 100) > 0.005) && (
                  <span className="rounded-lg bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                    راجع مجموع نسب الملكية ومشاركة الأرباح
                  </span>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1320px] text-right text-xs">
                  <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800">
                    <tr>
                      {['الشريك', 'الملكية', 'الأرباح %', 'رأس المال', 'المسدد', 'المتبقي', 'المساهمات', 'المسحوبات', 'القروض', 'مسحوبات شخصية', 'الأرباح المستحقة', 'المصروفة', 'التسويات', 'صافي الرصيد', 'الحالة'].map((heading) => (
                        <th key={heading} className="px-3 py-3 font-bold">{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {partners.length === 0 ? (
                      <tr><td colSpan={15} className="py-12 text-center text-slate-500">لا توجد بيانات شركاء.</td></tr>
                    ) : partners.map((partner) => (
                      <tr key={partner.id} className="cursor-pointer text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/50" onClick={() => selectPartner(partner.id)}>
                        <td className="px-3 py-3 font-bold">{partner.name}</td>
                        <td className="px-3 py-3">{formatNumber.format(partner.ownershipPercent)}%</td>
                        <td className="px-3 py-3">{formatNumber.format(partner.profitSharePercent)}%</td>
                        <td className="px-3 py-3">{formatMoney(partner.capitalAmount)}</td>
                        <td className="px-3 py-3">{formatMoney(partner.capitalPaid)}</td>
                        <td className="px-3 py-3">{formatMoney(partner.remainingCapital)}</td>
                        <td className="px-3 py-3">{formatMoney(partner.capitalContributions)}</td>
                        <td className="px-3 py-3">{formatMoney(partner.withdrawals)}</td>
                        <td className="px-3 py-3">{formatMoney(partner.loansReceived - partner.loansRepaid)}</td>
                        <td className="px-3 py-3">{formatMoney(partner.personalDrawings)}</td>
                        <td className="px-3 py-3">{formatMoney(partner.profitsDue)}</td>
                        <td className="px-3 py-3">{formatMoney(partner.profitsDistributed)}</td>
                        <td className="px-3 py-3">{formatMoney(partner.adjustments)}</td>
                        <td className={`px-3 py-3 font-extrabold ${partner.netBalance < 0 ? 'text-rose-600' : ''}`}>{formatMoney(partner.netBalance)}</td>
                        <td className="px-3 py-3">{partner.isActive ? 'نشط' : 'غير نشط'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 font-extrabold text-slate-800 dark:bg-slate-800 dark:text-slate-100">
                    <tr>
                      <td className="px-3 py-3">الإجمالي</td>
                      <td className="px-3 py-3">{formatNumber.format(activeOwnership)}%</td>
                      <td className="px-3 py-3">{formatMoney(overview.totalCapitalAgreed)}</td>
                      <td className="px-3 py-3">{formatMoney(overview.totalContributions)}</td>
                      <td className="px-3 py-3">{formatMoney(overview.totalWithdrawals)}</td>
                      <td className="px-3 py-3">{formatMoney(outstandingLoans)}</td>
                      <td className="px-3 py-3">{formatMoney(overview.totalDrawings)}</td>
                      <td className="px-3 py-3">{formatMoney(overview.totalProfitsDue)}</td>
                      <td className="px-3 py-3">{formatMoney(overview.totalProfitsDistributed)}</td>
                      <td className="px-3 py-3">{formatMoney(overview.totalAdjustments)}</td>
                      <td className="px-3 py-3">{formatMoney(overview.totalNetBalance)}</td>
                      <td className="px-3 py-3">—</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          )}

          {tab === 'distributions' && (
            <section className="space-y-3">
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
                  <h3 className="font-extrabold text-slate-800 dark:text-slate-100">سجل توزيعات الأرباح</h3>
                  <span className="text-xs text-slate-500">{formatNumber.format(distributionHistory.length)} دفعة</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-right text-xs">
                    <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800">
                      <tr>{['رقم الدفعة', 'التاريخ', 'عدد الشركاء', 'إجمالي الموزع', 'التفاصيل'].map((heading) => <th key={heading} className="px-3 py-3 font-bold">{heading}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {distributionHistory.length === 0 ? (
                        <tr><td colSpan={5} className="py-12 text-center text-slate-500">لم يتم توزيع أرباح بعد.</td></tr>
                      ) : distributionHistory.map((batch) => (
                        <tr key={batch.batchId} className="text-slate-700 dark:text-slate-300">
                          <td className="px-3 py-3 font-mono">{batch.batchId}</td>
                          <td className="px-3 py-3">{formatDate(batch.transactionDate)}</td>
                          <td className="px-3 py-3">{formatNumber.format(batch.partnersCount)}</td>
                          <td className="px-3 py-3 font-extrabold">{formatMoney(batch.totalAmount)}</td>
                          <td className="px-3 py-3">
                            <button type="button" onClick={() => toggleBatch(batch.batchId)} className="rounded-lg border border-slate-200 px-2 py-1 font-bold text-sky-700 dark:border-slate-700 dark:text-sky-300">
                              {openBatchId === batch.batchId ? 'إخفاء' : 'عرض الحصص'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {openBatchId && (
                <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                  <h4 className="mb-3 font-extrabold text-slate-800 dark:text-slate-100">حصص الدفعة {openBatchId}</h4>
                  <div className="space-y-2">
                    {batchLines.map((line) => (
                      <div key={line.partnerId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm dark:border-slate-800">
                        <span className="font-bold text-slate-700 dark:text-slate-200">{line.partnerName}</span>
                        <span className="flex items-center gap-4 text-xs text-slate-500">
                          <span className="font-mono">{line.journalEntryNumber}</span>
                          <span className="font-extrabold text-emerald-700 dark:text-emerald-300">{formatMoney(line.amount)}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {tab === 'statement' && (
            <>
              {!selected ? (
                <div className="flex min-h-44 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
                  اختر شريكًا لعرض حسابه وتفاصيل حركاته.
                </div>
              ) : (
                <section className="partner-print-area space-y-4">
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
                    <div className="flex flex-wrap gap-2 partner-print-hidden">
                      {(canTransact || canAdjust) && (
                        <select aria-label="إضافة حركة للشريك" value="" onChange={(event) => event.target.value && openTransaction(event.target.value as PartnerTransactionAction)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                          <option value="">تسجيل عملية...</option>
                          {ACTION_OPTIONS.filter((option) => {
                            const isAdjustment = option.value === 'ADJUSTMENT_INCREASE' || option.value === 'ADJUSTMENT_DECREASE';
                            return isAdjustment ? canAdjust : canTransact;
                          }).map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      )}
                      {canManage && <button type="button" onClick={() => openEditPartner(selected)} className="icon-action"><Pencil className="h-4 w-4" /> تعديل</button>}
                      {canPrint && <button type="button" onClick={printStatement} className="icon-action"><Printer className="h-4 w-4" /> طباعة الكشف</button>}
                    </div>
                  </div>

                  <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="ملخص حساب الشريك">
                    <SummaryCard label="رأس المال المتفق عليه" value={formatMoney(selected.capitalAmount)} icon={Building2} />
                    <SummaryCard label="المساهمات الفعلية" value={formatMoney(selected.capitalContributions)} icon={TrendingUp} tone="emerald" />
                    <SummaryCard label="المتبقي من رأس المال" value={formatMoney(selected.remainingCapital)} icon={Wallet} tone="amber" />
                    <SummaryCard label="المسحوبات من رأس المال" value={formatMoney(selected.withdrawals)} icon={ArrowUpRight} tone="rose" />
                    <SummaryCard label="صافي رصيد الشريك" value={formatMoney(selected.netBalance)} icon={ClipboardList} tone={selected.netBalance < 0 ? 'rose' : 'sky'} />
                    <SummaryCard label="الأرباح المستحقة" value={formatMoney(selected.profitsDue)} icon={Banknote} />
                    <SummaryCard label="الأرباح المصروفة" value={formatMoney(selected.profitsDistributed)} icon={ArrowDownLeft} />
                    <SummaryCard label="قروض الشريك الصافية" value={formatMoney(selected.loansReceived - selected.loansRepaid)} icon={Wallet} tone="amber" />
                    <SummaryCard label="مسحوبات شخصية" value={formatMoney(selected.personalDrawings)} icon={ArrowUpRight} tone="rose" />
                  </section>
                  <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                    <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
                      <h3 className="font-extrabold text-slate-800 dark:text-slate-100">تاريخ رأس المال ونسب الشريك</h3>
                    </div>
                    {!capitalHistory.length ? (
                      <p className="px-4 py-3 text-xs text-slate-500">لا توجد تغييرات موثقة بعد.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[700px] text-right text-xs">
                          <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800">
                            <tr>{['التاريخ', 'النوع', 'من', 'إلى', 'السبب', 'سجله'].map((heading) => <th key={heading} className="px-3 py-2">{heading}</th>)}</tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {capitalHistory.map((entry) => (
                              <tr key={entry.id}>
                                <td className="px-3 py-2">{formatDate(entry.effectiveDate)}</td>
                                <td className="px-3 py-2">{entry.type === 'OWNERSHIP' ? 'ملكية' : entry.type === 'PROFIT_SHARE' ? 'توزيع أرباح' : 'رأس المال'}</td>
                                <td className="px-3 py-2">{entry.type === 'CAPITAL' ? formatMoney(entry.oldValue) : `${formatNumber.format(entry.oldValue)}%`}</td>
                                <td className="px-3 py-2">{entry.type === 'CAPITAL' ? formatMoney(entry.newValue) : `${formatNumber.format(entry.newValue)}%`}</td>
                                <td className="px-3 py-2">{entry.reason}</td>
                                <td className="px-3 py-2">{entry.createdByName}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                  <p className="text-xs text-slate-500">
                    الرصيد الموجب مستحق للشريك على الشركة، والرصيد السالب مستحق للشركة على الشريك.
                    {selected.expensesForPartner > 0 && ` مصروفات دفعتها الشركة عنه: ${formatMoney(selected.expensesForPartner)}.`}
                    {selected.adjustments !== 0 && ` صافي التسويات: ${formatMoney(selected.adjustments)}.`}
                  </p>

                  <div className="partner-print-hidden flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                    <label className="text-xs font-bold text-slate-500">
                      <span className="mb-1 block">من تاريخ</span>
                      <input type="date" value={statementFilters.from} onChange={(event) => setStatementFilters({ ...statementFilters, from: event.target.value })} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
                    </label>
                    <label className="text-xs font-bold text-slate-500">
                      <span className="mb-1 block">إلى تاريخ</span>
                      <input type="date" value={statementFilters.to} onChange={(event) => setStatementFilters({ ...statementFilters, to: event.target.value })} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
                    </label>
                    <label className="text-xs font-bold text-slate-500">
                      <span className="mb-1 block">نوع العملية</span>
                      <select value={statementFilters.type} onChange={(event) => setStatementFilters({ ...statementFilters, type: event.target.value as 'ALL' | PartnerTransactionType })} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                        <option value="ALL">كل الحركات</option>
                        {FILTER_TYPES.map((type) => <option key={type} value={type}>{TRANSACTION_LABELS[type]}</option>)}
                      </select>
                    </label>
                    <label className="min-w-40 flex-1 text-xs font-bold text-slate-500">
                      <span className="mb-1 block">بحث في البيان</span>
                      <input value={statementFilters.search} onChange={(event) => setStatementFilters({ ...statementFilters, search: event.target.value })} placeholder="كلمة أو رقم مرجعي..." className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
                    </label>
                    <button type="button" onClick={() => setStatementFilters({ from: '', to: '', type: 'ALL', search: '' })} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 dark:border-slate-700 dark:text-slate-300">مسح</button>
                  </div>

                  <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
                      <h3 className="font-extrabold text-slate-800 dark:text-slate-100">كشف حساب تفصيلي</h3>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        <span>وارد: <b className="text-emerald-700 dark:text-emerald-300">{formatMoney(statement?.periodInflows || 0)}</b></span>
                        <span>صادر: <b className="text-rose-600">{formatMoney(statement?.periodOutflows || 0)}</b></span>
                        <span>{formatNumber.format(statement?.transactions.length || 0)} عملية</span>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[1060px] text-right text-xs">
                        <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800">
                          <tr>
                            {['التاريخ', 'البيان', 'نوع العملية', 'الفرع', 'طريقة الدفع', 'مدين', 'دائن', 'الرصيد', 'رقم القيد', 'سجلها', 'إجراء'].map((heading) => <th key={heading} className="px-3 py-3 font-bold">{heading}</th>)}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {statement && statement.openingBalance !== 0 && (
                            <tr className="bg-slate-50/70 text-slate-600 dark:bg-slate-800/40 dark:text-slate-300">
                              <td className="px-3 py-3">{statement.from ? formatDate(statement.from) : '—'}</td>
                              <td className="px-3 py-3 font-bold" colSpan={6}>رصيد افتتاحي</td>
                              <td className="px-3 py-3 font-extrabold">{formatMoney(statement.openingBalance)}</td>
                              <td className="px-3 py-3" colSpan={3}>—</td>
                            </tr>
                          )}
                          {!statement?.transactions.length ? (
                            <tr><td colSpan={11} className="py-12 text-center text-slate-500">لا توجد حركات مطابقة للفلاتر الحالية.</td></tr>
                          ) : statement.transactions.map((transaction) => {
                            const canReverseRow = canReverse
                              && transaction.transactionType !== 'REVERSAL'
                              && !transaction.reversalOfId
                              && !transaction.isReversed;
                            return (
                              <tr key={transaction.id} className={`text-slate-700 dark:text-slate-300 ${transaction.transactionType === 'REVERSAL' ? 'bg-amber-50/40 dark:bg-amber-950/10' : ''}`}>
                                <td className="whitespace-nowrap px-3 py-3">{formatDate(transaction.transactionDate)}</td>
                                <td className="max-w-56 px-3 py-3">
                                  {transaction.description}
                                  {transaction.referenceNumber && <span className="mt-0.5 block font-mono text-[10px] text-slate-400">مرجع: {transaction.referenceNumber}</span>}
                                  {transaction.attachments.map((attachment, index) => (
                                    <a key={`${transaction.id}-${index}`} href={attachment.dataUrl} target="_blank" rel="noreferrer"
                                      className="mt-1 block text-[10px] font-bold text-sky-700 hover:underline dark:text-sky-300">
                                      إثبات: {attachment.name}
                                    </a>
                                  ))}
                                  {transaction.isReversed && <span className="mt-0.5 block text-[10px] font-bold text-amber-600">تم عكسها لاحقًا</span>}
                                </td>
                                <td className="px-3 py-3">
                                  {TRANSACTION_LABELS[transaction.transactionType]}
                                  {transaction.reversalOfType && <span className="mt-0.5 block text-[10px] text-slate-400">لـ: {TRANSACTION_LABELS[transaction.reversalOfType]}</span>}
                                </td>
                                <td className="px-3 py-3">{transaction.branchName}</td>
                                <td className="px-3 py-3">{paymentTypeLabel(transaction.paymentType)}{transaction.registerName ? ` · ${transaction.registerName}` : transaction.bankAccountName ? ` · ${transaction.bankAccountName}` : ''}</td>
                                <td className="px-3 py-3">{transaction.balanceEffect < 0 ? formatMoney(Math.abs(transaction.balanceEffect)) : '—'}</td>
                                <td className="px-3 py-3">{transaction.balanceEffect > 0 ? formatMoney(transaction.balanceEffect) : '—'}</td>
                                <td className={`px-3 py-3 font-extrabold ${transaction.runningBalance < 0 ? 'text-rose-600' : ''}`}>{formatMoney(transaction.runningBalance)}</td>
                                <td className="whitespace-nowrap px-3 py-3 font-mono">{transaction.journalEntryNumber}</td>
                                <td className="px-3 py-3">{transaction.createdByName}</td>
                                <td className="px-3 py-3 partner-print-hidden">
                                  {canReverseRow ? (
                                    <button type="button" onClick={() => openReversal(transaction)} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1 text-[11px] font-bold text-rose-600 dark:border-rose-900 dark:text-rose-300">
                                      <RotateCcw className="h-3 w-3" /> عكس
                                    </button>
                                  ) : '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-slate-50 font-extrabold text-slate-800 dark:bg-slate-800 dark:text-slate-100">
                          <tr>
                            <td className="px-3 py-3" colSpan={7}>الرصيد الختامي للفترة</td>
                            <td className="px-3 py-3">{formatMoney(statement?.closingBalance || 0)}</td>
                            <td className="px-3 py-3" colSpan={3}>—</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </section>
                </section>
              )}
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
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="أساس حساب الملكية">
                <select value={partnerDraft.ownershipBasis || 'AGREED_CAPITAL'} onChange={(event) => setPartnerDraft({
                  ...partnerDraft, ownershipBasis: event.target.value as PartnerDraft['ownershipBasis'],
                })}>
                  <option value="AGREED_CAPITAL">رأس المال المتفق عليه</option>
                  <option value="PAID_CONTRIBUTIONS">المساهمات الفعلية المسددة</option>
                </select>
              </Field>
              <Field label="طريقة تحديد الملكية">
                <select value={partnerDraft.ownershipMode || 'AUTO'} onChange={(event) => setPartnerDraft({
                  ...partnerDraft, ownershipMode: event.target.value as PartnerDraft['ownershipMode'],
                })}>
                  <option value="AUTO">حساب تلقائي وإعادة توزيع النسب</option>
                  <option value="MANUAL">إدخال يدوي</option>
                </select>
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="رأس المال المتفق عليه">
                <input type="number" min="0" step="0.01" value={partnerDraft.capitalAmount}
                  onChange={(event) => {
                    const capitalAmount = Number(event.target.value);
                    const paymentStatus = (initialPaymentStatus === 'PARTIAL' && capitalAmount < 0.02)
                      || ((initialPaymentStatus === 'FULL' || initialPaymentStatus === 'CUSTOM') && capitalAmount <= 0)
                      ? 'UNPAID'
                      : initialPaymentStatus;
                    const maxPaidAmount = initialPaymentStatus === 'PARTIAL'
                      ? Math.max(0, capitalAmount - 0.01)
                      : capitalAmount;
                    setInitialPaymentStatus(paymentStatus);
                    setPartnerDraft({
                      ...partnerDraft,
                      capitalAmount,
                      initialPaidAmount: paymentStatus === 'FULL'
                        ? capitalAmount
                        : Math.min(Number(partnerDraft.initialPaidAmount || 0), maxPaidAmount),
                    });
                  }} />
              </Field>
              <Field label="نسبة الملكية (%)" required>
                <input type="number" min="0" max="100" step="0.01" required
                  disabled={partnerDraft.ownershipMode !== 'MANUAL'}
                  value={partnerDraft.ownershipMode === 'AUTO' ? ownershipPreview : partnerDraft.ownershipPercent}
                  onChange={(event) => setPartnerDraft({ ...partnerDraft, ownershipPercent: Number(event.target.value) })} />
              </Field>
            </div>
            <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:bg-sky-950/30 dark:text-sky-200">
              {partnerDraft.ownershipMode === 'AUTO'
                ? `النسبة المتوقعة لهذا الشريك ${formatNumber.format(ownershipPreview)}%. عند الحفظ تُعاد موازنة نسب الشركاء النشطين وتُحفظ التغييرات بتاريخ وسبب.`
                : 'النسب اليدوية لا تتجاوز 100% إجمالًا، وتُحفظ تغييراتها في سجل تاريخي.'}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="نسبة المشاركة في الأرباح (%)">
                <input type="number" min="0" max="100" step="0.01"
                  value={partnerDraft.profitSharePercent ?? ownershipPreview}
                  onChange={(event) => setPartnerDraft({ ...partnerDraft, profitSharePercent: Number(event.target.value) })} />
              </Field>
              <Field label="تاريخ سريان التغيير" required>
                <input type="date" required value={partnerDraft.ownershipEffectiveDate || today()}
                  onChange={(event) => setPartnerDraft({
                    ...partnerDraft, ownershipEffectiveDate: event.target.value,
                    capitalEffectiveDate: event.target.value,
                  })} />
              </Field>
            </div>
            {!editingPartner && canTransact && (
              <>
                <Field label="حالة سداد رأس المال">
                  <select value={initialPaymentStatus} onChange={(event) => {
                    const status = event.target.value as InitialPaymentStatus;
                    const capitalAmount = Number(partnerDraft.capitalAmount || 0);
                    setInitialPaymentStatus(status);
                    setPartnerDraft({
                      ...partnerDraft,
                      initialPaidAmount: status === 'UNPAID'
                        ? 0
                        : status === 'FULL'
                          ? capitalAmount
                          : status === 'PARTIAL'
                            ? Math.max(0, Math.min(Math.round(capitalAmount * 50) / 100, capitalAmount - 0.01))
                            : 0,
                    });
                  }}>
                    <option value="UNPAID">لم يسدد شيئًا</option>
                    <option value="PARTIAL" disabled={Number(partnerDraft.capitalAmount) < 0.02}>سدد جزءًا من المبلغ</option>
                    <option value="FULL" disabled={Number(partnerDraft.capitalAmount) <= 0}>سدد كامل المبلغ</option>
                    <option value="CUSTOM" disabled={Number(partnerDraft.capitalAmount) <= 0}>تحديد مبلغ آخر</option>
                  </select>
                </Field>
                {(initialPaymentStatus === 'PARTIAL' || initialPaymentStatus === 'CUSTOM') && (
                  <Field label={initialPaymentStatus === 'PARTIAL' ? 'قيمة الجزء المسدد' : 'المبلغ المسدد'} required>
                    <input type="number" min="0.01"
                      max={initialPaymentStatus === 'PARTIAL'
                        ? Math.max(0, Number(partnerDraft.capitalAmount) - 0.01)
                        : partnerDraft.capitalAmount}
                      step="0.01" required
                      value={partnerDraft.initialPaidAmount || ''}
                      onChange={(event) => setPartnerDraft({
                        ...partnerDraft, initialPaidAmount: Number(event.target.value),
                      })} />
                  </Field>
                )}
                {Number(partnerDraft.initialPaidAmount || 0) > 0 && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="طريقة استلام المساهمة" required>
                      <select value={partnerDraft.initialPaymentType || 'CASH'}
                        onChange={(event) => setPartnerDraft({
                          ...partnerDraft, initialPaymentType: event.target.value as PartnerPaymentType,
                        })}>
                        <option value="CASH">نقدي</option><option value="BANK_TRANSFER">تحويل بنكي</option>
                        <option value="CARD">بطاقة</option><option value="CHEQUE">شيك</option>
                      </select>
                    </Field>
                    {partnerDraft.initialPaymentType === 'CASH' ? (
                      <Field label="الخزينة المستلمة" required>
                        <select required value={partnerDraft.initialRegisterId || ''} onChange={(event) => setPartnerDraft({ ...partnerDraft, initialRegisterId: event.target.value })}>
                          <option value="">اختر الخزينة</option>
                          {registers.map((register) => <option key={register.id} value={register.id}>{register.name}</option>)}
                        </select>
                      </Field>
                    ) : partnerDraft.initialPaymentType === 'BANK_TRANSFER' ? (
                      <Field label="الحساب البنكي المستلم" required>
                        <select required value={partnerDraft.initialBankAccountId || ''} onChange={(event) => setPartnerDraft({ ...partnerDraft, initialBankAccountId: event.target.value })}>
                          <option value="">اختر الحساب البنكي</option>
                          {bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                        </select>
                      </Field>
                    ) : <span className="self-center text-xs text-slate-500">سيُسجل المبلغ دون تعديل رصيد الخزينة.</span>}
                  </div>
                )}
                {Number(partnerDraft.initialPaidAmount || 0) > 0
                  && partnerDraft.initialPaymentType === 'BANK_TRANSFER' && bankAccounts.length === 0 && (
                    <p role="alert" className="text-xs font-bold text-rose-600">لا يوجد حساب بنكي نشط متاح للتحصيل.</p>
                  )}
              </>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="سبب التغيير" required>
                <input required value={partnerDraft.ownershipChangeReason || ''} onChange={(event) => setPartnerDraft({
                  ...partnerDraft, ownershipChangeReason: event.target.value,
                  profitShareChangeReason: event.target.value, capitalChangeReason: event.target.value,
                })} placeholder="مثال: إضافة شريك وتعديل نسب الملكية" />
              </Field>
              <Field label="ملاحظات"><input value={partnerDraft.notes || ''} onChange={(event) => setPartnerDraft({ ...partnerDraft, notes: event.target.value })} /></Field>
            </div>
            {editingPartner && (
              <label className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                <input type="checkbox" checked={partnerDraft.isActive !== false} onChange={(event) => setPartnerDraft({ ...partnerDraft, isActive: event.target.checked })} />
                شريك نشط
              </label>
            )}
            <p className="text-xs text-slate-500">
              مجموع نسب الشركاء النشطين حاليًا: {formatNumber.format(activeOwnership)}% (الحد الأقصى 100%).
              {' '}المدفوع من هذا الشريك: {formatMoney(editingPartner?.capitalContributions || 0)}.
              {editingPartner && Math.abs(editingPartner.netBalance) > 0.005 && ' لا يمكن إيقاف الشريك قبل تسوية رصيده.'}
            </p>
            <ModalActions onCancel={() => setModal(null)} saving={saving} submitLabel={editingPartner ? 'حفظ التعديلات' : 'إضافة الشريك'} />
          </form>
        </ModalShell>
      )}

      {modal === 'transaction' && selected && (
        <ModalShell title={TRANSACTION_LABELS[action]} onClose={() => setModal(null)}>
          <form onSubmit={saveTransaction} className="space-y-3">
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{selected.name}</p>
            {action === 'CAPITAL_CONTRIBUTION' && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                المتبقي غير المسدد من رأس المال المتفق عليه: {formatMoney(selected.remainingCapital)}
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="المبلغ" required><input type="number" min="0.01" max={action === 'CAPITAL_CONTRIBUTION' ? selected.remainingCapital : undefined} step="0.01" required value={transactionDraft.amount} onChange={(event) => setTransactionDraft({ ...transactionDraft, amount: event.target.value })} /></Field>
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
                {transactionDraft.paymentType === 'BANK_TRANSFER' && (
                  <Field label="الحساب البنكي" required>
                    <select required value={transactionDraft.bankAccountId} onChange={(event) => setTransactionDraft({ ...transactionDraft, bankAccountId: event.target.value })}>
                      <option value="">اختر الحساب البنكي</option>
                      {bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                    </select>
                  </Field>
                )}
              </div>
            )}
            {CASH_ACTIONS.includes(action) && transactionDraft.paymentType === 'CASH' && registers.length === 0 && (
              <p role="alert" className="text-xs font-bold text-rose-600">لا توجد خزينة نشطة متاحة في الفرع الحالي؛ اختر طريقة دفع أخرى أو فعّل خزينة.</p>
            )}
            {CASH_ACTIONS.includes(action) && transactionDraft.paymentType === 'BANK_TRANSFER' && bankAccounts.length === 0 && (
              <p role="alert" className="text-xs font-bold text-rose-600">لا يوجد حساب بنكي نشط متاح للتحصيل أو الصرف.</p>
            )}
            <Field label="رقم مرجعي (اختياري)"><input value={transactionDraft.referenceNumber} onChange={(event) => setTransactionDraft({ ...transactionDraft, referenceNumber: event.target.value })} placeholder="يُنشأ مرجع فريد تلقائيًا إذا تُرك فارغًا" /></Field>
            <Field label="البيان" required><textarea required rows={3} value={transactionDraft.description} onChange={(event) => setTransactionDraft({ ...transactionDraft, description: event.target.value })} placeholder="سبب العملية أو تفاصيلها" /></Field>
            <Field label="مرفقات إثبات الدفع (PDF / JPG / PNG، حتى 3 ملفات × 2MB)">
              <input type="file" multiple accept="application/pdf,image/jpeg,image/png"
                onChange={async (event) => {
                  const files = Array.from(event.target.files || []);
                  if (files.length > 3) {
                    toast.error('تعذر إرفاق الملفات', 'يمكن إرفاق 3 ملفات كحد أقصى.');
                    event.target.value = '';
                    return;
                  }
                  try {
                    if (files.some((file) => file.size > 2 * 1024 * 1024)) {
                      throw new Error('يجب ألا يتجاوز حجم كل مرفق 2 ميجابايت.');
                    }
                    setTransactionAttachments(await Promise.all(files.map(readPartnerAttachment)));
                  } catch (attachmentError) {
                    setTransactionAttachments([]);
                    toast.error('تعذر إرفاق الملفات', attachmentError instanceof Error ? attachmentError.message : String(attachmentError));
                  }
                }} />
            </Field>
            {transactionAttachments.length > 0 && (
              <p className="text-xs text-slate-500">{transactionAttachments.map((file) => file.name).join('، ')}</p>
            )}
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {action === 'PARTNER_LOAN' && 'تُسجل النقدية الداخلة من الشريك كالتزام على الشركة في حسابه الجاري.'}
              {action === 'LOAN_REPAYMENT' && 'يُخصم السداد من رصيد قروض الشريك المستحقة فقط.'}
              {action === 'PERSONAL_DRAWING' && 'تُسجل المسحوبات الشخصية على الحساب الجاري للشريك.'}
              {(action === 'ADJUSTMENT_INCREASE' || action === 'ADJUSTMENT_DECREASE') && 'تسوية رقابية لا تؤثر على الخزينة، وتُرحّل على حساب تسويات أرصدة الشركاء.'}
              {!['PARTNER_LOAN', 'LOAN_REPAYMENT', 'PERSONAL_DRAWING', 'ADJUSTMENT_INCREASE', 'ADJUSTMENT_DECREASE'].includes(action) && 'سيتم حفظ الحركة في سجل الشريك وترحيل قيد محاسبي متوازن.'}
            </p>
            <ModalActions onCancel={() => setModal(null)} saving={saving} submitLabel="تسجيل وترحيل" />
          </form>
        </ModalShell>
      )}

      {modal === 'reversal' && reversalTarget && (
        <ModalShell title="عكس حركة شريك" onClose={() => setModal(null)}>
          <form onSubmit={saveReversal} className="space-y-3">
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
              <p className="font-bold text-slate-800 dark:text-slate-100">{TRANSACTION_LABELS[reversalTarget.transactionType]} — {formatMoney(reversalTarget.amount)}</p>
              <p className="mt-1 text-xs text-slate-500">{formatDate(reversalTarget.transactionDate)} · {reversalTarget.description}</p>
            </div>
            <p className="text-xs text-amber-700 dark:text-amber-300">
              لن تُحذف الحركة الأصلية. سيُسجَّل قيد عكسي متوازن ويُربط بها في سجل التدقيق.
            </p>
            <Field label="سبب العكس" required><textarea required rows={3} value={reversalReason} onChange={(event) => setReversalReason(event.target.value)} placeholder="مثال: تسجيل مبلغ خاطئ أو حركة مكررة" /></Field>
            <ModalActions onCancel={() => setModal(null)} saving={saving} submitLabel="تأكيد العكس" />
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
            <Field label="ملاحظات الدفعة (اختياري)"><input value={profitNotes} onChange={(event) => setProfitNotes(event.target.value)} placeholder="مثال: أرباح الربع الأول" /></Field>
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

const SummaryCard: React.FC<{
  label: string;
  value: string;
  icon: typeof Users;
  tone?: 'sky' | 'emerald' | 'amber' | 'rose';
}> = ({ label, value, icon: Icon, tone = 'sky' }) => {
  const tones = {
    sky: 'bg-[var(--win-accent-soft)] text-[var(--win-accent-readable)]',
    emerald: 'bg-[var(--win-success-soft)] text-[var(--win-success-text)]',
    amber: 'bg-[var(--win-warning-soft)] text-[var(--win-warning-text)]',
    rose: 'bg-[var(--win-danger-soft)] text-[var(--win-danger-text)]',
  };
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-[var(--win-radius)] border border-[var(--win-border)] bg-[var(--win-surface)] p-3">
      <span className={`rounded-[var(--ui-radius-sm)] p-1.5 ${tones[tone]}`}><Icon className="h-4 w-4" /></span>
      <div className="min-w-0"><p className="truncate text-[var(--ui-font-xs)] font-bold text-[var(--win-text-muted)]">{label}</p><p className="mt-0.5 truncate text-[var(--ui-font-md)] font-extrabold text-[var(--win-text)]">{value}</p></div>
    </div>
  );
};

const ModalShell: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <Modal open onClose={onClose} title={title} size="lg">
    {children}
  </Modal>
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
