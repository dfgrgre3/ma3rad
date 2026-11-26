import {
  Activity,
  BarChart3,
  Boxes,
  CreditCard,
  ShoppingCart,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react';
import { ReportCenterService } from '../../../services/domains/reports/ReportCenterService';
import type { ReportParams, ReportResult } from '../../../services/domains/reports/ReportCenterService';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { getEffectiveBusinessType } from '../../../services/domains/config/BusinessTypeService';
import { REPORT_DEFINITIONS } from './reportDefinitions';
import {
  reportPermission,
  type ReportCategory,
  type ReportDefinition,
} from './reportTypes';

export {
  REPORT_CATEGORY_PERMISSION,
  reportPermission,
} from './reportTypes';
export type {
  ReportCategory,
  ReportCategoryId,
  ReportChartType,
  ReportControl,
  ReportDefinition,
  ReportDrilldown,
} from './reportTypes';
export { REPORT_DEFINITIONS } from './reportDefinitions';

export const REPORT_CATEGORIES: ReportCategory[] = [
  {
    id: 'core',
    label: 'التقارير الأساسية',
    description: 'التقارير التشغيلية والمالية القديمة في مكان واحد.',
    icon: BarChart3,
    color: 'teal',
  },
  {
    id: 'operations',
    label: 'الحركة والعمليات',
    description: 'كل حركة في النظام: فواتير، سندات، مستخدمون، استثناءات وموافقات.',
    icon: Activity,
    color: 'sky',
  },
  {
    id: 'sales',
    label: 'المبيعات والربحية',
    description: 'تحليل المبيعات والأصناف والعملاء وربحية كل بند.',
    icon: ShoppingCart,
    color: 'emerald',
  },
  {
    id: 'credit',
    label: 'الائتمان والتحصيل',
    description: 'أعمار الديون، حدود الائتمان، الشيكات والأقساط وسلوك السداد.',
    icon: CreditCard,
    color: 'amber',
  },
  {
    id: 'inventory',
    label: 'المخزون والمشتريات',
    description: 'أرصدة المخزون، البطيء، فروقات الجرد، المشتريات وأسعار الموردين.',
    icon: Boxes,
    color: 'violet',
  },
  {
    id: 'finance',
    label: 'المالية والخزينة',
    description: 'المركز المالي، حركة الخزينة، التدفق النقدي، الشيكات والضريبة.',
    icon: Wallet,
    color: 'rose',
  },
  {
    id: 'forecast',
    label: 'التوقعات والتحليل',
    description: 'توقع الطلب والنفاد، العملاء المعرضون للفقد، وتحليل السلة.',
    icon: Sparkles,
    color: 'indigo',
  },
  {
    id: 'hr',
    label: 'الموارد البشرية',
    description: 'الرواتب، الصرف، الحضور، الإجازات والضرائب.',
    icon: Users,
    color: 'teal',
  },
];

const service = new ReportCenterService();

export async function runReport(id: string, params: ReportParams): Promise<ReportResult> {
  // فرض على مستوى الخدمة: إخفاء البطاقة في الواجهة لا يكفي — كل تشغيل تقرير
  // يمر هنا ويُرفض بدون صلاحية التقرير المحددة (فئة أو تجاوز).
  const definition = REPORT_DEFINITIONS.find((report) => report.id === id);
  if (definition) {
    PermissionService.require(AuthService.getCurrentUser(), reportPermission(definition));
    if (definition.activityOnly && definition.activityOnly !== getEffectiveBusinessType()) {
      throw new Error('هذا التقرير غير متاح للنشاط الحالي.');
    }
  }

  let result: ReportResult;

  switch (id) {
    case 'operations-log':
      result = await service.operationsLog(params);
      break;
    case 'user-activity':
      result = await service.userActivity(params);
      break;
    case 'daily-movements':
      result = await service.dailyMovements(params);
      break;
    case 'exceptions':
      result = await service.exceptionsLog(params);
      break;
    case 'approvals':
      result = await service.approvalsLog(params);
      break;
    case 'received-reports':
      result = await service.receivedReports(params);
      break;
    case 'alerts':
      result = await service.alertsSummary(params);
      break;
    case 'sales-analysis':
      result = await service.salesAnalysis(params);
      break;
    case 'product-sales':
      result = await service.productSales(params);
      break;
    case 'product-detail':
      result = await service.productDetail(params);
      break;
    case 'product-profitability':
      result = await service.productProfitability(params);
      break;
    case 'customer-profitability':
      result = await service.customerProfitability(params);
      break;
    case 'period-comparison':
      result = await service.periodComparison(params);
      break;
    case 'ar-aging':
      result = await service.arAging(params);
      break;
    case 'credit-exposure':
      result = await service.creditExposure(params);
      break;
    case 'payment-behavior':
      result = await service.paymentBehavior(params);
      break;
    case 'cheque-maturity':
      result = await service.chequeMaturity(params);
      break;
    case 'bounced-cheques':
      result = await service.bouncedCheques(params);
      break;
    case 'installment-aging':
      result = await service.installmentAging(params);
      break;
    case 'inventory-balances':
      result = await service.inventoryBalances();
      break;
    case 'slow-moving':
      result = await service.slowMoving(params);
      break;
    case 'purchase-analysis':
      result = await service.purchaseAnalysis(params);
      break;
    case 'supplier-prices':
      result = await service.supplierPrices(params);
      break;
    case 'count-variance':
      result = await service.countVariance(params);
      break;
    case 'financial-position':
      result = await service.financialPosition(params);
      break;
    case 'cash-movement':
      result = await service.cashMovement(params);
      break;
    case 'shift-closing':
      result = await service.shiftClosing(params);
      break;
    case 'cash-flow-forecast':
      result = await service.cashFlowForecast(params);
      break;
    case 'break-even':
      result = await service.breakEven(params);
      break;
    case 'branch-performance':
      result = await service.branchPerformance(params);
      break;
    case 'demand-forecast':
      result = await service.demandForecast(params);
      break;
    case 'customer-churn':
      result = await service.customerChurn(params);
      break;
    case 'basket':
      result = await service.basketAnalysis(params);
      break;
    case 'sales-rep-performance':
      result = await service.salesRepPerformance(params);
      break;
    case 'cash-flow-detailed':
      result = await service.cashFlowDetailed(params);
      break;
    case 'hr-payroll-summary':
      result = await service.hrPayrollSummary(params);
      break;
    case 'hr-payroll-payouts':
      result = await service.hrPayrollPayouts(params);
      break;
    case 'hr-attendance-summary':
      result = await service.hrAttendanceSummary(params);
      break;
    case 'hr-leave-summary':
      result = await service.hrLeaveSummary(params);
      break;
    case 'hr-tax-summary':
      result = await service.hrTaxSummary(params);
      break;
    case 'hr-vacancies':
      result = await service.hrVacancies(params);
      break;
    case 'hr-onboarding':
      result = await service.hrOnboarding(params);
      break;
    case 'hr-probation':
      result = await service.hrProbation(params);
      break;
    case 'hr-violations':
      result = await service.hrViolations(params);
      break;
    case 'hr-complaints':
      result = await service.hrComplaints(params);
      break;
    case 'hr-penalties-report':
      result = await service.hrPenaltiesReport(params);
      break;
    case 'hr-warnings':
      result = await service.hrWarnings(params);
      break;
    case 'hr-appeals':
      result = await service.hrAppeals(params);
      break;
    case 'hr-attachments':
      result = await service.hrAttachments(params);
      break;
    case 'hr-allowances':
      result = await service.hrAllowances(params);
      break;
    case 'hr-benefits':
      result = await service.hrBenefits(params);
      break;
    case 'hr-loans':
      result = await service.hrLoans(params);
      break;
    case 'hr-performance-evaluations':
      result = await service.hrPerformanceEvaluations(params);
      break;
    case 'hr-performance-goals':
      result = await service.hrPerformanceGoals(params);
      break;
    case 'hr-performance-pips':
      result = await service.hrPerformancePips(params);
      break;
    case 'mfg-production-kpis':
      result = await service.mfgProductionKpis(params);
      break;
    case 'manufacturing-production':
      result = await service.manufacturingProduction(params);
      break;
    case 'manufacturing-wip':
      result = await service.manufacturingWip(params);
      break;
    case 'manufacturing-oee':
      result = await service.manufacturingOee(params);
      break;
    case 'sales-target-kpis':
      result = await service.salesTargetKpis(params);
      break;
    case 'ceramics-design-sales':
      result = await service.ceramicsDesignSales(params);
      break;
    case 'ceramic-takeoffs':
      result = await service.ceramicTakeoffs(params);
      break;
    case 'ceramic-stock-coverage':
      result = await service.ceramicStockCoverage();
      break;
    case 'project-certificates':
      result = await service.projectCertificates(params);
      break;
    case 'project-cost-variance':
      result = await service.projectCostVariance(params);
      break;
    case 'site-daily-reports':
      result = await service.siteDailyReports(params);
      break;
    case 'hotel-occupancy':
      result = await service.hotelOccupancy(params);
      break;
    case 'education-attendance':
      result = await service.educationAttendance(params);
      break;
    case 'education-fees':
      result = await service.educationFees(params);
      break;
    case 'workshop-orders':
      result = await service.workshopOrders(params);
      break;
    case 'time-billing-report':
      result = await service.timeBillingReport(params);
      break;
    case 'hr-training-expenses':
      result = await service.hrTrainingExpenses(params);
      break;
    default:
      throw new Error('تقرير غير معروف.');
  }

  return ReportCenterService.applyAdvancedFilters(result, params) ?? result;
}

export const findReport = (id: string | null): ReportDefinition | undefined =>
  id ? REPORT_DEFINITIONS.find((report) => report.id === id) : undefined;
