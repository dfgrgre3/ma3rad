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
  <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
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
                    <span className="text-[12px] font-bold text-slate-800">{flag.name}</span>
                    {flag.isStagingOnly && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">
                        بيئة اختبار (Staging)
                      </span>
                    )}
                  </span>
                  <span className="block font-mono text-[9.5px] text-slate-400" dir="ltr">{flag.code}</span>
                  {flag.description && <span className="block text-[10px] text-slate-500">{flag.description}</span>}
                </span>
              ),
            },
            { key: 'category', header: 'الفئة', render: (flag) => <span className="text-[11px] text-slate-600">{flag.category || '—'}</span> },
            {
              key: 'rollout', header: 'نسبة الإتاحة والتجربة',
              render: (flag) => (
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200">
                    <span className="block h-full rounded-full bg-sky-500" style={{ width: `${flag.rolloutPercent}%` }} />
                  </span>
                  <span className="text-[10.5px] font-semibold text-slate-600">{flag.rolloutPercent}%</span>
                </span>
              ),
            },
            {
              key: 'overrides', header: 'تخصيص العملاء',
              render: (flag) => (
                <button
                  type="button"
                  onClick={() => onOpenOverrides(flag)}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300"
                >
                  <Users className="h-3 w-3 text-sky-600" />
                  <span>{flag.overridesCount || 0} عملاء مخصصين</span>
                </button>
              ),
            },
            {
              key: 'status', header: 'الحالة',
              render: (flag) => <span className={`text-[10.5px] font-bold ${flag.isEnabled ? 'text-emerald-600' : 'text-slate-400'}`}>{flag.isEnabled ? 'مفعّلة' : 'معطّلة'}</span>,
            },
            {
              key: 'actions', header: 'إجراءات',
              render: (flag) => (
                <span className="flex items-center gap-2">
                  <Toggle checked={flag.isEnabled} onChange={() => onToggleFeature(flag)} disabled={!canManageProduct} label={flag.name} />
                  <button
                    type="button"
                    onClick={() => onOpenFeature(flag)}
                    className="rounded p-1.5 text-slate-500 hover:bg-sky-50 hover:text-sky-700"
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
