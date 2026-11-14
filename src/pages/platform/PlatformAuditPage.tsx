import React from 'react';
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
import type {
  PlatformAuditEntry,
  AuditSeverity,
  AuditStatus,
  AuditActorType,
  PlatformAuditFilters,
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
  INFO: { bg: 'bg-sky-50', text: 'text-sky-700 border-sky-200', label: 'معلومات', icon: <Info className="h-3 w-3" /> },
  NOTICE: { bg: 'bg-slate-100', text: 'text-slate-700 border-slate-300', label: 'ملاحظة', icon: <Info className="h-3 w-3" /> },
  WARNING: { bg: 'bg-amber-50', text: 'text-amber-800 border-amber-200', label: 'تحذير', icon: <AlertTriangle className="h-3 w-3" /> },
  SECURITY: { bg: 'bg-purple-50', text: 'text-purple-700 border-purple-200', label: 'أمني', icon: <ShieldAlert className="h-3 w-3" /> },
  CRITICAL: { bg: 'bg-rose-50', text: 'text-rose-700 border-rose-200', label: 'حرج', icon: <XCircle className="h-3 w-3" /> },
};

const ACTOR_LABELS: Record<AuditActorType, string> = {
  SUPER_ADMIN: 'مسؤول المنصة',
  TENANT_ADMIN: 'مدير العميل',
  DEVICE: 'جهاز / نقطة بيع',
  API_CLIENT: 'خدمة برمجية API',
  SYSTEM: 'النظام الآلي',
};

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

  const [tenants, setTenants] = React.useState<any[]>([]);
  const [integrityState, setIntegrityState] = React.useState<{ checked: boolean; valid: boolean; count?: number }>({
    checked: false,
    valid: true,
  });

  // Selected entry for modal view (Diff & details)
  const [selectedEntry, setSelectedEntry] = React.useState<PlatformAuditEntry | null>(null);

  const loadData = React.useCallback(() => {
    setLoading(true);
    try {
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
      if (tenants.length === 0) {
        setTenants(platformAdminService.listTenants());
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر استرجاع سجل العمليات.');
    } finally {
      setLoading(false);
    }
  }, [search, tenantId, severity, status, actorType, dateFrom, dateTo, page, pageSize, tenants.length]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const handleVerifyIntegrity = () => {
    try {
      const check = platformAdminService.verifyAuditIntegrity();
      setIntegrityState({ checked: true, valid: check.isValid, count: check.checkedCount });
    } catch (err) {
      setError('تعذر فحص البصمة التشفيرية للسجلات.');
    }
  };

  const handleFullExport = () => {
    try {
      const allMatching = platformAdminService.queryAuditForExport({
        search: search.trim() || undefined,
        tenantId: tenantId || undefined,
        severity: severity !== 'all' ? severity : undefined,
        status: status !== 'all' ? status : undefined,
        actorType: actorType !== 'all' ? actorType : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });

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
      setError('فشل تصدير السجلات بالكامل.');
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="سجل العمليات المركزي — Central Audit Trail"
        description="سجل موحد، مشفر بتسلسل SHA-256 وغير قابل للتعديل لتتبع عمليات الإدارة، العملاء، الأجهزة وواجهات API."
        icon={<ScrollText className="h-5 w-5 text-indigo-600" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={
                integrityState.checked ? (
                  integrityState.valid ? (
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <ShieldAlert className="h-4 w-4 text-rose-600" />
                  )
                ) : (
                  <Lock className="h-4 w-4 text-slate-500" />
                )
              }
              onClick={handleVerifyIntegrity}
            >
              {integrityState.checked
                ? integrityState.valid
                  ? `السجلات موثوقة ومحمية (${integrityState.count})`
                  : 'تم اكتشاف تلاعب في السجل!'
                : 'فحص سلامة التشفير'}
            </Button>
            <Button variant="ghost" size="sm" leadingIcon={<RefreshCw className="h-3.5 w-3.5" />} onClick={loadData}>
              تحديث
            </Button>
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={<Download className="h-3.5 w-3.5 text-slate-600" />}
              onClick={handleFullExport}
            >
              تصدير شامل ({total})
            </Button>
          </div>
        }
      />

      {/* Advanced Filter Toolbar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
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

          <select
            value={severity}
            onChange={(e) => {
              setSeverity(e.target.value as any);
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
              setStatus(e.target.value as any);
              setPage(1);
            }}
            className={`${inputClass} max-w-[130px]`}
          >
            <option value="all">كل النتائج</option>
            <option value="SUCCESS">ناجحة</option>
            <option value="FAILURE">فاشلة</option>
            <option value="BLOCKED">محظورة</option>
          </select>

          <select
            value={actorType}
            onChange={(e) => {
              setActorType(e.target.value as any);
              setPage(1);
            }}
            className={`${inputClass} max-w-[150px]`}
          >
            <option value="all">كل المنفذين</option>
            <option value="SUPER_ADMIN">مسؤول المنصة</option>
            <option value="TENANT_ADMIN">مدير العميل</option>
            <option value="DEVICE">جهاز / POS</option>
            <option value="API_CLIENT">واجهة API</option>
            <option value="SYSTEM">النظام</option>
          </select>
        </div>

        {/* Date Filters Row */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 text-xs">
          <span className="flex items-center gap-1 font-semibold text-slate-500">
            <Filter className="h-3.5 w-3.5" /> الفترة:
          </span>
          <div className="flex items-center gap-2">
            <span className="text-slate-400">من:</span>
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
            <span className="text-slate-400">إلى:</span>
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
              className="text-xs text-rose-600 hover:text-rose-700"
            >
              إلغاء الفلاتر
            </Button>
          )}
          <span className="mr-auto font-medium text-slate-500">
            إجمالي السجلات: <strong className="text-slate-800">{total}</strong>
          </span>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700">
          {error}
        </div>
      )}

      {/* Main Audit Table */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="py-20 text-center text-sm font-semibold text-slate-500">جارٍ تحميل سجل العمليات...</div>
        ) : entries.length === 0 ? (
          <EmptyState
            icon={<ScrollText className="h-6 w-6 text-slate-400" />}
            title="لا توجد عمليات مطابقة"
            description="لم يتم العثور على أي نشاط يطابق معايير الفلترة المحددة."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="border-b border-slate-200 bg-slate-50/75 text-slate-600 font-semibold">
                <tr>
                  <th className="py-3 px-4">الوقت والتاريخ</th>
                  <th className="py-3 px-4">مستوى الخطورة</th>
                  <th className="py-3 px-4">النتيجة</th>
                  <th className="py-3 px-4">المنفذ</th>
                  <th className="py-3 px-4">الإجراء</th>
                  <th className="py-3 px-4">نوع الكيان</th>
                  <th className="py-3 px-4">الجهاز / العنوان</th>
                  <th className="py-3 px-4 text-center">التفاصيل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map((entry) => {
                  const badge = SEVERITY_BADGES[entry.severity] || SEVERITY_BADGES.INFO;
                  return (
                    <tr key={entry.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap text-slate-500 font-mono" dir="ltr">
                        {formatDateTime(entry.createdAt)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${badge.bg} ${badge.text}`}
                        >
                          {badge.icon}
                          {badge.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {entry.status === 'SUCCESS' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5" /> ناجح
                          </span>
                        ) : entry.status === 'BLOCKED' ? (
                          <span className="inline-flex items-center gap-1 text-purple-700 font-medium">
                            <Lock className="h-3.5 w-3.5" /> محظور
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-rose-700 font-medium">
                            <XCircle className="h-3.5 w-3.5" /> فاشل
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-800">{entry.actorName || 'النظام'}</p>
                        <p className="text-[10px] text-slate-400">
                          {ACTOR_LABELS[entry.actorType || 'SUPER_ADMIN']}
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-900">{entry.action}</p>
                        {entry.entityId && (
                          <p className="font-mono text-[10px] text-slate-400 truncate max-w-[200px]" dir="ltr">
                            {entry.entityId}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold text-slate-700">
                          {ENTITY_LABELS[entry.entityType] || entry.entityType}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-slate-500 text-[11px]">
                        <div>{entry.deviceName || entry.deviceId || '—'}</div>
                        {entry.ipAddress && <div className="font-mono text-[10px] text-slate-400">{entry.ipAddress}</div>}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          leadingIcon={<Eye className="h-3.5 w-3.5 text-indigo-600" />}
                          onClick={() => setSelectedEntry(entry)}
                        >
                          معاينة
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        <div className="flex flex-wrap items-center justify-between border-t border-slate-200 bg-slate-50/60 px-4 py-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-500">حجم الصفحة:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
            >
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span className="text-slate-400">
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
            <span className="px-3 font-semibold text-slate-700">
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
      </section>

      {/* Audit Detail & Diff Modal */}
      {selectedEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50/80">
              <div>
                <h3 className="text-base font-bold text-slate-900">{selectedEntry.action}</h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">{selectedEntry.id} · {formatDateTime(selectedEntry.createdAt)}</p>
              </div>
              <button
                onClick={() => setSelectedEntry(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto p-6 space-y-4 text-xs">
              {/* Metadata Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <span className="text-slate-400 block">المنفذ</span>
                  <span className="font-semibold text-slate-800">{selectedEntry.actorName || 'النظام'} ({ACTOR_LABELS[selectedEntry.actorType || 'SUPER_ADMIN']})</span>
                </div>
                <div>
                  <span className="text-slate-400 block">مستوى الخطورة</span>
                  <span className="font-semibold text-slate-800">{selectedEntry.severity}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">الحالة</span>
                  <span className="font-semibold text-slate-800">{selectedEntry.status}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">الكيان والمعرف</span>
                  <span className="font-semibold text-slate-800">{ENTITY_LABELS[selectedEntry.entityType] || selectedEntry.entityType}: {selectedEntry.entityId || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">الجهاز</span>
                  <span className="font-semibold text-slate-800">{selectedEntry.deviceName || selectedEntry.deviceId || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">عنوان IP</span>
                  <span className="font-mono text-slate-800">{selectedEntry.ipAddress || '—'}</span>
                </div>
              </div>

              {/* Old vs New Values (Diff View) */}
              {(selectedEntry.oldValues || selectedEntry.newValues) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <span className="font-bold text-slate-700 flex items-center gap-1 text-rose-700">
                      <span className="h-2 w-2 rounded-full bg-rose-500"></span> القيمة السابقة (Before):
                    </span>
                    <pre className="rounded-lg border border-slate-200 bg-slate-900 text-slate-100 p-3 text-[11px] font-mono overflow-x-auto max-h-48" dir="ltr">
                      {formatJsonBlock(selectedEntry.oldValues)}
                    </pre>
                  </div>
                  <div className="space-y-1">
                    <span className="font-bold text-slate-700 flex items-center gap-1 text-emerald-700">
                      <span className="h-2 w-2 rounded-full bg-emerald-500"></span> القيمة الجديدة (After):
                    </span>
                    <pre className="rounded-lg border border-slate-200 bg-slate-900 text-slate-100 p-3 text-[11px] font-mono overflow-x-auto max-h-48" dir="ltr">
                      {formatJsonBlock(selectedEntry.newValues)}
                    </pre>
                  </div>
                </div>
              )}

              {/* Details Payload */}
              {selectedEntry.details && (
                <div className="space-y-1">
                  <span className="font-bold text-slate-700">بيانات وتفاصيل العملية (Details Payload):</span>
                  <pre className="rounded-lg border border-slate-200 bg-slate-50 text-slate-800 p-3 text-[11px] font-mono overflow-x-auto max-h-40" dir="ltr">
                    {formatJsonBlock(selectedEntry.details)}
                  </pre>
                </div>
              )}

              {/* Cryptographic Proof */}
              <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-1 text-[10.5px]">
                <div className="flex items-center gap-1 font-bold text-slate-600">
                  <Lock className="h-3 w-3 text-indigo-600" /> البصمة التشفيرية المانعة للتلاعب (Tamper-evident Hash Chain)
                </div>
                <div className="text-slate-500 truncate" dir="ltr">
                  <strong className="text-slate-700">Prev Hash:</strong> {selectedEntry.prevHash || 'GENESIS'}
                </div>
                <div className="text-slate-500 truncate" dir="ltr">
                  <strong className="text-slate-700">Record Hash:</strong> {selectedEntry.recordHash || 'N/A'}
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 px-6 py-3 bg-slate-50 flex justify-end">
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
