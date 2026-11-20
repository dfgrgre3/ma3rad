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
    indigo: 'text-primary bg-accent-soft dark:bg-primary/10 ',
    amber: 'text-warning bg-warning-soft dark:bg-warning/10 ',
    emerald: 'text-success bg-success-soft dark:bg-success/10 ',
    rose: 'text-danger bg-danger-soft dark:bg-danger/10 ',
  };
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-line ">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${tones[tone]}`}><Icon className="w-4 h-4" /></div>
      <div>
        <div className="text-[10px] font-bold text-muted">{label}</div>
        <div className="text-lg font-black leading-tight">{value}</div>
        <div className="text-[10px] text-muted">{hint}</div>
      </div>
    </div>
  );
};

export const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }> = ({ title, onClose, children, wide }) => (
  <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div className={`bg-surface rounded-2xl border border-line shadow-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-md'} p-6 max-h-[90vh] overflow-y-auto`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-extrabold">{title}</h3>
        <button onClick={onClose} className="p-1.5 rounded-lg text-muted hover:bg-surface-sunken dark:hover:bg-primary"><X className="w-4 h-4" /></button>
      </div>
      {children}
    </div>
  </div>
);
