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
import { OperationsService, type Delivery } from '../operations/OperationsService';
import { DebtService, type DebtRow } from '../finance/DebtService';
import { PermissionService } from '../auth/PermissionService';
import { getProductUnitLabel } from '../../../utils/products/productUnits';
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
  /** Data sources that failed to load, with their error/permission reason. */
  warnings?: string[];
}

/** Optional branch filter for the activity dashboard. */
export interface ActivityDashboardFilter {
  branchId?: string;
}

type Metrics = Awaited<ReturnType<AccountingService['getDashboardMetricsAsync']>>;

const num = (n: unknown): number => Number(n) || 0;
const int = (n: unknown): string => n == null ? DASH : num(n).toLocaleString('ar-EG');
const money = (n: unknown): string => n == null ? DASH : CeramicMath.formatCurrency(num(n));
const pct = (n: number): string => `${num(n).toFixed(1)}%`;
const DASH = '—';

interface BuildContext {
  warnings: string[];
}

function errorReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 160 ? `${message.slice(0, 157)}…` : message;
}

/** Like safe(), but records the failure reason so the UI can explain the "—". */
function ctxSafe<T>(ctx: BuildContext, source: string, fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (error) {
    ctx.warnings.push(`${source}: ${errorReason(error)}`);
    return fallback;
  }
}

/** Promise variant of ctxSafe for the shared analytics loader. */
function ctxCatch<T>(ctx: BuildContext, source: string, promise: Promise<T>, fallback: T): Promise<T> {
  return promise.catch((error) => {
    ctx.warnings.push(`${source}: ${errorReason(error)}`);
    return fallback;
  });
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

/* ─── Retail family ─────────────────────────────────────────────────────── */

/** Retail sub-activities where warranty claims are a meaningful signal. */
const RETAIL_WARRANTY_ACTIVITIES = new Set(['electronics', 'home_appliances', 'automotive', 'furniture']);
/** Perishable retail sub-activities that need an expiry-lots spotlight. */
const RETAIL_EXPIRY_ACTIVITIES = new Set(['food', 'cosmetics']);
/** Quote/credit-heavy retail sub-activities that benefit from finance tiles. */
const RETAIL_B2B_ACTIVITIES = new Set(['sanitary', 'furniture', 'building_materials', 'lighting']);

function buildRetail(metrics: Metrics | null, ctx: BuildContext, businessType: string): ActivityDashboardData {
  const svc = new RetailWorkspaceService();
  const stats = ctxSafe(ctx, 'إحصائيات المتجر', () => svc.getStats(), null);
  const topProducts = ctxSafe(ctx, 'الأصناف الأكثر مبيعًا', () => svc.getTopProducts(30, 5), [] as Awaited<ReturnType<RetailWorkspaceService['getTopProducts']>>);
  const lowStock = ctxSafe(ctx, 'نواقص المخزون', () => svc.getLowStockRows(6), [] as Awaited<ReturnType<RetailWorkspaceService['getLowStockRows']>>);
  const expiry = ctxSafe(ctx, 'ملخص الصلاحية', () => svc.getExpirySummary(), null);
  const openOrders = ctxSafe(ctx, 'الطلبات المفتوحة', () => svc.getOpenOrders(6), [] as Awaited<ReturnType<RetailWorkspaceService['getOpenOrders']>>);
  const warranty = RETAIL_WARRANTY_ACTIVITIES.has(businessType)
    ? ctxSafe(ctx, 'إحصائيات الضمان', () => svc.getWarrantyStats(), null)
    : null;

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
  if (warranty && warranty.total > 0) {
    tiles.push({
      id: 'warranty_open',
      label: 'مطالبات ضمان مفتوحة',
      value: int(warranty.open + warranty.underReview),
      hint: warranty.thisMonth > 0 ? `${int(warranty.thisMonth)} هذا الشهر` : undefined,
    });
  }
  if (metrics && RETAIL_B2B_ACTIVITIES.has(businessType)) {
    if (metrics.totalReceivables != null) {
      tiles.push({ id: 'receivables', label: 'ديون العملاء', value: money(metrics.totalReceivables) });
    }
    if (metrics.totalPayables != null) {
      tiles.push({ id: 'payables', label: 'مستحقات الموردين', value: money(metrics.totalPayables) });
    }
    if (metrics.netProfit != null) {
      tiles.push({ id: 'net_profit', label: 'صافي الربح', value: money(metrics.netProfit) });
    }
  }

  const sections = ([
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
    expiry && RETAIL_EXPIRY_ACTIVITIES.has(businessType) && expiry.upcoming.length
      ? {
          id: 'expiry_lots',
          title: 'دفعات قاربت على الانتهاء',
          emptyText: 'لا توجد دفعات قريبة من الانتهاء.',
          rows: expiry.upcoming.map((l) => ({
            label: l.productName,
            value: `${int(l.quantityRemaining)} متبقٍ`,
            meta: `تنتهي ${l.expiryDate}${l.daysToExpiry <= 0 ? ' (منتهية)' : ` · بعد ${int(l.daysToExpiry)} يوم`}`,
          })),
        }
      : null,
  ] as (ActivityListSection | null)[]).filter((s): s is ActivityListSection => s !== null);
  return { kind: 'retail', tiles, progress: [], sections };
}

/* ─── Ceramics ──────────────────────────────────────────────────────────── */

const CERAMIC_QUOTE_STATUS: Record<string, string> = {
  DRAFT: 'مسودة', SENT: 'مرسل', ACCEPTED: 'مقبول', REJECTED: 'مرفوض',
};
const CERAMIC_SERVICE_STATUS: Record<string, string> = {
  PENDING: 'معلق', IN_PROGRESS: 'قيد التنفيذ', COMPLETED: 'مكتمل', CANCELLED: 'ملغى',
};

function buildCeramics(ctx: BuildContext): ActivityDashboardData {
  const svc = new CeramicsService();
  const stats = ctxSafe(ctx, 'إحصائيات السيراميك', () => svc.getDashboardStats(), null);
  const topDesigns = ctxSafe(ctx, 'أكثر التصاميم مبيعًا', () => svc.getTopSellingDesigns(30, 5), [] as CeramicTopDesign[]);
  const quotes = ctxSafe(ctx, 'عروض المساحات', () => svc.getAreaQuotes(), [] as Awaited<ReturnType<CeramicsService['getAreaQuotes']>>);
  const serviceOrders = ctxSafe(ctx, 'أوامر خدمة السيراميك', () => svc.getServiceOrders(), [] as Awaited<ReturnType<CeramicsService['getServiceOrders']>>);
  const commissions = ctxSafe(ctx, 'عمولات السيراميك', () => svc.getCommissions(), [] as Awaited<ReturnType<CeramicsService['getCommissions']>>);

  const openQuotes = quotes.filter((q) => q.status === 'SENT' || q.status === 'DRAFT');
  const activeServiceOrders = serviceOrders.filter((o) => o.status === 'PENDING' || o.status === 'IN_PROGRESS');
  const pendingCommissions = commissions.filter((c) => c.status === 'PENDING');

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
    sections: ([
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
      openQuotes.length
        ? {
            id: 'area_quotes',
            title: 'عروض المساحات المفتوحة',
            emptyText: 'لا توجد عروض مفتوحة.',
            rows: openQuotes.slice(0, 6).map((q) => ({
              label: q.quoteNumber,
              value: q.customerName || 'عميل',
              meta: `${int(q.areaM2)} م² · ${money(q.totalAmount)} · ${CERAMIC_QUOTE_STATUS[q.status] ?? q.status}`,
            })),
          }
        : null,
      activeServiceOrders.length
        ? {
            id: 'service_orders',
            title: 'أوامر الخدمة الجارية',
            emptyText: 'لا توجد أوامر خدمة جارية.',
            rows: activeServiceOrders.slice(0, 6).map((o) => ({
              label: o.orderNumber,
              value: o.customerName || o.siteAddress || 'عميل',
              meta: `${o.serviceType} · ${int(o.areaM2)} م²${o.scheduledDate ? ` · ${o.scheduledDate}` : ''}`,
            })),
          }
        : null,
      pendingCommissions.length
        ? {
            id: 'commissions',
            title: 'عمولات معلقة الصرف',
            emptyText: 'لا توجد عمولات معلقة.',
            rows: pendingCommissions.slice(0, 6).map((c) => ({
              label: c.commissionNumber,
              value: c.partnerName,
              meta: `${money(c.amount)}${c.saleReference ? ` · ${c.saleReference}` : ''}`,
            })),
          }
        : null,
    ] as (ActivityListSection | null)[]).filter((s): s is ActivityListSection => s !== null),
  };
}

