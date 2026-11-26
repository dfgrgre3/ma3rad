import { getActivityDashboardKind, type ActivityDashboardKind } from '../../../config/activityDashboard';
import { getEffectiveBusinessType } from '../config/BusinessTypeService';
import { AccountingService } from '../finance/AccountingService';
import { RetailWorkspaceService } from '../retail/RetailWorkspaceService';
import { CeramicsService, type CeramicTopDesign } from '../ceramics/CeramicsService';
import { AuthService } from '../auth/AuthService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { HospitalityService } from '../hospitality/HospitalityService';
import { EducationService } from '../education/EducationService';
import { WorkshopService } from '../workshop/WorkshopService';
import { ManufacturingService } from '../manufacturing/ManufacturingService';
import { ProjectExecutionService } from '../projects/ProjectExecutionService';
import { TimeBillingService } from '../professional/TimeBillingService';
import { CeramicMath } from '../../../utils/products/ceramicMath';
import { localDateString } from '../../../utils/shared/date';

export interface ActivityTile {
  id: string;
  label: string;
  value: string;
  hint?: string;
}

export interface ActivityListRow {
  label: string;
  value: string;
  meta?: string;
}

export interface ActivityListSection {
  id: string;
  title: string;
  rows: ActivityListRow[];
  emptyText: string;
}

export interface ActivityProgress {
  label: string;
  percent: number;
  caption: string;
}

export interface ActivityHourlyPoint {
  hour: number;
  revenue: number;
}

export interface ActivityDashboardData {
  kind: ActivityDashboardKind;
  tiles: ActivityTile[];
  progress: ActivityProgress[];
  sections: ActivityListSection[];
  /** Optional intraday revenue chart. */
  hourly?: ActivityHourlyPoint[];
  /** Optional per-day revenue and profit chart. */
  daily?: Array<{ label: string; revenue: number; profit?: number }>;
}

/** Optional date/branch filter for the activity dashboard. */
export interface ActivityDashboardFilter {
  from?: string;
  to?: string;
  branchId?: string;
}

type Metrics = Awaited<ReturnType<AccountingService['getDashboardMetricsAsync']>>;

const num = (n: unknown): number => Number(n) || 0;
const int = (n: unknown): string => num(n).toLocaleString('ar-EG');
const money = (n: unknown): string => CeramicMath.formatCurrency(num(n));
const pct = (n: number): string => `${num(n).toFixed(1)}%`;
const DASH = '—';

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

async function loadMetrics(): Promise<Metrics | null> {
  try {
    return await new AccountingService().getDashboardMetricsAsync();
  } catch {
    return null;
  }
}

function genericTiles(m: Metrics | null, extras: ActivityTile[] = []): ActivityTile[] {
  return [
    ...extras,
    { id: 'today_sales', label: 'مبيعات اليوم', value: m ? money(m.todaySales) : DASH },
    { id: 'month_sales', label: 'مبيعات الشهر', value: m ? money(m.monthSales) : DASH },
    { id: 'net_profit', label: 'صافي الربح', value: m ? money(m.netProfit) : DASH },
    { id: 'receivables', label: 'ديون العملاء', value: m ? money(m.totalReceivables) : DASH },
  ];
}

function genericSections(): ActivityListSection[] {
  return [];
}

/* ─── Retail family ─────────────────────────────────────────────────────── */

