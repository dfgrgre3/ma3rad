import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { EmptyState, ErrorState, LoadingState } from './StateViews';

export interface DataTableColumn<T> {
  key: string;
  header: React.ReactNode;
  render: (row: T, index: number) => React.ReactNode;
  headerClassName?: string;
  className?: string;
  /** Optional numeric sizing hint; columns without one share the remaining space. */
  width?: number | string;
  align?: 'start' | 'center' | 'end';
}

export interface DataTableProps<T> {
  ariaLabel: string;
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
  tableClassName?: string;
  minWidth?: number;
  rowClassName?: (row: T) => string;
  /** Optional server/client pagination footer. */
  page?: number;
  pageCount?: number;
  total?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  stickyHeader?: boolean;
  dense?: boolean;
}

const ALIGN_CLASS = {
  start: 'text-start',
  center: 'text-center',
  end: 'text-end',
} as const;

export function DataTable<T>({
  ariaLabel,
  columns,
  rows,
  rowKey,
  loading = false,
  error,
  onRetry,
  emptyTitle = 'لا توجد بيانات',
  emptyDescription,
  className = '',
  tableClassName = '',
  minWidth,
  rowClassName,
  page,
  pageCount,
  total,
  pageSize,
  onPageChange,
  stickyHeader = false,
  dense = false,
}: DataTableProps<T>) {
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (rows.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} />;

  const showPagination = Boolean(onPageChange && pageCount && pageCount > 1 && page);
  const from = showPagination && pageSize ? (page! - 1) * pageSize + 1 : null;
  const to = showPagination && pageSize ? Math.min(page! * pageSize, total ?? page! * pageSize) : null;

  return (
    <div className={`erp-table-wrap ${className}`}>
      <div className="ui-table-scroll" role="region" aria-label={ariaLabel} tabIndex={0}>
        <table
          className={`ui-data-table ${stickyHeader ? 'erp-table--sticky' : ''} ${dense ? 'erp-table--dense' : ''} ${tableClassName}`}
          style={minWidth ? { minWidth } : undefined}
        >
          <caption className="sr-only">{ariaLabel}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={`${ALIGN_CLASS[column.align ?? 'start']} ${column.headerClassName ?? ''}`}
                  style={column.width ? { width: column.width } : undefined}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={rowKey(row)} className={rowClassName?.(row)}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`${ALIGN_CLASS[column.align ?? 'start']} ${column.className ?? ''}`}
                  >
                    {column.render(row, index)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showPagination && (
        <nav className="erp-pagination" aria-label="التنقل بين صفحات الجدول">
          <p className="erp-pagination__summary">
            {from !== null && to !== null ? `${from}–${to}` : rows.length}
            {typeof total === 'number' ? ` من ${total}` : ''}
          </p>
          <div className="erp-pagination__controls">
            <button
              type="button"
              className="erp-btn erp-btn--secondary erp-btn--sm erp-btn--icon"
              onClick={() => onPageChange!(page! - 1)}
              disabled={page! <= 1}
              aria-label="الصفحة السابقة"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="erp-pagination__page" aria-current="page">
              {page} / {pageCount}
            </span>
            <button
              type="button"
              className="erp-btn erp-btn--secondary erp-btn--sm erp-btn--icon"
              onClick={() => onPageChange!(page! + 1)}
              disabled={page! >= pageCount!}
              aria-label="الصفحة التالية"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}

export default DataTable;