/* ─── Hospitality (hotel) ───────────────────────────────────────────────── */

const RESERVATION_STATUS: Record<string, string> = {
  CONFIRMED: 'مؤكد', CHECKED_IN: 'داخل', CHECKED_OUT: 'غادر', CANCELLED: 'ملغى', NO_SHOW: 'لم يحضر',
};

function buildHospitality(m: Metrics | null, ctx: BuildContext): ActivityDashboardData {
  const svc = new HospitalityService();
  const stats = ctxSafe(ctx, 'إحصائيات الإشغال', () => svc.getDashboardStats(), null);
  const reservations = ctxSafe(ctx, 'حجوزات الفندق', () => svc.getReservations(), [] as Awaited<ReturnType<HospitalityService['getReservations']>>);
  const housekeeping = ctxSafe(ctx, 'مهام النظافة', () => svc.getHousekeepingTasks(), [] as Awaited<ReturnType<HospitalityService['getHousekeepingTasks']>>);

  const today = localDateString();
  const arrivals = reservations.filter((r) => r.checkIn === today && (r.status === 'CONFIRMED' || r.status === 'CHECKED_IN'));
  const departures = reservations.filter((r) => r.checkOut === today && r.status === 'CHECKED_IN');
  const inHouse = reservations.filter((r) => r.status === 'CHECKED_IN');
  const upcoming = reservations
    .filter((r) => (r.status === 'CONFIRMED') && r.checkIn > today)
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  const pendingTasks = housekeeping.filter((t) => t.status === 'PENDING' || t.status === 'IN_PROGRESS');
  const resvRow = (r: (typeof reservations)[number]) => ({
    label: r.reservationNumber,
    value: r.customerName || 'نزيل',
    meta: `غرفة ${r.roomNumber || '—'} · ${r.checkIn} ← ${r.checkOut}${r.guestsCount ? ` · ${int(r.guestsCount)} ضيوف` : ''}`,
  });

  const tiles: ActivityTile[] = [
    { id: 'occupancy', label: 'نسبة الإشغال', value: stats ? pct(stats.occupancyRate) : DASH },
    { id: 'rooms', label: 'غرف مشغولة', value: stats ? `${int(stats.occupied)} / ${int(stats.totalRooms)}` : DASH },
    { id: 'arrivals', label: 'وصول اليوم', value: stats ? int(stats.arrivalsToday) : DASH },
    { id: 'departures', label: 'مغادرة اليوم', value: stats ? int(stats.departuresToday) : DASH },
    { id: 'housekeeping', label: 'مهام نظافة معلقة', value: stats ? int(stats.pendingTasks) : DASH },
    { id: 'folio', label: 'أرصدة الفوليو', value: stats ? money(stats.folioBalance) : DASH },
    { id: 'today_sales', label: 'مبيعات اليوم', value: m ? money(m.todaySales) : DASH },
  ];
  if (inHouse.length) {
    tiles.push({
      id: 'in_house',
      label: 'نزلاء داخل الفندق',
      value: int(inHouse.length),
      hint: money(inHouse.reduce((s, r) => s + num(r.totalAmount), 0)),
    });
  }
  if (upcoming.length) {
    tiles.push({ id: 'upcoming', label: 'حجوزات قادمة', value: int(upcoming.length) });
  }

  return {
    kind: 'hospitality',
    tiles,
    progress: stats && stats.totalRooms
      ? [{ label: 'إشغال الغرف', percent: stats.occupancyRate, caption: `${int(stats.occupied)} مشغولة · ${int(stats.available)} متاحة · ${int(stats.reserved)} محجوزة` }]
      : [],
    sections: ([
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
      arrivals.length || departures.length
        ? {
            id: 'today_movements',
            title: 'حركة اليوم — وصول ومغادرة',
            emptyText: 'لا توجد حركة اليوم.',
            rows: [
              ...arrivals.map(resvRow),
              ...departures.map((r) => ({ ...resvRow(r), meta: `${resvRow(r).meta} · مغادرة` })),
            ].slice(0, 8),
          }
        : null,
      upcoming.length
        ? {
            id: 'upcoming',
            title: 'أقرب الحجوزات القادمة',
            emptyText: 'لا توجد حجوزات قادمة.',
            rows: upcoming.slice(0, 6).map(resvRow),
          }
        : null,
      pendingTasks.length
        ? {
            id: 'housekeeping',
            title: 'مهام النظافة المعلقة',
            emptyText: 'لا توجد مهام معلقة.',
            rows: pendingTasks.slice(0, 6).map((t) => ({
              label: `غرفة ${t.roomNumber}`,
              value: t.taskType,
              meta: `${t.status === 'IN_PROGRESS' ? 'جارية' : 'معلقة'}${t.scheduledDate ? ` · ${t.scheduledDate}` : ''}${t.assignedTo ? ` · ${t.assignedTo}` : ''}`,
            })),
          }
        : null,
    ] as (ActivityListSection | null)[]).filter((s): s is ActivityListSection => s !== null),
  };
}

/* ─── Education ─────────────────────────────────────────────────────────── */

