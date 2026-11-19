import React from 'react';
import { DataTable } from '../../../components/ui/DataTable';

interface Props { rows: Record<string, unknown>[]; columns: string[] }
export const AdminDataTable: React.FC<Props> = ({ rows, columns }) => (
  <DataTable
    ariaLabel="بيانات"
    rows={rows.map((row, index) => ({ __row: row, __index: index }))}
    rowKey={(r) => String(r.__index)}
    dense
    tableClassName="text-[11px]"
    columns={columns.map((column) => ({
      key: column,
      header: <span className="font-mono font-bold text-slate-600 dark:text-slate-300">{column}</span>,
      headerClassName: 'whitespace-nowrap',
      render: (row: { __row: Record<string, unknown> }) =>
        row.__row[column] == null ? <span className="text-slate-300">فارغ</span> : String(row.__row[column]),
      className: 'max-w-[220px] truncate whitespace-nowrap font-mono text-slate-600 dark:text-slate-400',
    }))}
  />
);
