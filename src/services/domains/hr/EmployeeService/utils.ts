/** Pure date/money/schedule helpers shared by the EmployeeService modules. */

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function daysBetweenInclusive(start: string, end: string): number {
  const startTime = Date.parse(`${start}T00:00:00Z`);
  const endTime = Date.parse(`${end}T00:00:00Z`);
  return Math.max(0, Math.floor((endTime - startTime) / 86_400_000) + 1);
}

export function countScheduledWorkdays(
  start: string,
  end: string,
  assignments: Array<{ effectiveFrom: string; effectiveTo: string | null; workdaysJson: string }>,
  holidayDates: Set<string>,
  fallbackWorkdays: number,
  monthDays: number
): number {
  let scheduled = 0;
  let cursor = start;
  while (cursor <= end) {
    if (!holidayDates.has(cursor)) {
      const assignment = assignments.find((row) =>
        row.effectiveFrom <= cursor && (!row.effectiveTo || row.effectiveTo >= cursor)
      );
      if (!assignment) {
        scheduled += fallbackWorkdays / monthDays;
      } else {
        const weekday = new Date(`${cursor}T00:00:00Z`).getUTCDay();
        if ((JSON.parse(assignment.workdaysJson) as number[]).includes(weekday)) scheduled += 1;
      }
    }
    const next = new Date(`${cursor}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    cursor = next.toISOString().slice(0, 10);
  }
  return scheduled;
}

export function countLeaveDays(
  start: string,
  end: string,
  assignments: Array<{ effectiveFrom: string; effectiveTo: string | null; workdaysJson: string }>,
  holidayDates: Set<string>
): number {
  let days = 0;
  for (let cursor = start; cursor <= end;) {
    if (!holidayDates.has(cursor)) {
      const assignment = assignments.find((row) =>
        row.effectiveFrom <= cursor && (!row.effectiveTo || row.effectiveTo >= cursor)
      );
      if (!assignment || (JSON.parse(assignment.workdaysJson) as number[])
        .includes(new Date(`${cursor}T00:00:00Z`).getUTCDay())) {
        days += 1;
      }
    }
    const next = new Date(`${cursor}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    cursor = next.toISOString().slice(0, 10);
  }
  return days;
}

export function isEmployeeScheduledOn(
  date: string,
  assignments: Array<{ effectiveFrom: string; effectiveTo: string | null; workdaysJson: string }>,
  holidayDates: Set<string>
): boolean {
  if (holidayDates.has(date)) return false;
  const assignment = assignments.find((row) =>
    row.effectiveFrom <= date && (!row.effectiveTo || row.effectiveTo >= date)
  );
  if (!assignment) return true;
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return (JSON.parse(assignment.workdaysJson) as number[]).includes(weekday);
}

export function isValidPayrollPeriod(period: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(period);
}

export const WORKING_HOURS_PER_DAY = 8;

export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function fingerprintPayrollSources(value: unknown): string {
  const serialized = JSON.stringify(value);
  let hash = 14_695_981_039_346_656_037n;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= BigInt(serialized.charCodeAt(index));
    hash = (hash * 1_099_511_628_211n) & 0xffff_ffff_ffff_ffffn;
  }
  return hash.toString(16).padStart(16, '0');
}

export function normalizePhone(phone: string): string {
  return phone.trim()
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0));
}
