import React from 'react';
import { Loader2, Search } from 'lucide-react';
import type { AuditLogEntry } from '../../../services/AuditService';
import { AuditTableRow } from './AuditTableRow';

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
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      <div className="overflow-x-auto relative min-h-[400px]">
        {isLoading && (
          <div className="absolute inset-0 bg-white/80 z-10 flex items-center justify-center backdrop-blur-[1px]">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          </div>
        )}

        <table className="w-full text-right text-xs whitespace-nowrap">
          <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 sticky top-0 z-[1]">
            <tr>
              <th className="p-3.5 w-10 text-center">#</th>
              <th className="p-3.5">التاريخ والوقت</th>
              <th className="p-3.5">المستخدم</th>
              <th className="p-3.5">الإجراء</th>
              <th className="p-3.5">الوحدة</th>
              <th className="p-3.5">معرف السجل</th>
              <th className="p-3.5 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.length === 0 && !isLoading ? (
              <tr>
                <td colSpan={7} className="py-20 text-center text-slate-500 flex flex-col items-center justify-center gap-2">
                  <Search className="w-10 h-10 opacity-20" />
                  <span>لا توجد سجلات مطابقة لمعايير البحث الحالية</span>
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <AuditTableRow
                  key={log.id}
                  log={log}
                  isExpanded={expandedLog === log.id}
                  onToggleExpand={() => onToggleExpand(log.id)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="p-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs bg-slate-100">
          <span className="text-slate-500 font-medium">
            عرض <span className="font-black text-slate-900">{logs.length}</span> من أصل <span className="font-black text-slate-900">{total.toLocaleString('ar')}</span> سجل
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page === 1 || isLoading}
              className="px-4 py-2 bg-white border border-slate-200 rounded-lg font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              السابق
            </button>
            <span className="px-3 font-bold text-slate-900 tabular-nums">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              disabled={page === totalPages || isLoading}
              className="px-4 py-2 bg-white border border-slate-200 rounded-lg font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              التالي
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
