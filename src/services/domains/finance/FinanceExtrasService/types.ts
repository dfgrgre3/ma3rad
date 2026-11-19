export const FA_MONEY_FIELDS = ['purchase_cost', 'salvage_value', 'accumulated_depreciation'] as const;
export const FA_DISPOSAL_MONEY_FIELDS = ['sale_proceeds', 'expenses', 'accumulated_depreciation', 'book_value', 'gain_loss'] as const;
export const FA_DEPR_MONEY_FIELDS = ['amount'] as const;

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

export interface Account {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  parentCode?: string | null;
  balance: number;
  computedBalance?: number;
  isActive: number;
  notes?: string | null;
}

export interface JournalLineInput {
  accountId: string;
  debit: number;
  credit: number;
  description?: string;
}

export interface JournalEntry {
  id: string;
  entryNumber: string;
  date: string;
  description: string;
  referenceType?: string | null;
  referenceId?: string | null;
  totalDebit: number;
  totalCredit: number;
  isPosted: number;
  createdBy: string;
  createdAt: string;
  branchId?: string | null;
  companyId?: string | null;
  lineCount?: number;
  sourceLabel?: string;
  /** Entry that reversed this entry, when this entry has already been reversed. */
  reversedByEntryId?: string | null;
}

export interface JournalLine {
  id: string;
  entryId: string;
  accountId: string;
  accountCode?: string;
  accountName?: string;
  debit: number;
  credit: number;
  description?: string | null;
}

export type ChequeType = 'RECEIVED' | 'ISSUED';
export type ChequeStatus = 'PENDING' | 'DEPOSITED' | 'CLEARED' | 'BOUNCED' | 'CANCELLED';

export interface Cheque {
  id: string;
  chequeNumber: string;
  type: ChequeType;
  partyType: 'CUSTOMER' | 'SUPPLIER' | 'OTHER';
  partyId?: string | null;
  partyName: string;
  bankName?: string | null;
  amount: number;
  dueDate: string;
  status: ChequeStatus;
  notes?: string | null;
  createdBy?: string | null;
  createdAt: string;
}

export interface FixedAsset {
  id: string;
  code: string;
  name: string;
  category: string;
  purchaseDate: string;
  purchaseCost: number;
  salvageValue: number;
  usefulLifeYears: number;
  accumulatedDepreciation: number;
  status: 'ACTIVE' | 'DISPOSED' | 'FULLY_DEPRECIATED';
  location?: string | null;
  notes?: string | null;
  depreciationMethod?: 'STRAIGHT_LINE' | 'DECLINING_BALANCE' | 'UNITS_OF_PRODUCTION' | 'NON_DEPRECIABLE';
  decliningRate?: number | null;
  expectedUnits?: number | null;
  branchId?: string | null;
  departmentId?: string | null;
  responsibleUserId?: string | null;
}

export type FixedAssetTransfer = {
  id: string; assetId: string; transferDate: string; fromBranchId: string | null; toBranchId: string | null;
  fromDepartmentId: string | null; toDepartmentId: string | null; fromLocation: string | null; toLocation: string | null;
  fromResponsibleUserId: string | null; toResponsibleUserId: string | null; notes: string | null;
  actorId: string; actorName: string; createdAt: string;
};
export type FixedAssetMaintenance = {
  id: string; assetId: string; maintenanceDate: string; maintenanceType: string; description: string;
  cost: number; costTreatment: 'OPERATIONAL' | 'CAPITALIZED'; vendor: string | null;
  nextMaintenanceDate: string | null; journalEntryId: string | null; actorId: string; actorName: string;
};
export type FixedAssetDisposal = {
  id: string; assetId: string; disposalDate: string; reason: string; saleProceeds: number;
  expenses: number; buyer: string | null; accumulatedDepreciation: number; bookValue: number;
  gainLoss: number; journalEntryId: string; approvedBy: string; settlementType: 'CASH_REGISTER' | 'BANK_ACCOUNT';
  settlementId: string;
};
export type FixedAssetDepreciationPeriod = {
  id: string; assetId: string; period: string; postingDate: string; amount: number; usageQuantity: number | null;
  status: 'POSTED'; journalEntryId: string; postedBy: string;
};
export type FixedAssetDepreciationRequest = {
  id: string; assetId: string; period: string; postingDate: string; amount: number; usageQuantity: number | null;
  status: 'PENDING' | 'APPROVED'; requestedBy: string; requesterName: string; approvedBy: string | null;
  approverName: string | null; journalEntryId: string | null; depreciationPeriodId: string | null;
  createdAt: string; approvedAt: string | null;
};
export type FixedAssetAttachment = {
  id: string; assetId: string; documentType: 'INVOICE' | 'WARRANTY' | 'PURCHASE_CONTRACT' | 'OWNERSHIP' | 'OTHER';
  fileName: string; mimeType: string | null; fileSize: number; checksum: string | null;
  storageName: string; uploadedBy: string; uploadedByName: string; createdAt: string;
};
export type FixedAssetSettlementSource = {
  id: string; name: string; type: 'CASH_REGISTER' | 'BANK_ACCOUNT'; currentBalance: number;
};
export type FixedAssetCountCampaign = {
  id: string; branchId: string; location: string | null; countDate: string; status: 'OPEN' | 'FINALIZED';
  createdBy: string; finalizedBy: string | null; finalizedAt: string | null;
};
export type FixedAssetCountObservation = {
  id: string; campaignId: string; assetId: string | null; scannedCode: string; countStatus: 'FOUND' | 'MISSING' | 'UNREGISTERED';
  condition: string | null; notes: string | null; actorId: string; createdAt: string;
};
export type FixedAssetCountSnapshot = {
  assetId: string; assetCode: string; assetName: string; registeredStatus: FixedAsset['status'];
  registeredLocation: string | null; observed: number;
};
export type FixedAssetCountAudit = {
  action: string; details: string | null; actorId: string; actorName: string; createdAt: string;
};
export type FixedAssetTimelineEvent = {
  eventDate: string;
  eventType: 'ACQUISITION' | 'TRANSFER' | 'MAINTENANCE' | 'DEPRECIATION' | 'DISPOSAL';
  label: string;
  amount: number | null;
  actorName: string | null;
  referenceId: string;
  details: string | null;
};

export const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
export const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