function buildEducation(m: Metrics | null, ctx: BuildContext): ActivityDashboardData {
  const svc = new EducationService();
  const classes = ctxSafe(ctx, 'الفصول الدراسية', () => svc.getClasses().filter((c) => c.isActive), [] as Awaited<ReturnType<EducationService['getClasses']>>);
  const enrollments = ctxSafe(ctx, 'التسجيلات', () => svc.getEnrollments(), [] as Awaited<ReturnType<EducationService['getEnrollments']>>);
  const fees = ctxSafe(ctx, 'أقساط الرسوم', () => svc.getFeeInstallments(), [] as Awaited<ReturnType<EducationService['getFeeInstallments']>>);
  const schedules = ctxSafe(ctx, 'جداول الحصص', () => svc.getSchedules(), [] as Awaited<ReturnType<EducationService['getSchedules']>>);

  const activeEnrollments = enrollments.filter((e) => e.status === 'ENROLLED' || e.status === 'ACTIVE');
  const today = localDateString();
  const attendance = ctxSafe(ctx, 'حضور اليوم', () => {
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

  const month = localDateString().slice(0, 7);
  const newEnrollments = enrollments.filter((e) => (e.enrolledAt || '').startsWith(month)).length;
  const todaySessions = schedules
    .filter((s) => s.dayOfWeek === new Date().getDay())
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const tiles: ActivityTile[] = [
    { id: 'classes', label: 'الفصول النشطة', value: int(classes.length) },
    { id: 'students', label: 'الطلاب المسجلون', value: int(activeEnrollments.length) },
    { id: 'attendance', label: 'حضور اليوم', value: attendance.total ? pct(attendance.rate) : '—', hint: attendance.total ? `${int(attendance.present)} حاضر · ${int(attendance.absent)} غائب` : undefined },
    { id: 'fees_due', label: 'أقساط مستحقة', value: money(dueAmount), hint: overdueCount ? `${int(overdueCount)} متأخرة` : undefined },
    { id: 'month_sales', label: 'تحصيلات الشهر', value: m ? money(m.monthSales) : DASH },
    { id: 'receivables', label: 'ديون العملاء', value: m ? money(m.totalReceivables) : DASH },
  ];
  if (todaySessions.length) {
    tiles.push({ id: 'sessions_today', label: 'حصص اليوم', value: int(todaySessions.length) });
  }
  if (newEnrollments > 0) {
    tiles.push({ id: 'new_enrollments', label: 'تسجيلات جديدة هذا الشهر', value: int(newEnrollments) });
  }

  return {
    kind: 'education',
    tiles,
    progress: attendance.total
      ? [{ label: 'حضور اليوم', percent: attendance.rate, caption: `${int(attendance.present)} حاضر · ${int(attendance.late)} متأخر · ${int(attendance.absent)} غائب من ${int(attendance.total)}` }]
      : [],
    sections: ([
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
      todaySessions.length
        ? {
            id: 'sessions_today',
            title: 'حصص اليوم',
            emptyText: 'لا توجد حصص اليوم.',
            rows: todaySessions.slice(0, 8).map((s) => ({
              label: s.className,
              value: `${s.startTime} – ${s.endTime}`,
              meta: s.room || undefined,
            })),
          }
        : null,
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
    ] as (ActivityListSection | null)[]).filter((s): s is ActivityListSection => s !== null),
  };
}

/* ─── Workshop ──────────────────────────────────────────────────────────── */

function buildWorkshop(m: Metrics | null, ctx: BuildContext): ActivityDashboardData {
  const svc = new WorkshopService();
  const stats = ctxSafe(ctx, 'إحصائيات الورشة', () => svc.getDashboardStats(), null);
  const orders = ctxSafe(ctx, 'أوامر العمل', () => svc.getWorkOrders(), [] as Awaited<ReturnType<WorkshopService['getWorkOrders']>>);

  const statusLabel: Record<string, string> = {
    RECEIVED: 'مستلمة', INSPECTION: 'فحص', WAITING_APPROVAL: 'بانتظار موافقة',
    APPROVED: 'معتمدة', IN_PROGRESS: 'قيد التنفيذ', READY: 'جاهزة', DELIVERED: 'مسلمة', CANCELLED: 'ملغاة',
  };
  const vehicleLabel = (o: (typeof orders)[number]) =>
    [o.vehicleMake, o.vehicleModel].filter(Boolean).join(' ') || 'مركبة'
      ? `${o.vehiclePlate} · ${[o.vehicleMake, o.vehicleModel].filter(Boolean).join(' ') || 'مركبة'}`
      : o.vehiclePlate || 'مركبة';

  const today = localDateString();
  const openOrdersList = orders.filter((o) => !['DELIVERED', 'CANCELLED'].includes(o.status));
  const overduePromised = openOrdersList.filter((o) => o.promisedDate && o.promisedDate < today);
  const readyOrders = orders.filter((o) => o.status === 'READY');
  const wipValue = orders
    .filter((o) => ['APPROVED', 'IN_PROGRESS', 'READY'].includes(o.status))
    .reduce((s, o) => s + num(o.grandTotal), 0);

  const tiles: ActivityTile[] = [
    { id: 'open', label: 'أوامر مفتوحة', value: stats ? int(stats.openOrders) : DASH },
    { id: 'in_progress', label: 'قيد التنفيذ', value: stats ? int(stats.inProgress) : DASH },
    { id: 'waiting', label: 'بانتظار موافقة العميل', value: stats ? int(stats.waitingApproval) : DASH },
    { id: 'ready', label: 'جاهزة للتسليم', value: stats ? int(stats.ready) : DASH },
    { id: 'delivered_month', label: 'مسلمة هذا الشهر', value: stats ? int(stats.deliveredThisMonth) : DASH },
    { id: 'revenue_month', label: 'إيراد الشهر', value: stats ? money(stats.revenueThisMonth) : DASH },
    { id: 'today_sales', label: 'مبيعات اليوم', value: m ? money(m.todaySales) : DASH },
  ];
  if (overduePromised.length) {
    tiles.push({
      id: 'overdue_promised',
      label: 'تجاوزت موعد التسليم',
      value: int(overduePromised.length),
      hint: money(overduePromised.reduce((s, o) => s + num(o.grandTotal), 0)),
    });
  }
  if (wipValue > 0) {
    tiles.push({ id: 'wip_value', label: 'قيمة أوامر قيد التنفيذ', value: money(wipValue) });
  }
  if (m?.lowStockCount != null) {
    tiles.push({ id: 'parts_low_stock', label: 'نواقص قطع الغيار', value: int(m.lowStockCount) });
  }
  if (m?.totalReceivables != null) {
    tiles.push({ id: 'receivables', label: 'ديون العملاء', value: money(m.totalReceivables) });
  }

  return {
    kind: 'workshop',
    tiles,
    progress: [],
    sections: ([
      {
        id: 'orders',
        title: 'أحدث أوامر العمل',
        emptyText: 'لا توجد أوامر عمل.',
        rows: orders.slice(0, 8).map((o) => ({
          label: o.orderNumber,
          value: vehicleLabel(o),
          meta: [
            statusLabel[o.status] ?? o.status,
            o.technicianName ? `فني: ${o.technicianName}` : null,
            o.promisedDate ? `موعد ${o.promisedDate}` : null,
          ].filter(Boolean).join(' · '),
        })),
      },
      overduePromised.length
        ? {
            id: 'overdue_promised',
            title: 'أوامر تجاوزت موعد التسليم',
            emptyText: 'كل الأوامر ضمن موعدها.',
            rows: overduePromised.slice(0, 6).map((o) => ({
              label: o.orderNumber,
              value: vehicleLabel(o),
              meta: `الموعد ${o.promisedDate} · ${o.customerName || 'عميل'}`,
            })),
          }
        : null,
      readyOrders.length
        ? {
            id: 'ready_orders',
            title: 'جاهزة للتسليم',
            emptyText: 'لا توجد أوامر جاهزة.',
            rows: readyOrders.slice(0, 6).map((o) => ({
              label: o.orderNumber,
              value: o.customerName || 'عميل',
              meta: `${money(o.grandTotal)}${o.promisedDate ? ` · ${o.promisedDate}` : ''}`,
            })),
          }
        : null,
    ] as (ActivityListSection | null)[]).filter((s): s is ActivityListSection => s !== null),
  };
}

/* ─── Manufacturing ─────────────────────────────────────────────────────── */

const PO_STATUS_LABEL: Record<string, string> = {
  PLANNED: 'مخطط', RELEASED: 'محرر', IN_PROGRESS: 'قيد التنفيذ', COMPLETED: 'مكتمل', CANCELLED: 'ملغى',
};

function buildManufacturing(m: Metrics | null, ctx: BuildContext): ActivityDashboardData {
  const svc = new ManufacturingService();
  const orders = ctxSafe(ctx, 'أوامر الإنتاج', () => svc.getProductionOrders(), [] as Awaited<ReturnType<ManufacturingService['getProductionOrders']>>);
  const wip = ctxSafe(ctx, 'تقييم المخزون تحت التصنيع', () => svc.getWipValuation(), null);
  const bomAlerts = ctxSafe(ctx, 'تنبيهات خامات BOM', () => svc.getBomStockAlerts(), [] as Awaited<ReturnType<ManufacturingService['getBomStockAlerts']>>);
  const purchaseSuggestions = ctxSafe(ctx, 'اقتراحات شراء الخامات', () => svc.getPurchaseSuggestions(), [] as Awaited<ReturnType<ManufacturingService['getPurchaseSuggestions']>>);
  const analytics = ctxSafe(ctx, 'تحليلات التصنيع', () => svc.getManufacturingAnalytics(), null);
  const floor = ctxSafe(ctx, 'أوامر أرضية الإنتاج', () => svc.getProductionFloor(), [] as Awaited<ReturnType<ManufacturingService['getProductionFloor']>>);

  const month = localDateString().slice(0, 7);
  const countBy = (s: string) => orders.filter((o) => o.status === s).length;
  const completedMonth = orders.filter((o) => o.status === 'COMPLETED' && (o.completedAt || '').startsWith(month)).length;
  const criticalMaterials = bomAlerts.filter((a) => a.severity === 'OUT').length;
  const activeFloorOrders = floor.filter((o) => o.status === 'IN_PROGRESS' || o.status === 'RELEASED');
  const efficiencyValues = (analytics?.workCenterEfficiency ?? []).map((w) => w.efficiencyPercent).filter((v): v is number => v != null);
  const avgEfficiency = efficiencyValues.length
    ? efficiencyValues.reduce((s, v) => s + v, 0) / efficiencyValues.length
    : null;

  const tiles: ActivityTile[] = [
    { id: 'planned', label: 'أوامر مخططة', value: int(countBy('PLANNED')) },
    { id: 'released', label: 'أوامر محررة', value: int(countBy('RELEASED')) },
    { id: 'in_progress', label: 'قيد التنفيذ', value: int(countBy('IN_PROGRESS')) },
    { id: 'completed_month', label: 'مكتملة هذا الشهر', value: int(completedMonth) },
    { id: 'wip', label: 'قيمة المخزون تحت التصنيع', value: wip ? money(wip.totalMaterialCost) : DASH, hint: wip ? `${int(wip.totalQuantity)} وحدة` : undefined },
    { id: 'today_purchases', label: 'مشتريات اليوم', value: m ? money(m.todayPurchases) : DASH },
    { id: 'low_stock', label: 'نواقص الخامات', value: m ? int(m.lowStockCount) : DASH },
  ];
  if (bomAlerts.length) {
    tiles.push({
      id: 'bom_alerts',
      label: 'خامات حرجة (BOM)',
      value: int(bomAlerts.length),
      hint: criticalMaterials > 0 ? `${int(criticalMaterials)} نافدة تمامًا` : undefined,
    });
  }
  if (purchaseSuggestions.length) {
    tiles.push({
      id: 'purchase_suggestions',
      label: 'خامات مطلوبة للشراء',
      value: int(purchaseSuggestions.length),
      hint: money(purchaseSuggestions.reduce((s, p) => s + num(p.estimatedValue), 0)),
    });
  }
  if (avgEfficiency != null) {
    tiles.push({ id: 'efficiency', label: 'كفاءة مراكز العمل', value: pct(avgEfficiency) });
  }

  const progress: ActivityProgress[] = [];
  if (analytics?.quality.yieldPercent != null) {
    progress.push({
      label: 'نسبة الإنتاج السليم',
      percent: analytics.quality.yieldPercent,
      caption: `${int(analytics.quality.acceptedQty)} مقبول · ${int(analytics.quality.rejectedQty)} مرفوض من ${int(analytics.quality.inspectedQty)}`,
    });
  }
  if (avgEfficiency != null) {
    progress.push({
      label: 'كفاءة مراكز العمل',
      percent: avgEfficiency,
      caption: `متوسط ${int(efficiencyValues.length)} مراكز`,
    });
  }

  return {
    kind: 'manufacturing',
    tiles,
    progress,
    sections: ([
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
      activeFloorOrders.length
        ? {
            id: 'floor',
            title: 'أوامر قيد التنفيذ على الأرضية',
            emptyText: 'لا توجد أوامر على الأرضية.',
            rows: activeFloorOrders.slice(0, 6).map((o) => ({
              label: o.orderNumber,
              value: o.productName || 'منتج',
              meta: `${int(o.producedQty ?? 0)} / ${int(o.quantity)}${o.dueDate ? ` · تسليم ${o.dueDate}` : ''}`,
            })),
          }
        : null,
      purchaseSuggestions.length
        ? {
            id: 'purchase_suggestions',
            title: 'اقتراحات شراء الخامات',
            emptyText: 'لا توجد خامات ناقصة.',
            rows: purchaseSuggestions.slice(0, 6).map((p) => ({
              label: p.componentName,
              value: `${int(p.suggestedQty)} وحدة · ${money(p.estimatedValue)}`,
              meta: `متاح ${int(p.availableQty)} · مطلوب ${int(p.totalRequiredQty)}`,
            })),
          }
        : null,
      bomAlerts.length
        ? {
            id: 'bom_alerts',
            title: 'خامات تحت حد الطلب (BOM)',
            emptyText: 'جميع الخامات فوق حدود الطلب.',
            rows: bomAlerts.slice(0, 6).map((a) => ({
              label: a.componentName,
              value: a.severity === 'OUT' ? 'نافد' : `متاح ${int(a.availableQty)}`,
              meta: a.usedBy.length ? `يُستخدم في ${int(a.usedBy.length)} تركيبة` : undefined,
            })),
          }
        : null,
      wip && wip.orders.length
        ? {
            id: 'wip_orders',
            title: 'أوامر تحت التصنيع',
            emptyText: 'لا توجد أوامر WIP.',
            rows: wip.orders.slice(0, 6).map((o) => ({
              label: o.orderNumber,
              value: o.productName || 'منتج',
              meta: `${money(o.materialCost)} · ${int(o.quantity)} وحدة`,
            })),
          }
        : null,
    ] as (ActivityListSection | null)[]).filter((s): s is ActivityListSection => s !== null),
  };
}

/* ─── Construction ──────────────────────────────────────────────────────── */

const PROJECT_STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'نشط', ON_HOLD: 'موقوف', PLANNED: 'مخطط', COMPLETED: 'مكتمل', CANCELLED: 'ملغى',
};

function buildConstruction(m: Metrics | null, ctx: BuildContext): ActivityDashboardData {
  const exec = new ProjectExecutionService();
  const portfolio = ctxSafe(ctx, 'ملخص المشاريع', () => exec.getPortfolioSummary(), [] as ReturnType<ProjectExecutionService['getPortfolioSummary']>);
  const certificates = ctxSafe(ctx, 'مستخلصات المشاريع', () => exec.getCertificatesAcrossProjects(), [] as ReturnType<ProjectExecutionService['getCertificatesAcrossProjects']>);
  const active = portfolio.filter((p) => p.status === 'ACTIVE');
  const overdue = portfolio.filter((p) => p.isOverdue);
  const pendingCertificates = certificates.filter((c) => c.status === 'SUBMITTED');
  const sum = (rows: typeof portfolio, key: 'contractValue' | 'certifiedAmount' | 'collectionGap' | 'actualCost') =>
    rows.reduce((s, p) => s + num((p as Record<string, unknown>)[key]), 0);

  const tiles: ActivityTile[] = [
    { id: 'active', label: 'مشاريع نشطة', value: int(active.length) },
    { id: 'overdue', label: 'مشاريع متأخرة', value: int(overdue.length) },
    { id: 'contract', label: 'إجمالي قيمة العقود', value: money(sum(portfolio, 'contractValue')) },
    { id: 'certified', label: 'إجمالي المستخلصات', value: money(sum(portfolio, 'certifiedAmount')) },
    { id: 'gap', label: 'فجوة التحصيل', value: money(sum(portfolio, 'collectionGap')) },
    { id: 'cost', label: 'التكلفة الفعلية', value: money(sum(portfolio, 'actualCost')) },
    { id: 'receivables', label: 'ديون العملاء', value: m ? money(m.totalReceivables) : DASH },
  ];
  if (pendingCertificates.length) {
    tiles.push({
      id: 'pending_certificates',
      label: 'مستخلصات بانتظار المراجعة',
      value: int(pendingCertificates.length),
      hint: money(pendingCertificates.reduce((s, c) => s + num(c.requested_amount), 0)),
    });
  }

  return {
    kind: 'construction',
    tiles,
    progress: [],
    sections: ([
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
      pendingCertificates.length
        ? {
            id: 'pending_certificates',
            title: 'مستخلصات مرسلة للمراجعة',
            emptyText: 'لا توجد مستخلصات بانتظار المراجعة.',
            rows: pendingCertificates.slice(0, 6).map((c) => ({
              label: c.certificate_number ?? 'مستخلص',
              value: c.projectName ?? 'مشروع',
              meta: `${money(num(c.requested_amount))}${c.certificate_date ? ` · ${c.certificate_date}` : ''}`,
            })),
          }
        : null,
    ] as (ActivityListSection | null)[]).filter((s): s is ActivityListSection => s !== null),
  };
}

/* ─── Professional services ─────────────────────────────────────────────── */

function buildProfessional(m: Metrics | null, ctx: BuildContext): ActivityDashboardData {
  const svc = new TimeBillingService();
  const unbilled = ctxSafe(ctx, 'السجلات غير المفوترة', () => svc.getUnbilledSummary(), null);
  const profitability = ctxSafe(ctx, 'ربحية العملاء', () => svc.getProfitability().slice(0, 5), [] as Awaited<ReturnType<TimeBillingService['getProfitability']>>);
  const entries = ctxSafe(ctx, 'سجلات الوقت', () => svc.getTimeEntries(), [] as Awaited<ReturnType<TimeBillingService['getTimeEntries']>>);
  const batches = ctxSafe(ctx, 'دفعات الفوترة', () => svc.getBatches(), [] as Awaited<ReturnType<TimeBillingService['getBatches']>>);

  const today = localDateString();
  const pendingApproval = entries.filter((e) => e.status === 'SUBMITTED');
  const todayMinutes = entries.filter((e) => e.entryDate === today).reduce((s, e) => s + num(e.minutes), 0);
  const openBatches = batches.filter((b) => b.status === 'OPEN');
  const batchesValue = openBatches.reduce((s, b) => s + num(b.totalAmount), 0);

  const tiles: ActivityTile[] = [
    { id: 'unbilled', label: 'سجلات غير مفوترة', value: unbilled ? int(unbilled.count) : DASH, hint: unbilled ? `${num(unbilled.hours).toFixed(1)} ساعة` : undefined },
    { id: 'unbilled_amount', label: 'قيمة غير مفوترة', value: unbilled ? money(unbilled.amount) : DASH },
    { id: 'month_sales', label: 'إيراد الشهر', value: m ? money(m.monthSales) : DASH },
    { id: 'net_profit', label: 'صافي الربح', value: m ? money(m.netProfit) : DASH },
    { id: 'receivables', label: 'ديون العملاء', value: m ? money(m.totalReceivables) : DASH },
  ];
  if (pendingApproval.length) {
    tiles.push({
      id: 'pending_approval',
      label: 'سجلات بانتظار الاعتماد',
      value: int(pendingApproval.length),
      hint: `${(todayMinutes / 60).toFixed(1)} ساعة اليوم`,
    });
  }
  if (openBatches.length) {
    tiles.push({
      id: 'open_batches',
      label: 'دفعات فوترة مفتوحة',
      value: int(openBatches.length),
      hint: money(batchesValue),
    });
  }

  return {
    kind: 'professional',
    tiles,
    progress: [],
    sections: ([
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
      pendingApproval.length
        ? {
            id: 'pending_approval',
            title: 'سجلات بانتظار الاعتماد',
            emptyText: 'لا توجد سجلات معلقة.',
            rows: pendingApproval.slice(0, 6).map((e) => ({
              label: e.customerName || e.projectName || 'عميل',
              value: `${num(e.hours).toFixed(1)} ساعة`,
              meta: `${e.employeeName || '—'} · ${money(e.amount)} · ${e.entryDate}`,
            })),
          }
        : null,
      openBatches.length
        ? {
            id: 'open_batches',
            title: 'دفعات فوترة جاهزة',
            emptyText: 'لا توجد دفعات مفتوحة.',
            rows: openBatches.slice(0, 6).map((b) => ({
              label: b.batchNumber,
              value: b.customerName || 'عميل',
              meta: `${money(b.totalAmount)} · ${int(b.itemCount)} سجل${b.periodStart ? ` · ${b.periodStart} ← ${b.periodEnd}` : ''}`,
            })),
          }
        : null,
    ] as (ActivityListSection | null)[]).filter((s): s is ActivityListSection => s !== null),
  };
}

/* ─── Shared analytics loaders (permission-safe: failures yield null/[]) ── */

type TopProduct = Awaited<ReturnType<AccountingService['getTopSellingProductsAsync']>>[number];
type TopCustomer = Awaited<ReturnType<AccountingService['getTopCustomersAsync']>>[number];
type RecentActivity = Awaited<ReturnType<AccountingService['getRecentActivitiesAsync']>>[number];
type MonthlyComparison = Awaited<ReturnType<AccountingService['getMonthlyComparisonAsync']>>;

async function loadSalesAnalytics(ctx: BuildContext): Promise<{
  topProducts: TopProduct[];
  topCustomers: TopCustomer[];
  recent: RecentActivity[];
  monthly: MonthlyComparison | null;
}> {
  const accounting = new AccountingService();
  const [topProducts, topCustomers, recent, monthly] = await Promise.all([
    ctxCatch(ctx, 'الأصناف الأكثر مبيعًا', accounting.getTopSellingProductsAsync(8), [] as TopProduct[]),
    ctxCatch(ctx, 'أكثر العملاء شراءً', accounting.getTopCustomersAsync(8), [] as TopCustomer[]),
    ctxCatch(ctx, 'آخر الحركات', accounting.getRecentActivitiesAsync(8), [] as RecentActivity[]),
    ctxCatch(ctx, 'مقارنة المبيعات الشهرية', accounting.getMonthlyComparisonAsync(), null as MonthlyComparison | null),
  ]);
  return { topProducts, topCustomers, recent, monthly };
}

function topProductsSection(products: TopProduct[]): ActivityListSection | null {
  if (!products.length) return null;
  return {
    id: 'top_products',
    title: 'الأصناف الأكثر مبيعًا (30 يوم)',
    emptyText: 'لا توجد مبيعات مسجلة بعد.',
    rows: products.map((p) => ({
      label: p.name,
      value: money(p.totalRevenue),
      meta: `${int(p.quantityM2)} ${getProductUnitLabel(p)}`,
    })),
  };
}

function topCustomersSection(customers: TopCustomer[]): ActivityListSection | null {
  if (!customers.length) return null;
  return {
    id: 'top_customers',
    title: 'أكثر العملاء شراءً',
    emptyText: 'لا توجد مبيعات مسجلة بعد.',
    rows: customers.map((c) => ({
      label: c.name,
      value: money(c.totalPurchases),
      meta: `${int(c.purchaseCount)} فاتورة`,
    })),
  };
}

function recentActivitySection(activities: RecentActivity[]): ActivityListSection | null {
  if (!activities.length) return null;
  const typeLabel: Record<string, string> = { sale: 'بيع', purchase: 'شراء', inventory: 'مخزون' };
  return {
    id: 'recent_activity',
    title: 'آخر الحركات',
    emptyText: 'لا توجد حركات حديثة.',
    rows: activities.map((a) => ({
      label: a.description,
      value: a.amount != null ? money(a.amount) : '—',
      meta: `${typeLabel[a.type] ?? a.type} · ${a.timestamp}`,
    })),
  };
}

/* ─── Distribution ──────────────────────────────────────────────────────── */

const DELIVERY_STATUS_LABEL: Record<string, string> = {
  PENDING: 'في الانتظار',
  SCHEDULED: 'مجدولة',
  IN_TRANSIT: 'في الطريق',
  DELIVERED: 'تم التسليم',
  FAILED: 'فشل التسليم',
  CANCELLED: 'ملغاة',
};

async function buildDistribution(m: Metrics | null, ctx: BuildContext): Promise<ActivityDashboardData> {
  const [analytics, extras] = await Promise.all([loadSalesAnalytics(ctx), loadGenericExtras(ctx)]);
  const { debts, expenses, payments } = extras;
  const ops = new OperationsService();
  const retail = new RetailWorkspaceService();

  const deliveries = ctxSafe(ctx, 'التوصيلات', () => ops.getDeliveries(), [] as Delivery[]);
  const retailStats = ctxSafe(ctx, 'إحصائيات المبيعات', () => retail.getStats(), null);
  const lowStock = ctxSafe(ctx, 'نواقص المخزون', () => retail.getLowStockRows(6), null as Awaited<ReturnType<RetailWorkspaceService['getLowStockRows']>> | null);
  const openOrders = ctxSafe(ctx, 'الطلبات المفتوحة', () => retail.getOpenOrders(6), null as Awaited<ReturnType<RetailWorkspaceService['getOpenOrders']>> | null);

  const today = localDateString();
  const pendingDeliveries = deliveries.filter((d) => ['PENDING', 'SCHEDULED', 'IN_TRANSIT'].includes(d.status));
  const deliveredToday = deliveries.filter((d) => d.status === 'DELIVERED' && d.date === today).length;
  const deliveredTotal = deliveries.filter((d) => d.status === 'DELIVERED').length;
  const failedTotal = deliveries.filter((d) => d.status === 'FAILED').length;
  const deliverySuccessRate = deliveredTotal + failedTotal > 0
    ? (deliveredTotal / (deliveredTotal + failedTotal)) * 100
    : null;

  const receivableDebts = debts.filter((d) => d.type === 'CUSTOMER_RECEIVABLE');
  const overdueDebts = receivableDebts.filter((d) => d.overdue || (d.daysOverdue ?? 0) > 0);
  const overdueAmount = overdueDebts.reduce((s, d) => s + num(d.amount), 0);
  const totalReceivable = receivableDebts.reduce((s, d) => s + num(d.amount), 0);

  const tiles: ActivityTile[] = [
    { id: 'month_sales', label: 'مبيعات الشهر', value: m ? money(m.monthSales) : DASH },
    { id: 'today_sales', label: 'مبيعات اليوم', value: m ? money(m.todaySales) : DASH },
    { id: 'today_purchases', label: 'مشتريات اليوم', value: m ? money(m.todayPurchases) : DASH },
    { id: 'inventory', label: 'قيمة المخزون (تكلفة)', value: m?.inventoryValuationCost != null ? money(m.inventoryValuationCost) : DASH,
      hint: m?.inventoryValuationSale != null ? `بالبيع: ${money(m.inventoryValuationSale)}` : undefined },
    { id: 'low_stock', label: 'أصناف منخفضة', value: m ? int(m.lowStockCount) : DASH },
    { id: 'out_of_stock', label: 'أصناف نافدة', value: m ? int(m.outOfStockCount) : DASH },
    { id: 'receivables', label: 'ديون العملاء', value: m ? money(m.totalReceivables) : DASH },
    { id: 'payables', label: 'مستحقات الموردين', value: m ? money(m.totalPayables) : DASH },
    { id: 'net_profit', label: 'صافي الربح', value: m ? money(m.netProfit) : DASH },
  ];
  if (m?.topCustomer) {
    tiles.push({ id: 'top_customer', label: 'أعلى عميل', value: m.topCustomer.name, hint: money(m.topCustomer.totalPurchases) });
  }
  if (retailStats) {
    tiles.push({ id: 'open_orders', label: 'طلبات مفتوحة', value: int(retailStats.openOrders) });
  }
  if (deliveries.length) {
    tiles.push(
      { id: 'deliveries_pending', label: 'توصيلات جارية', value: int(pendingDeliveries.length) },
      { id: 'deliveries_today', label: 'سُلّمت اليوم', value: int(deliveredToday) },
    );
  }
  if (deliverySuccessRate != null) {
    tiles.push({
      id: 'delivery_success',
      label: 'نسبة نجاح التوصيل',
      value: pct(deliverySuccessRate),
      hint: `${int(deliveredTotal)} ناجحة · ${int(failedTotal)} فاشلة`,
    });
  }
  if (debts.length) {
    tiles.push({
      id: 'overdue_debts',
      label: 'ديون متأخرة',
      value: int(overdueDebts.length),
      hint: overdueAmount > 0 ? money(overdueAmount) : undefined,
    });
  }
  if (expenses) {
    tiles.push({ id: 'month_expenses', label: 'مصروفات الشهر', value: money(expenses.totalExpenses) });
  }

  const progress: ActivityProgress[] = [];
  if (m && m.profitMargin > 0) {
    progress.push({ label: 'هامش الربح', percent: m.profitMargin, caption: `صافي ربح ${money(m.netProfit)}` });
  }
  if (m && m.salesGrowthRate != null && m.salesGrowthRate !== 0) {
    progress.push({
      label: 'نمو المبيعات عن الشهر السابق',
      percent: Math.max(0, m.salesGrowthRate),
      caption: `الشهر السابق: ${money(m.previousMonthSales)}`,
    });
  }
  if (deliverySuccessRate != null) {
    progress.push({
      label: 'نجاح التوصيل',
      percent: deliverySuccessRate,
      caption: `${int(deliveredTotal)} مسلّمة · ${int(failedTotal)} فاشلة من ${int(deliveredTotal + failedTotal)}`,
    });
  }
  if (totalReceivable > 0 && overdueAmount > 0) {
    progress.push({
      label: 'نسبة الديون المتأخرة',
      percent: (overdueAmount / totalReceivable) * 100,
      caption: `${int(overdueDebts.length)} عميل متأخر · ${money(overdueAmount)}`,
    });
  }

  const sections: ActivityListSection[] = [
    topProductsSection(analytics.topProducts),
    topCustomersSection(analytics.topCustomers),
    recentActivitySection(analytics.recent),
    openOrders && openOrders.length
      ? {
          id: 'open_orders',
          title: 'أحدث الطلبات المفتوحة',
          emptyText: 'لا توجد طلبات مفتوحة.',
          rows: openOrders.map((o) => ({ label: o.orderNumber, value: o.customerName || 'عميل نقدي', meta: o.status })),
        }
      : null,
    lowStock && lowStock.length
      ? {
          id: 'low_stock',
          title: 'نواقص المخزون',
          emptyText: 'المخزون في مستوى آمن.',
          rows: lowStock.map((r) => ({ label: r.name, value: `${int(r.stockQty)} متاح`, meta: `الحد الأدنى ${int(r.minStockLevel)}` })),
        }
      : null,
    deliveries.length
      ? {
          id: 'deliveries',
          title: 'أحدث التوصيلات',
          emptyText: 'لا توجد توصيلات مسجلة.',
          rows: deliveries.slice(0, 8).map((d) => ({
            label: d.deliveryNumber,
            value: (d as { customer_name?: string }).customer_name || 'عميل',
            meta: `${DELIVERY_STATUS_LABEL[d.status] ?? d.status}${d.deliveryFee ? ` · ${money(d.deliveryFee)}` : ''}`,
          })),
        }
      : null,
    debtAgingRows(receivableDebts),
    topDebtorsSection(receivableDebts),
    expenseCategoriesSection(expenses),
    paymentMethodsSection(payments),
  ].filter((s): s is ActivityListSection => s !== null);

  return { kind: 'distribution', tiles, progress, sections };
}

type PaymentMixItem = Awaited<ReturnType<AccountingService['getPaymentMethodDistributionAsync']>>[number];
type ExpenseReport = Awaited<ReturnType<AccountingService['getExpenseReportAsync']>>;

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: 'نقدي', CARD: 'بطاقة', BANK_TRANSFER: 'تحويل بنكي', CHECK: 'شيك', VOUCHER: 'قسيمة',
};

