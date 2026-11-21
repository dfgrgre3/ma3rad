import type { PlatformPolicyDocumentStatus } from '../../../services/domains/platform/platformTypes';

export type PoliciesTab = 'DOCUMENTS' | 'RETENTION';

export const POLICY_STATUS_LABELS: Record<PlatformPolicyDocumentStatus, string> = {
  PUBLISHED: 'منشورة',
  PENDING_APPROVAL: 'بانتظار الاعتماد',
  DRAFT: 'مسودة',
};

export const POLICY_STATUS_HINTS: Record<PlatformPolicyDocumentStatus, string> = {
  PUBLISHED: 'النسخة الحالية منشورة ونافذة على العملاء.',
  PENDING_APPROVAL: 'المسودة مقدمة للمراجعة — لا يمكن تعديلها حتى الاعتماد أو الرفض.',
  DRAFT: 'مسودة قيد التحرير — تتطلب الاعتماد قبل النشر.',
};
