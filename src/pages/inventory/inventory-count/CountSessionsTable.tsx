import React from 'react';
import { CheckCircle2, ChevronRight, FileText, ScanLine } from 'lucide-react';
import { fmtCountCurrency } from './helpers';
import type { CountSession } from './types';

interface CountSessionsTableProps {
  loading: boolean;
  sessions: CountSession[];
  onOpenSession: (session: CountSession) => void;
}

export const CountSessionsTable: React.FC<CountSessionsTableProps> = ({ loading, sessions, onOpenSession }) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="w-6 h-6 bg-violet-600 rounded-lg animate-bounce" />
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3 text-slate-500">
        <ScanLine className="w-10 h-10 opacity-30" />
        <p className="text-sm">لا توجد جلسات جرد سابقة</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            {['كود الجلسة', 'المخزن المستهدف', 'التاريخ', 'المسؤول', 'الأصناف', 'الفروقات', 'قيمة الفروقات', 'الحالة', 'الخيارات'].map(h => (
              <th key={h} className="px-4 py-3 text-right text-xs font-bold text-slate-500">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {sessions.map((session) => (
            <tr key={session.id} className="hover:bg-slate-100 transition">
              <td className="px-4 py-3 font-mono text-sky-600 font-bold">{session.code}</td>
              <td className="px-4 py-3 text-slate-900 font-medium">{session.warehouse}</td>
              <td className="px-4 py-3 text-slate-500">{session.startDate}</td>
              <td className="px-4 py-3 text-slate-700">{session.countedBy}</td>
              <td className="px-4 py-3 text-slate-700 font-bold">{session.itemsCount} صنف</td>
              <td className="px-4 py-3 text-slate-405">
                {session.status === 'POSTED' ? `${session.itemsWithVariance} أصناف` : '—'}
              </td>
              <td className="px-4 py-3 font-mono">
                {session.status === 'POSTED' ? (
                  session.totalVarianceValue > 0 ? (
                    <span className="text-rose-600 font-bold">{fmtCountCurrency(session.totalVarianceValue)}</span>
                  ) : (
                    <span className="text-emerald-600">مطابق</span>
                  )
                ) : '—'}
              </td>
              <td className="px-4 py-3">
                {session.status === 'POSTED' ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 flex items-center gap-1 w-fit">
                    <CheckCircle2 className="w-3 h-3" /> مطابق ومرحل
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20 flex items-center gap-1 w-fit animate-pulse">
                    قيد الجرد والتعبئة
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                <button
                  onClick={() => onOpenSession(session)}
                  className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700 font-bold transition"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>{session.status === 'POSTED' ? 'عرض التقرير' : 'إدخال الجرد'}</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