/**
 * Extra generic-dashboard sources, each gated by its own permission so a
 * missing grant simply omits that section instead of failing the dashboard.
 */
async function loadGenericExtras(ctx: BuildContext): Promise<{
  debts: DebtRow[];
  expenses: ExpenseReport | null;
  payments: PaymentMixItem[];
}> {
  const accounting = new AccountingService();
  const actor = AuthService.getCurrentUser();
  const canDebts = PermissionService.can(actor, 'finance.debts.view');
  const canFinance = PermissionService.can(actor, 'finance.view', '/finance');
  const canSales = PermissionService.can(actor, 'sales.view', '/sales');
  const monthStart = `${localDateString().slice(0, 7)}-01`;
  const today = localDateString();

  const [debts, expenses, payments] = await Promise.all([
    canDebts
      ? ctxCatch(ctx, 'الديون والذمم', new DebtService().getDebtsAsync(), [] as DebtRow[])
      : Promise.resolve([] as DebtRow[]),
    canFinance
      ? ctxCatch(ctx, 'تقرير المصروفات', accounting.getExpenseReportAsync(monthStart, today), null as ExpenseReport | null)
      : Promise.resolve(null as ExpenseReport | null),
    canFinance && canSales
      ? ctxCatch(ctx, 'وسائل الدفع', accounting.getPaymentMethodDistributionAsync(), [] as PaymentMixItem[])
      : Promise.resolve([] as PaymentMixItem[]),
  ]);
  return { debts, expenses, payments };
}

