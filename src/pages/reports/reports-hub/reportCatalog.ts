import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  AlertTriangle,
  Archive,
  Award,
  Banknote,
  BarChart3,
  Boxes,
  CalendarClock,
  CheckSquare,
  ClipboardList,
  CreditCard,
  DollarSign,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Factory,
  Gauge,
  GraduationCap,
  GitCompare,
  Landmark,
  LineChart,
  MessageSquare,
  Package,
  HeartPulse,
  Gift,
  Paperclip,
  PackageSearch,
  Receipt,
  Scale,
  ShieldAlert,
  ShoppingCart,
  Sparkles,
  Star,
  Target,
  TrendingDown,
  TrendingUp,
  Truck,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { ReportCenterService } from '../../../services/domains/reports/ReportCenterService';
import type { ReportParams, ReportResult } from '../../../services/domains/reports/ReportCenterService';

export type ReportCategoryId =
  | 'core'
  | 'operations'
  | 'sales'
  | 'credit'
  | 'inventory'
  | 'finance'
  | 'forecast'
  | 'hr';

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

export type ReportChartType = 'bar' | 'line' | 'area' | 'pie';

export interface ReportDrilldown {
  label: string;
  route: string;
  note?: string;
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
  chart?: ReportChartType;
  drilldown?: ReportDrilldown;
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
  {
    id: 'hr',
    label: 'الموارد البشرية',
    description: 'الرواتب، الصرف، الحضور، الإجازات والضرائب.',
    icon: Users,
    color: 'teal',
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
  // HR
  {
    id: 'hr-payroll-summary',
    title: 'كشف الرواتب',
    description: 'مستحقات الموظفين حسب الفترة: أساسي، إضافي، مكافآت، خصومات، ضرائب وصافي.',
    category: 'hr',
    icon: Wallet,
    dateMode: 'range',
    accent: 'teal',
  },
  {
    id: 'hr-payroll-payouts',
    title: 'صرف الرواتب',
    description: 'عمليات صرف الرواتب حسب الطريقة (نقدي/بنكي/محفظة) مع المراجع والإثباتات.',
    category: 'hr',
    icon: Banknote,
    dateMode: 'range',
    accent: 'sky',
  },
  {
    id: 'hr-attendance-summary',
    title: 'ملخص الحضور',
    description: 'أيام الحضور، التأخير، العمل الإضافي (معتمد) لكل موظف.',
    category: 'hr',
    icon: ClipboardList,
    dateMode: 'range',
    accent: 'emerald',
  },
  {
    id: 'hr-leave-summary',
    title: 'الإجازات',
    description: 'طلبات الإجازات (معتمدة/معلقة) وأيام الإجازة.',
    category: 'hr',
    icon: CalendarClock,
    dateMode: 'range',
    accent: 'amber',
  },
  {
    id: 'hr-tax-summary',
    title: 'ضرائب الرواتب',
    description: 'الضريبة حسب قاعدة الضريبة (شرائح) مع الخاضع والإعفاءات.',
    category: 'hr',
    icon: Receipt,
    dateMode: 'range',
    accent: 'rose',
  },
  {
    id: 'hr-vacancies',
    title: 'الشواغر الوظيفية',
    description: 'المطلوب مقابل الفعلي والشواغر حسب القسم.',
    category: 'hr',
    icon: Users,
    dateMode: 'range',
    accent: 'rose',
  },
  {
    id: 'hr-onboarding',
    title: 'تأهيل الموظفين',
    description: 'مهام التأهيل: مكتملة، معلقة، متأخرة.',
    category: 'hr',
    icon: ClipboardList,
    dateMode: 'range',
    accent: 'teal',
  },
  {
    id: 'hr-probation',
    title: 'تقييمات فترة الاختبار',
    description: 'تقييمات فترة الاختبار والتوصيات.',
    category: 'hr',
    icon: Award,
    dateMode: 'range',
    accent: 'amber',
  },
  {
    id: 'hr-violations',
    title: 'المخالفات',
    description: 'سجل المخالفات حسب الموظف والخطورة.',
    category: 'hr',
    icon: ShieldAlert,
    dateMode: 'range',
    accent: 'rose',
  },
  {
    id: 'hr-complaints',
    title: 'الشكاوى',
    description: 'شكاوى الموظفين وحالاتها.',
    category: 'hr',
    icon: MessageSquare,
    dateMode: 'range',
    accent: 'amber',
  },
  {
    id: 'hr-penalties-report',
    title: 'الجزاءات',
    description: 'جزاءات الموظفين (مسودة/معتمدة/مرحّلة).',
    category: 'hr',
    icon: Scale,
    dateMode: 'range',
    accent: 'rose',
  },
  {
    id: 'hr-warnings',
    title: 'الإنذارات',
    description: 'إنذارات الموظفين (صادرة/ملغاة).',
    category: 'hr',
    icon: AlertTriangle,
    dateMode: 'range',
    accent: 'amber',
  },
  {
    id: 'hr-appeals',
    title: 'التظلمات',
    description: 'تظلمات الموظفين وقراراتها.',
    category: 'hr',
    icon: FileText,
    dateMode: 'range',
    accent: 'rose',
  },
  {
    id: 'hr-attachments',
    title: 'مرفقات قضايا HR',
    description: 'مرفقات المخالفات/الشكاوى/الجزاءات.',
    category: 'hr',
    icon: Paperclip,
    dateMode: 'range',
    accent: 'teal',
  },
  {
    id: 'hr-allowances',
    title: 'البدلات',
    description: 'بدلات الموظفين الشهرية ومرة واحدة.',
    category: 'hr',
    icon: Gift,
    dateMode: 'range',
    accent: 'emerald',
  },
  {
    id: 'hr-benefits',
    title: 'المزايا والتأمينات',
    description: 'مزايا وتأمينات الموظفين وتكلفتها.',
    category: 'hr',
    icon: HeartPulse,
    dateMode: 'range',
    accent: 'emerald',
  },
  {
    id: 'hr-loans',
    title: 'قروض الموظفين',
    description: 'القروض والأقساط والمتبقي.',
    category: 'hr',
    icon: Landmark,
    dateMode: 'range',
    accent: 'emerald',
  },
  {
    id: 'hr-performance-evaluations',
    title: 'تقييمات الأداء',
    description: 'تقييمات الموظفين حسب الدورة والدرجة والتقدير.',
    category: 'hr',
    icon: Star,
    dateMode: 'range',
    accent: 'teal',
  },
  {
    id: 'hr-performance-goals',
    title: 'أهداف الأداء',
    description: 'أهداف الموظفين: المستهدف والمحقق ونسبة الإنجاز.',
    category: 'hr',
    icon: Target,
    dateMode: 'range',
    accent: 'teal',
  },
  {
    id: 'hr-performance-pips',
    title: 'خطط تحسين الأداء',
    description: 'خطط تحسين الأداء وحالتها ونتائجها.',
    category: 'hr',
    icon: TrendingUp,
    dateMode: 'range',
    accent: 'teal',
  },
  {
    id: 'mfg-production-kpis',
    title: 'مؤشرات الإنتاج',
    description: 'أوامر الإنتاج: الكميات، الجودة، الالتزام بالمواعيد.',
    category: 'operations',
    icon: Factory,
    dateMode: 'range',
    accent: 'sky',
  },
  {
    id: 'sales-target-kpis',
    title: 'أهداف المبيعات',
    description: 'مستهدفات المندوبين مقابل المحقق ونسب الإنجاز والعمولات.',
    category: 'sales',
    icon: Target,
    dateMode: 'range',
    accent: 'emerald',
  },
  {
    id: 'hr-training-expenses',
    title: 'مصروفات التدريب',
    description: 'مصروفات الدورات التدريبية حسب الدورة والموظف وطريقة الدفع.',
    category: 'hr',
    icon: GraduationCap,
    dateMode: 'range',
    accent: 'emerald',
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
    chart: 'line',
    drilldown: { label: 'فتح تفاصيل المبيعات', route: '/sales/invoices', note: 'عرض الفواتير المكوّنة للمبلغ.' },
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
    description: 'المستحق على كل عميل موزَّع على شرائح 0-30 / 31-60 / 61-90 / 91-120 / أكثر من 120 يوم، محسوبًا من تاريخ الاستحقاق.',
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
    chart: 'area',
    drilldown: { label: 'فتح سندات الخزينة', route: '/finance/cash-registers', note: 'عرض الحركات والسندات المرتبطة بالخزينة.' },
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
    chart: 'area',
    drilldown: { label: 'فتح تفاصيل التدفق النقدي', route: '/finance/cash-flow', note: 'عرض كل التحصيلات والمدفوعات المتوقعة.' },
  },
  {
    id: 'break-even',
    title: 'نقطة التعادل',
    description: 'لازم تبيع بكام عشان تغطّي مصاريفك: هامش المساهمة والمصروفات الثابتة ونقطة التعادل وهامش الأمان.',
    category: 'finance',
    icon: Target,
    dateMode: 'range',
    chart: 'pie',
    drilldown: { label: 'فتح تفاصيل المصروفات', route: '/finance/expenses', note: 'عرض المصروفات المصنفة إلى ثابتة ومتغيرة وشبه متغيرة.' },
  },
  {
    id: 'branch-performance',
    title: 'أداء الفروع',
    description: 'كل الفروع جنب بعض: مبيعات ومرتجعات ومتوسط فاتورة وربح وهوامش ومصروفات وتحصيل ومخزون والنمو.',
    category: 'finance',
    icon: Landmark,
    dateMode: 'range',
  },

  {
    id: 'sales-rep-performance',
    title: 'أداء منشئي الفواتير',
    description: 'تحليل حجم الفواتير والتحصيل والربحية حسب منشئ الفاتورة؛ لا يمثل مندوب البيع ما لم يُسجّل المندوب بشكل مستقل.',
    category: 'sales',
    icon: Award,
    dateMode: 'range',
  },
  {
    id: 'cash-flow-detailed',
    title: 'حركة التدفق النقدي التفصيلي',
    description: 'كشف تفصيلي بكل المقبوضات والمدفوعات لجميع الخزائن وحركات النقدية مع الصافي.',
    category: 'finance',
    icon: DollarSign,
    dateMode: 'range',
    controls: [{ key: 'registerId', label: 'الخزينة', kind: 'register' }],
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
  let result: ReportResult;

  switch (id) {
    case 'operations-log':
      result = service.operationsLog(params);
      break;
    case 'user-activity':
      result = service.userActivity(params);
      break;
    case 'daily-movements':
      result = service.dailyMovements(params);
      break;
    case 'exceptions':
      result = service.exceptionsLog(params);
      break;
    case 'approvals':
      result = service.approvalsLog(params);
      break;
    case 'received-reports':
      result = service.receivedReports(params);
      break;
    case 'alerts':
      result = service.alertsSummary(params);
      break;
    case 'sales-analysis':
      result = service.salesAnalysis(params);
      break;
    case 'product-sales':
      result = service.productSales(params);
      break;
    case 'product-detail':
      result = service.productDetail(params);
      break;
    case 'product-profitability':
      result = service.productProfitability(params);
      break;
    case 'customer-profitability':
      result = service.customerProfitability(params);
      break;
    case 'period-comparison':
      result = service.periodComparison(params);
      break;
    case 'ar-aging':
      result = service.arAging(params);
      break;
    case 'credit-exposure':
      result = service.creditExposure(params);
      break;
    case 'payment-behavior':
      result = service.paymentBehavior(params);
      break;
    case 'cheque-maturity':
      result = service.chequeMaturity(params);
      break;
    case 'bounced-cheques':
      result = service.bouncedCheques(params);
      break;
    case 'installment-aging':
      result = service.installmentAging(params);
      break;
    case 'inventory-balances':
      result = service.inventoryBalances();
      break;
    case 'slow-moving':
      result = service.slowMoving(params);
      break;
    case 'purchase-analysis':
      result = service.purchaseAnalysis(params);
      break;
    case 'supplier-prices':
      result = service.supplierPrices(params);
      break;
    case 'count-variance':
      result = service.countVariance(params);
      break;
    case 'financial-position':
      result = service.financialPosition(params);
      break;
    case 'cash-movement':
      result = service.cashMovement(params);
      break;
    case 'shift-closing':
      result = service.shiftClosing(params);
      break;
    case 'cash-flow-forecast':
      result = service.cashFlowForecast(params);
      break;
    case 'break-even':
      result = service.breakEven(params);
      break;
    case 'branch-performance':
      result = service.branchPerformance(params);
      break;
    case 'demand-forecast':
      result = service.demandForecast(params);
      break;
    case 'customer-churn':
      result = service.customerChurn(params);
      break;
    case 'basket':
      result = service.basketAnalysis(params);
      break;
    case 'sales-rep-performance':
      result = service.salesRepPerformance(params);
      break;
    case 'cash-flow-detailed':
      result = service.cashFlowDetailed(params);
      break;
    case 'hr-payroll-summary':
      result = service.hrPayrollSummary(params);
      break;
    case 'hr-payroll-payouts':
      result = service.hrPayrollPayouts(params);
      break;
    case 'hr-attendance-summary':
      result = service.hrAttendanceSummary(params);
      break;
    case 'hr-leave-summary':
      result = service.hrLeaveSummary(params);
      break;
    case 'hr-tax-summary':
      result = service.hrTaxSummary(params);
      break;
    case 'hr-vacancies':
      result = service.hrVacancies(params);
      break;
    case 'hr-onboarding':
      result = service.hrOnboarding(params);
      break;
    case 'hr-probation':
      result = service.hrProbation(params);
      break;
    case 'hr-violations':
      result = service.hrViolations(params);
      break;
    case 'hr-complaints':
      result = service.hrComplaints(params);
      break;
    case 'hr-penalties-report':
      result = service.hrPenaltiesReport(params);
      break;
    case 'hr-warnings':
      result = service.hrWarnings(params);
      break;
    case 'hr-appeals':
      result = service.hrAppeals(params);
      break;
    case 'hr-attachments':
      result = service.hrAttachments(params);
      break;
    case 'hr-allowances':
      result = service.hrAllowances(params);
      break;
    case 'hr-benefits':
      result = service.hrBenefits(params);
      break;
    case 'hr-loans':
      result = service.hrLoans(params);
      break;
    case 'hr-performance-evaluations':
      result = service.hrPerformanceEvaluations(params);
      break;
    case 'hr-performance-goals':
      result = service.hrPerformanceGoals(params);
      break;
    case 'hr-performance-pips':
      result = service.hrPerformancePips(params);
      break;
    case 'mfg-production-kpis':
      result = service.mfgProductionKpis(params);
      break;
    case 'sales-target-kpis':
      result = service.salesTargetKpis(params);
      break;
    case 'hr-training-expenses':
      result = service.hrTrainingExpenses(params);
      break;
    default:
      throw new Error('تقرير غير معروف.');
  }

  return ReportCenterService.applyAdvancedFilters(result, params) ?? result;
}

export const findReport = (id: string | null): ReportDefinition | undefined =>
  id ? REPORT_DEFINITIONS.find((report) => report.id === id) : undefined;
