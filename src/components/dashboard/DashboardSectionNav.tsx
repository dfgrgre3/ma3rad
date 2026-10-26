import React from 'react';
import { SECTIONS_CONFIG, type SectionId } from './types';

interface DashboardSectionNavProps {
  activeTab: SectionId;
  onSelectSection: (section: SectionId) => void;
}

export const DashboardSectionNav: React.FC<DashboardSectionNavProps> = ({ activeTab, onSelectSection }) => {
  return (
    <nav aria-label="أقسام لوحة المعلومات" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {SECTIONS_CONFIG.map((section) => {
        const Icon = section.icon;
        const selected = activeTab === section.id;
        return (
          <button key={section.id} type="button" onClick={() => onSelectSection(section.id)} aria-pressed={selected}
            className={`inline-flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-bold transition focus-visible:outline-teal-600 ${selected ? 'border-teal-800 bg-teal-800 text-white shadow-sm dark:border-teal-600 dark:bg-teal-700' : 'border-slate-200 bg-white text-slate-600 hover:border-teal-300 hover:text-teal-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-teal-700 dark:hover:text-teal-300'}`}>
            <Icon className="h-4 w-4" /> {section.label}
            {section.badge && <span className={`rounded px-1.5 py-0.5 text-[9px] ${selected ? 'bg-white/15 text-white' : 'bg-teal-50 text-teal-800 dark:bg-teal-950 dark:text-teal-300'}`}>{section.badge}</span>}
          </button>
        );
      })}
    </nav>
  );
};
