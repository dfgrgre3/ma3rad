import React from 'react';
import type { CashShift } from '../../../types';
import { CeramicMath } from '../../../utils/products/ceramicMath';

interface Props {
  lastClosedShift: CashShift | null;
  autoCloseEnabled: boolean;
  onAutoCloseEnabledChange: (enabled: boolean) => void;
  autoCloseTime: string;
  onAutoCloseTimeChange: (time: string) => void;
  canManageShifts: boolean;
  onSaveSchedule: () => void;
}

export const AutoCloseScheduleCard: React.FC<Props> = ({
  lastClosedShift,
  autoCloseEnabled,
  onAutoCloseEnabledChange,
  autoCloseTime,
  onAutoCloseTimeChange,
  canManageShifts,
  onSaveSchedule,
}) => {
  return (
    <div className="bg-surface p-5 rounded-2xl border border-line shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
      <div>
        <h3 className="font-extrabold text-sm text-ink">جدول إغلاق الوردية وترحيل الرصيد</h3>
        <p className="text-xs text-muted mt-1">
          {lastClosedShift
            ? `آخر رصيد مُرحّل: ${CeramicMath.formatCurrency(lastClosedShift.actualEndingCash ?? lastClosedShift.expectedEndingCash)} — عند فتح الوردية التالية سيُقترح تلقائيًا.`
            : 'سيُقترح رصيد الخزينة تلقائيًا عند فتح أول وردية.'}
        </p>
        <p className="text-[11px] text-muted mt-1">الإقفال التلقائي يسجل الرصيد المتوقع، ويُنفّذ عند وقت الجدول إذا كان التطبيق يعمل أو بعد الموعد.</p>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <label htmlFor="auto-close-enabled" className="flex items-center gap-2 text-xs font-bold text-ink">
          <input
            id="auto-close-enabled"
            type="checkbox"
            checked={autoCloseEnabled}
            disabled={!canManageShifts}
            onChange={(e) => onAutoCloseEnabledChange(e.target.checked)}
            className="w-4 h-4 accent-success"
          />
          تفعيل الإغلاق التلقائي
        </label>
        <input
          type="time"
          value={autoCloseTime}
          disabled={!canManageShifts || !autoCloseEnabled}
          onChange={(e) => onAutoCloseTimeChange(e.target.value)}
          className="px-3 py-2 border border-line rounded-lg text-sm font-bold disabled:bg-surface-sunken"
          aria-label="وقت إغلاق الوردية تلقائيًا"
        />
        {canManageShifts && (
          <button onClick={onSaveSchedule} className="px-4 py-2 bg-primary hover:bg-primary text-white rounded-lg text-xs font-bold">
            حفظ الجدول
          </button>
        )}
      </div>
    </div>
  );
};
