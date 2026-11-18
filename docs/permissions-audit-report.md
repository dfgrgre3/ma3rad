# تدقيق توحيد الصلاحيات — المرحلة 0

تاريخ التوليد: 2026-11-18T01:54:20.836Z

## الملخص

| المقياس | القيمة |
|---|---|
| totalPathsCompared | 158 |
| declaredRoutes | 150 |
| pageViewEntries | 145 |
| routePermissionRules | 132 |
| navItems | 133 |
| granularPermissions | 4050 |
| sectionPermissions | 511 |
| pagesWithTabs | 70 |
| tabbedPagesGuarded | 52 |
| tabbedPagesUnguarded | 18 |
| pathsGuardVsRulesDiverge | 0 |
| pathsNoGuardPermission | 0 |
| pathsNoRouteRule | 0 |
| pathsUncoveredByAnything | 0 |

## المسارات المتضاربة (حارس المسار ≠ قواعد المسار/التبويبات)

_لا يوجد._

## مسارات بلا صلاحية حارس (PAGE_VIEW_PERMISSIONS)


## مسارات بلا قاعدة مسار/تبويب (ROUTE_PERMISSIONS + القوائم)


## صفحات التبويبات

صفحات تحوي تبويبات: 70 — مفلترة بالصلاحيات: 52 — بلا فحص: 18

### تبويبات بلا أي فحص صلاحيات

- `src/pages/daily/today-purchases/PurchasesTabsBar.tsx`
- `src/pages/hr/attendance-devices/AttendanceDevicesPage.tsx`
- `src/pages/hr/benefits/HrBenefitsPage.tsx`
- `src/pages/hr/clearance/EmployeeClearancePage.tsx`
- `src/pages/hr/discipline/HrDisciplinePage.tsx`
- `src/pages/hr/organization/HrOrganizationPage.tsx`
- `src/pages/hr/performance/PerformancePage.tsx`
- `src/pages/hr/self-service/HrSelfServicePage.tsx`
- `src/pages/hr/social-insurance/PayrollSocialInsurancePage.tsx`
- `src/pages/hr/training/TrainingPage.tsx`
- `src/pages/hr/workforce-planning/WorkforcePlanningPage.tsx`
- `src/pages/inventory/stock-transfers/components/StockTransfersTabs.tsx`
- `src/pages/operations/employees/EmployeeFilters.tsx`
- `src/pages/operations/employees/EmployeeTabs.tsx`
- `src/pages/purchasing/supplier-detail/SupplierHeader.tsx`
- `src/pages/reports/financial-statements/FinancialStatementsPage.tsx`
- `src/pages/sales/reservations/ReservationsToolbar_part01.tsx`
- `src/pages/sales/reservations/ReservationsToolbar_part02.tsx`

### تبويبات مفلترة

- `src/pages/admin/admin/AdminPage.tsx` — permission-checks
- `src/pages/admin/admin/AdminSettingsTab.tsx` — permission-checks
- `src/pages/admin/sync/SyncStatusPage.tsx` — permission-checks
- `src/pages/admin/sync-conflicts/SyncConflictsPage.tsx` — permission-checks
- `src/pages/common/workspace-hub/WorkspaceHub.tsx` — WorkspaceHub + route-rules-only
- `src/pages/crm/crm-hub/CRMHubPage.tsx` — useRouteAccess + WorkspaceHub + route-rules-only
- `src/pages/customers/customer-detail/CustomerDetailPage.tsx` — permission-checks
- `src/pages/customers/partners/PartnersPage.tsx` — permission-checks
- `src/pages/daily/today-purchases/TodayPurchasesPage.tsx` — permission-checks
- `src/pages/dashboard/dashboard/DashboardPage.tsx` — permission-checks
- `src/pages/documents/documents/DocumentsPage.tsx` — permission-checks
- `src/pages/finance/budgets-cost-centers/BudgetsCostCentersPage.tsx` — permission-checks
- `src/pages/finance/e-payment-settlement/EPaymentSettlementPage.tsx` — permission-checks
- `src/pages/finance/fiscal-closing/FiscalClosingPage.tsx` — permission-checks
- `src/pages/finance/installments/InstallmentsPage.tsx` — permission-checks
- `src/pages/finance/journal-entries/JournalEntriesPage.tsx` — permission-checks
- `src/pages/finance/receivables-hub/ReceivablesHubPage.tsx` — useRouteAccess + route-rules-only
- `src/pages/hr/recruitment/RecruitmentPage.tsx` — permission-checks
- `src/pages/inventory/inventory-hub/InventoryHubPage.tsx` — useRouteAccess + WorkspaceHub + route-rules-only
- `src/pages/inventory/stock-transfers/StockTransfersPage.tsx` — permission-checks
- `src/pages/manufacturing/manufacturing/ManufacturingPage.tsx` — permission-checks
- `src/pages/operations/attendance/AttendancePage.tsx` — permission-checks
- `src/pages/operations/employees/EmployeesPage.tsx` — permission-checks
- `src/pages/operations/facility-management/FacilityManagementPage.tsx` — permission-checks
- `src/pages/operations/shifts/OperationsShiftsPage.tsx` — permission-checks
- `src/pages/platform/PlatformActivitySettingsPage.tsx` — platform-rbac
- `src/pages/platform/PlatformAdminControlPage.tsx` — platform-rbac
- `src/pages/platform/PlatformAppConfigurationPage.tsx` — platform-rbac
- `src/pages/platform/PlatformBillingPage.tsx` — platform-rbac
- `src/pages/platform/PlatformBrandingSettingsPage.tsx` — platform-rbac
- `src/pages/platform/PlatformCustomizationSettingsPage.tsx` — platform-rbac
- `src/pages/platform/PlatformIntegrationsPage.tsx` — platform-rbac
- `src/pages/platform/PlatformOperationsSettingsPage.tsx` — platform-rbac
- `src/pages/platform/PlatformPoliciesPage.tsx` — platform-rbac
- `src/pages/platform/PlatformProductPage.tsx` — platform-rbac
- `src/pages/platform/PlatformSecurityCenterPage.tsx` — platform-rbac
- `src/pages/platform/PlatformSettingsPage.tsx` — platform-rbac
- `src/pages/platform/PlatformStaffPage.tsx` — platform-rbac
- `src/pages/platform/PlatformTenantsPage.tsx` — platform-rbac
- `src/pages/products/product-catalog-hub/ProductCatalogHubPage.tsx` — useRouteAccess + WorkspaceHub + route-rules-only
- `src/pages/products/product-detail/ProductDetailHeader.tsx` — permission-checks
- `src/pages/products/product-detail/ProductDetailPage.tsx` — permission-checks
- `src/pages/projects/project-detail/ProjectDetailPage.tsx` — permission-checks
- `src/pages/purchasing/supplier-detail/SupplierDetailPage.tsx` — permission-checks
- `src/pages/reports/purchase-inventory/PurchaseInventoryReportPage.tsx` — permission-checks
- `src/pages/reports/reports-hub/ReportsHubPage.tsx` — permission-checks
- `src/pages/restaurant/restaurant/RestaurantPage.tsx` — permission-checks
- `src/pages/sales/after-sales/AfterSalesPage.tsx` — permission-checks
- `src/pages/sales/reservations/ReservationsDepositPage.tsx` — permission-checks
- `src/pages/sales/sales-hub/SalesHubPage.tsx` — useRouteAccess + WorkspaceHub + route-rules-only
- `src/pages/settings/app-configuration/AppConfigurationPage.tsx` — permission-checks
- `src/pages/settings/configuration-studio/ConfigurationStudioPage.tsx` — permission-checks