function buildRetail(): ActivityDashboardData {
  const svc = new RetailWorkspaceService();
  const stats = safe(() => svc.getStats(), null);
  const topProducts = safe(() => svc.getTopProducts(30, 5), [] as Awaited<ReturnType<RetailWorkspaceService['getTopProducts']>>);
  const lowStock = safe(() => svc.getLowStockRows(6), [] as Awaited<ReturnType<RetailWorkspaceService['getLowStockRows']>>);
  const expiry = safe(() => svc.getExpirySummary(), null);
  const openOrders = safe(() => svc.getOpenOrders(6), [] as Awaited<ReturnType<RetailWorkspaceService['getOpenOrders']>>);

  const tiles: ActivityTile[] = [
    { id: 'today_sales', label: 'مبيعات اليوم', value: stats ? money(stats.todaySales) : DASH },
    { id: 'month_sales', label: 'مبيعات الشهر', value: stats ? money(stats.monthSales) : DASH },
    { id: 'open_orders', label: 'طلبات مفتوحة', value: stats ? int(stats.openOrders) : DASH },
    { id: 'open_quotes', label: 'عروض أسعار مفتوحة', value: stats ? int(stats.openQuotes) : DASH },
    { id: 'low_stock', label: 'أصناف منخفضة', value: stats ? int(stats.lowStockCount) : DASH },
  ];
  if (expiry && expiry.trackedProducts > 0) {
    tiles.push({
      id: 'expiry',
      label: 'دفعات قرب الانتهاء',
      value: int(expiry.expiringCount + expiry.expiredCount),
      hint: expiry.expiredCount > 0 ? `${int(expiry.expiredCount)} منتهية` : undefined,
    });
  }

  const sections: ActivityListSection[] = [
    {
      id: 'top_products',
      title: 'الأصناف الأكثر مبيعًا (30 يوم)',
      emptyText: 'لا توجد مبيعات مسجلة بعد.',
      rows: topProducts.map((p) => ({
        label: p.name,
        value: money(p.totalAmount),
        meta: `${int(p.totalQty)} × ${int(p.invoices)} فاتورة`,
      })),
    },
    {
      id: 'open_orders',
      title: 'أحدث الطلبات المفتوحة',
      emptyText: 'لا توجد طلبات مفتوحة.',
      rows: openOrders.map((o) => ({
        label: o.orderNumber,
        value: o.customerName || 'عميل نقدي',
        meta: o.status,
      })),
    },
    {
      id: 'low_stock',
      title: 'نواقص المخزون',
      emptyText: 'المخزون في مستوى آمن.',
      rows: lowStock.map((r) => ({
        label: r.name,
        value: `${int(r.stockQty)} متاح`,
        meta: `الحد الأدنى ${int(r.minStockLevel)}`,
      })),
    },
  ];
  return { kind: 'retail', tiles, progress: [], sections };
}

/* ─── Ceramics ──────────────────────────────────────────────────────────── */

function buildCeramics(): ActivityDashboardData {
  const svc = new CeramicsService();
  const stats = safe(() => svc.getDashboardStats(), null);
  const topDesigns = safe(() => svc.getTopSellingDesigns(30, 5), [] as CeramicTopDesign[]);

  return {
    kind: 'ceramics',
    tiles: [
      { id: 'open_quotes', label: 'عروض أسعار مفتوحة', value: stats ? int(stats.openQuotes) : DASH, hint: stats ? money(stats.openQuotesAmount) : undefined },
      { id: 'showroom_m2', label: 'مخزون المعرض', value: stats ? `${int(stats.showroomM2)} م²` : DASH },
      { id: 'designs', label: 'التصاميم', value: stats ? int(stats.designsCount) : DASH },
      { id: 'skus', label: 'الأصناف', value: stats ? int(stats.skusCount) : DASH },
      { id: 'service_orders', label: 'أوامر خدمة مفتوحة', value: stats ? int(stats.openServiceOrders) : DASH, hint: stats ? money(stats.openServiceOrdersAmount) : undefined },
      { id: 'commissions', label: 'عمولات معلقة', value: stats ? int(stats.pendingCommissions) : DASH, hint: stats ? money(stats.pendingCommissionsAmount) : undefined },
      { id: 'low_stock', label: 'نواقص المخزون', value: stats ? int(stats.lowStockCount) : DASH },
    ],
    progress: [],
    sections: [
      {
        id: 'top_designs',
        title: 'أكثر التصاميم مبيعًا (30 يوم)',
        emptyText: 'لا توجد مبيعات مسجلة بعد.',
        rows: topDesigns.map((d) => ({
          label: d.name,
          value: money(d.totalAmount),
          meta: `${int(d.totalM2)} م² · ${d.brandName || 'بدون ماركة'}`,
        })),
      },
    ],
  };
}

/* ─── Hospitality (hotel) ───────────────────────────────────────────────── */

