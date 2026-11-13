import type { EstimateLine, EstimateRoom } from '../../../types/projects/estimateMeasurement';
import type { EstimatePayment } from '../../../types/projects/apartmentEstimate';

const finiteNonNegative = (value: number | undefined, label: string, errors: string[]) => {
  if (value === undefined) return;
  if (!Number.isFinite(value) || value < 0) errors.push(`${label}: أدخل رقمًا صالحًا لا يقل عن صفر.`);
};

const cross = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

const segmentsIntersect = (
  a: { x: number; y: number }, b: { x: number; y: number },
  c: { x: number; y: number }, d: { x: number; y: number },
) => {
  const abC = cross(a, b, c); const abD = cross(a, b, d);
  const cdA = cross(c, d, a); const cdB = cross(c, d, b);
  return abC * abD < 0 && cdA * cdB < 0;
};

function polygonErrors(room: EstimateRoom): string[] {
  if (room.shape !== 'polygon') return [];
  const errors: string[] = [];
  const points = room.polygonVertices || [];
  if (room.polygonCoordinatesInput?.trim()) {
    const rawPoints = room.polygonCoordinatesInput.split(';').filter((point) => point.trim());
    const malformed = rawPoints.some((point) => {
      const pair = point.split(',');
      return pair.length !== 2 || pair.some((value) => !value.trim() || !Number.isFinite(Number(value)));
    });
    if (malformed || rawPoints.length !== points.length) errors.push('صيغة الإحداثيات غير مكتملة؛ استخدم س،ص لكل نقطة وافصل بين النقاط بفاصلة منقوطة.');
  }
  if (points.length < 3) return ['أدخل ثلاث نقاط إحداثية على الأقل للغرفة غير المنتظمة.'];
  if (points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) errors.push('إحداثيات رؤوس الغرفة يجب أن تكون أرقامًا صالحة.');
  if (points.some((point, index) => {
    const next = points[(index + 1) % points.length];
    return Math.hypot(next.x - point.x, next.y - point.y) < 0.0001;
  })) errors.push('لا يمكن تكرار رأس متتالٍ أو تكوين ضلع طوله صفر.');
  const area2 = points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0);
  if (Math.abs(area2) < 0.0001) errors.push('مساحة المضلع تساوي صفرًا؛ راجع ترتيب الإحداثيات.');
  for (let i = 0; i < points.length; i += 1) {
    const iNext = (i + 1) % points.length;
    for (let j = i + 1; j < points.length; j += 1) {
      const jNext = (j + 1) % points.length;
      if (i === j || iNext === j || jNext === i) continue;
      if (segmentsIntersect(points[i], points[iNext], points[j], points[jNext])) {
        errors.push('حدود الغرفة تتقاطع؛ أدخل الرؤوس بالتتابع حول المحيط.');
        return errors;
      }
    }
  }
  return errors;
}

