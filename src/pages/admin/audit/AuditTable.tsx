import React from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { ChevronDown, ChevronUp, Loader2, User } from 'lucide-react';
import type { AuditLogEntry } from '../../../services/domains/security/AuditService';
import { formatJson, getModuleColor } from '../../../types/admin/audit';

interface Props {
  logs: AuditLogEntry[];
  total: number;
  page: number;
  totalPages: number;
  isLoading: boolean;
  expandedLog: string | null;
  onToggleExpand: (id: string) => void;
  onPageChange: (newPage: number) => void;
}

export const AuditTable: React.FC<Props> = ({
  logs,
  total,
  page,
  totalPages,
  isLoading,
  expandedLog,
  onToggleExpand,
  onPageChange,
}) => {
  return (
    <div className="bg-surface rounded-2xl border border-line shadow-sm overflow-hidden flex flex-col">
      <div className="overflow-x-auto relative min-h-[400px]">
        {isLoading && (
          <div className="absolute inset-0 bg-surface/80 z-10 flex items-center justify-center backdrop-blur-[1px]">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}

        <DataTable
          ariaLabel="سجل المراجعة"
          rows={logs}
          rowKey={(log) => log.id}
          loading={isLoading}
          dense
          stickyHeader
          tableClassName="text-xs whitespace-nowrap"
          isRowExpanded={(log) => expandedLog === log.id}
          rowClassName={(log) => (expandedLog === log.id ? 'bg-surface-muted' : '')}
          renderExpandedRow={(log) => (
            <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-2">
              {log.oldValues && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-danger/80">
                    <div className="h-1.5 w-1.5 rounded-full bg-danger" />
                    القيم السابقة (قبل التعديل)
                  </div>
                  <pre className="overflow-x-auto rounded-xl border border-danger-border bg-surface p-4 font-mono text-[11px] leading-relaxed text-ink-secondary shadow-sm">
                    {formatJson(log.oldValues)}
                  </pre>
                </div>
              )}
              {log.newValues && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-success/80">
                    <div className="h-1.5 w-1.5 rounded-full bg-success" />
                    القيم الجديدة (بعد التعديل)
                  </div>
                  <pre className="overflow-x-auto rounded-xl border border-success-border bg-surface p-4 font-mono text-[11px] leading-relaxed text-ink-secondary shadow-sm">
                    {formatJson(log.newValues)}
                  </pre>
                </div>
              )}
              {!log.oldValues && !log.newValues && (
                <div className="col-span-full py-4 text-center text-xs italic text-muted">
                  لا توجد تفاصيل إضافية مسجلة لهذا الإجراء
                </div>
              )}
            </div>
          )}
          columns={[
            {
              key: 'toggle', header: '#', align: 'center',
              render: (log) => {
                const isExpanded = expandedLog === log.id;
                return (
                  <button
                    onClick={() => onToggleExpand(log.id)}
                    className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-sunken"
                  >
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                );
              },
            },
            { key: 'date', header: 'التاريخ والوقت', render: (log) => <span className="font-mono text-[11px] tabular-nums text-muted">{log.createdAt}</span> },
            {
              key: 'user', header: 'المستخدم',
              render: (log) => (
                <span className="flex items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-primary">
                    <User className="h-4 w-4" />
                  </span>
                  <span className="font-bold text-ink">{log.userName}</span>
                </span>
              ),
            },
            { key: 'action', header: 'الإجراء', render: (log) => <span className="font-bold text-ink">{log.action}</span> },
            {
              key: 'module', header: 'الوحدة',
              render: (log) => <span className={`rounded-md border px-2.5 py-1 text-[10px] font-bold ${getModuleColor(log.module)}`}>{log.module}</span>,
            },
            { key: 'record', header: 'معرف السجل', render: (log) => <span className="select-all font-mono text-[10px] text-muted">{log.recordId || '-'}</span> },
            { key: 'empty', header: '', align: 'center', render: () => null },
          ]}
          emptyTitle="لا توجد سجلات مطابقة لمعايير البحث الحالية"
        />
      </div>

      {totalPages > 1 && (
        <div className="p-4 border-t border-line flex flex-col sm:flex-row items-center justify-between gap-4 text-xs bg-surface-sunken">
          <span className="text-muted font-medium">
            عرض <span className="font-black text-ink">{logs.length}</span> من أصل <span className="font-black text-ink">{total.toLocaleString('ar')}</span> سجل
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page === 1 || isLoading}
              className="px-4 py-2 bg-surface border border-line rounded-lg font-bold text-ink-secondary hover:bg-surface-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              السابق
            </button>
            <span className="px-3 font-bold text-ink tabular-nums">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              disabled={page === totalPages || isLoading}
              className="px-4 py-2 bg-surface border border-line rounded-lg font-bold text-ink-secondary hover:bg-surface-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              التالي
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
