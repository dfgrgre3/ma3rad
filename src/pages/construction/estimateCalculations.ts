import type { EstimateLine, EstimateRoom } from '../../types/projects/estimateMeasurement';
export type { EstimateLine, EstimateRoom, Measure } from '../../types/projects/estimateMeasurement';

export type RoomMeasures = { floor: number; walls: number; ceiling: number; perimeter: number; electricalPoints: number; plumbingPoints: number; doors: number; windows: number; balcony: number };

export function getRoomWallLength(room: EstimateRoom, wallId: string): number {
  const wallIndex = room.walls?.findIndex((wall) => wall.id === wallId) ?? -1;
  if (wallIndex < 0) return 0;
  if (room.shape === 'polygon' && room.polygonVertices && wallIndex < room.polygonVertices.length) {
    const start = room.polygonVertices[wallIndex];
    const end = room.polygonVertices[(wallIndex + 1) % room.polygonVertices.length];
    return Math.hypot(end.x - start.x, end.y - start.y);
  }
  return Math.max(0, room.walls?.[wallIndex]?.length || 0);
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function getRoomMeasures(room: EstimateRoom): RoomMeasures {
  const vertices = room.polygonVertices || [];
  const polygonArea = vertices.length >= 3
    ? Math.abs(vertices.reduce((sum, point, index) => {
      const next = vertices[(index + 1) % vertices.length];
      return sum + point.x * next.y - next.x * point.y;
    }, 0)) / 2
    : 0;
  const polygonPerimeter = vertices.length >= 3
    ? vertices.reduce((sum, point, index) => {
      const next = vertices[(index + 1) % vertices.length];
      return sum + Math.hypot(next.x - point.x, next.y - point.y);
    }, 0)
    : 0;
  const sides = room.shape === 'polygon' && room.polygonSides?.length ? room.polygonSides : [room.length, room.width, room.length, room.width];
  const floor = room.shape === 'polygon' && polygonArea > 0
    ? polygonArea
    : Math.max(0, room.length * room.width);
  const perimeter = room.shape === 'polygon' && polygonPerimeter > 0
    ? polygonPerimeter
    : room.walls?.length ? room.walls.reduce((sum, wall) => sum + Math.max(0, wall.length), 0) : sides.reduce((sum, side) => sum + Math.max(0, side), 0);
  const explicitOpenings = room.openings || [];
  const hasExplicitDoors = explicitOpenings.some((opening) => opening.kind === 'door');
  const hasExplicitWindows = explicitOpenings.some((opening) => opening.kind === 'window');
  const openings = explicitOpenings.reduce((sum, opening) => sum + Math.max(0, opening.count) * Math.max(0, opening.width) * Math.max(0, opening.height), 0)
    + (!hasExplicitDoors ? Math.max(0, room.doorCount * room.doorWidth * room.doorHeight) : 0)
    + (!hasExplicitWindows ? Math.max(0, room.windowCount * room.windowWidth * room.windowHeight) : 0);
  const wallGross = room.shape === 'polygon' && vertices.length >= 3
    ? vertices.reduce((sum, point, index) => {
      const wall = room.walls?.[index];
      const next = vertices[(index + 1) % vertices.length];
      return sum + Math.hypot(next.x - point.x, next.y - point.y) * Math.max(0, wall?.height ?? room.height);
    }, 0) + (room.walls || []).slice(vertices.length).reduce((sum, wall) => sum + getRoomWallLength(room, wall.id) * Math.max(0, wall.height), 0)
    : room.walls?.length
      ? room.walls.reduce((sum, wall) => sum + getRoomWallLength(room, wall.id) * Math.max(0, wall.height), 0)
      : perimeter * Math.max(0, room.height);
  const doorCount = hasExplicitDoors ? explicitOpenings.filter((opening) => opening.kind === 'door').reduce((sum, opening) => sum + Math.max(0, opening.count), 0) : Math.max(0, room.doorCount);
  const windowCount = hasExplicitWindows ? explicitOpenings.filter((opening) => opening.kind === 'window').reduce((sum, opening) => sum + Math.max(0, opening.count), 0) : Math.max(0, room.windowCount);
  const balcony = Math.max(0, (room.balconyLength || 0) * (room.balconyWidth || 0));
  return {
    floor,
    walls: Math.max(0, wallGross - openings),
    ceiling: floor,
    perimeter,
    electricalPoints: Math.max(0, room.electricalPoints || 0),
    plumbingPoints: Math.max(0, room.plumbingPoints || 0),
    doors: doorCount,
    windows: windowCount,
    balcony,
  };
}

export function getQuantity(line: EstimateLine, room: EstimateRoom, roomCount: number): number {
  if (line.measure === 'manual') return Math.max(0, line.manualQuantity) / Math.max(1, roomCount);
  if (line.measureScope === 'wall' && line.wallId && room.walls?.length) {
    const wall = room.walls.find((item) => item.id === line.wallId);
    if (!wall) return 0;
    const gross = getRoomWallLength(room, wall.id) * Math.max(0, wall.height);
    const deductions = room.openings?.filter((opening) => opening.wallId === wall.id)
      .reduce((sum, opening) => sum + Math.max(0, opening.count) * Math.max(0, opening.width) * Math.max(0, opening.height), 0) || 0;
    return Math.max(0, gross - deductions);
  }
  return getRoomMeasures(room)[line.measure];
}

export function getMeasureFormula(line: EstimateLine, room: EstimateRoom, roomCount: number): string {
  const measures = getRoomMeasures(room);
  if (line.measure === 'manual') return `${line.manualQuantity} ÷ ${Math.max(1, roomCount)} غرفة`;
  if (line.measureScope === 'wall' && line.wallId && room.walls?.length) {
    const wall = room.walls.find((item) => item.id === line.wallId);
    const openings = room.openings?.filter((opening) => opening.wallId === line.wallId) || [];
    const deductions = openings.map((item) => `${item.count}×${item.width}×${item.height}`).join(' + ') || '0';
    return `${getRoomWallLength(room, line.wallId)}×${wall?.height || 0} − (${deductions})`;
  }
  if (line.measure === 'floor' || line.measure === 'ceiling') return room.shape === 'polygon' && room.polygonVertices?.length
    ? `مساحة المضلع بالإحداثيات: ${room.polygonVertices.map((point) => `(${point.x},${point.y})`).join('، ')}`
    : `${room.length}×${room.width}`;
  if (line.measure === 'walls') {
    const gross = room.shape === 'polygon' && room.polygonVertices?.length
      ? room.polygonVertices.map((point, index) => {
        const next = room.polygonVertices![(index + 1) % room.polygonVertices!.length];
        const height = room.walls?.[index]?.height ?? room.height;
        return `${Math.hypot(next.x - point.x, next.y - point.y).toFixed(2)}×${height}`;
      }).join(' + ')
      : room.walls?.length ? room.walls.map((wall) => `${wall.length}×${wall.height}`).join(' + ')
        : `${measures.perimeter}×${room.height}`;
    return `${gross} − مساحة الفتحات`;
  }
  if (line.measure === 'perimeter') return room.shape === 'polygon' && room.polygonVertices?.length
    ? room.polygonVertices.map((point, index) => {
      const next = room.polygonVertices![(index + 1) % room.polygonVertices!.length];
      return Math.hypot(next.x - point.x, next.y - point.y).toFixed(2);
    }).join(' + ')
    : (room.walls?.length ? room.walls.map((wall) => wall.length).join(' + ') : `${room.length}+${room.width}+${room.length}+${room.width}`);
  if (line.measure === 'balcony') return `${room.balconyLength || 0}×${room.balconyWidth || 0}`;
  return `إجمالي ${line.measure === 'doors' ? 'الأبواب' : line.measure === 'windows' ? 'الشبابيك' : line.measure === 'electricalPoints' ? 'نقاط الكهرباء' : 'نقاط السباكة'} بالغرفة`;
}

export function getRoomLineTotal(line: EstimateLine, room: EstimateRoom, roomCount: number) {
  const quantity = getQuantity(line, room, roomCount);
  const materialQuantity = round2(quantity * (1 + Math.max(0, line.wastePercent) / 100));
  const materialCost = round2(materialQuantity * Math.max(0, line.materialRate));
  const laborCost = round2(quantity * Math.max(0, line.laborRate));
  const equipmentCost = round2(quantity * Math.max(0, line.equipmentRate || 0));
  const expenseCost = round2(quantity * Math.max(0, line.expenseRate || 0));
  const beforeAdjustments = round2(materialCost + laborCost + equipmentCost + expenseCost);
  const saleBeforeDiscount = round2(beforeAdjustments * (1 + Math.max(0, line.profitPercent) / 100));
  const total = round2(saleBeforeDiscount * (1 - Math.min(100, Math.max(0, line.discountPercent)) / 100));
  const profitAmount = round2(total - beforeAdjustments);
  return { quantity, materialQuantity, materialCost, laborCost, equipmentCost, expenseCost, cost: beforeAdjustments, beforeAdjustments, profitAmount, total };
}
