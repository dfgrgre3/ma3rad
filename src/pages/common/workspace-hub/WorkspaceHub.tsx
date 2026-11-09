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
  <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--win-canvas)]" dir="rtl">
    {(showHeading || showTabs) && (
      <header className="shrink-0 border-b border-[var(--win-border)] bg-[var(--win-surface)]">
        <div className="mx-auto flex w-full max-w-none flex-col gap-2 px-3 py-2 sm:px-4 sm:py-3 lg:px-5">
          {showHeading && (
            <div className="flex items-center gap-3">
              <span className="erp-page-header__icon" aria-hidden="true">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h1 className="erp-page-header__title">{title}</h1>
                <p className="erp-page-header__description">{description}</p>
              </div>
            </div>
          )}
          {showTabs && (
            <nav
              className="no-scrollbar flex w-full min-w-0 items-stretch gap-1 overflow-x-auto rounded-[var(--win-radius)] bg-[var(--win-surface-sunken)] p-1"
              aria-label={`أقسام ${title}`}
            >
              {tabs.map(({ id, label, path, icon: TabIcon }) => (
                <Link
                  key={id}
                  to={path}
                  aria-current={activeTab === id ? 'page' : undefined}
                  className={`relative inline-flex min-h-9 min-w-0 flex-none items-center justify-center gap-1 whitespace-nowrap rounded-[var(--ui-radius-sm)] px-2.5 py-1 text-[11px] font-bold transition-colors duration-150 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--win-accent)] sm:gap-2 sm:px-3 ${
                    activeTab === id
                      ? 'bg-[var(--win-surface)] text-[var(--win-accent-readable)] shadow-sm'
                      : 'text-[var(--win-text-secondary)] hover:bg-[var(--win-surface)] hover:text-[var(--win-text)]'
                  }`}
                >
                  {activeTab === id && <span className="absolute inset-y-1.5 right-1 w-0.5 rounded-full bg-[var(--win-accent)]" aria-hidden="true" />}
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center">
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
      <Suspense fallback={<div className="p-6 text-center text-[13px] text-[var(--win-text-muted)]">جاري تحميل الصفحة...</div>}>
        {children}
      </Suspense>
    </section>
  </div>
);
