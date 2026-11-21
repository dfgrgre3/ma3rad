// Unified async gateway for the Policies & Compliance page. Delegates to the
// central server when the central data source is active, otherwise to the
// local PlatformPolicyService (sync calls wrapped in promises).
import { platformAdminService } from '../../../services/domains/platform/PlatformAdminService';
import { centralPlatformClient } from '../../../services/domains/platform/CentralPlatformClient';
import { getCentralDataSourceState } from '../../../hooks/platform/useCentralDataSource';
import type {
  PlatformPolicyDocumentDetail,
  PlatformPolicyDocumentInput,
  PlatformPolicyDocumentRecord,
  PlatformPolicyRetentionConfig,
  PlatformPolicyVersionRecord,
  PlatformPoliciesExportBundle,
} from '../../../services/domains/platform/platformTypes';

const isCentral = () => getCentralDataSourceState().active;

export const policiesGateway = {
  async listPolicyDocuments(): Promise<PlatformPolicyDocumentRecord[]> {
    return isCentral()
      ? centralPlatformClient.listPolicyDocuments()
      : platformAdminService.listPolicyDocuments();
  },

  async getPolicyDocument(slug: string): Promise<PlatformPolicyDocumentDetail> {
    return isCentral()
      ? centralPlatformClient.getPolicyDocument(slug)
      : platformAdminService.getPolicyDocument(slug);
  },

  async savePolicyDraft(input: PlatformPolicyDocumentInput): Promise<PlatformPolicyDocumentDetail> {
    return isCentral()
      ? centralPlatformClient.savePolicyDraft(input)
      : platformAdminService.savePolicyDraft(input);
  },

  async submitPolicyForApproval(slug: string): Promise<PlatformPolicyDocumentDetail> {
    return isCentral()
      ? centralPlatformClient.submitPolicyForApproval(slug)
      : platformAdminService.submitPolicyForApproval(slug);
  },

  async approvePolicyPublish(slug: string): Promise<PlatformPolicyDocumentDetail> {
    return isCentral()
      ? centralPlatformClient.approvePolicyPublish(slug)
      : platformAdminService.approvePolicyPublish(slug);
  },

  async rejectPolicy(slug: string, reviewNote?: string): Promise<PlatformPolicyDocumentDetail> {
    return isCentral()
      ? centralPlatformClient.rejectPolicy(slug, reviewNote)
      : platformAdminService.rejectPolicy(slug, reviewNote);
  },

  async listPolicyVersions(slug: string): Promise<PlatformPolicyVersionRecord[]> {
    return isCentral()
      ? centralPlatformClient.listPolicyVersions(slug)
      : platformAdminService.listPolicyVersions(slug);
  },

  async restorePolicyVersion(slug: string, version: number): Promise<PlatformPolicyDocumentDetail> {
    return isCentral()
      ? centralPlatformClient.restorePolicyVersion(slug, version)
      : platformAdminService.restorePolicyVersion(slug, version);
  },

  async getRetentionPolicy(): Promise<PlatformPolicyRetentionConfig> {
    return isCentral()
      ? centralPlatformClient.getRetentionPolicy()
      : platformAdminService.getRetentionPolicy();
  },

  async saveRetentionPolicy(input: Partial<PlatformPolicyRetentionConfig>): Promise<PlatformPolicyRetentionConfig> {
    return isCentral()
      ? centralPlatformClient.saveRetentionPolicy(input)
      : platformAdminService.saveRetentionPolicy(input);
  },

  async exportPoliciesBundle(): Promise<PlatformPoliciesExportBundle> {
    return isCentral()
      ? centralPlatformClient.exportPoliciesBundle()
      : platformAdminService.exportPoliciesBundle();
  },
};
