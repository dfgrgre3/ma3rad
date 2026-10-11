import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  ShieldCheck, Search, Filter, Calendar, 
  User, ChevronDown, ChevronUp, Activity, 
  Users, Box, RefreshCw, FileText, Loader2
} from 'lucide-react';
import { AuditService, AuditLogEntry, AuditStats } from '../services/AuditService';

// Singleton instance to prevent re-creation on every render
const auditService = new AuditService();

export const AuditLogView: React.FC = () => {
  // --- State ---
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [modules, setModules] = useState<string[]>([]);
  
  // Pagination & Filters
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [selectedModule, setSelectedModule] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  
  // UI State
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);

  // --- Debounce Search ---
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset page on search change
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  // --- Data Fetching ---
  
  // Load static/semi-static data once
  const loadInitialData = useCallback(async () => {
    try {
      const statsData = auditService.getAuditStats();
      setStats(statsData);
      const mods = auditService.getModulesList();
      setModules(mods);
    } catch (e) {
      console.error("Failed to load initial audit data", e);
    } finally {
      setIsLoadingInitial(false);
    }
  }, []);

  // Load logs based on filters
  const loadLogs = useCallback(async () => {
    setIsLoadingLogs(true);
    try {
      const result = auditService.getAuditLogs({
        module: selectedModule || undefined,
        search: debouncedSearch || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        page,
        pageSize
      });
      setLogs(result.logs);
      setTotal(result.total);
    } catch (e) {
      console.error("Failed to load audit logs", e);
    } finally {
      setIsLoadingLogs(false);
    }
  }, [selectedModule, debouncedSearch, dateFrom, dateTo, page, pageSize]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    if (!isLoadingInitial) {
      loadLogs();
    }
  }, [loadLogs, isLoadingInitial]);

  // --- Helpers ---
  const totalPages = Math.ceil(total / pageSize);

  const getModuleColor = (module: string) => {
    const colors: Record<string, string> = {
      'PRODUCTS': 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 border-sky-200 dark:border-sky-800',
      'INVENTORY': 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800',
      'SALES': 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
      'PURCHASES': 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800',
      'CUSTOMERS': 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200 dark:border-purple-800',
      'SUPPLIERS': 'bg-pink-50 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400 border-pink-200 dark:border-pink-800',
      'CASHIER': 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 border-rose-200 dark:border-rose-800',
      'USERS': 'bg-cyan-50 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800',
      'SETTINGS': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700',
    };
    return colors[module] || colors['SETTINGS'];
  };

  const formatJson = (jsonStr: string | null | undefined) => {
    if (!jsonStr) return null;
    try {
      const obj = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
      return JSON.stringify(obj, null, 2);
    } catch {
      return jsonStr;
    }
  };

  if (isLoadingInitial) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
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
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-indigo-600" />
            سجل المراجعة والأمان
          </h2>
          <p className="text-xs text-slate-500 mt-1">تتبع دقيق لجميع العمليات والتغييرات التي يقوم بها المستخدمون</p>
        </div>
        <button 
          onClick={loadLogs}
          disabled={isLoadingLogs}
          className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-xs shadow-sm"
        >
          <RefreshCw className={`w-4 h-4 ${isLoadingLogs ? 'animate-spin' : ''}`} />
          تحديث السجل
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">إجمالي السجلات</div>
              <div className="text-xl font-black text-slate-900 dark:text-white">{stats.totalLogs.toLocaleString('ar')}</div>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-900/30 text-sky-600 flex items-center justify-center">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">عمليات اليوم</div>
              <div className="text-xl font-black text-sky-600">{stats.todayActions.toLocaleString('ar')}</div>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 flex items-center justify-center">
              <Box className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">الوحدات النشطة</div>
              <div className="text-xl font-black text-indigo-600">{stats.byModule.length}</div>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">المستخدمين النشطين</div>
              <div className="text-xl font-black text-emerald-600">{stats.byUser.length}</div>
            </div>
          </div>
        </div>
      )}

      {/* Filters Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col lg:flex-row items-stretch lg:items-center gap-4 text-xs font-bold">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="بحث باسم المستخدم، الإجراء، أو المعرف..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-4 pr-9 py-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
          />
        </div>
        
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-[160px]">
            <Filter className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <select
              value={selectedModule}
              onChange={(e) => { setSelectedModule(e.target.value); setPage(1); }}
              className="w-full pl-4 pr-9 py-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 appearance-none cursor-pointer focus:border-indigo-500 outline-none"
            >
              <option value="">جميع الوحدات</option>
              {modules.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-1">
            <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="bg-transparent border-none outline-none text-xs py-1.5 w-28 cursor-pointer text-slate-700 dark:text-slate-300"
            />
            <span className="text-slate-300">|</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="bg-transparent border-none outline-none text-xs py-1.5 w-28 cursor-pointer text-slate-700 dark:text-slate-300"
            />
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto relative min-h-[400px]">
          {isLoadingLogs && (
            <div className="absolute inset-0 bg-white/80 dark:bg-slate-900/80 z-10 flex items-center justify-center backdrop-blur-[1px]">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
          )}
          
          <table className="w-full text-right text-xs whitespace-nowrap">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-800 sticky top-0 z-[1]">
              <tr>
                <th className="p-3.5 w-10 text-center">#</th>
                <th className="p-3.5">التاريخ والوقت</th>
                <th className="p-3.5">المستخدم</th>
                <th className="p-3.5">الإجراء</th>
                <th className="p-3.5">الوحدة</th>
                <th className="p-3.5">معرف السجل</th>
                <th className="p-3.5 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {logs.length === 0 && !isLoadingLogs ? (
                <tr>
                  <td colSpan={7} className="py-20 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                    <Search className="w-10 h-10 opacity-20" />
                    <span>لا توجد سجلات مطابقة لمعايير البحث الحالية</span>
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <React.Fragment key={log.id}>
                    <tr 
                      className={`group transition-colors ${expandedLog === log.id ? 'bg-slate-50 dark:bg-slate-800/40' : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/20'}`}
                    >
                      <td className="p-3.5 text-center">
                        <button
                          onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                          className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 transition-colors"
                        >
                          {expandedLog === log.id ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                      <td className="p-3.5 font-mono text-slate-500 tabular-nums text-[11px]">{log.createdAt}</td>
                      <td className="p-3.5">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 flex items-center justify-center shrink-0">
                            <User className="w-4 h-4" />
                          </div>
                          <span className="font-bold text-slate-900 dark:text-white">{log.userName}</span>
                        </div>
                      </td>
                      <td className="p-3.5 font-bold text-slate-800 dark:text-slate-200">{log.action}</td>
                      <td className="p-3.5">
                        <span className={`px-2.5 py-1 rounded-md font-bold text-[10px] border ${getModuleColor(log.module)}`}>
                          {log.module}
                        </span>
                      </td>
                      <td className="p-3.5 font-mono text-[10px] text-slate-400 select-all">{log.recordId || '-'}</td>
                      <td className="p-3.5 text-center">
                         {/* Placeholder for future actions like "Restore" */}
                      </td>
                    </tr>
                    
                    {/* Expanded Details Row */}
                    {expandedLog === log.id && (
                      <tr className="bg-slate-50/50 dark:bg-slate-800/20 animate-in fade-in duration-200">
                        <td colSpan={7} className="p-0">
                          <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 border-t border-slate-100 dark:border-slate-800/50">
                            {log.oldValues && (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2 text-xs font-bold text-red-600/80">
                                  <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                                  القيم السابقة (قبل التعديل)
                                </div>
                                <pre className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-red-100 dark:border-red-900/20 text-[11px] font-mono text-slate-600 dark:text-slate-400 overflow-x-auto shadow-sm leading-relaxed">
                                  {formatJson(log.oldValues)}
                                </pre>
                              </div>
                            )}
                            {log.newValues && (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2 text-xs font-bold text-emerald-600/80">
                                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                                  القيم الجديدة (بعد التعديل)
                                </div>
                                <pre className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-emerald-100 dark:border-emerald-900/20 text-[11px] font-mono text-slate-600 dark:text-slate-400 overflow-x-auto shadow-sm leading-relaxed">
                                  {formatJson(log.newValues)}
                                </pre>
                              </div>
                            )}
                            {!log.oldValues && !log.newValues && (
                              <div className="col-span-full text-center text-slate-400 text-xs py-4 italic">
                                لا توجد تفاصيل إضافية مسجلة لهذا الإجراء
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs bg-slate-50/50 dark:bg-slate-900/50">
            <span className="text-slate-500 font-medium">
              عرض <span className="font-black text-slate-900 dark:text-white">{logs.length}</span> من أصل <span className="font-black text-slate-900 dark:text-white">{total.toLocaleString('ar')}</span> سجل
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1 || isLoadingLogs}
                className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                السابق
              </button>
              <span className="px-3 font-bold text-slate-900 dark:text-white tabular-nums">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages || isLoadingLogs}
                className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                التالي
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};