import { useEffect } from 'react';
import { validateEstimateMeasurements } from '../../../services/domains/projects/estimateValidation';
import {
  DEFAULT_ESTIMATE_TERMS, ESTIMATE_RECOVERY_KEY, initialLines, initialRooms,
  type CostLine, type RecoverableEstimateDraft, type Room,
} from './estimateModel';
import type { ApartmentEstimateState } from './useApartmentEstimateState';

export const useEstimateRecovery = (s: ApartmentEstimateState) => {
  const {
    projectEstimateService, recoveryDraft, recoveryDismissed,
    projectId, selectedEstimateId, apartmentName, apartmentArea, customerId, warehouseId,
    rooms, lines, contingencyPercent, taxPercent, paidAmount, payments, documentTerms,
    setDraftSaveStatus, setDraftSavedAt,
    setProjectId, setSelectedEstimateId, setApartmentName, setApartmentArea,
    setCustomerId, setWarehouseId, setRooms, setLines,
    setContingencyPercent, setTaxPercent, setPaidAmount, setPayments, setDocumentTerms,
    setRecoveryDismissed, setDataError, setVersions, setQuotationLinks, setRecoveryDraft,
    preservedDraftProjectId,
  } = s;

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

  return { restoreEstimateDraft, discardEstimateRecovery };
};
