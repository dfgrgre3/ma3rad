import type {
  ContractStatus,
  EnterpriseContract,
  EnterpriseDocument,
  EnterpriseDocumentVersion,
} from '../../../../types/documents';
import { daysBetween, effectiveContractStatus } from './validation';

export function mapDocument(row: any): EnterpriseDocument {
  return {
    id: row.id,
    companyId: row.company_id ?? row.companyId,
    companyName: row.companyName ?? row.company_name ?? null,
    branchId: row.branch_id ?? row.branchId ?? null,
    branchName: row.branchName ?? row.branch_name ?? null,
    documentNumber: row.document_number ?? row.documentNumber,
    title: row.title,
    category: row.category,
    description: row.description ?? null,
    status: row.status,
    confidentiality: row.confidentiality,
    ownerUserId: row.owner_user_id ?? row.ownerUserId ?? null,
    ownerName: row.ownerName ?? row.owner_name ?? null,
    currentVersion: Number(row.current_version ?? row.currentVersion ?? 0),
    expiresAt: row.expires_at ?? row.expiresAt ?? null,
    createdBy: row.created_by ?? row.createdBy ?? null,
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt,
  };
}

export function mapVersion(row: any): EnterpriseDocumentVersion {
  return {
    id: row.id,
    documentId: row.document_id ?? row.documentId,
    versionNumber: Number(row.version_number ?? row.versionNumber),
    fileName: row.file_name ?? row.fileName,
    mimeType: row.mime_type ?? row.mimeType ?? null,
    fileSize: row.file_size === null || row.file_size === undefined ? null : Number(row.file_size),
    checksum: row.checksum ?? null,
    storageName: row.storage_name ?? row.storageName ?? null,
    notes: row.notes ?? null,
    createdBy: row.created_by ?? row.createdBy ?? null,
    createdByName: row.createdByName ?? row.created_by_name ?? null,
    createdAt: row.created_at ?? row.createdAt,
  };
}

export function mapContract(row: any, today: string): EnterpriseContract {
  const startDate = row.start_date ?? row.startDate;
  const endDate = row.end_date ?? row.endDate;
  const status = row.status as ContractStatus;
  const renewalNoticeDays = Number(row.renewal_notice_days ?? row.renewalNoticeDays ?? 30);
  const effectiveStatus = effectiveContractStatus({ status, startDate, endDate, renewalNoticeDays }, today);
  return {
    id: row.id,
    companyId: row.company_id ?? row.companyId,
    companyName: row.companyName ?? null,
    branchId: row.branch_id ?? row.branchId ?? null,
    contractNumber: row.contract_number ?? row.contractNumber,
    title: row.title,
    partyType: row.party_type ?? row.partyType,
    partyId: row.party_id ?? row.partyId ?? null,
    partyName: row.party_name ?? row.partyName,
    startDate,
    endDate,
    value: Number(row.value || 0) / 100,
    currency: row.currency,
    status,
    effectiveStatus,
    autoRenew: Number(row.auto_renew ?? (row.autoRenew ? 1 : 0)) === 1,
    renewalNoticeDays,
    ownerUserId: row.owner_user_id ?? row.ownerUserId ?? null,
    ownerName: row.ownerName ?? null,
    documentId: row.document_id ?? row.documentId ?? null,
    documentTitle: row.documentTitle ?? null,
    notes: row.notes ?? null,
    terminatedAt: row.terminated_at ?? row.terminatedAt ?? null,
    terminationReason: row.termination_reason ?? row.terminationReason ?? null,
    createdBy: row.created_by ?? row.createdBy ?? null,
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt,
    daysToExpiry: status === 'TERMINATED' ? null : daysBetween(today, endDate),
  };
}
