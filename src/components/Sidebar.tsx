import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, TrendingUp, ShoppingCart, Receipt, FileText, Package2,
  ClipboardList, RotateCcw as RotateCcl, CreditCard, Package, FolderTree, Tags,
  Ruler, Percent, Barcode, Layers, ArrowLeftRight, RotateCcw,
  ScanLine, Scale, Wrench, Users, Workflow, Activity, Megaphone,
  Truck, ShoppingBag, PackageOpen, Undo2, Wallet, PiggyBank,
  Banknote, TrendingDown, Building2, Warehouse, HardHat, Car, UserRound,
  BarChart3, CheckSquare, Bell, Settings, ShieldCheck, Download, Cpu,
  ChevronDown, ChevronRight, Star, Clock, Handshake, Boxes, PanelLeftClose, PanelLeftOpen,
  BookOpen, CalendarDays, Receipt as ReceiptIcon, Cloud
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
      { label: 'الديون والذمم', to: '/finance/debts', icon: Banknote },
      { label: 'الأقساط', to: '/finance/installments', icon: CalendarDays },
    ],
  },
  {
    id: 'operations',
    label: 'العمليات',
    icon: Building2,
    color: 'text-slate-400',
    perm: 'inventory.view',
    items: [
      { label: 'الفروع', to: '/branches', icon: Building2 },
      { label: 'المخازن', to: '/warehouses', icon: Warehouse },
      { label: 'الموظفون', to: '/employees', icon: HardHat },
      { label: 'التوصيل', to: '/deliveries', icon: Truck },
      { label: 'السائقون', to: '/drivers', icon: UserRound },
      { label: 'المركبات', to: '/vehicles', icon: Car },
    ],
  },
  {
    id: 'reports',
    label: 'التقارير',
    icon: BarChart3,
    color: 'text-teal-400',
    perm: 'reports.view',
    items: [
      { label: 'مركز التقارير', to: '/reports', icon: BarChart3 },
    ],
  },
  {
    id: 'approvals',
    label: 'الموافقات',
    icon: CheckSquare,
    color: 'text-yellow-400',
    perm: 'approvals.view',
    items: [
      { label: 'صندوق الموافقات', to: '/approvals', icon: CheckSquare },
    ],
  },
  {
    id: 'system',
    label: 'النظام',
    icon: Settings,
    color: 'text-slate-400',
    perm: 'settings.view',
    items: [
      { label: 'الإشعارات', to: '/notifications', icon: Bell },
      { label: 'سجل التدقيق', to: '/audit', icon: ShieldCheck },
      { label: 'المستخدمون', to: '/users', icon: UserRound },
      { label: 'الربط السحابي والفروع', to: '/cloud-sync', icon: Cloud, highlight: true },
      { label: 'النسخ الاحتياطي', to: '/backup', icon: Download },
      { label: 'صحة النظام', to: '/system-health', icon: Cpu },
      { label: 'الإعدادات', to: '/settings', icon: Settings },
    ],
  },
];

