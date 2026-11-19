import { ExtrasCountCampaignsBase } from './FinanceExtrasService/countCampaigns';

export type {
  AccountType,
  Account,
  JournalLineInput,
  JournalEntry,
  JournalLine,
  ChequeType,
  ChequeStatus,
  Cheque,
  FixedAsset,
  FixedAssetTransfer,
  FixedAssetMaintenance,
  FixedAssetDisposal,
  FixedAssetDepreciationPeriod,
  FixedAssetDepreciationRequest,
  FixedAssetAttachment,
  FixedAssetSettlementSource,
  FixedAssetCountCampaign,
  FixedAssetCountObservation,
  FixedAssetCountSnapshot,
  FixedAssetCountAudit,
  FixedAssetTimelineEvent,
} from './FinanceExtrasService/types';

export class FinanceExtrasService extends ExtrasCountCampaignsBase {}
