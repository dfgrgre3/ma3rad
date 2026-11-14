import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  KeyRound,
  ReceiptText,
  Layers3,
  Boxes,
  ScrollText,
  Settings,
  Palette,
  SlidersHorizontal,
  LogOut,
  ShieldCheck,
  Menu,
  X,
} from 'lucide-react';
import type { User } from '../../types';

interface PlatformLayoutProps {
  currentUser: User;
  onLogout: () => void;
}

const NAV_ITEMS = [
  { to: '/platform', label: 'نظرة عامة', icon: LayoutDashboard, end: true },
  { to: '/platform/tenants', label: 'العملاء', icon: Building2 },
  { to: '/platform/licenses', label: 'التراخيص', icon: KeyRound },
  { to: '/platform/billing', label: 'المبيعات والفواتير', icon: ReceiptText },
  { to: '/platform/plans', label: 'خطط الاشتراك', icon: Layers3 },
  { to: '/platform/product', label: 'المنتج والمزايا', icon: Boxes },
  { to: '/platform/audit', label: 'سجل العمليات', icon: ScrollText },
  { to: '/platform/settings', label: 'إعدادات المنصة', icon: Settings },
  { to: '/platform/activity', label: 'إعدادات النشاط', icon: Boxes },
  { to: '/platform/operations', label: 'التشغيل والموافقات', icon: Settings },
  { to: '/platform/branding', label: 'الهوية والمظهر', icon: Palette },
  { to: '/platform/customization', label: 'تخصيص الواجهة', icon: SlidersHorizontal },
  { to: '/platform/app-configuration', label: 'محرك التكوين الديناميكي', icon: SlidersHorizontal },
  { to: '/platform/system-health', label: 'صحة النظام وتشخيصه', icon: Settings },
  { to: '/platform/platform-health', label: 'صحة المنصة (جميع العملاء)', icon: ShieldCheck },
  { to: '/platform/support', label: 'الدعم الفني', icon: ShieldCheck },
  { to: '/platform/devices', label: 'الأجهزة', icon: ShieldCheck },
  { to: '/platform/admin-control', label: 'مركز التحكم الإداري', icon: SlidersHorizontal },
  { to: '/platform/security-center', label: 'مركز الأمان', icon: ShieldCheck },
];

const TITLES: Record<string, string> = {
  '/platform': 'نظرة عامة على المنصة',
  '/platform/tenants': 'إدارة العملاء',
  '/platform/licenses': 'إدارة التراخيص',
  '/platform/billing': 'المبيعات والفواتير',
  '/platform/plans': 'خطط الاشتراك',
  '/platform/product': 'التحكم في المنتج',
  '/platform/audit': 'سجل عمليات المنصة',
  '/platform/settings': 'إعدادات المنصة',
  '/platform/activity': 'إعدادات النشاط',
  '/platform/operations': 'التشغيل والموافقات',
  '/platform/branding': 'الهوية والمظهر',
  '/platform/customization': 'تخصيص الواجهة',
  '/platform/app-configuration': 'محرك التكوين الديناميكي',
  '/platform/system-health': 'صحة النظام وتشخيصه',
  '/platform/platform-health': 'صحة المنصة (جميع العملاء)',
  '/platform/support': 'الدعم الفني',
  '/platform/devices': 'الأجهزة',
  '/platform/admin-control': 'مركز التحكم الإداري',
  '/platform/security-center': 'مركز الأمان',
};

export const PlatformLayout: React.FC<PlatformLayoutProps> = ({ currentUser, onLogout }) => {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const currentTitle = TITLES[location.pathname] || 'منصة مالك النظام';

  React.useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-semibold transition-colors ${
                isActive
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'text-slate-300 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );

  return (
    <div dir="rtl" className="flex h-screen w-screen overflow-hidden bg-slate-100 text-slate-900">
      {/* Sidebar */}
      <aside className="hidden w-[262px] shrink-0 flex-col bg-slate-950 lg:flex">
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 text-lg font-black text-white shadow-lg">
            س
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">سيراميسي</p>
            <p className="text-[11px] font-medium text-emerald-300">منصة مالك النظام</p>
          </div>
        </div>
        {nav}
        <div className="border-t border-white/10 p-3">
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-white">{currentUser.fullName}</p>
              <p className="truncate text-[10px] text-slate-400">مالك المنصة</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-rose-500/10 hover:text-rose-300"
          >
            <LogOut className="h-3.5 w-3.5" />
            تسجيل الخروج
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="إغلاق" className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-[280px] flex-col bg-slate-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
              <span className="text-sm font-bold text-white">قائمة المنصة</span>
              <button type="button" onClick={() => setMobileOpen(false)} className="text-slate-300" aria-label="إغلاق">
                <X className="h-5 w-5" />
              </button>
            </div>
            {nav}
            <div className="border-t border-white/10 p-3">
              <button
                type="button"
                onClick={onLogout}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300"
              >
                <LogOut className="h-3.5 w-3.5" />
                تسجيل الخروج
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 lg:hidden"
              aria-label="فتح القائمة"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-[15px] font-black text-slate-900">{currentTitle}</h1>
              <p className="text-[11px] text-slate-500">تحكم كامل في المنتج والعملاء والتراخيص والمبيعات</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 sm:inline-flex">
              جلسة مالك المنصة
            </span>
            <span className="hidden text-[11px] font-semibold text-slate-500 md:inline">
              {new Intl.DateTimeFormat('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}
            </span>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default PlatformLayout;