// ─── Sidebar Component ────────────────────────────────────────────────────────
export const Sidebar: React.FC<SidebarProps> = ({ currentUser }) => {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar_collapsed') === 'true');

  // Persist open groups in localStorage
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('sidebar_open_groups');
      return saved ? JSON.parse(saved) : { dashboard: true, sales: true };
    } catch {
      return { dashboard: true, sales: true };
    }
  });

  // Auto-open group containing the active route
  useEffect(() => {
    NAV_GROUPS.forEach(group => {
      const isActive = group.items.some(item => location.pathname.startsWith(item.to) && item.to !== '/');
      if (isActive) {
        setOpenGroups(prev => ({ ...prev, [group.id]: true }));
      }
    });
  }, [location.pathname]);

  const toggleCollapsed = () => {
    setCollapsed((value) => {
      const next = !value;
      localStorage.setItem('sidebar_collapsed', String(next));
      return next;
    });
  };

  const toggleGroup = (id: string) => {
    setOpenGroups(prev => {
      const next = { ...prev, [id]: !prev[id] };
      localStorage.setItem('sidebar_open_groups', JSON.stringify(next));
      return next;
    });
  };

  const visibleGroups = NAV_GROUPS.filter(g =>
    !g.perm || PermissionService.can(currentUser, g.perm)
  );

  return (
    <aside className={`${collapsed ? 'w-[76px]' : 'w-64'} bg-slate-900 text-slate-100 flex flex-col h-full border-l border-slate-800 select-none shrink-0 transition-[width] duration-200`} dir="rtl">
      {/* ── Brand Header ─────────────────────────────────────────────────────── */}
      <div className="px-4 py-4 border-b border-slate-800 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/30 text-white font-black text-lg shrink-0">
          C
        </div>
        {!collapsed && <div className="min-w-0">
          <h1 className="font-extrabold text-sm text-white tracking-wide truncate">CeramiSys ERP</h1>
          <p className="text-[10px] text-sky-400 font-medium truncate">نظام معارض السيراميك المتكامل</p>
        </div>}
      </div>

      <button onClick={toggleCollapsed} className="mx-3 mt-3 flex items-center justify-center rounded-lg border border-slate-700 p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white" title={collapsed ? 'توسيع القائمة' : 'طي القائمة'} aria-label={collapsed ? 'توسيع القائمة' : 'طي القائمة'}>
        {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
      </button>

      {/* ── Navigation ───────────────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5 scrollbar-thin scrollbar-track-slate-900 scrollbar-thumb-slate-700">
        {visibleGroups.map((group) => {
          const GroupIcon = group.icon;
          const isOpen = openGroups[group.id] ?? false;
          const isGroupActive = group.items.some(item =>
            location.pathname === item.to ||
            (item.to !== '/' && location.pathname.startsWith(item.to + '/'))
          );

          // Single-item groups render directly without collapse
          if (group.items.length === 1) {
            const item = group.items[0];
            const ItemIcon = item.icon;
            return (
              <NavLink
                key={group.id}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all duration-150 ${
                    isActive
                      ? 'bg-sky-600 text-white shadow-md shadow-sky-600/25'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`
                }
              >
                <ItemIcon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </NavLink>
            );
          }

          return (
            <div key={group.id}>
              {/* Group Header (collapsible) */}
              <button
                onClick={() => toggleGroup(group.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-150 ${
                  isGroupActive
                    ? `${group.color} bg-slate-800/70`
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'
                }`}
              >
                <GroupIcon className={`w-3.5 h-3.5 shrink-0 ${isGroupActive ? group.color : ''}`} />
                {!collapsed && <span className="flex-1 text-right">{group.label}</span>}
                {isOpen
                  ? <ChevronDown className="w-3 h-3 shrink-0 transition-transform duration-200" />
                  : <ChevronRight className="w-3 h-3 shrink-0 transition-transform duration-200" />
                }
              </button>

              {/* Group Items */}
              {isOpen && (
                <div className="mt-0.5 mr-2 space-y-0.5 border-r border-slate-700/50 pr-1">
                  {group.items.map((item) => {
                    const ItemIcon = item.icon;
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 ${
                            isActive
                              ? 'bg-sky-600 text-white font-semibold shadow-sm shadow-sky-600/20'
                              : item.highlight
                              ? 'text-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-200 font-semibold border border-transparent hover:border-emerald-500/20'
                              : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100 font-medium'
                          }`
                        }
                      >
                        <ItemIcon className="w-4 h-4 shrink-0" />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                        {item.badge && item.badge > 0 && (
                          <span className="mr-auto bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                            {item.badge > 99 ? '99+' : item.badge}
                          </span>
                        )}
                      </NavLink>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
              <div className="p-3 border-t border-slate-800 bg-slate-950/40">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>SQLite — متصل</span>
          </div>
          {!collapsed && <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded font-mono text-slate-400">v2.0.0</span>}
        </div>
      </div>
    </aside>
  );
};
