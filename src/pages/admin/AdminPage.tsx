import React, { useEffect, useMemo, useState } from 'react';
import {
  SlidersHorizontal, Users, ShieldCheck, Settings as SettingsIcon, ListTree,
  Database, ScrollText, LayoutDashboard, ArrowLeft, CheckCircle2, AlertTriangle,
  Building2, Package, Receipt, Wallet, Activity,
} from 'lucide-react';
import { DatabaseManager } from '../../database/db';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import { AuditService, type AuditLogEntry } from '../../services/AuditService';
import { DataAdminService } from '../../services/DataAdminService';
import { usePermission } from '../../hooks/usePermission';
import { AdminUsersTab } from './AdminUsersTab';
import { AdminRolesTab } from './AdminRolesTab';
import { AdminSettingsTab } from './AdminSettingsTab';
import { AdminNavigationTab } from './AdminNavigationTab';
import { AdminDataTab } from './AdminDataTab';
import { AuditLogView } from '../../components/AuditLogView';

type TabId = 'overview' | 'users' | 'roles' | 'settings' | 'navigation' | 'data' | 'audit';

interface TabDef {
  id: TabId;
  label: string;
  icon: React.ElementType;
  perm: string;
}

const TABS: TabDef[] = [
  { id: 'overview', label: 'نظرة عامة', icon: LayoutDashboard, perm: 'admin.view' },
  { id: 'users', label: 'المستخدمون', icon: Users, perm: 'users.view' },
  { id: 'roles', label: 'الأدوار والصلاحيات', icon: ShieldCheck, perm: 'roles.manage' },
  { id: 'settings', label: 'الإعدادات', icon: SettingsIcon, perm: 'settings.view' },
  { id: 'navigation', label: 'القوائم', icon: ListTree, perm: 'admin.navigation' },
  { id: 'data', label: 'البيانات', icon: Database, perm: 'admin.data' },
  { id: 'audit', label: 'سجل التدقيق', icon: ScrollText, perm: 'audit.view' },
];

const COUNT_QUERIES: { key: string; label: string; table: string; icon: React.ElementType; color: string }[] = [
  { key: 'users', label: 'المستخدمون', table: 'users', icon: Users, color: 'text-sky-600' },
  { key: 'products', label: 'الأصناف', table: 'products', icon: Package, color: 'text-amber-600' },
  { key: 'customers', label: 'العملاء', table: 'customers', icon: Building2, color: 'text-pink-600' },
  { key: 'invoices', label: 'فواتير البيع', table: 'sales_invoices', icon: Receipt, color: 'text-emerald-600' },
  { key: 'purchases', label: 'فواتير الشراء', table: 'purchase_invoices', icon: Wallet, color: 'text-orange-600' },
  { key: 'audit', label: 'سجلات التدقيق', table: 'audit_logs', icon: Activity, color: 'text-violet-600' },
];

export const AdminPage: React.FC = () => {
  const can = usePermission();
  const user = AuthService.getCurrentUser();
  const [tab, setTab] = useState<TabId>('overview');

  const allowedTabs = useMemo(() => TABS.filter((item) => can(item.perm)), [can]);
  const activeTab = allowedTabs.some((item) => item.id === tab) ? tab : (allowedTabs[0]?.id ?? 'overview');

  const canAccess = can('admin.view') || can('settings.view');

  if (!canAccess) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50">
          <ShieldCheck className="h-8 w-8 text-rose-500" />
        </div>
        <h2 className="text-lg font-black text-slate-900 dark:text-slate-100">مركز التحكم غير متاح</h2>
        <p className="max-w-md text-sm text-slate-500">تحتاج صلاحية admin.view للدخول إلى مركز التحكم الإداري.</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-100 dark:bg-slate-950 p-4 lg:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 text-white shadow-lg shadow-sky-500/25">
              <SlidersHorizontal className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 dark:text-slate-100">مركز التحكم الإداري</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                تحكم كامل في المستخدمين والصلاحيات والهوية والقوائم والبيانات — {user?.fullName}
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-emerald-500/10 px-3 py-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" /> مدير النظام
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {allowedTabs.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
                  active
                    ? 'bg-sky-600 text-white shadow-lg shadow-sky-600/20'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="h-4 w-4" /> {item.label}
              </button>
            );
          })}
        </div>

        {activeTab === 'overview' && <Overview onNavigate={setTab} />}
        {activeTab === 'users' && <AdminUsersTab />}
        {activeTab === 'roles' && <AdminRolesTab />}
        {activeTab === 'settings' && <AdminSettingsTab />}
        {activeTab === 'navigation' && <AdminNavigationTab />}
        {activeTab === 'data' && <AdminDataTab />}
        {activeTab === 'audit' && (
          <div className="rounded-2xl border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
            <AuditLogView />
          </div>
        )}
      </div>
    </div>
  );
};

