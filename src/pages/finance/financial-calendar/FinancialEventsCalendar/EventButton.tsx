import React from 'react';
import type { FinancialCalendarEvent } from './types';
import { amountText, eventStatus, typeOptions } from './constants';

export const EventButton: React.FC<{
  event: FinancialCalendarEvent;
  compact?: boolean;
  onOpen: (event: FinancialCalendarEvent) => void;
}> = ({ event, compact = false, onOpen }) => {
  const type = typeOptions.find((item) => item.value === event.eventType) || typeOptions[0];
  const status = eventStatus(event);
  const Icon = type.icon;
  return (
    <button
      type="button"
      onClick={() => onOpen(event)}
      className={`w-full rounded-lg border p-2 text-right transition hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700 focus-visible:ring-offset-1 ${type.color} ${compact ? 'mb-1' : ''}`}
    >
      <span className="flex items-start gap-1.5">
        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-bold">{event.title}</span>
          <span className="mt-0.5 block truncate text-[11px] opacity-80">{amountText(event.amount, event.currency)}</span>
          {!compact && <span className={`mt-1 inline-block rounded-full px-1.5 py-0.5 text-[10px] ${status.color}`}>{status.label}</span>}
        </span>
      </span>
    </button>
  );
};
