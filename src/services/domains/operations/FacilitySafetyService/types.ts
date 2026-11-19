export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type RiskStatus = 'OPEN' | 'MITIGATED' | 'ACCEPTED' | 'CLOSED' | 'REVIEWED';
export type RiskCategory = 'SAFETY' | 'HEALTH' | 'ENVIRONMENT' | 'SECURITY' | 'EQUIPMENT' | 'FIRE' | 'ERGONOMICS' | 'ELECTRICAL' | 'OTHER';
export type RiskType = 'PHYSICAL' | 'CHEMICAL' | 'BIOLOGICAL' | 'ERGONOMIC' | 'PSYCHOSOCIAL' | 'OTHER';
export type Probability = 'RARE' | 'UNLIKELY' | 'POSSIBLE' | 'LIKELY' | 'ALMOST_CERTAIN';
export type Impact = 'INSIGNIFICANT' | 'MINOR' | 'MODERATE' | 'MAJOR' | 'CATASTROPHIC';

export type InspectionResult = 'PASS' | 'OBSERVATION' | 'FAIL' | 'CLOSED';
export type InspectionItemResult = 'PASS' | 'FAIL' | 'N_A';

export type AccidentType = 'INJURY' | 'NEAR_MISS' | 'PROPERTY_DAMAGE' | 'FIRE' | 'SPILL' | 'OTHER';
export type AccidentSeverity = 'MINOR' | 'MODERATE' | 'SERIOUS' | 'CRITICAL' | 'FATAL';
export type AccidentStatus = 'OPEN' | 'INVESTIGATING' | 'CLOSED';
export type InvestigationStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'NOT_REQUIRED';

export type CAPAStatus = 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'VERIFIED' | 'CLOSED';
export type CAPAType = 'CORRECTIVE' | 'PREVENTIVE';
export type CAPAPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type FireEquipmentType = 'FIRE_EXTINGUISHER' | 'FIRE_ALARM' | 'SMOKE_DETECTOR' | 'EMERGENCY_EXIT' | 'EXIT_SIGN' | 'FIRE_HOSE' | 'SPRINKLER' | 'OTHER';
export type FireEquipmentStatus = 'ACTIVE' | 'MAINTENANCE' | 'EXPIRED' | 'OUT_OF_SERVICE' | 'RETIRED';

export type DrillType = 'FIRE' | 'EARTHQUAKE' | 'GENERAL_EVACUATION' | 'LOCKDOWN';
export type DrillResult = 'SUCCESS' | 'PARTIAL' | 'FAILED';

export type PPEType = 'HELMET' | 'GOGGLES' | 'GLOVES' | 'MASK' | 'EAR_PROTECTION' | 'SAFETY_SHOES' | 'HARNESS' | 'HIGH_VISIBILITY' | 'OTHER';
export type PPEStatus = 'ACTIVE' | 'MAINTENANCE' | 'EXPIRED' | 'RETIRED';
export type PPEAssignmentStatus = 'ACTIVE' | 'RETURNED' | 'LOST' | 'DAMAGED';

export type TrainingType = 'FIRE_SAFETY' | 'FIRST_AID' | 'PPE_USAGE' | 'ERGONOMICS' | 'EMERGENCY_EVACUATION' | 'HAZARD_AWARENESS' | 'OTHER';
export type TrainingStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';
export type AttendanceStatus = 'ATTENDED' | 'ABSENT' | 'EXCUSED';

