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
      <h3 className="text-xs font-bold text-slate-200">
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

    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70 shadow-sm">
      {incidents.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="h-6 w-6 text-emerald-400" />}
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
                  <p className="font-bold text-slate-100">{inc.title}</p>
                  {inc.details && <p className="text-[11px] text-slate-400 mt-0.5">{inc.details}</p>}
                </div>
              ),
            },
            {
              key: 'severity', header: 'مستوى الخطورة',
              render: (inc) => (
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-black ${
                    inc.severity === 'CRITICAL'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      : inc.severity === 'HIGH'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'bg-slate-800 text-slate-300'
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
                      ? 'text-emerald-400'
                      : inc.status === 'CONTAINED'
                      ? 'text-sky-400'
                      : 'text-rose-400'
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
            { key: 'action', header: 'إجراء الاحتواء المتخذ', render: (inc) => <span className="text-xs text-slate-300">{inc.containmentAction || 'بانتظار إجراء'}</span> },
            { key: 'time', header: 'التوقيت', render: (inc) => <span className="text-xs text-slate-400">{formatDateTime(inc.createdAt)}</span> },
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
