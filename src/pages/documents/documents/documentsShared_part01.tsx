import type { ContractEffectiveStatus, ContractPartyType, DocumentConfidentiality, DocumentStatus } from '../../../types';

export const inputCls =
  'w-full px-3 py-2 bg-surface-muted rounded-xl border border-line text-ink text-xs focus:outline-none focus:ring-2 focus:ring-primary/30';

export const labelCls = 'font-bold text-ink block mb-1';

export const DOC_STATUS_LABEL: Record<DocumentStatus, string> = {
  DRAFT: 'مسودة',
  ACTIVE: 'نشط',
  ARCHIVED: 'مؤرشف',
};

export const DOC_STATUS_STYLE: Record<DocumentStatus, string> = {
  DRAFT: 'bg-warning-soft text-warning border-warning-border dark:bg-warning/10 dark:border-warning/30',
  ACTIVE: 'bg-success-soft text-success border-success-border dark:bg-success/10 dark:border-success/30',
  ARCHIVED: 'bg-surface-sunken text-ink-secondary border-line ',
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
  DRAFT: 'bg-warning-soft text-warning border-warning-border dark:bg-warning/10 dark:border-warning/30',
  SCHEDULED: 'bg-accent-soft text-primary border-accent-border dark:bg-primary/10 dark:border-primary/30',
  ACTIVE: 'bg-success-soft text-success border-success-border dark:bg-success/10 dark:border-success/30',
  EXPIRING: 'bg-warning-soft text-warning border-warning-border dark:bg-warning/10 dark:border-warning/30',
  EXPIRED: 'bg-danger-soft text-danger border-danger-border dark:bg-danger/10 dark:border-danger/30',
  TERMINATED: 'bg-surface-sunken text-ink-secondary border-line ',
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
