import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2, Calculator, ClipboardList, Plus, Trash2, Package, ArrowRight,
  Ruler, DoorOpen, Save, AlertTriangle, Printer, FolderOpen, RotateCcw, FileSpreadsheet, MessageCircle,
} from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { CustomerService } from '../../services/domains/customers/CustomerService';
import { ProductService } from '../../services/domains/products/ProductService';
import { InventoryService } from '../../services/domains/inventory/InventoryService';
import { PurchaseRequestService } from '../../services/domains/purchases/PurchaseRequestService';
import { ProcurementService } from '../../services/domains/procurement/ProcurementService';
import { QuotationService } from '../../services/domains/sales/QuotationService';
import { PermissionService } from '../../services/domains/auth/PermissionService';
import { AuthService } from '../../services/domains/auth/AuthService';
import { ProjectService, type Project } from '../../services/domains/projects/ProjectService';
import { ApartmentEstimateService } from '../../services/domains/projects/ApartmentEstimateService';
import { ProjectExecutionService } from '../../services/domains/projects/ProjectExecutionService';
import { validateEstimateMeasurements } from '../../services/domains/projects/estimateValidation';
import { buildExportHtml, downloadPdf, exportToExcel, type ExportOptions } from '../../utils/export/export';
import { openWhatsAppChat } from '../../utils/shared/externalLinks';
import type { ApartmentEstimate, ApartmentEstimateQuotationLink, ApartmentEstimateVersion, EstimatePayment } from '../../types/projects/apartmentEstimate';
import type { Customer, Product, Warehouse } from '../../types';
import { conversionFactor } from '../../utils/products/uom_part02';
import {
  getQuantity, getRoomLineTotal, getRoomMeasures, getRoomWallLength, getMeasureFormula,
  type EstimateLine, type EstimateRoom, type Measure,
} from './estimateCalculations';

