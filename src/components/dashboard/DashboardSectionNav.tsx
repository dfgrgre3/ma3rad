import React from 'react';
import { SECTIONS_CONFIG, type SectionId } from './types';

interface DashboardSectionNavProps {
  activeTab: SectionId;
  onSelectSection: (section: SectionId) => void;
}

export const DashboardSectionNav: React.FC<DashboardSectionNavProps> = ({ activeTab, onSelectSection }) => {
  return (
    <nav aria-label="أقسام لوحة المعلومات" className="no-scrollbar flex gap-0.5 overflow-x-auto border-b border-[#d9d9d9] dark:border-[#3d3d3d]">
      {SECTIONS_CONFIG.map((section) => {
        const Icon = section.icon;
        const selected = activeTab === section.id;
        return (
          <button
            key={section.id}
            type="button"
            onClick={() => onSelectSection(section.id)}
            aria-pressed={selected}
            className={`win-pivot ${selected ? 'win-pivot--active' : ''}`}
          >
            <Icon className="h-3.5 w-3.5" /> {section.label}
            {section.badge && (
              <span className={`rounded-[2px] px-1.5 py-0.5 text-[9px] font-semibold ${selected ? 'bg-[#e5f1fb] text-[#005a9e] dark:bg-[#0f3550] dark:text-[#8ec8f5]' : 'bg-[#f0f0f0] text-[#4d4d4d] dark:bg-[#3a3a3a] dark:text-[#c8c8c8]'}`}>
                {section.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
};
