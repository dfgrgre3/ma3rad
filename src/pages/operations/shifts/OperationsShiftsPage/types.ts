import { localDateString } from '../../../../utils/shared/date';

export interface DefinitionFormState {
  id: string;
  name: string;
  department: string;
  location: string;
  shiftCode: string;
  color: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  graceMinutes: number;
  overtimeAfterMinutes: number;
  minimumStaffCount: number;
  requiredRestMinutes: number;
  workdays: number[];
  shiftOrder: number;
}

export const emptyDefinition = (): DefinitionFormState => ({
  id: '',
  name: '',
  department: '',
  location: '',
  shiftCode: '',
  color: '#0f766e',
  startTime: '08:00',
  endTime: '16:00',
  breakMinutes: 0,
  graceMinutes: 0,
  overtimeAfterMinutes: 0,
  minimumStaffCount: 0,
  requiredRestMinutes: 480,
  workdays: [0, 1, 2, 3, 4, 5, 6],
  shiftOrder: 0,
});

export interface AssignmentFormState {
  definitionId: string;
  employeeId: string;
  role: 'STAFF' | 'SUPERVISOR';
  effectiveFrom: string;
  effectiveTo: string;
}

export const initialAssignmentForm = (): AssignmentFormState => ({
  definitionId: '', employeeId: '', role: 'STAFF',
  effectiveFrom: localDateString(), effectiveTo: '',
});

export interface ReplacementFormState {
  absentEmployeeId: string;
  replacementEmployeeId: string;
  notes: string;
}

export const initialReplacementForm = (): ReplacementFormState => ({
  absentEmployeeId: '', replacementEmployeeId: '', notes: '',
});

export interface SwapFormState {
  requesterEmployeeId: string;
  targetEmployeeId: string;
  requesterShiftId: string;
  targetShiftId: string;
}

export const initialSwapForm = (): SwapFormState => ({
  requesterEmployeeId: '', targetEmployeeId: '', requesterShiftId: '', targetShiftId: '',
});

export interface OpenFormState {
  supervisorId: string;
  notes: string;
}

export const initialOpenForm = (): OpenFormState => ({ supervisorId: '', notes: '' });

export interface HandoverFormState {
  expectedCash: number;
  actualCash: number;
  cashDelivered: number;
  pendingOrders: string;
  inventoryStatus: string;
  equipmentStatus: string;
  notes: string;
  nextStaffIds: string[];
}

export const initialHandoverForm = (): HandoverFormState => ({
  expectedCash: 0, actualCash: 0, cashDelivered: 0, pendingOrders: '',
  inventoryStatus: '', equipmentStatus: '', notes: '', nextStaffIds: [],
});

export interface IncidentFormState {
  type: 'NOTE' | 'BREAKDOWN' | 'SAFETY' | 'QUALITY' | 'OTHER';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  description: string;
}

export const initialIncidentForm = (): IncidentFormState => ({
  type: 'NOTE', severity: 'MEDIUM', title: '', description: '',
});

export interface ProductionFormState {
  productionOrderId: string;
  productId: string;
  workCenterId: string;
  targetQty: number;
  producedQty: number;
  goodQty: number;
  scrapQty: number;
  downtimeMinutes: number;
  downtimeReason: string;
  notes: string;
}

export const initialProductionForm = (): ProductionFormState => ({
  productionOrderId: '', productId: '', workCenterId: '', targetQty: 0,
  producedQty: 0, goodQty: 0, scrapQty: 0, downtimeMinutes: 0,
  downtimeReason: '', notes: '',
});
