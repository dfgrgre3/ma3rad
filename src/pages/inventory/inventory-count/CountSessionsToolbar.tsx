import React from 'react';
import { Search } from 'lucide-react';

interface CountSessionsToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
}

export const CountSessionsToolbar: React.FC<CountSessionsToolbarProps> = ({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
}) => {
  return (
    <div className="p-4 bg-surface border-b border-line flex gap-3">
      <div className="relative flex-1">
        <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
        <input
          type="text"
          placeholder="بحث برقم الجلسة، المخزن، أو القائم بالجرد..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-4 pr-10 py-2.5 bg-surface border border-line rounded-xl text-sm text-ink placeholder-muted focus:outline-none focus:border-primary/50 transition"
        />
      </div>
      <select value={statusFilter} onChange={(e) => onStatusFilterChange(e.target.value)} className="px-3 py-2 bg-surface border border-line rounded-xl text-sm text-ink">
        <option value="ALL">{'\u0643\u0644 \u0627\u0644\u062d\u0627\u0644\u0627\u062a'}</option><option value="COUNTING">{'\u0642\u064a\u062f \u0627\u0644\u062c\u0631\u062f'}</option><option value="REVIEW">{'\u0628\u0627\u0646\u062a\u0638\u0627\u0631 \u0627\u0644\u0645\u0631\u0627\u062c\u0639\u0629'}</option><option value="POSTED">{'\u0645\u0631\u062d\u0644'}</option><option value="CANCELLED">{'\u0645\u0644\u063a\u0649'}</option>
      </select>
    </div>
  );
};
