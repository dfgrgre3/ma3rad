import { moduleLazy } from '../modules/moduleLazy';

export const InventoryValuationPage = moduleLazy('inventory', () => import('../pages/inventory/inventory-valuation/InventoryValuationPage').then(m => ({ default: m.InventoryValuationPage })));

export const InventoryAdjustmentsPage = moduleLazy('inventory', () => import('../pages/inventory/inventory-adjustments/InventoryAdjustmentsPage').then(m => ({ default: m.InventoryAdjustmentsPage })));

export const StockReservationsPage = moduleLazy('inventory', () => import('../pages/inventory/stock-reservations/StockReservationsPage').then(m => ({ default: m.StockReservationsPage })));

export const ReorderPlanningPage = moduleLazy('inventory', () => import('../pages/inventory/reorder-planning/ReorderPlanningPage').then(m => ({ default: m.ReorderPlanningPage })));

export const WarehouseLocationsPage = moduleLazy('inventory', () => import('../pages/inventory/warehouse-locations/WarehouseLocationsPage').then(m => ({ default: m.WarehouseLocationsPage })));

export const DamageQuarantinePage = moduleLazy('inventory', () => import('../pages/inventory/damage-quarantine/DamageQuarantinePage').then(m => ({ default: m.DamageQuarantinePage })));

export const InventoryReconciliationPage = moduleLazy('inventory', () => import('../pages/inventory/inventory-reconciliation/InventoryReconciliationPage').then(m => ({ default: m.InventoryReconciliationPage })));

// Operations, Branches & Warehouses
export const BranchesPage = moduleLazy('operations', () => import('../pages/operations/branches/BranchesPage').then(m => ({ default: m.BranchesPage })));

export const WarehousesPage = moduleLazy('operations', () => import('../pages/operations/warehouses/WarehousesPage').then(m => ({ default: m.WarehousesPage })));

export const FleetDashboardPage = moduleLazy('operations', () => import('../pages/operations/fleet-dashboard/FleetDashboardPage').then(m => ({ default: m.FleetDashboardPage })));

export const FacilityManagementPage = moduleLazy('operations', () => import('../pages/operations/facility-management/FacilityManagementPage').then(m => ({ default: m.FacilityManagementPage })));

export const DeliveriesPage = moduleLazy('operations', () => import('../pages/operations/deliveries/DeliveriesPage').then(m => ({ default: m.DeliveriesPage })));

export const DriversPage = moduleLazy('operations', () => import('../pages/operations/drivers/DriversPage').then(m => ({ default: m.DriversPage })));

export const VehiclesPage = moduleLazy('operations', () => import('../pages/operations/vehicles/VehiclesPage').then(m => ({ default: m.VehiclesPage })));

export const EmployeesPage = moduleLazy('hr', () => import('../pages/operations/employees/EmployeesPage').then(m => ({ default: m.EmployeesPage })));

export const AttendancePage = moduleLazy('hr', () => import('../pages/operations/attendance/AttendancePage').then(m => ({ default: m.AttendancePage })));

export const PayrollPage = moduleLazy('hr', () => import('../pages/operations/payroll/PayrollPage').then(m => ({ default: m.PayrollPage })));

export const CommissionsPage = moduleLazy('hr', () => import('../pages/hr/commissions/CommissionsPage').then(m => ({ default: m.CommissionsPage })));

export const LeavePage = moduleLazy('hr', () => import('../pages/hr/leave/LeavePage').then(m => ({ default: m.LeavePage })));

export const EmployeeContractsPage = moduleLazy('hr', () => import('../pages/hr/employee-contracts/EmployeeContractsPage').then(m => ({ default: m.EmployeeContractsPage })));

export const EmployeeDocumentsPage = moduleLazy('hr', () => import('../pages/hr/employee-documents/EmployeeDocumentsPage').then(m => ({ default: m.EmployeeDocumentsPage })));

export const RecruitmentPage = moduleLazy('hr', () => import('../pages/hr/recruitment/RecruitmentPage').then(m => ({ default: m.RecruitmentPage })));

export const ManufacturingPage = moduleLazy('manufacturing', () => import('../pages/manufacturing/manufacturing/ManufacturingPage').then(m => ({ default: m.ManufacturingPage })));

export const HrDashboardPage = moduleLazy('hr', () => import('../pages/hr/hr-dashboard/HrDashboardPage').then(m => ({ default: m.HrDashboardPage })));

