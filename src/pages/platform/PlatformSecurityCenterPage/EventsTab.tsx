import React, { useMemo, useState } from 'react';
import { Radar, Search, Ban, Download } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { DataTable } from '../../../components/ui/DataTable';
import { EmptyState, formatDateTime, inputClass, downloadCsv } from '../components/PlatformUI';
import type { PlatformSecurityEvent, PlatformSecurityEventSeverity } from '../../../services/domains/platform/platformTypes';

interface EventsTabProps {
  events: PlatformSecurityEvent[];
  isCentral: boolean;
  canManageSecurity: boolean;
  onBanIp: (ip: string) => void;
}

const SEVERITY_ORDER: PlatformSecurityEventSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];

const SEVERITY_LABEL: Record<PlatformSecurityEventSeverity, string> = {
  CRITICAL: 'حرج',
  HIGH: 'عالٍ',
  MEDIUM: 'متوسط',
  LOW: 'منخفض',
  INFO: 'معلومة',
};

const SEVERITY_CLASS: Record<PlatformSecurityEventSeverity, string> = {
  CRITICAL: 'bg-danger/20 text-danger border-danger/40',
  HIGH: 'bg-warning/20 text-warning border-warning/40',
  MEDIUM: 'bg-primary/20 text-primary border-primary/40',
  LOW: 'bg-surface-sunken text-ink-secondary border-line',
  INFO: 'bg-surface-sunken text-muted border-line',
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  LOGIN_SUCCESS: 'دخول ناجح',
  LOGIN_FAILED: 'دخول فاشل',
  LOGIN_BLOCKED: 'دخول من IP محظور',
  LOGIN_ATTEMPT: 'محاولة دخول',
  LOGOUT: 'تسجيل خروج',
  PASSWORD_CHANGE: 'تغيير كلمة مرور',
  MFA_ENABLED: 'تفعيل التحقق الثنائي',
  MFA_DISABLED: 'إيقاف التحقق الثنائي',
  SESSION_REVOKED: 'إنهاء جلسة',
  DEVICE_REVOKED: 'إلغاء جهاز موثوق',
  API_KEY_CREATED: 'إنشاء مفتاح API',
  API_KEY_REVOKED: 'إلغاء مفتاح API',
  SIGNING_KEY_ROTATED: 'تدوير مفتاح توقيع',
  IP_BANNED: 'حظر عنوان IP',
  IP_BAN_LIFTED: 'رفع حظر IP',
  SECURITY_INCIDENT: 'حادث أمني',
  SUSPICIOUS_ACTIVITY: 'نشاط مشبوه',
  BRUTE_FORCE: 'هجوم تخمين كلمات مرور',
};

const eventTypeLabel = (type: string) => EVENT_TYPE_LABELS[type] ?? type;

export const EventsTab: React.FC<EventsTabProps> = ({ events, isCentral, canManageSecurity, onBanIp }) => {
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'' | PlatformSecurityEventSeverity>('');
  const [typeFilter, setTypeFilter] = useState('');

  const eventTypes = useMemo(
    () => Array.from(new Set(events.map((e) => e.eventType))).sort(),
    [events],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((event) => {
      if (severityFilter && event.severity !== severityFilter) return false;
      if (typeFilter && event.eventType !== typeFilter) return false;
      if (!q) return true;
      return [event.title, event.description, event.sourceIp, event.staffName, event.eventType]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q));
    });
  }, [events, search, severityFilter, typeFilter]);

  const handleExport = () => {
    downloadCsv('security-events.csv', [
      ['الوقت', 'النوع', 'الخطورة', 'العنوان', 'الوصف', 'IP المصدر', 'الموظف', 'العميل'],
      ...filtered.map((event) => [
        event.createdAt,
        eventTypeLabel(event.eventType),
        SEVERITY_LABEL[event.severity],
        event.title,
        event.description ?? '',
        event.sourceIp ?? '',
        event.staffName ?? '',
        event.tenantId ?? '',
      ]),
    ]);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line-strong bg-primary/80 p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px]">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث بالعنوان أو IP أو الموظف..."
              className={`${inputClass} pr-9 text-xs`}
            />
          </div>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as '' | PlatformSecurityEventSeverity)}
            className={`${inputClass} w-auto px-2 py-1.5 text-xs`}
          >
            <option value="">كل مستويات الخطورة</option>
            {SEVERITY_ORDER.map((sev) => (
              <option key={sev} value={sev}>{SEVERITY_LABEL[sev]}</option>
            ))}
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className={`${inputClass} w-auto px-2 py-1.5 text-xs`}
          >
            <option value="">كل أنواع الأحداث</option>
            {eventTypes.map((type) => (
              <option key={type} value={type}>{eventTypeLabel(type)}</option>
            ))}
          </select>
        </div>
        <Button size="sm" variant="secondary" onClick={handleExport} leadingIcon={<Download className="h-3.5 w-3.5" />}>
          تصدير CSV
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-line-strong bg-primary/70 shadow-sm">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Radar className="h-6 w-6 text-primary" />}
            title="لا توجد أحداث أمنية"
            description="لم يتم رصد أي أحداث أمنية تطابق الفلاتر الحالية."
          />
        ) : (
          <DataTable
            ariaLabel="الأحداث الأمنية"
            rows={filtered}
            rowKey={(event) => event.id}
            minWidth={900}
            columns={[
              {
                key: 'time', header: 'الوقت',
                render: (event) => <span className="text-xs text-muted whitespace-nowrap">{formatDateTime(event.createdAt)}</span>,
              },
              {
                key: 'type', header: 'النوع',
                render: (event) => <span className="text-xs font-bold text-muted">{eventTypeLabel(event.eventType)}</span>,
              },
              {
                key: 'severity', header: 'الخطورة',
                render: (event) => (
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-black ${SEVERITY_CLASS[event.severity]}`}>
                    {SEVERITY_LABEL[event.severity]}
                  </span>
                ),
              },
              {
                key: 'title', header: 'الحدث',
                render: (event) => (
                  <div className="text-xs">
                    <p className="font-bold text-muted">{event.title}</p>
                    {event.description && <p className="text-[11px] text-muted mt-0.5 line-clamp-2">{event.description}</p>}
                  </div>
                ),
              },
              {
                key: 'ip', header: 'IP المصدر',
                render: (event) => <span className="text-xs font-mono text-muted">{event.sourceIp || '—'}</span>,
              },
              {
                key: 'actor', header: 'الموظف / العميل',
                render: (event) => <span className="text-xs text-muted">{event.staffName || event.tenantId || '—'}</span>,
              },
              {
                key: 'actions', header: 'إجراءات', align: 'center',
                render: (event) => isCentral && event.sourceIp ? (
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={!canManageSecurity}
                    onClick={() => onBanIp(event.sourceIp!)}
                    leadingIcon={<Ban className="h-3 w-3" />}
                  >
                    حظر IP
                  </Button>
                ) : null,
              },
            ]}
          />
        )}
      </div>
    </div>
  );
};

export default EventsTab;