function buildHospitality(m: Metrics | null): ActivityDashboardData {
  const svc = new HospitalityService();
  const stats = safe(() => svc.getDashboardStats(), null);

  return {
    kind: 'hospitality',
    tiles: [
      { id: 'occupancy', label: 'نسبة الإشغال', value: stats ? pct(stats.occupancyRate) : DASH },
      { id: 'rooms', label: 'غرف مشغولة', value: stats ? `${int(stats.occupied)} / ${int(stats.totalRooms)}` : DASH },
      { id: 'arrivals', label: 'وصول اليوم', value: stats ? int(stats.arrivalsToday) : DASH },
      { id: 'departures', label: 'مغادرة اليوم', value: stats ? int(stats.departuresToday) : DASH },
      { id: 'housekeeping', label: 'مهام نظافة معلقة', value: stats ? int(stats.pendingTasks) : DASH },
      { id: 'folio', label: 'أرصدة الفوليو', value: stats ? money(stats.folioBalance) : DASH },
      { id: 'today_sales', label: 'مبيعات اليوم', value: m ? money(m.todaySales) : DASH },
    ],
    progress: stats && stats.totalRooms
      ? [{ label: 'إشغال الغرف', percent: stats.occupancyRate, caption: `${int(stats.occupied)} مشغولة · ${int(stats.available)} متاحة · ${int(stats.reserved)} محجوزة` }]
      : [],
    sections: [
      {
        id: 'room_status',
        title: 'حالة الغرف',
        emptyText: 'لا توجد غرف مسجلة.',
        rows: stats
          ? [
              { label: 'متاحة', value: int(stats.available) },
              { label: 'مشغولة', value: int(stats.occupied) },
              { label: 'محجوزة', value: int(stats.reserved) },
              { label: 'تنظيف', value: int(stats.cleaning) },
              { label: 'صيانة / خارج الخدمة', value: int(stats.maintenance) },
            ]
          : [],
      },
    ],
  };
}

/* ─── Education ─────────────────────────────────────────────────────────── */

function buildEducation(m: Metrics | null): ActivityDashboardData {
  const svc = new EducationService();
  const classes = safe(() => svc.getClasses().filter((c) => c.isActive), [] as Awaited<ReturnType<EducationService['getClasses']>>);
  const enrollments = safe(() => svc.getEnrollments(), [] as Awaited<ReturnType<EducationService['getEnrollments']>>);
  const fees = safe(() => svc.getFeeInstallments(), [] as Awaited<ReturnType<EducationService['getFeeInstallments']>>);

  const activeEnrollments = enrollments.filter((e) => e.status === 'ENROLLED' || e.status === 'ACTIVE');
  const today = localDateString();
  const attendance = safe(() => {
    let present = 0; let total = 0; let absent = 0; let late = 0;
    for (const c of classes.slice(0, 30)) {
      for (const r of svc.getAttendance(c.id, today)) {
        total += 1;
        if (r.status === 'PRESENT') present += 1;
        else if (r.status === 'ABSENT') absent += 1;
        else if (r.status === 'LATE') late += 1;
      }
    }
    return { present, total, absent, late, rate: total ? (present / total) * 100 : 0 };
  }, { present: 0, total: 0, absent: 0, late: 0, rate: 0 });

  const dueFees = fees.filter((f) => f.status === 'PENDING' || f.status === 'PARTIAL' || f.status === 'OVERDUE');
  const dueAmount = dueFees.reduce((s, f) => s + num(f.remaining ?? f.amount), 0);
  const overdueCount = fees.filter((f) => f.status === 'OVERDUE').length;

  return {
    kind: 'education',
    tiles: [
      { id: 'classes', label: 'الفصول النشطة', value: int(classes.length) },
      { id: 'students', label: 'الطلاب المسجلون', value: int(activeEnrollments.length) },
      { id: 'attendance', label: 'حضور اليوم', value: attendance.total ? pct(attendance.rate) : '—', hint: attendance.total ? `${int(attendance.present)} حاضر · ${int(attendance.absent)} غائب` : undefined },
      { id: 'fees_due', label: 'أقساط مستحقة', value: money(dueAmount), hint: overdueCount ? `${int(overdueCount)} متأخرة` : undefined },
      { id: 'month_sales', label: 'تحصيلات الشهر', value: m ? money(m.monthSales) : DASH },
      { id: 'receivables', label: 'ديون العملاء', value: m ? money(m.totalReceivables) : DASH },
    ],
    progress: attendance.total
      ? [{ label: 'حضور اليوم', percent: attendance.rate, caption: `${int(attendance.present)} حاضر · ${int(attendance.late)} متأخر · ${int(attendance.absent)} غائب من ${int(attendance.total)}` }]
      : [],
    sections: [
      {
        id: 'classes',
        title: 'الفصول الدراسية',
        emptyText: 'لا توجد فصول نشطة.',
        rows: classes.slice(0, 8).map((c) => ({
          label: c.name,
          value: `${int(c.enrolledCount)} / ${int(c.capacity)}`,
          meta: c.subject || c.teacherName || '',
        })),
      },
      {
        id: 'fees',
        title: 'أقرب الأقساط استحقاقًا',
        emptyText: 'لا توجد أقساط مستحقة.',
        rows: dueFees
          .slice()
          .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'))
          .slice(0, 8)
          .map((f) => ({
            label: f.studentName,
            value: money(f.remaining ?? f.amount),
            meta: `${f.title}${f.dueDate ? ` · ${f.dueDate}` : ''}`,
          })),
      },
    ],
  };
}