export const HrOrganizationPage = moduleLazy('hr', () => import('../pages/hr/organization/HrOrganizationPage').then(m => ({ default: m.HrOrganizationPage })));

export const PerformancePage = moduleLazy('hr', () => import('../pages/hr/performance/PerformancePage').then(m => ({ default: m.PerformancePage })));

export const TrainingPage = moduleLazy('hr', () => import('../pages/hr/training/TrainingPage').then(m => ({ default: m.TrainingPage })));

export const HrDisciplinePage = moduleLazy('hr', () => import('../pages/hr/discipline/HrDisciplinePage').then(m => ({ default: m.HrDisciplinePage })));

export const HrBenefitsPage = moduleLazy('hr', () => import('../pages/hr/benefits/HrBenefitsPage').then(m => ({ default: m.HrBenefitsPage })));
export const HrSelfServicePage = moduleLazy('hr', () => import('../pages/hr/self-service/HrSelfServicePage').then(m => ({ default: m.HrSelfServicePage })));
export const WorkforcePlanningPage = moduleLazy('hr', () => import('../pages/hr/workforce-planning/WorkforcePlanningPage').then(m => ({ default: m.WorkforcePlanningPage })));
export const EmployeeClearancePage = moduleLazy('hr', () => import('../pages/hr/clearance/EmployeeClearancePage').then(m => ({ default: m.EmployeeClearancePage })));
export const PayrollSocialInsurancePage = moduleLazy('hr', () => import('../pages/hr/social-insurance/PayrollSocialInsurancePage').then(m => ({ default: m.PayrollSocialInsurancePage })));
export const AttendanceDevicesPage = moduleLazy('hr', () => import('../pages/hr/attendance-devices/AttendanceDevicesPage').then(m => ({ default: m.AttendanceDevicesPage })));
export const HrAlertsPage = moduleLazy('hr', () => import('../pages/hr/alerts/HrAlertsPage').then(m => ({ default: m.HrAlertsPage })));
export const PayslipsPage = moduleLazy('hr', () => import('../pages/hr/payslips/PayslipsPage').then(m => ({ default: m.PayslipsPage })));
export const PayrollCalendarPage = moduleLazy('hr', () => import('../pages/hr/payroll-calendar/PayrollCalendarPage').then(m => ({ default: m.PayrollCalendarPage })));
export const PayrollNotificationSettingsPage = moduleLazy('hr', () => import('../pages/hr/payroll-notification-settings/PayrollNotificationSettingsPage').then(m => ({ default: m.PayrollNotificationSettingsPage })));

// CRM & Customers
export const CustomersView = moduleLazy('customers', () => import('../components/customers/CustomersView').then(m => ({ default: m.CustomersView })));

export const CRMHubPage = moduleLazy('customers', () => import('../pages/crm/crm-hub/CRMHubPage').then(m => ({ default: m.CRMHubPage })));

export const CustomerDetailPage = moduleLazy('customers', () => import('../pages/customers/customer-detail/CustomerDetailPage').then(m => ({ default: m.CustomerDetailPage })));

export const PartnersPage = moduleLazy('finance', () => import('../pages/customers/partners/PartnersPage').then(m => ({ default: m.PartnersPage })));

export const CustomerImportedProductsPage = moduleLazy('customers', () => import('../pages/customers/customer-imported-products/CustomerImportedProductsPage').then(m => ({ default: m.CustomerImportedProductsPage })));

export const ReadyDeliveriesPage = moduleLazy('customers', () => import('../pages/customers/ready-deliveries/ReadyDeliveriesPage').then(m => ({ default: m.ReadyDeliveriesPage })));

export const CrmDashboardPage = moduleLazy('customers', () => import('../pages/crm/crm-dashboard/CrmDashboardPage').then(m => ({ default: m.CrmDashboardPage })));

export const LeadsPage = moduleLazy('customers', () => import('../pages/crm/leads/LeadsPage').then(m => ({ default: m.LeadsPage })));

export const PipelinePage = moduleLazy('customers', () => import('../pages/crm/pipeline/PipelinePage').then(m => ({ default: m.PipelinePage })));

export const CrmActivitiesPage = moduleLazy('customers', () => import('../pages/crm/crm-activities/CrmActivitiesPage').then(m => ({ default: m.CrmActivitiesPage })));

export const CampaignsPage = moduleLazy('customers', () => import('../pages/crm/campaigns/CampaignsPage').then(m => ({ default: m.CampaignsPage })));
