import type {
  BillOfMaterials,
  BomOperation,
  CreateBomDTO,
  CreateDowntimeDTO,
  CreateMaintenanceDTO,
  CreateMpsEntryDTO,
  CreateProductionLineDTO,
  CreateProductionOrderDTO,
  CreateProductionOrderFromSalesItemDTO,
  CreateQualityCheckDTO,
  CreateWorkCenterDTO,
  DowntimeRecord,
  MaintenanceRecord,
  MpsEntry,
  ProductionCostReport,
  ProductionLine,
  ProductionOrder,
  ProductionOrderCost,
  ProductionOrderMaterial,
  ProductionOrderOperation,
  QualityCheck,
  QualityDefectCode,
  OeeWorkCenterRow,
  OperatorLaborDailyRow,
  OperatorLaborRow,
  ProductionScheduleOptions,
  SalesOrderProductionCandidate,
  MaterialTraceability,
  OrderTraceability,
  UpdateBomDTO,
  UpdateMaintenanceDTO,
  UpdateProductionLineDTO,
  UpdateProductionOrderDTO,
  UpdateQualityCheckDTO,
  UpdateWorkCenterDTO,
  WipOrder,
  WorkCenter,
  WorkCenterLoad,
} from './ManufacturingService/types';
import { ManufacturingContext } from './ManufacturingService/context';
import { WorkCentersModule } from './ManufacturingService/workCenters';
import { BomsModule } from './ManufacturingService/boms';
import { ProductionOrdersModule } from './ManufacturingService/productionOrders';
import { QualityModule } from './ManufacturingService/quality';
import { MaintenanceModule } from './ManufacturingService/maintenance';
import { CostingModule } from './ManufacturingService/costing';
import { DowntimeModule } from './ManufacturingService/downtime';
import { MrpModule, type MrpPlan, type TimePhasedMrp } from './ManufacturingService/mrp';
import { TraceabilityModule } from './ManufacturingService/traceability';
import { HseModule, type HseIncident, type HseInspection, type HsePermit, type HseTraining } from './ManufacturingService/hse';

