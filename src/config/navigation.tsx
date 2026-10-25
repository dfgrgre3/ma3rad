import {
  LayoutDashboard, TrendingUp, ShoppingCart, Receipt, FileText, Package2,
  RotateCcw as RotateCcl, Layers, BookOpen, ArrowLeftRight, ScanLine, Scale,
  Wrench, Package, FolderTree, Tags, Ruler, Percent, Star, Barcode, Users,
  UserRound, Workflow, Activity, Boxes, Handshake, ClipboardList, ClipboardCheck, ShoppingBag,
  Undo2, Wallet, TrendingDown, Banknote, CalendarDays, Building2, Warehouse, PackageCheck,
  HardHat, Truck, Car, BarChart3, CheckSquare, Bell, ShieldCheck, Settings,
  Download, Cpu, SlidersHorizontal, BadgeDollarSign, BookmarkPlus, FileSpreadsheet, MessageCircle,
  Trash2,
} from 'lucide-react';
import type { ComponentType } from 'react';

export interface NavItemDef {
  label: string;
  to: string;
  icon: ComponentType<{ className?: string }>;
  perm?: string;
  highlight?: boolean;
  badge?: number;
}

export interface NavGroupDef {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  color: string;
  perm?: string;
  items: NavItemDef[];
}

/**
 * Single navigation source for both the mega-menu header and any sidebar.
 * Visibility is driven by `perm`; ordering/labels/hidden items can be
 * overridden by the admin and are stored in system_settings.
 */
