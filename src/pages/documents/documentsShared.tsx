import React from 'react';
import { X } from 'lucide-react';
import type {
  ContractEffectiveStatus,
  ContractPartyType,
  DocumentConfidentiality,
  DocumentStatus,
} from '../../types';

export const inputCls =
  'w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500/30';
export const labelCls = 'font-bold text-slate-700 dark:text-slate-300 block mb-1';

export const DOC_STATUS_LABEL: Record<DocumentStatus, string> = {
  DRAFT: 'مسودة',
  ACTIVE: 'نشط',
  ARCHIVED: 'مؤرشف',
};
export const DOC_STATUS_STYLE: Record<DocumentStatus, string> = {
  DRAFT: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30',
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30',
  ARCHIVED: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
};
export const CONFIDENTIALITY_LABEL: Record<DocumentConfidentiality, string> = {
  INTERNAL: 'داخلي',
  RESTRICTED: 'مقيد',
  CONFIDENTIAL: 'سري',
};
export const CONTRACT_STATUS_LABEL: Record<ContractEffectiveStatus, string> = {
  DRAFT: 'مسودة',
  SCHEDULED: 'مجدول',
  ACTIVE: 'ساري',
  EXPIRING: 'قارب الانتهاء',
  EXPIRED: 'منتهي',
  TERMINATED: 'مفسوخ',
};
export const CONTRACT_STATUS_STYLE: Record<ContractEffectiveStatus, string> = {
  DRAFT: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30',
  SCHEDULED: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/30',
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30',
  EXPIRING: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:border-orange-500/30',
  EXPIRED: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30',
  TERMINATED: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
};
export const PARTY_LABEL: Record<ContractPartyType, string> = {
  CUSTOMER: 'عميل',
  SUPPLIER: 'مورد',
  EMPLOYEE: 'موظف',
  OTHER: 'أخرى',
};

export interface DocumentDraft {
  companyId: string;
  title: string;
  category: string;
  confidentiality: DocumentConfidentiality;
  expiresAt: string;
  description: string;
}

export interface VersionDraft {
  fileName: string;
  mimeType: string;
  fileSize: number | null;
  checksum: string;
  storageName: string;
  notes: string;
}

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
