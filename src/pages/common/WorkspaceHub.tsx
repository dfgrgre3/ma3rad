import React, { Suspense } from 'react';
import { Link } from 'react-router-dom';
import type { ComponentType, ReactNode } from 'react';

export interface WorkspaceHubTab {
  id: string;
  label: string;
  path: string;
  icon: ComponentType<{ className?: string }>;
}

interface WorkspaceHubProps {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  tabs: WorkspaceHubTab[];
  activeTab: string;
  showHeading?: boolean;
  showTabs?: boolean;
  children: ReactNode;
}

export const WorkspaceHub: React.FC<WorkspaceHubProps> = ({
  title,
  description,
  icon: Icon,
  tabs,
  activeTab,
  showHeading = true,
  showTabs = true,
  children,
}) => (
  <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-slate-100 dark:bg-slate-950" dir="rtl">
    {(showHeading || showTabs) && (
      <header className="shrink-0 border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex w-full max-w-none flex-col gap-3 px-3 py-3 sm:gap-4 sm:px-5 sm:py-4 lg:px-7">
          {showHeading && (
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h1 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-slate-100 sm:text-xl">{title}</h1>
                <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-400 sm:text-sm">{description}</p>
              </div>
            </div>
          )}
          {showTabs && (
            <nav
              className="no-scrollbar flex w-full min-w-0 items-stretch gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 sm:gap-1.5 dark:bg-slate-800/80"
              aria-label={`أقسام ${title}`}
            >
              {tabs.map(({ id, label, path, icon: TabIcon }) => (
                <Link
                  key={id}
                  to={path}
                  aria-current={activeTab === id ? 'page' : undefined}
                  className={`relative inline-flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 whitespace-nowrap rounded-lg px-1.5 py-1.5 text-xs font-bold transition-[background-color,color,box-shadow] duration-150 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500 sm:flex-row sm:gap-2 sm:px-4 sm:py-2 lg:flex-none ${
                    activeTab === id
                      ? 'bg-white text-sky-800 shadow-sm ring-1 ring-sky-200/80 dark:bg-slate-700 dark:text-sky-300 dark:ring-sky-800'
                      : 'text-slate-600 hover:bg-white/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700/60 dark:hover:text-white'
                  }`}
                >
                  {activeTab === id && <span className="absolute inset-y-2 right-1 w-1 rounded-full bg-sky-500 dark:bg-sky-400" aria-hidden="true" />}
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg sm:h-6 sm:w-6">
                    <TabIcon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span>{label}</span>
                </Link>
              ))}
            </nav>
          )}
        </div>
      </header>
    )}
    <section className="mx-auto min-h-0 w-full max-w-none min-w-0 flex-1 overflow-y-auto">
      <Suspense fallback={<div className="p-10 text-center text-sm text-slate-600 dark:text-slate-400">جاري تحميل الصفحة...</div>}>
        {children}
      </Suspense>
    </section>
  </div>
);