export * from './ManufacturingService/types';
export type { HseIncident, HseInspection, HsePermit, HseTraining } from './ManufacturingService/hse';

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
  private costing = new CostingModule(this.ctx, this.orders);
  private downtime = new DowntimeModule(this.ctx);
  private mrp = new MrpModule(this.ctx, this.boms, this.orders);
  private traceability = new TraceabilityModule(this.ctx, this.orders);
  private hse = new HseModule(this.ctx);

  // ── Work centers ──────────────────────────────────────────────────────────

  public getWorkCenters(branchId?: string): WorkCenter[] {
    return this.workCenters.getWorkCenters(branchId);
  }

  public createWorkCenter(input: CreateWorkCenterDTO): WorkCenter {
    return this.workCenters.createWorkCenter(input);
  }

  public updateWorkCenter(id: string, input: UpdateWorkCenterDTO): WorkCenter {
    return this.workCenters.updateWorkCenter(id, input);
  }

  // ── Production lines ──────────────────────────────────────────────────────

  public getProductionLines(branchId?: string): ProductionLine[] {
    return this.workCenters.getProductionLines(branchId);
  }
  public createProductionLine(input: CreateProductionLineDTO): ProductionLine {
    return this.workCenters.createProductionLine(input);
  }
  public updateProductionLine(id: string, input: UpdateProductionLineDTO): ProductionLine {
    return this.workCenters.updateProductionLine(id, input);
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

  /** Estimated material cost per BOM unit plus line breakdown. */
  public getBomCostEstimate(bomId: string) {
    return this.boms.getBomCostEstimate(bomId);
  }

  /** Critical components of active BOMs at/below stock thresholds. */
  public getBomStockAlerts() {
    return this.boms.getBomStockAlerts();
  }

  public archiveBom(id: string): BillOfMaterials {
    return this.boms.archiveBom(id);
  }

  /** Edit a DRAFT BOM header and/or replace its components. */
  public updateBom(id: string, input: UpdateBomDTO): BillOfMaterials {
    return this.boms.updateBom(id, input);
  }

  /** Routing template of a BOM (operations copied into new production orders). */
  public getBomOperations(bomId: string): BomOperation[] {
    return this.boms.loadBomOperations(bomId);
  }

  /** Replace the routing template of a DRAFT BOM. */
  public setBomOperations(bomId: string, operations: Array<{ workCenterId: string; minutesPerUnit: number }>): BomOperation[] {
    return this.boms.setBomOperations(bomId, operations);
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

  /** Edit scheduling fields (priority, dates, notes) of a PLANNED order. */
  public updateProductionOrder(id: string, input: UpdateProductionOrderDTO): ProductionOrder {
    return this.orders.updateProductionOrder(id, input);
  }

  public releaseOrder(id: string): ProductionOrder {
    return this.orders.releaseOrder(id);
  }

  /** Send a planned order for approval (or re-request after rejection). */
  public requestOrderApproval(id: string): ProductionOrder {
    return this.orders.requestOrderApproval(id);
  }

  /** Approve a pending order — approver must differ from the creator. */
  public approveProductionOrder(id: string): ProductionOrder {
    return this.orders.approveProductionOrder(id);
  }

  /** Reject a pending approval request. */
  public rejectProductionOrder(id: string, reason?: string): ProductionOrder {
    return this.orders.rejectProductionOrder(id, reason);
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

  /** Start a single pending operation (sequence enforced). */
  public startOperation(operationId: string): ProductionOrderOperation {
    return this.orders.startOperation(operationId);
  }

  /** Skip a pending operation without executing it. */
  public skipOperation(operationId: string, reason?: string): ProductionOrderOperation {
    return this.orders.skipOperation(operationId, reason);
  }

  /** Assign (or clear) the operator responsible for an operation. */
  public setOperationOperator(operationId: string, employeeId: string | null): ProductionOrderOperation {
    return this.orders.setOperationOperator(operationId, employeeId);
  }

  public consumeMaterial(materialId: string, quantity: number): ProductionOrderMaterial {
    return this.orders.consumeMaterial(materialId, quantity);
  }

  /** Receive produced output; omit quantity to complete the remaining amount. */
  public completeOrder(id: string, outputQuantity?: number): ProductionOrder {
    return this.orders.completeOrder(id, outputQuantity);
  }

  /** Quantity of an order's output currently held pending final QC. */
  public getQcHeldQuantity(orderId: string): number {
    return this.orders.getQcHeldQuantity(orderId);
  }

  /** Create a PLANNED rework order for output rejected by a quality check. */
  public createReworkOrder(sourceOrderId: string, quantity: number, options?: { qualityCheckId?: string; notes?: string }): ProductionOrder {
    return this.orders.createReworkOrder(sourceOrderId, quantity, options);
  }

  /** Rework orders spawned from a given production order. */
  public getReworkOrders(sourceOrderId: string): ProductionOrder[] {
    return this.orders.getReworkOrders(sourceOrderId);
  }

  /** Live production-floor snapshot for released/in-progress orders. */
  public getProductionFloor() {
    return this.orders.getProductionFloor();
  }

  public getWipValuation(): { orders: WipOrder[]; totalMaterialCost: number; totalQuantity: number } {
    return this.orders.getWipValuation();
  }

  public cancelOrder(id: string, reason?: string): ProductionOrder {
    return this.orders.cancelOrder(id, reason);
  }

  // ── Sales-order linkage (make-to-order) ───────────────────────────────────

  /** Sales order items ready to be turned into production orders. */
  public getSalesOrderProductionCandidates(): SalesOrderProductionCandidate[] {
    return this.orders.getSalesOrderProductionCandidates();
  }

  /** Create a production order from a sales order item. */
  public createProductionOrderFromSalesItem(
    orderItemId: string,
    input?: CreateProductionOrderFromSalesItemDTO
  ): ProductionOrder {
    return this.orders.createProductionOrderFromSalesItem(orderItemId, input);
  }

  /** Production coverage progress for a sales order (manufactured items only). */
  public getSalesOrderProductionProgress(salesOrderId: string) {
    return this.orders.getSalesOrderProductionProgress(salesOrderId);
  }

  // ── Costing & capacity planning ───────────────────────────────────────────

  /** Actual incurred cost (materials consumed + labor) for one order. */
  public getProductionOrderCost(orderId: string): ProductionOrderCost {
    return this.costing.getProductionOrderCost(orderId);
  }

  /** Cost report across all non-cancelled production orders. */
  public getProductionCostReport(): ProductionCostReport {
    return this.costing.getProductionCostReport();
  }

  /** Per-work-center planned/actual load for active orders. */
  public getCapacityPlan(): WorkCenterLoad[] {
    return this.costing.getCapacityPlan();
  }

  /** Efficiency, labor variance and monthly output analytics. */
  public getManufacturingAnalytics() {
    return this.costing.getManufacturingAnalytics();
  }

  /** Component shortages across active production orders. */
  public getMaterialShortages() {
    return this.costing.getMaterialShortages();
  }

  /** Aggregated purchase suggestions from production shortages. */
  public getPurchaseSuggestions() {
    return this.costing.getPurchaseSuggestions();
  }

  /** Create purchase requests covering production shortages (one per warehouse). */
  public createPurchaseRequestsFromShortages(input?: {
    warehouseId?: string;
    priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
    neededBy?: string;
  }) {
    return this.costing.createPurchaseRequestsFromShortages(input);
  }

  /** Queued operations per work center with estimated start/finish dates.
   *  Pass options (excludeOrderIds / minutesScale) for a what-if dry run. */
  public getProductionSchedule(options?: ProductionScheduleOptions) {
    return this.costing.getProductionSchedule(options);
  }

  /** OEE (availability × performance × quality) per work center. */
  public getOeeAnalytics(): { centers: OeeWorkCenterRow[]; periodNote: string } {
    return this.costing.getOeeAnalytics();
  }

  /** Operator production minutes reconciled against HR attendance. */
  public getOperatorLaborSummary(): OperatorLaborRow[] {
    return this.costing.getOperatorLaborSummary();
  }

  /** Per-day operation labor vs attendance punches reconciliation. */
  public getOperatorLaborDaily(): OperatorLaborDailyRow[] {
    return this.costing.getOperatorLaborDaily();
  }

  // ── Downtime ──────────────────────────────────────────────────────────────

  public recordDowntime(input: CreateDowntimeDTO): DowntimeRecord {
    return this.downtime.recordDowntime(input);
  }

  public getDowntimeRecords(filter?: {
    workCenterId?: string;
    productionOrderId?: string;
    from?: string;
    to?: string;
  }): DowntimeRecord[] {
    return this.downtime.getDowntimeRecords(filter);
  }

  // ── MRP (materials requirements planning) ─────────────────────────────────

  /** Planned production + netted material needs from uncovered sales demand. */
  public getMrpPlan(): MrpPlan {
    return this.mrp.getMrpPlan();
  }

  /** Convert uncovered sales-order candidates into planned production orders. */
  public createProductionOrdersFromMrp(input?: {
    priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    notes?: string;
  }) {
    return this.mrp.createProductionOrdersFromMrp(input);
  }

  /** Convert MRP material needs into purchase requests (lead-time aware). */
  public createPurchaseRequestsFromMrp(input?: {
    priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
    warehouseId?: string;
  }) {
    return this.mrp.createPurchaseRequestsFromMrp(input);
  }

  // ── Master Production Schedule (MPS) & time-phased MRP ────────────────────

  /** Independent production demand entries feeding the time-phased MRP. */
  public getMpsEntries(status?: 'OPEN' | 'CANCELLED'): MpsEntry[] {
    return this.mrp.getMpsEntries(status);
  }

  public createMpsEntry(input: CreateMpsEntryDTO): MpsEntry {
    return this.mrp.createMpsEntry(input);
  }

  public cancelMpsEntry(id: string): MpsEntry {
    return this.mrp.cancelMpsEntry(id);
  }

  /** Weekly-bucketed MRP: sales + MPS demand exploded through BOMs, netted
   *  against ATP bucket-by-bucket into planned production and purchase needs. */
  public getTimePhasedMrp(weeks = 8): TimePhasedMrp {
    return this.mrp.getTimePhasedMrp(weeks);
  }

  // ── Traceability (lot genealogy) ──────────────────────────────────────────

  /** Forward traceability: order → raw materials/suppliers → batches → QC → customer. */
  public getOrderTraceability(orderId: string): OrderTraceability {
    return this.traceability.getOrderTraceability(orderId);
  }

  /** Backward traceability: raw GRN/purchase/supplier/batch → finished batches. */
  public getMaterialTraceability(filter: {
    goodsReceiptId?: string;
    purchaseId?: string;
    supplierId?: string;
    productBatchId?: string;
  }): MaterialTraceability[] {
    return this.traceability.getMaterialTraceability(filter);
  }

  // ── HSE (health, safety & environment) ────────────────────────────────────

  public getHseIncidents(filter?: { status?: string; branchId?: string }): HseIncident[] {
    return this.hse.getHseIncidents(filter);
  }
  public createHseIncident(input: Parameters<HseModule['createHseIncident']>[0]): HseIncident {
    return this.hse.createHseIncident(input);
  }
  public updateHseIncidentStatus(id: string, status: 'OPEN' | 'INVESTIGATING' | 'CLOSED', correctiveAction?: string): HseIncident {
    return this.hse.updateHseIncidentStatus(id, status, correctiveAction);
  }
  public getHsePermits(filter?: { status?: string }): HsePermit[] {
    return this.hse.getHsePermits(filter);
  }
  public createHsePermit(input: Parameters<HseModule['createHsePermit']>[0]): HsePermit {
    return this.hse.createHsePermit(input);
  }
  public approveHsePermit(id: string, conditions?: string): HsePermit {
    return this.hse.approveHsePermit(id, conditions);
  }
  public cancelHsePermit(id: string): HsePermit {
    return this.hse.cancelHsePermit(id);
  }
  public getHsePermitAlerts(withinDays = 7) {
    return this.hse.getHsePermitAlerts(withinDays);
  }
  public getHseInspections(filter?: { result?: string }): HseInspection[] {
    return this.hse.getHseInspections(filter);
  }
  public createHseInspection(input: Parameters<HseModule['createHseInspection']>[0]): HseInspection {
    return this.hse.createHseInspection(input);
  }
  public getHseTrainings(filter?: { employeeId?: string; expiringWithinDays?: number }): HseTraining[] {
    return this.hse.getHseTrainings(filter);
  }
  public createHseTraining(input: Parameters<HseModule['createHseTraining']>[0]): HseTraining {
    return this.hse.createHseTraining(input);
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

  /** Defect-code catalog for quality root-cause tracking. */
  public getDefectCodes(includeInactive = false): QualityDefectCode[] {
    return this.quality.getDefectCodes(includeInactive);
  }

  public createDefectCode(input: { code: string; name: string; branchId?: string }): QualityDefectCode {
    return this.quality.createDefectCode(input);
  }

  public deactivateDefectCode(id: string): void {
    return this.quality.deactivateDefectCode(id);
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

  /** Overdue and upcoming preventive-maintenance schedules. */
  public getMaintenanceAlerts(withinDays = 7): { overdue: MaintenanceRecord[]; dueSoon: MaintenanceRecord[] } {
    return this.maintenance.getMaintenanceAlerts(withinDays);
  }
}
