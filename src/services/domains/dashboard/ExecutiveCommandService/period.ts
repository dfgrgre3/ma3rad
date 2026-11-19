import { differenceInCalendarDays, format, startOfDay, startOfMonth, startOfYear, subDays } from 'date-fns';
import type { CommandPeriod, CommandRange } from '../../../../types/dashboard/executiveCommand';

export function resolvePeriod(range: CommandRange): CommandPeriod {
  const now = new Date();
  const end = startOfDay(now);
  let start: Date;
  let label: string;
  let previousLabel: string;

  switch (range) {
    case 'today':
      start = end;
      label = 'اليوم';
      previousLabel = 'الأمس';
      break;
    case 'week':
      start = subDays(end, 6);
      label = 'آخر ٧ أيام';
      previousLabel = 'الـ٧ أيام السابقة';
      break;
    case 'month':
      start = startOfMonth(end);
      label = 'الشهر حتى تاريخه';
      previousLabel = 'نفس الفترة من الشهر السابق';
      break;
    case 'year':
    default:
      start = startOfYear(end);
      label = 'السنة حتى تاريخه';
      previousLabel = 'نفس الفترة من السنة السابقة';
      break;
  }

  const days = Math.max(1, differenceInCalendarDays(end, start) + 1);
  const previousEnd = subDays(start, 1);
  const previousStart = subDays(previousEnd, days - 1);

  return {
    range,
    from: format(start, 'yyyy-MM-dd'),
    to: format(end, 'yyyy-MM-dd'),
    previousFrom: format(previousStart, 'yyyy-MM-dd'),
    previousTo: format(previousEnd, 'yyyy-MM-dd'),
    days,
    label,
    previousLabel,
  };
}
