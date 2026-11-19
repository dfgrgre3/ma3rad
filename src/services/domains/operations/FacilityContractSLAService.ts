import { NotificationService } from '../notifications/NotificationService';
import type {
  ContractAmendment,
  ContractPayment,
  ContractRenewal,
  FacilityContractExtended,
  FacilityServiceCategory,
  FacilityServiceVendor,
  FacilityServiceVendorInput,
  SLAViolation,
  VendorEvaluation,
  VendorStats,
} from './FacilityContractSLAService/types';
import * as vendors from './FacilityContractSLAService/vendors';
import * as contracts from './FacilityContractSLAService/contracts';
import * as payments from './FacilityContractSLAService/payments';
import * as renewals from './FacilityContractSLAService/renewals';
import * as evaluations from './FacilityContractSLAService/evaluations';
import * as amendments from './FacilityContractSLAService/amendments';
import * as violations from './FacilityContractSLAService/violations';
import * as stats from './FacilityContractSLAService/stats';

export * from './FacilityContractSLAService/types';

const _MAX_DATE = '9999-12-31';

export class FacilityContractSLAService {
  private static notification = new NotificationService();

  /* ========== Service Vendors ========== */

  static getServiceVendors(category?: FacilityServiceCategory): FacilityServiceVendor[] {
    return vendors.getServiceVendors(category);
  }

  static createServiceVendor(input: FacilityServiceVendorInput): FacilityServiceVendor {
    return vendors.createServiceVendor(input);
  }

  static getServiceVendor(vendorId: string): FacilityServiceVendor | null {
    return vendors.getServiceVendor(vendorId);
  }

  static updateServiceVendor(vendorId: string, input: Partial<FacilityServiceVendorInput>): FacilityServiceVendor {
    return vendors.updateServiceVendor(vendorId, input);
  }

  /* ========== Extended Contracts with SLA ========== */

  static getExtendedContracts(): FacilityContractExtended[] {
    return contracts.getExtendedContracts();
  }

  static updateContractSLA(
    contractId: string,
    input: {
      supplierId?: string | null;
      slaResponseTimeMinutes?: number;
      slaResolutionTimeMinutes?: number;
      slaPenaltyPerDelay?: number;
      autoRenew?: boolean;
      renewalNoticeDays?: number;
    }
  ): FacilityContractExtended {
    return contracts.updateContractSLA(contractId, input);
  }

  /* ========== Contract Payments ========== */

  static getContractPayments(contractId: string): ContractPayment[] {
    return payments.getContractPayments(contractId);
  }

  static createContractPayment(
    contractId: string,
    input: {
      paymentNumber: string;
      dueDate: string;
      amountDue: number;
      paymentMethod?: string | null;
      referenceNumber?: string | null;
      proofReference?: string | null;
      notes?: string | null;
    }
  ): ContractPayment {
    return payments.createContractPayment(contractId, input);
  }

  static recordContractPayment(
    paymentId: string,
    input: {
      amountPaid: number;
      paymentDate: string;
      paymentMethod: string;
      referenceNumber?: string | null;
      proofReference?: string | null;
    }
  ): ContractPayment {
    return payments.recordContractPayment(paymentId, input);
  }

  /* ========== Contract Renewals ========== */

  static getContractRenewals(contractId?: string): ContractRenewal[] {
    return renewals.getContractRenewals(contractId);
  }

  static createContractRenewal(
    contractId: string,
    input: {
      newEndsAt: string;
      newPaymentAmount: number;
      newPaymentCycle: string;
      notes?: string | null;
    }
  ): ContractRenewal {
    return renewals.createContractRenewal(contractId, input);
  }

  static decideContractRenewal(renewalId: string, approve: boolean, notes?: string | null): ContractRenewal {
    return renewals.decideContractRenewal(renewalId, approve, notes);
  }

  /* ========== Vendor Evaluations ========== */

  static getVendorEvaluations(vendorId?: string): VendorEvaluation[] {
    return evaluations.getVendorEvaluations(vendorId);
  }

  static createVendorEvaluation(
    vendorId: string,
    input: {
      contractId?: string | null;
      evaluationDate: string;
      qualityRating: number;
      timelinessRating: number;
      communicationRating: number;
      comments?: string | null;
      issuesFound?: string | null;
      actionsRequired?: string | null;
      followUpDate?: string | null;
    }
  ): VendorEvaluation {
    return evaluations.createVendorEvaluation(vendorId, input);
  }

  /* ========== Contract Amendments ========== */

  static getContractAmendments(contractId: string): ContractAmendment[] {
    return amendments.getContractAmendments(contractId);
  }

  static createContractAmendment(
    contractId: string,
    input: {
      amendmentDate: string;
      fieldChanged: string;
      oldValue?: string | null;
      newValue?: string | null;
      reason: string;
      notes?: string | null;
    }
  ): ContractAmendment {
    return amendments.createContractAmendment(contractId, input);
  }

  /* ========== SLA Violations & Alerts ========== */

  static getSLASeverityViolations(): SLAViolation[] {
    return violations.getSLASeverityViolations();
  }

  static acknowledgeSLASeverity(violationId: string): void {
    return violations.acknowledgeSLASeverity(violationId);
  }

  /* ========== Stats ========== */

  static getVendorStats(): VendorStats {
    return stats.getVendorStats();
  }
}
