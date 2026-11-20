import React from 'react';
import { DataTable } from '../../components/ui/DataTable';
import {
  ScrollText,
  Search,
  Download,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Info,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Filter,
  Eye,
  X,
  Lock,
} from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import { centralPlatformClient } from '../../services/domains/platform/CentralPlatformClient';
import type { PlatformAuditEvent } from '../../services/domains/platform/PlatformAdminApiClient';
import { getCentralDataSourceState } from '../../hooks/platform/useCentralDataSource';
import type {
  PlatformAuditEntry,
  AuditSeverity,
  AuditStatus,
  AuditActorType,
  PlatformAuditFilters,
  PlatformTenant,
} from '../../services/domains/platform/platformTypes';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/PageHeader';
import {
  EmptyState,
  downloadCsv,
  formatDateTime,
  inputClass,
} from './components/PlatformUI';

const ENTITY_LABELS: Record<string, string> = {
  TENANT: 'عميل',
  PLAN: 'خطة',
  LICENSE: 'ترخيص',
  INVOICE: 'فاتورة',
  PAYMENT: 'دفعة',
  MODULE: 'وحدة',
  FEATURE: 'ميزة',
  RELEASE: 'إصدار',
  SETTINGS: 'إعدادات',
  USER: 'مستخدم',
  ACTIVATION: 'تفعيل',
  DEVICE: 'جهاز',
  API_KEY: 'مفتاح API',
};

const SEVERITY_BADGES: Record<AuditSeverity, { bg: string; text: string; label: string; icon: React.ReactNode }> = {
  INFO: { bg: 'bg-accent-soft', text: 'text-primary border-accent-border', label: 'معلومات', icon: <Info className="h-3 w-3" /> },
  NOTICE: { bg: 'bg-surface-sunken', text: 'text-ink border-line-strong', label: 'ملاحظة', icon: <Info className="h-3 w-3" /> },
  WARNING: { bg: 'bg-warning-soft', text: 'text-warning border-warning-border', label: 'تحذير', icon: <AlertTriangle className="h-3 w-3" /> },
  SECURITY: { bg: 'bg-accent-soft', text: 'text-primary border-accent-border', label: 'أمني', icon: <ShieldAlert className="h-3 w-3" /> },
  CRITICAL: { bg: 'bg-danger-soft', text: 'text-danger border-danger-border', label: 'حرج', icon: <XCircle className="h-3 w-3" /> },
};

const ACTOR_LABELS: Record<AuditActorType, string> = {
  SUPER_ADMIN: 'مسؤول المنصة',
  TENANT_ADMIN: 'مدير العميل',
  DEVICE: 'جهاز / نقطة بيع',
  API_CLIENT: 'خدمة برمجية API',
  SYSTEM: 'النظام الآلي',
};

const CENTRAL_ACTOR_LABELS: Record<string, string> = {
  PLATFORM: 'مسؤول المنصة',
  TENANT: 'مستخدم عميل',
  SYSTEM: 'النظام',
};

const CENTRAL_ACTOR_TO_LOCAL: Record<string, AuditActorType> = {
  PLATFORM: 'SUPER_ADMIN',
  TENANT: 'TENANT_ADMIN',
  SYSTEM: 'SYSTEM',
};

const LOCAL_ACTOR_TO_CENTRAL: Record<string, string> = {
  SUPER_ADMIN: 'PLATFORM',
  TENANT_ADMIN: 'TENANT',
  SYSTEM: 'SYSTEM',
};

/** Adapt a central audit-chain event to the shape this page renders. */
function mapCentralAuditEntry(event: PlatformAuditEvent): PlatformAuditEntry {
  return {
    id: event.id,
    actorId: event.actorId,
    actorName: event.actorName,
    actorType: CENTRAL_ACTOR_TO_LOCAL[event.actorType] ?? 'SYSTEM',
    tenantId: event.tenantId,
    action: event.action,
    entityType: event.resourceType ?? '',
    entityId: event.resourceId,
    // Central chain events carry no severity/status — they are integrity
    // records, not outcomes. Local-only fields stay at neutral defaults.
    severity: 'INFO' as AuditSeverity,
    status: 'SUCCESS' as AuditStatus,
    details: null,
    oldValues: event.beforeData,
    newValues: event.afterData,
    ipAddress: event.ipAddress,
    userAgent: event.userAgent,
    prevHash: event.prevHash,
    recordHash: event.recordHash,
    createdAt: event.createdAt,
  };
}