function topDebtorsSection(debts: DebtRow[]): ActivityListSection | null {
  if (!debts.length) return null;
  const top = debts.slice().sort((a, b) => num(b.amount) - num(a.amount)).slice(0, 6);
  return {
    id: 'top_debtors',
    title: 'أكبر المدينين',
    emptyText: 'لا توجد ديون قائمة.',
    rows: top.map((d) => ({
      label: d.name,
      value: money(d.amount),
      meta: (d.daysOverdue ?? 0) > 0 ? `متأخر ${int(d.daysOverdue)} يوم` : 'غير متأخر',
    })),
  };
}

function expenseCategoriesSection(expenses: ExpenseReport | null): ActivityListSection | null {
  if (!expenses || !expenses.byCategory.length) return null;
  return {
    id: 'expense_categories',
    title: 'المصروفات حسب الفئة (الشهر)',
    emptyText: 'لا توجد مصروفات مسجلة.',
    rows: expenses.byCategory.slice(0, 6).map((c) => ({
      label: c.category,
      value: money(c.total),
      meta: expenses.totalExpenses > 0 ? pct((c.total / expenses.totalExpenses) * 100) : undefined,
    })),
  };
}

function paymentMethodsSection(payments: PaymentMixItem[]): ActivityListSection | null {
  if (!payments.length) return null;
  return {
    id: 'payment_methods',
    title: 'تحصيلات الشهر حسب وسيلة الدفع',
    emptyText: 'لا توجد تحصيلات مسجلة.',
    rows: payments.slice(0, 6).map((p) => ({
      label: PAYMENT_METHOD_LABEL[p.method] ?? p.method,
      value: money(p.totalAmount),
      meta: `${int(p.count)} عملية`,
    })),
  };
}

