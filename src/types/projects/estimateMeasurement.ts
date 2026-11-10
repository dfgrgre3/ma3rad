export type Measure = 'floor' | 'walls' | 'ceiling' | 'perimeter' | 'manual';

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
  wastePercent: number;
  discountPercent: number;
  profitPercent: number;
};
