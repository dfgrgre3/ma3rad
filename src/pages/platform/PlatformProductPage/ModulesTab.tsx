import React from 'react';
import { Boxes, BadgeCheck } from 'lucide-react';
import type { PlatformModule } from '../../../services/domains/platform/platformTypes';
import { EmptyState, Toggle } from '../components/PlatformUI';

interface ModulesTabProps {
  modules: PlatformModule[];
  canManageProduct: boolean;
  onToggleModule: (module: PlatformModule) => void;
}

export const ModulesTab: React.FC<ModulesTabProps> = ({ modules, canManageProduct, onToggleModule }) => (
  <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
    {modules.length === 0 ? (
      <EmptyState icon={<Boxes className="h-5 w-5" />} title="لا توجد وحدات" />
    ) : (
      <div className="divide-y divide-line-strong">
        {modules.map((module) => (
          <div key={module.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-start gap-3">
              <span
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                  module.isEnabled ? 'bg-success-soft text-success' : 'bg-surface-sunken text-muted'
                }`}
              >
                <BadgeCheck className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-[12.5px] font-bold text-ink">
                  {module.name}
                  <span className="font-mono text-[9.5px] font-normal text-muted" dir="ltr">
                    {module.code}
                  </span>
                </p>
                <p className="text-[10.5px] text-muted">{module.description || 'بدون وصف'}</p>
                {module.minPlanCode && (
                  <p className="mt-0.5 text-[9.5px] font-semibold text-primary">الحد الأدنى: {module.minPlanCode}</p>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className={`text-[10.5px] font-bold ${module.isEnabled ? 'text-success' : 'text-muted'}`}>
                {module.isEnabled ? 'مفعّلة' : 'معطّلة'}
              </span>
              <Toggle checked={module.isEnabled} onChange={() => onToggleModule(module)} disabled={!canManageProduct} label={module.name} />
            </div>
          </div>
        ))}
      </div>
    )}
  </section>
);
