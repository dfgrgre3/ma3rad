import React from 'react';
import { ChevronDown, ChevronUp, User } from 'lucide-react';
import type { AuditLogEntry } from '../../../services/domains/security/AuditService';
import { formatJson, getModuleColor } from '../../../types/admin/audit';

interface Props {
  log: AuditLogEntry;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export const AuditTableRow: React.FC<Props> = ({ log, isExpanded, onToggleExpand }) => {
  return (
    <>
      <tr className={`group transition-colors ${isExpanded ? 'bg-surface-muted' : 'hover:bg-surface-sunken'}`}>
        <td className="p-3.5 text-center">
          <button
            onClick={onToggleExpand}
            className="p-1.5 rounded-lg hover:bg-surface-sunken text-muted transition-colors"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </td>
        <td className="p-3.5 font-mono text-muted tabular-nums text-[11px]">{log.createdAt}</td>
        <td className="p-3.5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-accent-soft text-primary flex items-center justify-center shrink-0">
              <User className="w-4 h-4" />
            </div>
            <span className="font-bold text-ink">{log.userName}</span>
          </div>
        </td>
        <td className="p-3.5 font-bold text-ink">{log.action}</td>
        <td className="p-3.5">
          <span className={`px-2.5 py-1 rounded-md font-bold text-[10px] border ${getModuleColor(log.module)}`}>
            {log.module}
          </span>
        </td>
        <td className="p-3.5 font-mono text-[10px] text-muted select-all">{log.recordId || '-'}</td>
        <td className="p-3.5 text-center" />
      </tr>

      {isExpanded && (
        <tr className="bg-surface-sunken animate-in fade-in duration-200">
          <td colSpan={7} className="p-0">
            <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 border-t border-line">
              {log.oldValues && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-danger/80">
                    <div className="w-1.5 h-1.5 rounded-full bg-danger" />
                    القيم السابقة (قبل التعديل)
                  </div>
                  <pre className="bg-surface p-4 rounded-xl border border-danger-border text-[11px] font-mono text-ink-secondary overflow-x-auto shadow-sm leading-relaxed">
                    {formatJson(log.oldValues)}
                  </pre>
                </div>
              )}
              {log.newValues && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-success/80">
                    <div className="w-1.5 h-1.5 rounded-full bg-success" />
                    القيم الجديدة (بعد التعديل)
                  </div>
                  <pre className="bg-surface p-4 rounded-xl border border-success-border text-[11px] font-mono text-ink-secondary overflow-x-auto shadow-sm leading-relaxed">
                    {formatJson(log.newValues)}
                  </pre>
                </div>
              )}
              {!log.oldValues && !log.newValues && (
                <div className="col-span-full text-center text-muted text-xs py-4 italic">
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
