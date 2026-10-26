import {
  LayoutDashboard, TrendingUp, ShoppingCart, Receipt, FileText, Package2,
  RotateCcw as RotateCcl, Layers, BookOpen, ArrowLeftRight, ScanLine, Scale,
  Wrench, Package, FolderTree, Tags, Ruler, Percent, Star, Barcode, Users,
  UserRound, Workflow, Activity, Boxes, Handshake, ClipboardList, ClipboardCheck, ShoppingBag,
  Undo2, Wallet, TrendingDown, Banknote, CalendarDays, Building2, Warehouse, PackageCheck,
  HardHat, Truck, Car, BarChart3, CheckSquare, Bell, ShieldCheck, Settings,
  Download, Cpu, SlidersHorizontal, BadgeDollarSign, BookmarkPlus, FileSpreadsheet, MessageCircle,
  Trash2, ShieldAlert, PieChart, CreditCard, Lock, Target, Award,
} from 'lucide-react';
import type { ComponentType } from 'react';
import type { NavGroupDef } from './navigationTypes';

export const NAV_GROUPS_02: NavGroupDef[] = [
{
    id: 'operations',
    label: 'العمليات',
    icon: Building2,
    color: 'text-slate-500',
    perm: 'operations.view',
    items: [
      { label: 'لوحة الأسطول والتوصيل', to: '/fleet/dashboard', icon: Truck, perm: 'deliveries.view' },
      { label: 'لوحة الموارد البشرية', to: '/hr/dashboard', icon: HardHat, perm: 'employees.view' },
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
      { label: 'الأرباح والخسائر', to: '/reports/profit-loss', icon: PieChart, perm: 'reports.view' },
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
  }
];