/* ─── Workshop ──────────────────────────────────────────────────────────── */

function buildWorkshop(m: Metrics | null): ActivityDashboardData {
  const svc = new WorkshopService();
  const stats = safe(() => svc.getDashboardStats(), null);
  const orders = safe(() => svc.getWorkOrders(), [] as Awaited<ReturnType<WorkshopService['getWorkOrders']>>);

  const statusLabel: Record<string, string> = {
    RECEIVED: 'مستلمة', INSPECTION: 'فحص', WAITING_APPROVAL: 'بانتظار موافقة',
    APPROVED: 'معتمدة', IN_PROGRESS: 'قيد التنفيذ', READY: 'جاهزة', DELIVERED: 'مسلمة', CANCELLED: 'ملغاة',
  };

  return {
    kind: 'workshop',
    tiles: [
      { id: 'open', label: 'أوامر مفتوحة', value: stats ? int(stats.openOrders) : DASH },
      { id: 'in_progress', label: 'قيد التنفيذ', value: stats ? int(stats.inProgress) : DASH },
      { id: 'waiting', label: 'بانتظار موافقة العميل', value: stats ? int(stats.waitingApproval) : DASH },
      { id: 'ready', label: 'جاهزة للتسليم', value: stats ? int(stats.ready) : DASH },
      { id: 'delivered_month', label: 'مسلمة هذا الشهر', value: stats ? int(stats.deliveredThisMonth) : DASH },
      { id: 'revenue_month', label: 'إيراد الشهر', value: stats ? money(stats.revenueThisMonth) : DASH },
      { id: 'today_sales', label: 'مبيعات اليوم', value: m ? money(m.todaySales) : DASH },
    ],
    progress: [],
    sections: [
      {
        id: 'orders',
        title: 'أحدث أوامر العمل',
        emptyText: 'لا توجد أوامر عمل.',
        rows: orders.slice(0, 8).map((o) => ({
          label: o.orderNumber,
          value: o.customerName || 'عميل',
          meta: statusLabel[o.status] ?? o.status,
        })),
      },
    ],
  };
}

/* ─── Manufacturing ─────────────────────────────────────────────────────── */

const PO_STATUS_LABEL: Record<string, string> = {
  PLANNED: 'مخطط', RELEASED: 'محرر', IN_PROGRESS: 'قيد التنفيذ', COMPLETED: 'مكتمل', CANCELLED: 'ملغى',
};

