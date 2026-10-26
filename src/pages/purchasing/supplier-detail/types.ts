import React from 'react';
import {
  Building2, FileText, DollarSign, ShoppingBag, RotateCcw, Receipt, ShieldCheck, TrendingDown,
} from 'lucide-react';
import { PaymentType } from '../../../types';

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
  PAID: { label: 'مدفوع بالكامل', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  PARTIAL: { label: 'مدفوع جزئياً', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  UNPAID: { label: 'غير مسدد (آجل)', className: 'bg-rose-50 text-rose-700 border-rose-200' },
};

export const ORDER_STATUS_BADGES: Record<string, { label: string; className: string }> = {
  DRAFT: { label: 'مسودة', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  PENDING: { label: 'معلق', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  SENT: { label: 'مرسل للمورد', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  PARTIALLY_RECEIVED: { label: 'مستلم جزئياً', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  RECEIVED: { label: 'مستلم بالكامل', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  CANCELLED: { label: 'ملغي', className: 'bg-rose-50 text-rose-700 border-rose-200' },
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

export interface PurchasePriceHistoryRow {
  date: string;
  invoiceNumber: string;
  productId: string | number;
  productName: string;
  quantityM2: number;
  unitCost: number;
  effectiveUnitCost: number;
  matchingStatus: string;
}

export interface SupplierStatementTransaction {
  id: string | number;
  date: string;
  type: string;
  docNumber: string;
  description: string;
  debit: number;
  credit: number;
  balanceAfter: number;
}

export interface SupplierStatement {
  openingBalance: number;
  closingBalance: number;
  transactions: SupplierStatementTransaction[];
}

export interface EditSupplierFormData {
  name: string;
  companyName: string;
  phone: string;
  email: string;
  taxNumber: string;
  commercialRecord: string;
  address: string;
  paymentTermsDays: number;
  notes: string;
}

export interface RecordPaymentFormData {
  amount: number;
  paymentType: PaymentType;
  notes: string;
}
