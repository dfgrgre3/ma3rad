import React from 'react';
import { Calendar, Filter, Search } from 'lucide-react';
import { DEFAULT_LOCATIONS, type EmployeeTab } from './types';

interface EmployeeFiltersProps {
  activeTab: EmployeeTab;
  searchQuery: string;
  selectedLocation: string;
  attendanceDate: string;
  onSearchQueryChange: (value: string) => void;
  onSelectedLocationChange: (value: string) => void;
  onAttendanceDateChange: (value: string) => void;
}

export const EmployeeFilters: React.FC<EmployeeFiltersProps> = ({
  activeTab,
  searchQuery,
  selectedLocation,
  attendanceDate,
  onSearchQueryChange,
  onSelectedLocationChange,
  onAttendanceDateChange,
}) => {
  return (
    <>
      {/* Sub-toolbar (Search and Location Filter) - visible on directories, ledger, etc. */}
      {activeTab !== 'analytics' && (
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="بحث باسم العامل، رقم الهاتف، أو المسمى الوظيفي..."
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              className="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-500/50 transition"
            />
          </div>

          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200">
            <Filter className="w-4 h-4 text-slate-500" />
            <span className="text-xs text-slate-500 font-bold ml-1">حسب موقع العمل:</span>
            <select
              value={selectedLocation}
              onChange={(e) => onSelectedLocationChange(e.target.value)}
              className="bg-transparent text-xs text-slate-800 font-bold focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-white text-slate-800">الكل</option>
              {DEFAULT_LOCATIONS.map(loc => (
                <option key={loc} value={loc} className="bg-white text-slate-800">{loc}</option>
              ))}
            </select>
          </div>

          {activeTab === 'attendance' && (
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200">
              <Calendar className="w-4 h-4 text-slate-500" />
              <span className="text-xs text-slate-500 font-bold">تاريخ الحضور:</span>
              <input
                type="date"
                value={attendanceDate}
                onChange={(e) => onAttendanceDateChange(e.target.value)}
                className="bg-transparent text-xs text-slate-800 font-bold focus:outline-none cursor-pointer"
              />
            </div>
          )}
        </div>
      )}
    </>
  );
};
