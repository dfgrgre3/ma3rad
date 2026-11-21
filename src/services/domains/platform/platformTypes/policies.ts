// Platform Policies & Compliance — policy documents, versioned publishing
// workflow and data-retention configuration.
//
// Naming note: `PlatformPolicyDocument` / `PlatformPolicyRetention` already
// exist in ./health.ts for the legacy getPlatformPolicies()/savePlatformPolicies()
// settings-key API. The richer workflow types below use distinct names so both
// surfaces can coexist during the migration.

export type PlatformPolicyDocumentStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'PUBLISHED';

export interface PlatformPolicyDocumentRecord {
  id: string;
  slug: string;
  title: string;
  status: PlatformPolicyDocumentStatus;
  /** Working copy — differs from the published snapshot until approved. */
  draftContent: string;
  draftChangeSummary: string | null;
  draftUpdatedBy: string | null;
  draftUpdatedAt: string | null;
  submittedBy: string | null;
  submittedAt: string | null;
  /** Points at the latest published row in platform_policy_versions. */
  currentVersionId: string | null;
  currentVersion: number | null;
  publishedAt: string | null;
  publishedBy: string | null;
  reviewNote: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformPolicyVersionRecord {
  id: string;
  documentId: string;
  version: number;
  title: string;
  content: string;
  changeSummary: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  approvedBy: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  isCurrent: boolean;
}

/** Document detail returned to the editor: record + published snapshot + versions. */
export interface PlatformPolicyDocumentDetail extends PlatformPolicyDocumentRecord {
  /** Content of the currently published version (null when never published). */
  publishedContent: string | null;
  publishedTitle: string | null;
  versions: PlatformPolicyVersionRecord[];
}

export interface PlatformPolicyDocumentInput {
  slug?: string;
  title?: string;
  content?: string;
  changeSummary?: string;
}

export interface PlatformPolicyRetentionConfig {
  auditRetentionDays: number;
  backupRetentionDays: number;
  syncLogRetentionDays: number;
  softDeleteGraceDays: number;
  notificationLogRetentionDays?: number;
  supportTicketRetentionDays?: number;
  errorReportRetentionDays?: number;
}

export interface PlatformPoliciesExportBundle {
  exportedAt: string;
  exportedBy: string | null;
  documents: Array<{
    slug: string;
    title: string;
    status: PlatformPolicyDocumentStatus;
    currentVersion: number | null;
    publishedContent: string | null;
    draftContent: string;
    publishedAt: string | null;
  }>;
  retention: PlatformPolicyRetentionConfig;
}
