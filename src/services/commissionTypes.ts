export interface CommissionRow {
  id: string;
  employeeId: string;
  employeeName: string;
  sourceType: 'SALES_INVOICE' | 'COLLECTION' | 'PROJECT' | 'MANUAL';
  sourceId?: string | null;
  invoiceNumber?: string | null;
  periodMonth: string;
  baseAmount: number;
  percentage: number;
  commissionAmount: number;
  status: 'PENDING' | 'APPROVED' | 'PAID' | 'CANCELLED';
  paidAt?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface CommissionStats {
  pending: number;
  approved: number;
  paid: number;
  totalPending: number;
  totalPaid: number;
}
