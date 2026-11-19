import { useMemo, useRef, useState } from 'react';
import { QuotationService } from '../../../services/domains/sales/QuotationService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { ProjectService, type Project } from '../../../services/domains/projects/ProjectService';
import { ApartmentEstimateService } from '../../../services/domains/projects/ApartmentEstimateService';
import { ProjectExecutionService } from '../../../services/domains/projects/ProjectExecutionService';
import type { ApartmentEstimate, ApartmentEstimateQuotationLink, ApartmentEstimateVersion, EstimatePayment } from '../../../types/projects/apartmentEstimate';
import type { Customer, Product, Warehouse } from '../../../types';
import {
  getQuantity, getRoomLineTotal, getRoomMeasures,
} from '../estimateCalculations';
import {
  DEFAULT_ESTIMATE_TERMS,
  readLineTemplates, readLocalEstimates, readRecoverableEstimateDraft,
  initialLines, initialRooms,
  type CostLine, type ExecutionDraft, type LineTemplate, type LocalEstimate,
  type PaymentDraftState, type PurchasePriceSnapshot, type RecoverableEstimateDraft,
  type Room, type StockRow,
} from './estimateModel';

export const useApartmentEstimateState = () => {
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
  const [paymentDraft, setPaymentDraft] = useState<PaymentDraftState>({ date: new Date().toISOString().slice(0, 10), amount: 0, method: 'نقدي', reference: '', notes: '' });
  const [executionSummary, setExecutionSummary] = useState<ReturnType<ProjectExecutionService['getSummary']> | null>(null);
  const [executionContracts, setExecutionContracts] = useState<any[]>([]);
  const [executionCertificates, setExecutionCertificates] = useState<any[]>([]);
  const [executionCosts, setExecutionCosts] = useState<any[]>([]);
  const [executionPurchases, setExecutionPurchases] = useState<any[]>([]);
  const [executionDraft, setExecutionDraft] = useState<ExecutionDraft>({ contractDate: new Date().toISOString().slice(0, 10), terms: '', quotationId: '', certificateDate: new Date().toISOString().slice(0, 10), periodStart: '', periodEnd: '', certificateDescription: '', progressPercent: 0, certificateAmount: 0, costDate: new Date().toISOString().slice(0, 10), costCategory: '', costDescription: '', costAmount: 0 });
  const canCreateQuotation = PermissionService.can(AuthService.getCurrentUser(), 'ui.quotations.quotations.create');
  const canViewProjects = PermissionService.can(AuthService.getCurrentUser(), 'ui.projects.list.view');
  const canUpdateProjects = PermissionService.can(AuthService.getCurrentUser(), 'ui.projects.list.update');
  const canApproveProject = PermissionService.can(AuthService.getCurrentUser(), 'ui.projects.list.approve');
  const canViewPurchaseRequests = PermissionService.can(AuthService.getCurrentUser(), 'ui.purchases.requests.view');
  const canExportEstimate = PermissionService.can(AuthService.getCurrentUser(), 'projects.print');

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

  return {
    quotationService, projectEstimateService, executionService,
    customers, setCustomers, projects, setProjects,
    projectId, setProjectId, projectEstimates, setProjectEstimates,
    versions, setVersions, quotationLinks, setQuotationLinks,
    versionChangeSummary, setVersionChangeSummary,
    compareVersionIds, setCompareVersionIds,
    selectedEstimateId, setSelectedEstimateId,
    products, setProducts, warehouses, setWarehouses,
    stock, setStock, rooms, setRooms, lines, setLines,
    lineTemplates, setLineTemplates,
    apartmentName, setApartmentName, apartmentArea, setApartmentArea,
    documentTerms, setDocumentTerms,
    customerId, setCustomerId, warehouseId, setWarehouseId,
    dataError, setDataError, productError, setProductError, stockError, setStockError,
    priceHistory, setPriceHistory,
    materialActionBusy, setMaterialActionBusy,
    materialActionsCreated, setMaterialActionsCreated,
    saving, setSaving,
    recoveryDraft, setRecoveryDraft, recoveryDismissed, setRecoveryDismissed,
    draftSaveStatus, setDraftSaveStatus, draftSavedAt, setDraftSavedAt,
    preservedDraftProjectId,
    localEstimates, setLocalEstimates,
    contingencyPercent, setContingencyPercent,
    taxPercent, setTaxPercent,
    paidAmount, setPaidAmount,
    payments, setPayments,
    paymentDraft, setPaymentDraft,
    executionSummary, setExecutionSummary,
    executionContracts, setExecutionContracts,
    executionCertificates, setExecutionCertificates,
    executionCosts, setExecutionCosts,
    executionPurchases, setExecutionPurchases,
    executionDraft, setExecutionDraft,
    canCreateQuotation, canViewProjects, canUpdateProjects, canApproveProject,
    canViewPurchaseRequests, canExportEstimate,
    roomTotals, estimateTotal, totalCost, grossProfit, totalPaid, totalArea,
    inputApartmentArea, contingencyAmount, taxableAmount, taxAmount,
    grandTotal, remainingAmount,
    getLineQuantity, compareA, compareB, compareLines,
  };
};

export type ApartmentEstimateState = ReturnType<typeof useApartmentEstimateState>;
