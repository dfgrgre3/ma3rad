// Policies & Compliance delegations → PlatformPolicyService (versioned
// policy documents, approval workflow, retention config, export bundle).
import { platformPolicyService } from '../PlatformPolicyService';
import type {
  PlatformPolicyDocumentDetail,
  PlatformPolicyDocumentInput,
  PlatformPolicyDocumentRecord,
  PlatformPolicyRetentionConfig,
  PlatformPolicyVersionRecord,
  PlatformPoliciesExportBundle,
} from '../platformTypes';

export interface PoliciesApi {
  listPolicyDocuments(): PlatformPolicyDocumentRecord[];
  getPolicyDocument(slug: string): PlatformPolicyDocumentDetail;
  savePolicyDraft(input: PlatformPolicyDocumentInput): PlatformPolicyDocumentDetail;
  submitPolicyForApproval(slug: string): PlatformPolicyDocumentDetail;
  approvePolicyPublish(slug: string): PlatformPolicyDocumentDetail;
  rejectPolicy(slug: string, reviewNote?: string): PlatformPolicyDocumentDetail;
  listPolicyVersions(slug: string): PlatformPolicyVersionRecord[];
  restorePolicyVersion(slug: string, version: number): PlatformPolicyDocumentDetail;
  getRetentionPolicy(): PlatformPolicyRetentionConfig;
  saveRetentionPolicy(input: Partial<PlatformPolicyRetentionConfig>): PlatformPolicyRetentionConfig;
  exportPoliciesBundle(): PlatformPoliciesExportBundle;
}

export function createPoliciesApi(): PoliciesApi {
  return {
    listPolicyDocuments() {
      return platformPolicyService.listPolicyDocuments();
    },

    getPolicyDocument(slug: string) {
      return platformPolicyService.getPolicyDocument(slug);
    },

    savePolicyDraft(input: PlatformPolicyDocumentInput) {
      return platformPolicyService.savePolicyDraft(input);
    },

    submitPolicyForApproval(slug: string) {
      return platformPolicyService.submitPolicyForApproval(slug);
    },

    approvePolicyPublish(slug: string) {
      return platformPolicyService.approvePolicyPublish(slug);
    },

    rejectPolicy(slug: string, reviewNote?: string) {
      return platformPolicyService.rejectPolicy(slug, reviewNote);
    },

    listPolicyVersions(slug: string) {
      return platformPolicyService.listPolicyVersions(slug);
    },

    restorePolicyVersion(slug: string, version: number) {
      return platformPolicyService.restorePolicyVersion(slug, version);
    },

    getRetentionPolicy() {
      return platformPolicyService.getRetentionPolicy();
    },

    saveRetentionPolicy(input: Partial<PlatformPolicyRetentionConfig>) {
      return platformPolicyService.saveRetentionPolicy(input);
    },

    exportPoliciesBundle() {
      return platformPolicyService.exportPoliciesBundle();
    },
  };
}
