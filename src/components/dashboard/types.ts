import type { ElementType } from 'react';
import {
  Award, Banknote, Layers, LayoutDashboard, ShoppingBag, ShoppingCart, Target, TrendingUp, Truck,
} from 'lucide-react';

export type SectionId = 'all' | 'pulse' | 'executive' | 'sales' | 'purchases' | 'debts' | 'crm' | 'fleet' | 'hr';

export const SECTIONS_CONFIG: { id: SectionId; label: string; icon: ElementType; badge?: string }[] = [
  { id: 'all', label: 'نظرة شاملة', icon: Layers },
  { id: 'pulse', label: 'ملخص اليوم', icon: LayoutDashboard, badge: 'مباشر' },
  { id: 'executive', label: 'الأداء التنفيذي', icon: TrendingUp },
  { id: 'sales', label: 'المبيعات', icon: ShoppingCart },
  { id: 'purchases', label: 'المشتريات والمخزون', icon: ShoppingBag },
  { id: 'debts', label: 'الديون والذمم', icon: Banknote },
  { id: 'crm', label: 'العملاء', icon: Target },
  { id: 'fleet', label: 'التوصيل والأسطول', icon: Truck },
  { id: 'hr', label: 'الموارد البشرية', icon: Award },
];

export const CHART_COLORS = ['#0284c7', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

export interface SalesTrendPoint {
  date: string;
  sales: number;
  profit: number;
}

export interface TopSellingProduct {
  name: string;
  quantityM2: number;
  totalRevenue: number;
  productType: 'CERAMIC' | 'GENERAL';
  baseUnit: string;
  customUnit?: string;
}

export interface PurchaseHourlyBucket {
  total: number;
  count: number;
}

export interface PurchasePaymentMixItem {
  method: string;
  total: number;
  count: number;
}

export interface PurchaseTopSupplier {
  name: string;
  total: number;
  paid: number;
  count: number;
}

export interface PurchaseTopItem {
  name: string;
  quantity: number;
  total: number;
  invoices: Set<string>;
  productType?: 'CERAMIC' | 'GENERAL';
  baseUnit?: string;
  customUnit?: string;
}

export interface QuickActionItem {
  to: string;
  label: string;
  detail: string;
  icon: ElementType;
  tone: string;
}