function buildManufacturing(m: Metrics | null): ActivityDashboardData {
  const svc = new ManufacturingService();
  const orders = safe(() => svc.getProductionOrders(), [] as Awaited<ReturnType<ManufacturingService['getProductionOrders']>>);
  const wip = safe(() => svc.getWipValuation(), null);

  const month = localDateString().slice(0, 7);
  const countBy = (s: string) => orders.filter((o) => o.status === s).length;
  const completedMonth = orders.filter((o) => o.status === 'COMPLETED' && (o.completedAt || '').startsWith(month)).length;

  return {
    kind: 'manufacturing',
    tiles: [
      { id: 'planned', label: 'أوامر مخططة', value: int(countBy('PLANNED')) },
      { id: 'released', label: 'أوامر محررة', value: int(countBy('RELEASED')) },
      { id: 'in_progress', label: 'قيد التنفيذ', value: int(countBy('IN_PROGRESS')) },
      { id: 'completed_month', label: 'مكتملة هذا الشهر', value: int(completedMonth) },
      { id: 'wip', label: 'قيمة المخزون تحت التصنيع', value: wip ? money(wip.totalMaterialCost) : DASH, hint: wip ? `${int(wip.totalQuantity)} وحدة` : undefined },
      { id: 'today_purchases', label: 'مشتريات اليوم', value: m ? money(m.todayPurchases) : DASH },
      { id: 'low_stock', label: 'نواقص الخامات', value: m ? int(m.lowStockCount) : DASH },
    ],
    progress: [],
    sections: [
      {
        id: 'orders',
        title: 'أحدث أوامر الإنتاج',
        emptyText: 'لا توجد أوامر إنتاج.',
        rows: orders.slice(0, 8).map((o) => ({
          label: o.orderNumber,
          value: o.productName || 'منتج',
          meta: `${PO_STATUS_LABEL[o.status] ?? o.status} · ${int(o.producedQty)} / ${int(o.quantity)}`,
        })),
      },
    ],
  };
}

/* ─── Construction ──────────────────────────────────────────────────────── */

const PROJECT_STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'نشط', ON_HOLD: 'موقوف', PLANNED: 'مخطط', COMPLETED: 'مكتمل', CANCELLED: 'ملغى',
};

function buildConstruction(m: Metrics | null): ActivityDashboardData {
  const portfolio = safe(() => new ProjectExecutionService().getPortfolioSummary(), [] as ReturnType<ProjectExecutionService['getPortfolioSummary']>);
  const active = portfolio.filter((p) => p.status === 'ACTIVE');
  const overdue = portfolio.filter((p) => p.isOverdue);
  const sum = (rows: typeof portfolio, key: 'contractValue' | 'certifiedAmount' | 'collectionGap' | 'actualCost') =>
    rows.reduce((s, p) => s + num((p as Record<string, unknown>)[key]), 0);

  return {
    kind: 'construction',
    tiles: [
      { id: 'active', label: 'مشاريع نشطة', value: int(active.length) },
      { id: 'overdue', label: 'مشاريع متأخرة', value: int(overdue.length) },
      { id: 'contract', label: 'إجمالي قيمة العقود', value: money(sum(portfolio, 'contractValue')) },
      { id: 'certified', label: 'إجمالي المستخلصات', value: money(sum(portfolio, 'certifiedAmount')) },
      { id: 'gap', label: 'فجوة التحصيل', value: money(sum(portfolio, 'collectionGap')) },
      { id: 'cost', label: 'التكلفة الفعلية', value: money(sum(portfolio, 'actualCost')) },
      { id: 'receivables', label: 'ديون العملاء', value: m ? money(m.totalReceivables) : DASH },
    ],
    progress: [],
    sections: [
      {
        id: 'projects',
        title: 'المشاريع الجارية',
        emptyText: 'لا توجد مشاريع.',
        rows: portfolio.slice(0, 8).map((p) => ({
          label: p.name,
          value: money(p.contractValue),
          meta: `${PROJECT_STATUS_LABEL[p.status] ?? p.status}${p.isOverdue ? ' · متأخر' : ''}`,
        })),
      },
    ],
  };
}

/* ─── Professional services ─────────────────────────────────────────────── */

