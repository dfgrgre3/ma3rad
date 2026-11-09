import React from 'react';
import { Paperclip } from 'lucide-react';
import { CONTRACT_STATUS_LABEL, CONTRACT_STATUS_STYLE, PARTY_LABEL } from './documentsShared';
import type { ContractsTableProps } from './DocumentsTables_part01';

export const ContractsTable: React.FC<ContractsTableProps> = ({ contracts, can, onActivate, onRenew, onTerminate }) => (
<div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
  <table className="w-full text-xs">
    <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500">
      <tr>
        <th className="text-right p-3 font-bold">رقم العقد</th>
        <th className="text-right p-3 font-bold">العنوان</th>
        <th className="text-right p-3 font-bold">الطرف</th>
        <th className="text-right p-3 font-bold">الفترة</th>
        <th className="text-right p-3 font-bold">القيمة</th>
        <th className="text-right p-3 font-bold">الحالة</th>
        <th className="text-right p-3 font-bold">إجراءات</th>
      </tr>
    </thead>
    <tbody>
      {contracts.map((contract) => (
        <tr key={contract.id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40">
          <td className="p-3 font-mono text-[11px]">{contract.contractNumber}</td>
          <td className="p-3 font-bold">
            {contract.title}
            {contract.documentTitle && <div className="text-[10px] text-slate-400 font-normal flex items-center gap-1 mt-0.5"><Paperclip className="w-3 h-3" />{contract.documentTitle}</div>}
          </td>
          <td className="p-3">{contract.partyName}<div className="text-[10px] text-slate-400">{PARTY_LABEL[contract.partyType]}</div></td>
          <td className="p-3 text-slate-500">{contract.startDate} → {contract.endDate}</td>
          <td className="p-3 font-mono">{contract.value.toLocaleString()} {contract.currency}</td>
          <td className="p-3">
            <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${CONTRACT_STATUS_STYLE[contract.effectiveStatus]}`}>
              {CONTRACT_STATUS_LABEL[contract.effectiveStatus]}
            </span>
            {contract.effectiveStatus === 'EXPIRING' && contract.daysToExpiry !== null && (
              <div className="text-[10px] text-orange-500 mt-1">{contract.daysToExpiry} يوم</div>
            )}
          </td>
          <td className="p-3">
            <div className="flex flex-wrap gap-1">
              {contract.status === 'DRAFT' && can('contracts.update') && (
                <button onClick={() => onActivate(contract)} className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">تفعيل</button>
              )}
              {contract.status !== 'TERMINATED' && can('contracts.update') && (
                <button onClick={() => onRenew(contract)} className="px-2 py-1 rounded-lg bg-sky-50 text-sky-700 border border-sky-200 text-[10px] font-bold">تجديد</button>
              )}
              {contract.status === 'ACTIVE' && can('contracts.terminate') && (
                <button onClick={() => onTerminate(contract)} className="px-2 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold">فسخ</button>
              )}
            </div>
          </td>
        </tr>
      ))}
      {contracts.length === 0 && <tr><td colSpan={7} className="p-12 text-center text-slate-500">لا توجد عقود مطابقة.</td></tr>}
    </tbody>
  </table>
</div>
);
