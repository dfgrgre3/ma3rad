export type NotificationType = 'LOW_STOCK' | 'PAYMENT_DUE' | 'SHIFT_REMINDER' | 'SYSTEM' | 'STOCK_ALERT' | 'INVOICE_CREATED' | 'EXPENSE_RECORDED' | 'INCOMPLETE_CUSTOMER';

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
