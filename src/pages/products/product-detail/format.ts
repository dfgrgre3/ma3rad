export const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(n ?? 0);
export const money = (n: number) => `${fmt(n)} ج.م`;
