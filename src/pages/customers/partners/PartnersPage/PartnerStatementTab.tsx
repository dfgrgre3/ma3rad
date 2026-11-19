import React from 'react';
import {
  ArrowDownLeft, ArrowUpRight, Banknote, Building2, ClipboardList, Pencil, Printer, RotateCcw, TrendingUp, Wallet,
} from 'lucide-react';
import { DataTable } from '../../../components/ui/DataTable';
import type {
  BusinessPartner, PartnerCapitalHistory, PartnerStatement,
  PartnerTransaction, PartnerTransactionAction, PartnerTransactionType,
} from '../../../services/domains/customers/PartnerService';
import {
  ACTION_OPTIONS, FILTER_TYPES, TRANSACTION_LABELS,
  formatDate, formatMoney, formatNumber, paymentTypeLabel,
  type StatementFilters,
} from './partnersModel';
import { SummaryCard } from './PartnerUi';

export const PartnerStatementTab: React.FC<{
  selected: BusinessPartner | null;
  capitalHistory: PartnerCapitalHistory[];
  statement: PartnerStatement | null;
  statementFilters: StatementFilters;
  setStatementFilters: React.Dispatch<React.SetStateAction<StatementFilters>>;
  canManage: boolean;
  canTransact: boolean;
  canAdjust: boolean;
  canReverse: boolean;
  canPrint: boolean;
  openEditPartner: (partner: BusinessPartner) => void;
  openTransaction: (action: PartnerTransactionAction) => void;
  openReversal: (transaction: PartnerTransaction) => void;
  printStatement: () => void;
}> = ({
  selected, capitalHistory, statement, statementFilters, setStatementFilters,
  canManage, canTransact, canAdjust, canReverse, canPrint,
  openEditPartner, openTransaction, openReversal, printStatement,
}) => {
  return (
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
                        <DataTable
                                                  ariaLabel="تاريخ رأس المال"
                                                  rows={capitalHistory}
                                                  rowKey={(entry) => entry.id}
                                                  minWidth={700}
                                                  dense
                                                  columns={[
                                                    { key: 'date', header: 'التاريخ', render: (entry) => formatDate(entry.effectiveDate) },
                                                    { key: 'type', header: 'النوع', render: (entry) => entry.type === 'OWNERSHIP' ? 'ملكية' : entry.type === 'PROFIT_SHARE' ? 'توزيع أرباح' : 'رأس المال' },
                                                    { key: 'from', header: 'من', render: (entry) => entry.type === 'CAPITAL' ? formatMoney(entry.oldValue) : `${formatNumber.format(entry.oldValue)}%` },
                                                    { key: 'to', header: 'إلى', render: (entry) => entry.type === 'CAPITAL' ? formatMoney(entry.newValue) : `${formatNumber.format(entry.newValue)}%` },
                                                    { key: 'reason', header: 'السبب', render: (entry) => entry.reason },
                                                    { key: 'by', header: 'سجله', render: (entry) => entry.createdByName },
                                                  ]}
                                                />

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
                      <DataTable
                                              ariaLabel="كشف حساب الشريك"
                                              rows={[
                                                ...(statement && statement.openingBalance !== 0 ? [{ __kind: 'opening', __id: 'opening' } as any] : []),
                                                ...(statement?.transactions || []).map((t: any) => ({ ...t, __kind: 'txn' })),
                                                ...(statement ? [{ __kind: 'closing', __id: 'closing' } as any] : []),
                                              ]}
                                              rowKey={(row: any) => row.__kind === 'opening' ? 'opening' : row.__kind === 'closing' ? 'closing' : row.id}
                                              rowClassName={(row: any) => row.__kind === 'opening' ? 'bg-slate-50/70 text-slate-600 dark:bg-slate-800/40 dark:text-slate-300' : row.__kind === 'closing' ? 'font-extrabold text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-slate-800' : `text-slate-700 dark:text-slate-300 ${row.transactionType === 'REVERSAL' ? 'bg-amber-50/40 dark:bg-amber-950/10' : ''}`}
                                              minWidth={1060}
                                              dense
                                              columns={[
                                                {
                                                  key: 'date', header: 'التاريخ',
                                                  render: (row: any) => row.__kind === 'opening' ? (statement?.from ? formatDate(statement.from) : '—')
                                                    : row.__kind === 'closing' ? ''
                                                    : <span className="whitespace-nowrap">{formatDate(row.transactionDate)}</span>,
                                                },
                                                {
                                                  key: 'desc', header: 'البيان',
                                                  render: (row: any) => {
                                                    if (row.__kind === 'opening') return <span className="font-bold col-span-6 inline-block">رصيد افتتاحي</span>;
                                                    if (row.__kind === 'closing') return <span className="font-bold">الرصيد الختامي للفترة</span>;
                                                    return (
                                                      <span className="block max-w-56">
                                                        {row.description}
                                                        {row.referenceNumber && <span className="mt-0.5 block font-mono text-[10px] text-slate-400">مرجع: {row.referenceNumber}</span>}
                                                        {row.attachments.map((attachment: any, index: number) => (
                                                          <a key={`${row.id}-${index}`} href={attachment.dataUrl} target="_blank" rel="noreferrer"
                                                            className="mt-1 block text-[10px] font-bold text-sky-700 hover:underline dark:text-sky-300">
                                                            إثبات: {attachment.name}
                                                          </a>
                                                        ))}
                                                        {row.isReversed && <span className="mt-0.5 block text-[10px] font-bold text-amber-600">تم عكسها لاحقًا</span>}
                                                      </span>
                                                    );
                                                  },
                                                },
                                                {
                                                  key: 'type', header: 'نوع العملية',
                                                  render: (row: any) => row.__kind !== 'txn' ? '—' : (
                                                    <span>
                                                      {TRANSACTION_LABELS[row.transactionType as PartnerTransactionType]}
                                                      {row.reversalOfType && <span className="mt-0.5 block text-[10px] text-slate-400">لـ: {TRANSACTION_LABELS[row.reversalOfType as PartnerTransactionType]}</span>}
                                                    </span>
                                                  ),
                                                },
                                                { key: 'branch', header: 'الفرع', render: (row: any) => row.__kind === 'txn' ? row.branchName : '—' },
                                                { key: 'payment', header: 'طريقة الدفع', render: (row: any) => row.__kind === 'txn' ? `${paymentTypeLabel(row.paymentType)}${row.registerName ? ` · ${row.registerName}` : row.bankAccountName ? ` · ${row.bankAccountName}` : ''}` : '—' },
                                                { key: 'debit', header: 'مدين', render: (row: any) => row.__kind === 'txn' && row.balanceEffect < 0 ? formatMoney(Math.abs(row.balanceEffect)) : '—' },
                                                { key: 'credit', header: 'دائن', render: (row: any) => row.__kind === 'txn' && row.balanceEffect > 0 ? formatMoney(row.balanceEffect) : '—' },
                                                {
                                                  key: 'balance', header: 'الرصيد',
                                                  render: (row: any) => {
                                                    if (row.__kind === 'opening') return <span className="font-extrabold">{formatMoney(statement?.openingBalance || 0)}</span>;
                                                    if (row.__kind === 'closing') return <span className="font-extrabold">{formatMoney(statement?.closingBalance || 0)}</span>;
                                                    return <span className={`font-extrabold ${row.runningBalance < 0 ? 'text-rose-600' : ''}`}>{formatMoney(row.runningBalance)}</span>;
                                                  },
                                                },
                                                { key: 'journal', header: 'رقم القيد', render: (row: any) => row.__kind === 'txn' ? <span className="whitespace-nowrap font-mono">{row.journalEntryNumber}</span> : '—' },
                                                { key: 'by', header: 'سجلها', render: (row: any) => row.__kind === 'txn' ? row.createdByName : '—' },
                                                {
                                                  key: 'action', header: 'إجراء',
                                                  render: (row: any) => {
                                                    if (row.__kind !== 'txn') return '—';
                                                    const canReverseRow = canReverse
                                                      && row.transactionType !== 'REVERSAL'
                                                      && !row.reversalOfId
                                                      && !row.isReversed;
                                                    return canReverseRow ? (
                                                      <button type="button" onClick={() => openReversal(row)} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1 text-[11px] font-bold text-rose-600 dark:border-rose-900 dark:text-rose-300 partner-print-hidden">
                                                        <RotateCcw className="h-3 w-3" /> عكس
                                                      </button>
                                                    ) : '—';
                                                  },
                                                },
                                              ]}
                                              emptyTitle="لا توجد حركات مطابقة للفلاتر الحالية."
                                            />

                    </div>
                  </section>
                </section>
              )}
            </>
  );
};