export const NAV_GROUPS: NavGroupDef[] = [
  {
    id: 'dashboard',
    label: 'الرئيسية',
    icon: LayoutDashboard,
    color: 'text-sky-600',
    items: [
      { label: 'لوحة المعلومات', to: '/dashboard', icon: LayoutDashboard, perm: 'dashboard.view' },
      { label: 'Executive Dashboard', to: '/dashboard/executive', icon: TrendingUp, perm: 'dashboard.view' },
    ],
  },
  {
    id: 'daily',
    label: 'العمليات اليومية',
    icon: CalendarDays,
    color: 'text-blue-600',
    items: [
      { label: 'مبيعات اليوم', to: '/daily/sales', icon: Receipt, perm: 'sales.view' },
      { label: 'مشتريات اليوم', to: '/daily/purchases', icon: ShoppingBag, perm: 'purchases.view' },
      { label: 'منصرف اليوم', to: '/daily/expenses', icon: TrendingDown, perm: 'cashier.expense' },
      { label: 'ديون اليوم', to: '/daily/debts', icon: Banknote, perm: 'finance.debts.view' },
    ],
  },
  {
    id: 'sales',
    label: 'المبيعات',
    icon: ShoppingCart,
    color: 'text-emerald-600',
    perm: 'sales.view',
    items: [
      { label: 'نقطة البيع (POS)', to: '/pos', icon: ShoppingCart, highlight: true, perm: 'sales.create' },
      { label: 'فواتير المبيعات', to: '/sales', icon: Receipt, perm: 'sales.view' },
      { label: 'تحليلات المبيعات', to: '/sales/analytics', icon: Activity, perm: 'sales.view' },
      { label: 'عروض الأسعار', to: '/quotations', icon: FileText, perm: 'quotations.view' },
      { label: 'الطلبات', to: '/orders', icon: Package2, perm: 'orders.view' },
      { label: 'المرتجعات', to: '/returns', icon: RotateCcl, perm: 'returns.view' },
    ],
  },
  {
    id: 'inventory',
    label: 'المخزون',
    icon: Layers,
    color: 'text-violet-600',
    perm: 'inventory.view',
    items: [
      { label: 'نظرة عامة', to: '/inventory', icon: Layers, perm: 'inventory.view' },
      { label: 'الأصناف في المخزن', to: '/inventory/warehouse-stock', icon: Warehouse, perm: 'inventory.view' },
      { label: 'مقارنة المعرض والمخزن', to: '/inventory/showroom-stock', icon: Building2, perm: 'inventory.view' },
      { label: 'سجل المخزون', to: '/inventory/ledger', icon: BookOpen, perm: 'inventory.view' },
      { label: 'التحويلات', to: '/inventory/transfers', icon: ArrowLeftRight, perm: 'inventory.transfer' },
      { label: 'الجرد', to: '/inventory/counts', icon: ScanLine, perm: 'inventory.count' },
      { label: 'التقييم والتسعير', to: '/inventory/valuation', icon: Scale, perm: 'inventory.view' },
      { label: 'التسويات', to: '/inventory/adjustments', icon: Wrench, perm: 'inventory.adjust' },
      { label: 'حجوزات المخزون', to: '/inventory/reservations', icon: BookmarkPlus, perm: 'inventory.view' },
    ],
  },
  {
    id: 'products',
    label: 'المنتجات',
    icon: Package,
    color: 'text-amber-600',
    perm: 'products.view',
    items: [
      { label: 'دليل الأصناف', to: '/products', icon: Package, perm: 'products.view' },
      { label: 'التصنيفات', to: '/categories', icon: FolderTree, perm: 'categories.view' },
      { label: 'الماركات', to: '/brands', icon: Tags, perm: 'brands.view' },
      { label: 'الخصائص الديناميكية', to: '/products/attributes', icon: Ruler, perm: 'products.view' },
      { label: 'قوائم الأسعار', to: '/pricing', icon: Percent, perm: 'pricing.view' },
      { label: 'العروض والخصومات', to: '/promotions', icon: Star, perm: 'promotions.view' },
      { label: 'الباركود', to: '/products/barcodes', icon: Barcode, perm: 'products.view' },
    ],
  },
  {
    id: 'crm',
    label: 'CRM والعملاء',
    icon: Users,
    color: 'text-pink-600',
    perm: 'customers.view',
    items: [
      { label: 'العملاء', to: '/customers', icon: Users, perm: 'customers.view' },
      { label: 'منتجات العملاء الخارجية', to: '/customers/imported-products', icon: MessageCircle, perm: 'customers.view' },
      { label: 'طلبات جاهزة للتسليم', to: '/customers/ready-deliveries', icon: PackageCheck, perm: 'customers.view' },
      { label: 'العملاء المحتملون', to: '/crm/leads', icon: UserRound, perm: 'crm.view' },
      { label: 'Pipeline المبيعات', to: '/crm/pipeline', icon: Workflow, perm: 'crm.view' },
      { label: 'الأنشطة والمتابعة', to: '/crm/activities', icon: Activity, perm: 'crm.view' },
      { label: 'الحملات التسويقية', to: '/crm/campaigns', icon: Star, perm: 'crm.view' },
      { label: 'المشاريع', to: '/projects', icon: Boxes, perm: 'projects.view' },
    ],
  },
  {
    id: 'purchasing',
    label: 'المشتريات',
    icon: ShoppingBag,
    color: 'text-orange-600',
    perm: 'purchases.view',
    items: [
      { label: 'الموردون', to: '/suppliers', icon: Handshake, perm: 'suppliers.view' },
      { label: 'طلبات الشراء', to: '/purchases/requests', icon: ClipboardList, perm: 'purchases.view' },
      { label: 'أوامر الشراء', to: '/purchases/orders', icon: ClipboardCheck, perm: 'purchases.view' },
      { label: 'المنتجات المنتظرة للوصول', to: '/purchases/incoming', icon: PackageCheck, perm: 'purchases.view' },
      { label: 'فواتير الشراء', to: '/purchases', icon: ShoppingBag, perm: 'purchases.view' },
      { label: 'مرتجعات الشراء', to: '/purchases/returns', icon: Undo2, perm: 'purchases.return' },
    ],
  },
  {
    id: 'finance',
    label: 'المالية',
    icon: Wallet,
    color: 'text-cyan-600',
    perm: 'cashier.view',
    items: [
      { label: 'نظرة عامة', to: '/finance', icon: TrendingUp, perm: 'finance.view' },
      { label: 'الخزائن والورديات', to: '/cashboxes', icon: Wallet, perm: 'cashier.view' },
      { label: 'المصروفات', to: '/finance/expenses', icon: TrendingDown, perm: 'cashier.expense' },
      { label: 'دليل الحسابات', to: '/finance/accounts', icon: BookOpen, perm: 'finance.view' },
      { label: 'القيود اليومية', to: '/finance/journal', icon: FileText, perm: 'finance.view' },
      { label: 'الشيكات', to: '/finance/cheques', icon: Banknote, perm: 'finance.view' },
      { label: 'الأصول الثابتة', to: '/finance/assets', icon: Building2, perm: 'finance.view' },
      { label: 'الديون والذمم', to: '/finance/debts', icon: Banknote, perm: 'finance.debts.view' },
      { label: 'المستحقات الأخرى', to: '/finance/other-receivables', icon: ClipboardList, perm: 'finance.debts.view' },
      { label: 'الأقساط', to: '/finance/installments', icon: CalendarDays, perm: 'finance.installments.view' },
    ],
  },
  {
    id: 'operations',
    label: 'العمليات',
    icon: Building2,
    color: 'text-slate-500',
    perm: 'operations.view',
    items: [
      { label: 'الفروع', to: '/branches', icon: Building2, perm: 'branches.view' },
      { label: 'المخازن', to: '/warehouses', icon: Warehouse, perm: 'warehouses.view' },
      { label: 'الموظفون', to: '/employees', icon: HardHat, perm: 'employees.view' },
      { label: 'الحضور والانصراف', to: '/employees/attendance', icon: CheckSquare, perm: 'employees.view' },
      { label: 'الرواتب والمسحوبات', to: '/employees/payroll', icon: Wallet, perm: 'employees.view' },
      { label: 'عمولات المبيعات', to: '/employees/commissions', icon: BadgeDollarSign, perm: 'employees.view' },
      { label: 'التوصيل', to: '/deliveries', icon: Truck, perm: 'deliveries.view' },
      { label: 'السائقون', to: '/drivers', icon: UserRound, perm: 'drivers.view' },
      { label: 'المركبات', to: '/vehicles', icon: Car, perm: 'vehicles.view' },
    ],
  },
  {
    id: 'reports',
    label: 'التقارير',
    icon: BarChart3,
    color: 'text-teal-600',
    perm: 'reports.view',
    items: [
      { label: 'مركز التقارير', to: '/reports', icon: BarChart3, perm: 'reports.view' },
      { label: 'القوائم المالية', to: '/reports/statements', icon: Scale, perm: 'reports.view' },
      { label: 'الأرباح والخسائر', to: '/reports/profit-loss', icon: TrendingUp, perm: 'reports.view' },
      { label: 'ضريبة القيمة المضافة', to: '/reports/tax', icon: Percent, perm: 'reports.view' },
    ],
  },
  {
    id: 'approvals',
    label: 'الموافقات',
    icon: CheckSquare,
    color: 'text-yellow-500',
    perm: 'approvals.view',
    items: [
      { label: 'صندوق الموافقات', to: '/approvals', icon: CheckSquare, perm: 'approvals.view' },
    ],
  },
  {
    id: 'system',
    label: 'النظام',
    icon: Settings,
    color: 'text-slate-500',
    perm: 'settings.view',
    items: [
      { label: 'مركز التحكم', to: '/admin', icon: SlidersHorizontal, highlight: true, perm: 'admin.view' },
      { label: 'مركز استيراد البيانات', to: '/data-import', icon: FileSpreadsheet, perm: 'settings.view' },
      { label: 'الإشعارات', to: '/notifications', icon: Bell, perm: 'notifications.view' },
      { label: 'سجل التدقيق', to: '/audit', icon: ShieldCheck, perm: 'audit.view' },
      { label: 'مركز الأمان', to: '/security', icon: ShieldCheck, perm: 'users.view' },
      { label: 'المستخدمون', to: '/users', icon: UserRound, perm: 'users.view' },
      { label: 'حذف البيانات', to: '/admin/data-deletion', icon: Trash2, perm: 'admin.data' },
      { label: 'النسخ الاحتياطي', to: '/backup', icon: Download, perm: 'settings.backup' },
      { label: 'صحة النظام', to: '/system-health', icon: Cpu, perm: 'settings.view' },
      { label: 'الإعدادات', to: '/settings', icon: Settings, perm: 'settings.view' },
    ],
  },
];

export const NAV_STORAGE_KEYS = {
  hidden: 'nav.hidden',
  labels: 'nav.labels',
  groupsOrder: 'nav.groupsOrder',
  itemsOrder: 'nav.itemsOrder',
} as const;
