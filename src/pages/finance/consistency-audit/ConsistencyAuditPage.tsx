import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTable } from '../../../components/ui/DataTable';
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
  PASSED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  DISCREPANCY: 'bg-amber-50 text-amber-700 border-amber-200',
  FAILED: 'bg-red-50 text-red-700 border-red-200',
  RUNNING: 'bg-slate-50 text-slate-600 border-slate-200',
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
      <div className="p-6 text-sm text-slate-500">لا تملك صلاحية عرض التدقيق المالي.</div>
    );
  }

  return (
    <div className="p-3 lg:p-4 bg-slate-50 min-h-0 text-slate-900 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">تدقيق اتساق البيانات المالية والمخزون</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              فحص دوري يقارن الأرصدة والقيود والحركات والكميات — ويُسجَّل تلقائيًا مرة يوميًا عند بدء التشغيل.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadRuns}
            className="p-2.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
            title="تحديث"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={runNow}
            disabled={running}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {running ? 'جارٍ التدقيق...' : 'تشغيل التدقيق الآن'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 flex items-center justify-center text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin ml-2" /> جارٍ التحميل...
          </div>
        ) : runs.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-400">لا توجد عمليات تدقيق مسجلة بعد.</div>
        ) : (
          <DataTable
            ariaLabel="عمليات التدقيق"
            rows={runs}
            rowKey={(run) => run.id}
            loading={loading}
            onRowClick={(run) => toggleRun(run.id)}
            isRowExpanded={(run) => expanded === run.id}
            expandedRowClassName="bg-slate-50/60"
            rowClassName={() => 'border-t border-slate-100 hover:bg-slate-50 cursor-pointer'}
            columns={[
              { key: 'time', header: 'وقت التشغيل', render: (run) => <span className="text-slate-700">{fmtDateTime(run.startedAt)}</span> },
              { key: 'type', header: 'النوع', render: (run) => <span className="text-slate-600">{run.runType}</span> },
              { key: 'scope', header: 'النطاق', render: (run) => <span className="text-slate-600">{run.scope}</span> },
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
                  <div className="text-xs text-slate-400 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> جارٍ تحميل التفاصيل...
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {Object.entries(details[run.id].summary || {}).map(([key, result]) => (
                        <div key={key} className="bg-white border border-slate-200 rounded-xl p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-700">
                              {CHECK_LABELS[key] || result.check || key}
                            </span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded ${
                                result.status === 'PASS'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : result.status === 'DISCREPANCY'
                                    ? 'bg-amber-50 text-amber-700'
                                    : 'bg-red-50 text-red-700'
                              }`}
                            >
                              {result.status}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 mt-1">
                            مفحوص: {result.scanned}
                            {result.error ? ` — ${result.error}` : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                    {(details[run.id].discrepancies || []).length > 0 && (
                      <div className="bg-white border border-amber-200 rounded-xl overflow-hidden">
                        <div className="px-3 py-2 bg-amber-50 text-amber-800 text-xs font-semibold">
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
                                        { key: 'check', header: 'الفحص', render: (d) => <span className="text-slate-600">{CHECK_LABELS[d.check] || d.check}</span> },
                                        { key: 'key', header: 'المفتاح', render: (d) => <span className="text-slate-500" dir="ltr">{d.key || '—'}</span> },
                                        { key: 'expected', header: 'متوقع', render: (d) => <span className="text-slate-600" dir="ltr">{String(d.expected ?? '—')}</span> },
                                        { key: 'actual', header: 'فعلي', render: (d) => <span className="text-slate-600" dir="ltr">{String(d.actual ?? '—')}</span> },
                                        { key: 'variance', header: 'الفرق', render: (d) => <span className="text-slate-600" dir="ltr">{String(d.variance ?? '—')}</span> },
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
