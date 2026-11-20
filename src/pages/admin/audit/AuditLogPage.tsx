import React, { useState } from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { PageHeader } from '../../../components/ui/PageHeader';
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  FileClock,
  Fingerprint,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  XCircle,
} from 'lucide-react';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { exportToExcel } from '../../../utils/export/export';
import { useAuditLogs } from '../../../hooks/domains/admin/useAuditLogs';
import { formatJson, getModuleColor } from '../../../types/admin/audit';

const formatTimestamp = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

const number = (value: number) => value.toLocaleString('ar-EG');
const MODULE_LABELS: Record<string, string> = {
  LOGIN: 'محاولات الدخول',
  PRODUCTS: 'المنتجات',
  INVENTORY: 'المخزون',
  SALES: 'المبيعات',
  PURCHASES: 'المشتريات',
  CUSTOMERS: 'العملاء',
  SUPPLIERS: 'الموردون',
  CASHIER: 'نقطة البيع',
  USERS: 'المستخدمون',
  SETTINGS: 'الإعدادات',
};
const moduleLabel = (module: string) => MODULE_LABELS[module] || module;

export const AuditLogPage: React.FC = () => {
  const {
    logs,
    stats,
    modules,
    total,
    page,
    totalPages,
    selectedModule,
    selectedSource,
    search,
    dateFrom,
    dateTo,
    expandedLog,
    isLoadingLogs,
    isLoadingInitial,
    error,
    setPage,
    setSelectedModule,
    setSelectedSource,
    setSearch,
    setDateFrom,
    setDateTo,
    toggleExpand,
    refresh,
  } = useAuditLogs();
  const [exportError, setExportError] = useState<string | null>(null);
  const canExportAudit = PermissionService.can(AuthService.getCurrentUser(), 'ui.audit.log.export');

  const handleExport = () => {
    setExportError(null);
    try {
      exportToExcel({
        title: 'سجل المراجعة والأمان',
        subtitle: 'الأحداث المعروضة من سجلي العمليات ومحاولات الدخول المحفوظين',
        columns: [
          { key: 'id', label: 'المعرف' },
          { key: 'source', label: 'المصدر' },
          { key: 'module', label: 'النوع / الوحدة' },
          { key: 'action', label: 'الحدث' },
          { key: 'userName', label: 'المستخدم / اسم الدخول' },
          { key: 'status', label: 'النتيجة' },
          { key: 'failureReason', label: 'سبب الإخفاق المسجل' },
          { key: 'deviceLabel', label: 'الجهاز المسجل' },
          { key: 'ipAddress', label: 'عنوان IP المسجل' },
          { key: 'createdAt', label: 'التاريخ' },
        ],
        rows: logs.map((log) => ({
          id: log.id,
          source: log.source === 'business' ? 'عملية أعمال' : 'سجل دخول',
          module: moduleLabel(log.module),
          action: log.action,
          userName: log.userName,
          status: log.succeeded === null ? 'مسجل' : log.succeeded ? 'ناجح' : 'فاشل',
          failureReason: log.failureReason || '',
          deviceLabel: log.deviceLabel || '',
          ipAddress: log.ipAddress || '',
          createdAt: log.createdAt,
        })),
        fileName: 'audit-security-log',
        permission: 'audit.export',
      });
    } catch (exportFailure) {
      setExportError(exportFailure instanceof Error ? exportFailure.message : 'تعذر تصدير السجلات.');
    }
  };

  const activeFilters = Boolean(search || dateFrom || dateTo || selectedModule || selectedSource);

  return (
    <main className="erp-page">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <PageHeader
          icon={<ShieldCheck className="h-5 w-5" aria-hidden="true" />}
          title={
            <span className="flex flex-wrap items-center gap-2">
              سجل المراجعة والأمان
              <span className="inline-flex items-center gap-1 rounded-full border border-accent-border bg-accent-soft px-2.5 py-1 text-[10px] font-bold text-primary">
                <Fingerprint className="h-3 w-3" aria-hidden="true" />
                مصدران محفوظان
              </span>
            </span>
          }
          description="سجل زمني موحّد لعمليات الأعمال ومحاولات الدخول المسجلة في قاعدة البيانات."
          actions={<>
            {canExportAudit && (
              <button
                type="button"
                onClick={handleExport}
                disabled={!logs.length || isLoadingLogs}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-3.5 text-xs font-bold text-ink shadow-sm transition hover:border-accent-border hover:bg-accent-soft focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ArrowDownToLine className="h-4 w-4" aria-hidden="true" />
                تصدير النتائج المعروضة
              </button>
            )}
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={isLoadingInitial || isLoadingLogs}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-3.5 text-xs font-bold text-white shadow-sm transition hover:bg-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${isLoadingInitial || isLoadingLogs ? 'animate-spin' : ''}`} aria-hidden="true" />
              تحديث السجل
            </button>
          </>}
        />

        {error && (
          <div role="alert" className="flex items-start gap-3 rounded-lg border border-danger-border bg-danger-soft px-4 py-3 text-sm text-danger">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-bold">تعذر تحميل بيانات سجل المراجعة</p>
              <p className="mt-0.5 break-words text-danger">{error}</p>
            </div>
          </div>
        )}
        {exportError && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-danger-border bg-danger-soft px-4 py-3 text-sm text-danger">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{exportError}</span>
          </div>
        )}

        <section aria-label="ملخص السجلات" className="grid grid-cols-2 overflow-hidden rounded-xl border border-line bg-surface shadow-sm md:grid-cols-4">
          <SummaryMetric
            label="كل الأحداث"
            value={stats?.totalEvents}
            note="عمليات أعمال ومحاولات دخول"
            icon={<FileClock className="h-4 w-4" aria-hidden="true" />}
            tone="slate"
            loading={isLoadingInitial}
          />
          <SummaryMetric
            label="أحداث اليوم"
            value={stats?.todayEvents}
            note="حسب تاريخ الحدث المحفوظ"
            icon={<Clock3 className="h-4 w-4" aria-hidden="true" />}
            tone="indigo"
            loading={isLoadingInitial}
          />
          <SummaryMetric
            label="عمليات الأعمال"
            value={stats?.businessEvents}
            note="من سجل العمليات"
            icon={<UserRound className="h-4 w-4" aria-hidden="true" />}
            tone="slate"
            loading={isLoadingInitial}
          />
          <SummaryMetric
            label="دخول فاشل"
            value={stats?.failedLogins}
            note={`دخول ناجح مسجل: ${stats ? number(stats.successfulLogins) : '—'}`}
            icon={<ShieldAlert className="h-4 w-4" aria-hidden="true" />}
            tone="amber"
            loading={isLoadingInitial}
          />
        </section>

        <section aria-label="تصفية سجل المراجعة" className="rounded-xl border border-line bg-surface p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-extrabold text-ink">
              <SlidersHorizontal className="h-4 w-4 text-primary" aria-hidden="true" />
              تصفية الأحداث
            </h2>
            {activeFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setDateFrom('');
                  setDateTo('');
                  setSelectedModule('');
                  setSelectedSource('');
                }}
                className="text-xs font-bold text-primary underline decoration-primary underline-offset-4 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary"
              >
                مسح التصفية
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(240px,1fr)_170px_190px_190px]">
            <label className="relative block">
              <span className="sr-only">ابحث في أحداث السجل</span>
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="بحث باسم المستخدم أو الإجراء أو معرف الحدث..."
                className="min-h-10 w-full rounded-lg border border-line-strong bg-surface-muted py-2 pe-9 ps-3 text-sm text-ink placeholder:text-muted focus:border-primary focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </label>
            <label className="block">
              <span className="sr-only">مصدر الحدث</span>
              <select
                value={selectedSource}
                onChange={(event) => setSelectedSource(event.target.value as '' | 'business' | 'login')}
                className="min-h-10 w-full rounded-lg border border-line-strong bg-surface-muted px-3 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">كل المصادر</option>
                <option value="business">عمليات الأعمال</option>
                <option value="login">محاولات الدخول</option>
              </select>
            </label>
            <label className="block">
              <span className="sr-only">نوع الحدث أو الوحدة</span>
              <select
                value={selectedModule}
                onChange={(event) => setSelectedModule(event.target.value)}
                className="min-h-10 w-full rounded-lg border border-line-strong bg-surface-muted px-3 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">كل الأنواع والوحدات</option>
                {modules.map((module) => (
                  <option key={module} value={module}>{moduleLabel(module)}</option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="relative">
                <span className="sr-only">من تاريخ</span>
                <CalendarDays className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
                <input
                  type="date"
                  value={dateFrom}
                  max={dateTo || undefined}
                  onChange={(event) => setDateFrom(event.target.value)}
                  className="min-h-10 w-full rounded-lg border border-line-strong bg-surface-muted py-2 pe-8 ps-2 text-xs text-ink focus:border-primary focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </label>
              <label className="relative">
                <span className="sr-only">إلى تاريخ</span>
                <CalendarDays className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(event) => setDateTo(event.target.value)}
                  className="min-h-10 w-full rounded-lg border border-line-strong bg-surface-muted py-2 pe-8 ps-2 text-xs text-ink focus:border-primary focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </label>
            </div>
          </div>
        </section>

        <section aria-label="الأحداث المسجلة" className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
          <div className="flex flex-col gap-2 border-b border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-extrabold text-ink">الأحداث المسجلة</h2>
              <p className="mt-0.5 text-xs text-ink-secondary">
                {isLoadingInitial ? 'جارٍ تحميل السجل...' : `${number(total)} حدث مطابق`}
                {totalPages > 0 && ` · صفحة ${number(page)} من ${number(totalPages)}`}
              </p>
            </div>
            <div className="inline-flex items-center gap-1.5 self-start rounded-md border border-line bg-surface-muted px-2.5 py-1.5 text-[11px] font-semibold text-ink sm:self-auto">
              <span className="h-2 w-2 rounded-full bg-success" />
              عمليات الأعمال
              <span className="mx-1 text-muted">/</span>
              <span className="h-2 w-2 rounded-full bg-warning" />
              محاولات الدخول
            </div>
          </div>

          <div className="relative min-h-[300px]">
            {(isLoadingInitial || isLoadingLogs) && (
              <div className="absolute inset-0 z-10 flex items-start justify-center bg-surface/75 pt-14" aria-live="polite">
                <span className="inline-flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-sm font-semibold text-ink shadow-sm">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
                  جارٍ تحميل الأحداث...
                </span>
              </div>
            )}
            {logs.length === 0 && !isLoadingInitial && !isLoadingLogs ? (
              <div className="flex min-h-[300px] flex-col items-center justify-center px-6 text-center">
                {error ? (
                  <>
                    <AlertCircle className="h-9 w-9 text-danger" aria-hidden="true" />
                    <p className="mt-3 text-sm font-bold text-ink">لا يمكن عرض السجل حتى تكتمل عملية التحميل.</p>
                    <button type="button" onClick={() => void refresh()} className="mt-3 text-sm font-bold text-primary underline underline-offset-4">إعادة المحاولة</button>
                  </>
                ) : (
                  <>
                    <Search className="h-9 w-9 text-muted" aria-hidden="true" />
                    <p className="mt-3 text-sm font-bold text-ink">{activeFilters ? 'لا توجد أحداث تطابق عوامل التصفية.' : 'لا توجد أحداث محفوظة لعرضها.'}</p>
                    <p className="mt-1 max-w-md text-xs leading-5 text-ink-secondary">
                      {activeFilters ? 'جرّب تغيير البحث أو نطاق التاريخ.' : 'ستظهر هنا عمليات الأعمال ومحاولات الدخول بعد تسجيلها في قاعدة البيانات.'}
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div>
                <p className="flex items-center justify-between gap-2 border-b border-accent-border bg-accent-soft px-4 py-2 text-xs font-semibold text-primary md:hidden">
                  <span>اسحب الجدول أفقيًا لعرض بقية الأعمدة</span>
                  <span className="shrink-0 text-base" aria-hidden="true">â†”</span>
                </p>
                <div className="overflow-x-auto overscroll-x-contain">
                <DataTable
                  ariaLabel="سجل المراجعة والأحداث"
                  rows={logs}
                  rowKey={(log) => `${log.source}:${log.id}`}
                  minWidth={920}
                  stickyHeader
                  tableClassName="text-sm"
                  isRowExpanded={(log) => expandedLog === `${log.source}:${log.id}`}
                  rowClassName={(log) => (expandedLog === `${log.source}:${log.id}` ? 'bg-accent-soft/50' : '')}
                  renderExpandedRow={(log) => (
                    <div className="grid gap-3 px-4 py-4 sm:grid-cols-2 lg:grid-cols-3">
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                  <Detail label="معرف الحدث" value={log.id} mono />
                                  {log.userId && <Detail label="معرف المستخدم" value={log.userId} mono />}
                                  {log.recordId && <Detail label="معرف السجل المتأثر" value={log.recordId} mono />}
                                  {log.source === 'login' ? (
                                    <>
                                      <Detail label="النتيجة" value={log.succeeded ? 'دخول ناجح' : 'دخول فاشل'} />
                                      {log.failureReason && <Detail label="سبب الإخفاق المسجل" value={log.failureReason} />}
                                      {log.deviceLabel && <Detail label="الجهاز المسجل" value={log.deviceLabel} />}
                                      {!log.failureReason && !log.deviceLabel && (
                                        <p className="text-xs text-ink-secondary sm:col-span-2">لا يتضمن هذا الحدث بيانات إضافية محفوظة.</p>
                                      )}
                                    </>
                                  ) : (
                                    <>
                                      {log.ipAddress && <Detail label="عنوان IP المسجل" value={log.ipAddress} mono />}
                                      {!log.oldValues && !log.newValues && !log.ipAddress && (
                                        <p className="text-xs text-ink-secondary sm:col-span-2">لا توجد تفاصيل إضافية محفوظة لهذا الحدث.</p>
                                      )}
                                    </>
                                  )}
                                  {log.oldValues && <JsonDetail label="القيم السابقة" value={log.oldValues} tone="red" />}
                                  {log.newValues && <JsonDetail label="القيم الجديدة" value={log.newValues} tone="green" />}
                                </div>
                    </div>
                  )}
                  columns={[
                    { key: 'date', header: 'التاريخ والوقت', render: (log) => <span className="whitespace-nowrap text-xs tabular-nums text-ink">{formatTimestamp(log.createdAt)}</span> },
                    {
                      key: 'source', header: 'المصدر',
                      render: (log) => (
                        <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-bold ${log.source === 'business' ? 'border-success-border bg-success-soft text-success' : 'border-warning-border bg-warning-soft text-warning'}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${log.source === 'business' ? 'bg-success' : 'bg-warning'}`} />
                          {log.source === 'business' ? 'عملية أعمال' : 'محاولة دخول'}
                        </span>
                      ),
                    },
                    {
                      key: 'user', header: 'المستخدم',
                      render: (log) => (
                        <span className="block max-w-[200px] truncate font-semibold text-ink" title={log.userName}>
                          {log.userName || 'غير مسجل'}
                          {log.source === 'login' && (
                            <span className={`ms-2 inline-flex items-center gap-1 text-[10px] font-bold ${log.succeeded ? 'text-success' : 'text-danger'}`}>
                              {log.succeeded
                                ? <><CheckCircle2 className="h-3 w-3" aria-hidden="true" /> ناجح</>
                                : <><XCircle className="h-3 w-3" aria-hidden="true" /> فاشل</>}
                            </span>
                          )}
                        </span>
                      ),
                    },
                    { key: 'action', header: 'الحدث', render: (log) => <span className="block max-w-[320px] truncate font-semibold text-ink" title={log.action}>{log.action}</span> },
                    {
                      key: 'module', header: 'النوع / الوحدة',
                      render: (log) => <span className={`inline-flex rounded-md border px-2 py-1 text-[10px] font-bold ${log.module === 'LOGIN' ? 'border-warning-border bg-warning-soft text-warning' : getModuleColor(log.module)}`}>{moduleLabel(log.module)}</span>,
                    },
                    {
                      key: 'details', header: 'التفاصيل', align: 'center',
                      render: (log) => {
                        const rowKey = `${log.source}:${log.id}`;
                        const isExpanded = expandedLog === rowKey;
                        return (
                          <button
                            type="button"
                            onClick={() => toggleExpand(rowKey)}
                            aria-expanded={isExpanded}
                            aria-label={`${isExpanded ? 'إخفاء' : 'عرض'} تفاصيل ${log.action}`}
                            className="rounded-md p-1.5 text-ink-secondary transition hover:bg-surface-sunken hover:text-ink focus:outline-none focus:ring-2 focus:ring-primary"
                          >
                            {isExpanded ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
                          </button>
                        );
                      },
                    },
                  ]}
                />
                </div>
              </div>
            )}
          </div>

          {totalPages > 1 && (
            <footer className="flex flex-col gap-3 border-t border-line bg-surface-muted px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs text-ink">
                عرض {number(logs.length)} من {number(total)} حدث
              </span>
              <nav aria-label="صفحات سجل المراجعة" className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page <= 1 || isLoadingLogs}
                  className="inline-flex min-h-9 items-center gap-1 rounded-md border border-line-strong bg-surface px-3 text-xs font-bold text-ink hover:bg-surface-sunken focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ArrowLeft className="h-3.5 w-3.5 rotate-180" aria-hidden="true" />
                  السابق
                </button>
                <span className="min-w-[82px] text-center text-xs font-bold tabular-nums text-ink">{number(page)} / {number(totalPages)}</span>
                <button
                  type="button"
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page >= totalPages || isLoadingLogs}
                  className="inline-flex min-h-9 items-center gap-1 rounded-md border border-line-strong bg-surface px-3 text-xs font-bold text-ink hover:bg-surface-sunken focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  التالي
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </nav>
            </footer>
          )}
        </section>
        <p className="flex items-center gap-1.5 px-1 text-[11px] text-ink-secondary">
          <ShieldCheck className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
          تُعرض بيانات الدخول المتاحة في السجل فقط؛ لا تُعرض عناوين IP أو معلومات جهاز غير محفوظة.
        </p>
      </div>
    </main>
  );
};

