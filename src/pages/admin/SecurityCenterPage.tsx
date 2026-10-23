import React, { useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck, Users, MonitorSmartphone, AlertTriangle, Lock, RefreshCw,
  LogOut, Search, Loader2, Clock, KeyRound, FileWarning,
} from 'lucide-react';
import { SecurityService, ActiveSession, LoginRecord, SecurityOverview } from '../../services/SecurityService';
import { AuthService } from '../../services/AuthService';
import { useToast } from '../../components/ui/Toast';

const fmtDate = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ar-EG');
};

export const SecurityCenterPage: React.FC = () => {
  const service = useMemo(() => new SecurityService(), []);
  const toast = useToast();
  const [overview, setOverview] = useState<SecurityOverview | null>(null);
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [history, setHistory] = useState<LoginRecord[]>([]);
  const [search, setSearch] = useState('');
  const [onlyFailed, setOnlyFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    try {
      setOverview(service.getOverview());
      setSessions(service.getActiveSessions());
      setHistory(service.getLoginHistory({ search, onlyFailed, limit: 150 }));
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تحميل بيانات الأمان.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const revoke = (session: ActiveSession) => {
    if (!confirm(`إنهاء جلسة ${session.userName}؟`)) return;
    try {
      service.revokeSession(session.id);
      if (session.isCurrent) {
        AuthService.logout();
        window.location.reload();
        return;
      }
      toast.success('تم إنهاء الجلسة.');
      load();
    } catch (e: any) {
      toast.error(e?.message || 'تعذر إنهاء الجلسة.');
    }
  };

  const revokeAllForUser = (session: ActiveSession) => {
    if (!confirm(`إنهاء جميع جلسات ${session.userName}؟`)) return;
    try {
      const count = service.revokeUserSessions(session.userId);
      toast.success(`تم إنهاء ${count} جلسة.`);
      load();
    } catch (e: any) {
      toast.error(e?.message || 'تعذر إنهاء الجلسات.');
    }
  };

  const cards = overview ? [
    { label: 'الجلسات النشطة', value: overview.activeSessions, icon: MonitorSmartphone, color: 'text-sky-600 bg-sky-50 border-sky-200' },
    { label: 'المستخدمون النشطون', value: overview.usersCount, icon: Users, color: 'text-teal-600 bg-teal-50 border-teal-200' },
    { label: 'دخول ناجح (24س)', value: overview.success24h, icon: ShieldCheck, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
    { label: 'محاولات فاشلة (24س)', value: overview.failed24h, icon: AlertTriangle, color: 'text-amber-600 bg-amber-50 border-amber-200' },
  ] : [];

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-base font-black">مركز الأمان</h1>
            <p className="text-xs text-slate-500 font-medium">الجلسات النشطة، سجل الدخول، وسياسات الحماية</p>
          </div>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-600 hover:bg-slate-100">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> تحديث
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-5">
        {loading && !overview ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-teal-500" /></div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {cards.map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] text-slate-500 font-bold">{label}</p>
                    <p className="text-2xl font-black mt-1">{value}</p>
                  </div>
                  <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="text-sm font-black flex items-center gap-2"><MonitorSmartphone className="w-4 h-4 text-sky-600" /> الجلسات النشطة</h3>
                  <span className="text-[10px] font-bold text-slate-400">{sessions.length} جلسة</span>
                </div>
                <table className="w-full text-sm text-right">
                  <thead className="bg-slate-50 text-[11px] text-slate-500 border-b border-slate-200">
                    <tr><th className="px-3 py-2.5">المستخدم</th><th className="px-3 py-2.5">الجهاز</th><th className="px-3 py-2.5">آخر نشاط</th><th className="px-3 py-2.5">إجراء</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sessions.map((session) => (
                      <tr key={session.id} className="hover:bg-slate-50/70">
                        <td className="px-3 py-2.5">
                          <span className="font-bold">{session.userName}</span>
                          {session.isCurrent && <span className="mr-2 text-[9px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">الحالية</span>}
                          <span className="block text-[10px] text-slate-400 font-mono">{session.username} · {session.role}</span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-600">{session.deviceLabel || '—'}</td>
                        <td className="px-3 py-2.5 text-xs text-slate-500">{fmtDate(session.lastSeenAt)}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1">
                            <button onClick={() => revoke(session)} className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50" title="إنهاء الجلسة"><LogOut className="w-4 h-4" /></button>
                            {!session.isCurrent && <button onClick={() => revokeAllForUser(session)} className="px-2 py-1 rounded-lg text-[10px] font-bold text-slate-600 hover:bg-slate-100 border border-slate-200">كل الجلسات</button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {sessions.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-slate-400">لا توجد جلسات نشطة</td></tr>}
                  </tbody>
                </table>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-slate-600" /><h3 className="text-sm font-black">سياسة الأمان الحالية</h3>
                </div>
                <div className="p-4 space-y-3 text-xs">
                  <div className="flex items-center justify-between"><span className="text-slate-500 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> مهلة الخمول</span><span className="font-black">{overview?.sessionTimeoutMinutes ?? 480} دقيقة</span></div>
                  <div className="flex items-center justify-between"><span className="text-slate-500 flex items-center gap-1"><KeyRound className="w-3.5 h-3.5" /> حد محاولات الدخول</span><span className="font-black">{overview?.maxFailedAttempts ?? 5}</span></div>
                  <div className="flex items-center justify-between"><span className="text-slate-500 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> حسابات مقفلة مؤقتًا</span><span className={`font-black ${(overview?.lockedAccounts || 0) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{overview?.lockedAccounts ?? 0}</span></div>
                  <div className="flex items-center justify-between"><span className="text-slate-500">آخر نسخة احتياطية</span><span className="font-bold text-[10px]">{fmtDate(overview?.lastBackupAt)}</span></div>
                  <p className="pt-2 border-t border-slate-100 text-[10px] leading-5 text-slate-400">يمكن تعديل مهلة الجلسة وحد المحاولات من إعدادات النظام ← الأمان.</p>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h3 className="text-sm font-black flex items-center gap-2"><FileWarning className="w-4 h-4 text-amber-600" /> سجل محاولات الدخول</h3>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
                    <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} placeholder="بحث بالمستخدم..." className="pr-8 pl-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold w-44" />
                  </div>
                  <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
                    <input type="checkbox" checked={onlyFailed} onChange={(e) => { setOnlyFailed(e.target.checked); setTimeout(load, 0); }} /> الفاشلة فقط
                  </label>
                </div>
              </div>
              <table className="w-full text-sm text-right">
                <thead className="bg-slate-50 text-[11px] text-slate-500 border-b border-slate-200">
                  <tr><th className="px-3 py-2.5">المستخدم</th><th className="px-3 py-2.5">النتيجة</th><th className="px-3 py-2.5">السبب</th><th className="px-3 py-2.5">الجهاز</th><th className="px-3 py-2.5">التوقيت</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {history.map((record) => (
                    <tr key={record.id} className="hover:bg-slate-50/70">
                      <td className="px-3 py-2.5 font-semibold">{record.userName || record.username}</td>
                      <td className="px-3 py-2.5">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${record.succeeded ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                          {record.succeeded ? 'ناجح' : 'فاشل'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-slate-500 font-mono">{record.failureReason || '—'}</td>
                      <td className="px-3 py-2.5 text-[11px] text-slate-500">{record.deviceLabel || '—'}</td>
                      <td className="px-3 py-2.5 text-[11px] text-slate-400">{fmtDate(record.createdAt)}</td>
                    </tr>
                  ))}
                  {history.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-slate-400">لا توجد سجلات مطابقة</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
