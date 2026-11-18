/**
 * money.ts — Unified minor-unit (piastre) money arithmetic.
 *
 * Storage convention (migration 213_money_minor_units):
 *   Financial columns in the general-ledger tables are stored as INTEGER
 *   piastres (1 EGP = 100 piastres). Application code keeps working in major
 *   units (EGP) at the SQL boundary:
 *     - SELECT: wrap money expressions with `/ 100.0` so rows look exactly
 *       like they did under REAL storage.
 *     - INSERT/UPDATE: wrap numeric params with `ROUND(? * 100)` and literal
 *       major-unit amounts with their piastre equivalent.
 *     - SQL-internal money↔money arithmetic (SUM, debit - credit, CASE)
 *       stays in piastres — integer math is exact — and is only divided by
 *       100.0 at the point the result leaves SQL.
 *
 * JavaScript-side arithmetic should use the helpers below instead of raw
 * floats so rounding is applied consistently (half away from zero, matching
 * SQLite ROUND and previous round2 behaviour).
 */

export const MAJOR_UNITS_PER_MINOR = 100;

/** Major units (e.g. 12.34 EGP) -> piastre integer (1234). */
export function toPiastres(major: number): number {
  const value = Number(major);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * MAJOR_UNITS_PER_MINOR);
}

/** Piastre integer -> major units. */
export function fromPiastres(piastres: number): number {
  const value = Number(piastres);
  if (!Number.isFinite(value)) return 0;
  return value / MAJOR_UNITS_PER_MINOR;
}

/** Round a major-unit amount to piastre precision (half away from zero). */
export function roundMoney(major: number): number {
  return fromPiastres(toPiastres(major));
}

/** Add major-unit amounts with piastre-exact accumulation. */
export function addMoney(...amounts: number[]): number {
  return amounts.reduce((sum, amount) => sum + toPiastres(amount), 0) / MAJOR_UNITS_PER_MINOR;
}

/** Subtract major-unit amounts with piastre-exact accumulation. */
export function subMoney(minuend: number, ...subtrahends: number[]): number {
  return (toPiastres(minuend) - subtrahends.reduce((s, a) => s + toPiastres(a), 0)) / MAJOR_UNITS_PER_MINOR;
}

/** Multiply a major-unit unit price by a quantity, rounding the line total to piastres. */
export function mulMoney(unitMajor: number, quantity: number): number {
  return fromPiastres(Math.round(toPiastres(unitMajor) * Number(quantity)));
}

/** Percentage of a major-unit amount (e.g. tax/discount), rounded to piastres. */
export function pctOf(amountMajor: number, percent: number): number {
  return fromPiastres(Math.round((toPiastres(amountMajor) * Number(percent)) / 100));
}

/** Allocate `totalMajor` across `weights` proportionally; the last share absorbs
 *  the rounding remainder so shares always sum back to the total exactly. */
export function allocateMoney(totalMajor: number, weights: number[]): number[] {
  const total = toPiastres(totalMajor);
  const weightSum = weights.reduce((s, w) => s + Number(w), 0);
  if (weightSum === 0 || weights.length === 0) return weights.map(() => 0);
  const shares = weights.map((w) => Math.floor((total * Number(w)) / weightSum));
  let remainder = total - shares.reduce((s, v) => s + v, 0);
  // Distribute the remainder one piastre at a time to the largest weights.
  const order = weights.map((w, i) => i).sort((a, b) => weights[b] - weights[a]);
  for (const i of order) {
    if (remainder <= 0) break;
    shares[i] += 1;
    remainder -= 1;
  }
  return shares.map(fromPiastres);
}

/** Format a major-unit amount for display (2 decimals, thousands separators). */
export function formatMoney(amount: number, locale = 'ar-EG'): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0);
}

const snakeToCamelKey = (s: string) => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());

/** Divide stored piastre integers back to major units for the given fields. */
export function unscaleMoneyRow<T extends Record<string, any>>(row: T, fields: readonly string[]): T {
  if (!row) return row;
  const out: any = { ...row };
  // اجمع كل المفاتيح المستهدفة أولاً (snake + camel) وقسّم كل مفتاح موجود
  // مرة واحدة فقط — القوائم قد تكرر الصيغة أو تحتوي الحقلين معاً،
  // والقسمة المتكررة على نفس المفتاح كانت تُنتج قيمًا أصغر 100 ضعف.
  const keys = new Set<string>();
  for (const f of fields) {
    keys.add(f);
    keys.add(snakeToCamelKey(f));
  }
  for (const key of keys) {
    if (out[key] !== null && out[key] !== undefined) out[key] = Number(out[key]) / MAJOR_UNITS_PER_MINOR;
  }
  return out;
}