type Room = EstimateRoom;
type CostLine = EstimateLine;
type StockRow = { productId: string; availableM2: number };
type PurchasePriceSnapshot = { id: string; date: string; invoiceNumber: string; supplierName: string; effectiveUnitCost: number; quantityM2: number };
type LocalEstimate = {
  id: string; name: string; area: number; customerId: string; rooms: Room[]; lines: CostLine[];
  contingencyPercent: number; taxPercent: number; paidAmount: number; terms?: string; payments?: EstimatePayment[]; updatedAt: string;
};
type RecoverableEstimateDraft = {
  schemaVersion: 1;
  savedAt: string;
  projectId: string;
  selectedEstimateId: string;
  apartmentName: string;
  apartmentArea: string;
  customerId: string;
  warehouseId: string;
  rooms: Room[];
  lines: CostLine[];
  contingencyPercent: number;
  taxPercent: number;
  paidAmount: number;
  payments: EstimatePayment[];
  terms: string;
};
const LOCAL_ESTIMATES_KEY = 'ceramisys.apartment-estimates.v1';
const LOCAL_LINE_TEMPLATES_KEY = 'ceramisys.apartment-estimate-line-templates.v1';
const ESTIMATE_RECOVERY_KEY = 'ceramisys.apartment-estimate-recovery.v1';
const DEFAULT_ESTIMATE_TERMS = 'صلاحية العرض 15 يومًا من تاريخ الإصدار. يبدأ التنفيذ بعد اعتماد العرض والدفعة المقدمة. أي أعمال إضافية خارج البنود والكميات الموضحة تسعّر بموافقة منفصلة.';
const readRecoverableEstimateDraft = (): RecoverableEstimateDraft | null => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ESTIMATE_RECOVERY_KEY) || 'null') as RecoverableEstimateDraft | null;
    if (!parsed || parsed.schemaVersion !== 1 || !Array.isArray(parsed.rooms) || !Array.isArray(parsed.lines)) return null;
    return parsed;
  } catch { return null; }
};
const readLocalEstimates = (): LocalEstimate[] => {
  try {
    const raw = window.localStorage.getItem(LOCAL_ESTIMATES_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed as LocalEstimate[] : [];
  } catch { return []; }
};

const makeId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
type LineTemplate = { id: string; name: string; line: CostLine };
const readLineTemplates = (): LineTemplate[] => {
  try { const raw = window.localStorage.getItem(LOCAL_LINE_TEMPLATES_KEY); const value: unknown = raw ? JSON.parse(raw) : []; return Array.isArray(value) ? value as LineTemplate[] : []; }
  catch { return []; }
};
const newRoom = (name = 'غرفة جديدة'): Room => ({
  id: makeId(), name, length: 4, width: 3, height: 3,
  doorCount: 1, doorWidth: 0.9, doorHeight: 2.1,
  windowCount: 1, windowWidth: 1.2, windowHeight: 1.2,
  shape: 'rectangle', polygonSides: [4, 3, 4, 3],
  walls: Array.from({ length: 4 }, (_, index) => ({ id: makeId(), name: `جدار ${index + 1}`, length: index % 2 === 0 ? 4 : 3, height: 3 })),
  openings: [], balconyLength: 0, balconyWidth: 0, electricalPoints: 0, plumbingPoints: 0,
});
const newLine = (
  category: string, name: string, measure: Measure, unit: string,
): CostLine => ({
  id: makeId(), category, name, measure, unit,
  manualQuantity: 1, materialProductId: '', materialRate: 0, laborRate: 0,
  wastePercent: 0, discountPercent: 0, profitPercent: 0, equipmentRate: 0, expenseRate: 0,
  workType: category.includes('التأسيس') || category.includes('كهرباء') || category.includes('سباكة') ? 'FOUNDATION' : 'FINISHING',
  phase: category.includes('كهرباء') ? 'التأسيس الكهربائي' : category.includes('سباكة') ? 'تأسيس السباكة' : 'التشطيبات',
  specifications: '', notes: '', attachments: [],
});
const initialLines = (): CostLine[] => [
  newLine('الأرضيات', 'توريد وتركيب الأرضيات', 'floor', 'م²'),
  newLine('السيراميك', 'سيراميك الحوائط', 'walls', 'م²'),
  newLine('المحارة', 'محارة الحوائط', 'walls', 'م²'),
  newLine('النقاشة', 'دهانات الحوائط', 'walls', 'م²'),
  newLine('الأسقف', 'دهانات الأسقف', 'ceiling', 'م²'),
  newLine('الجبس', 'أعمال الجبس', 'ceiling', 'م²'),
  newLine('كهرباء', 'أعمال الكهرباء', 'manual', 'نقطة'),
  newLine('سباكة', 'أعمال السباكة', 'manual', 'نقطة'),
  newLine('نجارة', 'أعمال النجارة', 'manual', 'بند'),
  newLine('ألوميتال', 'أعمال الألوميتال', 'manual', 'م²'),
  newLine('عمالة', 'عمالة التشطيب', 'floor', 'م²'),
];
const initialRooms = (): Room[] => [
  newRoom('الريسبشن'), newRoom('غرفة النوم'), newRoom('المطبخ'), newRoom('الحمام'), newRoom('البلكونة'),
];
const fmt = (value: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(value || 0);
const measureLabel: Record<Measure, string> = {
  floor: 'مساحة الأرضية',
  walls: 'مساحة الحوائط الصافية',
  ceiling: 'مساحة السقف',
  perimeter: 'محيط الغرفة',
  electricalPoints: 'نقاط الكهرباء',
  plumbingPoints: 'نقاط السباكة',
  doors: 'عدد الأبواب',
  windows: 'عدد الشبابيك',
  balcony: 'مساحة البلكونة',
  manual: 'كمية يدوية',
};

function fieldClass() {
  return 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100';
}

function isUnitCompatible(product: Product, unit: string): boolean {
  return estimateUnitFactor(unit, product) !== null;
}

function parsePolygonCoordinates(value: string): Array<{ x: number; y: number }> {
  return value.split(';').flatMap((pair) => {
    const coordinates = pair.split(',');
    if (coordinates.length !== 2) return [];
    const [rawX, rawY] = coordinates;
    if (!rawX?.trim() || !rawY?.trim()) return [];
    const x = Number(rawX); const y = Number(rawY);
    return Number.isFinite(x) && Number.isFinite(y) ? [{ x, y }] : [];
  });
}

function estimateUnitFactor(unit: string, product: Product): number | null {
  const value = unit.trim().toLocaleLowerCase();
  const aliases: Record<string, string> = {
    'م²': 'M2', 'م2': 'M2', 'متر مربع': 'M2',
    'م': 'METER', 'م طولي': 'LINEAR_METER', 'متر طولي': 'LINEAR_METER', 'متر': 'METER',
    'نقطة': 'PIECE', 'بند': 'SERVICE', 'قطعة': 'PIECE', 'عدد': 'PIECE',
    'كجم': 'KG', 'طن': 'TON', 'لتر': 'LITER', 'كرتونة': 'BOX', 'عبوة': 'PACK', 'طقم': 'SET',
  };
  const from = aliases[value] || (value === product.customUnit?.trim().toLocaleLowerCase() ? 'CUSTOM' : unit);
  return conversionFactor(from, product.baseUnit, product);
}

export const ApartmentEstimatePage: React.FC = () => {
  const navigate = useNavigate();
  const quotationService = useMemo(() => new QuotationService(), []);
  const projectEstimateService = useMemo(() => new ApartmentEstimateService(), []);
  const executionService = useMemo(() => new ProjectExecutionService(), []);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [projectEstimates, setProjectEstimates] = useState<ApartmentEstimate[]>([]);
  const [versions, setVersions] = useState<ApartmentEstimateVersion[]>([]);
  const [quotationLinks, setQuotationLinks] = useState<ApartmentEstimateQuotationLink[]>([]);
  const [versionChangeSummary, setVersionChangeSummary] = useState('');
  const [compareVersionIds, setCompareVersionIds] = useState<[string, string]>(['', '']);
  const [selectedEstimateId, setSelectedEstimateId] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [rooms, setRooms] = useState<Room[]>(initialRooms);
  const [lines, setLines] = useState<CostLine[]>(initialLines);
  const [lineTemplates, setLineTemplates] = useState<LineTemplate[]>(readLineTemplates);
  const [apartmentName, setApartmentName] = useState('');
  const [apartmentArea, setApartmentArea] = useState('');
  const [documentTerms, setDocumentTerms] = useState(DEFAULT_ESTIMATE_TERMS);
  const [customerId, setCustomerId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [dataError, setDataError] = useState('');
  const [productError, setProductError] = useState('');
  const [stockError, setStockError] = useState('');
  const [priceHistory, setPriceHistory] = useState<Record<string, PurchasePriceSnapshot[]>>({});
  const [materialActionBusy, setMaterialActionBusy] = useState(false);
  const [materialActionsCreated, setMaterialActionsCreated] = useState({ purchase: false, issue: false });
  const [saving, setSaving] = useState(false);
  const [recoveryDraft, setRecoveryDraft] = useState<RecoverableEstimateDraft | null>(readRecoverableEstimateDraft);
  const [recoveryDismissed, setRecoveryDismissed] = useState(false);
  const [draftSaveStatus, setDraftSaveStatus] = useState<'SAVED' | 'ERROR'>('SAVED');
  const [draftSavedAt, setDraftSavedAt] = useState('');
  const preservedDraftProjectId = useRef<string | null>(null);
  const [localEstimates, setLocalEstimates] = useState<LocalEstimate[]>(readLocalEstimates);
  const [contingencyPercent, setContingencyPercent] = useState(0);
  const [taxPercent, setTaxPercent] = useState(0);
  const [paidAmount, setPaidAmount] = useState(0);
  const [payments, setPayments] = useState<EstimatePayment[]>([]);
  const [paymentDraft, setPaymentDraft] = useState({ date: new Date().toISOString().slice(0, 10), amount: 0, method: 'نقدي', reference: '', notes: '' });
  const [executionSummary, setExecutionSummary] = useState<ReturnType<ProjectExecutionService['getSummary']> | null>(null);
  const [executionContracts, setExecutionContracts] = useState<any[]>([]);
  const [executionCertificates, setExecutionCertificates] = useState<any[]>([]);
  const [executionCosts, setExecutionCosts] = useState<any[]>([]);
  const [executionPurchases, setExecutionPurchases] = useState<any[]>([]);
  const [executionDraft, setExecutionDraft] = useState({ contractDate: new Date().toISOString().slice(0, 10), terms: '', quotationId: '', certificateDate: new Date().toISOString().slice(0, 10), periodStart: '', periodEnd: '', certificateDescription: '', progressPercent: 0, certificateAmount: 0, costDate: new Date().toISOString().slice(0, 10), costCategory: '', costDescription: '', costAmount: 0 });
  const canCreateQuotation = PermissionService.can(AuthService.getCurrentUser(), 'ui.quotations.quotations.create');
  const canViewProjects = PermissionService.can(AuthService.getCurrentUser(), 'ui.projects.list.view');
  const canUpdateProjects = PermissionService.can(AuthService.getCurrentUser(), 'ui.projects.list.update');
  const canApproveProject = PermissionService.can(AuthService.getCurrentUser(), 'ui.projects.list.approve');
  const canViewPurchaseRequests = PermissionService.can(AuthService.getCurrentUser(), 'ui.purchases.requests.view');
  const canExportEstimate = PermissionService.can(AuthService.getCurrentUser(), 'projects.print');

  useEffect(() => {
    try { setCustomers(new CustomerService().getAllCustomers()); }
    catch (error) { setDataError(error instanceof Error ? error.message : 'تعذر تحميل العملاء.'); }
    if (canViewProjects) {
      try { setProjects(new ProjectService().getProjects()); }
      catch (error) { setDataError(error instanceof Error ? error.message : 'تعذر تحميل المشروعات.'); }
    }
    try { setProducts(new ProductService().getAllProducts()); }
    catch (error) { setProductError(error instanceof Error ? error.message : 'تعذر تحميل أصناف المخزون.'); }
    try {
      const availableWarehouses = new InventoryService().getAllWarehouses();
      setWarehouses(availableWarehouses);
      const defaultWarehouse = availableWarehouses[0];
      if (defaultWarehouse) setWarehouseId(defaultWarehouse.id);
    } catch (error) {
      setStockError(error instanceof Error ? error.message : 'تعذر تحميل المستودعات.');
    }
  }, [canViewProjects]);

  useEffect(() => {
    if (recoveryDraft && !recoveryDismissed) return;
    const timeout = window.setTimeout(() => {
      const baselineRooms = initialRooms();
      const baselineLines = initialLines();
      const roomSignature = (room: Room) => JSON.stringify({
        name: room.name, length: room.length, width: room.width, height: room.height, shape: room.shape,
        polygonSides: room.polygonSides, polygonVertices: room.polygonVertices,
        walls: (room.walls || []).map(({ name, length, height }) => ({ name, length, height })),
        openings: (room.openings || []).map(({ kind, name, count, width, height }) => ({ kind, name, count, width, height })),
        doorCount: room.doorCount, doorWidth: room.doorWidth, doorHeight: room.doorHeight,
        windowCount: room.windowCount, windowWidth: room.windowWidth, windowHeight: room.windowHeight,
        balconyLength: room.balconyLength, balconyWidth: room.balconyWidth,
        electricalPoints: room.electricalPoints, plumbingPoints: room.plumbingPoints,
      });
      const lineSignature = (line: CostLine) => JSON.stringify({
        category: line.category, name: line.name, measure: line.measure, unit: line.unit,
        manualQuantity: line.manualQuantity, materialProductId: line.materialProductId,
        materialRate: line.materialRate, laborRate: line.laborRate,
        equipmentRate: line.equipmentRate, expenseRate: line.expenseRate,
        wastePercent: line.wastePercent, discountPercent: line.discountPercent, profitPercent: line.profitPercent,
        measureScope: line.measureScope, wallId: line.wallId, workType: line.workType, phase: line.phase,
        specifications: line.specifications, notes: line.notes,
        attachments: (line.attachments || []).map(({ name, size }) => ({ name, size })),
      });
      const hasDraftContent = Boolean(
        projectId || selectedEstimateId || apartmentName.trim() || apartmentArea || customerId || payments.length
        || contingencyPercent !== 0 || taxPercent !== 0 || paidAmount !== 0 || documentTerms !== DEFAULT_ESTIMATE_TERMS
        || rooms.length !== baselineRooms.length
        || rooms.some((room, index) => roomSignature(room) !== roomSignature(baselineRooms[index] || initialRooms()[0]))
        || lines.length !== baselineLines.length
        || lines.some((line, index) => lineSignature(line) !== lineSignature(baselineLines[index] || initialLines()[0]))
      );
      if (!hasDraftContent) {
        try { window.localStorage.removeItem(ESTIMATE_RECOVERY_KEY); } catch { /* storage may be unavailable */ }
        return;
      }
      const draft: RecoverableEstimateDraft = {
        schemaVersion: 1, savedAt: new Date().toISOString(), projectId, selectedEstimateId,
        apartmentName, apartmentArea, customerId, warehouseId, rooms, lines,
        contingencyPercent, taxPercent, paidAmount, payments, terms: documentTerms,
      };
      try {
        window.localStorage.setItem(ESTIMATE_RECOVERY_KEY, JSON.stringify(draft));
        setDraftSaveStatus('SAVED');
        setDraftSavedAt(draft.savedAt);
      } catch {
        setDraftSaveStatus('ERROR');
      }
    }, 800);
    return () => window.clearTimeout(timeout);
  }, [recoveryDraft, recoveryDismissed, projectId, selectedEstimateId, apartmentName, apartmentArea, customerId, warehouseId, rooms, lines, contingencyPercent, taxPercent, paidAmount, payments, documentTerms]);

  useEffect(() => {
    setMaterialActionsCreated({ purchase: false, issue: false });
    const preservingRecoveredDraft = preservedDraftProjectId.current !== null && preservedDraftProjectId.current === projectId;
    if (!projectId) {
      setProjectEstimates([]);
      setVersions([]);
      setQuotationLinks([]);
      if (!preservingRecoveredDraft) {
        setSelectedEstimateId('');
        setPayments([]);
        setApartmentName('');
        setApartmentArea('');
        setDocumentTerms(DEFAULT_ESTIMATE_TERMS);
        setRooms(initialRooms());
        setLines(initialLines());
        setContingencyPercent(0);
        setTaxPercent(0);
        setPaidAmount(0);
      }
      return;
    }
    const project = projects.find((item) => item.id === projectId);
    if (project) {
      setCustomerId(project.customerId);
      setApartmentName(project.name);
    }
    try {
      const savedEstimates = projectEstimateService.getByProject(projectId);
      setProjectEstimates(savedEstimates);
      const latest = savedEstimates[0];
      if (preservingRecoveredDraft) {
        const restoredEstimate = savedEstimates.find((estimate) => estimate.id === selectedEstimateId);
        if (restoredEstimate) {
          setVersions(projectEstimateService.getVersions(restoredEstimate.id, projectId));
          setQuotationLinks(projectEstimateService.getQuotationLinks(restoredEstimate.id, projectId));
        } else {
          setVersions([]);
          setQuotationLinks([]);
        }
        return;
      }
      if (latest) {
        setSelectedEstimateId(latest.id);
        setApartmentName(latest.name);
        setApartmentArea(String(latest.areaM2));
        setDocumentTerms(latest.terms || '');
        setRooms(latest.rooms);
        setLines(latest.costLines);
        setContingencyPercent(latest.contingencyPercent || 0);
        setTaxPercent(latest.taxPercent || 0);
        setPayments(latest.payments || []);
        setPaidAmount(0);
        setVersions(projectEstimateService.getVersions(latest.id, projectId));
        setQuotationLinks(projectEstimateService.getQuotationLinks(latest.id, projectId));
        setCompareVersionIds(['', '']);
      } else {
        setSelectedEstimateId('');
        setApartmentArea('');
        setDocumentTerms(DEFAULT_ESTIMATE_TERMS);
        setRooms(initialRooms());
        setLines(initialLines());
        setContingencyPercent(0);
        setTaxPercent(0);
        setPayments([]);
        setPaidAmount(0);
        setVersions([]);
        setQuotationLinks([]);
      }
      setDataError('');
    } catch (error) {
      setProjectEstimates([]);
      setSelectedEstimateId('');
      setDataError(error instanceof Error ? error.message : 'تعذر تحميل تصميم المشروع.');
    }
  }, [projectId, projects, projectEstimateService, selectedEstimateId]);

  const restoreEstimateDraft = () => {
    if (!recoveryDraft) return;
    preservedDraftProjectId.current = recoveryDraft.projectId;
    setProjectId(recoveryDraft.projectId);
    setSelectedEstimateId(recoveryDraft.selectedEstimateId);
    setApartmentName(recoveryDraft.apartmentName);
    setApartmentArea(recoveryDraft.apartmentArea);
    setCustomerId(recoveryDraft.customerId);
    setWarehouseId(recoveryDraft.warehouseId);
    setRooms(recoveryDraft.rooms);
    setLines(recoveryDraft.lines);
    setContingencyPercent(recoveryDraft.contingencyPercent);
    setTaxPercent(recoveryDraft.taxPercent);
    setPaidAmount(recoveryDraft.paidAmount);
    setPayments(recoveryDraft.payments);
    setDocumentTerms(recoveryDraft.terms || '');
    setRecoveryDismissed(true);
    const errors = validateEstimateMeasurements({ name: recoveryDraft.apartmentName || 'مسودة مستعادة', areaM2: Number(recoveryDraft.apartmentArea) || 0, rooms: recoveryDraft.rooms, costLines: recoveryDraft.lines, payments: recoveryDraft.payments, contingencyPercent: recoveryDraft.contingencyPercent, taxPercent: recoveryDraft.taxPercent });
    setDataError(errors.length ? `تمت استعادة المسودة، لكن راجع: ${errors.slice(0, 3).join('، ')}` : 'تمت استعادة المسودة المحفوظة تلقائيًا.');
    if (recoveryDraft.projectId === projectId && recoveryDraft.selectedEstimateId) {
      try {
        setVersions(projectEstimateService.getVersions(recoveryDraft.selectedEstimateId, recoveryDraft.projectId));
        setQuotationLinks(projectEstimateService.getQuotationLinks(recoveryDraft.selectedEstimateId, recoveryDraft.projectId));
      } catch { setVersions([]); setQuotationLinks([]); }
    }
  };

  const discardEstimateRecovery = () => {
    try { window.localStorage.removeItem(ESTIMATE_RECOVERY_KEY); } catch { /* storage may be unavailable */ }
    setRecoveryDraft(null);
    setRecoveryDismissed(true);
  };

  useEffect(() => {
    if (!warehouseId) { setStock([]); setStockError(''); return; }
    try {
      setStock(new InventoryService().getWarehouseStock(warehouseId));
      setStockError('');
    } catch (error) {
      setStock([]);
      setStockError(error instanceof Error ? error.message : 'تعذر تحميل أرصدة المستودع.');
    }
  }, [warehouseId]);

  const roomTotals = useMemo(() => rooms.map((room) => ({
    room,
    measures: getRoomMeasures(room),
    total: lines.reduce((sum, line) => sum + getRoomLineTotal(line, room, rooms.length).total, 0),
  })), [rooms, lines]);
  const estimateTotal = roomTotals.reduce((sum, item) => sum + item.total, 0);
  const totalCost = rooms.reduce((sum, room) => sum + lines.reduce((lineSum, line) => lineSum + getRoomLineTotal(line, room, rooms.length).cost, 0), 0);
  const grossProfit = estimateTotal - totalCost;
  const totalPaid = paidAmount + payments.reduce((sum, payment) => sum + Math.max(0, payment.amount), 0);
  const totalArea = rooms.reduce((sum, room) => sum + getRoomMeasures(room).floor, 0);
  const inputApartmentArea = apartmentArea.trim() ? Number(apartmentArea) : totalArea;
  const contingencyAmount = estimateTotal * Math.max(0, contingencyPercent) / 100;
  const taxableAmount = estimateTotal + contingencyAmount;
  const taxAmount = taxableAmount * Math.max(0, taxPercent) / 100;
  const grandTotal = taxableAmount + taxAmount;
  const remainingAmount = Math.max(0, grandTotal - totalPaid);

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
      const rows = new ProcurementService().getProductPriceHistory(productId) as PurchasePriceSnapshot[];
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

  const saveProjectEstimate = (showConfirmation = true): ApartmentEstimate | null => {
    if (!projectId) {
      setDataError('اختر مشروعًا قائمًا أولًا لحفظ تصميم الشقة عليه.');
      return null;
    }
    if (!canUpdateProjects) {
      setDataError('لا تملك صلاحية تعديل المشروع لحفظ التصميم والمقايسة.');
      return null;
    }
    const validationErrors = validateEstimateMeasurements({
      name: apartmentName.trim() || projects.find((project) => project.id === projectId)?.name || 'تصميم الشقة',
      areaM2: inputApartmentArea, rooms, costLines: lines, payments, paidAmount,
      contingencyPercent, taxPercent, totalAmount: estimateTotal, totalPayable: grandTotal,
    });
    if (validationErrors.length) {
      setDataError(`راجع بيانات المقايسة قبل الحفظ: ${validationErrors.slice(0, 4).join('، ')}`);
      return null;
    }
    const saved = projectEstimateService.save({
      id: selectedEstimateId || undefined,
      projectId,
      name: apartmentName.trim() || projects.find((project) => project.id === projectId)?.name || 'تصميم الشقة',
      areaM2: inputApartmentArea,
      totalAmount: estimateTotal,
      terms: documentTerms,
      rooms,
      costLines: lines,
      contingencyPercent,
      taxPercent,
      payments,
      changeSummary: versionChangeSummary,
      lineQuantities: Object.fromEntries(lines.map((line) => [line.id, getLineQuantity(line)])),
    });
    setSelectedEstimateId(saved.id);
    preservedDraftProjectId.current = null;
    setApartmentName(saved.name);
    setProjectEstimates((current) => [saved, ...current.filter((estimate) => estimate.id !== saved.id)]);
    setVersions(projectEstimateService.getVersions(saved.id, projectId));
    setQuotationLinks(projectEstimateService.getQuotationLinks(saved.id, projectId));
    setVersionChangeSummary('');
    if (showConfirmation) setDataError('');
    return saved;
  };

  const selectProjectEstimate = (estimateId: string) => {
    preservedDraftProjectId.current = null;
    setSelectedEstimateId(estimateId);
    setMaterialActionsCreated({ purchase: false, issue: false });
    setVersionChangeSummary('');
    const estimate = projectEstimates.find((item) => item.id === estimateId);
    if (!estimate) {
      const project = projects.find((item) => item.id === projectId);
      setApartmentName(project?.name || '');
      setDocumentTerms(DEFAULT_ESTIMATE_TERMS);
      setApartmentArea('');
      setRooms(initialRooms());
      setLines(initialLines());
      setVersions([]);
      setQuotationLinks([]);
      setCompareVersionIds(['', '']);
      return;
    }
    setApartmentName(estimate.name);
    setDocumentTerms(estimate.terms || '');
    setApartmentArea(String(estimate.areaM2));
    setRooms(estimate.rooms);
    setLines(estimate.costLines);
    setContingencyPercent(estimate.contingencyPercent || 0);
    setTaxPercent(estimate.taxPercent || 0);
    setPayments(estimate.payments || []);
    setPaidAmount(0);
    setVersions(projectEstimateService.getVersions(estimate.id, projectId));
    setQuotationLinks(projectEstimateService.getQuotationLinks(estimate.id, projectId));
    setCompareVersionIds(['', '']);
  };

  const refreshVersionHistory = (estimateId: string) => {
    if (!projectId) return;
    setVersions(projectEstimateService.getVersions(estimateId, projectId));
    setQuotationLinks(projectEstimateService.getQuotationLinks(estimateId, projectId));
    setProjectEstimates(projectEstimateService.getByProject(projectId));
  };

  const refreshExecution = useCallback((id = projectId) => {
    if (!id || !canViewProjects) { setExecutionSummary(null); setExecutionContracts([]); setExecutionCertificates([]); setExecutionCosts([]); setExecutionPurchases([]); return; }
    try {
      setExecutionSummary(executionService.getSummary(id));
      setExecutionContracts(executionService.getContracts(id));
      setExecutionCertificates(executionService.getCertificates(id));
      setExecutionCosts(executionService.getActualCosts(id));
      setExecutionPurchases(canViewPurchaseRequests ? new PurchaseRequestService().getProjectRequests(id) : []);
    } catch (error) { setDataError(error instanceof Error ? error.message : 'تعذر تحميل دورة تنفيذ المشروع.'); }
  }, [projectId, canViewProjects, canViewPurchaseRequests, executionService]);

  useEffect(() => { refreshExecution(); }, [projectId, canViewProjects, canViewPurchaseRequests, executionService, refreshExecution]);

  const initializeExecution = () => {
    if (!selectedEstimateId || !projectId) return;
    try {
      const result = executionService.initializeFromApprovedEstimate(selectedEstimateId, projectId);
      refreshExecution();
      setDataError('');
      window.alert(result.created ? `تم إنشاء ${result.taskCount} مرحلة و${result.budgetCount} بندًا مخططًا من الإصدار المعتمد.` : 'تم إعداد التنفيذ لهذا الإصدار مسبقًا.');
    } catch (error) { setDataError(error instanceof Error ? error.message : 'تعذر إعداد مراحل التنفيذ.'); }
  };

  const createProjectContract = () => {
    if (!selectedEstimateId || !projectId) return;
    try {
      executionService.initializeFromApprovedEstimate(selectedEstimateId, projectId, versions[0]?.id);
      const contract = executionService.createContract({ estimateId: selectedEstimateId, projectId, versionId: versions[0]?.id, contractDate: executionDraft.contractDate, terms: executionDraft.terms, quotationId: executionDraft.quotationId || undefined });
      refreshExecution(); setDataError('');
      window.alert(`تم إنشاء العقد رقم ${contract.contractNumber} بقيمة ${fmt(contract.contractValue)} ج.`);
    } catch (error) { setDataError(error instanceof Error ? error.message : 'تعذر إنشاء العقد.'); }
  };

  const createProjectCertificate = () => {
    if (!selectedEstimateId || !projectId) return;
    try {
      const contractId = executionContracts.find((item) => item.status !== 'CANCELLED')?.id;
      const result = executionService.createCertificate({ projectId, estimateId: selectedEstimateId, versionId: versions[0]?.id, contractId, date: executionDraft.certificateDate, periodStart: executionDraft.periodStart, periodEnd: executionDraft.periodEnd, description: executionDraft.certificateDescription, progressPercent: executionDraft.progressPercent, amount: executionDraft.certificateAmount });
      refreshExecution(); setExecutionDraft((current) => ({ ...current, certificateDescription: '', certificateAmount: 0 })); setDataError('');
      window.alert(`تم إنشاء المستخلص ${result.certificateNumber} بحالة مسودة.`);
    } catch (error) { setDataError(error instanceof Error ? error.message : 'تعذر إنشاء المستخلص.'); }
  };

  const createActualCost = () => {
    if (!projectId) return;
    try {
      executionService.addActualCost({ projectId, versionId: versions.find((version) => version.status === 'APPROVED')?.id, date: executionDraft.costDate, category: executionDraft.costCategory, description: executionDraft.costDescription, amount: executionDraft.costAmount });
      refreshExecution(); setExecutionDraft((current) => ({ ...current, costDescription: '', costAmount: 0 })); setDataError('');
    } catch (error) { setDataError(error instanceof Error ? error.message : 'تعذر تسجيل التكلفة الفعلية.'); }
  };

  const submitVersionForReview = (versionId: string) => {
    if (!selectedEstimateId || !projectId) return;
    try {
      projectEstimateService.submitVersionForReview(selectedEstimateId, versionId, projectId);
      refreshVersionHistory(selectedEstimateId);
      setDataError('');
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'تعذر إرسال الإصدار للمراجعة.');
    }
  };

  const reviewEstimateVersion = (versionId: string, decision: 'APPROVED' | 'RETURNED') => {
    if (!selectedEstimateId || !projectId) return;
    const notes = decision === 'RETURNED' ? window.prompt('اكتب ملاحظات الإرجاع للمراجعة:') : '';
    if (decision === 'RETURNED' && !notes?.trim()) return;
    try {
      projectEstimateService.decideVersion(selectedEstimateId, versionId, projectId, decision, notes || '');
      refreshVersionHistory(selectedEstimateId);
      setDataError('');
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'تعذر مراجعة إصدار المقايسة.');
    }
  };

  const persistLocalEstimates = (next: LocalEstimate[]): boolean => {
    try {
      window.localStorage.setItem(LOCAL_ESTIMATES_KEY, JSON.stringify(next));
      setLocalEstimates(next);
      return true;
    } catch {
      setDataError('تعذر حفظ سجل المقايسات على هذا الجهاز. لم يُحذف السجل الحالي.');
      return false;
    }
  };

  const saveLocalEstimate = () => {
    const validationErrors = validateEstimateMeasurements({ name: apartmentName.trim() || 'مقايسة محلية', areaM2: inputApartmentArea, rooms, costLines: lines, payments, paidAmount, contingencyPercent, taxPercent, totalAmount: estimateTotal, totalPayable: grandTotal });
    if (validationErrors.length) { setDataError(`راجع بيانات المقايسة قبل الحفظ: ${validationErrors.slice(0, 4).join('، ')}`); return; }
    const estimate: LocalEstimate = {
      id: selectedEstimateId && selectedEstimateId.startsWith('local_') ? selectedEstimateId : `local_${makeId()}`,
      name: apartmentName.trim() || `مقايسة ${new Date().toLocaleDateString('ar-EG')}`,
      area: inputApartmentArea, customerId, rooms, lines,
      contingencyPercent, taxPercent, paidAmount, payments, updatedAt: new Date().toISOString(),
      terms: documentTerms,
    };
    if (!persistLocalEstimates([estimate, ...localEstimates.filter((item) => item.id !== estimate.id)])) return;
    setSelectedEstimateId(estimate.id);
    setApartmentName(estimate.name);
    setDataError('');
  };

  const loadLocalEstimate = (id: string) => {
    const estimate = localEstimates.find((item) => item.id === id);
    if (!estimate) return;
    preservedDraftProjectId.current = '';
    setProjectId(''); setSelectedEstimateId(estimate.id); setApartmentName(estimate.name);
    setApartmentArea(String(estimate.area)); setCustomerId(estimate.customerId);
    setDocumentTerms(estimate.terms || '');
    setRooms(estimate.rooms); setLines(estimate.lines);
    setContingencyPercent(estimate.contingencyPercent || 0); setTaxPercent(estimate.taxPercent || 0);
    setPaidAmount(estimate.paidAmount || 0); setDataError('');
    setPayments(estimate.payments || []);
    setDocumentTerms(estimate.terms || '');
  };

  const createQuotation = () => {
    if (!canCreateQuotation) {
      setDataError('لا تملك صلاحية إنشاء عروض الأسعار. يمكنك إعداد المقايسة، لكن يلزم منح صلاحية عروض الأسعار لإصدارها.');
      return;
    }
    if (!customerId) { setDataError('اختر العميل قبل إصدار عرض السعر.'); return; }
    const validationErrors = validateEstimateMeasurements({ name: apartmentName || 'المقايسة', areaM2: inputApartmentArea, rooms, costLines: lines, payments, paidAmount, contingencyPercent, taxPercent, totalAmount: estimateTotal, totalPayable: grandTotal });
    if (validationErrors.length) { setDataError(`لا يمكن إصدار عرض السعر قبل تصحيح: ${validationErrors.slice(0, 4).join('، ')}`); return; }
    const activeLines = lines.filter((line) => line.name.trim() && getLineQuantity(line) > 0);
    if (!activeLines.length || grandTotal <= 0) { setDataError('أضف بندًا بكمية وسعر صالحين قبل إصدار عرض السعر.'); return; }
    setSaving(true);
    setDataError('');
    try {
      const savedEstimate = projectId ? projectEstimates.find((estimate) => estimate.id === selectedEstimateId) || null : null;
      const approvedVersion = projectId ? versions.find((version) => version.id === savedEstimate?.currentVersionId) : undefined;
      if (projectId && (!savedEstimate || !approvedVersion || approvedVersion.status !== 'APPROVED')) {
        setDataError('لا يمكن إصدار عرض سعر مرتبط بمشروع إلا من إصدار مقايسة معتمد. احفظ التعديلات كإصدار جديد وأرسله للاعتماد أولًا.');
        setSaving(false);
        return;
      }
      if (projectId && approvedVersion) {
        const snapshot = approvedVersion.snapshot;
        const snapshotQuantities = snapshot.lineQuantities || {};
        const sameLines = JSON.stringify(snapshot.costLines) === JSON.stringify(lines)
          && JSON.stringify(snapshot.rooms) === JSON.stringify(rooms)
          && snapshot.name === (apartmentName.trim() || projects.find((project) => project.id === projectId)?.name || 'تصميم الشقة')
          && Math.abs(Number(snapshot.areaM2) - inputApartmentArea) < 0.005
          && Math.abs(Number(snapshot.totalAmount) - estimateTotal) < 0.005
          && Math.abs(Number(snapshot.contingencyPercent || 0) - contingencyPercent) < 0.005
          && Math.abs(Number(snapshot.taxPercent || 0) - taxPercent) < 0.005
          && (snapshot.terms || '') === documentTerms
          && lines.every((line) => Math.abs(Number(snapshotQuantities[line.id] ?? line.manualQuantity) - getLineQuantity(line)) < 0.0001);
        if (!sameLines) {
          setDataError('البيانات المعروضة تختلف عن الإصدار المعتمد؛ احفظها كإصدار جديد ثم أعد دورة المراجعة قبل إصدار العرض.');
          setSaving(false);
          return;
        }
      }
      const quoteNotes = [
        `مقايسة تشطيب: ${apartmentName.trim() || 'الشقة'}`,
        `المساحة المدخلة: ${inputApartmentArea} م² | المساحة المحسوبة للغرف: ${fmt(totalArea)} م²`,
        `عدد الغرف: ${rooms.length}`,
        `الشروط: ${documentTerms}`,
        `تكلفة التنفيذ: ${fmt(totalCost)} ج | سعر البيع: ${fmt(estimateTotal)} ج | الربح: ${fmt(grossProfit)} ج | احتياطي ${fmt(contingencyPercent)}%: ${fmt(contingencyAmount)} ج | ضريبة ${fmt(taxPercent)}%: ${fmt(taxAmount)} ج | الإجمالي النهائي: ${fmt(grandTotal)} ج | مدفوع: ${fmt(totalPaid)} ج | متبقي: ${fmt(remainingAmount)} ج`,
        ...rooms.map((room) => {
          const measures = getRoomMeasures(room);
          return `${room.name}: ${room.length}×${room.width}×${room.height}م، أرضية ${fmt(measures.floor)}م²، حوائط صافية ${fmt(measures.walls)}م²`;
        }),
        'البنود (السعر يشمل الخامات والمصنعية والهالك والخصم والربح المحددة في المقايسة):',
        ...activeLines.map((line) => {
          const totalQuantity = rooms.reduce((sum, room) => sum + getQuantity(line, room, rooms.length), 0);
          const linkedProduct = products.find((product) => product.id === line.materialProductId);
          const compatibleProduct = linkedProduct && isUnitCompatible(linkedProduct, line.unit);
          return `${line.category} - ${line.name}: كمية ${fmt(totalQuantity)} ${line.unit}; خامات ${fmt(line.materialRate)}/${line.unit}; مصنعية ${fmt(line.laborRate)}/${line.unit}; هالك ${fmt(line.wastePercent)}%; خصم ${fmt(line.discountPercent)}%; ربح ${fmt(line.profitPercent)}%${compatibleProduct ? `; صنف المخزون: ${linkedProduct.name}` : linkedProduct ? `; لم يربط الصنف ${linkedProduct.name} لاختلاف الوحدة` : ''}`;
        }),
        `المخزن المرجعي: ${warehouses.find((warehouse) => warehouse.id === warehouseId)?.name || 'غير محدد'}`,
      ].join('\n');
      const serviceItems = activeLines.map((line) => {
        const quantity = rooms.reduce((sum, room) => sum + getQuantity(line, room, rooms.length), 0);
        const lineTotal = rooms.reduce((sum, room) => sum + getRoomLineTotal(line, room, rooms.length).total, 0);
        return {
          productId: line.materialProductId && products.some((product) =>
            product.id === line.materialProductId && isUnitCompatible(product, line.unit))
            ? line.materialProductId
            : undefined,
          description: `${line.workType === 'FOUNDATION' ? 'تأسيس' : 'تشطيب'} — ${line.phase || ''} — ${line.category}: ${line.name}${line.specifications ? ` | المواصفات: ${line.specifications}` : ''}${line.notes ? ` | ملاحظات: ${line.notes}` : ''}`,
          unit: line.unit,
          quantity,
          unitPrice: quantity ? lineTotal / quantity : 0,
        };
      });
      const adjustment = grandTotal - estimateTotal;
      if (adjustment > 0.005) serviceItems.push({
        productId: undefined,
        description: `احتياطي ${fmt(contingencyPercent)}% وضريبة ${fmt(taxPercent)}%`,
        unit: 'مقطوعية', quantity: 1, unitPrice: adjustment,
      });
      const quotation = quotationService.createQuotation({
        customerId,
        projectId: projectId || undefined,
        warehouseId: warehouseId || undefined,
        validDays: 15,
        notes: quoteNotes,
        serviceItems,
      });
      if (savedEstimate && projectId) {
        try {
          projectEstimateService.linkQuotation(savedEstimate.id, projectId, quotation.id, approvedVersion?.id);
        } catch (error) {
          setDataError(`تم إصدار عرض السعر ${quotation.quotationNumber} وربطه بالمشروع، لكن تعذر ربطه بتصميم الشقة: ${error instanceof Error ? error.message : String(error)}`);
          window.alert(`تم إنشاء عرض السعر ${quotation.quotationNumber} وربطه بالمشروع، لكن تعذر ربطه بسجل التصميم. راجع المشروع قبل إعادة المحاولة.`);
          navigate('/quotations');
          return;
        }
      }
      window.alert(`تم إنشاء عرض السعر ${quotation.quotationNumber} بالمقايسة كاملة. يمكنك مراجعته وتعديله وطباعته من عروض الأسعار.`);
      navigate('/quotations');
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'خطأ غير معروف.';
      setDataError(`${projectId ? 'تعذر حفظ تصميم المشروع أو إصدار عرض السعر' : 'تعذر إصدار عرض السعر'}: ${reason}`);
    } finally {
      setSaving(false);
    }
  };

  function getLineQuantity(line: CostLine) {
    return rooms.reduce((sum, room) => sum + getQuantity(line, room, rooms.length), 0);
  }

  const compareA = versions.find((version) => version.id === compareVersionIds[0]);
  const compareB = versions.find((version) => version.id === compareVersionIds[1]);
  const compareLines = compareA && compareB ? (() => {
    const before = new Map(compareA.snapshot.costLines.map((line) => [line.id, line]));
    const after = new Map(compareB.snapshot.costLines.map((line) => [line.id, line]));
    return [...new Set([...before.keys(), ...after.keys()])].map((id) => {
      const oldLine = before.get(id); const newLine = after.get(id);
      return {
        id, name: newLine?.name || oldLine?.name || 'بند',
        beforeQuantity: compareA.snapshot.lineQuantities?.[id] ?? oldLine?.manualQuantity ?? 0,
        afterQuantity: compareB.snapshot.lineQuantities?.[id] ?? newLine?.manualQuantity ?? 0,
        beforePrice: oldLine?.materialRate || 0, afterPrice: newLine?.materialRate || 0,
        beforeLabor: oldLine?.laborRate || 0, afterLabor: newLine?.laborRate || 0,
        beforeOtherRates: [oldLine?.equipmentRate || 0, oldLine?.expenseRate || 0, oldLine?.wastePercent || 0, oldLine?.discountPercent || 0, oldLine?.profitPercent || 0],
        afterOtherRates: [newLine?.equipmentRate || 0, newLine?.expenseRate || 0, newLine?.wastePercent || 0, newLine?.discountPercent || 0, newLine?.profitPercent || 0],
        changed: !oldLine || !newLine || compareA.snapshot.lineQuantities?.[id] !== compareB.snapshot.lineQuantities?.[id]
          || oldLine.materialRate !== newLine.materialRate || oldLine.laborRate !== newLine.laborRate
          || oldLine.equipmentRate !== newLine.equipmentRate || oldLine.expenseRate !== newLine.expenseRate
          || oldLine.wastePercent !== newLine.wastePercent || oldLine.discountPercent !== newLine.discountPercent
          || oldLine.profitPercent !== newLine.profitPercent || oldLine.unit !== newLine.unit || oldLine.measure !== newLine.measure
          || oldLine.name !== newLine.name,
      };
    }).filter((row) => row.changed);
  })() : [];

  const buildEstimateDocument = (kind: 'detailed' | 'summary'): ExportOptions => {
    const validationErrors = validateEstimateMeasurements({ name: apartmentName || 'المقايسة', areaM2: inputApartmentArea, rooms, costLines: lines, payments, paidAmount, contingencyPercent, taxPercent, totalAmount: estimateTotal, totalPayable: grandTotal });
    if (validationErrors.length) throw new Error(`صحح بيانات المقايسة قبل استخراج المستند: ${validationErrors.slice(0, 4).join('، ')}`);
    const customerName = customers.find((customer) => customer.id === customerId)?.name
      || projects.find((project) => project.id === projectId)?.customerName || 'عميل';
    const customerPhone = customers.find((customer) => customer.id === customerId)?.phone || '';
    const projectName = projects.find((project) => project.id === projectId)?.name || '';
    const lineRows = lines.filter((line) => line.name.trim() && getLineQuantity(line) > 0).map((line) => {
      const quantity = getLineQuantity(line);
      const lineTotal = rooms.reduce((sum, room) => sum + getRoomLineTotal(line, room, rooms.length).total, 0);
      return {
        recordType: 'بند أعمال', phase: line.phase || '', category: line.category, description: line.name,
        formula: rooms.map((room) => `${room.name}: ${getMeasureFormula(line, room, rooms.length)}`).join(' | '),
        unit: line.unit, quantity: Number(quantity.toFixed(3)), materialRate: line.materialRate,
        laborRate: line.laborRate, equipmentRate: line.equipmentRate || 0, expenseRate: line.expenseRate || 0,
        saleRate: Number((quantity ? lineTotal / quantity : 0).toFixed(2)), total: Number(lineTotal.toFixed(2)), specifications: line.specifications || '', notes: line.notes || '',
      };
    });
    const measurementRows = rooms.map((room) => {
      const measures = getRoomMeasures(room);
      return {
        recordType: 'قياسات غرفة', phase: '', category: 'قياسات', description: room.name,
        formula: `${room.length} × ${room.width} × ${room.height} م | أرضية ${fmt(measures.floor)} م² | حوائط ${fmt(measures.walls)} م² | محيط ${fmt(measures.perimeter)} م`,
        unit: 'متعدد', quantity: '', materialRate: '', laborRate: '', equipmentRate: '', expenseRate: '', total: '',
        specifications: `أبواب ${room.doorCount}، نوافذ ${room.windowCount}، بلكونة ${room.balconyLength || 0} × ${room.balconyWidth || 0} م، كهرباء ${room.electricalPoints || 0} نقطة، سباكة ${room.plumbingPoints || 0} نقطة`,
        notes: (room.openings || []).map((opening) => `${opening.name}: ${opening.count} × ${opening.width} × ${opening.height} م`).join(' | '),
      };
    });
    const columns = kind === 'detailed' ? [
      { key: 'recordType', label: 'نوع السجل' }, { key: 'phase', label: 'المرحلة' }, { key: 'category', label: 'التصنيف' },
      { key: 'description', label: 'البند / الغرفة' }, { key: 'formula', label: 'معادلة القياس' }, { key: 'unit', label: 'الوحدة' },
      { key: 'quantity', label: 'الكمية', type: 'qty' }, { key: 'materialRate', label: 'خامات/وحدة', type: 'currency' },
      { key: 'laborRate', label: 'عمالة/وحدة', type: 'currency' }, { key: 'equipmentRate', label: 'معدات/وحدة', type: 'currency' },
      { key: 'expenseRate', label: 'مصروفات/وحدة', type: 'currency' }, { key: 'saleRate', label: 'سعر البيع/وحدة', type: 'currency' }, { key: 'total', label: 'الإجمالي', type: 'currency' },
      { key: 'specifications', label: 'المواصفات' }, { key: 'notes', label: 'ملاحظات' },
    ] : [
      { key: 'category', label: 'التصنيف / المرحلة' }, { key: 'description', label: 'الأعمال' },
      { key: 'unit', label: 'الوحدة' }, { key: 'quantity', label: 'الكمية', type: 'qty' },
      { key: 'total', label: 'القيمة', type: 'currency' }, { key: 'specifications', label: 'المواصفات' },
    ];
    let rows: Array<Record<string, unknown>>;
    if (kind === 'detailed') rows = [...measurementRows, ...lineRows];
    else {
      const grouped = new Map<string, { quantity: number; total: number; lines: string[]; unit: string; specs: string[] }>();
      lineRows.forEach((row) => {
        const category = `${row.phase || row.category} · ${row.unit}`;
        const current = grouped.get(category) || { quantity: 0, total: 0, lines: [], unit: row.unit, specs: [] };
        current.quantity += Number(row.quantity) || 0; current.total += Number(row.total) || 0;
        current.lines.push(String(row.description)); if (row.specifications) current.specs.push(String(row.specifications));
        grouped.set(category, current);
      });
      rows = [...grouped.entries()].map(([category, group]) => ({ category, description: group.lines.join('، '), unit: group.unit, quantity: Number(group.quantity.toFixed(3)), total: Number(group.total.toFixed(2)), specifications: group.specs.join(' | ') }));
    }
    const paymentNotes = payments.length
      ? payments.map((payment, index) => `دفعة ${index + 1}: ${payment.date} · ${payment.method} · ${fmt(payment.amount)} ج${payment.reference ? ` · ${payment.reference}` : ''}${payment.notes ? ` · ${payment.notes}` : ''}`)
      : ['لا توجد دفعات مسجلة.'];
    const notes = [
      `العميل: ${customerName}${customerPhone ? ` · هاتف: ${customerPhone}` : ''}${projectName ? ` · المشروع: ${projectName}` : ''}`,
      ...rooms.map((room) => `قياس ${room.name}: ${room.length} × ${room.width} × ${room.height} م؛ أرضية ${fmt(getRoomMeasures(room).floor)} م²؛ حوائط صافية ${fmt(getRoomMeasures(room).walls)} م²؛ فتحات ${room.openings?.length || 0}؛ نقاط كهرباء ${room.electricalPoints || 0}؛ نقاط سباكة ${room.plumbingPoints || 0}.`),
      `شروط العرض: ${documentTerms || 'لا توجد شروط إضافية.'}`,
      ...paymentNotes,
      `التكلفة التقديرية: ${fmt(totalCost)} ج · سعر البنود: ${fmt(estimateTotal)} ج · الاحتياطي ${contingencyPercent}% (${fmt(contingencyAmount)} ج) · الضريبة ${taxPercent}% (${fmt(taxAmount)} ج) · الإجمالي النهائي ${fmt(grandTotal)} ج · المدفوع ${fmt(totalPaid)} ج · المتبقي ${fmt(remainingAmount)} ج.`,
    ];
    return {
      title: kind === 'detailed' ? `مقايسة تفصيلية — ${apartmentName || projectName || 'الشقة'}` : `ملخص عرض — ${apartmentName || projectName || 'الشقة'}`,
      subtitle: `العميل: ${customerName}${projectName ? ` · المشروع: ${projectName}` : ''} · التاريخ: ${new Date().toLocaleDateString('ar-EG')}`,
      columns, rows, notes, permission: 'projects.print',
      fileName: `مقايسة-${kind === 'detailed' ? 'تفصيلية' : 'ملخص'}-${apartmentName || projectName || 'الشقة'}`,
      kpis: [
        { label: 'المساحة', value: `${fmt(inputApartmentArea)} م²` },
        { label: 'عدد البنود', value: lineRows.length }, { label: 'التكلفة', value: `${fmt(totalCost)} ج` },
        { label: 'الربح', value: `${fmt(grossProfit)} ج` }, { label: 'الإجمالي النهائي', value: `${fmt(grandTotal)} ج` },
        { label: 'المدفوع / المتبقي', value: `${fmt(totalPaid)} / ${fmt(remainingAmount)} ج` },
      ],
    };
  };

  const exportEstimateExcel = (kind: 'detailed' | 'summary') => {
    try { exportToExcel(buildEstimateDocument(kind)); setDataError(''); }
    catch (error) { setDataError(error instanceof Error ? error.message : 'تعذر تصدير ملف Excel.'); }
  };

  const saveEstimatePdf = async (kind: 'detailed' | 'summary') => {
    try {
      const report = buildEstimateDocument(kind);
      const html = buildExportHtml(report, true);
      await downloadPdf(html, report.fileName);
      setDataError('');
    } catch (error) { setDataError(error instanceof Error ? error.message : 'تعذر حفظ ملف PDF.'); }
  };

  const shareEstimateWithCustomer = (kind: 'detailed' | 'summary') => {
    try {
      const customer = customers.find((item) => item.id === customerId);
      if (!customer?.phone) { setDataError('أضف رقم هاتف العميل قبل إرسال المقايسة عبر واتساب.'); return; }
      const report = buildEstimateDocument(kind);
      const message = [
        `الأستاذ/ة ${customer.name}، مرفق ملخص ${kind === 'detailed' ? 'المقايسة التفصيلية' : 'عرض المقايسة'} لـ ${apartmentName || 'الشقة'}.`,
        `المساحة ${fmt(inputApartmentArea)} م² · البنود ${lines.filter((line) => line.name.trim() && getLineQuantity(line) > 0).length} · الإجمالي ${fmt(grandTotal)} ج · المدفوع ${fmt(totalPaid)} ج · المتبقي ${fmt(remainingAmount)} ج.`,
        `الشروط: ${documentTerms || 'حسب البنود والقياسات المعتمدة.'}`,
        `تم إعداد المستند: ${report.title}. احفظ ملف PDF وأرفقه بالمحادثة قبل الإرسال.`,
      ].join('\n');
      openWhatsAppChat(customer.phone, message);
      setDataError('');
    } catch (error) { setDataError(error instanceof Error ? error.message : 'تعذر تجهيز رسالة العميل.'); }
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-4 md:p-6" dir="rtl">
      <PageHeader
        title="حاسبة الشقة والمقايسة الهندسية"
        description="احسب مساحات الغرف وكميات التشطيب وتكلفتها، ثم أصدر عرض سعر قابلًا للتعديل والطباعة."
        eyebrow="التشطيبات والمشروعات"
        icon={<Building2 className="h-5 w-5" />}
        actions={<div className="flex flex-wrap gap-2">
          {canExportEstimate && <>
            <button type="button" onClick={() => void saveEstimatePdf('detailed')} className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-800">حفظ PDF تفصيلي</button>
            <button type="button" onClick={() => void saveEstimatePdf('summary')} className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-800">PDF ملخص</button>
            <button type="button" onClick={() => exportEstimateExcel('detailed')} className="inline-flex items-center gap-1 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-emerald-800"><FileSpreadsheet className="h-4 w-4" /> Excel تفصيلي</button>
            <button type="button" onClick={() => exportEstimateExcel('summary')} className="inline-flex items-center gap-1 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-emerald-800">Excel ملخص</button>
            <button type="button" onClick={() => shareEstimateWithCustomer('summary')} className="inline-flex items-center gap-1 rounded-xl border border-green-200 bg-white px-3 py-2 text-xs font-bold text-green-800"><MessageCircle className="h-4 w-4" /> إرسال للعميل</button>
          </>}
          {!projectId && <button type="button" onClick={saveLocalEstimate} className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-white px-4 py-2.5 text-sm font-bold text-sky-800"><Save className="h-4 w-4" /> حفظ المقايسة</button>}
          <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700"><Printer className="h-4 w-4" /> طباعة</button>
          <button type="button" onClick={() => { setSelectedEstimateId(''); setProjectId(''); setApartmentName(''); setApartmentArea(''); setRooms(initialRooms()); setLines(initialLines()); setCustomerId(''); setContingencyPercent(0); setTaxPercent(0); setPaidAmount(0); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700"><RotateCcw className="h-4 w-4" /> مقاولة جديدة</button>
          {projectId && canUpdateProjects && <button type="button" onClick={() => {
            try {
              const estimate = saveProjectEstimate();
              if (estimate) window.alert('تم حفظ تصميم الشقة والمقايسة على المشروع.');
            } catch (error) {
              setDataError(error instanceof Error ? error.message : 'تعذر حفظ تصميم المشروع.');
            }
          }} disabled={saving} className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-white px-4 py-2.5 text-sm font-bold text-sky-800 disabled:opacity-50"><Save className="h-4 w-4" /> حفظ على المشروع</button>}
          <button type="button" onClick={createQuotation} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-sky-800 disabled:opacity-50"><Save className="h-4 w-4" /> إصدار عرض سعر</button>
        </div>}
      />

      {dataError && <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{dataError}</div>}
      {recoveryDraft && !recoveryDismissed && <section role="status" className="mb-4 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 sm:flex-row sm:items-center sm:justify-between"><div><b className="text-sm text-amber-950">عُثر على مسودة محفوظة تلقائيًا</b><p className="mt-1 text-xs text-amber-800">آخر حفظ: {new Date(recoveryDraft.savedAt).toLocaleString('ar-EG')} · {recoveryDraft.apartmentName || 'مقايسة جديدة'}{recoveryDraft.projectId ? ' · مرتبطة بمشروع' : ''}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={restoreEstimateDraft} className="rounded-lg bg-amber-800 px-3 py-2 text-xs font-bold text-white">استعادة المسودة</button><button type="button" onClick={discardEstimateRecovery} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-900">تجاهل المسودة</button></div></section>}
      {!recoveryDraft || recoveryDismissed ? <div role="status" className={`mb-3 text-[10px] ${draftSaveStatus === 'ERROR' ? 'text-rose-700' : 'text-slate-400'}`}>{draftSaveStatus === 'ERROR' ? 'تعذر حفظ نسخة الاستعادة. قد تكون مساحة التخزين ممتلئة؛ صدّر المقايسة أو احفظها على المشروع.' : draftSavedAt ? `نسخة استعادة محلية محفوظة ${new Date(draftSavedAt).toLocaleTimeString('ar-EG')}` : ''}</div> : null}
      {productError && <div role="status" className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">تعذر تحميل قائمة أصناف المخزون: {productError}</div>}
      {stockError && <div role="status" className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />تعذر ربط المخزون: {stockError}</div>}

      <section className="mb-5 grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs font-bold text-slate-600">المشروع القائم
          <select value={projectId} onChange={(event) => { preservedDraftProjectId.current = null; setProjectId(event.target.value); }} className={`${fieldClass()} mt-1`}>
            <option value="">— بدون ربط بمشروع —</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.code} — {project.name}</option>)}
          </select>
        </label>
        {projectId && <label className="text-xs font-bold text-slate-600">التصميم المحفوظ
          <select value={selectedEstimateId} onChange={(event) => selectProjectEstimate(event.target.value)} className={`${fieldClass()} mt-1`}>
            <option value="">تصميم جديد للمشروع</option>
            {projectEstimates.map((estimate) => <option key={estimate.id} value={estimate.id}>{estimate.name} — {fmt(estimate.areaM2)} م²</option>)}
          </select>
        </label>}
        <label className="text-xs font-bold text-slate-600">اسم المشروع / الشقة<input value={apartmentName} onChange={(event) => setApartmentName(event.target.value)} className={`${fieldClass()} mt-1`} placeholder="مثال: شقة الأستاذ محمد" /></label>
        <label className="text-xs font-bold text-slate-600">مساحة الشقة (م²)<input type="number" min={0} step="0.1" value={apartmentArea} onChange={(event) => setApartmentArea(event.target.value)} className={`${fieldClass()} mt-1`} placeholder={`محسوبة تلقائيًا: ${fmt(totalArea)}`} /></label>
        <label className="text-xs font-bold text-slate-600">العميل لعرض السعر<select value={customerId} onChange={(event) => setCustomerId(event.target.value)} disabled={!!projectId} className={`${fieldClass()} mt-1 disabled:bg-slate-100`}><option value="">— اختر العميل —</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} {customer.phone ? `(${customer.phone})` : ''}</option>)}</select></label>
        <label className="text-xs font-bold text-slate-600">المستودع لحساب المتاح<select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} className={`${fieldClass()} mt-1`}><option value="">— اختر المستودع —</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
      </section>

      {!projectId && localEstimates.length > 0 && <section className="mb-5 rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
        <div className="mb-3 flex items-center gap-2 font-black text-sky-900"><FolderOpen className="h-4 w-4" /> سجل المقايسات المحفوظة على هذا الجهاز</div>
        <div className="flex flex-wrap gap-2">{localEstimates.map((estimate) => <div key={estimate.id} className="flex items-center gap-1 rounded-lg border border-sky-100 bg-white p-1">
          <button type="button" onClick={() => loadLocalEstimate(estimate.id)} className="px-2 py-1 text-xs font-bold text-slate-700">{estimate.name} · {fmt(estimate.area)} م²</button>
          <button type="button" aria-label={`حذف ${estimate.name}`} onClick={() => persistLocalEstimates(localEstimates.filter((item) => item.id !== estimate.id))} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>)}</div>
      </section>}

      {projectId && selectedEstimateId && <section className="mb-5 rounded-2xl border border-indigo-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-black text-slate-900">إصدارات المقايسة واعتمادها</h2><p className="text-xs text-slate-500">كل حفظ ينشئ نسخة مستقلة، وتظل عروض الأسعار مرتبطة بالإصدار الذي صدرت منه.</p></div><label className="min-w-64 text-[11px] font-bold text-slate-600">ملخص التعديل لهذه النسخة<input value={versionChangeSummary} onChange={(event) => setVersionChangeSummary(event.target.value)} className={`${fieldClass()} mt-1`} placeholder="مثال: تحديث أسعار السيراميك والكميات" /></label></div>
        <div className="space-y-2">{versions.map((version) => <article key={version.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs"><div><b>الإصدار {version.versionNumber} · {({ DRAFT: 'مسودة', PENDING: 'بانتظار المراجعة', APPROVED: 'معتمد', RETURNED: 'معاد للمراجعة' } as Record<string, string>)[version.status]}</b><div className="mt-1 text-slate-500">أعده {version.createdByName} · {new Date(version.createdAt).toLocaleString('ar-EG')} · {version.changeSummary}</div>{version.reviewedByName && <div className="mt-1 text-slate-500">راجعه {version.reviewedByName} · {version.reviewNotes || (version.status === 'APPROVED' ? 'تم الاعتماد' : '')}</div>}</div><div className="flex flex-wrap gap-1">{(version.status === 'DRAFT' || version.status === 'RETURNED') && version.id === versions[0]?.id && canUpdateProjects && <button type="button" onClick={() => submitVersionForReview(version.id)} className="rounded-lg border border-sky-200 bg-white px-2 py-1 font-bold text-sky-800">إرسال للمراجعة</button>}{version.status === 'PENDING' && canApproveProject && <><button type="button" disabled={version.id !== versions[0]?.id} onClick={() => reviewEstimateVersion(version.id, 'APPROVED')} className="rounded-lg bg-emerald-700 px-2 py-1 font-bold text-white disabled:opacity-50">اعتماد</button><button type="button" onClick={() => reviewEstimateVersion(version.id, 'RETURNED')} className="rounded-lg border border-rose-200 bg-white px-2 py-1 font-bold text-rose-700">إرجاع</button></>}<label className="flex items-center gap-1">مقارنة A<select value={compareVersionIds[0]} onChange={(event) => setCompareVersionIds((current) => [event.target.value, current[1]])} className="rounded border bg-white px-1 py-1"> <option value="">—</option>{versions.map((item) => <option key={item.id} value={item.id}>v{item.versionNumber}</option>)}</select></label><label className="flex items-center gap-1">B<select value={compareVersionIds[1]} onChange={(event) => setCompareVersionIds((current) => [current[0], event.target.value])} className="rounded border bg-white px-1 py-1"><option value="">—</option>{versions.map((item) => <option key={item.id} value={item.id}>v{item.versionNumber}</option>)}</select></label></div></article>)}</div>
        {compareA && compareB && <div className="mt-3 overflow-x-auto rounded-xl border border-indigo-100"><div className="p-3 text-xs font-bold text-indigo-900">مقارنة الإصدار {compareA.versionNumber} مع الإصدار {compareB.versionNumber} · الإجمالي {fmt(compareA.snapshot.totalAmount)} ← {fmt(compareB.snapshot.totalAmount)} ج · المساحة {fmt(compareA.snapshot.areaM2)} ← {fmt(compareB.snapshot.areaM2)} م² · تغييرات البنود: {compareLines.length}</div><table className="w-full min-w-[850px] text-right text-xs"><thead className="bg-slate-50"><tr><th className="p-2">البند</th><th className="p-2">الكمية قبل ← بعد</th><th className="p-2">المادة</th><th className="p-2">العمالة</th><th className="p-2">المعدات / المصروفات / الهالك / الخصم / الربح</th></tr></thead><tbody>{compareLines.map((row) => <tr key={row.id} className="border-t"><td className="p-2 font-bold">{row.name}</td><td className="p-2">{fmt(row.beforeQuantity)} ← {fmt(row.afterQuantity)}</td><td className="p-2">{fmt(row.beforePrice)} ← {fmt(row.afterPrice)}</td><td className="p-2">{fmt(row.beforeLabor)} ← {fmt(row.afterLabor)}</td><td className="p-2">{row.beforeOtherRates.map(fmt).join(' / ')} ← {row.afterOtherRates.map(fmt).join(' / ')}</td></tr>)}{!compareLines.length && <tr><td colSpan={5} className="p-3 text-center text-slate-500">لا توجد تغييرات في كميات البنود أو أسعارها.</td></tr>}</tbody></table></div>}
        {quotationLinks.length > 0 && <div className="mt-3 flex flex-wrap gap-2 text-xs"><b className="self-center text-slate-600">عروض الأسعار المرتبطة:</b>{quotationLinks.map((link) => <button key={link.quotationId} type="button" onClick={() => navigate('/quotations')} className="rounded-lg border border-sky-100 bg-sky-50 px-2 py-1 font-bold text-sky-800">{link.quotationNumber} · الإصدار {link.versionNumber ?? '—'}</button>)}</div>}
      </section>}

      {projectId && selectedEstimateId && canViewProjects && <section className="mb-5 rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="font-black text-slate-900">دورة تنفيذ المشروع</h2><p className="mt-1 text-xs text-slate-500">العقود والمراحل والمستخلصات والتكاليف الفعلية مرتبطة بإصدار المقايسة المعتمد.</p></div>
          {canUpdateProjects && <button type="button" onClick={initializeExecution} disabled={versions[0]?.status !== 'APPROVED'} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">إنشاء مراحل وميزانية من الإصدار المعتمد</button>}
        </div>
        {executionSummary ? <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
          <Metric label="قيمة العقد" value={`${fmt(executionSummary.contractValue)} ج`} /><Metric label="التكلفة المخططة" value={`${fmt(executionSummary.plannedCost)} ج`} /><Metric label="التكلفة الفعلية" value={`${fmt(executionSummary.actualCost)} ج`} /><Metric label="انحراف التكلفة" value={`${fmt(executionSummary.costVariance)} ج`} /><Metric label="المستخلصات المعتمدة" value={`${fmt(executionSummary.certifiedAmount)} ج`} /><Metric label="المدفوع للمستخلصات" value={`${fmt(executionSummary.paidAmount)} ج`} /><Metric label="استهلاك التكلفة" value={`${fmt(executionSummary.completionPercent)}%`} />
        </div> : <p className="mb-3 text-xs text-slate-500">اختر مشروعًا لعرض دورة التنفيذ.</p>}
        <div className="grid gap-3 xl:grid-cols-2">
          <div className="rounded-xl border border-slate-100 p-3">
            <h3 className="mb-2 text-sm font-black text-slate-800">العقود</h3>
            {canUpdateProjects && <div className="mb-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4"><input aria-label="تاريخ العقد" type="date" value={executionDraft.contractDate} onChange={(event) => setExecutionDraft((current) => ({ ...current, contractDate: event.target.value }))} className={fieldClass()} /><select aria-label="عرض السعر المرتبط بالعقد" value={executionDraft.quotationId} onChange={(event) => setExecutionDraft((current) => ({ ...current, quotationId: event.target.value }))} className={fieldClass()}><option value="">بدون ربط بعرض سعر</option>{quotationLinks.filter((link) => link.versionId === versions[0]?.id).map((link) => <option key={link.quotationId} value={link.quotationId}>{link.quotationNumber} · الإصدار {link.versionNumber}</option>)}</select><input aria-label="شروط العقد" value={executionDraft.terms} onChange={(event) => setExecutionDraft((current) => ({ ...current, terms: event.target.value }))} placeholder="شروط أو ملاحظات العقد" className={fieldClass()} /><button type="button" disabled={versions[0]?.status !== 'APPROVED'} onClick={createProjectContract} className="rounded-lg bg-sky-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">إنشاء عقد</button></div>}
            <div className="space-y-2">{executionContracts.map((contract) => <div key={contract.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-2 text-xs"><span><b>{contract.contract_number}</b> · {contract.contract_date} · {fmt(contract.contract_value)} ج · إصدار {contract.versionNumber}</span><span className="flex items-center gap-2"><b>{contract.status === 'SIGNED' ? 'موقّع' : contract.status === 'CANCELLED' ? 'ملغى' : 'مسودة'}</b>{canApproveProject && contract.status === 'DRAFT' && <button type="button" onClick={() => { try { executionService.updateContractStatus(contract.id, 'SIGNED'); refreshExecution(); } catch (error) { setDataError(error instanceof Error ? error.message : 'تعذر اعتماد العقد.'); } }} className="rounded bg-emerald-700 px-2 py-1 text-white">تأكيد التوقيع</button>}</span></div>)}{!executionContracts.length && <p className="text-xs text-slate-400">لا توجد عقود لهذا المشروع.</p>}</div>
          </div>
          <div className="rounded-xl border border-slate-100 p-3">
            <h3 className="mb-2 text-sm font-black text-slate-800">المراحل ومقارنة المخطط بالفعلي</h3>
            <div className="overflow-x-auto"><table className="w-full min-w-[420px] text-right text-xs"><thead className="bg-slate-50"><tr><th className="p-2">المرحلة</th><th className="p-2">مخطط</th><th className="p-2">فعلي مسجل</th><th className="p-2">الفرق</th></tr></thead><tbody>{(executionSummary?.schedule || []).map((phase) => <tr key={phase.title} className="border-t"><td className="p-2 font-bold">{phase.title}</td><td className="p-2">{fmt(phase.plannedAmount)} ج</td><td className="p-2">{fmt(phase.actualAmount)} ج</td><td className="p-2">{fmt(phase.plannedAmount - phase.actualAmount)} ج</td></tr>)}{!executionSummary?.schedule.length && <tr><td colSpan={4} className="p-2 text-center text-slate-400">أنشئ المراحل من الإصدار المعتمد لبدء المقارنة.</td></tr>}</tbody></table></div>
          </div>
          <div className="rounded-xl border border-slate-100 p-3">
            <h3 className="mb-2 text-sm font-black text-slate-800">المستخلصات والدفعات</h3>
            {canUpdateProjects && <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><input type="date" aria-label="تاريخ المستخلص" value={executionDraft.certificateDate} onChange={(event) => setExecutionDraft((current) => ({ ...current, certificateDate: event.target.value }))} className={fieldClass()} /><input type="date" aria-label="بداية فترة المستخلص" value={executionDraft.periodStart} onChange={(event) => setExecutionDraft((current) => ({ ...current, periodStart: event.target.value }))} className={fieldClass()} /><input type="date" aria-label="نهاية فترة المستخلص" value={executionDraft.periodEnd} onChange={(event) => setExecutionDraft((current) => ({ ...current, periodEnd: event.target.value }))} className={fieldClass()} /><NumberInput label="إنجاز الفترة %" value={executionDraft.progressPercent} min={0} max={100} onChange={(progressPercent) => setExecutionDraft((current) => ({ ...current, progressPercent }))} /><input value={executionDraft.certificateDescription} onChange={(event) => setExecutionDraft((current) => ({ ...current, certificateDescription: event.target.value }))} placeholder="وصف الأعمال المنفذة" className={`${fieldClass()} sm:col-span-2`} /><NumberInput label="قيمة المستخلص" value={executionDraft.certificateAmount} min={0} onChange={(certificateAmount) => setExecutionDraft((current) => ({ ...current, certificateAmount }))} /><button type="button" disabled={versions[0]?.status !== 'APPROVED'} onClick={createProjectCertificate} className="rounded-lg bg-sky-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">إنشاء مستخلص</button></div>}
            <div className="space-y-2">{executionCertificates.map((certificate) => <div key={certificate.id} className="rounded-lg bg-slate-50 p-2 text-xs"><div className="flex flex-wrap items-center justify-between gap-2"><span><b>{certificate.certificate_number}</b> · {certificate.certificate_date} · {certificate.description} · مطلوب {fmt(certificate.requested_amount)} ج · معتمد {fmt(certificate.approved_amount || 0)} ج · مدفوع {fmt(certificate.paid_amount)} ج</span><b>{({ DRAFT: 'مسودة', SUBMITTED: 'بانتظار المراجعة', APPROVED: 'معتمد', RETURNED: 'معاد', PAID: 'مدفوع' } as Record<string,string>)[certificate.status]}</b></div><div className="mt-2 flex flex-wrap gap-2">{certificate.status === 'DRAFT' && canUpdateProjects && <button type="button" onClick={() => { try { executionService.submitCertificate(certificate.id); refreshExecution(); } catch (error) { setDataError(error instanceof Error ? error.message : 'تعذر إرسال المستخلص.'); } }} className="rounded border bg-white px-2 py-1">إرسال للمراجعة</button>}{certificate.status === 'SUBMITTED' && canApproveProject && <><button type="button" onClick={() => { try { executionService.reviewCertificate(certificate.id, 'APPROVED'); refreshExecution(); } catch (error) { setDataError(error instanceof Error ? error.message : 'تعذر اعتماد المستخلص.'); } }} className="rounded bg-emerald-700 px-2 py-1 text-white">اعتماد</button><button type="button" onClick={() => { const notes = window.prompt('سبب إعادة المستخلص للمراجعة:'); if (!notes?.trim()) return; try { executionService.reviewCertificate(certificate.id, 'RETURNED', notes); refreshExecution(); } catch (error) { setDataError(error instanceof Error ? error.message : 'تعذر إعادة المستخلص.'); } }} className="rounded border border-rose-200 bg-white px-2 py-1 text-rose-700">إعادة</button></>}{['APPROVED'].includes(certificate.status) && canUpdateProjects && <button type="button" onClick={() => { const remaining = Number(certificate.approved_amount) - Number(certificate.paid_amount); const raw = window.prompt(`المتبقي ${fmt(remaining)} ج. أدخل قيمة الدفعة:`, String(remaining)); if (raw === null) return; const reference = window.prompt('مرجع الدفع (اختياري):') || ''; try { executionService.recordCertificatePayment(certificate.id, Number(raw), reference); refreshExecution(); } catch (error) { setDataError(error instanceof Error ? error.message : 'تعذر تسجيل الدفعة.'); } }} className="rounded border border-sky-200 bg-white px-2 py-1 text-sky-800">تسجيل دفعة</button>}</div>{certificate.review_notes && <p className="mt-1 text-rose-700">ملاحظة المراجعة: {certificate.review_notes}</p>}</div>)}{!executionCertificates.length && <p className="text-xs text-slate-400">لا توجد مستخلصات.</p>}</div>
          </div>
          <div className="rounded-xl border border-slate-100 p-3">
            <h3 className="mb-2 text-sm font-black text-slate-800">التكاليف الفعلية والمشتريات</h3>
            {canUpdateProjects && <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5"><input type="date" aria-label="تاريخ التكلفة" value={executionDraft.costDate} onChange={(event) => setExecutionDraft((current) => ({ ...current, costDate: event.target.value }))} className={fieldClass()} /><input value={executionDraft.costCategory} onChange={(event) => setExecutionDraft((current) => ({ ...current, costCategory: event.target.value }))} placeholder="المرحلة / التصنيف" className={fieldClass()} /><input value={executionDraft.costDescription} onChange={(event) => setExecutionDraft((current) => ({ ...current, costDescription: event.target.value }))} placeholder="وصف التكلفة" className={fieldClass()} /><NumberInput label="المبلغ الفعلي" value={executionDraft.costAmount} min={0} onChange={(costAmount) => setExecutionDraft((current) => ({ ...current, costAmount }))} /><button type="button" onClick={createActualCost} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white">تسجيل تكلفة</button></div>}
            <div className="space-y-1">{executionCosts.slice(0, 6).map((cost) => <div key={cost.id} className="flex justify-between gap-2 rounded bg-slate-50 p-2 text-xs"><span>{cost.cost_date} · {cost.category} · {cost.description}</span><b>{fmt(cost.amount)} ج</b></div>)}{!executionCosts.length && <p className="text-xs text-slate-400">لا توجد تكاليف فعلية مسجلة.</p>}</div>
            {executionCosts.length > 6 && <p className="mt-2 text-xs text-slate-500">إجمالي سجلات التكلفة: {executionCosts.length}</p>}
            <div className="mt-3 border-t pt-2"><b className="text-xs text-slate-700">طلبات شراء المشروع</b><div className="mt-1 space-y-1">{executionPurchases.slice(0, 4).map((request) => <div key={request.id} className="flex justify-between gap-2 rounded bg-amber-50 p-2 text-xs"><span>{request.requestNumber} · {request.date} · {request.itemsCount || 0} أصناف</span><b>{({ PENDING: 'معلق', APPROVED: 'معتمد', REJECTED: 'مرفوض', ORDERED: 'تم الطلب', CANCELLED: 'ملغي' } as Record<string,string>)[request.status] || request.status}</b></div>)}{!executionPurchases.length && <p className="text-xs text-slate-400">لا توجد طلبات شراء مرتبطة.</p>}</div></div>
          </div>
        </div>
      </section>}

      <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2"><Ruler className="h-5 w-5 text-sky-700" /><div><h2 className="font-black text-slate-900">تقسيم الشقة والغرف</h2><p className="text-xs text-slate-500">المساحة الصافية للحوائط تخصم فتحات الأبواب والنوافذ.</p></div></div>
          <button type="button" onClick={() => setRooms((current) => [...current, newRoom()])} className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-800"><Plus className="h-4 w-4" /> إضافة غرفة</button>
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {rooms.map((room, index) => {
            const measures = getRoomMeasures(room);
            return (
              <article key={room.id} className="rounded-xl border border-slate-200 p-3">
                <header className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-xs font-black text-slate-600">{index + 1}</span><input aria-label="اسم الغرفة" value={room.name} onChange={(event) => patchRoom(room.id, { name: event.target.value })} className="max-w-56 border-b border-slate-200 bg-transparent px-1 py-1 font-bold outline-none focus:border-sky-500" /></div>
                  {rooms.length > 1 && <button type="button" aria-label="حذف الغرفة" onClick={() => setRooms((current) => current.filter((entry) => entry.id !== room.id))} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>}
                </header>
                <div className="mb-2 grid grid-cols-2 gap-2">
                  <label className="text-[11px] font-bold text-slate-500">شكل الغرفة<select value={room.shape || 'rectangle'} onChange={(event) => {
                    const shape = event.target.value as Room['shape'];
                    if (shape === 'polygon') {
                      const vertices = room.polygonVertices?.length ? room.polygonVertices : [{ x: 0, y: 0 }, { x: room.length, y: 0 }, { x: room.length, y: room.width }, { x: 0, y: room.width }];
                      const walls = room.walls?.length === vertices.length ? room.walls : vertices.map((_, wallIndex) => ({ id: makeId(), name: `جدار ${wallIndex + 1}`, length: 0, height: room.height }));
                      patchRoom(room.id, { shape, polygonVertices: vertices, polygonCoordinatesInput: vertices.map((point) => `${point.x},${point.y}`).join('; '), walls });
                    } else patchRoom(room.id, { shape });
                  }} className={`${fieldClass()} mt-1`}><option value="rectangle">مستطيلة</option><option value="polygon">غير منتظمة / متعددة الأضلاع</option></select></label>
                  {room.shape === 'polygon' && <label className="text-[11px] font-bold text-slate-500">إحداثيات الرؤوس (س،ص بالمتر) مفصولة بفاصلة منقوطة<input value={room.polygonCoordinatesInput ?? (room.polygonVertices || []).map((point) => `${point.x},${point.y}`).join('; ')} onChange={(event) => {
                    const polygonCoordinatesInput = event.target.value;
                    const polygonVertices = parsePolygonCoordinates(polygonCoordinatesInput);
                    patchRoom(room.id, { polygonCoordinatesInput, polygonVertices });
                  }} className={`${fieldClass()} mt-1`} placeholder="0,0; 4,0; 3.5,3; 0,3" /><span className="mt-1 block font-normal text-slate-400">أدخل 3 رؤوس أو أكثر بالترتيب حول محيط الغرفة؛ المساحة تحسب من الإحداثيات.</span></label>}
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <NumberInput label="الطول (م)" value={room.length} min={0} onChange={(length) => patchRoom(room.id, { length })} />
                  <NumberInput label="العرض (م)" value={room.width} min={0} onChange={(width) => patchRoom(room.id, { width })} />
                  <NumberInput label="الارتفاع (م)" value={room.height} min={0} onChange={(height) => patchRoom(room.id, { height })} />
                </div>
                <div className="mt-3 rounded-lg border border-sky-100 bg-sky-50/50 p-2">
                  <div className="mb-2 flex items-center justify-between"><b className="text-[11px] text-sky-900">تقسيم الجدران وفتحات كل جدار</b><button type="button" onClick={() => patchRoom(room.id, { walls: [...(room.walls || []), { id: makeId(), name: `جدار ${(room.walls || []).length + 1}`, length: 2, height: room.height } ] })} className="text-[11px] font-bold text-sky-800">+ إضافة جدار / تقسيم</button></div>
                  <div className="space-y-2">{(room.walls || []).map((wall) => <div key={wall.id} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <input aria-label="اسم الجدار" value={wall.name} onChange={(event) => patchRoom(room.id, { walls: room.walls?.map((item) => item.id === wall.id ? { ...item, name: event.target.value } : item) })} className={`${fieldClass()} text-xs`} />
                    {room.shape === 'polygon' ? <div className="self-end rounded-lg bg-slate-50 px-2 py-2 text-[10px] text-slate-600">طول الضلع: {fmt(getRoomWallLength(room, wall.id))} م</div> : <NumberInput label="طول م" value={wall.length} min={0} step={0.1} onChange={(length) => patchRoom(room.id, { walls: room.walls?.map((item) => item.id === wall.id ? { ...item, length } : item) })} />}
                    <NumberInput label="ارتفاع م" value={wall.height} min={0} step={0.1} onChange={(height) => patchRoom(room.id, { walls: room.walls?.map((item) => item.id === wall.id ? { ...item, height } : item) })} />
                    <select aria-label="نوع الفتحة" className={fieldClass()} onChange={(event) => { const openings = room.openings || []; patchRoom(room.id, { openings: [...openings, { id: makeId(), wallId: wall.id, kind: event.target.value as 'door' | 'window', name: event.target.value === 'door' ? 'باب' : 'شباك', count: 1, width: event.target.value === 'door' ? 0.9 : 1.2, height: event.target.value === 'door' ? 2.1 : 1.2 }] }); event.target.value = ''; }} value=""><option value="">+ فتحة</option><option value="door">باب</option><option value="window">شباك</option></select>
                    {(room.shape !== 'polygon' || (room.walls || []).findIndex((item) => item.id === wall.id) >= (room.polygonVertices || []).length) && <button type="button" onClick={() => patchRoom(room.id, { walls: room.walls?.filter((item) => item.id !== wall.id), openings: room.openings?.filter((item) => item.wallId !== wall.id) })} className="rounded-lg text-xs text-rose-700">حذف</button>}
                    {(room.openings || []).filter((opening) => opening.wallId === wall.id).map((opening) => <div key={opening.id} className="col-span-2 grid grid-cols-2 gap-1 rounded bg-white p-1 sm:col-span-5 sm:grid-cols-5"><span className="self-center text-[10px]">{opening.name}</span><NumberInput label="عدد" value={opening.count} min={0} onChange={(count) => patchRoom(room.id, { openings: room.openings?.map((item) => item.id === opening.id ? { ...item, count } : item) })} /><NumberInput label="عرض" value={opening.width} min={0} step={0.1} onChange={(width) => patchRoom(room.id, { openings: room.openings?.map((item) => item.id === opening.id ? { ...item, width } : item) })} /><NumberInput label="ارتفاع" value={opening.height} min={0} step={0.1} onChange={(height) => patchRoom(room.id, { openings: room.openings?.map((item) => item.id === opening.id ? { ...item, height } : item) })} /><button type="button" onClick={() => patchRoom(room.id, { openings: room.openings?.filter((item) => item.id !== opening.id) })} className="col-span-2 text-right text-[10px] text-rose-700 sm:col-span-5">حذف الفتحة</button></div>)}
                  </div>)}</div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <NumberInput label="طول البلكونة م" value={room.balconyLength || 0} min={0} step={0.1} onChange={(balconyLength) => patchRoom(room.id, { balconyLength })} />
                  <NumberInput label="عرض البلكونة م" value={room.balconyWidth || 0} min={0} step={0.1} onChange={(balconyWidth) => patchRoom(room.id, { balconyWidth })} />
                  <NumberInput label="نقاط الكهرباء" value={room.electricalPoints || 0} min={0} onChange={(electricalPoints) => patchRoom(room.id, { electricalPoints })} />
                  <NumberInput label="نقاط السباكة" value={room.plumbingPoints || 0} min={0} onChange={(plumbingPoints) => patchRoom(room.id, { plumbingPoints })} />
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-lg bg-slate-50 p-2">
                    <div className="mb-2 flex items-center gap-1 text-[11px] font-bold text-slate-600"><DoorOpen className="h-3.5 w-3.5" /> الأبواب</div>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                      <NumberInput label="عدد" value={room.doorCount} min={0} onChange={(doorCount) => patchRoom(room.id, { doorCount })} />
                      <NumberInput label="عرض" value={room.doorWidth} min={0} step={0.1} onChange={(doorWidth) => patchRoom(room.id, { doorWidth })} />
                      <NumberInput label="ارتفاع" value={room.doorHeight} min={0} step={0.1} onChange={(doorHeight) => patchRoom(room.id, { doorHeight })} />
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2">
                    <div className="mb-2 flex items-center gap-1 text-[11px] font-bold text-slate-600"><Building2 className="h-3.5 w-3.5" /> النوافذ</div>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                      <NumberInput label="عدد" value={room.windowCount} min={0} onChange={(windowCount) => patchRoom(room.id, { windowCount })} />
                      <NumberInput label="عرض" value={room.windowWidth} min={0} step={0.1} onChange={(windowWidth) => patchRoom(room.id, { windowWidth })} />
                      <NumberInput label="ارتفاع" value={room.windowHeight} min={0} step={0.1} onChange={(windowHeight) => patchRoom(room.id, { windowHeight })} />
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
                  <Metric label="الأرضية" value={`${fmt(measures.floor)} م²`} />
                  <Metric label="الحيطان الصافية" value={`${fmt(measures.walls)} م²`} />
                  <Metric label="السقف" value={`${fmt(measures.ceiling)} م²`} />
                  <Metric label="المحيط" value={`${fmt(measures.perimeter)} م`} />
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-violet-700" /><div><h2 className="font-black text-slate-900">بنود التشطيب والتسعير</h2><p className="text-xs text-slate-500">الهالك يضاف إلى كمية الخامات، بينما تحسب المصنعية على الكمية الصافية.</p></div></div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={materialActionBusy || materialActionsCreated.purchase} onClick={() => { if (window.confirm('هل اعتمدت المقايسة؟ سيتم إنشاء طلب شراء للعجز فقط.')) createPurchaseRequestForShortages(); }} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 disabled:opacity-50">{materialActionsCreated.purchase ? 'تم إنشاء طلب الشراء' : 'طلب شراء للعجز'}</button>
            <button type="button" disabled={materialActionBusy || materialActionsCreated.issue} onClick={() => { if (window.confirm('هل اعتمدت المقايسة؟ سينشأ طلب صرف للمواد المتاحة، وسيبقى بانتظار اعتماد المخول.')) createStockIssueRequests(); }} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-900 disabled:opacity-50">{materialActionsCreated.issue ? 'تم إنشاء طلب الصرف' : 'طلب صرف المتاح'}</button>
            <select aria-label="إضافة قالب بند محفوظ" defaultValue="" onChange={(event) => { applyLineTemplate(event.target.value); event.target.value = ''; }} className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-bold text-violet-800"><option value="">إضافة من القوالب…</option>{lineTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select>
            <button type="button" onClick={() => setLines((current) => [...current, newLine('أعمال أخرى', 'بند جديد', 'manual', 'بند')])} className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-800"><Plus className="h-4 w-4" /> إضافة بند</button>
          </div>
        </div>
        <div className="space-y-4">
          {lines.map((line) => {
            const quantity = getLineQuantity(line);
            const materialQuantity = rooms.reduce((sum, room) => sum + getRoomLineTotal(line, room, rooms.length).materialQuantity, 0);
            const total = rooms.reduce((sum, room) => sum + getRoomLineTotal(line, room, rooms.length).total, 0);
            const linkedProduct = products.find((product) => product.id === line.materialProductId);
            const compatibleProduct = linkedProduct && isUnitCompatible(linkedProduct, line.unit);
            const stockAvailable = compatibleProduct && warehouseId && !stockError
              ? loadLinkedStock(line.materialProductId, line.unit)
              : null;
            const shortage = stockAvailable === null ? 0 : Math.max(0, materialQuantity - stockAvailable);
            return (
              <article key={line.id} className="rounded-xl border border-slate-200 p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-6">
                  <label className="text-[11px] font-bold text-slate-500">البند<input value={line.name} onChange={(event) => patchLine(line.id, { name: event.target.value })} className={`${fieldClass()} mt-1`} /></label>
                  <label className="text-[11px] font-bold text-slate-500">التصنيف<input value={line.category} onChange={(event) => patchLine(line.id, { category: event.target.value })} className={`${fieldClass()} mt-1`} /></label>
                  <label className="text-[11px] font-bold text-slate-500">نوع الأعمال<select value={line.workType || 'FINISHING'} onChange={(event) => patchLine(line.id, { workType: event.target.value as CostLine['workType'] })} className={`${fieldClass()} mt-1`}><option value="FOUNDATION">أعمال تأسيس</option><option value="FINISHING">أعمال تشطيب</option></select></label>
                  <label className="text-[11px] font-bold text-slate-500">مرحلة التنفيذ<select value={line.phase || ''} onChange={(event) => patchLine(line.id, { phase: event.target.value })} className={`${fieldClass()} mt-1`}><option value="">اختر المرحلة</option>{['تجهيز الموقع','الأعمال المدنية','تأسيس الكهرباء','تأسيس السباكة','العزل','المحارة','الأرضيات','الدهانات','التركيبات النهائية','التسليم'].map((phase) => <option key={phase}>{phase}</option>)}</select></label>
                  <label className="text-[11px] font-bold text-slate-500">طريقة حساب الكمية<select value={line.measure} onChange={(event) => patchLine(line.id, { measure: event.target.value as Measure })} className={`${fieldClass()} mt-1`}>{Object.entries(measureLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
                  <label className="text-[11px] font-bold text-slate-500">الوحدة<input value={line.unit} onChange={(event) => patchLine(line.id, { unit: event.target.value })} className={`${fieldClass()} mt-1`} /></label>
                  {line.measure === 'manual' && <NumberInput label="الكمية اليدوية" value={line.manualQuantity} min={0} step={0.1} onChange={(manualQuantity) => patchLine(line.id, { manualQuantity })} />}
                  <label className="text-[11px] font-bold text-slate-500">الصنف المرتبط بالمخزون<select value={line.materialProductId} onChange={(event) => setLineMaterialProduct(line, event.target.value)} className={`${fieldClass()} mt-1`}><option value="">— بدون ربط مخزني —</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} ({product.sku}) — {product.baseUnit}</option>)}</select></label>
                </div>
                <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600"><b>طريقة الاحتساب:</b> {rooms.map((room) => `${room.name}: ${getMeasureFormula(line, room, rooms.length)} = ${fmt(getQuantity(line, room, rooms.length))} ${line.unit}`).join(' · ')}</div>
                <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                  <label className="text-[11px] font-bold text-slate-500">المواصفات الفنية<textarea value={line.specifications || ''} onChange={(event) => patchLine(line.id, { specifications: event.target.value })} rows={2} className={`${fieldClass()} mt-1`} placeholder="الماركة، المقاس، طريقة التركيب، معيار الجودة…" /></label>
                  <label className="text-[11px] font-bold text-slate-500">ملاحظات التنفيذ<textarea value={line.notes || ''} onChange={(event) => patchLine(line.id, { notes: event.target.value })} rows={2} className={`${fieldClass()} mt-1`} placeholder="ملاحظات خاصة بهذا البند" /></label>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                  <label className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 font-bold text-slate-700">إرفاق ملف<input type="file" className="hidden" onChange={(event) => { void addLineAttachment(line, event.target.files?.[0]).catch((error) => setDataError(error instanceof Error ? error.message : 'تعذر إرفاق الملف.')); event.currentTarget.value = ''; }} /></label>
                  {(line.attachments || []).map((attachment) => <span key={attachment.id} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1"><a href={attachment.dataUrl} download={attachment.name} className="underline">{attachment.name}</a><button type="button" aria-label={`حذف المرفق ${attachment.name}`} onClick={() => patchLine(line.id, { attachments: line.attachments?.filter((item) => item.id !== attachment.id) })} className="font-black text-rose-700">×</button></span>)}
                  <button type="button" onClick={() => saveLineTemplate(line)} className="mr-auto rounded-lg border border-sky-200 px-3 py-2 font-bold text-sky-800">حفظ كقالب</button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                  <NumberInput label={`سعر الخامات / ${line.unit}`} value={line.materialRate} min={0} step={0.01} onChange={(materialRate) => patchLine(line.id, { materialRate })} />
                  <NumberInput label={`المصنعية / ${line.unit}`} value={line.laborRate} min={0} step={0.01} onChange={(laborRate) => patchLine(line.id, { laborRate })} />
                  <NumberInput label={`المعدات / ${line.unit}`} value={line.equipmentRate || 0} min={0} step={0.01} onChange={(equipmentRate) => patchLine(line.id, { equipmentRate })} />
                  <NumberInput label={`المصروفات / ${line.unit}`} value={line.expenseRate || 0} min={0} step={0.01} onChange={(expenseRate) => patchLine(line.id, { expenseRate })} />
                  <NumberInput label="الهالك %" value={line.wastePercent} min={0} step={0.1} onChange={(wastePercent) => patchLine(line.id, { wastePercent })} />
                  <NumberInput label="الخصم %" value={line.discountPercent} min={0} max={100} step={0.1} onChange={(discountPercent) => patchLine(line.id, { discountPercent })} />
                  <NumberInput label="الربح %" value={line.profitPercent} min={0} step={0.1} onChange={(profitPercent) => patchLine(line.id, { profitPercent })} />
                  <div className="flex items-end justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs"><div><div className="text-[10px] text-slate-500">الكمية / تكلفة / بيع / ربح</div><b className="text-emerald-800">{fmt(quantity)} {line.unit} • {fmt(rooms.reduce((sum, room) => sum + getRoomLineTotal(line, room, rooms.length).cost, 0))} / {fmt(total)} / {fmt(rooms.reduce((sum, room) => sum + getRoomLineTotal(line, room, rooms.length).profitAmount, 0))} ج</b></div><button type="button" aria-label="حذف البند" onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))} className="rounded-md p-1 text-slate-400 hover:bg-rose-100 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button></div>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 rounded-lg bg-slate-50 px-3 py-2 text-[10px] text-slate-600"><span>خامات: {fmt(rooms.reduce((sum, room) => sum + getRoomLineTotal(line, room, rooms.length).materialCost, 0))} ج</span><span>عمالة: {fmt(rooms.reduce((sum, room) => sum + getRoomLineTotal(line, room, rooms.length).laborCost, 0))} ج</span><span>معدات: {fmt(rooms.reduce((sum, room) => sum + getRoomLineTotal(line, room, rooms.length).equipmentCost, 0))} ج</span><span>مصروفات: {fmt(rooms.reduce((sum, room) => sum + getRoomLineTotal(line, room, rooms.length).expenseCost, 0))} ج</span><span>الربح بعد الخصم: {fmt(rooms.reduce((sum, room) => sum + getRoomLineTotal(line, room, rooms.length).profitAmount, 0))} ج</span></div>
                {linkedProduct && <div className="mb-2 rounded-lg border border-slate-100 p-2 text-[10px] text-slate-600"><div className="flex flex-wrap items-center gap-3"><span>سجل سعر المادة: {(line.materialPriceHistory || []).length} لقطة</span><button type="button" onClick={() => loadPurchasePriceHistory(line.materialProductId)} className="font-bold text-sky-800">عرض أسعار الشراء السابقة</button></div>{(line.materialPriceHistory || []).slice(-4).reverse().map((entry) => <div key={entry.id} className="mt-1">{new Date(entry.date).toLocaleDateString('ar-EG')} — {fmt(entry.unitPrice)} ج/{line.unit} — {entry.note || 'تغيير سعر'}</div>)}{(priceHistory[line.materialProductId] || []).slice(0, 5).map((entry, index) => <div key={`${entry.invoiceNumber}-${index}`} className="mt-1">{entry.date} — {entry.supplierName} — {fmt(entry.effectiveUnitCost)} ج/{linkedProduct.baseUnit} — فاتورة {entry.invoiceNumber}</div>)}</div>}
                {linkedProduct && <div className="mb-2 rounded-lg border border-slate-100 p-2 text-[10px] text-slate-600"><div className="flex flex-wrap items-center gap-3"><span>سجل سعر المادة: {(line.materialPriceHistory || []).length} لقطة</span><button type="button" onClick={() => loadPurchasePriceHistory(line.materialProductId)} className="font-bold text-sky-800">عرض أسعار الشراء السابقة</button></div>{(line.materialPriceHistory || []).slice(-4).reverse().map((entry) => <div key={entry.id} className="mt-1">{new Date(entry.date).toLocaleDateString('ar-EG')} — {fmt(entry.unitPrice)} ج/{line.unit} — {entry.note || 'تغيير سعر'}</div>)}{(priceHistory[line.materialProductId] || []).slice(0, 5).map((entry, index) => <div key={`${entry.invoiceNumber}-${index}`} className="mt-1">{entry.date} — {entry.supplierName} — {fmt(entry.effectiveUnitCost)} ج/{linkedProduct.baseUnit} — فاتورة {entry.invoiceNumber}</div>)}</div>}
                {linkedProduct && (
                  <div className={`mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-3 py-2 text-[11px] ${shortage > 0 ? 'bg-amber-50 text-amber-900' : 'bg-sky-50 text-sky-900'}`}>
                    <span className="inline-flex items-center gap-1 font-bold"><Package className="h-3.5 w-3.5" /> {linkedProduct.name}</span>
                    <span>الاحتياج شامل الهالك: {fmt(materialQuantity)} {line.unit}</span>
                    <span>{stockAvailable === null ? 'الرصيد غير متاح' : `المتاح بالمستودع: ${fmt(stockAvailable)} ${line.unit}`}</span>
                    {stockAvailable !== null && shortage > 0 && <span className="font-black">عجز متوقع: {fmt(shortage)} {line.unit}</span>}
                    {!compatibleProduct && <span className="font-bold">وحدة الصنف لا تطابق وحدة الاحتياج؛ لم يتم احتساب الرصيد.</span>}
                    {compatibleProduct && stockAvailable === null && <span>اختر مستودعًا صالحًا لعرض الرصيد.</span>}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2"><Calculator className="h-5 w-5 text-emerald-700" /><h2 className="font-black text-slate-900">المقايسة النهائية حسب الغرفة</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-right text-sm">
            <thead className="bg-slate-50 text-xs font-bold text-slate-500"><tr><th className="px-3 py-2">الغرفة</th><th className="px-3 py-2">المساحة</th><th className="px-3 py-2">مساحة الحوائط</th><th className="px-3 py-2">إجمالي الغرفة</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{roomTotals.map(({ room, measures, total }) => <tr key={room.id}><td className="px-3 py-3 font-bold">{room.name}</td><td className="px-3 py-3">{fmt(measures.floor)} م²</td><td className="px-3 py-3">{fmt(measures.walls)} م²</td><td className="px-3 py-3 font-black text-emerald-700">{fmt(total)} ج</td></tr>)}</tbody>
            <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-black"><tr><td className="px-3 py-3">إجمالي الشقة</td><td className="px-3 py-3">{fmt(totalArea)} م²</td><td className="px-3 py-3">{fmt(rooms.reduce((sum, room) => sum + getRoomMeasures(room).walls, 0))} م²</td><td className="px-3 py-3 text-lg text-emerald-700">{fmt(estimateTotal)} ج</td></tr></tfoot>
          </table>
        </div>
        <div className="mb-3 grid grid-cols-1 gap-2 rounded-xl border border-emerald-100 bg-white p-3 text-sm sm:grid-cols-3"><Metric label="تكلفة التنفيذ" value={`${fmt(totalCost)} ج`} /><Metric label="سعر البيع قبل الإضافات" value={`${fmt(estimateTotal)} ج`} /><Metric label="الربح الإجمالي وهامشه" value={`${fmt(grossProfit)} ج · ${fmt(estimateTotal ? grossProfit / estimateTotal * 100 : 0)}%`} /></div>
        <div className="mt-3 grid grid-cols-1 gap-3 rounded-xl bg-emerald-700 px-4 py-3 text-white md:grid-cols-2 xl:grid-cols-5">
          <span className="font-bold">إجمالي المقايسة شامل البنود والتسعير</span>
          <span className="text-xl font-black">{fmt(estimateTotal)} ج</span>
          <NumberInput label="احتياطي / طوارئ %" value={contingencyPercent} min={0} step={0.1} onChange={setContingencyPercent} />
          <NumberInput label="ضريبة %" value={taxPercent} min={0} step={0.1} onChange={setTaxPercent} />
          <NumberInput label="مدفوع مقدمًا (ج)" value={paidAmount} min={0} step={1} onChange={setPaidAmount} />
        </div>
        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
          <label className="mb-3 block text-xs font-bold text-slate-600">الشروط والملاحظات الظاهرة للعميل<textarea value={documentTerms} onChange={(event) => setDocumentTerms(event.target.value)} rows={3} className={`${fieldClass()} mt-1 resize-y`} placeholder="اكتب مدة صلاحية العرض وشروط التنفيذ والضمان والاستثناءات" /></label>
          <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5"><NumberInput label="دفعة جديدة (ج)" value={paymentDraft.amount} min={0} max={remainingAmount} step={1} onChange={(amount) => setPaymentDraft((current) => ({ ...current, amount }))} /><label className="text-[10px] font-bold text-slate-500">تاريخ الدفعة<input type="date" value={paymentDraft.date} onChange={(event) => setPaymentDraft((current) => ({ ...current, date: event.target.value }))} className={`${fieldClass()} mt-1`} /></label><label className="text-[10px] font-bold text-slate-500">طريقة الدفع<input value={paymentDraft.method} onChange={(event) => setPaymentDraft((current) => ({ ...current, method: event.target.value }))} className={`${fieldClass()} mt-1`} /></label><label className="text-[10px] font-bold text-slate-500">المرجع / ملاحظة<input value={paymentDraft.reference} onChange={(event) => setPaymentDraft((current) => ({ ...current, reference: event.target.value }))} className={`${fieldClass()} mt-1`} /></label><button type="button" disabled={paymentDraft.amount <= 0 || paymentDraft.amount > remainingAmount || !paymentDraft.date || !paymentDraft.method.trim()} onClick={() => { if (paymentDraft.amount > remainingAmount) { setDataError('قيمة الدفعة تتجاوز الرصيد المتبقي.'); return; } setPayments((current) => [...current, { ...paymentDraft, id: makeId() }]); setPaymentDraft((current) => ({ ...current, amount: 0, reference: '' })); }} className="self-end rounded-lg bg-sky-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">تسجيل الدفعة</button></div>
          <div className="space-y-1">{payments.map((payment) => <div key={payment.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs"><span>{payment.date} · {payment.method} · {payment.reference || 'بدون مرجع'}</span><b>{fmt(payment.amount)} ج</b><button type="button" onClick={() => setPayments((current) => current.filter((item) => item.id !== payment.id))} className="font-bold text-rose-700">حذف</button></div>)}</div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
          <Metric label="قيمة الاحتياطي" value={`${fmt(contingencyAmount)} ج`} />
          <Metric label="قيمة الضريبة" value={`${fmt(taxAmount)} ج`} />
          <Metric label="الإجمالي النهائي" value={`${fmt(grandTotal)} ج`} />
          <Metric label="إجمالي الدفعات المسجلة" value={`${fmt(totalPaid)} ج`} />
          <Metric label="المتبقي بعد المدفوع" value={`${fmt(remainingAmount)} ج`} />
        </div>
        <div className="mt-3 flex justify-end">
          <button type="button" onClick={createQuotation} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-black text-emerald-800 disabled:opacity-60"><Save className="h-4 w-4" /> اعتماد كعرض سعر <ArrowRight className="h-4 w-4" /></button>
        </div>
      </section>
    </div>
  );
};

const NumberInput: React.FC<{
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}> = ({ label, value, min, max, step = 0.01, onChange }) => (
  <label className="block text-[10px] font-bold text-slate-500">
    {label}
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(Math.max(min ?? Number.NEGATIVE_INFINITY, Math.min(max ?? Number.POSITIVE_INFINITY, Number(event.target.value) || 0)))}
      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-800 outline-none focus:border-sky-400"
    />
  </label>
);

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5"><div className="text-[9px] text-slate-400">{label}</div><div className="font-bold text-slate-700">{value}</div></div>
);

export default ApartmentEstimatePage;
