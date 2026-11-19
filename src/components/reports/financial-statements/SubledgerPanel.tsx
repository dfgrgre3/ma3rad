import React from 'react';
import { DataTable } from '../../ui/DataTable';
import type { PartyOption, PartyStatement } from '../../../services/domains/reports/FinancialStatementsService';
import { formatCurrency } from './format';

const sourceLabels: Record<string, string> = {
  SALES_INVOICE: 'فاتورة بيع',
  SALES_VOID: 'إلغاء فاتورة بيع',
  SALES_RETURN: 'مرتجع بيع',
  PURCHASE_INVOICE: 'فاتورة شراء',
  PURCHASE_VOID: 'إلغاء فاتورة شراء',
  PURCHASE_RETURN: 'مرتجع شراء',
  CUSTOMER_PAYMENT: 'سند تحصيل',
  CUSTOMER_PAYMENT_GROUP: 'سند تحصيل',
  CUSTOMER_PAYMENT_VOID: 'إلغاء سند تحصيل',
  SUPPLIER_PAYMENT: 'سند دفع مورد',
  SUPPLIER_PAYMENT_VOID: 'إلغاء سند دفع مورد',
  CHEQUE_CLEARANCE: 'تحصيل شيك',
  CHEQUE_BOUNCE: 'شيك مرتجع',
};

export function SubledgerPanel({
  partyType,
  parties,
  partyId,
  statement,
  onTypeChange,
  onPartyChange,
}: {
  partyType: 'CUSTOMER' | 'SUPPLIER';
  parties: PartyOption[];
  partyId: string;
  statement: PartyStatement | null;
  onTypeChange: (type: 'CUSTOMER' | 'SUPPLIER') => void;
  onPartyChange: (partyId: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <select
          value={partyType}
          aria-label="نوع الأستاذ المساعد"
          onChange={(event) => onTypeChange(event.target.value === 'SUPPLIER' ? 'SUPPLIER' : 'CUSTOMER')}
          className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold"
        >
          <option value="CUSTOMER">أستاذ العملاء</option>
          <option value="SUPPLIER">أستاذ الموردين</option>
        </select>
        <select
          value={partyId}
          aria-label="الطرف"
          onChange={(event) => onPartyChange(event.target.value)}
          className="flex-1 px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold"
        >
          <option value="">— اختر الطرف —</option>
          {parties.map((party) => (
            <option key={party.id} value={party.id}>
              {party.name} — {formatCurrency(party.balance)}
            </option>
          ))}
        </select>
      </div>

      {statement && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500 font-bold">الرصيد الافتتاحي</p>
              <p className="text-lg font-black font-mono">{formatCurrency(statement.opening)}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500 font-bold">الرصيد الختامي (الأستاذ المساعد)</p>
              <p className="text-lg font-black font-mono">{formatCurrency(statement.closing)}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500 font-bold">رصيد بطاقة الطرف</p>
              <p className="text-lg font-black font-mono">{formatCurrency(statement.masterBalance)}</p>
              <p className={`text-[11px] font-bold ${statement.masterStatus === 'MATCH' ? 'text-emerald-600' : statement.masterStatus === 'DIFFERENCE' ? 'text-rose-600' : 'text-slate-400'}`}>
                {statement.masterStatus === 'MATCH' ? 'متطابق' : statement.masterStatus === 'DIFFERENCE' ? `فرق ${formatCurrency(statement.masterDifference)}` : 'غير قابل للمقارنة تاريخيًا'}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500 font-bold">رصيد حساب المراقبة {statement.controlAccountCode}</p>
              <p className="text-lg font-black font-mono">{formatCurrency(statement.controlBalance)}</p>
              <p className="text-[11px] font-bold text-slate-400">الإجمالي على مستوى الشركة</p>
            </div>
          </div>

          {statement.coverageStartDate && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">
              يبدأ سجل حركات الأستاذ المساعد من {statement.coverageStartDate}؛ الأرصدة السابقة ممثلة في الرصيد الافتتاحي المسجل.
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <DataTable
              ariaLabel="كشف حساب الطرف"
              rows={[
                { __opening: true, date: statement.from },
                ...statement.lines.map((line: any, index: number) => ({ ...line, __index: index })),
              ]}
              rowKey={(row: any) => row.__opening ? '__opening__' : `${row.entryNumber}-${row.__index}`}
              rowClassName={(row: any) => (row as any).__opening ? 'bg-slate-50/60' : ''}
              tableClassName="text-sm"
              columns={[
                { key: 'date', header: 'التاريخ', render: (row: any) => <span className="text-slate-500">{row.date}</span> },
                {
                  key: 'entry', header: 'رقم القيد',
                  render: (row: any) => row.__opening ? '—' : <span className="font-mono font-bold text-teal-700">{row.entryNumber}</span>,
                },
                {
                  key: 'ref', header: 'المصدر',
                  render: (row: any) => row.__opening ? '—' : <span className="text-xs text-slate-500">{sourceLabels[row.referenceType] || row.referenceType}</span>,
                },
                {
                  key: 'desc', header: 'البيان',
                  render: (row: any) => row.__opening
                    ? <span className="font-bold">الرصيد الافتتاحي</span>
                    : row.description,
                },
                {
                  key: 'debit', header: 'مدين',
                  render: (row: any) => row.__opening ? null : <span className="font-mono">{row.debit ? formatCurrency(row.debit) : '—'}</span>,
                },
                {
                  key: 'credit', header: 'دائن',
                  render: (row: any) => row.__opening ? null : <span className="font-mono">{row.credit ? formatCurrency(row.credit) : '—'}</span>,
                },
                {
                  key: 'balance', header: 'الرصيد',
                  render: (row: any) => <span className="font-mono font-bold">{formatCurrency(row.__opening ? statement.opening : row.balance)}</span>,
                },
              ]}
              footer={
                <tr className="bg-slate-50 border-t-2 border-slate-200 font-black">
                  <td colSpan={6} className="px-4 py-3 text-xs text-slate-600">الرصيد الختامي</td>
                  <td className="px-4 py-3 font-mono">{formatCurrency(statement.closing)}</td>
                </tr>
              }
              emptyTitle="لا توجد حركات على هذا الطرف في الفترة"
            />
            {statement.lines.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-400">لا توجد حركات على هذا الطرف في الفترة</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
