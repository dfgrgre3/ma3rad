// Policies & Compliance endpoints — versioned policy documents, approval
// workflow, retention configuration and export. Mirrors the local
// PlatformPolicyService surface so pages can swap backends transparently.
import type { PlatformAdminApiCore } from './core';
import type {
  PlatformPolicyDocumentDetail,
  PlatformPolicyDocumentInput,
  PlatformPolicyDocumentRecord,
  PlatformPolicyRetentionConfig,
  PlatformPolicyVersionRecord,
  PlatformPoliciesExportBundle,
} from '../platformTypes';

export interface PoliciesApi {
  listPolicyDocuments(this: PlatformAdminApiCore): Promise<PlatformPolicyDocumentRecord[]>;
  getPolicyDocument(this: PlatformAdminApiCore, slug: string): Promise<PlatformPolicyDocumentDetail>;
  savePolicyDraft(this: PlatformAdminApiCore, input: PlatformPolicyDocumentInput): Promise<PlatformPolicyDocumentDetail>;
  submitPolicyForApproval(this: PlatformAdminApiCore, slug: string): Promise<PlatformPolicyDocumentDetail>;
  approvePolicyPublish(this: PlatformAdminApiCore, slug: string): Promise<PlatformPolicyDocumentDetail>;
  rejectPolicy(this: PlatformAdminApiCore, slug: string, reviewNote?: string): Promise<PlatformPolicyDocumentDetail>;
  listPolicyVersions(this: PlatformAdminApiCore, slug: string): Promise<PlatformPolicyVersionRecord[]>;
  restorePolicyVersion(this: PlatformAdminApiCore, slug: string, version: number): Promise<PlatformPolicyDocumentDetail>;
  getRetentionPolicy(this: PlatformAdminApiCore): Promise<PlatformPolicyRetentionConfig>;
  saveRetentionPolicy(this: PlatformAdminApiCore, input: Partial<PlatformPolicyRetentionConfig>): Promise<PlatformPolicyRetentionConfig>;
  exportPoliciesBundle(this: PlatformAdminApiCore): Promise<PlatformPoliciesExportBundle>;
}

const docPath = (slug: string) => `/api/v1/admin/policies/documents/${encodeURIComponent(slug)}`;

async function unwrap<T>(envelope: { data?: T | null }): Promise<T> {
  // requestEnvelope already throws CentralApiError on success === false.
  return (envelope.data ?? null) as T;
}

export function createPoliciesApi(): PoliciesApi {
  return {
    async listPolicyDocuments(this: PlatformAdminApiCore) {
      const envelope = await this.requestEnvelope<PlatformPolicyDocumentRecord[]>({
        path: '/api/v1/admin/policies/documents',
        method: 'GET',
      });
      return unwrap(envelope);
    },

    async getPolicyDocument(this: PlatformAdminApiCore, slug: string) {
      const envelope = await this.requestEnvelope<PlatformPolicyDocumentDetail>({
        path: docPath(slug),
        method: 'GET',
      });
      return unwrap(envelope);
    },

    async savePolicyDraft(this: PlatformAdminApiCore, input: PlatformPolicyDocumentInput) {
      // PUT /documents/:slug is an upsert — the server creates the document
      // (policies.create) when the slug is unknown and updates the draft
      // (policies.update) otherwise, mirroring the local service.
      if (!input.slug) {
        throw new Error('slug is required');
      }
      const envelope = await this.requestEnvelope<PlatformPolicyDocumentDetail>({
        path: docPath(input.slug),
        method: 'PUT',
        body: {
          title: input.title,
          content: input.content,
          changeSummary: input.changeSummary,
        },
      });
      return unwrap(envelope);
    },

    async submitPolicyForApproval(this: PlatformAdminApiCore, slug: string) {
      const envelope = await this.requestEnvelope<PlatformPolicyDocumentDetail>({
        path: `${docPath(slug)}/submit`,
        method: 'POST',
      });
      return unwrap(envelope);
    },

    async approvePolicyPublish(this: PlatformAdminApiCore, slug: string) {
      const envelope = await this.requestEnvelope<PlatformPolicyDocumentDetail>({
        path: `${docPath(slug)}/approve`,
        method: 'POST',
      });
      return unwrap(envelope);
    },

    async rejectPolicy(this: PlatformAdminApiCore, slug: string, reviewNote?: string) {
      const envelope = await this.requestEnvelope<PlatformPolicyDocumentDetail>({
        path: `${docPath(slug)}/reject`,
        method: 'POST',
        body: { reviewNote: reviewNote ?? null },
      });
      return unwrap(envelope);
    },

    async listPolicyVersions(this: PlatformAdminApiCore, slug: string) {
      const envelope = await this.requestEnvelope<PlatformPolicyVersionRecord[]>({
        path: `${docPath(slug)}/versions`,
        method: 'GET',
      });
      return unwrap(envelope);
    },

    async restorePolicyVersion(this: PlatformAdminApiCore, slug: string, version: number) {
      const envelope = await this.requestEnvelope<PlatformPolicyDocumentDetail>({
        path: `${docPath(slug)}/restore`,
        method: 'POST',
        body: { version },
      });
      return unwrap(envelope);
    },

    async getRetentionPolicy(this: PlatformAdminApiCore) {
      const envelope = await this.requestEnvelope<PlatformPolicyRetentionConfig>({
        path: '/api/v1/admin/policies/retention',
        method: 'GET',
      });
      return unwrap(envelope);
    },

    async saveRetentionPolicy(this: PlatformAdminApiCore, input: Partial<PlatformPolicyRetentionConfig>) {
      const envelope = await this.requestEnvelope<PlatformPolicyRetentionConfig>({
        path: '/api/v1/admin/policies/retention',
        method: 'PUT',
        body: input,
      });
      return unwrap(envelope);
    },

    async exportPoliciesBundle(this: PlatformAdminApiCore) {
      const envelope = await this.requestEnvelope<PlatformPoliciesExportBundle>({
        path: '/api/v1/admin/policies/export',
        method: 'GET',
      });
      return unwrap(envelope);
    },
  };
}
