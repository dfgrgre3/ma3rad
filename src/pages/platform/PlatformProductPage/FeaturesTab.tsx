import React from 'react';
import { Sparkles, Pencil, Users } from 'lucide-react';
import { DataTable } from '../../../components/ui/DataTable';
import type { PlatformFeatureFlag } from '../../../services/domains/platform/platformTypes';
import { EmptyState, Toggle } from '../components/PlatformUI';

interface FeaturesTabProps {
  features: PlatformFeatureFlag[];
  canManageProduct: boolean;
  onToggleFeature: (flag: PlatformFeatureFlag) => void;
  onOpenFeature: (flag?: PlatformFeatureFlag) => void;
  onOpenOverrides: (flag: PlatformFeatureFlag) => void;
}

export const FeaturesTab: React.FC<FeaturesTabProps> = ({
  features,
  canManageProduct,
  onToggleFeature,
  onOpenFeature,
  onOpenOverrides,
}) => (
  <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
    {features.length === 0 ? (
      <EmptyState
        icon={<Sparkles className="h-5 w-5" />}
        title="لا توجد مزايا"
        description="أضف ميزة للتحكم في إتاحتها للمشتركين وتخصيص الـ Feature Flags."
      />
    ) : (
      <div className="overflow-x-auto">
        <DataTable
          ariaLabel="مزايا المنتج"
          rows={features}
          rowKey={(flag) => flag.id}
          minWidth={900}
          tableClassName="text-[10.5px]"
          columns={[
            {
              key: 'feature', header: 'الميزة والرمز',
              render: (flag) => (
                <span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-[12px] font-bold text-ink">{flag.name}</span>
                    {flag.isStagingOnly && (
                      <span className="rounded bg-warning-soft px-1.5 py-0.5 text-[9px] font-bold text-warning">
                        بيئة اختبار (Staging)
                      </span>
                    )}
                  </span>
                  <span className="block font-mono text-[9.5px] text-muted" dir="ltr">{flag.code}</span>
                  {flag.description && <span className="block text-[10px] text-muted">{flag.description}</span>}
                </span>
              ),
            },
            { key: 'category', header: 'الفئة', render: (flag) => <span className="text-[11px] text-ink-secondary">{flag.category || '—'}</span> },
            {
              key: 'rollout', header: 'نسبة الإتاحة والتجربة',
              render: (flag) => (
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-sunken">
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${flag.rolloutPercent}%` }} />
                  </span>
                  <span className="text-[10.5px] font-semibold text-ink-secondary">{flag.rolloutPercent}%</span>
                </span>
              ),
            },
            {
              key: 'overrides', header: 'تخصيص العملاء',
              render: (flag) => (
                <button
                  type="button"
                  onClick={() => onOpenOverrides(flag)}
                  className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-[11px] font-semibold text-ink hover:bg-surface-muted hover:border-line-strong"
                >
                  <Users className="h-3 w-3 text-primary" />
                  <span>{flag.overridesCount || 0} عملاء مخصصين</span>
                </button>
              ),
            },
            {
              key: 'status', header: 'الحالة',
              render: (flag) => <span className={`text-[10.5px] font-bold ${flag.isEnabled ? 'text-success' : 'text-muted'}`}>{flag.isEnabled ? 'مفعّلة' : 'معطّلة'}</span>,
            },
            {
              key: 'actions', header: 'إجراءات',
              render: (flag) => (
                <span className="flex items-center gap-2">
                  <Toggle checked={flag.isEnabled} onChange={() => onToggleFeature(flag)} disabled={!canManageProduct} label={flag.name} />
                  <button
                    type="button"
                    onClick={() => onOpenFeature(flag)}
                    className="rounded p-1.5 text-muted hover:bg-accent-soft hover:text-primary"
                    title="تعديل"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </span>
              ),
            },
          ]}
        />
      </div>
    )}
  </section>
);
