import React, { Suspense } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
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
  Users,
  Package,
  CalendarClock,
  BarChart3,
  RefreshCw,
  Database,
  Webhook,
  Bell,
  FileText,
  AlertOctagon,
  Globe,
} from 'lucide-react';
import type { User } from '../../types';
import { PLATFORM_ROUTE_PERMISSION_MAP, PlatformAuthorizationService } from '../../services/domains/platform/PlatformAuthorizationService';
import { PlatformStaffAuthService } from '../../services/domains/platform/PlatformStaffAuthService';
import { PlatformStaffForcePasswordChange } from './PlatformStaffForcePasswordChange';

interface PlatformLayoutProps {
  currentUser: User;
  onLogout: () => void;
}

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
}

interface NavGroup {
  label?: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { to: '/platform', label: 'نظرة عامة', icon: LayoutDashboard, end: true },
    ],
  },
  {
    label: 'العملاء والاشتراكات',
    items: [
      { to: '/platform/tenants', label: 'العملاء', icon: Building2 },
      { to: '/platform/subscriptions', label: 'إدارة الاشتراكات', icon: CalendarClock },
      { to: '/platform/licenses', label: 'التراخيص', icon: KeyRound },
      { to: '/platform/billing', label: 'المبيعات والفواتير', icon: ReceiptText },
      { to: '/platform/support', label: 'الدعم الفني', icon: ShieldCheck },
      { to: '/platform/customer-portal', label: 'تجربة بوابة العملاء', icon: Building2 },
    ],
  },
  {
    label: 'بناء وإدارة النظام',
    items: [
      { to: '/platform/plans', label: 'خطط الاشتراك', icon: Layers3 },
      { to: '/platform/plan-catalog', label: 'منشئ الخطط والصفحات', icon: Boxes },
      { to: '/platform/product', label: 'المنتج والصفحات والمزايا', icon: Boxes },
      { to: '/platform/roles', label: 'الأدوار والصلاحيات', icon: ShieldCheck },
      { to: '/platform/user-platform-permissions', label: 'صفحات وصلاحيات المستخدمين', icon: ShieldCheck },
      { to: '/platform/releases', label: 'حزم الإصدارات', icon: Package },
      { to: '/platform/app-configuration', label: 'محرك التكوين الديناميكي', icon: SlidersHorizontal },
    ],
  },
  {
    label: 'التشغيل والإعدادات',
    items: [
      { to: '/platform/staff', label: 'فريق ومستخدمي المنصة', icon: Users },
      { to: '/platform/audit', label: 'سجل العمليات', icon: ScrollText },
      { to: '/platform/settings', label: 'إعدادات المنصة', icon: Settings },
      { to: '/platform/activity', label: 'إعدادات النشاط', icon: Boxes },
      { to: '/platform/operations', label: 'التشغيل والموافقات', icon: Settings },
      { to: '/platform/branding', label: 'الهوية والمظهر', icon: Palette },
      { to: '/platform/customization', label: 'تخصيص الواجهة', icon: SlidersHorizontal },
      { to: '/platform/system-health', label: 'صحة النظام وتشخيصه', icon: Settings },
      { to: '/platform/platform-health', label: 'صحة المنصة (جميع العملاء)', icon: ShieldCheck },
      { to: '/platform/devices', label: 'الأجهزة', icon: ShieldCheck },
      { to: '/platform/admin-control', label: 'مركز التحكم الإداري', icon: SlidersHorizontal },
      { to: '/platform/security-center', label: 'مركز الأمان', icon: ShieldCheck },
      { to: '/platform/analytics', label: 'التقارير والتحليلات', icon: BarChart3 },
      { to: '/platform/sync', label: 'مراقبة المزامنة', icon: RefreshCw },
      { to: '/platform/backups', label: 'النسخ الاحتياطي', icon: Database },
      { to: '/platform/integrations', label: 'التكاملات و Webhooks', icon: Webhook },
      { to: '/platform/notifications', label: 'مركز الإشعارات', icon: Bell },
      { to: '/platform/policies', label: 'سياسات المنصة', icon: FileText },
      { to: '/platform/emergency', label: 'إجراءات الطوارئ', icon: AlertOctagon },
    ],
  },
];

const TITLES: Record<string, string> = {
  '/platform': 'نظرة عامة على المنصة',
  '/platform/tenants': 'إدارة العملاء',
  '/platform/subscriptions': 'إدارة الاشتراكات المركزية',
  '/platform/licenses': 'إدارة التراخيص',
  '/platform/billing': 'المبيعات والفواتير',
  '/platform/plans': 'خطط الاشتراك',
  '/platform/staff': 'مركز التحكم في حسابات الإدارة',
  '/platform/roles': 'مصفوفة الأدوار والصلاحيات',
  '/platform/releases': 'حزم الإصدارات والتحديثات',
  '/platform/product': 'التحكم في المنتج',
  '/platform/plan-catalog': 'منشئ الخطط والصفحات والمميزات',
  '/platform/audit': 'سجل عمليات المنصة',
  '/platform/user-platform-permissions': 'صفحات وصلاحيات المستخدمين',
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
  '/platform/analytics': 'التقارير والتحليلات المركزية',
  '/platform/sync': 'مراقبة المزامنة والأجهزة',
  '/platform/backups': 'النسخ الاحتياطي السحابي',
  '/platform/integrations': 'إدارة التكاملات والربط الخارجي',
  '/platform/notifications': 'مركز الإشعارات وسجل التسليم',
  '/platform/policies': 'سياسات المنصة والامتثال',
  '/platform/emergency': 'مركز إجراءات الطوارئ والحماية',
  '/platform/customer-portal': 'بوابة العملاء المركزية',
};

