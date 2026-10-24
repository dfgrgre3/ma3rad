export const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(amount) || 0) + ' ج.م';
