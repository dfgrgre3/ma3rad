import { NotificationService } from '../notifications/NotificationService';
import type {
  BillStatus,
  OutageStatus,
  UtilityBill,
  UtilityBillInput,
  UtilityBillPaymentInput,
  UtilityConsumptionComparison,
  UtilityContract,
  UtilityContractInput,
  UtilityMeter,
  UtilityMeterInput,
  UtilityOutage,
  UtilityOutageInput,
  UtilityReading,
  UtilityReadingInput,
  UtilityStats,
  UtilityType,
} from './FacilityUtilityService/types';
import * as meters from './FacilityUtilityService/meters';
import * as readings from './FacilityUtilityService/readings';
import * as bills from './FacilityUtilityService/bills';
import * as contracts from './FacilityUtilityService/contracts';
import * as outages from './FacilityUtilityService/outages';
import * as stats from './FacilityUtilityService/stats';

export * from './FacilityUtilityService/types';

const _MAX_DATE = '9999-12-31';

export class FacilityUtilityService {
  private static notification = new NotificationService();

  /* ========== Utility Meters ========== */

  static getUtilityMeters(utilityType?: UtilityType): UtilityMeter[] {
    return meters.getUtilityMeters(utilityType);
  }

  static createUtilityMeter(input: UtilityMeterInput): UtilityMeter {
    return meters.createUtilityMeter(input);
  }

  static updateUtilityMeter(id: string, input: Partial<UtilityMeterInput>): UtilityMeter {
    return meters.updateUtilityMeter(id, input);
  }

  static toggleMeterActive(id: string, isActive: boolean): UtilityMeter {
    return meters.toggleMeterActive(id, isActive);
  }

  /* ========== Utility Readings ========== */

  static getUtilityReadings(options: {
    meterId?: string;
    from?: string;
    to?: string;
    limit?: number;
  }): UtilityReading[] {
    return readings.getUtilityReadings(options);
  }

  static createUtilityReading(input: UtilityReadingInput): UtilityReading {
    return readings.createUtilityReading(input);
  }

  /* ========== Utility Bills ========== */

  static getUtilityBills(options: {
    meterId?: string;
    status?: BillStatus;
    from?: string;
    to?: string;
  } = {}): UtilityBill[] {
    return bills.getUtilityBills(options);
  }

  static createUtilityBill(input: UtilityBillInput): UtilityBill {
    return bills.createUtilityBill(input);
  }

  static payUtilityBill(billId: string, input: UtilityBillPaymentInput): UtilityBill {
    return bills.payUtilityBill(billId, input);
  }

  /* ========== Utility Contracts ========== */

  static getUtilityContracts(): UtilityContract[] {
    return contracts.getUtilityContracts();
  }

  static createUtilityContract(input: UtilityContractInput): UtilityContract {
    return contracts.createUtilityContract(input);
  }

  static updateUtilityContractStatus(id: string, status: string): UtilityContract {
    return contracts.updateUtilityContractStatus(id, status);
  }

  /* ========== Utility Outages ========== */

  static getUtilityOutages(options: {
    meterId?: string;
    status?: OutageStatus;
    from?: string;
    to?: string;
    limit?: number;
  }): UtilityOutage[] {
    return outages.getUtilityOutages(options);
  }

  static createUtilityOutage(input: UtilityOutageInput): UtilityOutage {
    return outages.createUtilityOutage(input);
  }

  static resolveUtilityOutage(id: string, resolvedByNote?: string | null): UtilityOutage {
    return outages.resolveUtilityOutage(id, resolvedByNote);
  }

  /* ========== Consumption Comparison ========== */

  static getConsumptionComparison(periodMonth: string): UtilityConsumptionComparison[] {
    return stats.getConsumptionComparison(periodMonth);
  }

  /* ========== Stats ========== */

  static getUtilityStats(): UtilityStats {
    return stats.getUtilityStats();
  }
}
