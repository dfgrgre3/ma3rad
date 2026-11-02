import React from 'react';
import { ArrowUp } from 'lucide-react';

export interface SectionCardProps {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBg?: string;
  iconColor?: string;
  badge?: string;
  onScrollTop?: () => void;
  children: React.ReactNode;
}

export const SectionCard: React.FC<SectionCardProps> = ({ id, title, subtitle, icon: Icon, badge, onScrollTop, children }) => {
  return (
    <section id={id} className="dashboard-card win-card scroll-mt-24 overflow-hidden">
      <div className="dashboard-card-header flex items-center justify-between gap-3 border-b border-[#d9d9d9] px-3.5 py-3 dark:border-[#3d3d3d] sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center">
            <Icon className="h-4 w-4 text-[#0078d4]" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-[13px] font-semibold text-[#1b1b1b] dark:text-[#f0f0f0] sm:text-sm">{title}</h2>
              {badge && (
                  <span className="rounded-[2px] border border-[#d9d9d9] bg-[#fafafa] px-1.5 py-0.5 text-[10px] font-semibold text-[#4d4d4d] dark:border-[#4a4a4a] dark:bg-[#323232] dark:text-[#c8c8c8]">
                  {badge}
                </span>
              )}
            </div>
              <p className="truncate text-[11px] text-[#767676] dark:text-[#a6a6a6]">{subtitle}</p>
          </div>
        </div>

        {onScrollTop && (
          <button
            type="button"
            onClick={onScrollTop}
            className="win-btn win-btn--ghost !min-h-7 !px-2 !text-[11px]"
            title="العودة لأعلى الصفحة"
          >
            <ArrowUp className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">للأعلى</span>
          </button>
        )}
      </div>

      <div className="dashboard-embedded-scope min-w-0 p-2.5 sm:p-4 [&>div]:!h-auto [&>div]:!overflow-visible [&>main]:!h-auto [&>main]:!overflow-visible [&>div]:!p-0 [&>main]:!p-0 [&>div]:!bg-transparent [&>main]:!bg-transparent [&_header]:!hidden [&_h1]:!hidden [&_.border-b.border-slate-200.px-6.py-4]:!hidden">
        {children}
      </div>
    </section>
  );
};
