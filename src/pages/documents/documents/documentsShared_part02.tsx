import React from 'react';
import { X } from 'lucide-react';
import type { ContractPartyType } from '../../../types';

export interface ContractDraft {
  companyId: string;
  title: string;
  partyType: ContractPartyType;
  partyName: string;
  startDate: string;
  endDate: string;
  value: string;
  currency: string;
  renewalNoticeDays: string;
  autoRenew: boolean;
  documentId: string;
  notes: string;
}

export const SummaryCard: React.FC<{
  label: string;
  value: number;
  hint: string;
  icon: React.ElementType;
  tone?: 'amber' | 'emerald' | 'rose' | 'indigo';
}> = ({ label, value, hint, icon: Icon, tone = 'indigo' }) => {
  const tones: Record<string, string> = {
    indigo: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-500/10 dark:text-indigo-300',
    amber: 'text-amber-600 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-300',
    emerald: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-300',
    rose: 'text-rose-600 bg-rose-50 dark:bg-rose-500/10 dark:text-rose-300',
  };
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${tones[tone]}`}><Icon className="w-4 h-4" /></div>
      <div>
        <div className="text-[10px] font-bold text-slate-500">{label}</div>
        <div className="text-lg font-black leading-tight">{value}</div>
        <div className="text-[10px] text-slate-400">{hint}</div>
      </div>
    </div>
  );
};

export const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }> = ({ title, onClose, children, wide }) => (
  <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-md'} p-6 max-h-[90vh] overflow-y-auto`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-extrabold">{title}</h3>
        <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-4 h-4" /></button>
      </div>
      {children}
    </div>
  </div>
);
