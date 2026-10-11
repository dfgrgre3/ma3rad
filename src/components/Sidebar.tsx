import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, TrendingUp, ShoppingCart, Receipt, FileText, Package2,
  ClipboardList, RotateCcl, CreditCard, Package, FolderTree, Tags,
  Ruler, Percent, Barcode, Layers, ArrowLeftRight, RotateCcw,
  ScanLine, Scale, Wrench, Users, Workflow, Activity, Megaphone,
  Truck, ShoppingBag, PackageOpen, Undo2, Wallet, PiggyBank,
  Banknote, TrendingDown, Building2, Warehouse, HardHat, Car, UserRound,
  BarChart3, CheckSquare, Bell, Settings, ShieldCheck, Download, Cpu,
  ChevronDown, ChevronRight, Star, Clock, Handshake, Boxes,
  BookOpen, CalendarDays, Receipt as ReceiptIcon
} from 'lucide-react';
import { User } from '../types';
import { PermissionService } from '../services/PermissionService';

interface SidebarProps {
  currentUser: User | null;
}

interface NavItem {
  label: string;
  to: string;
  icon: React.ElementType;
  badge?: number;
  highlight?: boolean;
}

interface NavGroup {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;
  items: NavItem[];
  perm?: string;
}

// ─── Navigation Structure ─────────────────────────────────────────────────────
const NAV_GROUPS: NavGroup[] = [
  {
    id: 'dashboard',
    label: 'الرئيسية',
    icon: LayoutDashboard,
    color: 'text-sky-400',
    items: [
      { label: 'لوحة المعلومات', to: '/dashboard', icon: LayoutDashboard },
      { label: 'Executive Dashboard', to: '/dashboard/executive', icon: TrendingUp },
    ],
  },
  {
    id: 'sales',
    label: 'المبيعات',
    icon: ShoppingCart,
    color: 'text-emerald-400',
    perm: 'sales.view',
    items: [
      { label: 'نقطة البيع (POS)', to: '/pos', icon: ShoppingCart, highlight: true },
      { label: 'فواتير المبيعات', to: '/sales', icon: Receipt },
      { label: 'عروض الأسعار', to: '/quotations', icon: FileText },
      { label: 'الطلبات', to: '/orders', icon: Package2 },
      { label: 'المرتجعات', to: '/returns', icon: RotateCcl },
    ],
  },
  {
    id: 'inventory',
    label: 'المخزون',
    icon: Layers,
    color: 'text-violet-400',
    perm: 'inventory.view',
    items: [
      { label: 'نظرة عامة', to: '/inventory', icon: Layers },
      { label: 'سجل المخزون', to: '/inventory/ledger', icon: BookOpen },
      { label: 'التحويلات', to: '/inventory/transfers', icon: ArrowLeftRight },
      { label: 'الجرد', to: '/inventory/counts', icon: ScanLine },
      { label: 'التقييم والتسعير', to: '/inventory/valuation', icon: Scale },
      { label: 'التسويات', to: '/inventory/adjustments', icon: Wrench },
    ],
  },
  {
    id: 'products',
    label: 'المنتجات',
    icon: Package,
    color: 'text-amber-400',
    perm: 'products.view',
    items: [
      { label: 'دليل الأصناف', to: '/products', icon: Package },
      { label: 'التصنيفات', to: '/categories', icon: FolderTree },
      { label: 'الماركات', to: '/brands', icon: Tags },
      { label: 'الخصائص الديناميكية', to: '/products/attributes', icon: Ruler },
      { label: 'قوائم الأسعار', to: '/pricing', icon: Percent },
      { label: 'العروض والخصومات', to: '/promotions', icon: Star },
      { label: 'الباركود', to: '/products/barcodes', icon: Barcode },
    ],
  },
  {
    id: 'crm',
    label: 'CRM والعملاء',
    icon: Users,
    color: 'text-pink-400',
    perm: 'customers.view',
    items: [
      { label: 'العملاء', to: '/customers', icon: Users },
      { label: 'العملاء المحتملون', to: '/crm/leads', icon: UserRound },
      { label: 'Pipeline المبيعات', to: '/crm/pipeline', icon: Workflow },
      { label: 'الأنشطة والمتابعة', to: '/crm/activities', icon: Activity },
      { label: 'المشاريع', to: '/projects', icon: Boxes },
    ],
  },
  {
    id: 'purchasing',
    label: 'المشتريات',
    icon: ShoppingBag,
    color: 'text-orange-400',
    perm: 'purchases.view',
    items: [
      { label: 'الموردون', to: '/suppliers', icon: Handshake },
      { label: 'طلبات الشراء', to: '/purchases/requests', icon: ClipboardList },
      { label: 'فواتير الشراء', to: '/purchases', icon: ShoppingBag },
      { label: 'مرتجعات الشراء', to: '/returns', icon: Undo2 },
    ],
  },
  {
    id: 'finance',
    label: 'المالية',
    icon: Wallet,
    color: 'text-cyan-400',
    perm: 'cashier.view',
    items: [
      { label: 'نظرة عامة', to: '/finance', icon: TrendingUp },
      { label: 'الخزائن والورديات', to: '/cashboxes', icon: Wallet },
      { label: 'المصروفات', to: '/finance/expenses', icon: TrendingDown },
      { label: 'الديون والذم