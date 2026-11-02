import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  AlertTriangle,
  Archive,
  Award,
  BarChart3,
  Boxes,
  CalendarClock,
  CheckSquare,
  ClipboardList,
  CreditCard,
  DollarSign,
  FileCheck2,
  FileSpreadsheet,
  Gauge,
  GitCompare,
  Landmark,
  LineChart,
  Package,
  PackageSearch,
  Receipt,
  Scale,
  ShieldAlert,
  ShoppingCart,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Truck,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { ReportCenterService } from '../../services/ReportCenterService';
import type { ReportParams, ReportResult } from '../../services/ReportCenterService';

export type ReportCategoryId =
  | 'core'
  | 'operations'
  | 'sales'
  | 'credit'
  | 'inventory'
  | 'finance'
  | 'forecast';

export interface ReportCategory {
  id: ReportCategoryId;
  label: string;
  description: string;
  icon: LucideIcon;
  color: string;
}

export interface ReportControl {
  key: 'dimension' | 'productId' | 'registerId';
  label: string;
  kind: 'dimension' | 'product' | 'register';
  options?: Array<{ value: string; label: string }>;
}

export interface ReportDefinition {
  id: string;
  title: string;
  description: string;
  category: ReportCategoryId;
  icon: LucideIcon;
  dateMode: 'range' | 'asOf' | 'none';
  controls?: ReportControl[];
  legacyTab?: 'sales' | 'purchases' | 'pos' | 'finance' | 'profitLoss' | 'tax';
  accent?: string;
}

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
];

const DIMENSION_SALES: ReportControl = {
  key: 'dimension',
  label: 'تجميع حسب',
  kind: 'dimension',
  options: [
    { value: 'warehouse', label: 'المخزن' },
    { value: 'customer', label: 'العميل' },
    { value: 'rep', label: 'المندوب' },
    { value: 'product', label: 'الصنف' },
  ],
};

const DIMENSION_PURCHASES: ReportControl = {
  key: 'dimension',
  label: 'تجميع حسب',
  kind: 'dimension',
  options: [
    { value: 'supplier', label: 'المورد' },
    { value: 'warehouse', label: 'المخزن' },
    { value: 'product', label: 'الصنف' },
  ],
};

