import type { EstimateLine, EstimateRoom } from '../../types/projects/estimateMeasurement';
export type { EstimateLine, EstimateRoom, Measure } from '../../types/projects/estimateMeasurement';

export type RoomMeasures = { floor: number; walls: number; ceiling: number; perimeter: number };

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function getRoomMeasures(room: EstimateRoom): RoomMeasures {
  const floor = Math.max(0, room.length * room.width);
  const perimeter = Math.max(0, 2 * (room.length + room.width));
  const openings = Math.max(0, room.doorCount * room.doorWidth * room.doorHeight)
    + Math.max(0, room.windowCount * room.windowWidth * room.windowHeight);
  return {
    floor,
    walls: Math.max(0, perimeter * room.height - openings),
    ceiling: floor,
    perimeter,
  };
}

export function getQuantity(line: EstimateLine, room: EstimateRoom, roomCount: number): number {
  if (line.measure === 'manual') return Math.max(0, line.manualQuantity) / Math.max(1, roomCount);
  return getRoomMeasures(room)[line.measure];
}

export function getRoomLineTotal(line: EstimateLine, room: EstimateRoom, roomCount: number) {
  const quantity = getQuantity(line, room, roomCount);
  const materialQuantity = round2(quantity * (1 + Math.max(0, line.wastePercent) / 100));
  const materialCost = round2(materialQuantity * Math.max(0, line.materialRate));
  const laborCost = round2(quantity * Math.max(0, line.laborRate));
  const beforeAdjustments = round2(materialCost + laborCost);
  const afterDiscount = round2(beforeAdjustments * (1 - Math.min(100, Math.max(0, line.discountPercent)) / 100));
  const total = round2(afterDiscount * (1 + Math.max(0, line.profitPercent) / 100));
  return { quantity, materialQuantity, materialCost, laborCost, beforeAdjustments, total };
}
