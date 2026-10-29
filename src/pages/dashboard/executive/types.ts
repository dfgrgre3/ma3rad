import React from 'react';

export interface KPI {
  label: string;
  value: string;
  sub?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  icon: React.ElementType;
  color: string;
  bg: string;
}

export interface DailySale { day: string; sales: number; profit: number }
export interface TopProduct { name: string; qty: number; revenue: number; productType: 'CERAMIC' | 'GENERAL'; baseUnit: string; customUnit?: string }
export interface RecentInvoice { id: string; customer: string; amount: number; date: string; status: string }
export interface DebtCustomer { name: string; debt: number }
export interface LowStockItem { name: string; warehouse: string; qty: number; min: number; productType: 'CERAMIC' | 'GENERAL'; baseUnit: string; customUnit?: string }

export type DateRange = 'today' | 'week' | 'month' | 'year';

export const CHART_COLORS = ['#38bdf8', '#818cf8', '#34d399', '#fb923c', '#f472b6'];

export const formatCurrency = (n: number) =>
  new Intl.NumberFormat('ar-EG', { style: 'decimal', maximumFractionDigits: 0 }).format(n) + ' ج';

export const paymentStatusLabel: Record<string, { label: string; cls: string }> = {
  PAID: { label: 'مدفوع', cls: 'bg-emerald-500/20 text-emerald-600' },
  PARTIAL: { label: 'جزئي', cls: 'bg-amber-500/20 text-amber-600' },
  UNPAID: { label: 'آجل', cls: 'bg-rose-500/20 text-rose-600' },
};