export const REPORT_DEFINITIONS: ReportDefinition[] = [
  // Core (existing report pages)
  {
    id: 'sales',
    title: 'تقرير المبيعات',
    description: 'المبيعات حسب التصنيف والماركة والصنف والعميل والمدينة والمستخدم مع الحركة اليومية.',
    category: 'core',
    icon: BarChart3,
    dateMode: 'range',
    legacyTab: 'sales',
    accent: 'teal',
  },
  {
    id: 'purchases',
    title: 'المشتريات والمخزون',
    description: 'تحليل المشتريات وأرصدة المخزون وتقييم المخزون.',
    category: 'core',
    icon: Truck,
    dateMode: 'range',
    legacyTab: 'purchases',
    accent: 'violet',
  },
  {
    id: 'pos',
    title: 'تقارير نقطة البيع',
    description: 'مزيج المدفوعات والحركة بالساعة وأفضل الأصناف وأداء الكاشير.',
    category: 'core',
    icon: CreditCard,
    dateMode: 'range',
    legacyTab: 'pos',
    accent: 'sky',
  },
  {
    id: 'finance',
    title: 'القوائم المالية',
    description: 'الميزانية العمومية والتدفقات النقدية وأعمار الديون ودفتر الأستاذ.',
    category: 'core',
    icon: Scale,
    dateMode: 'range',
    legacyTab: 'finance',
    accent: 'amber',
  },
  {
    id: 'profitLoss',
    title: 'الأرباح والخسائر',
    description: 'قائمة الدخل التفصيلية بالإيرادات والتكاليف والمصروفات.',
    category: 'core',
    icon: TrendingUp,
    dateMode: 'range',
    legacyTab: 'profitLoss',
    accent: 'emerald',
  },
  {
    id: 'tax',
    title: 'كشف الضريبة',
    description: 'ضريبة المبيعات ناقص ضريبة المشتريات شهرًا بشهر وبالفواتير.',
    category: 'core',
    icon: Receipt,
    dateMode: 'range',
    legacyTab: 'tax',
    accent: 'rose',
  },

  // Operations
  {
    id: 'operations-log',
    title: 'سجل العمليات (الحركة اليومية)',
    description: 'كل الفواتير والسندات والمصروفات والمرتجعات المسجلة في فترة — مين عملها وبقيمة كام.',
    category: 'operations',
    icon: ClipboardList,
    dateMode: 'range',
  },
  {
    id: 'user-activity',
    title: 'تقرير مستخدم',
    description: 'كل اللي مستخدم عمله في فترة — فواتير ومرتجعات وقبض وصرف ومصروفات — إجمالي ومفصّل بالأصناف.',
    category: 'operations',
    icon: UserCheck,
    dateMode: 'range',
  },
  {
    id: 'daily-movements',
    title: 'الحركة اليومية',
    description: 'حركات كل المستخدمين في يوم أو فترة — حسب الوقت أو المستخدم أو نوع الحركة.',
    category: 'operations',
    icon: Activity,
    dateMode: 'range',
  },
  {
    id: 'exceptions',
    title: 'سجل الاستثناءات',
    description: 'بيع تحت الحد الأدنى، حذف سطر من فاتورة، مرتجع بدون فاتورة — وبموافقة مين وبالقيمة.',
    category: 'operations',
    icon: ShieldAlert,
    dateMode: 'range',
  },
  {
    id: 'approvals',
    title: 'سجل الموافقات',
    description: 'طلبات الموافقة: مين طلب إيه ومين وافق أو رفض وإمتى — والمعلّق للرد عليه.',
    category: 'operations',
    icon: CheckSquare,
    dateMode: 'range',
  },
  {
    id: 'received-reports',
    title: 'التقارير الواردة',
    description: 'التقارير والمستندات المستلمة من الفروع والمستخدمين خلال الفترة.',
    category: 'operations',
    icon: FileCheck2,
    dateMode: 'range',
  },
  {
    id: 'alerts',
    title: 'التنبيهات والملخص الأسبوعي',
    description: 'رصيد تحت الصفر، عميل عدّى حده، صنف هيخلص، هامش نزل، مصروف قفز — وملخص للإدارة.',
    category: 'operations',
    icon: AlertTriangle,
    dateMode: 'asOf',
  },

  // Sales
  {
    id: 'sales-analysis',
    title: 'تحليل المبيعات',
    description: 'حلّل مبيعاتك حسب المخزن أو العميل أو المندوب أو الصنف — بالكمية والقيمة والمرتجعات.',
    category: 'sales',
    icon: BarChart3,
    dateMode: 'range',
    controls: [DIMENSION_SALES],
  },
  {
    id: 'product-sales',
    title: 'مبيعات الأصناف',
    description: 'كل صنف: الكمية المباعة والإيراد خلال المدة — مرتبة بالأعلى مبيعًا.',
    category: 'sales',
    icon: Package,
    dateMode: 'range',
  },
  {
    id: 'product-detail',
    title: 'صنف مفصّل',
    description: 'اختر أي صنف وأي فترة وشوف كل مبيعاته ومشترياته وأرباحه بالتفصيل فاتورة فاتورة.',
    category: 'sales',
    icon: PackageSearch,
    dateMode: 'range',
    controls: [{ key: 'productId', label: 'الصنف', kind: 'product' }],
  },
  {
    id: 'product-profitability',
    title: 'تحليل ربحية الأصناف',
    description: 'إيراد وتكلفة وربح وهامش وخصومات ومرتجعات مع تصنيف ABC (باريتو) — رتّب على أي عمود.',
    category: 'sales',
    icon: Award,
    dateMode: 'range',
  },
  {
    id: 'customer-profitability',
    title: 'تحليل ربحية العملاء',
    description: 'إيراد وتكلفة وربح وهامش وخصومات ومرتجعات ومتوسط الفاتورة وآخر شراء لكل عميل.',
    category: 'sales',
    icon: Users,
    dateMode: 'range',
  },
  {
    id: 'period-comparison',
    title: 'مقارنة الفترات',
    description: 'الفترة دي مقابل اللي قبلها: المبيعات والربح والفواتير والعملاء ونسبة النمو.',
    category: 'sales',
    icon: GitCompare,
    dateMode: 'range',
  },

  // Credit
  {
    id: 'ar-aging',
    title: 'أعمار الديون',
    description: 'المستحق على كل عميل موزَّع على شرائح 0-30 / 31-60 / 61-90 / 91-180 / أكثر من 180 يوم.',
    category: 'credit',
    icon: CalendarClock,
    dateMode: 'asOf',
  },
  {
    id: 'credit-exposure',
    title: 'الائتمان والمتأخرات',
    description: 'كل عميل آجل: حدّه والمستحق عليه والمتأخر — ومين عدّى الحد أو موقوف.',
    category: 'credit',
    icon: CreditCard,
    dateMode: 'asOf',
  },
  {
    id: 'payment-behavior',
    title: 'سلوك الدفع',
    description: 'كل عميل بيدفع بعد كام يوم ونسبة التزامه بمدته وأطول تأخير — قرار الحد على سلوك مقيس.',
    category: 'credit',
    icon: Gauge,
    dateMode: 'range',
  },
  {
    id: 'cheque-maturity',
    title: 'استحقاقات الشيكات',
    description: 'أوراق القبض والدفع المفتوحة حسب قرب الاستحقاق — اللي لازم يتودع واللي لازم رصيده يبقى في البنك.',
    category: 'credit',
    icon: FileSpreadsheet,
    dateMode: 'asOf',
  },
  {
    id: 'bounced-cheques',
    title: 'الشيكات المرتدة',
    description: 'كل شيك اترد: العميل والبنك والقيمة والسبب وتاريخ الرد.',
    category: 'credit',
    icon: TrendingDown,
    dateMode: 'range',
  },
  {
    id: 'installment-aging',
    title: 'أعمار الأقساط',
    description: 'الباقي على خطط التقسيط: اللي لسه ما استحقش والمتأخر بالأيام وشرائح التأخير.',
    category: 'credit',
    icon: CalendarClock,
    dateMode: 'asOf',
  },

  // Inventory & purchasing
  {
    id: 'inventory-balances',
    title: 'تقرير المخزون',
    description: 'أرصدة الأصناف الحالية بالقيمة والكمية — مع تنبيه النواقص تحت حد الطلب.',
    category: 'inventory',
    icon: Archive,
    dateMode: 'none',
  },
  {
    id: 'slow-moving',
    title: 'المخزون البطيء',
    description: 'أصناف راكدة بتاكل رأس المال: آخر بيع وقيمة الرصيد وأيام التغطية.',
    category: 'inventory',
    icon: TrendingDown,
    dateMode: 'range',
  },
  {
    id: 'purchase-analysis',
    title: 'تحليل المشتريات',
    description: 'حلّل مشترياتك حسب المخزن أو المورد أو الصنف — بالكمية والقيمة ومرتجعات الشراء.',
    category: 'inventory',
    icon: Truck,
    dateMode: 'range',
    controls: [DIMENSION_PURCHASES],
  },
  {
    id: 'supplier-prices',
    title: 'أسعار الموردين',
    description: 'نفس الصنف بكام من كل مورد ومين الأرخص والوفر المحتمل لو اشتريت منه.',
    category: 'inventory',
    icon: DollarSign,
    dateMode: 'range',
  },
  {
    id: 'count-variance',
    title: 'فروقات الجرد',
    description: 'العجز والزيادة في كل جلسة جرد مُرحّلة وبالصنف — بالقيمة.',
    category: 'inventory',
    icon: ClipboardList,
    dateMode: 'range',
  },

  // Finance
  {
    id: 'financial-position',
    title: 'المركز المالي',
    description: 'صورة الشركة النهارده: الخزائن والبنوك والديون والمخزون والضريبة المستحقة.',
    category: 'finance',
    icon: Landmark,
    dateMode: 'asOf',
  },
  {
    id: 'cash-movement',
    title: 'حركة الخزينة',
    description: 'كشف كامل لأي خزينة: وارد ومنصرف ورصيد كل حركة خلال أي فترة.',
    category: 'finance',
    icon: Wallet,
    dateMode: 'range',
    controls: [{ key: 'registerId', label: 'الخزينة', kind: 'register' }],
  },
  {
    id: 'shift-closing',
    title: 'تقفيل الورديات',
    description: 'كل وردية: الكاشير والجهاز والعهدة والمتوقع والمعدود والعجز أو الزيادة.',
    category: 'finance',
    icon: Gauge,
    dateMode: 'range',
  },
  {
    id: 'cash-flow-forecast',
    title: 'التدفق النقدي — الجاي',
    description: 'رصيدك المتوقع أسبوع بأسبوع: الفواتير الآجلة والأقساط والشيكات مقابل الموردين والرواتب والمصروفات.',
    category: 'finance',
    icon: LineChart,
    dateMode: 'asOf',
  },
  {
    id: 'break-even',
    title: 'نقطة التعادل',
    description: 'لازم تبيع بكام عشان تغطّي مصاريفك: هامش المساهمة والمصروفات الثابتة ونقطة التعادل وهامش الأمان.',
    category: 'finance',
    icon: Target,
    dateMode: 'range',
  },
  {
    id: 'branch-performance',
    title: 'أداء الفروع',
    description: 'كل الفروع جنب بعض: مبيعات ومرتجعات ومتوسط فاتورة وربح وهوامش ومصروفات وتحصيل ومخزون والنمو.',
    category: 'finance',
    icon: Landmark,
    dateMode: 'range',
  },

  // Forecast & analysis
  {
    id: 'demand-forecast',
    title: 'التوقع والنفاد',
    description: 'تبيع كام الشهر الجاي (متوسط + موسمية) وأنهي صنف هيخلص قبل ما الشحنة توصل بالكمية المقترحة.',
    category: 'forecast',
    icon: LineChart,
    dateMode: 'asOf',
  },
  {
    id: 'customer-churn',
    title: 'العملاء اللي بيضيعوا',
    description: 'إيقاع كل عميل وغيابه والقيمة المعرّضة للضياع — مرتّبين باللي خسارته أكبر.',
    category: 'forecast',
    icon: Users,
    dateMode: 'asOf',
  },
  {
    id: 'basket',
    title: 'بيتباعوا مع بعض',
    description: 'اللي بياخد الصنف ده بياخد معاه إيه — لرص الرف وعروض «اشتري ده وخد ده».',
    category: 'forecast',
    icon: Sparkles,
    dateMode: 'range',
  },
];

