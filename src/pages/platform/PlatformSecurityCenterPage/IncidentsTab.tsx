import React from 'react';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { DataTable } from '../../../components/ui/DataTable';
import type { PlatformCentralSecurityIncident } from '../../../services/domains/platform/platformTypes';
import { EmptyState, formatDateTime } from '../components/PlatformUI';

interface IncidentsTabProps {
  incidents: PlatformCentralSecurityIncident[];
  canManageSecurity: boolean;
  onOpenIncidentModal: () => void;
  onRespondIncident: (id: string, resolve: boolean) => void;
}

export const IncidentsTab: React.FC<IncidentsTabProps> = ({ incidents, canManageSecurity, onOpenIncidentModal, onRespondIncident }) => (
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <h3 className="text-xs font-bold text-muted">
        سجل الحوادث الأمنية المركزية ({incidents.length})
      </h3>
      <Button
        size="sm"
        disabled={!canManageSecurity}
        onClick={() => { if (!canManageSecurity) return; onOpenIncidentModal(); }}
        leadingIcon={<ShieldAlert className="h-4 w-4" />}
      >
        تسجيل بلاغ أمني يدوي
      </Button>
    </div>

    <div className="overflow-hidden rounded-xl border border-line-strong bg-primary/70 shadow-sm">
      {incidents.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="h-6 w-6 text-success" />}
          title="السجل نظيف تماماً"
          description="لم يتم رصد أي اختراقات أو حوادث أمنية على المنصة."
        />
      ) : (
        <DataTable
          ariaLabel="سجل الحوادث الأمنية"
          rows={incidents}
          rowKey={(inc) => inc.id}
          minWidth={800}
          columns={[
            {
              key: 'incident', header: 'عنوان الحادث',
              render: (inc) => (
                <div className="text-xs">
                  <p className="font-bold text-muted">{inc.title}</p>
                  {inc.details && <p className="text-[11px] text-muted mt-0.5">{inc.details}</p>}
                </div>
              ),
            },
            {
              key: 'severity', header: 'مستوى الخطورة',
              render: (inc) => (
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-black ${
                    inc.severity === 'CRITICAL'
                      ? 'bg-danger/20 text-danger border border-danger/30'
                      : inc.severity === 'HIGH'
                      ? 'bg-warning/20 text-warning border border-warning/30'
                      : 'bg-primary text-muted'
                  }`}
                >
                  {inc.severity}
                </span>
              ),
            },
            {
              key: 'status', header: 'الحالة',
              render: (inc) => (
                <span
                  className={`font-bold text-xs ${
                    inc.status === 'RESOLVED'
                      ? 'text-success'
                      : inc.status === 'CONTAINED'
                      ? 'text-primary'
                      : 'text-danger'
                  }`}
                >
                  {inc.status === 'RESOLVED'
                    ? 'تم الحل'
                    : inc.status === 'CONTAINED'
                    ? 'قيد الاحتواء'
                    : 'مفتوح'}
                </span>
              ),
            },
            { key: 'action', header: 'إجراء الاحتواء المتخذ', render: (inc) => <span className="text-xs text-muted">{inc.containmentAction || 'بانتظار إجراء'}</span> },
            { key: 'time', header: 'التوقيت', render: (inc) => <span className="text-xs text-muted">{formatDateTime(inc.createdAt)}</span> },
            {
              key: 'actions', header: 'إجراءات', align: 'center',
              render: (inc) => inc.status !== 'RESOLVED' ? (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!canManageSecurity}
                  onClick={() => onRespondIncident(inc.id, true)}
                >
                  إغلاق كـ محلول
                </Button>
              ) : null,
            },
          ]}
        />
      )}
    </div>
  </div>
);