interface SummaryMetricProps {
  label: string;
  value?: number | null;
  note: string;
  icon: React.ReactNode;
  tone: 'slate' | 'indigo' | 'amber';
  loading: boolean;
}

const SummaryMetric: React.FC<SummaryMetricProps> = ({ label, value, note, icon, tone, loading }) => {
  const tones = {
    slate: 'text-ink-secondary bg-surface-sunken',
    indigo: 'text-primary bg-accent-soft',
    amber: 'text-warning bg-warning-soft',
  };
  return (
    <div className="flex min-h-[104px] items-start gap-3 border-b border-line p-4 last:border-b-0 sm:odd:border-l sm:even:border-l-0 md:border-b-0 md:border-l md:last:border-l-0">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-bold text-ink-secondary">{label}</p>
        <p className="mt-1 text-xl font-extrabold leading-none tabular-nums text-ink">
          {loading
            ? <span className="inline-block h-5 w-12 animate-pulse rounded bg-surface-sunken" aria-label="جارٍ التحميل" />
            : value === undefined || value === null
              ? '—'
              : number(value)}
        </p>
        <p className="mt-1.5 text-[10px] leading-4 text-ink-secondary">{note}</p>
      </div>
    </div>
  );
};

const Detail: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="min-w-0 rounded-md border border-line bg-surface px-3 py-2">
    <p className="text-[10px] font-bold text-ink-secondary">{label}</p>
    <p className={`mt-1 break-all text-xs text-ink ${mono ? 'font-mono' : 'font-medium'}`}>{value}</p>
  </div>
);

const JsonDetail: React.FC<{ label: string; value: string; tone: 'red' | 'green' }> = ({ label, value, tone }) => (
  <div className="min-w-0 sm:col-span-2 lg:col-span-3">
    <p className={`mb-1 text-xs font-bold ${tone === 'red' ? 'text-danger' : 'text-success'}`}>{label}</p>
    <pre className="max-h-64 overflow-auto rounded-md border border-line bg-surface p-3 text-[11px] leading-5 text-ink" dir="ltr">
      {formatJson(value)}
    </pre>
  </div>
);

export default AuditLogPage;
