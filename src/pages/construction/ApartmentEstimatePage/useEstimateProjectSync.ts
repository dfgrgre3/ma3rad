import { useEffect } from 'react';
import { DEFAULT_ESTIMATE_TERMS, initialLines, initialRooms } from './estimateModel';
import type { ApartmentEstimateState } from './useApartmentEstimateState';

export const useEstimateProjectSync = (s: ApartmentEstimateState) => {
  const {
    projectId, projects, projectEstimateService, selectedEstimateId,
    setMaterialActionsCreated, setProjectEstimates, setVersions, setQuotationLinks,
    setSelectedEstimateId, setPayments, setApartmentName, setApartmentArea,
    setDocumentTerms, setRooms, setLines, setContingencyPercent, setTaxPercent,
    setPaidAmount, setCustomerId, setDataError, setCompareVersionIds,
    preservedDraftProjectId,
  } = s;

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
};
