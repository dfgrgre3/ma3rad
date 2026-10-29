import React from 'react';
import { Calendar, Filter, Search } from 'lucide-react';

interface Props {
  search: string;
  onSearchChange: (val: string) => void;
  selectedModule: string;
  onModuleChange: (val: string) => void;
  modules: string[];
  dateFrom: string;
  onDateFromChange: (val: string) => void;
  dateTo: string;
  onDateToChange: (val: string) => void;
}

export const AuditFilterBar: React.FC<Props> = ({
  search,
  onSearchChange,
  selectedModule,
  onModuleChange,
  modules,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
}) => {
  return (
    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col lg:flex-row items-stretch lg:items-center gap-4 text-xs font-bold">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          placeholder="بحث باسم المستخدم، الإجراء، أو المعرف..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-4 pr-9 py-2.5 bg-slate-50 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[160px]">
          <Filter className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <select
            value={selectedModule}
            onChange={(e) => onModuleChange(e.target.value)}
            className="w-full pl-4 pr-9 py-2.5 bg-slate-50 rounded-xl border border-slate-200 appearance-none cursor-pointer focus:border-indigo-500 outline-none"
          >
            <option value="">جميع الوحدات</option>
            {modules.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 bg-slate-50 rounded-xl border border-slate-200 px-3 py-1">
          <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => onDateFromChange(e.target.value)}
            className="bg-transparent border-none outline-none text-xs py-1.5 w-28 cursor-pointer text-slate-700"
          />
          <span className="text-slate-700">|</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => onDateToChange(e.target.value)}
            className="bg-transparent border-none outline-none text-xs py-1.5 w-28 cursor-pointer text-slate-700"
          />
        </div>
      </div>
    </div>
  );
};
