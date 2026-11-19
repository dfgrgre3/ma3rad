export type FacilityServiceCategory = 'MAINTENANCE' | 'CLEANING' | 'SECURITY' | 'UTILITY' | 'LEASE' | 'OTHER';
export type ContractStatus = 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'TERMINATED';
export type PaymentStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'CANCELLED';
export type RenewalStatus = 'PENDING' | 'APPROVED' | 'EXECUTED' | 'REJECTED';

export interface FacilityServiceVendor {
  id: string;
  supplierId: string;
  supplierName: string;
  companyId: string;
  serviceCategories: FacilityServiceCategory[];
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  taxNumber: string | null;
  commercialRecord: string | null;
  address: string | null;
  paymentTermsDays: number;
  rating: number;
  totalContracts: number;
  activeContracts: number;
  isPreferred: boolean;
  isActive: boolean;
  notes: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface FacilityServiceVendorInput {
  supplierId: string;
  serviceCategories: FacilityServiceCategory[];
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  taxNumber?: string | null;
  commercialRecord?: string | null;
  address?: string | null;
  paymentTermsDays?: number;
  isPreferred?: boolean;
  isActive?: boolean;
  notes?: string | null;
}

export interface FacilityContractExtended {
  id: string;
  contractNumber: string;
  locationId: string;
  locationName: string;
  contractType: string;
  title: string;
  vendorName: string;
  supplierId: string | null;
  supplierName: string | null;
  startsAt: string | null;
  endsAt: string | null;
  nextPaymentDate: string | null;
  paymentAmount: number;
  paymentCycle: string;
  status: ContractStatus;
  expenseReference: string | null;
  slaResponseTimeMinutes: number;
  slaResolutionTimeMinutes: number;
  slaPenaltyPerDelay: number;
  autoRenew: boolean;
  renewalNoticeDays: number;
  vendorRating: number | null;
  lastEvaluationDate: string | null;
  amendmentCount: number;
  isExpiringSoon: boolean;
  daysToExpiry: number | null;
  slaCompliance: number | null;
}

export interface SLAViolation {
  id: string;
  contractId: string;
  contractTitle: string;
  vendorName: string;
  violationType: 'RESPONSE_DELAY' | 'RESOLUTION_DELAY' | 'PAYMENT_OVERDUE' | 'CONTRACT_EXPIRY';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  detectedAt: string;
  dueDate: string | null;
  penaltyAmount: number | null;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'WAIVED';
}

export interface ContractPayment {
  id: string;
  contractId: string;
  paymentNumber: string;
  dueDate: string;
  amountDue: number;
  amountPaid: number;
  paymentDate: string | null;
  paymentMethod: string | null;
  referenceNumber: string | null;
  proofReference: string | null;
  status: PaymentStatus;
  notes: string | null;
  daysOverdue: number | null;
}

export interface ContractRenewal {
  id: string;
  contractId: string;
  contractTitle: string;
  renewalNumber: string;
  previousEndsAt: string;
  newEndsAt: string;
  newPaymentAmount: number;
  newPaymentCycle: string;
  status: RenewalStatus;
  approvedBy: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  notes: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

export interface VendorEvaluation {
  id: string;
  vendorId: string;
  vendorName: string;
  contractId: string | null;
  contractTitle: string | null;
  evaluationDate: string;
  evaluatorId: string;
  evaluatorName: string;
  qualityRating: number;
  timelinessRating: number;
  communicationRating: number;
  overallRating: number;
  comments: string | null;
  issuesFound: string | null;
  actionsRequired: string | null;
  followUpDate: string | null;
  createdAt: string;
}

export interface ContractAmendment {
  id: string;
  contractId: string;
  contractTitle: string;
  amendmentNumber: string;
  amendmentDate: string;
  fieldChanged: string;
  oldValue: string | null;
  newValue: string | null;
  reason: string;
  approvedBy: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  notes: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

export interface VendorStats {
  totalVendors: number;
  activeVendors: number;
  preferredVendors: number;
  vendorsByCategory: Array<{ category: string; count: number }>;
  averageRating: number;
  topVendors: Array<{ id: string; name: string; rating: number; totalContracts: number }>;
}
