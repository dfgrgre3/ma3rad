import { DEFAULT_NUMBER_TEMPLATE } from './appConfiguration_part02';

/** Apply a `{prefix}`, `{year}`, `{month}`, `{day}` or `{seq:N}` template. */
export function formatDocumentNumber(
  template: string,
  values: { prefix: string; seq: number; date?: Date },
): string {
  const date = values.date ?? new Date();
  const seq = Math.max(0, Math.trunc(values.seq));
  const source = template.trim() || DEFAULT_NUMBER_TEMPLATE;
  return source.replace(/\{(prefix|year|month|day|seq(?::(\d{1,3}))?)\}/g, (_match, token: string, pad?: string) => {
    if (token === 'prefix') return values.prefix;
    if (token === 'year') return String(date.getFullYear());
    if (token === 'month') return String(date.getMonth() + 1).padStart(2, '0');
    if (token === 'day') return String(date.getDate()).padStart(2, '0');
    const width = Math.min(Math.max(Number(pad) || 6, 1), 12);
    return String(seq).padStart(width, '0');
  });
}
