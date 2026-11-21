import React from 'react';
import { Copy, Layers3 } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { EmptyState, StatusBadge, formatMoney } from '../components/PlatformUI';
import type { CatalogPlan } from './shared';

export interface CopyFromPlanModalProps {
  open: boolean;
  onClose: () => void;
  /** All catalog plans; the current plan is filtered out by the caller if needed. */
  plans: CatalogPlan[];
  /** Id of the plan currently being edited — excluded from the source list. */
  excludePlanId: string | null;
  loading: boolean;
  onCopy: (source: CatalogPlan) => void;
}

export const CopyFromPlanModal: React.FC<CopyFromPlanModalProps> = ({
  open,
  onClose,
  plans,
  excludePlanId,
  loading,
  onCopy,
}) => {
  const sources = React.useMemo(
    () => plans.filter((plan) => plan.id !== excludePlanId),
    [plans, excludePlanId]
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="نسخ الإعدادات من باقة أخرى"
      description="ينسخ الوحدات والمميزات وإعدادات إظهار الصفحات والصلاحيات من الباقة المصدر إلى مسودة الباقة الحالية — لا يُحفظ شيء حتى تضغط «تطبيق على الباقة»."
      size="lg"
    >
      {sources.length === 0 ? (
        <EmptyState icon={<Layers3 className="h-5 w-5" />} title="لا توجد باقات أخرى" description="أنشئ باقة ثانية أولاً لتصبح مصدراً للنسخ." />
      ) : (
        <div className="grid max-h-[55vh] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
          {sources.map((plan) => (
            <button
              key={plan.id}
              type="button"
              disabled={loading}
              onClick={() => onCopy(plan)}
              className="flex items-start justify-between gap-2 rounded-xl border border-line bg-surface p-3 text-right transition hover:border-success-border hover:bg-success-soft/30 disabled:opacity-50"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-[12.5px] font-black text-ink">
                  {plan.name}
                  <StatusBadge value={plan.isActive ? 'ACTIVE' : 'CANCELLED'} label={plan.isActive ? 'نشطة' : 'معطلة'} />
                </span>
                <span className="mt-0.5 block font-mono text-[10px] text-muted" dir="ltr">{plan.code}</span>
                <span className="mt-1 block text-[10.5px] text-muted">
                  {formatMoney(plan.price, plan.currency)} — {plan.includedModules.length} وحدة، {plan.features.length} ميزة
                </span>
              </span>
              <span className="mt-1 shrink-0 rounded-lg bg-accent-soft p-1.5 text-primary">
                <Copy className="h-4 w-4" />
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between rounded-xl border border-warning-border bg-warning-soft/50 px-3 py-2">
        <p className="text-[10.5px] font-semibold text-warning">
          النسخ يستبدل المسودات الحالية للباقة المحددة — يمكنك التراجع بزر «استعادة افتراضيات الباقة» قبل التطبيق.
        </p>
        <Button variant="ghost" size="sm" onClick={onClose}>إلغاء</Button>
      </div>
    </Modal>
  );
};

export default CopyFromPlanModal;
