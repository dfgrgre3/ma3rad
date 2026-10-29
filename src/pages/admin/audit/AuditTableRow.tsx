import React from 'react';
import { ChevronDown, ChevronUp, User } from 'lucide-react';
import type { AuditLogEntry } from '../../../services/AuditService';
import { formatJson, getModuleColor } from './types';

interface Props {
  log: AuditLogEntry;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export const AuditTableRow: React.FC<Props> = ({ log, isExpanded, onToggleExpand }) => {
  return (
    <>
      <tr className={`group transition-colors ${isExpanded ? 'bg-slate-50' : 'hover:bg-slate-100'}`}>
        <td className="p-3.5 text-center">
          <button
            onClick={onToggleExpand}
            className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 transition-colors"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </td>
        <td className="p-3.5 font-mono text-slate-500 tabular-nums text-[11px]">{log.createdAt}</td>
        <td className="p-3.5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <User className="w-4 h-4" />
            </div>
            <span className="font-bold text-slate-900">{log.userName}</span>
          </div>
        </td>
        <td className="p-3.5 font-bold text-slate-800">{log.action}</td>
        <td className="p-3.5">
          <span className={`px-2.5 py-1 rounded-md font-bold text-[10px] border ${getModuleColor(log.module)}`}>
            {log.module}
          </span>
        </td>
        <td className="p-3.5 font-mono text-[10px] text-slate-500 select-all">{log.recordId || '-'}</td>
        <td className="p-3.5 text-center" />
      </tr>

      {isExpanded && (
        <tr className="bg-slate-100 animate-in fade-in duration-200">
          <td colSpan={7} className="p-0">
            <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 border-t border-slate-100">
              {log.oldValues && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-red-600/80">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    القيم السابقة (قبل التعديل)
                  </div>
                  <pre className="bg-white p-4 rounded-xl border border-red-100 text-[11px] font-mono text-slate-600 overflow-x-auto shadow-sm leading-relaxed">
                    {formatJson(log.oldValues)}
                  </pre>
                </div>
              )}
              {log.newValues && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-600/80">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    القيم الجديدة (بعد التعديل)
                  </div>
                  <pre className="bg-white p-4 rounded-xl border border-emerald-100 text-[11px] font-mono text-slate-600 overflow-x-auto shadow-sm leading-relaxed">
                    {formatJson(log.newValues)}
                  </pre>
                </div>
              )}
              {!log.oldValues && !log.newValues && (
                <div className="col-span-full text-center text-slate-500 text-xs py-4 italic">
                  لا توجد تفاصيل إضافية مسجلة لهذا الإجراء
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
};
