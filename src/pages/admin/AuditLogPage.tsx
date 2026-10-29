import React from 'react';
import { Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAuditLogs } from './audit/useAuditLogs';
import { AuditStatsCards } from './audit/AuditStatsCards';
import { AuditFilterBar } from './audit/AuditFilterBar';
import { AuditTable } from './audit/AuditTable';

export const AuditLogPage: React.FC = () => {
  const {
    logs,
    stats,
    modules,
    total,
    page,
    totalPages,
    selectedModule,
    search,
    dateFrom,
    dateTo,
    expandedLog,
    isLoadingLogs,
    isLoadingInitial,
    setPage,
    setSelectedModule,
    setSearch,
    setDateFrom,
    setDateTo,
    toggleExpand,
    refresh,
  } = useAuditLogs();

  if (isLoadingInitial) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin ml-2" />
        جاري تحميل بيانات المراجعة...
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-indigo-600" />
            سجل المراجعة والأمان
          </h2>
          <p className="text-xs text-slate-500 mt-1">تتبع دقيق لجميع العمليات والتغييرات التي يقوم بها المستخدمون</p>
        </div>
        <button
          onClick={() => void refresh()}
          disabled={isLoadingLogs}
          className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl flex items-center gap-2 hover:bg-slate-50 transition-colors text-xs shadow-sm"
        >
          <RefreshCw className={`w-4 h-4 ${isLoadingLogs ? 'animate-spin' : ''}`} />
          تحديث السجل
        </button>
      </div>

      <AuditStatsCards stats={stats} />

      <AuditFilterBar
        search={search}
        onSearchChange={setSearch}
        selectedModule={selectedModule}
        onModuleChange={setSelectedModule}
        modules={modules}
        dateFrom={dateFrom}
        onDateFromChange={setDateFrom}
        dateTo={dateTo}
        onDateToChange={setDateTo}
      />

      <AuditTable
        logs={logs}
        total={total}
        page={page}
        totalPages={totalPages}
        isLoading={isLoadingLogs}
        expandedLog={expandedLog}
        onToggleExpand={toggleExpand}
        onPageChange={setPage}
      />
    </div>
  );
};

export default AuditLogPage;