export function validateEstimateMeasurements(input: {
  name: string;
  areaM2: number;
  rooms: EstimateRoom[];
  costLines: EstimateLine[];
  payments?: EstimatePayment[];
  contingencyPercent?: number;
  taxPercent?: number;
  totalAmount?: number;
  totalPayable?: number;
  paidAmount?: number;
}): string[] {
  const errors: string[] = [];
  if (!input.name.trim()) errors.push('اسم المقايسة مطلوب.');
  finiteNonNegative(input.areaM2, 'المساحة', errors);
  if (!Number.isFinite(input.areaM2) || input.areaM2 <= 0) errors.push('المساحة يجب أن تكون أكبر من صفر.');
  finiteNonNegative(input.contingencyPercent, 'نسبة الاحتياطي', errors);
  finiteNonNegative(input.taxPercent, 'نسبة الضريبة', errors);
  if ((input.taxPercent || 0) > 100) errors.push('نسبة الضريبة لا يمكن أن تتجاوز 100%.');
  finiteNonNegative(input.totalAmount, 'إجمالي المقايسة', errors);
  finiteNonNegative(input.paidAmount, 'إجمالي المدفوع', errors);
  if (!input.rooms.length) errors.push('أضف غرفة واحدة على الأقل.');
  input.rooms.forEach((room, index) => {
    const label = room.name.trim() || `الغرفة ${index + 1}`;
    if (!room.name.trim()) errors.push(`اسم ${label} مطلوب.`);
    for (const [field, value] of Object.entries({ الطول: room.length, العرض: room.width, الارتفاع: room.height })) {
      if (!Number.isFinite(value) || value <= 0) errors.push(`${label}: ${field} يجب أن يكون أكبر من صفر.`);
    }
    for (const [field, value] of Object.entries({
      عدد_الأبواب: room.doorCount, عرض_الباب: room.doorWidth, ارتفاع_الباب: room.doorHeight,
      عدد_النوافذ: room.windowCount, عرض_النافذة: room.windowWidth, ارتفاع_النافذة: room.windowHeight,
    })) finiteNonNegative(value, `${label}: ${field.replaceAll('_', ' ')}`, errors);
    if (room.doorCount > 0 && (room.doorWidth <= 0 || room.doorHeight <= 0)) errors.push(`${label}: أبعاد الباب يجب أن تكون أكبر من صفر عند إدخال عدد أبواب.`);
    if (room.windowCount > 0 && (room.windowWidth <= 0 || room.windowHeight <= 0)) errors.push(`${label}: أبعاد النافذة يجب أن تكون أكبر من صفر عند إدخال عدد نوافذ.`);
    errors.push(...polygonErrors(room).map((message) => `${label}: ${message}`));
    room.walls?.forEach((wall) => {
      if (!Number.isFinite(wall.length) || wall.length <= 0) errors.push(`${label}، ${wall.name}: طول الجدار يجب أن يكون أكبر من صفر.`);
      if (!Number.isFinite(wall.height) || wall.height <= 0) errors.push(`${label}، ${wall.name}: ارتفاع الجدار يجب أن يكون أكبر من صفر.`);
    });
    room.openings?.forEach((opening) => {
      const openingName = `${label}، ${opening.name || 'الفتحة'}`;
      for (const [field, value] of Object.entries({ العدد: opening.count, العرض: opening.width, الارتفاع: opening.height })) {
        if (!Number.isFinite(value) || value < 0) errors.push(`${openingName}: ${field} يجب ألا يقل عن صفر.`);
      }
      if (opening.count > 0 && (opening.width <= 0 || opening.height <= 0)) errors.push(`${openingName}: أدخل عرضًا وارتفاعًا أكبر من صفر.`);
      if (room.walls?.length && !room.walls.some((wall) => wall.id === opening.wallId)) errors.push(`${openingName}: الفتحة غير مرتبطة بجدار موجود.`);
    });
    if (room.openings?.length) {
      room.walls?.forEach((wall, wallIndex) => {
        const edgeStart = room.polygonVertices?.[wallIndex];
        const edgeEnd = room.polygonVertices?.[(wallIndex + 1) % (room.polygonVertices?.length || 1)];
        const wallLength = room.shape === 'polygon' && edgeStart && edgeEnd
          ? Math.hypot(edgeEnd.x - edgeStart.x, edgeEnd.y - edgeStart.y)
          : wall.length;
        const openingArea = room.openings?.filter((opening) => opening.wallId === wall.id)
          .reduce((sum, opening) => sum + opening.count * opening.width * opening.height, 0) || 0;
        if (openingArea > wallLength * wall.height + 0.005) errors.push(`${label}، ${wall.name}: مساحة الفتحات تتجاوز مساحة الجدار.`);
      });
    }
    const explicit = room.openings || [];
    const hasDoor = explicit.some((opening) => opening.kind === 'door');
    const hasWindow = explicit.some((opening) => opening.kind === 'window');
    const openingArea = explicit.reduce((sum, opening) => sum + opening.count * opening.width * opening.height, 0)
      + (!hasDoor ? room.doorCount * room.doorWidth * room.doorHeight : 0)
      + (!hasWindow ? room.windowCount * room.windowWidth * room.windowHeight : 0);
    let grossWallArea: number;
    if (room.shape === 'polygon' && room.polygonVertices && room.polygonVertices.length >= 3) {
      grossWallArea = room.polygonVertices.reduce((sum, point, pointIndex) => {
        const next = room.polygonVertices![(pointIndex + 1) % room.polygonVertices!.length];
        return sum + Math.hypot(next.x - point.x, next.y - point.y) * (room.walls?.[pointIndex]?.height ?? room.height);
      }, 0) + (room.walls || []).slice(room.polygonVertices.length).reduce((sum, wall) => sum + wall.length * wall.height, 0);
    } else if (room.walls?.length) {
      grossWallArea = room.walls.reduce((sum, wall) => sum + wall.length * wall.height, 0);
    } else {
      grossWallArea = 2 * (room.length + room.width) * room.height;
    }
    if (openingArea > grossWallArea + 0.005) errors.push(`${label}: مجموع مساحة الأبواب والنوافذ يتجاوز مساحة الجدران.`);
    if (input.costLines.some((line) => line.measureScope === 'wall')) {
      if (room.doorCount > 0 && !room.openings?.some((opening) => opening.kind === 'door')) errors.push(`${label}: اربط الأبواب بالجدران لتوزيع خصم الفتحات بدقة.`);
      if (room.windowCount > 0 && !room.openings?.some((opening) => opening.kind === 'window')) errors.push(`${label}: اربط النوافذ بالجدران لتوزيع خصم الفتحات بدقة.`);
    }
    for (const [field, value] of Object.entries({ طول_البلكونة: room.balconyLength || 0, عرض_البلكونة: room.balconyWidth || 0, نقاط_الكهرباء: room.electricalPoints || 0, نقاط_السباكة: room.plumbingPoints || 0 })) {
      finiteNonNegative(value, `${label}: ${field.replaceAll('_', ' ')}`, errors);
    }
  });
  input.costLines.forEach((line, index) => {
    const label = line.name.trim() || `البند ${index + 1}`;
    if (!line.name.trim()) errors.push(`اسم ${label} مطلوب.`);
    if (!line.unit.trim()) errors.push(`${label}: وحدة القياس مطلوبة.`);
    for (const [field, value] of Object.entries({
      الكمية: line.manualQuantity, سعر_الخامات: line.materialRate, العمالة: line.laborRate,
      المعدات: line.equipmentRate || 0, المصروفات: line.expenseRate || 0, الهالك: line.wastePercent,
      الخصم: line.discountPercent, الربح: line.profitPercent,
    })) finiteNonNegative(value, `${label}: ${field.replaceAll('_', ' ')}`, errors);
    if (line.discountPercent > 100) errors.push(`${label}: الخصم لا يمكن أن يتجاوز 100%.`);
    if (line.workType && !['FOUNDATION', 'FINISHING'].includes(line.workType)) errors.push(`${label}: نوع العمل غير صالح.`);
  });
  (input.payments || []).forEach((payment, index) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payment.date) || Number.isNaN(Date.parse(payment.date))) errors.push(`الدفعة ${index + 1}: تاريخ غير صالح.`);
    finiteNonNegative(payment.amount, `الدفعة ${index + 1}`, errors);
    if (!payment.method.trim()) errors.push(`الدفعة ${index + 1}: طريقة الدفع مطلوبة.`);
  });
  const payable = input.totalPayable ?? (Number(input.totalAmount) || 0)
    * (1 + (Number(input.contingencyPercent) || 0) / 100)
    * (1 + (Number(input.taxPercent) || 0) / 100);
  const paymentsTotal = (Number(input.paidAmount) || 0) + (input.payments || []).reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
  if (paymentsTotal > payable + 0.005) errors.push('إجمالي الدفعات يتجاوز قيمة المقايسة النهائية.');
  return [...new Set(errors)].slice(0, 30);
}
