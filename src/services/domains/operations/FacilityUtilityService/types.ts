export type UtilityType = 'ELECTRICITY' | 'WATER' | 'GAS' | 'INTERNET' | 'HVAC' | 'GENERATOR' | 'ELEVATOR' | 'FIRE_SUPPRESSION' | 'WASTE' | 'OTHER';
export type UnitOfMeasure = 'kWh' | 'm3' | 'liter' | 'GB' | 'hour' | 'unit' | 'OTHER';
export type BillStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'CANCELLED';
export type OutageType = 'PLANNED' | 'UNPLANNED' | 'EMERGENCY';
export type OutageStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export interface UtilityMeter {
  id: string;
  locationId: string;
  locationName: string;
  branchId: string;
  branchName: string;
  meterCode: string;
  meterName: string;
  utilityType: UtilityType;
  unitOfMeasure: UnitOfMeasure;
  tariffPerUnit: number;
  fixedMonthlyFee: number;
  installationDate: string | null;
  lastReadingDate: string | null;
  lastReadingValue: number;
  isActive: boolean;
  notes: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface UtilityMeterInput {
  locationId: string;
  meterName: string;
  utilityType: UtilityType;
  unitOfMeasure?: UnitOfMeasure;
  tariffPerUnit?: number;
  fixedMonthlyFee?: number;
  installationDate?: string | null;
  notes?: string | null;
}

export interface UtilityReading {
  id: string;
  meterId: string;
  meterCode: string;
  meterName: string;
  readingDate: string;
  readingValue: number;
  previousValue: number;
  consumption: number;
  cost: number;
  isEstimated: boolean;
  recordedBy: string;
  recordedByName: string;
  recordedAt: string;
  notes: string | null;
}

export interface UtilityReadingInput {
  meterId: string;
  readingDate: string;
  readingValue: number;
  isEstimated?: boolean;
  notes?: string | null;
}

export interface UtilityBill {
  id: string;
  meterId: string;
  meterCode: string;
  meterName: string;
  utilityType: UtilityType;
  billNumber: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  billDate: string;
  dueDate: string;
  amountDue: number;
  amountPaid: number;
  consumption: number;
  status: BillStatus;
  paymentDate: string | null;
  paymentReference: string | null;
  paymentProof: string | null;
  expenseId: string | null;
  contractId: string | null;
  daysOverdue: number | null;
  notes: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface UtilityBillInput {
  meterId: string;
  billNumber: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  billDate: string;
  dueDate: string;
  amountDue: number;
  consumption?: number;
  expenseId?: string | null;
  contractId?: string | null;
  notes?: string | null;
}

export interface UtilityBillPaymentInput {
  amountPaid: number;
  paymentDate: string;
  paymentReference?: string | null;
  paymentProof?: string | null;
}

export interface UtilityContract {
  id: string;
  meterId: string;
  meterCode: string;
  meterName: string;
  utilityType: UtilityType;
  supplierId: string;
  supplierName: string;
  contractNumber: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  autoRenew: boolean;
  renewalNoticeDays: number;
  slaResponseTimeHours: number;
  slaResolutionTimeHours: number;
  status: string;
  notes: string | null;
  daysToExpiry: number | null;
  isExpiringSoon: boolean;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface UtilityContractInput {
  meterId: string;
  supplierId: string;
  contractNumber: string;
  title: string;
  startsAt: string;
  endsAt?: string | null;
  autoRenew?: boolean;
  renewalNoticeDays?: number;
  slaResponseTimeHours?: number;
  slaResolutionTimeHours?: number;
  notes?: string | null;
}

export interface UtilityOutage {
  id: string;
  meterId: string;
  meterCode: string;
  meterName: string;
  utilityType: UtilityType;
  outageType: OutageType;
  outageStart: string;
  outageEnd: string | null;
  durationMinutes: number;
  affectedAreas: string | null;
  cause: string | null;
  reportedBy: string;
  reportedByName: string;
  reportedAt: string;
  resolvedBy: string | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
  status: OutageStatus;
  notes: string | null;
}

export interface UtilityOutageInput {
  meterId: string;
  outageType: OutageType;
  outageStart: string;
  outageEnd?: string | null;
  affectedAreas?: string | null;
  cause?: string | null;
  notes?: string | null;
}

export interface UtilityConsumptionComparison {
  branchId: string;
  branchName: string;
  utilityType: UtilityType;
  periodMonth: string;
  totalConsumption: number;
  totalCost: number;
  meterCount: number;
}

export interface UtilityStats {
  totalMeters: number;
  activeMeters: number;
  metersByType: Array<{ type: string; count: number }>;
  pendingBills: number;
  overdueBills: number;
  totalAmountDue: number;
  totalAmountPaid: number;
  openOutages: number;
  monthlyConsumptionByType: Array<{ type: string; month: string; consumption: number; cost: number }>;
  topConsumingBranches: Array<{ branchId: string; branchName: string; totalCost: number }>;
}
