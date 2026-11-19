// Partner service was split by responsibility into the PartnerService/
// folder. This module preserves the original public API.
export * from './PartnerService/types';
export { signedAmount } from './PartnerService/money';
export { PartnerService } from './PartnerService/PartnerService';
