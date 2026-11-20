import React from 'react';
import { CheckCircle2, ChevronRight, FileText } from 'lucide-react';
import { DataTable, type DataTableColumn } from '../../../components/ui/DataTable';
import { fmtCountCurrency } from './helpers';
import type { CountSession } from '../../../types/inventory/countSessions';

interface CountSessionsTableProps {
  loading: boolean;
  sessions: CountSession[];
  onOpenSession: (session: CountSession) => void;
}

export const CountSessionsTable: React.FC<CountSessionsTableProps> = ({ loading, sessions, onOpenSession }) => {
  const columns: DataTableColumn<CountSession>[] = [
    {
      key: 'code',
      header: 'كود الجلسة',
      className: 'font-mono font-bold text-primary',
      render: (session) => session.code,
    },
    {
      key: 'warehouse',
      header: 'المخزن المستهدف',
      className: 'font-medium',
      render: (session) => session.warehouse,
    },
    { key: 'date', header: 'التاريخ', className: 'text-[var(--cerami-muted)]', render: (session) => session.startDate },
    { key: 'owner', header: 'المسؤول', render: (session) => session.countedBy },
    {
      key: 'items',
      header: 'الأصناف',
      className: 'font-bold',
      render: (session) => `${session.itemsCount} صنف`,
    },
    {
      key: 'variance-count',
      header: 'الفروقات',
      render: (session) => session.status === 'POSTED' ? `${session.itemsWithVariance} أصناف` : '—',
    },
    {
      key: 'variance-value',
      header: 'قيمة الفروقات',
      className: 'font-mono',
      render: (session) => session.status !== 'POSTED'
        ? '—'
        : session.totalVarianceValue > 0
          ? <span className="font-bold text-[var(--cerami-danger)]">{fmtCountCurrency(session.totalVarianceValue)}</span>
          : <span className="text-[var(--cerami-success)]">مطابق</span>,
    },
    {
      key: 'status',
      header: 'الحالة',
      render: (session) => session.status === 'POSTED' ? (
        <span className="inline-flex w-fit items-center gap-1 rounded-full border border-success/20 bg-success/10 px-2 py-0.5 text-[10px] font-bold text-success">
          <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> مطابق ومرحل
        </span>
      ) : session.status === 'REVIEW' ? (
        <span className="rounded-full border border-accent-border bg-accent-soft px-2 py-0.5 text-[10px] font-bold text-primary">بانتظار المراجعة</span>
      ) : session.status === 'CANCELLED' ? (
        <span className="rounded-full border border-line bg-surface-sunken px-2 py-0.5 text-[10px] font-bold text-muted">ملغى</span>
      ) : (
        <span className="inline-flex w-fit items-center gap-1 rounded-full border border-warning/20 bg-warning/10 px-2 py-0.5 text-[10px] font-bold text-warning">
          قيد الجرد والتعبئة
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'الخيارات',
      render: (session) => (
        <button
          type="button"
          onClick={() => onOpenSession(session)}
          className="inline-flex items-center gap-1 rounded px-1 py-1 text-xs font-bold text-primary transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cerami-primary)]"
        >
          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{session.status === 'POSTED' ? 'عرض التقرير' : 'إدخال الجرد'}</span>
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
        </button>
      ),
    },
  ];

  return (
    <DataTable
      ariaLabel="جلسات الجرد السابقة"
      columns={columns}
      rows={sessions}
      rowKey={(session) => session.id}
      loading={loading}
      emptyTitle="لا توجد جلسات جرد سابقة"
      tableClassName="text-sm"
      minWidth={900}
      rowClassName={() => 'transition-colors hover:bg-[var(--cerami-surface-muted)]'}
    />
  );
};
