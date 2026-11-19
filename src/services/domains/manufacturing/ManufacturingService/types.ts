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
  capacityPerDay: number;
  branchId: string;
  isActive: number;
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
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductionOrderMaterial {
  id: string;
  orderId: string;
  productId: string;
  productName?: string;
  plannedQty: number;
  consumedQty: number;
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
  totalCost: number;
  costPerUnit: number;
  currency?: string;
}

export interface ProductionCostReport {
  orders: ProductionOrderCost[];
  totalMaterialCost: number;
  totalLaborCost: number;
  totalCost: number;
  totalQuantity: number;
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

export interface QualityCheck {
  id: string;
  productionOrderId: string;
  inspectionType: 'INCOMING' | 'IN_PROCESS' | 'FINAL';
  result: 'PASS' | 'FAIL' | 'PENDING' | 'CONDITIONAL';
  quantityInspected: number;
  quantityAccepted: number;
  quantityRejected: number;
  disposition: 'NONE' | 'ACCEPT' | 'SCRAP' | 'REWORK' | 'RETURN';
  dispositionQty: number;
  dispositionAt: string | null;
  notes: string | null;
  inspectorId: string | null;
  branchId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateQualityCheckDTO {
  productionOrderId: string;
  inspectionType?: 'INCOMING' | 'IN_PROCESS' | 'FINAL';
  result?: 'PASS' | 'FAIL' | 'PENDING' | 'CONDITIONAL';
  quantityInspected?: number;
  quantityAccepted?: number;
  quantityRejected?: number;
  notes?: string;
}

export interface UpdateQualityCheckDTO {
  inspectionType?: 'INCOMING' | 'IN_PROCESS' | 'FINAL';
  result?: 'PASS' | 'FAIL' | 'PENDING' | 'CONDITIONAL';
  quantityInspected?: number;
  quantityAccepted?: number;
  quantityRejected?: number;
  notes?: string | null;
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
}

export interface UpdateMaintenanceDTO {
  status?: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  completedDate?: string;
  cost?: number;
  notes?: string | null;
  maintenanceType?: 'PREVENTIVE' | 'CORRECTIVE' | 'PREDICTIVE';
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
  capacityPerDay?: number;
  branchId?: string;
}

export interface CreateBomDTO {
  productId: string;
  name: string;
  version?: string;
  notes?: string;
  items: Array<{ componentProductId: string; quantity: number; unit?: string; notes?: string }>;
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
}
