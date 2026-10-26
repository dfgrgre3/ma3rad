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
    <div className="p-4 bg-white border-b border-slate-200 flex gap-3">
      <div className="relative flex-1">
        <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          placeholder="بحث برقم الجلسة، المخزن، أو القائم بالجرد..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-500/50 transition"
        />
      </div>
      <select value={statusFilter} onChange={(e) => onStatusFilterChange(e.target.value)} className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-700">
        <option value="ALL">{'\u0643\u0644 \u0627\u0644\u062d\u0627\u0644\u0627\u062a'}</option><option value="COUNTING">{'\u0642\u064a\u062f \u0627\u0644\u062c\u0631\u062f'}</option><option value="POSTED">{'\u0645\u0631\u062d\u0644'}</option><option value="CANCELLED">{'\u0645\u0644\u063a\u0649'}</option>
      </select>
    </div>
  );
};
