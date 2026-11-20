import React from 'react';
import { LayoutGrid, Sparkles } from 'lucide-react';
import type { PlatformFeatureFlag, PlatformModule, PlatformPlan } from '../../../services/domains/platform/platformTypes';
import { EmptyState, formatMoney } from '../components/PlatformUI';
import { CentralUnsupportedNotice } from '../components/CentralUnsupportedNotice';

interface PlanMatrixTabProps {
  plans: PlatformPlan[];
  modules: PlatformModule[];
  features: PlatformFeatureFlag[];
  centralActive: boolean;
  canManageProduct: boolean;
  saving: boolean;
  onToggle: (plan: PlatformPlan, section: 'modules' | 'features', code: string, checked: boolean) => void;
}

const SectionHeader: React.FC<{ icon: React.ReactNode; title: string; hint: string; count: number }> = ({ icon, title, hint, count }) => (
  <tr>
    <td colSpan={999} className="border-b border-line bg-surface-muted px-4 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[11.5px] font-black text-ink">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-surface text-muted ring-1 ring-line-strong">{icon}</span>
          {title}
          <span className="rounded-full bg-surface px-2 py-0.5 text-[9.5px] font-bold text-muted ring-1 ring-line-strong">{count}</span>
        </p>
        <p className="text-[10px] font-semibold text-muted">{hint}</p>
      </div>
    </td>
  </tr>
);

export const PlanMatrixTab: React.FC<PlanMatrixTabProps> = ({
  plans,
  modules,
  features,
  centralActive,
  canManageProduct,
  saving,
  onToggle,
}) => {
  if (plans.length === 0) {
    return <EmptyState icon={<LayoutGrid className="h-5 w-5" />} title="لا توجد خطط معرفة" description="أنشئ الباقات أولاً من صفحة خطط الاشتراك." />;
  }

  const isChecked = (plan: PlatformPlan, section: 'modules' | 'features', code: string): boolean =>
    section === 'modules' ? (plan.includedModules ?? []).includes(code) : (plan.features ?? []).includes(code);

  const includedCount = (plan: PlatformPlan, section: 'modules' | 'features'): number =>
    section === 'modules' ? (plan.includedModules ?? []).length : (plan.features ?? []).length;

  const renderRow = (section: 'modules' | 'features', item: { id: string; code: string; name: string; description?: string | null; category?: string | null }) => (
    <tr key={`${section}:${item.id || item.code}`} className="border-b border-line last:border-0 hover:bg-surface-muted/60">
      <td className="sticky right-0 min-w-[220px] bg-surface px-4 py-2.5">
        <p className="flex flex-wrap items-center gap-1.5 text-[12px] font-bold text-ink">
          {item.name}
          <span className="font-mono text-[9.5px] font-normal text-muted" dir="ltr">{item.code}</span>
        </p>
        {item.description && <p className="mt-0.5 line-clamp-1 text-[10px] text-muted">{item.description}</p>}
      </td>
      {plans.map((plan) => {
        const checked = isChecked(plan, section, item.code);
        return (
          <td key={plan.id} className="px-3 py-2.5 text-center">
            <input
              type="checkbox"
              checked={checked}
              disabled={!canManageProduct || saving || centralActive}
              onChange={(event) => onToggle(plan, section, item.code, event.target.checked)}
              className="h-4 w-4 cursor-pointer accent-success disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={`${item.name} — ${plan.name}`}
            />
          </td>
        );
      })}
    </tr>
  );

  return (
    <div className="space-y-3">
      {centralActive && <CentralUnsupportedNotice feature="تعديل مصفوفة الخطط" />}
      <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-sm">
        <table className="w-full min-w-[720px] border-collapse text-right">
          <thead>
            <tr className="border-b border-line bg-surface-muted">
              <th className="sticky right-0 min-w-[220px] bg-surface-muted px-4 py-3 text-[11px] font-black text-ink-secondary">
                الصفحة / الميزة
              </th>
              {plans.map((plan) => (
                <th key={plan.id} className="min-w-[110px] px-3 py-3 text-center">
                  <p className="text-[11.5px] font-black text-ink">{plan.name}</p>
                  <p className="mt-0.5 text-[9.5px] font-semibold text-muted" dir="ltr">
                    {formatMoney(plan.price, plan.currency)}
                  </p>
                  <p className="text-[9px] font-bold text-success">
                    {includedCount(plan, 'modules')} وحدة · {includedCount(plan, 'features')} ميزة
                  </p>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <SectionHeader
              icon={<LayoutGrid className="h-3.5 w-3.5" />}
              title="الصفحات والوحدات — ما تظهره كل باقة للعميل"
              hint="تحديد الوحدة يضيفها تلقائياً لكل العملاء المشتركين في الباقة"
              count={modules.length}
            />
            {modules.map((module) => renderRow('modules', module))}
            <SectionHeader
              icon={<Sparkles className="h-3.5 w-3.5" />}
              title="المميزات — قدرات إضافية داخل الوحدات"
              hint="المميزات المضمّنة بالباقة تُفعّل للعملاء الافتراضيين فيها"
              count={features.length}
            />
            {features.map((feature) => renderRow('features', feature))}
          </tbody>
        </table>
      </div>
      {!canManageProduct && (
        <p className="text-[11px] font-semibold text-muted">تحتاج صلاحية إدارة المنتج لتعديل المصفوفة.</p>
      )}
    </div>
  );
};
