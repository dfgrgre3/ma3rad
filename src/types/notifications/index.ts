export type NotificationType = 'LOW_STOCK' | 'PAYMENT_DUE' | 'SHIFT_REMINDER' | 'SYSTEM' | 'STOCK_ALERT' | 'INVOICE_CREATED' | 'EXPENSE_RECORDED' | 'INCOMPLETE_CUSTOMER' | 'HR_CONTRACT_EXPIRY' | 'HR_PROBATION_END' | 'HR_DOCUMENT_EXPIRY' | 'HR_LEAVE_BALANCE' | 'HR_LOAN_DUE' | 'HR_PAYROLL_DUE' | 'HR_PAYROLL_OVERDUE' | 'LICENSE_EXPIRING_SOON' | 'LICENSE_EXPIRED' | 'SUBSCRIPTION_EXPIRING_SOON' | 'SUBSCRIPTION_EXPIRED' | 'OFFLINE_LEASE_EXPIRING' | 'DEVICE_SUSPENDED_REMOTELY' | 'CLONE_DETECTED' | 'AUDIT_SECURITY_ALERT' | 'AUDIT_CRITICAL_ALERT' | 'SYNC_APPROVAL' | 'SYNC_APPROVAL_NOTE' | 'SYNC_CONFLICT';

export interface Notification {
  id: string;
  userId?: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  referenceType?: string;
  referenceId?: string;
  createdAt: string;
}
