import React from 'react';

interface Props { rows: Record<string, unknown>[]; columns: string[] }
export const AdminDataTable: React.FC<Props> = ({ rows, columns }) => (
<table className="w-full text-right text-[11px]">
                  <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800">
                    <tr>
                      {columns.map((column) => (
                        <th key={column} className="whitespace-nowrap border-b border-slate-200 px-2 py-1.5 font-mono font-bold text-slate-600 dark:border-slate-700 dark:text-slate-300">{column}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr key={index} className="odd:bg-white even:bg-slate-50 dark:odd:bg-slate-900 dark:even:bg-slate-800/40">
                        {columns.map((column) => (
                          <td key={column} className="max-w-[220px] truncate whitespace-nowrap border-b border-slate-100 px-2 py-1.5 font-mono text-slate-600 dark:border-slate-800 dark:text-slate-400" title={String(row[column] ?? '')}>
                            {row[column] == null ? <span className="text-slate-300">فارغ</span> : String(row[column])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
);
