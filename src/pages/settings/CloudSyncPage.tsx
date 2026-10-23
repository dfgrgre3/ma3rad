import React, { useState, useEffect } from 'react';
import {
  Cloud, CloudOff, RefreshCw, Server, ArrowUpRight,
  ArrowDownLeft, Database, ShieldAlert, CheckCircle2, Clock, Globe,
  Sliders, Activity, Network, Laptop, AlertTriangle
} from 'lucide-react';
import { CloudSyncService, BranchSyncConfig, SyncOutboxItem, ConnectedBranchStatus } from '../../services/CloudSyncService';

export const CloudSyncPage: React.FC = () => {
  const syncService = new CloudSyncService();

  const [config, setConfig] = useState<BranchSyncConfig>(syncService.getConfig());
  const [outboxItems, setOutboxItems] = useState<SyncOutboxItem[]>([]);
  const [branches, setBranches] = useState<ConnectedBranchStatus[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);

  // Edit config form state
  const [editServerUrl, setEditServerUrl] = useState(config.serverUrl);
  const [editApiKey, setEditApiKey] = useState(config.apiKey);
  const [editSyncMode, setEditSyncMode] = useState(config.syncMode);
  const [editInterval, setEditInterval] = useState(config.syncIntervalSeconds);

  const loadData = () => {
    const cfg = syncService.getConfig();
    setConfig(cfg);
    setOutboxItems(syncService.getOutboxItems(15));
    setBranches(syncService.getConnectedBranches());
    setEditServerUrl(cfg.serverUrl);
    setEditApiKey(cfg.apiKey);
    setEditSyncMode(cfg.syncMode);
    setEditInterval(cfg.syncIntervalSeconds);
  };

  useEffect(() => {
    loadData();
    const timer = setInterval(() => {
      setOutboxItems(syncService.getOutboxItems(15));
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const handleSyncNow = async () => {
    setIsSyncing(true);
    setLastResult(null);
    try {
      const res = await syncService.triggerSync();
      setLastResult(res.message);
      loadData();
    } catch (err: any) {
      setLastResult(err?.message || 'فشلت المزامنة');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    syncService.updateConfig({
      serverUrl: editServerUrl,
      apiKey: editApiKey,
      syncMode: editSyncMode,
      syncIntervalSeconds: Number(editInterval),
    });
    setShowConfigModal(false);
    loadData();
  };

  const pendingCount = outboxItems.filter(i => i.status === 'PENDING').length;
  const serverOnline = config.isEnabled && config.lastSyncStatus !== 'ERROR';

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-y-auto" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4 sticky top-0 z-10 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-500/20 to-indigo-500/20 border border-sky-500/30 flex items-center justify-center text-sky-600">
              <Cloud className={`w-6 h-6 ${config.isEnabled ? 'animate-pulse' : ''}`} />
            </div>
            <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-200 ${serverOnline ? 'bg-emerald-500' : 'bg-slate-400'}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black text-slate-900">مركز المزامنة السحابية وربط الفروع (Cloud Sync Hub)</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-500/10 text-sky-600 border border-sky-500/20">
                {config.syncMode === 'HYBRID_AUTO' ? 'هجين ذكي (Hybrid Auto)' : config.syncMode === 'CLOUD_CENTRAL' ? 'سحابي مباشر' : 'أوفلاين محلي'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              مزامنة حركة المبيعات والمخازن والأسعار بين المعارض والمستودعات المركزية في الزمن الحقيقي
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowConfigModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold border border-slate-300 transition active:scale-95"
          >
            <Sliders className="w-4 h-4 text-slate-500" />
            إعدادات السيرفر
          </button>

          <button
            onClick={handleSyncNow}
            disabled={isSyncing}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-slate-900 shadow-lg shadow-sky-600/20 transition active:scale-95 ${
 isSyncing ? 'bg-sky-700 opacity-80 cursor-wait' : 'bg-sky-600 hover:bg-sky-500'
 }`}
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'جاري المزامنة مع السحابة...' : 'مزامنة فورية الآن'}
          </button>
        </div>
      </div>

      {/* Notice Banner */}
      {lastResult && (
        <div className="mx-6 mt-4 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 text-xs flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{lastResult}</span>
          </div>
          <button onClick={() => setLastResult(null)} className="text-slate-500 hover:text-slate-900 text-xs font-mono">✕</button>
        </div>
      )}

      {/* Metrics Grid */}
      <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <Activity className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">حالة خادم المزامنة</div>
            <div className="text-base font-bold text-slate-900 flex items-center gap-2 mt-0.5">
              <span>{!config.isEnabled ? 'غير مفعل' : config.lastSyncStatus === 'ERROR' ? 'تعذر الاتصال' : config.lastSyncStatus === 'SYNCING' ? 'جارٍ الاتصال' : 'متصل'}</span>
              {config.latencyMs > 0 && (
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-mono">
                  {config.latencyMs} ms
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {config.isEnabled ? 'المزامنة الفعلية عبر خادمك المضبوط' : 'أدخل عنوان الخادم ومفتاح API لتفعيل المزامنة'}
            </div>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
            <ArrowUpRight className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">في طابور الرفع (Outbox)</div>
            <div className="text-xl font-black text-amber-600 mt-0.5">
              {pendingCount} <span className="text-xs text-slate-500 font-normal">حركة معلقة</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">يتم الرفع تلقائياً عند الاتصال</div>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
            <Network className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">شبكة فروع المعرض</div>
            <div className="text-xl font-black text-slate-900 mt-0.5">
              {branches.length} <span className="text-xs text-slate-500 font-normal">فروع ومستودعات</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {branches.filter(b => b.status === 'ONLINE').length} فروع متصلة مباشرة
            </div>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0">
            <Clock className="w-6 h-6 text-sky-600" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">آخر مزامنة ناجحة</div>
            <div className="text-sm font-bold text-slate-900 mt-0.5">
              {config.lastSyncedAt ? new Date(config.lastSyncedAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'لم تبدأ بعد'}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">المزامنة التلقائية: كل {config.syncIntervalSeconds} ثانية</div>
          </div>
        </div>
      </div>

      {/* Main Content: Branches Network & Sync Outbox */}
      <div className="px-6 pb-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Branches Grid (1 col) */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-sky-600" />
                <h2 className="text-sm font-bold text-slate-900">فروع المعرض المتصلة بالسحابة</h2>
              </div>
              <span className="text-xs text-slate-500">{branches.length} مواقع</span>
            </div>

            <div className="space-y-3">
              {branches.map((b) => (
                <div
                  key={b.branchCode}
                  className="p-3.5 rounded-xl bg-white border border-slate-200/80 hover:border-slate-300 transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">{b.branchName}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-mono">
                          {b.branchCode}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5">
                        <Clock className="w-3 h-3 text-slate-500" />
                        {b.lastSeen}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
 b.status === 'ONLINE'
 ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
 : 'bg-rose-500/10 border border-rose-500/20'
 }`}
                      >
                        {b.status === 'ONLINE' ? 'متصل' : 'غير متصل'}
                      </span>
                      {b.pendingChanges > 0 && (
                        <span className="text-[10px] text-amber-600">
                          {b.pendingChanges} تعديل بانتظاره
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Conflict Policy Box */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <h3 className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-indigo-600" />
              سياسة فض التعارضات وحماية البيانات
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              يعتمد النظام بروتوكول <strong className="text-slate-800">ACID Event-Sourcing</strong> لحفظ كل فاتورة وحركة مخزن كحدث غير قابل للتراجع. في حال تعديل نفس الصنف في فرعين مختلفين دون اتصال، يتم دمج الرصيد وفق سجلات الأذون تلقائياً دون فقدان أي بيانات مالية.
            </p>
          </div>
        </div>

        {/* Sync Outbox Table (2 cols) */}
        <div className="lg:col-span-2">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 h-full flex flex-col">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-amber-600" />
                <h2 className="text-sm font-bold text-slate-900">سجل الحركات السحابية وطابور الرفع (Outbox Ledger)</h2>
              </div>
              <span className="text-xs text-slate-500">
                {outboxItems.length} عمليات مسجلة
              </span>
            </div>

            {outboxItems.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-3">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                </div>
                <div className="text-sm font-bold text-slate-900">كافة البيانات متزامنة بالكامل!</div>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">
                  لا توجد أي حركات معلقة في الطابور المحلي. جميع الفواتير والمخازن متطابقة مع السحابة المركزية.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto flex-1">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-200/80 pb-2">
                      <th className="pb-2.5 font-semibold">الجدول / الوحدة</th>
                      <th className="pb-2.5 font-semibold">نوع الحركة</th>
                      <th className="pb-2.5 font-semibold">معرّف الحركة</th>
                      <th className="pb-2.5 font-semibold">الحالة</th>
                      <th className="pb-2.5 font-semibold">الوقت</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/40">
                    {outboxItems.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-100 transition">
                        <td className="py-2.5 font-mono text-slate-700">
                          {item.entityTable}
                        </td>
                        <td className="py-2.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
 item.action === 'INSERT'
 ? 'bg-emerald-500/10 text-emerald-600'
 : item.action === 'UPDATE'
 ? 'bg-sky-500/10 text-sky-600'
 : 'bg-rose-500/10 text-rose-600'
 }`}
                          >
                            {item.action}
                          </span>
                        </td>
                        <td className="py-2.5 font-mono text-[11px] text-slate-500">
                          {item.entityId.slice(0, 16)}...
                        </td>
                        <td className="py-2.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
 item.status === 'ACKNOWLEDGED'
 ? 'bg-emerald-500/10 text-emerald-600'
 : item.status === 'PENDING'
 ? 'bg-amber-500/10 text-amber-600 animate-pulse'
 : 'bg-slate-100 text-slate-500'
 }`}
                          >
                            {item.status === 'ACKNOWLEDGED' ? 'تم الرفع' : item.status === 'PENDING' ? 'قيد الانتظار' : item.status}
                          </span>
                        </td>
                        <td className="py-2.5 text-slate-500 font-mono text-[11px]">
                          {item.createdAt}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cloud Configuration Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-scaleIn">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Sliders className="w-5 h-5 text-sky-600" />
                <h3 className="text-base font-black text-slate-900">إعدادات الربط السحابي ومزامنة الفروع</h3>
              </div>
              <button
                onClick={() => setShowConfigModal(false)}
                className="text-slate-500 hover:text-slate-900 text-lg font-mono"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveConfig} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  رابط السيرفر السحابي المركزي (Cloud Sync Endpoint)
                </label>
                <input
                  type="text"
                  value={editServerUrl}
                  onChange={(e) => setEditServerUrl(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-sky-500 font-mono"
                  placeholder="https://cloud.ceramisys-erp.com/api/v1/sync"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  مفتاح الأمان والترخيص (API Access Key)
                </label>
                <input
                  type="password"
                  value={editApiKey}
                  onChange={(e) => setEditApiKey(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-sky-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    نمط التشغيل (Sync Mode)
                  </label>
                  <select
                    value={editSyncMode}
                    onChange={(e: any) => setEditSyncMode(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-sky-500"
                  >
                    <option value="HYBRID_AUTO">هجين ذكي (Hybrid Auto)</option>
                    <option value="CLOUD_CENTRAL">سحابي مباشر (Cloud Central)</option>
                    <option value="OFFLINE">أوفلاين محلي (Offline Only)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    دورية المزامنة التلقائية (بالثواني)
                  </label>
                  <input
                    type="number"
                    min="15"
                    max="3600"
                    value={editInterval}
                    onChange={(e) => setEditInterval(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-sky-600/20"
                >
                  حفظ وتطبيق الإعدادات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
