import { validateEstimateMeasurements } from '../../../services/domains/projects/estimateValidation';
import type { ApartmentEstimate } from '../../../types/projects/apartmentEstimate';
import {
  DEFAULT_ESTIMATE_TERMS, LOCAL_ESTIMATES_KEY, initialLines, initialRooms, makeId,
  type LocalEstimate,
} from './estimateModel';
import type { ApartmentEstimateState } from './useApartmentEstimateState';

export const useEstimatePersistence = (s: ApartmentEstimateState) => {
  const {
    projectId, projects, projectEstimateService, selectedEstimateId, projectEstimates,
    localEstimates, apartmentName, apartmentArea, documentTerms,
    rooms, lines, contingencyPercent, taxPercent, paidAmount, payments,
    customerId, versionChangeSummary, inputApartmentArea, estimateTotal, grandTotal,
    canUpdateProjects, getLineQuantity,
    setDataError, setSelectedEstimateId, setApartmentName, setProjectEstimates,
    setProjectId, setCustomerId,
    setVersions, setQuotationLinks, setVersionChangeSummary, setApartmentArea,
    setDocumentTerms, setRooms, setLines, setContingencyPercent, setTaxPercent,
    setPayments, setPaidAmount, setCompareVersionIds, setMaterialActionsCreated,
    setLocalEstimates, preservedDraftProjectId,
  } = s;

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

  return {
    saveProjectEstimate, selectProjectEstimate, refreshVersionHistory,
    submitVersionForReview, reviewEstimateVersion,
    persistLocalEstimates, saveLocalEstimate, loadLocalEstimate,
  };
};
