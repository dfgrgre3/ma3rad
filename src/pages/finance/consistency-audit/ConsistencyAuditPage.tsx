import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { PageHeader } from '../../../components/ui/PageHeader';
import { ActivityGate } from '../../../components/ui/ActivityGate';
import { Play, RefreshCw, Loader2, ShieldCheck, ChevronDown, ChevronUp } from 'lucide-react';
import { ConsistencyAuditService } from '../../../services/domains/finance/ConsistencyAuditService';
import { useToast } from '../../../components/ui/Toast';
import { usePermission } from '../../../hooks/domains/auth/usePermission';

interface RunRow {
  id: string;
  runType: string;
  scope: string;
  branchId: string | null;
  warehouseId: string | null;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  discrepancyBytes: number;
  triggeredBy: string;
}

interface RunDetail {
  summary: Record<string, { check: string; status: string; scanned: number; error?: string }>;
  discrepancies: Array<{
    check: string;
    key?: string;
    expected?: number | string | null;
    actual?: number | string | null;
    variance?: number | null;
    severity: string;
    details?: Record<string, unknown>;
  }>;
}

const STATUS_STYLE: Record<string, string> = {
  PASSED: 'bg-success-soft text-success border-success-border',
  DISCREPANCY: 'bg-warning-soft text-warning border-warning-border',
  FAILED: 'bg-danger-soft text-danger border-danger-border',
  RUNNING: 'bg-surface-muted text-ink-secondary border-line',
};

const CHECK_LABELS: Record<string, string> = {
  JOURNAL_BALANCE_INTEGRITY: 'توازن القيود اليومية',
  GL_VS_JOURNAL: 'الأستاذ العام مقابل اليومية',
  STOCK_VS_TRANSACTIONS: 'المخزون مقابل حركات المخزون',
  STOCK_VS_BATCHES: 'المخزون مقابل الدفعات',
  INVENTORY_VS_GL: 'المخزون مقابل حسابات الأستاذ',
};

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('ar-EG');
}

