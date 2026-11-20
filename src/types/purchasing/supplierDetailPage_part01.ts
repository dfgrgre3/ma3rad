import React from 'react';
import { Building2, FileText, DollarSign, ShoppingBag, RotateCcw, Receipt, ShieldCheck, TrendingDown } from 'lucide-react';

export type Tab = 'overview' | 'invoices' | 'payments' | 'orders' | 'returns' | 'statement' | 'scorecard' | 'price_history';

export const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'نظرة عامة', icon: Building2 },
  { id: 'invoices', label: 'فواتير الشراء والتوريد', icon: FileText },
  { id: 'payments', label: 'سندات الصرف والمدفوعات', icon: DollarSign },
  { id: 'orders', label: 'أوامر الشراء', icon: ShoppingBag },
  { id: 'returns', label: 'مرتجعات الشراء', icon: RotateCcw },
  { id: 'statement', label: 'كشف الحساب التفصيلي', icon: Receipt },
  { id: 'scorecard', label: 'سجل أداء المورد', icon: ShieldCheck },
  { id: 'price_history', label: 'سجل أسعار الشراء', icon: TrendingDown },
];

export const PAY_STATUS_BADGES: Record<string, { label: string; className: string }> = {
  PAID: { label: 'مدفوع بالكامل', className: 'bg-success-soft text-success border-success-border' },
  PARTIAL: { label: 'مدفوع جزئياً', className: 'bg-warning-soft text-warning border-warning-border' },
  UNPAID: { label: 'غير مسدد (آجل)', className: 'bg-danger-soft text-danger border-danger-border' },
};

export const ORDER_STATUS_BADGES: Record<string, { label: string; className: string }> = {
  DRAFT: { label: 'مسودة', className: 'bg-surface-sunken text-ink border-line' },
  PENDING: { label: 'معلق', className: 'bg-warning-soft text-warning border-warning-border' },
  SENT: { label: 'مرسل للمورد', className: 'bg-accent-soft text-primary border-accent-border' },
  PARTIALLY_RECEIVED: { label: 'مستلم جزئياً', className: 'bg-accent-soft text-primary border-accent-border' },
  RECEIVED: { label: 'مستلم بالكامل', className: 'bg-success-soft text-success border-success-border' },
  CANCELLED: { label: 'ملغي', className: 'bg-danger-soft text-danger border-danger-border' },
};

export interface SupplierInvoiceRow {
  id: string | number;
  invoice_number: string;
  date: string;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  payment_status: string;
  notes?: string | null;
  created_at?: string;
}

export interface SupplierPaymentRow {
  id: string | number;
  receipt_number: string;
  date: string;
  amount: number;
  payment_type: string;
  notes?: string | null;
  register_id?: string | null;
  created_at?: string;
}

export interface SupplierOrderRow {
  id: string | number;
  order_number: string;
  date: string;
  expected_delivery_date?: string | null;
  total_amount: number;
  status: string;
  created_at?: string;
}

export interface SupplierReturnRow {
  id: string | number;
  return_number: string;
  date: string;
  total_amount: number;
  reason?: string | null;
  created_at?: string;
}
