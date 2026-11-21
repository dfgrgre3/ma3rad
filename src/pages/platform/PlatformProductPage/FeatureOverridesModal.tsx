import React from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { formatDate, inputClass } from '../components/PlatformUI';
import type { PlatformFeatureFlag, PlatformFeatureOverride, PlatformTenant } from '../../../services/domains/platform/platformTypes';

interface FeatureOverridesModalProps {
  feature: PlatformFeatureFlag | null;
  onClose: () => void;
  tenants: PlatformTenant[];
  overrides: PlatformFeatureOverride[];
  newOverrideTenantId: string;
  setNewOverrideTenantId: (v: string) => void;
  newOverrideEnabled: boolean;
  setNewOverrideEnabled: (v: boolean) => void;
  canManageProduct: boolean;
  onAddOverride: () => void;
  onRemoveOverride: (overrideId: string) => void;
}

export const FeatureOverridesModal: React.FC<FeatureOverridesModalProps> = ({
  feature,
  onClose,
  tenants,
  overrides,
  newOverrideTenantId,
  setNewOverrideTenantId,
  newOverrideEnabled,
  setNewOverrideEnabled,
  canManageProduct,
  onAddOverride,
  onRemoveOverride,
}) => (
  <Modal
    open={Boolean(feature)}
    onClose={onClose}
    title={`تخصيص الميزة: ${feature?.name ?? ''}`}
    size="lg"
  >
    <div className="space-y-4">
      <div className="rounded-lg bg-accent-soft p-3 text-[11px] text-primary">
        يمكنك هنا فرض تفعيل أو حجب الميزة لعملاء محددين بغض النظر عن نسبة الإتاحة العامة للنظام.
      </div>

      {/* Add Override Form */}
      <div className="rounded-xl border border-line bg-surface-muted/50 p-3">
        <p className="text-[11.5px] font-bold text-ink mb-2">إضافة تخصيص لعميل جديد:</p>
        <div className="grid gap-2.5 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <select className={inputClass} value={newOverrideTenantId} onChange={(e) => setNewOverrideTenantId(e.target.value)}>
              <option value="">اختر العميل المستهدف...</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.code})
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <select
              className={inputClass}
              value={newOverrideEnabled ? '1' : '0'}
              onChange={(e) => setNewOverrideEnabled(e.target.value === '1')}
            >
              <option value="1">تفعيل إجباري</option>
              <option value="0">حجب إجباري</option>
            </select>
            <Button variant="primary" size="sm" onClick={onAddOverride} disabled={!newOverrideTenantId || !canManageProduct}>
              إضافة
            </Button>
          </div>
        </div>
      </div>

      {/* Overrides Table */}
      <div className="overflow-hidden rounded-xl border border-line">
        {overrides.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted font-semibold">
            لا توجد تخصيصات خاصة لهذه الميزة بعد. تنطبق عليها قواعد الإتاحة العامة.
          </div>
        ) : (
          <DataTable
            ariaLabel="تخصيصات الميزة"
            rows={overrides}
            rowKey={(ov) => ov.id}
            dense
            tableClassName="text-[11px]"
            columns={[
              { key: 'target', header: 'العميل المستهدف', render: (ov) => <span className="font-bold text-ink">{ov.targetName || ov.targetId}</span> },
              {
                key: 'state', header: 'الحالة المفروضة',
                render: (ov) => (
                  <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${ov.isEnabled ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'}`}>
                    {ov.isEnabled ? 'مفعّل دائماً' : 'محجوب تماماً'}
                  </span>
                ),
              },
              { key: 'date', header: 'تاريخ التخصيص', render: (ov) => <span className="text-muted">{formatDate(ov.createdAt)}</span> },
              {
                key: 'action', header: 'إجراء',
                render: (ov) => (
                  <button type="button" onClick={() => onRemoveOverride(ov.id)} disabled={!canManageProduct} className="rounded px-2 py-1 text-danger hover:bg-danger-soft font-semibold disabled:opacity-40">
                    حذف
                  </button>
                ),
              },
            ]}
          />
        )}
      </div>
    </div>
  </Modal>
);
