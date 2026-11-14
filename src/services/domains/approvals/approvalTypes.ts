export type ApprovalType =
  | 'DISCOUNT' | 'PRICE_CHANGE' | 'SALES_RETURN' | 'PURCHASE_RETURN'
  | 'STOCK_ADJUSTMENT' | 'PURCHASE_ORDER' | 'EXPENSE' | 'CREDIT_LIMIT' | 'LEAVE' | 'OTHER';

export interface ApprovalRequest {
  id: string;
  requestNumber: string;
  requestType: ApprovalType;
  referenceType?: string | null;
  referenceId?: string | null;
  title: string;
  description?: string | null;
  payload?: string | null;
  requestedValue?: number | null;
  currentValue?: number | null;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED';
  requestedBy: string;
  requestedByName?: string;
  decidedBy?: string | null;
  decidedByName?: string;
  decidedAt?: string | null;
  decisionNotes?: string | null;
  createdAt: string;
  approvalCount?: number;
  decisionHistory?: string;
}

export interface CreateApprovalRequestInput {
  requestType: ApprovalType;
  title: string;
  description?: string;
  requestedValue?: number;
  currentValue?: number;
  priority?: ApprovalRequest['priority'];
  referenceType?: string;
  referenceId?: string;
  branchId?: string;
  operationCode?: string;
  details?: Record<string, unknown>;
}

