import { ProcurementService } from '../../../services/domains/procurement/ProcurementService';
import { PurchaseRequestService } from '../../../services/domains/purchases/PurchaseRequestService';
import { InventoryService } from '../../../services/domains/inventory/InventoryService';
import { getRoomLineTotal } from '../estimateCalculations';
import type { Product } from '../../../types';
import {
  estimateUnitFactor, LOCAL_LINE_TEMPLATES_KEY, makeId,
  type CostLine, type LineTemplate, type Room,
} from './estimateModel';
import type { ApartmentEstimateState } from './useApartmentEstimateState';

export const useEstimateEditing = (s: ApartmentEstimateState) => {
  const {
    rooms, lines, products, stock, warehouseId, projectId, apartmentName,
    lineTemplates, setLineTemplates, setLines, setRooms,
    setDataError, setPriceHistory, setMaterialActionBusy, setMaterialActionsCreated,
  } = s;

  const patchRoom = (id: string, patch: Partial<Room>) => setRooms((current) =>
    current.map((room) => room.id === id ? { ...room, ...patch } : room));
  const patchLine = (id: string, patch: Partial<CostLine>) => setLines((current) =>
    current.map((line) => {
      if (line.id !== id) return line;
      const next = { ...line, ...patch };
      if (patch.materialRate !== undefined && patch.materialRate !== line.materialRate && !patch.materialPriceHistory) {
        next.materialPriceHistory = [...(line.materialPriceHistory || []), {
          id: makeId(), date: new Date().toISOString(), unitPrice: patch.materialRate,
          source: 'MANUAL', note: 'تعديل سعر المادة في المقايسة',
        }];
      }
      return next;
    }));

  const saveLineTemplate = (line: CostLine) => {
    const name = window.prompt('اسم القالب');
    if (!name?.trim()) return;
    const template: LineTemplate = { id: makeId(), name: name.trim(), line: { ...line, id: makeId(), materialProductId: '', attachments: [] } };
    const next = [...lineTemplates, template];
    setLineTemplates(next);
    try { window.localStorage.setItem(LOCAL_LINE_TEMPLATES_KEY, JSON.stringify(next)); }
    catch { setDataError('تعذر حفظ قالب البند في هذا الجهاز.'); }
  };
  const applyLineTemplate = (templateId: string) => {
    const template = lineTemplates.find((item) => item.id === templateId);
    if (template) setLines((current) => [...current, { ...template.line, id: makeId(), attachments: [] }]);
  };
  const addLineAttachment = async (line: CostLine, file?: File) => {
    if (!file) return;
    if (file.size > 250_000) { setDataError('الحد الأقصى للمرفق 250 كيلوبايت لضمان حفظ بيانات المقايسة.'); return; }
    const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || '')); reader.onerror = () => reject(new Error('تعذر قراءة الملف.')); reader.readAsDataURL(file); });
    patchLine(line.id, { attachments: [...(line.attachments || []), { id: makeId(), name: file.name, mimeType: file.type || 'application/octet-stream', dataUrl, size: file.size }] });
  };

  const loadLinkedStock = (productId: string, unit: string) => {
    const row = stock.find((item) => item.productId === productId);
    const product = products.find((item) => item.id === productId);
    if (!row || !product) return 0;
    const factor = estimateUnitFactor(unit, product);
    return factor ? row.availableM2 / factor : 0;
  };

  const loadPurchasePriceHistory = (productId: string) => {
    try {
      const rows = new ProcurementService().getProductPriceHistory(productId);
      setPriceHistory((current) => ({ ...current, [productId]: rows }));
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'تعذر تحميل سجل أسعار الشراء.');
    }
  };

  const setLineMaterialProduct = (line: CostLine, productId: string) => {
    const product = products.find((item) => item.id === productId);
    if (!product) { patchLine(line.id, { materialProductId: '' }); return; }
    if (product.baseUnit === 'SERVICE') {
      setDataError('هذا الصنف خدمة غير مخزنية، اختر صنفًا يمكن صرفه أو طلبه من المخزون.');
      patchLine(line.id, { materialProductId: '' });
      return;
    }
    const factor = estimateUnitFactor(line.unit, product);
    if (factor === null) {
      setDataError(`وحدة البند (${line.unit}) لا يمكن تحويلها إلى وحدة الصنف (${product.baseUnit}).`);
      patchLine(line.id, { materialProductId: productId });
      return;
    }
    setDataError('');
    patchLine(line.id, {
      materialProductId: productId,
      materialRate: Number(product.costPrice || 0) * factor,
      materialPriceHistory: [...(line.materialPriceHistory || []), {
        id: makeId(), date: new Date().toISOString(), unitPrice: Number(product.costPrice || 0) * factor,
        source: 'PRODUCT', note: `لقطة تكلفة ${product.name} بوحدة ${line.unit}`,
      }],
    });
  };

  const getMaterialNeeds = () => {
    const needs = new Map<string, { product: Product; quantity: number; estimatedUnitCost: number; notes: string }>();
    for (const line of lines) {
      const product = products.find((item) => item.id === line.materialProductId);
      if (!product) continue;
      const factor = estimateUnitFactor(line.unit, product);
      if (!factor || factor <= 0) continue;
      const requiredInLineUnit = rooms.reduce((sum, room) => sum + getRoomLineTotal(line, room, rooms.length).materialQuantity, 0);
      const quantity = requiredInLineUnit * factor;
      const current = needs.get(product.id);
      if (current) {
        current.quantity += quantity;
        current.notes += `؛ ${line.name}: ${requiredInLineUnit.toFixed(2)} ${line.unit}`;
      } else {
        needs.set(product.id, {
          product, quantity,
          estimatedUnitCost: line.materialRate / factor,
          notes: `${line.name}: ${requiredInLineUnit.toFixed(2)} ${line.unit}، الهالك ${line.wastePercent}%`,
        });
      }
    }
    return [...needs.values()];
  };

  const createPurchaseRequestForShortages = () => {
    if (!warehouseId) { setDataError('اختر مستودعًا قبل إنشاء طلب الشراء.'); return; }
    setMaterialActionBusy(true);
    try {
      const shortages = getMaterialNeeds().map((need) => {
        const factor = estimateUnitFactor(need.product.baseUnit, need.product) || 1;
        const availableBase = stock.find((item) => item.productId === need.product.id)?.availableM2 || 0;
        return { ...need, quantity: Math.max(0, need.quantity - availableBase), estimatedUnitCost: need.estimatedUnitCost / factor };
      }).filter((need) => need.quantity > 0.0001);
      if (!shortages.length) { setDataError('لا يوجد عجز مواد لإنشاء طلب شراء.'); return; }
      const request = new PurchaseRequestService().createRequest({
        warehouseId, projectId: projectId || undefined, priority: 'HIGH', notes: `احتياجات مواد لمقايسة ${apartmentName || 'الشقة'}، بعد خصم المتاح من المخزون.`,
        items: shortages.map((need) => ({ productId: need.product.id, quantityM2: need.quantity, estimatedUnitCost: need.estimatedUnitCost, notes: need.notes })),
      });
      window.alert(`تم إنشاء طلب الشراء ${request.requestNumber} للعجز المسجل.`);
      setMaterialActionsCreated((current) => ({ ...current, purchase: true }));
      setDataError('');
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'تعذر إنشاء طلب الشراء.');
    } finally { setMaterialActionBusy(false); }
  };

  const createStockIssueRequests = () => {
    if (!warehouseId) { setDataError('اختر مستودعًا قبل إنشاء طلب الصرف.'); return; }
    setMaterialActionBusy(true);
    try {
      const inventoryService = new InventoryService();
      const availableNeeds = getMaterialNeeds().map((need) => ({
        ...need,
        quantity: Math.min(need.quantity, stock.find((item) => item.productId === need.product.id)?.availableM2 || 0),
      })).filter((need) => need.quantity > 0.0001);
      if (!availableNeeds.length) { setDataError('لا توجد مواد متاحة للصرف من المستودع المختار.'); return; }
      const adjustmentIds = availableNeeds.map((need) => inventoryService.createAdjustment({
        warehouseId, productId: need.product.id, type: 'SUBTRACT', quantity: Number(need.quantity.toFixed(3)),
        reason: `صرف مواد لمقايسة ${apartmentName || 'الشقة'}`,
        notes: `${need.notes}. طلب صرف مرتبط بالمقايسة؛ ينتظر مراجعة واعتماد المخول.`,
      }));
      window.alert(`تم إنشاء ${adjustmentIds.length} طلب صرف مخزني. ستظل معلقة لحين اعتمادها من المخول.`);
      setMaterialActionsCreated((current) => ({ ...current, issue: true }));
      setDataError('');
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'تعذر إنشاء طلب الصرف.');
    } finally { setMaterialActionBusy(false); }
  };

  return {
    patchRoom, patchLine, saveLineTemplate, applyLineTemplate, addLineAttachment,
    loadLinkedStock, loadPurchasePriceHistory, setLineMaterialProduct,
    getMaterialNeeds, createPurchaseRequestForShortages, createStockIssueRequests,
  };
};
