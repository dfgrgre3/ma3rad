import type {
  BillOfMaterials,
  CreateBomDTO,
  CreateMaintenanceDTO,
  CreateProductionOrderDTO,
  CreateQualityCheckDTO,
  CreateWorkCenterDTO,
  MaintenanceRecord,
  ProductionOrder,
  ProductionOrderMaterial,
  ProductionOrderOperation,
  QualityCheck,
  UpdateMaintenanceDTO,
  UpdateQualityCheckDTO,
  WipOrder,
  WorkCenter,
} from './ManufacturingService/types';
import { ManufacturingContext } from './ManufacturingService/context';
import { WorkCentersModule } from './ManufacturingService/workCenters';
import { BomsModule } from './ManufacturingService/boms';
import { ProductionOrdersModule } from './ManufacturingService/productionOrders';
import { QualityModule } from './ManufacturingService/quality';
import { MaintenanceModule } from './ManufacturingService/maintenance';

export * from './ManufacturingService/types';

/**
 * Manufacturing domain facade. Implementation is split across
 * ./ManufacturingService/* modules grouped by responsibility:
 *  - workCenters.ts       — work-center queries
 *  - boms.ts              — bill-of-materials queries
 *  - productionOrders.ts  — production order lifecycle + WIP valuation
 *  - quality.ts           — quality checks & dispositions
 *  - maintenance.ts       — equipment maintenance records
 *  - context.ts           — shared db/branch access, permission & audit guards
 *  - types.ts             — public DTO/entity types (re-exported above)
 */
export class ManufacturingService {
  private ctx = new ManufacturingContext();
  private workCenters = new WorkCentersModule(this.ctx);
  private boms = new BomsModule(this.ctx);
  private orders = new ProductionOrdersModule(this.ctx, this.boms);
  private quality = new QualityModule(this.ctx, this.orders);
  private maintenance = new MaintenanceModule(this.ctx);

  // ── Work centers ──────────────────────────────────────────────────────────

  public getWorkCenters(branchId?: string): WorkCenter[] {
    return this.workCenters.getWorkCenters(branchId);
  }

  public createWorkCenter(input: CreateWorkCenterDTO): WorkCenter {
    return this.workCenters.createWorkCenter(input);
  }

  // ── Bills of materials ────────────────────────────────────────────────────

  public getBoms(productId?: string): BillOfMaterials[] {
    return this.boms.getBoms(productId);
  }

  public getBom(id: string): BillOfMaterials {
    return this.boms.getBom(id);
  }

  public createBom(input: CreateBomDTO): BillOfMaterials {
    return this.boms.createBom(input);
  }

  public activateBom(id: string): BillOfMaterials {
    return this.boms.activateBom(id);
  }

  public archiveBom(id: string): BillOfMaterials {
    return this.boms.archiveBom(id);
  }

  // ── Production orders ─────────────────────────────────────────────────────

  public getProductionOrders(branchId?: string): ProductionOrder[] {
    return this.orders.getProductionOrders(branchId);
  }

  public getProductionOrder(id: string): ProductionOrder {
    return this.orders.getProductionOrder(id);
  }

  public createProductionOrder(input: CreateProductionOrderDTO): ProductionOrder {
    return this.orders.createProductionOrder(input);
  }

  public releaseOrder(id: string): ProductionOrder {
    return this.orders.releaseOrder(id);
  }

  /** Link a released production order to an operations shift without starting it. */
  public assignOrderToShift(orderId: string, operationShiftId: string | null): ProductionOrder {
    return this.orders.assignOrderToShift(orderId, operationShiftId);
  }

  public startOrder(id: string, operationShiftId?: string | null): ProductionOrder {
    return this.orders.startOrder(id, operationShiftId);
  }

  public completeOperation(operationId: string, actualMinutes: number): ProductionOrderOperation {
    return this.orders.completeOperation(operationId, actualMinutes);
  }

  public consumeMaterial(materialId: string, quantity: number): ProductionOrderMaterial {
    return this.orders.consumeMaterial(materialId, quantity);
  }

  public completeOrder(id: string): ProductionOrder {
    return this.orders.completeOrder(id);
  }

  public getWipValuation(): { orders: WipOrder[]; totalMaterialCost: number; totalQuantity: number } {
    return this.orders.getWipValuation();
  }

  public cancelOrder(id: string, reason?: string): ProductionOrder {
    return this.orders.cancelOrder(id, reason);
  }

  // ── Quality checks ────────────────────────────────────────────────────────

  public createQualityCheck(input: CreateQualityCheckDTO): QualityCheck {
    return this.quality.createQualityCheck(input);
  }

  public getQualityCheck(id: string): QualityCheck {
    return this.quality.getQualityCheck(id);
  }

  public getQualityChecks(productionOrderId?: string): QualityCheck[] {
    return this.quality.getQualityChecks(productionOrderId);
  }

  public updateQualityCheck(id: string, input: UpdateQualityCheckDTO): QualityCheck {
    return this.quality.updateQualityCheck(id, input);
  }

  public recordQualityDisposition(id: string, disposition: 'ACCEPT' | 'SCRAP' | 'REWORK' | 'RETURN', quantity: number, _notes?: string): QualityCheck {
    return this.quality.recordQualityDisposition(id, disposition, quantity, _notes);
  }

  // ── Maintenance ───────────────────────────────────────────────────────────

  public createMaintenance(input: CreateMaintenanceDTO): MaintenanceRecord {
    return this.maintenance.createMaintenance(input);
  }

  public getMaintenance(id: string): MaintenanceRecord {
    return this.maintenance.getMaintenance(id);
  }

  public getMaintenanceRecords(filters?: { status?: string; workCenterId?: string }): MaintenanceRecord[] {
    return this.maintenance.getMaintenanceRecords(filters);
  }

  public updateMaintenance(id: string, input: UpdateMaintenanceDTO): MaintenanceRecord {
    return this.maintenance.updateMaintenance(id, input);
  }
}
