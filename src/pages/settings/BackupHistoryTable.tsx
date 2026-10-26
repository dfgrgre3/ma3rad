import React from 'react';
import { Clock } from 'lucide-react';

interface BackupHistoryTableProps {
  history: any[];
  formatSize: (bytes: number) => string;
}

export const BackupHistoryTable: React.FC<BackupHistoryTableProps> = ({ history, formatSize }) => (
<>
      {/* Backup History Table */}
      <div className="px-6 pb-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4 border-b border-slate-200 pb-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-500" />
              سجل النسخ الاحتياطية السابقة
            </h3>
            <span className="text-xs text-slate-500">{history.length} عمليات مسجلة</span>
          </div>

          {history.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              لم يتم تسجيل أي عمليات نسخ سابقة بعد.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-200">
                    <th className="pb-2.5">اسم الملف</th>
                    <th className="pb-2.5">حجم الملف</th>
                    <th className="pb-2.5">نوع النسخ</th>
                    <th className="pb-2.5">الحالة</th>
                    <th className="pb-2.5">التاريخ والوقت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/40">
                  {history.map((row: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-100 transition">
                      <td className="py-2.5 font-mono text-slate-700 font-bold">{row.file_name}</td>
                      <td className="py-2.5 font-mono text-slate-500">{formatSize(row.file_size_bytes)}</td>
                      <td className="py-2.5 text-slate-500">{row.backup_type}</td>
                      <td className="py-2.5">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600">
                          {row.status}
                        </span>
                      </td>
                      <td className="py-2.5 font-mono text-slate-500">{row.created_at}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
</>
);
