import React from 'react';
import { DataTable } from '../../ui/DataTable';
import type { LedgerLine } from '../../../services/domains/reports/FinancialStatementsService';
import { formatCurrency } from './format';

type LedgerAccount = { id: string; code: string; name: string; type: string };
type GeneralLedger = { opening: number; lines: LedgerLine[]; closing: number };

export function GeneralLedgerPanel({ accounts, accountId, ledger, onAccountChange }: {
  accounts: LedgerAccount[];
  accountId: string;
  ledger: GeneralLedger | null;
  onAccountChange: (accountId: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <select value={accountId} aria-label="الحساب" onChange={(event) => onAccountChange(event.target.value)} className="flex-1 px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold">
          <option value="">— اختر الحساب —</option>
          {accounts.map((account) => <option key={account.id} value={account.id}>{account.code} — {account.name}</option>)}
        </select>
      </div>
      {ledger && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-xs text-slate-500 font-bold">الرصيد الافتتاحي</p><p className="text-lg font-black font-mono">{formatCurrency(ledger.opening)}</p></div>
            <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-xs text-slate-500 font-bold">عدد الحركات</p><p className="text-lg font-black font-mono">{ledger.lines.length}</p></div>
            <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-xs text-slate-500 font-bold">الرصيد الختامي</p><p className="text-lg font-black font-mono">{formatCurrency(ledger.closing)}</p></div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <DataTable
              ariaLabel="الأستاذ العام"
              rows={ledger.lines.map((line, index) => ({ ...line, __index: index }))}
              rowKey={(line: any) => `${line.entryNumber}-${line.__index}`}
              tableClassName="text-sm"
              columns={[
                { key: 'date', header: 'التاريخ', render: (line: any) => <span className="text-slate-500">{line.date}</span> },
                { key: 'entry', header: 'رقم القيد', render: (line: any) => <span className="font-mono font-bold text-teal-700">{line.entryNumber}</span> },
                { key: 'ref', header: 'المصدر', render: (line: any) => <span className="text-xs text-slate-500">{line.referenceType || '—'}</span> },
                { key: 'desc', header: 'البيان', render: (line: any) => line.description },
                { key: 'debit', header: 'مدين', render: (line: any) => <span className="font-mono">{formatCurrency(line.debit)}</span> },
                { key: 'credit', header: 'دائن', render: (line: any) => <span className="font-mono">{formatCurrency(line.credit)}</span> },
                { key: 'balance', header: 'الرصيد', render: (line: any) => <span className="font-mono font-bold">{formatCurrency(line.balance)}</span> },
              ]}
              emptyTitle="لا توجد حركات على هذا الحساب في الفترة"
            />
          </div>
        </>
      )}
    </div>
  );
}