export const PlatformLayout: React.FC<PlatformLayoutProps> = ({ currentUser, onLogout }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const currentTitle = TITLES[location.pathname]
    || (location.pathname.startsWith('/platform/tenants/') ? 'ملف العميل' : 'منصة مالك النظام');

  React.useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const permissionsOverride = PlatformStaffAuthService.getCurrentPermissionsOverride();
  const canSeeItem = (item: NavItem) => {
    if (item.to === '/platform') return true;
    const required = PLATFORM_ROUTE_PERMISSION_MAP[item.to];
    if (required) {
      return PlatformAuthorizationService.canAccessPermission(currentUser.role, required, permissionsOverride);
    }
    return PlatformAuthorizationService.canAccessRoute(currentUser.role, item.to, permissionsOverride);
  };
  const visibleNavGroups = NAV_GROUPS
    .map((group) => ({ ...group, items: group.items.filter(canSeeItem) }))
    .filter((group) => group.items.length > 0);

  const renderNavLink = (item: NavItem) => {
    const Icon = item.icon;
    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        className={({ isActive }) =>
          `flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-semibold transition-colors ${
            isActive
              ? 'bg-success/15 text-success'
              : 'text-muted hover:bg-surface/5 hover:text-white'
          }`
        }
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span>{item.label}</span>
      </NavLink>
    );
  };

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
      {visibleNavGroups.map((group, groupIndex) => (
        <div key={group.label ?? `group-${groupIndex}`} className={groupIndex > 0 ? 'mt-3' : ''}>
          {group.label && (
            <p className="mb-1.5 px-3 text-[10px] font-black uppercase tracking-wider text-muted">
              {group.label}
            </p>
          )}
          <div className="flex flex-col gap-1">
            {group.items.map(renderNavLink)}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface-sunken text-ink">
      {currentUser.mustChangePassword && <PlatformStaffForcePasswordChange currentUser={currentUser} />}
      {/* Sidebar */}
      <aside className="hidden w-[262px] shrink-0 flex-col bg-primary lg:flex">
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-success to-success text-lg font-black text-white shadow-lg">
            س
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">سيراميسي</p>
            <p className="text-[11px] font-medium text-success">منصة مالك النظام</p>
          </div>
        </div>
        {nav}
        <div className="border-t border-white/10 p-3">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            title="الانتقال إلى التطبيق الرئيسي (موقع المستخدمين)"
            className="mb-2 flex w-full items-center justify-center gap-2 rounded-lg border border-success/30 bg-success/15 px-3 py-2 text-xs font-bold text-success transition hover:bg-success/25 hover:text-success"
          >
            <Globe className="h-4 w-4" />
            موقع المستخدمين
          </button>
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-surface/5 px-3 py-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-success/20 text-success">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-white">{currentUser.fullName}</p>
              <p className="truncate text-[10px] text-muted">مالك المنصة</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-muted transition hover:bg-danger/10 hover:text-danger"
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
          <div className="absolute inset-y-0 right-0 flex w-[280px] flex-col bg-primary shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
              <span className="text-sm font-bold text-white">قائمة المنصة</span>
              <button type="button" onClick={() => setMobileOpen(false)} className="text-muted" aria-label="إغلاق">
                <X className="h-5 w-5" />
              </button>
            </div>
            {nav}
            <div className="border-t border-white/10 p-3">
              <button
                type="button"
                onClick={() => { setMobileOpen(false); navigate('/dashboard'); }}
                className="mb-2 flex w-full items-center justify-center gap-2 rounded-lg border border-success/30 bg-success/15 px-3 py-2 text-xs font-bold text-success transition hover:bg-success/25"
              >
                <Globe className="h-4 w-4" />
                موقع المستخدمين
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-muted"
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
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-ink-secondary lg:hidden"
              aria-label="فتح القائمة"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-[15px] font-black text-ink">{currentTitle}</h1>
              <p className="text-[11px] text-muted">تحكم كامل في المنتج والعملاء والتراخيص والمبيعات</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              title="الانتقال إلى التطبيق الرئيسي (موقع المستخدمين)"
              aria-label="الانتقال إلى موقع المستخدمين"
              className="inline-flex items-center gap-1.5 rounded-lg bg-success px-2.5 py-1.5 text-[11.5px] font-bold text-white transition hover:bg-success"
            >
              <Globe className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">موقع المستخدمين</span>
            </button>
            <span className="hidden rounded-full border border-success-border bg-success-soft px-2.5 py-1 text-[11px] font-bold text-success sm:inline-flex">
              جلسة مالك المنصة
            </span>
            <span className="hidden text-[11px] font-semibold text-muted md:inline">
              {new Intl.DateTimeFormat('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}
            </span>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
          <Suspense fallback={null}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
};

export default PlatformLayout;