function formatJsonBlock(str?: string | null): string {
  if (!str) return '—';
  try {
    const parsed = typeof str === 'string' ? JSON.parse(str) : str;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return str;
  }
}

export const PlatformAuditPage: React.FC = () => {
  const [entries, setEntries] = React.useState<PlatformAuditEntry[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const [totalPages, setTotalPages] = React.useState(1);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Filters state
  const [search, setSearch] = React.useState('');
  const [tenantId, setTenantId] = React.useState('');
  const [severity, setSeverity] = React.useState<AuditSeverity | 'all'>('all');
  const [status, setStatus] = React.useState<AuditStatus | 'all'>('all');
  const [actorType, setActorType] = React.useState<AuditActorType | 'all'>('all');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');

  const [tenants, setTenants] = React.useState<PlatformTenant[]>([]);
  const tenantsLoadedRef = React.useRef(false);
  const [centralMode, setCentralMode] = React.useState(false);
  const [integrityState, setIntegrityState] = React.useState<{ checked: boolean; valid: boolean; count?: number }>({
    checked: false,
    valid: true,
  });

  // Selected entry for modal view (Diff & details)
  const [selectedEntry, setSelectedEntry] = React.useState<PlatformAuditEntry | null>(null);

  // Close the detail modal on Escape.
  React.useEffect(() => {
    if (!selectedEntry) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedEntry(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedEntry]);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const central = getCentralDataSourceState();
      setCentralMode(central.active);
      if (central.misconfigured) {
        throw new Error('مصدر البيانات مضبوط على «المركزي» لكن جسر الاتصال بالسيرفر غير متاح في هذا الإصدار.');
      }

      if (central.active) {
        const res = await centralPlatformClient.listAuditEvents({
          q: search.trim() || undefined,
          tenantId: tenantId || undefined,
          actorType: actorType !== 'all' ? LOCAL_ACTOR_TO_CENTRAL[actorType] : undefined,
          from: dateFrom || undefined,
          to: dateTo ? `${dateTo}T23:59:59.999Z` : undefined,
          page,
          limit: pageSize,
        });
        setEntries(res.data.map(mapCentralAuditEntry));
        setTotal(res.meta.total);
        setTotalPages(Math.max(1, Math.ceil(res.meta.total / res.meta.limit)));
      } else {
        const filters: PlatformAuditFilters = {
          search: search.trim() || undefined,
          tenantId: tenantId || undefined,
          severity: severity !== 'all' ? severity : undefined,
          status: status !== 'all' ? status : undefined,
          actorType: actorType !== 'all' ? actorType : undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          page,
          pageSize,
        };

        const res = platformAdminService.queryAuditPaginated(filters);
        setEntries(res.entries);
        setTotal(res.total);
        setTotalPages(res.totalPages);
      }

      if (!tenantsLoadedRef.current) {
        const tenantList = central.active
          ? await centralPlatformClient.listTenants()
          : platformAdminService.listTenants();
        setTenants(tenantList);
        tenantsLoadedRef.current = true;
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر استرجاع سجل العمليات.');
    } finally {
      setLoading(false);
    }
  }, [search, tenantId, severity, status, actorType, dateFrom, dateTo, page, pageSize]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleVerifyIntegrity = async () => {
    const central = getCentralDataSourceState();
    if (central.misconfigured) {
      setError('مصدر البيانات مضبوط على «المركزي» لكن جسر الاتصال بالسيرفر غير متاح في هذا الإصدار.');
      return;
    }
    if (central.active) {
      try {
        const check = await centralPlatformClient.verifyAuditChain();
        setIntegrityState({ checked: true, valid: check.isValid, count: check.checkedCount });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'تعذر فحص البصمة التشفيرية للسجلات.');
      }
      return;
    }
    try {
      const check = platformAdminService.verifyAuditIntegrity();
      setIntegrityState({ checked: true, valid: check.isValid, count: check.checkedCount });
    } catch (err) {
      setError('تعذر فحص البصمة التشفيرية للسجلات.');
    }
  };

  const handleFullExport = async () => {
    const central = getCentralDataSourceState();
    if (central.misconfigured) {
      setError('مصدر البيانات مضبوط على «المركزي» لكن جسر الاتصال بالسيرفر غير متاح في هذا الإصدار.');
      return;
    }
    try {
      let allMatching: PlatformAuditEntry[];
      if (central.active) {
        // Page through the central endpoint (max 200 rows per request).
        const collected: PlatformAuditEntry[] = [];
        let currentPage = 1;
        for (;;) {
          const res = await centralPlatformClient.listAuditEvents({
            q: search.trim() || undefined,
            tenantId: tenantId || undefined,
            actorType: actorType !== 'all' ? LOCAL_ACTOR_TO_CENTRAL[actorType] : undefined,
            from: dateFrom || undefined,
            to: dateTo ? `${dateTo}T23:59:59.999Z` : undefined,
            page: currentPage,
            limit: 200,
          });
          collected.push(...res.data.map(mapCentralAuditEntry));
          if (collected.length >= res.meta.total || res.data.length === 0) break;
          currentPage += 1;
        }
        allMatching = collected;
      } else {
        allMatching = platformAdminService.queryAuditForExport({
          search: search.trim() || undefined,
          tenantId: tenantId || undefined,
          severity: severity !== 'all' ? severity : undefined,
          status: status !== 'all' ? status : undefined,
          actorType: actorType !== 'all' ? actorType : undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        });
      }

      downloadCsv('platform-central-audit-full.csv', [
        [
          'المعرف',
          'التاريخ',
          'الخطورة',
          'الحالة',
          'نوع المنفذ',
          'اسم المنفذ',
          'معرف العميل',
          'الإجراء',
          'نوع الكيان',
          'معرف الكيان',
          'الجهاز',
          'عنوان IP',
          'التفاصيل',
          'القيمة السابقة',
          'القيمة الجديدة',
          'بصمة التحقق (SHA-256)',
        ],
        ...allMatching.map((e) => [
          e.id,
          e.createdAt,
          e.severity,
          e.status,
          ACTOR_LABELS[e.actorType || 'SUPER_ADMIN'] || e.actorType,
          e.actorName || '',
          e.tenantId || '',
          e.action,
          ENTITY_LABELS[e.entityType] || e.entityType,
          e.entityId || '',
          e.deviceName || e.deviceId || '',
          e.ipAddress || '',
          e.details || '',
          e.oldValues || '',
          e.newValues || '',
          e.recordHash || '',
        ]),
      ]);
    } catch (err) {
      setError(err instanceof Error ? `فشل تصدير السجلات بالكامل: ${err.message}` : 'فشل تصدير السجلات بالكامل.');
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="سجل العمليات المركزي — Central Audit Trail"
        description="سجل موحد، مشفر بتسلسل SHA-256 وغير قابل للتعديل لتتبع عمليات الإدارة، العملاء، الأجهزة وواجهات API."
        icon={<ScrollText className="h-5 w-5 text-primary" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={
                integrityState.checked ? (
                  integrityState.valid ? (
                    <ShieldCheck className="h-4 w-4 text-success" />
                  ) : (
                    <ShieldAlert className="h-4 w-4 text-danger" />
                  )
                ) : (
                  <Lock className="h-4 w-4 text-muted" />
                )
              }
              onClick={() => void handleVerifyIntegrity()}
            >
              {integrityState.checked
                ? integrityState.valid
                  ? `السجلات موثوقة ومحمية (${integrityState.count})`
                  : 'تم اكتشاف تلاعب في السجل!'
                : 'فحص سلامة التشفير'}
            </Button>
            <Button variant="ghost" size="sm" leadingIcon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => void loadData()}>
              تحديث
            </Button>
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={<Download className="h-3.5 w-3.5 text-ink-secondary" />}
              onClick={() => void handleFullExport()}
            >
              تصدير شامل ({total})
            </Button>
          </div>
        }
      />

      {/* Advanced Filter Toolbar */}
      <div className="rounded-xl border border-line bg-surface p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="ابحث في الإجراء، التفاصيل، المنفذ، الجهاز، أو العنوان..."
              className={`${inputClass} pr-9`}
            />
          </div>

          <select
            value={tenantId}
            onChange={(e) => {
              setTenantId(e.target.value);
              setPage(1);
            }}
            className={`${inputClass} max-w-[180px]`}
          >
            <option value="">كل العملاء</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.code})
              </option>
            ))}
          </select>

          {!centralMode && (
            <>
              <select
                value={severity}
                onChange={(e) => {
                  setSeverity(e.target.value as AuditSeverity | 'all');
                  setPage(1);
                }}
                className={`${inputClass} max-w-[140px]`}
              >
                <option value="all">كل مستويات الخطورة</option>
                <option value="INFO">معلومات (INFO)</option>
                <option value="WARNING">تحذير (WARNING)</option>
                <option value="SECURITY">أمني (SECURITY)</option>
                <option value="CRITICAL">حرج (CRITICAL)</option>
              </select>

              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as AuditStatus | 'all');
                  setPage(1);
                }}
                className={`${inputClass} max-w-[130px]`}
              >
                <option value="all">كل النتائج</option>
                <option value="SUCCESS">ناجحة</option>
                <option value="FAILURE">فاشلة</option>
                <option value="BLOCKED">محظورة</option>
              </select>
            </>
          )}

          <select
            value={actorType}
            onChange={(e) => {
              setActorType(e.target.value as AuditActorType | 'all');
              setPage(1);
            }}
            className={`${inputClass} max-w-[150px]`}
          >
            <option value="all">كل المنفذين</option>
            {centralMode ? (
              <>
                <option value="SUPER_ADMIN">{CENTRAL_ACTOR_LABELS.PLATFORM}</option>
                <option value="TENANT_ADMIN">{CENTRAL_ACTOR_LABELS.TENANT}</option>
                <option value="SYSTEM">{CENTRAL_ACTOR_LABELS.SYSTEM}</option>
              </>
            ) : (
              <>
                <option value="SUPER_ADMIN">مسؤول المنصة</option>
                <option value="TENANT_ADMIN">مدير العميل</option>
                <option value="DEVICE">جهاز / POS</option>
                <option value="API_CLIENT">واجهة API</option>
                <option value="SYSTEM">النظام</option>
              </>
            )}
          </select>
        </div>

        {/* Date Filters Row */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-line text-xs">
          <span className="flex items-center gap-1 font-semibold text-muted">
            <Filter className="h-3.5 w-3.5" /> الفترة:
          </span>
          <div className="flex items-center gap-2">
            <span className="text-muted">من:</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              className={`${inputClass} !py-1 text-xs`}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted">إلى:</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              className={`${inputClass} !py-1 text-xs`}
            />
          </div>
          {(search || tenantId || severity !== 'all' || status !== 'all' || actorType !== 'all' || dateFrom || dateTo) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('');
                setTenantId('');
                setSeverity('all');
                setStatus('all');
                setActorType('all');
                setDateFrom('');
                setDateTo('');
                setPage(1);
              }}
              className="text-xs text-danger hover:text-danger"
            >
              إلغاء الفلاتر
            </Button>
          )}
          <span className="mr-auto font-medium text-muted">
            إجمالي السجلات: <strong className="text-ink">{total}</strong>
          </span>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-danger-border bg-danger-soft px-4 py-2.5 text-xs font-semibold text-danger">
          {error}
        </div>
      )}

      {/* Main Audit Table */}
      <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
        {loading ? (
          <div className="py-20 text-center text-sm font-semibold text-muted">جارٍ تحميل سجل العمليات...</div>
        ) : entries.length === 0 ? (
          <EmptyState
            icon={<ScrollText className="h-6 w-6 text-muted" />}
            title="لا توجد عمليات مطابقة"
            description="لم يتم العثور على أي نشاط يطابق معايير الفلترة المحددة."
          />
        ) : (
          <div className="overflow-x-auto">
            <DataTable
              ariaLabel="سجل التدقيق"
              rows={entries}
              rowKey={(entry) => String(entry.id)}
              dense
              tableClassName="text-xs"
              rowClassName={() => 'transition-colors hover:bg-surface-muted/70'}
              columns={[
                { key: 'time', header: 'الوقت والتاريخ', render: (entry) => <span className="whitespace-nowrap font-mono text-muted" dir="ltr">{formatDateTime(entry.createdAt)}</span> },
                ...(!centralMode ? [{
                  key: 'severity', header: 'مستوى الخطورة',
                  render: (entry: PlatformAuditEntry) => {
                    const badge = SEVERITY_BADGES[entry.severity as keyof typeof SEVERITY_BADGES] || SEVERITY_BADGES.INFO;
                    return (
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${badge.bg} ${badge.text}`}>
                        {badge.icon}
                        {badge.label}
                      </span>
                    );
                  },
                }] : []),
                ...(!centralMode ? [{
                  key: 'result', header: 'النتيجة',
                  render: (entry: PlatformAuditEntry) => entry.status === 'SUCCESS' ? (
                    <span className="inline-flex items-center gap-1 font-medium text-success"><CheckCircle2 className="h-3.5 w-3.5" /> ناجح</span>
                  ) : entry.status === 'BLOCKED' ? (
                    <span className="inline-flex items-center gap-1 font-medium text-primary"><Lock className="h-3.5 w-3.5" /> محظور</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 font-medium text-danger"><XCircle className="h-3.5 w-3.5" /> فاشل</span>
                  ),
                }] : []),
                {
                  key: 'actor', header: 'المنفذ',
                  render: (entry) => (
                    <span className="block">
                      <span className="block font-semibold text-ink">{entry.actorName || 'النظام'}</span>
                      <span className="block text-[10px] text-muted">{ACTOR_LABELS[(entry.actorType || 'SUPER_ADMIN') as keyof typeof ACTOR_LABELS]}</span>
                    </span>
                  ),
                },
                {
                  key: 'action', header: 'الإجراء',
                  render: (entry) => (
                    <span className="block">
                      <span className="block font-semibold text-ink">{entry.action}</span>
                      {entry.entityId && <span className="block max-w-[200px] truncate font-mono text-[10px] text-muted" dir="ltr">{entry.entityId}</span>}
                    </span>
                  ),
                },
                {
                  key: 'entity', header: 'نوع الكيان',
                  render: (entry) => <span className="rounded bg-surface-sunken px-2 py-0.5 text-[10.5px] font-semibold text-ink">{ENTITY_LABELS[entry.entityType as keyof typeof ENTITY_LABELS] || entry.entityType}</span>,
                },
                {
                  key: 'device', header: 'الجهاز / العنوان',
                  render: (entry) => (
                    <span className="block whitespace-nowrap text-[11px] text-muted">
                      <span className="block">{entry.deviceName || entry.deviceId || '—'}</span>
                      {entry.ipAddress && <span className="block font-mono text-[10px] text-muted">{entry.ipAddress}</span>}
                    </span>
                  ),
                },
                {
                  key: 'details', header: 'التفاصيل', align: 'center',
                  render: (entry) => (
                    <Button
                      variant="ghost"
                      size="sm"
                      leadingIcon={<Eye className="h-3.5 w-3.5 text-primary" />}
                      onClick={() => setSelectedEntry(entry)}
                    >
                      معاينة
                    </Button>
                  ),
                },
              ]}
            />
          </div>
        )}

        {/* Pagination Footer */}
        {entries.length > 0 && (
        <div className="flex flex-wrap items-center justify-between border-t border-line bg-surface-muted/60 px-4 py-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-muted">حجم الصفحة:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="rounded border border-line-strong bg-surface px-2 py-1 text-xs"
            >
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span className="text-muted">
              عرض {(page - 1) * pageSize + 1} إلى {Math.min(page * pageSize, total)} من {total}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              leadingIcon={<ChevronRight className="h-3.5 w-3.5" />}
            >
              السابق
            </Button>
            <span className="px-3 font-semibold text-ink">
              صفحة {page} من {totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              leadingIcon={<ChevronLeft className="h-3.5 w-3.5" />}
            >
              التالي
            </Button>
          </div>
        </div>
        )}
      </section>

      {/* Audit Detail & Diff Modal */}
      {selectedEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/50 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-2xl rounded-2xl border border-line bg-surface shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-line px-6 py-4 bg-surface-muted/80">
              <div>
                <h3 className="text-base font-bold text-ink">{selectedEntry.action}</h3>
                <p className="text-xs text-muted font-mono mt-0.5">{selectedEntry.id} · {formatDateTime(selectedEntry.createdAt)}</p>
              </div>
              <button
                onClick={() => setSelectedEntry(null)}
                className="rounded-lg p-1.5 text-muted hover:bg-surface-sunken hover:text-ink"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto p-6 space-y-4 text-xs">
              {/* Metadata Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 rounded-xl bg-surface-muted border border-line">
                <div>
                  <span className="text-muted block">المنفذ</span>
                  <span className="font-semibold text-ink">{selectedEntry.actorName || 'النظام'} ({ACTOR_LABELS[selectedEntry.actorType || 'SUPER_ADMIN']})</span>
                </div>
                <div>
                  <span className="text-muted block">مستوى الخطورة</span>
                  <span className="font-semibold text-ink">{selectedEntry.severity}</span>
                </div>
                <div>
                  <span className="text-muted block">الحالة</span>
                  <span className="font-semibold text-ink">{selectedEntry.status}</span>
                </div>
                <div>
                  <span className="text-muted block">الكيان والمعرف</span>
                  <span className="font-semibold text-ink">{ENTITY_LABELS[selectedEntry.entityType] || selectedEntry.entityType}: {selectedEntry.entityId || '—'}</span>
                </div>
                <div>
                  <span className="text-muted block">الجهاز</span>
                  <span className="font-semibold text-ink">{selectedEntry.deviceName || selectedEntry.deviceId || '—'}</span>
                </div>
                <div>
                  <span className="text-muted block">عنوان IP</span>
                  <span className="font-mono text-ink">{selectedEntry.ipAddress || '—'}</span>
                </div>
              </div>

              {/* Old vs New Values (Diff View) */}
              {(selectedEntry.oldValues || selectedEntry.newValues) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <span className="font-bold text-ink flex items-center gap-1 text-danger">
                      <span className="h-2 w-2 rounded-full bg-danger"></span> القيمة السابقة (Before):
                    </span>
                    <pre className="rounded-lg border border-line bg-primary text-muted p-3 text-[11px] font-mono overflow-x-auto max-h-48" dir="ltr">
                      {formatJsonBlock(selectedEntry.oldValues)}
                    </pre>
                  </div>
                  <div className="space-y-1">
                    <span className="font-bold text-ink flex items-center gap-1 text-success">
                      <span className="h-2 w-2 rounded-full bg-success"></span> القيمة الجديدة (After):
                    </span>
                    <pre className="rounded-lg border border-line bg-primary text-muted p-3 text-[11px] font-mono overflow-x-auto max-h-48" dir="ltr">
                      {formatJsonBlock(selectedEntry.newValues)}
                    </pre>
                  </div>
                </div>
              )}

              {/* Details Payload */}
              {selectedEntry.details && (
                <div className="space-y-1">
                  <span className="font-bold text-ink">بيانات وتفاصيل العملية (Details Payload):</span>
                  <pre className="rounded-lg border border-line bg-surface-muted text-ink p-3 text-[11px] font-mono overflow-x-auto max-h-40" dir="ltr">
                    {formatJsonBlock(selectedEntry.details)}
                  </pre>
                </div>
              )}

              {/* Cryptographic Proof */}
              <div className="p-3 rounded-lg border border-line bg-surface-muted space-y-1 text-[10.5px]">
                <div className="flex items-center gap-1 font-bold text-ink-secondary">
                  <Lock className="h-3 w-3 text-primary" /> البصمة التشفيرية المانعة للتلاعب (Tamper-evident Hash Chain)
                </div>
                <div className="text-muted truncate" dir="ltr">
                  <strong className="text-ink">Prev Hash:</strong> {selectedEntry.prevHash || 'GENESIS'}
                </div>
                <div className="text-muted truncate" dir="ltr">
                  <strong className="text-ink">Record Hash:</strong> {selectedEntry.recordHash || 'N/A'}
                </div>
              </div>
            </div>

            <div className="border-t border-line px-6 py-3 bg-surface-muted flex justify-end">
              <Button variant="secondary" size="sm" onClick={() => setSelectedEntry(null)}>
                إغلاق
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlatformAuditPage;
