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
        <span className="text-[11px] font-semibold text-slate-500">
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
      <div className="flex items-center justify-between gap-3 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
        <div className="relative flex-1">
          <Search className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
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
            onClick={() => setSelectedTenantIds(tenants.map((t) => t.id))}
            className="rounded bg-white border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
          >
            تحديد الكل
          </button>
          <button
            type="button"
            onClick={() => setSelectedTenantIds([])}
            className="rounded bg-white border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
          >
            إلغاء التحديد
          </button>
        </div>
      </div>

      <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200">
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
                  isSelected ? 'bg-sky-50/40' : 'hover:bg-slate-50/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedTenantIds([...selectedTenantIds, tenant.id]);
                      } else {
                        setSelectedTenantIds(selectedTenantIds.filter((id) => id !== tenant.id));
                      }
                    }}
                    className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                  <div>
                    <p className="text-[12px] font-bold text-slate-800">{tenant.name}</p>
                    <p className="font-mono text-[9.5px] text-slate-400" dir="ltr">
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
                        <span className="text-[9.5px] text-rose-600 max-w-[150px] truncate" title={targetRecord.error}>
                          {targetRecord.error}
                        </span>
                      )}
                      <select
                        className="rounded border border-slate-200 text-[10px] p-1 bg-white"
                        value={targetRecord.status}
                        onChange={(e) => onMarkTargetStatus(targetRecord.id, e.target.value as PlatformReleaseTarget['status'])}
                      >
                        <option value="PENDING">قيد الانتظار</option>
                        <option value="SUCCESS">نجح التحديث</option>
                        <option value="FAILED">فشل</option>
                        <option value="SKIPPED">تخطي</option>
                      </select>
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-400">غير مدرج بالتحديث</span>
                  )}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  </Modal>
);
