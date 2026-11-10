import { lazy } from 'react';

export const InventoryValuationPage = lazy(() => import('../pages/inventory/inventory-valuation/InventoryValuationPage').then(m => ({ default: m.InventoryValuationPage })));

export const InventoryAdjustmentsPage = lazy(() => import('../pages/inventory/inventory-adjustments/InventoryAdjustmentsPage').then(m => ({ default: m.InventoryAdjustmentsPage })));

export const StockReservationsPage = lazy(() => import('../pages/inventory/stock-reservations/StockReservationsPage').then(m => ({ default: m.StockReservationsPage })));

export const ReorderPlanningPage = lazy(() => import('../pages/inventory/reorder-planning/ReorderPlanningPage').then(m => ({ default: m.ReorderPlanningPage })));

export const WarehouseLocationsPage = lazy(() => import('../pages/inventory/warehouse-locations/WarehouseLocationsPage').then(m => ({ default: m.WarehouseLocationsPage })));

export const DamageQuarantinePage = lazy(() => import('../pages/inventory/damage-quarantine/DamageQuarantinePage').then(m => ({ default: m.DamageQuarantinePage })));

export const InventoryReconciliationPage = lazy(() => import('../pages/inventory/inventory-reconciliation/InventoryReconciliationPage').then(m => ({ default: m.InventoryReconciliationPage })));

// Operations, Branches & Warehouses
export const BranchesPage = lazy(() => import('../pages/operations/branches/BranchesPage').then(m => ({ default: m.BranchesPage })));

export const WarehousesPage = lazy(() => import('../pages/operations/warehouses/WarehousesPage').then(m => ({ default: m.WarehousesPage })));

export const FleetDashboardPage = lazy(() => import('../pages/operations/fleet-dashboard/FleetDashboardPage').then(m => ({ default: m.FleetDashboardPage })));

export const FacilityManagementPage = lazy(() => import('../pages/operations/facility-management/FacilityManagementPage').then(m => ({ default: m.FacilityManagementPage })));

export const DeliveriesPage = lazy(() => import('../pages/operations/deliveries/DeliveriesPage').then(m => ({ default: m.DeliveriesPage })));

export const DriversPage = lazy(() => import('../pages/operations/drivers/DriversPage').then(m => ({ default: m.DriversPage })));

export const VehiclesPage = lazy(() => import('../pages/operations/vehicles/VehiclesPage').then(m => ({ default: m.VehiclesPage })));

export const EmployeesPage = lazy(() => import('../pages/operations/employees/EmployeesPage').then(m => ({ default: m.EmployeesPage })));

export const AttendancePage = lazy(() => import('../pages/operations/attendance/AttendancePage').then(m => ({ default: m.AttendancePage })));

export const PayrollPage = lazy(() => import('../pages/operations/payroll/PayrollPage').then(m => ({ default: m.PayrollPage })));

export const CommissionsPage = lazy(() => import('../pages/hr/commissions/CommissionsPage').then(m => ({ default: m.CommissionsPage })));

export const LeavePage = lazy(() => import('../pages/hr/leave/LeavePage').then(m => ({ default: m.LeavePage })));

export const EmployeeContractsPage = lazy(() => import('../pages/hr/employee-contracts/EmployeeContractsPage').then(m => ({ default: m.EmployeeContractsPage })));

export const EmployeeDocumentsPage = lazy(() => import('../pages/hr/employee-documents/EmployeeDocumentsPage').then(m => ({ default: m.EmployeeDocumentsPage })));

export const RecruitmentPage = lazy(() => import('../pages/hr/recruitment/RecruitmentPage').then(m => ({ default: m.RecruitmentPage })));

export const ManufacturingPage = lazy(() => import('../pages/manufacturing/manufacturing/ManufacturingPage').then(m => ({ default: m.ManufacturingPage })));

export const HrDashboardPage = lazy(() => import('../pages/hr/hr-dashboard/HrDashboardPage').then(m => ({ default: m.HrDashboardPage })));

export const HrOrganizationPage = lazy(() => import('../pages/hr/organization/HrOrganizationPage').then(m => ({ default: m.HrOrganizationPage })));

export const PerformancePage = lazy(() => import('../pages/hr/performance/PerformancePage').then(m => ({ default: m.PerformancePage })));

export const TrainingPage = lazy(() => import('../pages/hr/training/TrainingPage').then(m => ({ default: m.TrainingPage })));

export const HrDisciplinePage = lazy(() => import('../pages/hr/discipline/HrDisciplinePage').then(m => ({ default: m.HrDisciplinePage })));

export const HrBenefitsPage = lazy(() => import('../pages/hr/benefits/HrBenefitsPage').then(m => ({ default: m.HrBenefitsPage })));
export const HrSelfServicePage = lazy(() => import('../pages/hr/self-service/HrSelfServicePage').then(m => ({ default: m.HrSelfServicePage })));

// CRM & Customers
export const CustomersView = lazy(() => import('../components/customers/CustomersView').then(m => ({ default: m.CustomersView })));

export const CRMHubPage = lazy(() => import('../pages/crm/crm-hub/CRMHubPage').then(m => ({ default: m.CRMHubPage })));

export const CustomerDetailPage = lazy(() => import('../pages/customers/customer-detail/CustomerDetailPage').then(m => ({ default: m.CustomerDetailPage })));

export const PartnersPage = lazy(() => import('../pages/customers/partners/PartnersPage').then(m => ({ default: m.PartnersPage })));

export const CustomerImportedProductsPage = lazy(() => import('../pages/customers/customer-imported-products/CustomerImportedProductsPage').then(m => ({ default: m.CustomerImportedProductsPage })));

export const ReadyDeliveriesPage = lazy(() => import('../pages/customers/ready-deliveries/ReadyDeliveriesPage').then(m => ({ default: m.ReadyDeliveriesPage })));

export const CrmDashboardPage = lazy(() => import('../pages/crm/crm-dashboard/CrmDashboardPage').then(m => ({ default: m.CrmDashboardPage })));

export const LeadsPage = lazy(() => import('../pages/crm/leads/LeadsPage').then(m => ({ default: m.LeadsPage })));

export const PipelinePage = lazy(() => import('../pages/crm/pipeline/PipelinePage').then(m => ({ default: m.PipelinePage })));

export const CrmActivitiesPage = lazy(() => import('../pages/crm/crm-activities/CrmActivitiesPage').then(m => ({ default: m.CrmActivitiesPage })));

export const CampaignsPage = lazy(() => import('../pages/crm/campaigns/CampaignsPage').then(m => ({ default: m.CampaignsPage })));
