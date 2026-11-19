import React from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import type { BusinessPartner, PartnerOverview } from '../../../services/domains/customers/PartnerService';
import { formatMoney, formatNumber } from './partnersModel';

export const PartnerOverviewTab: React.FC<{
  partners: BusinessPartner[];
  overview: PartnerOverview;
  activeOwnership: number;
  activeProfitShare: number;
  outstandingLoans: number;
  selectPartner: (partnerId: string) => void;
}> = ({ partners, overview, activeOwnership, activeProfitShare, outstandingLoans, selectPartner }) => {
  return (
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
                <DataTable
                                ariaLabel="الشركاء"
                                rows={[...partners, { __total: true } as any]}
                                rowKey={(partner: any) => partner.__total ? '__total__' : partner.id}
                                rowClassName={(partner: any) => partner.__total ? 'font-extrabold text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-slate-800' : 'cursor-pointer text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/50'}
                                minWidth={1320}
                                dense
                                columns={[
                                  { key: 'name', header: 'الشريك', render: (partner: any) => partner.__total ? 'الإجمالي' : <button type="button" onClick={() => selectPartner(partner.id)} className="font-bold text-start">{partner.name}</button> },
                                  { key: 'ownership', header: 'الملكية', render: (partner: any) => partner.__total ? `${formatNumber.format(activeOwnership)}%` : `${formatNumber.format(partner.ownershipPercent)}%` },
                                  { key: 'profit', header: 'الأرباح %', render: (partner: any) => partner.__total ? '—' : `${formatNumber.format(partner.profitSharePercent)}%` },
                                  { key: 'capital', header: 'رأس المال', render: (partner: any) => partner.__total ? formatMoney(overview.totalCapitalAgreed) : formatMoney(partner.capitalAmount) },
                                  { key: 'paid', header: 'المسدد', render: (partner: any) => partner.__total ? '—' : formatMoney(partner.capitalPaid) },
                                  { key: 'remaining', header: 'المتبقي', render: (partner: any) => partner.__total ? '—' : formatMoney(partner.remainingCapital) },
                                  { key: 'contrib', header: 'المساهمات', render: (partner: any) => partner.__total ? formatMoney(overview.totalContributions) : formatMoney(partner.capitalContributions) },
                                  { key: 'withdrawals', header: 'المسحوبات', render: (partner: any) => partner.__total ? formatMoney(overview.totalWithdrawals) : formatMoney(partner.withdrawals) },
                                  { key: 'loans', header: 'القروض', render: (partner: any) => partner.__total ? formatMoney(outstandingLoans) : formatMoney(partner.loansReceived - partner.loansRepaid) },
                                  { key: 'drawings', header: 'مسحوبات شخصية', render: (partner: any) => partner.__total ? formatMoney(overview.totalDrawings) : formatMoney(partner.personalDrawings) },
                                  { key: 'due', header: 'الأرباح المستحقة', render: (partner: any) => partner.__total ? formatMoney(overview.totalProfitsDue) : formatMoney(partner.profitsDue) },
                                  { key: 'distributed', header: 'المصروفة', render: (partner: any) => partner.__total ? formatMoney(overview.totalProfitsDistributed) : formatMoney(partner.profitsDistributed) },
                                  { key: 'adjust', header: 'التسويات', render: (partner: any) => partner.__total ? formatMoney(overview.totalAdjustments) : formatMoney(partner.adjustments) },
                                  { key: 'net', header: 'صافي الرصيد', render: (partner: any) => partner.__total ? formatMoney(overview.totalNetBalance) : <span className={partner.netBalance < 0 ? 'font-extrabold text-rose-600' : 'font-extrabold'}>{formatMoney(partner.netBalance)}</span> },
                                  { key: 'status', header: 'الحالة', render: (partner: any) => partner.__total ? '—' : (partner.isActive ? 'نشط' : 'غير نشط') },
                                ]}
                                emptyTitle="لا توجد بيانات شركاء."
                              />

              </div>
            </section>
  );
};