const Overview: React.FC<{ onNavigate: (tab: TabId) => void }> = ({ onNavigate }) => {
  const db = useMemo(() => DatabaseManager.getInstance(), []);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [recent, setRecent] = useState<AuditLogEntry[]>([]);
  const [storage, setStorage] = useState<{ databaseBytes: number; localStorageBytes: number; tableCount: number; totalRows: number } | null>(null);
  const [integrity, setIntegrity] = useState<'ok' | 'bad' | 'unknown'>('unknown');

  useEffect(() => {
    const next: Record<string, number> = {};
    for (const item of COUNT_QUERIES) {
      try {
        next[item.key] = Number(db.query<{ c: number }>(`SELECT COUNT(*) AS c FROM "${item.table}"`)[0]?.c ?? 0);
      } catch {
        next[item.key] = 0;
      }
    }
    setCounts(next);
    try {
      setRecent(new AuditService().getAuditLogs({ page: 1, pageSize: 8 }).logs);
    } catch {
      setRecent([]);
    }
    try {
      const service = new DataAdminService();
      setStorage(service.getStorageStats());
      const result = service.integrityCheck();
      setIntegrity(result.every((line) => line.toLowerCase() === 'ok') ? 'ok' : 'bad');
    } catch {
      setStorage(null);
    }
  }, [db]);

  const fmt = (bytes: number) => (bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(2)} MB`);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {COUNT_QUERIES.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.key} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className={`flex items-center gap-2 ${item.color}`}>
                <Icon className="h-4 w-4" />
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{item.label}</span>
              </div>
              <div className="mt-1 font-mono text-xl font-black text-slate-900 dark:text-slate-100">
                {(counts[item.key] ?? 0).toLocaleString('en-US')}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-slate-100">
              <Database className="h-4 w-4 text-sky-500" /> حالة النظام
            </h3>
            <div className="space-y-2 text-xs">
              <Row label="حجم قاعدة البيانات" value={storage ? fmt(storage.databaseBytes) : '—'} />
              <Row label="التخزين المحلي" value={storage ? fmt(storage.localStorageBytes) : '—'} />
              <Row label="عدد الجداول" value={storage ? String(storage.tableCount) : '—'} />
              <Row label="إجمالي السجلات" value={storage ? storage.totalRows.toLocaleString('en-US') : '—'} />
              <div className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700">
                <span className="font-bold text-slate-500 dark:text-slate-400">سلامة القاعدة</span>
                {integrity === 'ok' ? (
                  <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" /> سليمة
                  </span>
                ) : integrity === 'bad' ? (
                  <span className="inline-flex items-center gap-1 font-bold text-rose-600 dark:text-rose-400">
                    <AlertTriangle className="h-3.5 w-3.5" /> تحتاج مراجعة
                  </span>
                ) : (
                  <span className="font-bold text-slate-400">غير متاح</span>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
            <h3 className="mb-2 text-sm font-extrabold text-slate-900 dark:text-slate-100">اختصارات</h3>
            <div className="grid grid-cols-2 gap-2">
              <Quick label="إضافة مستخدم" to="users" icon={Users} onClick={onNavigate} />
              <Quick label="مصفوفة الصلاحيات" to="roles" icon={ShieldCheck} onClick={onNavigate} />
              <Quick label="الهوية والمظهر" to="settings" icon={SettingsIcon} onClick={onNavigate} />
              <Quick label="محرر القوائم" to="navigation" icon={ListTree} onClick={onNavigate} />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-slate-100">
            <ScrollText className="h-4 w-4 text-violet-500" /> أحدث العمليات
          </h3>
          <div className="space-y-1">
            {recent.map((log) => (
              <div key={log.id} className="flex items-start gap-2 rounded-xl border border-slate-100 px-3 py-2 dark:border-slate-800">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-bold text-slate-800 dark:text-slate-200">{log.action}</div>
                  <div className="text-[10px] text-slate-400">{log.userName} · {log.module}</div>
                </div>
                <span className="whitespace-nowrap font-mono text-[10px] text-slate-400">{String(log.createdAt).slice(0, 16).replace('T', ' ')}</span>
              </div>
            ))}
            {recent.length === 0 && <div className="py-6 text-center text-xs text-slate-400">لا توجد عمليات مسجلة بعد.</div>}
          </div>
        </div>
      </div>
    </div>
  );
};

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700">
    <span className="font-bold text-slate-500 dark:text-slate-400">{label}</span>
    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{value}</span>
  </div>
);

const Quick: React.FC<{ label: string; to: TabId; icon: React.ElementType; onClick: (tab: TabId) => void }> = ({ label, to, icon: Icon, onClick }) => (
  <button
    onClick={() => onClick(to)}
    className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
  >
    <Icon className="h-4 w-4 text-sky-500" />
    <span className="flex-1 text-right">{label}</span>
    <ArrowLeft className="h-3.5 w-3.5 text-slate-400" />
  </button>
);