export const ConsistencyAuditPage: React.FC = () => {
  const service = useMemo(() => new ConsistencyAuditService(), []);
  const toast = useToast();
  const can = usePermission();
  const canView = can('finance.view');

  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, RunDetail>>({});

  const loadRuns = useCallback(() => {
    setLoading(true);
    try {
      setRuns(service.listRuns(100) as unknown as RunRow[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تحميل سجل التدقيق');
    } finally {
      setLoading(false);
    }
  }, [service, toast]);

  useEffect(() => {
    if (canView) loadRuns();
    else setLoading(false);
  }, [canView, loadRuns]);

  const runNow = async () => {
    setRunning(true);
    try {
      const result = await Promise.resolve().then(() => service.runAudit({ runType: 'FULL' }));
      toast.success(
        result.status === 'PASSED'
          ? 'اكتمل التدقيق — لا توجد فروقات'
          : `اكتمل التدقيق — ${result.status} (${result.discrepancyCount} فرق)`,
      );
      setExpanded(result.id);
      loadRuns();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'فشل تشغيل التدقيق');
    } finally {
      setRunning(false);
    }
  };

  const toggleRun = (id: string) => {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    if (!details[id]) {
      try {
        const detail = service.getRun(id) as unknown as RunDetail & { summary?: RunDetail['summary'] };
        setDetails((prev) => ({ ...prev, [id]: { summary: detail.summary || {}, discrepancies: detail.discrepancies || [] } }));
      } catch {
        // leave collapsed content empty on failure
      }
    }
  };

  if (!canView) {
    return (
      <div className="p-6 text-sm text-muted">لا تملك صلاحية عرض التدقيق المالي.</div>
    );
  }

  return (
    <div className="p-3 lg:p-4 bg-surface-muted min-h-0 text-ink space-y-4">
      <div className="bg-surface px-5 py-3 rounded-2xl border border-line shadow-sm">
        <PageHeader
          icon={<ShieldCheck className="h-5 w-5" />}
          title="تدقيق اتساق البيانات المالية والمخزون"
          description="فحص دوري يقارن الأرصدة والقيود والحركات والكميات — ويُسجَّل تلقائيًا مرة يوميًا عند بدء التشغيل."
          actions={<>
            <button
              type="button"
              onClick={loadRuns}
              className="p-2.5 text-ink-secondary hover:text-ink bg-surface-sunken hover:bg-surface-sunken rounded-xl transition"
              title="تحديث"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <ActivityGate element="run"><button
              type="button"
              onClick={runNow}
              disabled={running}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-success hover:bg-success disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition"
            >
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {running ? 'جارٍ التدقيق...' : 'تشغيل التدقيق الآن'}
            </button></ActivityGate>
          </>}
        />
      </div>

      <div className="bg-surface rounded-2xl border border-line shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 flex items-center justify-center text-muted">
            <Loader2 className="w-5 h-5 animate-spin ml-2" /> جارٍ التحميل...
          </div>
        ) : runs.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted">لا توجد عمليات تدقيق مسجلة بعد.</div>
        ) : (
          <DataTable
            ariaLabel="عمليات التدقيق"
            rows={runs}
            rowKey={(run) => run.id}
            loading={loading}
            onRowClick={(run) => toggleRun(run.id)}
            isRowExpanded={(run) => expanded === run.id}
            expandedRowClassName="bg-surface-muted/60"
            rowClassName={() => 'border-t border-line hover:bg-surface-muted cursor-pointer'}
            columns={[
              { key: 'time', header: 'وقت التشغيل', render: (run) => <span className="text-ink">{fmtDateTime(run.startedAt)}</span> },
              { key: 'type', header: 'النوع', render: (run) => <span className="text-ink-secondary">{run.runType}</span> },
              { key: 'scope', header: 'النطاق', render: (run) => <span className="text-ink-secondary">{run.scope}</span> },
              {
                key: 'status', header: 'الحالة',
                render: (run) => (
                  <span className={`px-2 py-1 rounded-lg border text-[11px] font-semibold ${STATUS_STYLE[run.status] || STATUS_STYLE.RUNNING}`}>
                    {run.status}
                  </span>
                ),
              },
              {
                key: 'chevron', header: '',
                render: (run) => expanded === run.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />,
              },
            ]}
            renderExpandedRow={(run) => (
              <div className="px-4 py-4">
                {!details[run.id] ? (
                  <div className="text-xs text-muted flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> جارٍ تحميل التفاصيل...
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {Object.entries(details[run.id].summary || {}).map(([key, result]) => (
                        <div key={key} className="bg-surface border border-line rounded-xl p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-ink">
                              {CHECK_LABELS[key] || result.check || key}
                            </span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded ${
                                result.status === 'PASS'
                                  ? 'bg-success-soft text-success'
                                  : result.status === 'DISCREPANCY'
                                    ? 'bg-warning-soft text-warning'
                                    : 'bg-danger-soft text-danger'
                              }`}
                            >
                              {result.status}
                            </span>
                          </div>
                          <div className="text-[10px] text-muted mt-1">
                            مفحوص: {result.scanned}
                            {result.error ? ` — ${result.error}` : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                    {(details[run.id].discrepancies || []).length > 0 && (
                      <div className="bg-surface border border-warning-border rounded-xl overflow-hidden">
                        <div className="px-3 py-2 bg-warning-soft text-warning text-xs font-semibold">
                          الفروقات ({details[run.id].discrepancies.length})
                        </div>
                        <div className="max-h-64 overflow-auto">
                          <DataTable
                                      ariaLabel="الفروقات"
                                      rows={details[run.id].discrepancies.slice(0, 100).map((d, i) => ({ ...d, __i: i }))}
                                      rowKey={(d) => String(d.__i)}
                                      dense
                                      tableClassName="text-[11px]"
                                      columns={[
                                        { key: 'check', header: 'الفحص', render: (d) => <span className="text-ink-secondary">{CHECK_LABELS[d.check] || d.check}</span> },
                                        { key: 'key', header: 'المفتاح', render: (d) => <span className="text-muted" dir="ltr">{d.key || '—'}</span> },
                                        { key: 'expected', header: 'متوقع', render: (d) => <span className="text-ink-secondary" dir="ltr">{String(d.expected ?? '—')}</span> },
                                        { key: 'actual', header: 'فعلي', render: (d) => <span className="text-ink-secondary" dir="ltr">{String(d.actual ?? '—')}</span> },
                                        { key: 'variance', header: 'الفرق', render: (d) => <span className="text-ink-secondary" dir="ltr">{String(d.variance ?? '—')}</span> },
                                      ]}
                                    />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            emptyTitle="لا توجد عمليات تدقيق مسجلة بعد."
          />
        )}
      </div>
    </div>
  );
};

export default ConsistencyAuditPage;
