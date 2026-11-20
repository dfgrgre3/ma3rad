export type BomStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
export type ProductionOrderStatus = 'PLANNED' | 'RELEASED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type ProductionPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type ProductionMaterialStatus = 'PENDING' | 'ISSUED' | 'CONSUMED' | 'SHORTAGE';
export type ProductionOperationStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';

export interface WorkCenter {
  id: string;
  code: string;
  name: string;
  description: string | null;
  costPerHour: number;
  overheadPerHour: number;
  capacityPerDay: number;
  branchId: string;
  productionLineId?: string | null;
  productionLineName?: string | null;
  isActive: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductionLine {
  id: string;
  branchId: string;
  branchName?: string | null;
  code: string;
  name: string;
  description: string | null;
  isActive: number;
  workCentersCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface BomItem {
  id: string;
  bomId: string;
  componentProductId: string;
  componentName?: string;
  quantity: number;
  unit: string;
  notes: string | null;
  createdAt: string;
}

export interface BillOfMaterials {
  id: string;
  productId: string;
  productName?: string;
  name: string;
  version: string;
  status: BomStatus;
  notes: string | null;
  items: BomItem[];
  operations?: BomOperation[];
  estimatedCost?: number;
  /** When true, produced output is held in QC quarantine until a FINAL inspection accepts it. */
  requiresFinalQc?: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Routing template line stored on a BOM (minutes per finished unit). */
export interface BomOperation {
  id: string;
  bomId: string;
  workCenterId: string;
  workCenterName?: string;
  sequence: number;
  minutesPerUnit: number;
  createdAt: string;
}

export interface ProductionOrderMaterial {
  id: string;
  orderId: string;
  productId: string;
  productName?: string;
  plannedQty: number;
  consumedQty: number;
  reservedQty: number;
  status: ProductionMaterialStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ProductionOrderOperation {
  id: string;
  orderId: string;
  workCenterId: string;
  workCenterName?: string;
  sequence: number;
  plannedMinutes: number;
  actualMinutes: number;
  status: ProductionOperationStatus;
  operatorId: string | null;
  operatorName?: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductionOrder {
  id: string;
  orderNumber: string;
  productId: string;
  productName?: string;
  bomId: string;
  bomName?: string;
  quantity: number;
  status: ProductionOrderStatus;
  priority: ProductionPriority;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  producedQty: number;
  branchId: string;
  branchName?: string | null;
  warehouseId: string | null;
  warehouseName?: string | null;
  salesOrderId: string | null;
  salesOrderNumber?: string | null;
  orderItemId: string | null;
  customerId: string | null;
  customerName?: string | null;
  notes: string | null;
  approvalStatus: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
  approvedBy: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  /** Set when this order was created to re-produce rejected output of another order. */
  reworkOfOrderId?: string | null;
  /** Quality check whose REWORK disposition spawned this order. */
  sourceQualityCheckId?: string | null;
  materials: ProductionOrderMaterial[];
  operations: ProductionOrderOperation[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductionOrderCost {
  orderId: string;
  orderNumber: string;
  productId: string;
  productName: string;
  quantity: number;
  status: ProductionOrderStatus;
  materialCost: number;
  laborCost: number;
  /** Direct labor share of laborCost (work-center cost_per_hour only). */
  directLaborCost?: number;
  /** Indirect industrial overhead share (work-center overhead_per_hour). */
  overheadCost?: number;
  totalCost: number;
  costPerUnit: number;
  /** Planned standard cost: planned material qty × cost price + planned minutes × rates. */
  standardCost?: number;
  /** totalCost − standardCost (positive = over standard). */
  costVariance?: number;
  variancePercent?: number | null;
  currency?: string;
}

export interface ProductionCostReport {
  orders: ProductionOrderCost[];
  totalMaterialCost: number;
  totalLaborCost: number;
  totalCost: number;
  totalQuantity: number;
  /** Completed maintenance spend in scope (equipment upkeep, not per-order). */
  maintenanceCost: number;
  maintenanceByWorkCenter: Array<{ workCenterId: string | null; workCenterName: string; cost: number }>;
}

export interface ProductionScheduleRow {
  operationId: string;
  orderId: string;
  orderNumber: string;
  productName?: string;
  quantity: number;
  orderStatus: ProductionOrderStatus;
  priority: ProductionPriority;
  dueDate: string | null;
  salesOrderNumber?: string | null;
  workCenterId: string;
  workCenterCode?: string;
  workCenterName?: string;
  sequence: number;
  plannedMinutes: number;
  actualMinutes: number;
  operationStatus: string;
  queuePosition: number;
  cumulativeMinutesBefore: number;
  startOffsetMinutes: number;
  finishOffsetMinutes: number;
  estimatedStartDate: string;
  estimatedFinishDate: string;
}

export interface WorkCenterLoad {
  workCenterId: string;
  code: string;
  name: string;
  branchId: string;
  capacityPerDay: number;
  activeOrders: number;
  plannedMinutes: number;
  actualMinutes: number;
  downtimeMinutes: number;
  loadPercent: number | null;
}

export interface SalesOrderProductionCandidate {
  orderItemId: string;
  salesOrderId: string;
  salesOrderNumber: string;
  customerId: string;
  customerName: string;
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  bomId: string;
  bomName: string;
}

export interface MaterialShortage {
  orderId: string;
  orderNumber: string;
  orderStatus: ProductionOrderStatus;
  componentProductId: string;
  componentName: string;
  warehouseId: string;
  requiredQty: number;
  availableQty: number;
  deficitQty: number;
}

export interface BomStockAlert {
  componentProductId: string;
  componentName: string;
  reorderPoint: number;
  availableQty: number;
  severity: 'OUT' | 'LOW';
  usedBy: Array<{ bomId: string; bomName: string; productName: string }>;
}

/** Leaf-level material requirement after exploding multi-level BOMs. */
export interface BomLeafRequirement {
  componentProductId: string;
  componentName?: string;
  quantity: number;
  unit: string;
}

export interface BomCostEstimate {
  bomId: string;
  totalCost: number;
  items: Array<{
    componentProductId: string;
    componentName: string;
    quantity: number;
    unitCost: number;
    lineCost: number;
  }>;
}

/** Independent (non-sales-order) production demand for the MPS/time-phased MRP. */
export interface MpsEntry {
  id: string;
  productId: string;
  productName?: string;
  bomId: string | null;
  bomName?: string | null;
  quantity: number;
  warehouseId: string | null;
  warehouseName?: string | null;
  branchId: string | null;
  needDate: string;
  source: string;
  status: 'OPEN' | 'CANCELLED';
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
}

/** Lot genealogy: everything needed to trace a production order/batch. */
export interface OrderTraceability {
  orderId: string;
  orderNumber: string;
  productId: string;
  productName: string;
  quantity: number;
  producedQty: number;
  status: string;
  branchId: string | null;
  warehouseId: string | null;
  salesOrderId: string | null;
  salesOrderNumber: string | null;
  customerName: string | null;
  producedBatches: Array<{
    id: string; batchNumber: string; quantity: number; quantityRemaining: number;
    productionDate: string | null; receivedDate: string | null;
  }>;
  materials: Array<{
    componentProductId: string; componentName: string; quantity: number;
    supplierId: string | null; supplierName: string | null;
    goodsReceiptId: string | null; purchaseId: string | null;
    producedBatchId: string | null; producedBatchNumber: string | null;
  }>;
  operators: Array<{ employeeId: string; name: string; minutes: number }>;
  qualityChecks: Array<{
    id: string; inspectionType: string; result: string;
    quantityInspected: number; quantityAccepted: number; quantityRejected: number;
    disposition: string; dispositionQty: number;
  }>;
  reworkOrders: Array<{ id: string; orderNumber: string; quantity: number; status: string }>;
}

/** Reverse traceability: a raw-material batch/GRN → produced batches. */
export interface MaterialTraceability {
  componentProductId: string;
  componentName: string;
  goodsReceiptId: string | null;
  supplierId: string | null;
  supplierName: string | null;
  producedBatches: Array<{
    batchId: string; batchNumber: string; productName: string;
    orderId: string; orderNumber: string; customerName: string | null;
    quantity: number; producedDate: string | null;
  }>;
}

export interface CreateMpsEntryDTO {
  productId: string;
  bomId?: string;
  quantity: number;
  needDate: string;
  warehouseId?: string;
  branchId?: string;
  notes?: string;
}

export interface PurchaseSuggestion {
  componentProductId: string;
  componentName: string;
  warehouseId: string;
  totalRequiredQty: number;
  availableQty: number;
  suggestedQty: number;
  unitCost: number;
  estimatedValue: number;
  affectedOrders: number;
  orderNumbers: string[];
}

export interface QualityCheckDefect {
  defectCodeId: string;
  defectCode: string;
  defectName: string;
  quantity: number;
}

export interface QualityCheck {
  id: string;
  productionOrderId: string;
  inspectionType: 'INCOMING' | 'IN_PROCESS' | 'FINAL';
  result: 'PASS' | 'FAIL' | 'PENDING' | 'CONDITIONAL';
  quantityInspected: number;
  quantityAccepted: number;
  quantityRejected: number;
  /** AQL sampling plan values recorded for the inspection. */
  sampleSize: number | null;
  acceptNumber: number | null;
  rejectNumber: number | null;
  disposition: 'NONE' | 'ACCEPT' | 'SCRAP' | 'REWORK' | 'RETURN';
  dispositionQty: number;
  dispositionAt: string | null;
  notes: string | null;
  inspectorId: string | null;
  branchId: string | null;
  defects: QualityCheckDefect[];
  createdAt: string;
  updatedAt: string;
}

export interface QualityDefectCode {
  id: string;
  code: string;
  name: string;
  branchId: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface QualityCheckDefectInput {
  defectCodeId: string;
  quantity: number;
}

export interface CreateQualityCheckDTO {
  productionOrderId: string;
  inspectionType?: 'INCOMING' | 'IN_PROCESS' | 'FINAL';
  result?: 'PASS' | 'FAIL' | 'PENDING' | 'CONDITIONAL';
  quantityInspected?: number;
  quantityAccepted?: number;
  quantityRejected?: number;
  sampleSize?: number;
  acceptNumber?: number;
  rejectNumber?: number;
  notes?: string;
  defects?: QualityCheckDefectInput[];
}

export interface UpdateQualityCheckDTO {
  inspectionType?: 'INCOMING' | 'IN_PROCESS' | 'FINAL';
  result?: 'PASS' | 'FAIL' | 'PENDING' | 'CONDITIONAL';
  quantityInspected?: number;
  quantityAccepted?: number;
  quantityRejected?: number;
  sampleSize?: number | null;
  acceptNumber?: number | null;
  rejectNumber?: number | null;
  notes?: string | null;
  defects?: QualityCheckDefectInput[];
}
export interface DowntimeRecord {
  id: string;
  workCenterId: string | null;
  workCenterName?: string;
  operationId: string | null;
  productionOrderId: string | null;
  orderNumber?: string;
  minutes: number;
  reason: string | null;
  startedAt: string | null;
  endedAt: string | null;
  branchId: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface CreateDowntimeDTO {
  workCenterId?: string;
  operationId?: string;
  productionOrderId?: string;
  minutes: number;
  reason?: string;
  startedAt?: string;
  endedAt?: string;
  branchId?: string;
}

export interface MaintenanceRecord {
  id: string;
  workCenterId: string | null;
  equipmentName: string;
  maintenanceType: 'PREVENTIVE' | 'CORRECTIVE' | 'PREDICTIVE';
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  scheduledDate: string | null;
  completedDate: string | null;
  cost: number;
  notes: string | null;
  performedBy: string | null;
  branchId: string | null;
  /** Days between occurrences for PREVENTIVE records; null = one-off. */
  recurrenceIntervalDays: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMaintenanceDTO {
  workCenterId?: string;
  equipmentName: string;
  maintenanceType?: 'PREVENTIVE' | 'CORRECTIVE' | 'PREDICTIVE';
  scheduledDate?: string;
  notes?: string;
  branchId?: string;
  recurrenceIntervalDays?: number | null;
}

export interface UpdateMaintenanceDTO {
  status?: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  completedDate?: string;
  cost?: number;
  notes?: string | null;
  maintenanceType?: 'PREVENTIVE' | 'CORRECTIVE' | 'PREDICTIVE';
  recurrenceIntervalDays?: number | null;
}
export interface ProductionFloorRow {
  orderId: string;
  orderNumber: string;
  productName?: string;
  quantity: number;
  producedQty?: number;
  status: ProductionOrderStatus;
  priority: ProductionPriority;
  dueDate: string | null;
  branchName?: string | null;
  warehouseName?: string | null;
  salesOrderNumber?: string | null;
  customerName?: string | null;
  operationShiftId: string | null;
  opsTotal: number;
  opsCompleted: number;
  opsInProgress: number;
  currentOperation: {
    workCenterName?: string;
    sequence: number;
    plannedMinutes: number;
    status: string;
  } | null;
  materialsTotal: number;
  materialsPlannedQty: number;
  materialsConsumedQty: number;
  materialsShort: number;
  progressPercent: number;
  /** Produced quantity currently held pending final QC inspection. */
  qcHeldQty?: number;
}

export interface WipOrder {
  orderId: string;
  orderNumber: string;
  productName: string;
  quantity: number;
  status: ProductionOrderStatus;
  branchId: string;
  materialCost: number;
  finishedProductCostPrice: number;
}
export interface CreateWorkCenterDTO {

  code: string;
  name: string;
  description?: string;
  costPerHour?: number;
  overheadPerHour?: number;
  capacityPerDay?: number;
  branchId?: string;
  productionLineId?: string;
}

export interface UpdateWorkCenterDTO {
  code?: string;
  name?: string;
  description?: string | null;
  costPerHour?: number;
  overheadPerHour?: number;
  capacityPerDay?: number;
  productionLineId?: string | null;
  isActive?: boolean;
}

export interface CreateProductionLineDTO {
  code: string;
  name: string;
  description?: string;
  branchId?: string;
}

export interface UpdateProductionLineDTO {
  code?: string;
  name?: string;
  description?: string | null;
  isActive?: boolean;
}

export interface UpdateBomDTO {
  name?: string;
  version?: string;
  notes?: string | null;
  requiresFinalQc?: boolean;
  /** When provided, replaces the whole component list (DRAFT only). */
  items?: CreateBomDTO['items'];
}

export interface CreateBomDTO {
  productId: string;
  name: string;
  version?: string;
  notes?: string;
  items: Array<{ componentProductId: string; quantity: number; unit?: string; notes?: string }>;
  operations?: Array<{ workCenterId: string; minutesPerUnit: number }>;
  requiresFinalQc?: boolean;
}

export interface CreateProductionOrderDTO {
  productId: string;
  bomId: string;
  quantity: number;
  priority?: ProductionPriority;
  startDate?: string;
  dueDate?: string;
  branchId?: string;
  warehouseId?: string;
  operations?: Array<{ workCenterId: string; plannedMinutes: number }>;
  salesOrderId?: string;
  orderItemId?: string;
  customerId?: string;
  notes?: string;
  requiresApproval?: boolean;
}

export interface UpdateProductionOrderDTO {
  priority?: ProductionPriority;
  startDate?: string | null;
  dueDate?: string | null;
  notes?: string | null;
}

export interface CreateProductionOrderFromSalesItemDTO {
  quantity?: number;
  bomId?: string;
  priority?: ProductionPriority;
  startDate?: string;
  dueDate?: string;
  branchId?: string;
  warehouseId?: string;
  operations?: Array<{ workCenterId: string; plannedMinutes: number }>;
  notes?: string;
  requiresApproval?: boolean;
}

/** OEE (Overall Equipment Effectiveness) per work center. */
export interface OeeWorkCenterRow {
  workCenterId: string;
  code: string;
  name: string;
  branchId: string;
  /** Scheduled capacity minutes in the period (planned load denominator). */
  plannedMinutes: number;
  actualMinutes: number;
  downtimeMinutes: number;
  /** Availability = (planned − downtime) / planned. */
  availabilityPercent: number | null;
  /** Performance = planned / actual (faster than plan → >100). */
  performancePercent: number | null;
  /** Quality = accepted / inspected from quality checks on the center's orders. */
  qualityPercent: number | null;
  /** OEE = availability × performance(normalized ≤100) × quality. */
  oeePercent: number | null;
  /** Downtime minutes grouped by recorded reason (top contributors first). */
  downtimeReasons?: Array<{ reason: string; minutes: number; events: number }>;
}

/** HR attendance reconciliation for operators assigned to operations. */
export interface OperatorLaborRow {
  operatorId: string;
  operatorName: string;
  operationsCount: number;
  plannedMinutes: number;
  actualMinutes: number;
  /** Worked minutes recorded in HR attendance on operation dates. */
  attendanceMinutes: number;
  /** Minutes logged per-operation in production_operation_labor. */
  loggedMinutes: number;
  /** actual − attendance: positive means production logged beyond attendance. */
  varianceMinutes: number;
}

/** Per-day reconciliation: operation labor log vs HR attendance punches. */
export interface OperatorLaborDailyRow {
  operatorId: string;
  operatorName: string;
  workDate: string;
  /** Minutes logged on production operations that day. */
  operationMinutes: number;
  /** worked_minutes recorded in HR attendance for that date (0 if absent). */
  attendanceMinutes: number;
  checkInAt: string | null;
  checkOutAt: string | null;
}

/** What-if inputs for schedule simulation — nothing is persisted. */
export interface ProductionScheduleOptions {
  /** Orders to exclude from the simulated schedule. */
  excludeOrderIds?: string[];
  /** Scale factor applied to planned minutes (e.g. 1.2 = 20% slower). */
  minutesScale?: number;
}
