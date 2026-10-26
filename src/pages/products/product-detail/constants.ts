import React from 'react';
import {
  Package, Layers, BarChart3, ShoppingBag, DollarSign, GitBranch,
  Image, FileText, History, Activity, Palette,
} from 'lucide-react';

export type Tab = 'overview' | 'inventory' | 'sales' | 'purchases' | 'pricing' | 'variants' | 'images' | 'documents' | 'history' | 'activity' | 'batches';

export const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'نظرة عامة', icon: Package },
  { id: 'batches', label: 'الدفعات والنغمات', icon: Palette },
  { id: 'inventory', label: 'المخزون', icon: Layers },
  { id: 'sales', label: 'المبيعات', icon: BarChart3 },
  { id: 'purchases', label: 'المشتريات', icon: ShoppingBag },
  { id: 'pricing', label: 'الأسعار', icon: DollarSign },
  { id: 'variants', label: 'الأنواع والمتغيرات', icon: GitBranch },
  { id: 'images', label: 'الصور', icon: Image },
  { id: 'documents', label: 'المستندات', icon: FileText },
  { id: 'history', label: 'السجل', icon: History },
  { id: 'activity', label: 'النشاط', icon: Activity },
];

export const GRADE_LABELS: Record<string, string> = { GRADE_1: 'فرز أول', GRADE_2: 'فرز ثاني', GRADE_3: 'فرز ثالث', COMMERCIAL: 'تجاري' };

export const SURFACE_LABELS: Record<string, string> = { FLOOR: 'أرضيات', WALL: 'حوائط', OUTDOOR: 'خارجي', GENERAL: 'عام' };

export const DOC_TYPES: Record<string, string> = {
  DATASHEET: 'بيانات فنية', CERTIFICATE: 'شهادة', WARRANTY: 'ضمان', CATALOG: 'كتالوج', OTHER: 'أخرى',
};
