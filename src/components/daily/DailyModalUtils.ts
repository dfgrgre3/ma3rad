export const input = 'w-full px-3 py-2 text-sm border border-line-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-primary';
export const label = 'block text-[11px] font-semibold text-ink-secondary mb-1';
export const fmt = (value: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(value) || 0);
