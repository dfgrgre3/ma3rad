import React, { useMemo, useState } from 'react';
import { Banknote, Landmark, Smartphone, X } from 'lucide-react';
import type {
  PayrollPayOptions,
  PayrollPaymentInstruction,
  PayrollPaymentMethod,
  PayrollRun,
} from '../../../services/domains/hr/EmployeeService';

interface PayoutOptions {
  bankAccounts: Array<{ id: string; accountName: string; bankName: string; accountNumber: string }>;
  registers: Array<{ id: string; name: string; currentBalance: number }>;
}

interface RowState {
  method: PayrollPaymentMethod;
  bankAccountId: string;
  registerId: string;
  referenceNumber: string;
  proofReference: string;
  walletProvider: string;
  walletNumber: string;
}

const METHOD_LABELS: Record<PayrollPaymentMethod, string> = {
  CASH: 'نقدي',
  BANK_TRANSFER: 'تحويل بنكي',
  WALLET: 'محفظة إلكترونية',
};

const METHOD_ICONS: Record<PayrollPaymentMethod, React.ComponentType<{ className?: string }>> = {
  CASH: Banknote,
  BANK_TRANSFER: Landmark,
  WALLET: Smartphone,
};

export const PayrollPayoutModal: React.FC<{
  run: PayrollRun;
  options: PayoutOptions;
  saving: boolean;
  onClose: () => void;
  onSubmit: (payout: PayrollPayOptions) => void;
}> = ({ run, options, saving, onClose, onSubmit }) => {
  const items = useMemo(() => run.items.filter((item) => item.netAmount > 0), [run.items]);
  const defaultRegisterId = options.registers[0]?.id || '';
  const [batchReference, setBatchReference] = useState('');
  const [rows, setRows] = useState<Record<string, RowState>>(() => Object.fromEntries(
    items.map((item) => {
      const method = item.paymentMethod || 'CASH';
      const matchingBank = options.bankAccounts.find((account) =>
        item.details.bankAccountNumber
        && account.accountNumber.replace(/[\s-]/g, '').toUpperCase()
          === item.details.bankAccountNumber.replace(/[\s-]/g, '').toUpperCase()
      );
      return [item.id, {
        method,
        bankAccountId: matchingBank?.id || options.bankAccounts[0]?.id || '',
        registerId: defaultRegisterId,
        referenceNumber: '',
        proofReference: '',
        walletProvider: item.details.walletProvider || '',
        walletNumber: item.details.walletNumber || '',
      }];
    })
  ));

  const update = (itemId: string, patch: Partial<RowState>) => {
    setRows((current) => ({ ...current, [itemId]: { ...current[itemId], ...patch } }));
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const payments: Record<string, PayrollPaymentInstruction> = {};
    for (const item of items) {
      const row = rows[item.id];
      payments[item.employeeId] = {
        method: row.method,
        registerId: row.method === 'CASH' ? row.registerId || undefined : undefined,
        bankAccountId: row.method === 'BANK_TRANSFER' ? row.bankAccountId || undefined : undefined,
        walletProvider: row.method === 'WALLET' ? row.walletProvider.trim() || undefined : undefined,
        walletNumber: row.method === 'WALLET' ? row.walletNumber.trim() || undefined : undefined,
        referenceNumber: row.referenceNumber.trim() || batchReference.trim() || undefined,
        proofReference: row.proofReference.trim() || undefined,
      };
    }
    onSubmit({ batchReference: batchReference.trim() || undefined, payments });
  };

  const needsBankAccount = options.bankAccounts.length === 0
    && items.some((item) => rows[item.id]?.method === 'BANK_TRANSFER');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" dir="rtl">
      <form onSubmit={submit} className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-sm font-black text-slate-900">صرف دورة رواتب {run.period}</h2>
            <p className="mt-1 text-[11px] text-slate-500">حدد وسيلة الصرف لكل موظف وسجّل مرجع العملية وإثبات التحويل.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
          <label className="text-xs font-bold text-slate-600">
            مرجع الدفعة المجمّع (يُستخدم افتراضياً لكل سطر)
            <input
              value={batchReference}
              onChange={(event) => setBatchReference(event.target.value)}
              placeholder="مثال: PAY-2026-0101 أو رقم حوالة البنك"
              className="mr-2 w-72 rounded-lg border border-slate-200 bg-white px-2 py-1.5 font-mono text-xs"
            />
          </label>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full min-w-[860px] text-right text-xs">
            <thead className="sticky top-0 border-b border-slate-200 bg-white">
              <tr>
                {['الموظف', 'الصافي', 'الوسيلة', 'الحساب / الخزينة', 'مرجع العملية', 'إثبات التحويل'].map((heading) => (
                  <th key={heading} className="px-3 py-3 font-bold text-slate-500">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => {
                const row = rows[item.id];
                const Icon = METHOD_ICONS[row.method];
                return (
                  <tr key={item.id} className="align-top hover:bg-slate-50/60">
                    <td className="px-3 py-3">
                      <div className="font-bold text-slate-800">{item.employeeName}</div>
                      <div className="mt-1 text-[10px] text-slate-400">{item.details.bankName || item.details.walletProvider || '—'}</div>
                    </td>
                    <td className="px-3 py-3 font-mono font-black text-sky-700">{item.netAmount.toFixed(2)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        <Icon className="h-3.5 w-3.5 text-slate-400" />
                        <select
                          value={row.method}
                          onChange={(event) => update(item.id, { method: event.target.value as PayrollPaymentMethod })}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 font-bold"
                        >
                          {(['CASH', 'BANK_TRANSFER', 'WALLET'] as PayrollPaymentMethod[]).map((method) => (
                            <option key={method} value={method}>{METHOD_LABELS[method]}</option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {row.method === 'CASH' && (
                        <select
                          value={row.registerId}
                          onChange={(event) => update(item.id, { registerId: event.target.value })}
                          className="w-full min-w-[150px] rounded-lg border border-slate-200 bg-white px-2 py-1.5"
                        >
                          {options.registers.map((register) => (
                            <option key={register.id} value={register.id}>{register.name}</option>
                          ))}
                        </select>
                      )}
                      {row.method === 'BANK_TRANSFER' && (
                        <select
                          value={row.bankAccountId}
                          onChange={(event) => update(item.id, { bankAccountId: event.target.value })}
                          className="w-full min-w-[170px] rounded-lg border border-slate-200 bg-white px-2 py-1.5"
                        >
                          {options.bankAccounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.bankName} — {account.accountName} ({account.accountNumber})
                            </option>
                          ))}
                          {!options.bankAccounts.length && <option value="">لا يوجد حساب بنكي</option>}
                        </select>
                      )}
                      {row.method === 'WALLET' && (
                        <div className="flex min-w-[170px] gap-1">
                          <input
                            value={row.walletProvider}
                            onChange={(event) => update(item.id, { walletProvider: event.target.value })}
                            placeholder="المزود"
                            className="w-1/2 rounded-lg border border-slate-200 px-2 py-1.5"
                          />
                          <input
                            value={row.walletNumber}
                            onChange={(event) => update(item.id, { walletNumber: event.target.value })}
                            placeholder="رقم المحفظة"
                            className="w-1/2 rounded-lg border border-slate-200 px-2 py-1.5"
                          />
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <input
                        value={row.referenceNumber}
                        onChange={(event) => update(item.id, { referenceNumber: event.target.value })}
                        placeholder="مرجع / رقم حوالة"
                        className="w-full min-w-[120px] rounded-lg border border-slate-200 px-2 py-1.5 font-mono"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        value={row.proofReference}
                        onChange={(event) => update(item.id, { proofReference: event.target.value })}
                        placeholder="رقم مرفق / إشعار"
                        className="w-full min-w-[120px] rounded-lg border border-slate-200 px-2 py-1.5"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <div className="text-xs text-slate-500">
            {needsBankAccount && <span className="font-bold text-rose-600">لا يوجد حساب بنكي مسجل؛ أضف حساباً من المالية أو اختر وسيلة أخرى.</span>}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600">
              إلغاء
            </button>
            <button
              type="submit"
              disabled={saving || needsBankAccount}
              className="flex items-center gap-1 rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
            >
              <Landmark className="h-3.5 w-3.5" /> تأكيد الصرف
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default PayrollPayoutModal;
