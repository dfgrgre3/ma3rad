import React from 'react';
import { EmptyState, ErrorState, LoadingState } from './StateViews';

export interface DataTableColumn<T> {
  key: string;
  header: React.ReactNode;
  render: (row: T, index: number) => React.ReactNode;
  headerClassName?: string;
  className?: string;
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
}

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
}: DataTableProps<T>) {
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (rows.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} />;

  return (
    <div className={`ui-table-scroll ${className}`} role="region" aria-label={ariaLabel} tabIndex={0}>
      <table className={`ui-data-table ${tableClassName}`} style={minWidth ? { minWidth } : undefined}>
        <caption className="sr-only">{ariaLabel}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={column.headerClassName}>{column.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={rowKey(row)} className={rowClassName?.(row)}>
              {columns.map((column) => (
                <td key={column.key} className={column.className}>{column.render(row, index)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default DataTable;
