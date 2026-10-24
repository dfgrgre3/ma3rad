import React from 'react';
import type { LedgerLine } from '../../../services/FinancialStatementsService';
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
            <table className="w-full text-sm text-right">
              <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                <tr><th className="px-4 py-3">التاريخ</th><th className="px-4 py-3">رقم القيد</th><th className="px-4 py-3">البيان</th><th className="px-4 py-3">مدين</th><th className="px-4 py-3">دائن</th><th className="px-4 py-3">الرصيد</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ledger.lines.map((line, index) => (
                  <tr key={`${line.entryNumber}-${index}`}>
                    <td className="px-4 py-2.5 text-slate-500">{line.date}</td>
                    <td className="px-4 py-2.5 font-mono font-bold text-teal-700">{line.entryNumber}</td>
                    <td className="px-4 py-2.5">{line.description}</td>
                    <td className="px-4 py-2.5 font-mono">{formatCurrency(line.debit)}</td>
                    <td className="px-4 py-2.5 font-mono">{formatCurrency(line.credit)}</td>
                    <td className="px-4 py-2.5 font-mono font-bold">{formatCurrency(line.balance)}</td>
                  </tr>
                ))}
                {ledger.lines.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-slate-400">لا توجد حركات على هذا الحساب في الفترة</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
