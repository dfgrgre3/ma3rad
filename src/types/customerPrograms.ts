export type ElectronicInvoiceStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';

export interface ElectronicInvoice {
  id: string;
  invoiceNumber: string;
  salesInvoiceId: string;
  customerId: string;
  status: ElectronicInvoiceStatus;
  xmlFilePath?: string | null;
  pdfFilePath?: string | null;
  submissionDate?: string | null;
  acceptedDate?: string | null;
  rejectionReason?: string | null;
  taxAuthorityReference?: string | null;
  totalTax: number;
  totalAmount: number;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateElectronicInvoiceDTO {
  salesInvoiceId: string;
  customerId: string;
}

// ─── LOYALTY PROGRAM ──────────────────────────────────────────────────────────

export type LoyaltyTransactionType = 'EARN' | 'REDEEM' | 'EXPIRE' | 'ADJUST';

export interface LoyaltyTier {
  id: string;
  name: string;
  minPoints: number;
  discountPercentage: number;
  benefits?: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface CustomerLoyalty {
  id: string;
  customerId: string;
  currentPoints: number;
  totalPointsEarned: number;
  totalPointsRedeemed: number;
  tierId?: string | null;
  joinedAt: string;
  lastActivityAt: string;
  tierName?: string | null;
}

export interface LoyaltyTransaction {
  id: string;
  customerId: string;
  type: LoyaltyTransactionType;
  points: number;
  referenceType?: string | null;
  referenceId?: string | null;
  description?: string | null;
  createdBy?: string | null;
  createdAt: string;
}

export interface EarnLoyaltyPointsDTO {
  customerId: string;
  points: number;
  referenceType?: string;
  referenceId?: string;
  description?: string;
}

export interface RedeemLoyaltyPointsDTO {
  customerId: string;
  points: number;
  referenceType?: string;
  referenceId?: string;
  description?: string;
}

// ─── MULTI-BRANCH ─────────────────────────────────────────────────────────────
