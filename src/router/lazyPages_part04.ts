import { lazy } from 'react';
import { moduleLazy } from '../modules/moduleLazy';

export const FinancialStatementsPage = moduleLazy('reports', () => import('../pages/reports/financial-statements/FinancialStatementsPage').then(m => ({ default: m.FinancialStatementsPage })));

export const SalesReportsPage = moduleLazy('reports', () => import('../pages/reports/sales-reports/SalesReportsPage').then(m => ({ default: m.SalesReportsPage })));

export const PosReportsPage = moduleLazy('reports', () => import('../pages/reports/pos-reports/PosReportsPage').then(m => ({ default: m.PosReportsPage })));

export const PurchaseInventoryReportPage = moduleLazy('reports', () => import('../pages/reports/purchase-inventory/PurchaseInventoryReportPage').then(m => ({ default: m.PurchaseInventoryReportPage })));

// Approvals, Documents & Security
export const ApprovalsPage = moduleLazy('approvals', () => import('../pages/approvals/approvals/ApprovalsPage').then(m => ({ default: m.ApprovalsPage })));

export const DocumentsPage = moduleLazy('documents', () => import('../pages/documents/documents/DocumentsPage').then(m => ({ default: m.DocumentsPage })));

export const NotificationsView = lazy(() => import('../components/notifications/NotificationsView').then(m => ({ default: m.NotificationsView })));

export const AuditLogView = lazy(() => import('../components/admin/AuditLogView').then(m => ({ default: m.AuditLogView })));

export const SecurityCenterPage = lazy(() => import('../pages/admin/security-center/SecurityCenterPage').then(m => ({ default: m.SecurityCenterPage })));

export const SyncStatusPage = lazy(() => import('../pages/admin/sync/SyncStatusPage').then(m => ({ default: m.SyncStatusPage })));

export const SyncConflictsPage = lazy(() => import('../pages/admin/sync-conflicts/SyncConflictsPage').then(m => ({ default: m.SyncConflictsPage })));

export const AdminPage = lazy(() => import('../pages/admin/admin/AdminPage').then(m => ({ default: m.AdminPage })));

export const DataDeletionPage = lazy(() => import('../pages/admin/data-deletion/DataDeletionPage').then(m => ({ default: m.DataDeletionPage })));

// Settings & Fallback
export const DynamicDataPage = lazy(() => import('../pages/settings/dynamic-data/DynamicDataPage').then(m => ({ default: m.DynamicDataPage })));

export const AppConfigurationView = lazy(() => import('../pages/settings/app-configuration/AppConfigurationPage').then(m => ({ default: m.AppConfigurationPage })));

export const ConfigurationStudioView = lazy(() => import('../pages/settings/configuration-studio/ConfigurationStudioPage').then(m => ({ default: m.ConfigurationStudioPage })));

export const DataImportPage = lazy(() => import('../pages/settings/data-import/DataImportPage').then(m => ({ default: m.DataImportPage })));

export const SettingsHubPage = lazy(() => import('../pages/settings/settings-hub/SettingsHubPage').then(m => ({ default: m.SettingsHubPage })));

export const CompanySettingsPage = lazy(() => import('../pages/settings/company/CompanySettingsPage').then(m => ({ default: m.CompanySettingsPage })));

export const ApprovalSettingsPage = lazy(() => import('../pages/settings/approvals/ApprovalSettingsPage').then(m => ({ default: m.ApprovalSettingsPage })));

export const LicenseModeSettingsPage = lazy(() => import('../pages/settings/license-mode/LicenseModeSettingsPage').then(m => ({ default: m.LicenseModeSettingsPage })));

export const CentralActivationView = lazy(() => import('../components/auth/CentralActivationView').then(m => ({ default: m.CentralActivationView })));

export const UsersView = lazy(() => import('../components/admin/UsersView').then(m => ({ default: m.UsersView })));

export const BackupPage = lazy(() => import('../pages/settings/backup/BackupPage').then(m => ({ default: m.BackupPage })));

export const SystemHealthPage = lazy(() => import('../pages/settings/system-health/SystemHealthPage').then(m => ({ default: m.SystemHealthPage })));

export const NotFoundPage = lazy(() => import('../pages/common/not-found/NotFoundPage').then(m => ({ default: m.NotFoundPage })));


export const OperationsShiftsPage = moduleLazy('operations', () => import('../pages/operations/shifts/OperationsShiftsPage').then(m => ({ default: m.OperationsShiftsPage })));

export const PlatformSuperAdminDashboard = lazy(() => import('../pages/platform/PlatformSuperAdminDashboard').then(m => ({ default: m.PlatformSuperAdminDashboard })));
export const PlatformUserPlatformPermissionsPage = lazy(() => import('../pages/platform/PlatformUserPlatformPermissionsPage').then(m => ({ default: m.PlatformUserPlatformPermissionsPage })));