function buildProfessional(m: Metrics | null): ActivityDashboardData {
  const svc = new TimeBillingService();
  const unbilled = safe(() => svc.getUnbilledSummary(), null);
  const profitability = safe(() => svc.getProfitability().slice(0, 5), [] as Awaited<ReturnType<TimeBillingService['getProfitability']>>);

  return {
    kind: 'professional',
    tiles: [
      { id: 'unbilled', label: 'سجلات غير مفوترة', value: unbilled ? int(unbilled.count) : DASH, hint: unbilled ? `${num(unbilled.hours).toFixed(1)} ساعة` : undefined },
      { id: 'unbilled_amount', label: 'قيمة غير مفوترة', value: unbilled ? money(unbilled.amount) : DASH },
      { id: 'month_sales', label: 'إيراد الشهر', value: m ? money(m.monthSales) : DASH },
      { id: 'net_profit', label: 'صافي الربح', value: m ? money(m.netProfit) : DASH },
      { id: 'receivables', label: 'ديون العملاء', value: m ? money(m.totalReceivables) : DASH },
    ],
    progress: [],
    sections: [
      {
        id: 'profitability',
        title: 'أكثر العملاء ربحية (الشهر)',
        emptyText: 'لا توجد ساعات معتمدة بعد.',
        rows: profitability.map((r) => ({
          label: r.customerName,
          value: money(r.billableAmount),
          meta: `${num(r.billableHours).toFixed(1)} ساعة · ${int(r.entryCount)} سجل`,
        })),
      },
    ],
  };
}

/* ─── Distribution ──────────────────────────────────────────────────────── */

function buildDistribution(m: Metrics | null): ActivityDashboardData {
  return {
    kind: 'distribution',
    tiles: [
      { id: 'month_sales', label: 'مبيعات الشهر', value: m ? money(m.monthSales) : DASH },
      { id: 'today_purchases', label: 'مشتريات اليوم', value: m ? money(m.todayPurchases) : DASH },
      { id: 'inventory', label: 'قيمة المخزون', value: m?.inventoryValuationCost != null ? money(m.inventoryValuationCost) : DASH },
      { id: 'low_stock', label: 'نواقص المخزون', value: m ? int(m.lowStockCount) : DASH },
      { id: 'receivables', label: 'ديون العملاء', value: m ? money(m.totalReceivables) : DASH },
      { id: 'payables_hint', label: 'صافي الربح', value: m ? money(m.netProfit) : DASH },
    ],
    progress: [],
    sections: genericSections(),
  };
}

/* ─── Generic ───────────────────────────────────────────────────────────── */

async function buildGeneric(m: Metrics | null): Promise<ActivityDashboardData> {
  return {
    kind: 'generic',
    tiles: genericTiles(m),
    progress: [],
    sections: genericSections(),
  };
}

/* ─── Public API ────────────────────────────────────────────────────────── */

export class ActivityDashboardService {
  /** Temporarily scopes service reads to the branch chosen in the dashboard filter. */
  private applyBranchFilter(branchId?: string): (() => void) | null {
    if (!branchId) return null;
    try {
      const user = AuthService.getCurrentUser();
      if (!user) return null;
      const access = new BranchAccessService();
      const currentBranchId = access.getCurrentBranchId(user);
      if (!currentBranchId || currentBranchId === branchId) return null;
      access.setCurrentBranchId(branchId, user);
      return () => {
        try {
          access.setCurrentBranchId(currentBranchId, user);
        } catch {
          // Best-effort restore; the caller may have already left the page.
        }
      };
    } catch {
      return null;
    }
  }

  /** Resolves the dashboard data for the effective (or given) business type. */
  public async getDashboard(
    businessType: string = getEffectiveBusinessType(),
    filter?: ActivityDashboardFilter,
  ): Promise<ActivityDashboardData> {
    const restoreBranch = this.applyBranchFilter(filter?.branchId);
    try {
      const kind = getActivityDashboardKind(businessType);
      const metrics = await loadMetrics();

      switch (kind) {
        case 'ceramics': return buildCeramics();
        case 'hospitality': return buildHospitality(metrics);
        case 'education': return buildEducation(metrics);
        case 'workshop': return buildWorkshop(metrics);
        case 'manufacturing': return buildManufacturing(metrics);
        case 'construction': return buildConstruction(metrics);
        case 'professional': return buildProfessional(metrics);
        case 'distribution': return buildDistribution(metrics);
        case 'retail': return buildRetail();
        default: return buildGeneric(metrics);
      }
    } finally {
      restoreBranch?.();
    }
  }
}
