import { FileBarChart2 } from 'lucide-react';
import type { FC } from 'react';
import { DataTable } from '../../../../components/ui/DataTable';
import type { PeriodCloseReport } from '../../../../services/domains/finance/FinancePeriodCloseService';
import { formatClosedAt, formatDate, formatMoney } from './utils';

interface ReportsTabProps {
  report: PeriodCloseReport | null;
}

/** Immutable period close report snapshot (P&L, balance sheet, cash flow, aging). */
export const ReportsTab: FC<ReportsTabProps> = ({ report }) => (
  <div className="space-y-4">
    {!report ? (
      <p className="text-sm text-muted">لا توجد نسخة تقارير معتمدة لهذه الفترة بعد. تُحفظ النسخة لحظة الإقفال.</p>
    ) : (
      <>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <FileBarChart2 className="h-4 w-4" />
          نسخة محفوظة بتاريخ {formatClosedAt(report.createdAt)} — لا تتغير بعد الإقفال.
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-line p-4"><p className="text-xs text-muted">الإيرادات</p><p className="mt-1 text-lg font-black text-success">{formatMoney(report.payload.profitAndLoss.revenue)}</p></div>
          <div className="rounded-xl border border-line p-4"><p className="text-xs text-muted">المصروفات</p><p className="mt-1 text-lg font-black text-danger">{formatMoney(report.payload.profitAndLoss.expenses)}</p></div>
          <div className="rounded-xl border border-line p-4"><p className="text-xs text-muted">صافي الربح</p><p className={`mt-1 text-lg font-black ${report.payload.profitAndLoss.netProfit >= 0 ? 'text-success' : 'text-danger'}`}>{formatMoney(report.payload.profitAndLoss.netProfit)}</p></div>
          <div className="rounded-xl border border-line p-4"><p className="text-xs text-muted">تقييم المخزون</p><p className="mt-1 text-lg font-black text-ink">{formatMoney(report.payload.inventoryValuation)}</p></div>
        </div>
        {report.payload.partySubledgerBalances && (
          <div className="rounded-xl border border-line p-4">
            <h3 className="font-bold text-ink">لقطة أرصدة العملاء والموردين</h3>
            <p className="mt-1 text-xs text-muted">تغطية السجل تبدأ من {report.payload.subledgerCoverageStartDate ? formatDate(report.payload.subledgerCoverageStartDate) : 'غير محدد'}.</p>
            <div className="mt-3 max-h-72 overflow-y-auto">
              <DataTable
                ariaLabel="أرصدة الأطراف"
                rows={report.payload.partySubledgerBalances}
                rowKey={(row) => `${row.partyType}-${row.partyId}`}
                dense
                tableClassName="text-xs"
                columns={[
                  { key: 'type', header: 'النوع', render: (row) => row.partyType === 'CUSTOMER' ? 'عميل' : 'مورد' },
                  { key: 'party', header: 'معرّف الطرف', render: (row) => row.partyId },
                  { key: 'account', header: 'حساب الرقابة', render: (row) => row.controlAccountCode },
                  { key: 'balance', header: 'الرصيد', render: (row) => formatMoney(row.balance) },
                ]}
              />
            </div>
          </div>
        )}
        {!!report.payload.legacyManualSubledgerMatches?.length && (
          <div className="rounded-xl border border-warning-border bg-warning-soft/50 p-4">
            <h3 className="font-bold text-warning">مطابقات تاريخية يدوية</h3>
            <div className="mt-2 space-y-2">
              {report.payload.legacyManualSubledgerMatches.map((match) => (
                <div key={match.partyType} className="rounded-lg border border-warning-border bg-surface p-3 text-xs">
                  <p className="font-bold">{match.partyType === 'CUSTOMER' ? 'العملاء' : 'الموردون'} · {match.evidenceReference}</p>
                  <p className="mt-1 text-ink-secondary">دفتر الأطراف {formatMoney(match.verifiedSubledgerBalance)} / الأستاذ العام {formatMoney(match.controlBalance)} · {match.createdByName} · {formatClosedAt(match.createdAt)}</p>
                  {match.notes && <p className="mt-1 text-ink-secondary">{match.notes}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-line p-4">
            <h3 className="font-bold text-ink">ميزان المراجعة</h3>
            <div className="mt-2 max-h-72 overflow-y-auto">
              <DataTable
                ariaLabel="ميزان المراجعة"
                rows={report.payload.trialBalance}
                rowKey={(row) => row.code}
                dense
                tableClassName="text-xs"
                columns={[
                  { key: 'account', header: 'الحساب', render: (row) => `${row.code} - ${row.name}` },
                  { key: 'debit', header: 'مدين', render: (row) => formatMoney(row.debit) },
                  { key: 'credit', header: 'دائن', render: (row) => formatMoney(row.credit) },
                  { key: 'balance', header: 'الرصيد', render: (row) => formatMoney(row.balance) },
                ]}
              />
            </div>
          </div>
          <div className="space-y-3">
            <div className="rounded-xl border border-line p-4">
              <h3 className="font-bold text-ink">الميزانية العمومية</h3>
              <div className="mt-2 space-y-1 text-sm">
                <p className="flex justify-between"><span>الأصول</span><span className="font-bold">{formatMoney(report.payload.balanceSheet.assets)}</span></p>
                <p className="flex justify-between"><span>الالتزامات</span><span className="font-bold">{formatMoney(report.payload.balanceSheet.liabilities)}</span></p>
                <p className="flex justify-between"><span>حقوق الملكية</span><span className="font-bold">{formatMoney(report.payload.balanceSheet.equity)}</span></p>
                <p className={`text-xs font-bold ${report.payload.balanceSheet.balanced ? 'text-success' : 'text-danger'}`}>{report.payload.balanceSheet.balanced ? 'متزنة' : 'غير متزنة'}</p>
              </div>
            </div>
            <div className="rounded-xl border border-line p-4">
              <h3 className="font-bold text-ink">التدفقات النقدية</h3>
              <div className="mt-2 space-y-1 text-sm">
                <p className="flex justify-between"><span>افتتاحي</span><span>{formatMoney(report.payload.cashFlow.opening)}</span></p>
                <p className="flex justify-between"><span>داخل</span><span className="text-success">{formatMoney(report.payload.cashFlow.inflow)}</span></p>
                <p className="flex justify-between"><span>خارج</span><span className="text-danger">{formatMoney(report.payload.cashFlow.outflow)}</span></p>
                <p className="flex justify-between font-bold"><span>ختامي</span><span>{formatMoney(report.payload.cashFlow.closing)}</span></p>
              </div>
            </div>
            <div className="rounded-xl border border-line p-4">
              <h3 className="font-bold text-ink">أعمار ديون العملاء</h3>
              <div className="mt-2 space-y-1 text-sm">
                {report.payload.receivablesAging.length === 0 && <p className="text-xs text-muted">لا توجد أرصدة مستحقة.</p>}
                {report.payload.receivablesAging.map((row) => <p key={row.bucket} className="flex justify-between"><span>{row.bucket}</span><span>{formatMoney(row.amount)}</span></p>)}
              </div>
            </div>
          </div>
        </div>
      </>
    )}
  </div>
);
