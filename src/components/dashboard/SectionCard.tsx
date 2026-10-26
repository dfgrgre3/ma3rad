import React from 'react';
import { ArrowUp } from 'lucide-react';

export interface SectionCardProps {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  badge?: string;
  onScrollTop?: () => void;
  children: React.ReactNode;
}

export const SectionCard: React.FC<SectionCardProps> = ({ id, title, subtitle, icon: Icon, iconBg, iconColor, badge, onScrollTop, children }) => {
  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs p-3.5 sm:p-4 space-y-4"
    >
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-lg ${iconBg} ${iconColor} flex items-center justify-center font-bold shrink-0`}>
            <Icon className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">{title}</h2>
              {badge && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  {badge}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
          </div>
        </div>

        {onScrollTop && (
          <button
            type="button"
            onClick={onScrollTop}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            title="العودة لأعلى الصفحة"
          >
            <ArrowUp className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">للأعلى</span>
          </button>
        )}
      </div>

      <div className="dashboard-embedded-scope [&>div]:!h-auto [&>div]:!overflow-visible [&>main]:!h-auto [&>main]:!overflow-visible [&>div]:!p-0 [&>main]:!p-0 [&>div]:!bg-transparent [&>main]:!bg-transparent [&_header]:!hidden [&_h1]:!hidden [&_.border-b.border-slate-200.px-6.py-4]:!hidden">
        {children}
      </div>
    </section>
  );
};
