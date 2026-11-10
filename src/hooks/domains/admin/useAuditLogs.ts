import { useState, useEffect, useCallback } from 'react';
import { AuditService, type AuditTimelineEntry, type AuditTimelineSource, type AuditTimelineStats } from '../../../services/domains/security/AuditService';

const auditService = new AuditService();
const PAGE_SIZE = 50;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'تعذر تحميل بيانات سجل المراجعة.';
}

export function useAuditLogs() {
  const [logs, setLogs] = useState<AuditTimelineEntry[]>([]);
  const [stats, setStats] = useState<AuditTimelineStats | null>(null);
  const [modules, setModules] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [selectedModule, setSelectedModuleState] = useState('');
  const [selectedSource, setSelectedSourceState] = useState<AuditTimelineSource | ''>('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dateFrom, setDateFromState] = useState('');
  const [dateTo, setDateToState] = useState('');
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const loadOverview = useCallback(async () => {
    try {
      setStats(auditService.getAuditTimelineStats());
      setModules(auditService.getAuditTimelineModules());
      setOverviewError(null);
    } catch (error) {
      setStats(null);
      setModules([]);
      setOverviewError(messageOf(error));
    } finally {
      setIsLoadingInitial(false);
    }
  }, []);

  const loadLogs = useCallback(async () => {
    setIsLoadingLogs(true);
    try {
      const result = auditService.getAuditTimeline({
        module: selectedModule || undefined,
        source: selectedSource || undefined,
        search: debouncedSearch || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setLogs(result.logs);
      setTotal(result.total);
      setTimelineError(null);
    } catch (error) {
      setLogs([]);
      setTotal(0);
      setTimelineError(messageOf(error));
    } finally {
      setIsLoadingLogs(false);
    }
  }, [selectedModule, selectedSource, debouncedSearch, dateFrom, dateTo, page]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (!isLoadingInitial) void loadLogs();
  }, [loadLogs, isLoadingInitial]);

  const setSelectedModule = (value: string) => {
    setSelectedModuleState(value);
    setPage(1);
  };
  const setSelectedSource = (value: AuditTimelineSource | '') => {
    setSelectedSourceState(value);
    setPage(1);
  };
  const setDateFrom = (value: string) => {
    setDateFromState(value);
    setPage(1);
  };
  const setDateTo = (value: string) => {
    setDateToState(value);
    setPage(1);
  };
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const toggleExpand = (id: string) => setExpandedLog((prev) => (prev === id ? null : id));

  const refresh = useCallback(async () => {
    await Promise.all([loadOverview(), loadLogs()]);
  }, [loadOverview, loadLogs]);

  return {
    logs,
    stats,
    modules,
    total,
    page,
    totalPages,
    selectedModule,
    selectedSource,
    search,
    dateFrom,
    dateTo,
    expandedLog,
    isLoadingLogs,
    isLoadingInitial,
    error: timelineError || overviewError,
    setPage,
    setSelectedModule,
    setSelectedSource,
    setSearch,
    setDateFrom,
    setDateTo,
    toggleExpand,
    refresh,
  };
}