const service = new ReportCenterService();

export function runReport(id: string, params: ReportParams): ReportResult {
  switch (id) {
    case 'operations-log':
      return service.operationsLog(params);
    case 'user-activity':
      return service.userActivity(params);
    case 'daily-movements':
      return service.dailyMovements(params);
    case 'exceptions':
      return service.exceptionsLog(params);
    case 'approvals':
      return service.approvalsLog(params);
    case 'received-reports':
      return service.receivedReports(params);
    case 'alerts':
      return service.alertsSummary(params);
    case 'sales-analysis':
      return service.salesAnalysis(params);
    case 'product-sales':
      return service.productSales(params);
    case 'product-detail':
      return service.productDetail(params);
    case 'product-profitability':
      return service.productProfitability(params);
    case 'customer-profitability':
      return service.customerProfitability(params);
    case 'period-comparison':
      return service.periodComparison(params);
    case 'ar-aging':
      return service.arAging(params);
    case 'credit-exposure':
      return service.creditExposure(params);
    case 'payment-behavior':
      return service.paymentBehavior(params);
    case 'cheque-maturity':
      return service.chequeMaturity(params);
    case 'bounced-cheques':
      return service.bouncedCheques(params);
    case 'installment-aging':
      return service.installmentAging(params);
    case 'inventory-balances':
      return service.inventoryBalances();
    case 'slow-moving':
      return service.slowMoving(params);
    case 'purchase-analysis':
      return service.purchaseAnalysis(params);
    case 'supplier-prices':
      return service.supplierPrices(params);
    case 'count-variance':
      return service.countVariance(params);
    case 'financial-position':
      return service.financialPosition(params);
    case 'cash-movement':
      return service.cashMovement(params);
    case 'shift-closing':
      return service.shiftClosing(params);
    case 'cash-flow-forecast':
      return service.cashFlowForecast(params);
    case 'break-even':
      return service.breakEven(params);
    case 'branch-performance':
      return service.branchPerformance(params);
    case 'demand-forecast':
      return service.demandForecast(params);
    case 'customer-churn':
      return service.customerChurn(params);
    case 'basket':
      return service.basketAnalysis(params);
    default:
      throw new Error('تقرير غير معروف.');
  }
}

export const findReport = (id: string | null): ReportDefinition | undefined =>
  id ? REPORT_DEFINITIONS.find((report) => report.id === id) : undefined;
