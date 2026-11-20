import React from 'react';
import { DataTable } from '../../../../components/ui/DataTable';
import { formatMoney, formatNumber } from '../PartnersPage/partnersModel';
import type { PartnersPageVm } from '../../../../hooks/pages/customers/partners/usePartnersPage';

export const PartnersOverviewTab: React.FC<{ vm: PartnersPageVm }> = ({ vm }) => {
  const { partners, overview, selectPartner, activeOwnership, activeProfitShare, outstandingLoans } = vm;
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface ">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 ">
        <div>
          <h3 className="font-extrabold text-ink ">أرصدة جميع الشركاء</h3>
          <p className="text-xs text-muted">
            الملكية النشطة: {formatNumber.format(activeOwnership)}% · مشاركة الأرباح النشطة: {formatNumber.format(activeProfitShare)}%.
          </p>
        </div>
        {(Math.abs(activeOwnership - 100) > 0.005 || Math.abs(activeProfitShare - 100) > 0.005) && (
          <span className="rounded-lg bg-warning-soft px-2 py-1 text-xs font-bold text-warning dark:bg-warning/40 ">
            راجع مجموع نسب الملكية ومشاركة الأرباح
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <DataTable
          ariaLabel="الشركاء"
          rows={[...partners, { __total: true } as any]}
          rowKey={(partner: any) => partner.__total ? '__total__' : partner.id}
          rowClassName={(partner: any) => partner.__total ? 'font-extrabold text-ink bg-surface-muted ' : 'cursor-pointer text-ink hover:bg-surface-muted dark:hover:bg-primary/50'}
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
            { key: 'net', header: 'صافي الرصيد', render: (partner: any) => partner.__total ? formatMoney(overview.totalNetBalance) : <span className={partner.netBalance < 0 ? 'font-extrabold text-danger' : 'font-extrabold'}>{formatMoney(partner.netBalance)}</span> },
            { key: 'status', header: 'الحالة', render: (partner: any) => partner.__total ? '—' : (partner.isActive ? 'نشط' : 'غير نشط') },
          ]}
          emptyTitle="لا توجد بيانات شركاء."
        />

      </div>
    </section>
  );
};