function debtAgingRows(debts: DebtRow[]): ActivityListSection | null {
  const buckets = [
    { label: 'غير متأخرة', test: (d: number) => d <= 0 },
    { label: 'متأخرة 1–30 يوم', test: (d: number) => d > 0 && d <= 30 },
    { label: 'متأخرة 31–60 يوم', test: (d: number) => d > 30 && d <= 60 },
    { label: 'متأخرة 61–90 يوم', test: (d: number) => d > 60 && d <= 90 },
    { label: 'متأخرة أكثر من 90 يوم', test: (d: number) => d > 90 },
  ];
  const rows = buckets.map((b) => {
    const matches = debts.filter((d) => b.test(d.daysOverdue ?? 0));
    return { label: b.label, value: money(matches.reduce((s, d) => s + num(d.amount), 0)), meta: `${int(matches.length)} عميل` };
  });
  if (!debts.length || rows.every((r) => r.meta.startsWith('0'))) return null;
  return { id: 'debt_aging', title: 'أعمار ديون العملاء', emptyText: 'لا توجد ديون قائمة.', rows };
}

/* ─── Generic ───────────────────────────────────────────────────────────── */

async function buildGeneric(m: Metrics | null, ctx: BuildContext): Promise<ActivityDashboardData> {
  const [analytics, extras] = await Promise.all([loadSalesAnalytics(ctx), loadGenericExtras(ctx)]);
  const { debts, expenses, payments } = extras;

  const receivableDebts = debts.filter((d) => d.type === 'CUSTOMER_RECEIVABLE');
  const overdueDebts = receivableDebts.filter((d) => d.overdue || (d.daysOverdue ?? 0) > 0);
  const overdueAmount = overdueDebts.reduce((s, d) => s + num(d.amount), 0);
  const totalReceivable = receivableDebts.reduce((s, d) => s + num(d.amount), 0);

  const tiles = genericTiles(m, [
    { id: 'today_purchases', label: 'مشتريات اليوم', value: m ? money(m.todayPurchases) : DASH },
    { id: 'payables', label: 'مستحقات الموردين', value: m ? money(m.totalPayables) : DASH },
    { id: 'out_of_stock', label: 'أصناف نافدة', value: m ? int(m.outOfStockCount) : DASH },
  ]);
  if (m) {
    if (m.inventoryValuationSale != null) {
      tiles.push({ id: 'inventory_sale', label: 'قيمة المخزون (بيع)', value: money(m.inventoryValuationSale) });
    }
    if (m.averageOrderValue != null && m.averageOrderValue > 0) {
      tiles.push({ id: 'avg_order', label: 'متوسط الفاتورة', value: money(m.averageOrderValue) });
    }
    if (m.urgentDebtsCount != null && m.urgentDebtsCount > 0) {
      tiles.push({ id: 'urgent_debts', label: 'ديون متأخرة', value: int(m.urgentDebtsCount) });
    }
    if (m.topCustomer) {
      tiles.push({ id: 'top_customer', label: 'أعلى عميل', value: m.topCustomer.name, hint: money(m.topCustomer.totalPurchases) });
    }
  }
  if (debts.length) {
    tiles.push({
      id: 'overdue_debts',
      label: 'ديون متأخرة',
      value: int(overdueDebts.length),
      hint: overdueAmount > 0 ? money(overdueAmount) : undefined,
    });
  }
  if (expenses) {
    tiles.push({ id: 'month_expenses', label: 'مصروفات الشهر', value: money(expenses.totalExpenses) });
  }

  const progress: ActivityProgress[] = [];
  if (m && m.profitMargin > 0) {
    progress.push({ label: 'هامش الربح', percent: m.profitMargin, caption: `صافي ربح ${money(m.netProfit)}` });
  }
  if (analytics.monthly?.salesGrowth != null && analytics.monthly.salesGrowth !== 0) {
    progress.push({
      label: 'نمو المبيعات عن الشهر السابق',
      percent: Math.max(0, analytics.monthly.salesGrowth),
      caption: `فواتير الشهر: ${int(analytics.monthly.currentMonth.invoices)}`,
    });
  }
  if (totalReceivable > 0 && overdueAmount > 0) {
    progress.push({
      label: 'نسبة الديون المتأخرة',
      percent: (overdueAmount / totalReceivable) * 100,
      caption: `${int(overdueDebts.length)} عميل متأخر · ${money(overdueAmount)}`,
    });
  }

  const sections = [
    topProductsSection(analytics.topProducts),
    topCustomersSection(analytics.topCustomers),
    recentActivitySection(analytics.recent),
    debtAgingRows(receivableDebts),
    topDebtorsSection(receivableDebts),
    expenseCategoriesSection(expenses),
    paymentMethodsSection(payments),
  ].filter((s): s is ActivityListSection => s !== null);

  return { kind: 'generic', tiles, progress, sections };
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
      const ctx: BuildContext = { warnings: [] };

      const data = await (async (): Promise<ActivityDashboardData> => {
        switch (kind) {
          case 'ceramics': return buildCeramics(ctx);
          case 'hospitality': return buildHospitality(metrics, ctx);
          case 'education': return buildEducation(metrics, ctx);
          case 'workshop': return buildWorkshop(metrics, ctx);
          case 'manufacturing': return buildManufacturing(metrics, ctx);
          case 'construction': return buildConstruction(metrics, ctx);
          case 'professional': return buildProfessional(metrics, ctx);
          case 'distribution': return buildDistribution(metrics, ctx);
          case 'retail': return buildRetail(metrics, ctx, businessType);
          default: return buildGeneric(metrics, ctx);
        }
      })();

      return ctx.warnings.length ? { ...data, warnings: ctx.warnings } : data;
    } finally {
      restoreBranch?.();
    }
  }
}
