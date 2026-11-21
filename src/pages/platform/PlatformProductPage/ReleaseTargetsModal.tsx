import React from 'react';
import { Search } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { inputClass } from '../components/PlatformUI';
import type { PlatformRelease, PlatformReleaseTarget, PlatformTenant } from '../../../services/domains/platform/platformTypes';
import { TARGET_STATUS_LABELS } from './constants';

interface ReleaseTargetsModalProps {
  release: PlatformRelease | null;
  onClose: () => void;
  tenants: PlatformTenant[];
  releaseTargets: PlatformReleaseTarget[];
  selectedTenantIds: string[];
  setSelectedTenantIds: React.Dispatch<React.SetStateAction<string[]>>;
  targetSearchTerm: string;
  setTargetSearchTerm: (v: string) => void;
  saving: boolean;
  canManageProduct: boolean;
  onSaveTargets: () => void;
  onMarkTargetStatus: (targetId: string, status: PlatformReleaseTarget['status']) => void;
}

export const ReleaseTargetsModal: React.FC<ReleaseTargetsModalProps> = ({
  release,
  onClose,
  tenants,
  releaseTargets,
  selectedTenantIds,
  setSelectedTenantIds,
  targetSearchTerm,
  setTargetSearchTerm,
  saving,
  canManageProduct,
  onSaveTargets,
  onMarkTargetStatus,
}) => (
  <Modal
    open={Boolean(release)}
    onClose={onClose}
    title={`استهداف ومتابعة تحديث الإصدار v${release?.version ?? ''}`}
    size="lg"
    busy={saving}
    footer={
      <div className="flex justify-between items-center w-full">
        <span className="text-[11px] font-semibold text-muted">
          تم تحديد {selectedTenantIds.length} من أصل {tenants.length} عميل.
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            إغلاق
          </Button>
          <Button variant="primary" onClick={onSaveTargets} loading={saving} disabled={!canManageProduct}>
            حفظ المستهدفين
          </Button>
        </div>
      </div>
    }
  >
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 bg-surface-muted p-2.5 rounded-lg border border-line">
        <div className="relative flex-1">
          <Search className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-muted" />
          <input
            className={`${inputClass} pr-8 text-xs`}
            placeholder="بحث عن عميل..."
            value={targetSearchTerm}
            onChange={(e) => setTargetSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={!canManageProduct}
            onClick={() => setSelectedTenantIds(tenants.map((t) => t.id))}
            className="rounded bg-surface border border-line px-2.5 py-1 text-[11px] font-semibold text-ink hover:bg-surface-sunken disabled:opacity-40"
          >
            تحديد الكل
          </button>
          <button
            type="button"
            disabled={!canManageProduct}
            onClick={() => setSelectedTenantIds([])}
            className="rounded bg-surface border border-line px-2.5 py-1 text-[11px] font-semibold text-ink hover:bg-surface-sunken disabled:opacity-40"
          >
            إلغاء التحديد
          </button>
        </div>
      </div>

      <div className="max-h-[380px] overflow-y-auto divide-y divide-line-strong rounded-xl border border-line">
        {tenants
          .filter(
            (t) =>
              !targetSearchTerm ||
              t.name.toLowerCase().includes(targetSearchTerm.toLowerCase()) ||
              t.code.toLowerCase().includes(targetSearchTerm.toLowerCase())
          )
          .map((tenant) => {
            const isSelected = selectedTenantIds.includes(tenant.id);
            const targetRecord = releaseTargets.find((r) => r.tenantId === tenant.id);
            const statusMeta = targetRecord ? TARGET_STATUS_LABELS[targetRecord.status] : null;

            return (
              <div
                key={tenant.id}
                className={`flex items-center justify-between p-3 transition ${
                  isSelected ? 'bg-accent-soft/40' : 'hover:bg-surface-muted/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={!canManageProduct}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedTenantIds([...selectedTenantIds, tenant.id]);
                      } else {
                        setSelectedTenantIds(selectedTenantIds.filter((id) => id !== tenant.id));
                      }
                    }}
                    className="h-4 w-4 rounded border-line-strong text-primary focus:ring-primary"
                  />
                  <div>
                    <p className="text-[12px] font-bold text-ink">{tenant.name}</p>
                    <p className="font-mono text-[9.5px] text-muted" dir="ltr">
                      {tenant.code} — {tenant.businessType || 'عام'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {targetRecord && statusMeta ? (
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9.5px] font-bold ${statusMeta.color}`}
                      >
                        <statusMeta.icon className="h-3 w-3" />
                        {statusMeta.label}
                      </span>
                      {targetRecord.error && (
                        <span className="text-[9.5px] text-danger max-w-[150px] truncate" title={targetRecord.error}>
                          {targetRecord.error}
                        </span>
                      )}
                      {onMarkTargetStatus && (
                        <select
                          className="rounded border border-line text-[10px] p-1 bg-surface"
                          value={targetRecord.status}
                          disabled={!canManageProduct}
                          onChange={(e) => onMarkTargetStatus(targetRecord.id, e.target.value as PlatformReleaseTarget['status'])}
                        >
                          <option value="PENDING">قيد الانتظار</option>
                          <option value="SUCCESS">نجح التحديث</option>
                          <option value="FAILED">فشل</option>
                          <option value="SKIPPED">تخطي</option>
                        </select>
                      )}
                    </div>
                  ) : (
                    <span className="text-[10px] text-muted">غير مدرج بالتحديث</span>
                  )}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  </Modal>
);
