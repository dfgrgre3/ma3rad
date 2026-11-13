export type Measure = 'floor' | 'walls' | 'ceiling' | 'perimeter' | 'electricalPoints' | 'plumbingPoints' | 'doors' | 'windows' | 'balcony' | 'manual';

export type EstimateWall = { id: string; name: string; length: number; height: number };
export type EstimateOpening = { id: string; wallId: string; kind: 'door' | 'window'; name: string; count: number; width: number; height: number };

export type EstimateRoom = {
  id: string;
  name: string;
  length: number;
  width: number;
  height: number;
  doorCount: number;
  doorWidth: number;
  doorHeight: number;
  windowCount: number;
  windowWidth: number;
  windowHeight: number;
  shape?: 'rectangle' | 'polygon';
  polygonSides?: number[];
  polygonVertices?: Array<{ x: number; y: number }>;
  polygonCoordinatesInput?: string;
  walls?: EstimateWall[];
  openings?: EstimateOpening[];
  balconyLength?: number;
  balconyWidth?: number;
  electricalPoints?: number;
  plumbingPoints?: number;
};

export type EstimateLine = {
  id: string;
  category: string;
  name: string;
  measure: Measure;
  unit: string;
  manualQuantity: number;
  materialProductId: string;
  materialRate: number;
  laborRate: number;
  equipmentRate?: number;
  expenseRate?: number;
  materialPriceHistory?: Array<{ id: string; date: string; unitPrice: number; source: 'PRODUCT' | 'MANUAL'; note?: string }>;
  wastePercent: number;
  discountPercent: number;
  profitPercent: number;
  measureScope?: 'room' | 'wall';
  wallId?: string;
  workType?: 'FOUNDATION' | 'FINISHING';
  phase?: string;
  specifications?: string;
  notes?: string;
  attachments?: EstimateAttachment[];
};

export type EstimateAttachment = { id: string; name: string; mimeType: string; dataUrl: string; size: number };
