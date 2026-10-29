import { useState, useEffect, useCallback } from 'react';
import { AuditService, AuditLogEntry, AuditStats } from '../../../services/AuditService';

const auditService = new AuditService();

export function useAuditLogs() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [modules, setModules] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [selectedModule, setSelectedModule] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const loadInitialData = useCallback(async () => {
    try {
      setStats(auditService.getAuditStats());
      setModules(auditService.getModulesList());
    } catch (e) {
      console.error('Failed to load initial audit data', e);
    } finally {
      setIsLoadingInitial(false);
    }
  }, []);

  const loadLogs = useCallback(async () => {
    setIsLoadingLogs(true);
    try {
      const result = auditService.getAuditLogs({
        module: selectedModule || undefined,
        search: debouncedSearch || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        page,
        pageSize,
      });
      setLogs(result.logs);
      setTotal(result.total);
    } catch (e) {
      console.error('Failed to load audit logs', e);
    } finally {
      setIsLoadingLogs(false);
    }
  }, [selectedModule, debouncedSearch, dateFrom, dateTo, page, pageSize]);

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    if (!isLoadingInitial) {
      void loadLogs();
    }
  }, [loadLogs, isLoadingInitial]);

  const totalPages = Math.ceil(total / pageSize);

  const toggleExpand = (id: string) => {
    setExpandedLog((prev) => (prev === id ? null : id));
  };

  return {
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
    refresh: loadLogs,
  };
}