export interface RiskRegisterItem {
  id: string;
  riskCode: string;
  riskTitle: string;
  locationId: string;
  locationName: string;
  branchId: string;
  branchName: string;
  assetId: string | null;
  assetName: string | null;
  riskCategory: RiskCategory;
  riskType: RiskType;
  hazardDescription: string;
  probability: Probability;
  impact: Impact;
  riskScore: number;
  riskLevel: RiskLevel;
  existingControls: string | null;
  mitigationPlan: string | null;
  responsibleEmployeeId: string | null;
  responsibleEmployeeName: string | null;
  targetDate: string | null;
  status: RiskStatus;
  reviewDate: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface RiskRegisterInput {
  locationId: string;
  assetId?: string | null;
  riskTitle: string;
  riskCategory: RiskCategory;
  riskType: RiskType;
  hazardDescription: string;
  probability: Probability;
  impact: Impact;
  existingControls?: string | null;
  mitigationPlan?: string | null;
  responsibleEmployeeId?: string | null;
  targetDate?: string | null;
  reviewDate?: string | null;
}

export interface InspectionChecklist {
  id: string;
  checklistCode: string;
  checklistName: string;
  category: string;
  applicableLocationTypes: string;
  isActive: boolean;
  itemCount: number;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface InspectionChecklistInput {
  checklistName: string;
  category: string;
  applicableLocationTypes?: string;
  isActive?: boolean;
  items: Array<{
    itemCode: string;
    itemName: string;
    itemDescription?: string | null;
    isCritical?: boolean;
    sortOrder?: number;
  }>;
}

export interface InspectionChecklistItem {
  id: string;
  itemCode: string;
  itemName: string;
  itemDescription: string | null;
  isCritical: boolean;
  sortOrder: number;
  isActive: boolean;
}

export interface InspectionRecord {
  id: string;
  checklistId: string;
  checklistName: string;
  locationId: string;
  locationName: string;
  branchId: string;
  assetId: string | null;
  assetName: string | null;
  inspectionDate: string;
  inspectorId: string;
  inspectorName: string;
  overallResult: InspectionResult;
  totalItems: number;
  passedItems: number;
  failedItems: number;
  observations: string | null;
  nextInspectionDate: string | null;
  status: 'OPEN' | 'CLOSED';
  items: InspectionRecordItem[];
  createdAt: string;
  updatedAt: string;
}

export interface InspectionRecordInput {
  checklistId: string;
  locationId: string;
  assetId?: string | null;
  inspectionDate: string;
  inspectorId: string;
  overallResult: InspectionResult;
  observations?: string | null;
  nextInspectionDate?: string | null;
  items: Array<{
    checklistItemId: string;
    itemName: string;
    result: InspectionItemResult;
    observation?: string | null;
    correctiveAction?: string | null;
    dueDate?: string | null;
  }>;
}

export interface InspectionRecordItem {
  id: string;
  checklistItemId: string;
  itemName: string;
  result: InspectionItemResult;
  observation: string | null;
  correctiveAction: string | null;
  dueDate: string | null;
}

export interface AccidentRecord {
  id: string;
  accidentCode: string;
  locationId: string;
  locationName: string;
  branchId: string;
  branchName: string;
  assetId: string | null;
  assetName: string | null;
  accidentDate: string;
  accidentType: AccidentType;
  severity: AccidentSeverity;
  injuredEmployeeId: string | null;
  injuredEmployeeName: string | null;
  description: string;
  immediateAction: string | null;
  investigationRequired: boolean;
  investigationStatus: InvestigationStatus;
  rootCause: string | null;
  correctiveAction: string | null;
  preventiveAction: string | null;
  daysLost: number;
  reportedBy: string;
  reportedByName: string;
  reportedAt: string;
  closedAt: string | null;
  status: AccidentStatus;
}

export interface AccidentRecordInput {
  locationId: string;
  assetId?: string | null;
  accidentDate: string;
  accidentType: AccidentType;
  severity: AccidentSeverity;
  injuredEmployeeId?: string | null;
  description: string;
  immediateAction?: string | null;
  investigationRequired?: boolean;
}

export interface CAPAItem {
  id: string;
  capaCode: string;
  sourceType: string;
  sourceId: string;
  sourceTitle: string;
  title: string;
  description: string;
  actionType: CAPAType;
  priority: CAPAPriority;
  assignedEmployeeId: string | null;
  assignedEmployeeName: string | null;
  dueDate: string | null;
  status: CAPAStatus;
  effectivenessCheck: boolean;
  effectivenessNotes: string | null;
  completedAt: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface CAPAInput {
  sourceType: string;
  sourceId: string;
  sourceTitle: string;
  title: string;
  description: string;
  actionType: CAPAType;
  priority: CAPAPriority;
  assignedEmployeeId?: string | null;
  dueDate?: string | null;
}

export interface FireEquipment {
  id: string;
  equipmentCode: string;
  equipmentName: string;
  locationId: string;
  locationName: string;
  branchId: string;
  assetId: string | null;
  assetName: string | null;
  equipmentType: FireEquipmentType;
  installationDate: string | null;
  lastInspectionDate: string | null;
  nextInspectionDate: string | null;
  inspectionFrequencyMonths: number;
  lastServiceDate: string | null;
  nextServiceDate: string | null;
  serviceFrequencyMonths: number;
  expiryDate: string | null;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  capacityRating: string | null;
  status: FireEquipmentStatus;
  locationDescription: string | null;
  responsibleEmployeeId: string | null;
  responsibleEmployeeName: string | null;
  isInspectionDue: boolean;
  isServiceDue: boolean;
  isExpired: boolean;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface FireEquipmentInput {
  locationId: string;
  assetId?: string | null;
  equipmentName: string;
  equipmentType: FireEquipmentType;
  installationDate?: string | null;
  inspectionFrequencyMonths?: number;
  serviceFrequencyMonths?: number;
  expiryDate?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  capacityRating?: string | null;
  locationDescription?: string | null;
  responsibleEmployeeId?: string | null;
}

export interface EvacuationDrill {
  id: string;
  drillCode: string;
  locationId: string;
  locationName: string;
  branchId: string;
  drillDate: string;
  drillType: DrillType;
  plannedEvacuationTimeMinutes: number;
  actualEvacuationTimeMinutes: number;
  participantsCount: number;
  evacuatedCount: number;
  result: DrillResult;
  observations: string | null;
  lessonsLearned: string | null;
  improvements: string | null;
  conductedBy: string;
  conductedByName: string;
  createdAt: string;
}

export interface EvacuationDrillInput {
  locationId: string;
  drillDate: string;
  drillType: DrillType;
  plannedEvacuationTimeMinutes?: number;
  actualEvacuationTimeMinutes?: number;
  participantsCount?: number;
  evacuatedCount?: number;
  result: DrillResult;
  observations?: string | null;
  lessonsLearned?: string | null;
  improvements?: string | null;
  conductedBy: string;
}

export interface PPEInventory {
  id: string;
  ppeCode: string;
  ppeName: string;
  locationId: string;
  locationName: string;
  branchId: string;
  ppeType: PPEType;
  quantityTotal: number;
  quantityAvailable: number;
  quantityInUse: number;
  size: string | null;
  manufacturer: string | null;
  model: string | null;
  expiryDate: string | null;
  status: PPEStatus;
  notes: string | null;
  isExpired: boolean;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface PPEInventoryInput {
  locationId: string;
  ppeName: string;
  ppeType: PPEType;
  quantityTotal: number;
  size?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  expiryDate?: string | null;
  notes?: string | null;
}

export interface PPEAssignment {
  id: string;
  ppeInventoryId: string;
  ppeName: string;
  ppeCode: string;
  employeeId: string;
  employeeName: string;
  assignedDate: string;
  returnDate: string | null;
  status: PPEAssignmentStatus;
  conditionAtReturn: string | null;
  notes: string | null;
  assignedBy: string;
  assignedByName: string;
  assignedAt: string;
}

export interface PPEAssignmentInput {
  ppeInventoryId: string;
  employeeId: string;
  assignedDate: string;
  notes?: string | null;
}

export interface SafetyTraining {
  id: string;
  trainingCode: string;
  trainingName: string;
  trainingType: TrainingType;
  trainerName: string | null;
  trainingDate: string;
  durationHours: number;
  locationId: string | null;
  locationName: string | null;
  branchId: string;
  branchName: string;
  certificateNumber: string | null;
  certificateExpiryDate: string | null;
  status: TrainingStatus;
  attendeeCount: number;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface SafetyTrainingInput {
  trainingName: string;
  trainingType: TrainingType;
  trainerName?: string | null;
  trainingDate: string;
  durationHours?: number;
  locationId?: string | null;
  certificateNumber?: string | null;
  certificateExpiryDate?: string | null;
  status?: TrainingStatus;
}

export interface SafetyTrainingAttendee {
  id: string;
  employeeId: string;
  employeeName: string;
  attendanceStatus: AttendanceStatus;
  testScore: number | null;
  certificateIssued: boolean;
  notes: string | null;
}

export interface SafetyStats {
  totalRisks: number;
  criticalRisks: number;
  highRisks: number;
  openRisks: number;
  mitigatedRisks: number;
  totalInspections: number;
  failedInspections: number;
  totalAccidents: number;
  seriousAccidents: number;
  openAccidents: number;
  totalCAPA: number;
  overdueCAPA: number;
  fireEquipmentDueInspection: number;
  ppeExpiringSoon: number;
  trainingExpiringSoon: number;
}
