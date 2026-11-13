import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2, Cpu, Download, Fingerprint, Plus, RefreshCw, Smartphone,
  Trash2, Upload,
} from 'lucide-react';
import {
  AttendanceDeviceService, AttendanceDevice, AttendanceDeviceInput, AttendanceDeviceRecord,
  AttendanceDeviceType, DeviceEventType, DeviceStats, MobileAttendanceSession,
  ProcessingStatus, SyncStatus,
} from '../../../services/domains/hr/AttendanceDeviceService';
import { EmployeeService, Employee } from '../../../services/domains/hr/EmployeeService';
import { BranchAccessService } from '../../../services/domains/auth/BranchAccessService';

type Tab = 'devices' | 'records' | 'import' | 'mobile';

const localDateTime = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const deviceTypeLabel: Record<AttendanceDeviceType, string> = {
  FINGERPRINT: 'بصمة إصبع',
  FACE_RECOGNITION: 'تعرف على الوجه',
  CARD: 'بطاقة',
  QR_CODE: 'رمز QR',
  MOBILE_APP: 'تطبيق الجوال',
  OTHER: 'أخرى',
};

const eventTypeLabel: Record<DeviceEventType, string> = {
  CHECK_IN: 'حضور',
  CHECK_OUT: 'انصراف',
  BREAK_START: 'بداية راحة',
  BREAK_END: 'نهاية راحة',
  UNKNOWN: 'غير معروف',
};

const processingStatusLabel: Record<ProcessingStatus, string> = {
  PENDING: 'بالانتظار',
  PROCESSED: 'معالَج',
  SKIPPED: 'متخطى',
  ERROR: 'خطأ',
};

const syncStatusLabel: Record<SyncStatus, string> = {
  IDLE: 'جاهز', SYNCING: 'جارٍ المزامنة', ERROR: 'خطأ',
};

const statusTone = (status: string): string => {
  switch (status) {
    case 'PROCESSED': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'PENDING': return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'ERROR': return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'SKIPPED': return 'bg-slate-100 text-slate-500 border-slate-200';
    default: return 'bg-sky-50 text-sky-700 border-sky-200';
  }
};

const money = (value: number) => Number(value || 0).toLocaleString('ar-EG', { maximumFractionDigits: 2 });

const StatCard: React.FC<{ label: string; value: string; hint?: string; icon: React.ReactNode; tone: string }> = ({ label, value, hint, icon, tone }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4">
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-bold text-slate-500">{label}</span>
      <span className={`flex h-8 w-8 items-center justify-center rounded-lg border ${tone}`}>{icon}</span>
    </div>
    <div className="mt-2 text-xl font-black tabular-nums">{value}</div>
    {hint && <div className="mt-0.5 text-[10px] font-semibold text-slate-400">{hint}</div>}
  </div>
);

const emptyDeviceForm = (): AttendanceDeviceInput & { port: number | null } => ({
  branchId: '', deviceName: '', deviceType: 'FINGERPRINT', deviceCode: '',
  ipAddress: '', port: null, locationLat: '', locationLng: '',
  geoFenceRadiusMeters: 0, isActive: true,
});

export const AttendanceDevicesPage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('devices');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [devices, setDevices] = useState<AttendanceDevice[]>([]);
  const [stats, setStats] = useState<DeviceStats | null>(null);
  const [records, setRecords] = useState<AttendanceDeviceRecord[]>([]);
  const [mobileSessions, setMobileSessions] = useState<MobileAttendanceSession[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);

  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [deviceForm, setDeviceForm] = useState(emptyDeviceForm());

  const [recordFilter, setRecordFilter] = useState({ deviceId: '', from: '', to: '', status: '' as '' | ProcessingStatus });
  const [importForm, setImportForm] = useState({ deviceId: '', text: '' });
  const [importSummary, setImportSummary] = useState<string | null>(null);

  const [mobileFilter, setMobileFilter] = useState<'' | 'PENDING' | 'VERIFIED' | 'REJECTED'>('');
  const [mobileForm, setMobileForm] = useState({
    employeeId: '', branchId: '', sessionType: 'CHECK_IN' as 'CHECK_IN' | 'CHECK_OUT',
    recordedAt: localDateTime(), latitude: '', longitude: '', accuracyMeters: '', deviceInfo: '',
  });

  const branchAccess = useMemo(() => new BranchAccessService(), []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    try {
      const list = AttendanceDeviceService.getAttendanceDevices();
      setDevices(list);
      setStats(AttendanceDeviceService.getDeviceStats());
      setEmployees(EmployeeService.getAll({}));
      try {
        setBranches(branchAccess.getSelectableBranches().map((branch) => ({ id: branch.id, name: branch.name })));
      } catch { /* branch list is optional */ }
      setDeviceForm((prev) => ({ ...prev, branchId: prev.branchId || list[0]?.branchId || '' }));
      setImportForm((prev) => ({ ...prev, deviceId: prev.deviceId || list.find((device) => device.isActive)?.id || '' }));
      setMobileForm((prev) => ({ ...prev, branchId: prev.branchId || list[0]?.branchId || '' }));
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل بيانات أجهزة الحضور.');
    } finally {
      setLoading(false);
    }
  }, [branchAccess]);

  useEffect(() => { load(); }, [load]);

  const loadRecords = useCallback(() => {
    setError(null);
    try {
      setRecords(AttendanceDeviceService.getDeviceRecords({
        deviceId: recordFilter.deviceId || undefined,
        from: recordFilter.from || undefined,
        to: recordFilter.to ? `${recordFilter.to}T23:59:59` : undefined,
        processingStatus: recordFilter.status || undefined,
        limit: 300,
      }));
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل سجلات البصمة.');
    }
  }, [recordFilter]);

  const loadMobile = useCallback(() => {
    setError(null);
    try {
      setMobileSessions(AttendanceDeviceService.getMobileAttendanceSessions(mobileFilter || undefined));
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل جلسات الحضور من الجوال.');
    }
  }, [mobileFilter]);

  useEffect(() => { if (tab === 'records') loadRecords(); }, [tab, loadRecords]);
  useEffect(() => { if (tab === 'mobile') loadMobile(); }, [tab, loadMobile]);

  const run = (action: () => void, success?: string) => {
    setError(null);
    setNotice(null);
    try {
      action();
      if (success) setNotice(success);
      load();
    } catch (e: any) {
      setError(e?.message || 'تعذر تنفيذ العملية.');
    }
  };

  const resetDeviceForm = () => {
    setEditingDeviceId(null);
    setDeviceForm({ ...emptyDeviceForm(), branchId: branches[0]?.id || '' });
  };

  const startEditDevice = (device: AttendanceDevice) => {
    setEditingDeviceId(device.id);
    setDeviceForm({
      branchId: device.branchId,
      deviceName: device.deviceName,
      deviceType: device.deviceType,
      deviceCode: device.deviceCode,
      ipAddress: device.ipAddress || '',
      port: device.port,
      locationLat: device.locationLat || '',
      locationLng: device.locationLng || '',
      geoFenceRadiusMeters: device.geoFenceRadiusMeters,
      isActive: device.isActive,
    });
  };

  const saveDevice = () => {
    if (!deviceForm.branchId || !deviceForm.deviceName.trim() || !deviceForm.deviceCode.trim()) {
      setError('الفرع واسم الجهاز ورمز الجهاز مطلوبة.');
      return;
    }
    run(() => {
      const payload: AttendanceDeviceInput = {
        branchId: deviceForm.branchId,
        deviceName: deviceForm.deviceName.trim(),
        deviceType: deviceForm.deviceType,
        deviceCode: deviceForm.deviceCode.trim(),
        ipAddress: deviceForm.ipAddress || null,
        port: deviceForm.port ? Number(deviceForm.port) : null,
        locationLat: deviceForm.locationLat || null,
        locationLng: deviceForm.locationLng || null,
        geoFenceRadiusMeters: Number(deviceForm.geoFenceRadiusMeters) || 0,
        isActive: deviceForm.isActive !== false,
      };
      if (editingDeviceId) AttendanceDeviceService.updateAttendanceDevice(editingDeviceId, payload);
      else AttendanceDeviceService.createAttendanceDevice(payload);
      resetDeviceForm();
    }, editingDeviceId ? 'تم تحديث بيانات الجهاز.' : 'تمت إضافة الجهاز.');
  };

  const processPending = () => {
    setError(null);
    setNotice(null);
    try {
      const result = AttendanceDeviceService.processPendingRecords({
        deviceId: recordFilter.deviceId || undefined,
        from: recordFilter.from || undefined,
        to: recordFilter.to ? `${recordFilter.to}T23:59:59` : undefined,
      });
      setNotice(`تمت معالجة ${result.processed} سجل، تخطي ${result.skipped}، أخطاء ${result.errors}.`);
      loadRecords();
      load();
    } catch (e: any) {
      setError(e?.message || 'تعذر معالجة السجلات المعلقة.');
    }
  };

  const importRecords = () => {
    setError(null);
    setNotice(null);
    setImportSummary(null);
    try {
      if (!importForm.deviceId) throw new Error('يجب اختيار الجهاز.');
      const lines = importForm.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      if (!lines.length) throw new Error('أدخل سجلاً واحداً على الأقل.');
      const parsed = lines.map((line, index) => {
        const [employeeCode, timestamp, eventType, ...rest] = line.split(/[,;\t]/).map((part) => part.trim());
        if (!timestamp) throw new Error(`السطر ${index + 1}: تاريخ البصمة مفقود.`);
        const normalizedEvent = (eventType || 'CHECK_IN').toUpperCase() as DeviceEventType;
        return {
          employeeCode: employeeCode || null,
          deviceTimestamp: timestamp,
          deviceEventType: (Object.keys(eventTypeLabel) as DeviceEventType[]).includes(normalizedEvent) ? normalizedEvent : 'UNKNOWN' as DeviceEventType,
          rawData: rest.length ? rest.join(',') : line,
        };
      });
      const result = AttendanceDeviceService.importDeviceRecords({ deviceId: importForm.deviceId, records: parsed });
      setImportSummary(`تم العثور على ${result.recordsFound} سجل، مستورد ${result.recordsNew}، مكرر ${result.recordsDuplicate}، قيد المعالجة ${result.recordsNew}، متخطى ${result.recordsSkipped}، أخطاء ${result.recordsError}.`);
      setNotice('تم استيراد سجلات البصمة.');
      loadRecords();
      load();
    } catch (e: any) {
      setError(e?.message || 'تعذر استيراد السجلات.');
    }
  };

  const createMobileSession = () => {
    if (!mobileForm.employeeId || !mobileForm.branchId) { setError('اختر الموظف والفرع.'); return; }
    if (!mobileForm.latitude || !mobileForm.longitude) { setError('إحداثيات الموقع مطلوبة.'); return; }
    setError(null);
    setNotice(null);
    try {
      AttendanceDeviceService.createMobileAttendanceSession({
        employeeId: mobileForm.employeeId,
        branchId: mobileForm.branchId,
        sessionType: mobileForm.sessionType,
        recordedAt: mobileForm.recordedAt ? new Date(mobileForm.recordedAt).toISOString() : new Date().toISOString(),
        latitude: mobileForm.latitude,
        longitude: mobileForm.longitude,
        accuracyMeters: mobileForm.accuracyMeters ? Number(mobileForm.accuracyMeters) : null,
        deviceInfo: mobileForm.deviceInfo || null,
      });
      setNotice('تم تسجيل جلسة حضور الجوال.');
      setMobileForm((prev) => ({ ...prev, latitude: '', longitude: '', accuracyMeters: '', deviceInfo: '', recordedAt: localDateTime() }));
      loadMobile();
    } catch (e: any) {
      setError(e?.message || 'تعذر إنشاء جلسة الحضور.');
    }
  };

  const decideMobile = (session: MobileAttendanceSession, approve: boolean) => {
    let reason: string | null = null;
    if (!approve) {
      const entered = window.prompt('سبب رفض جلسة الحضور:');
      if (!entered?.trim()) return;
      reason = entered.trim();
    }
    setError(null);
    setNotice(null);
    try {
      AttendanceDeviceService.verifyMobileSession(session.id, approve, reason);
      setNotice(approve ? 'تم اعتماد جلسة الحضور.' : 'تم رفض جلسة الحضور.');
      loadMobile();
    } catch (e: any) {
      setError(e?.message || 'تعذر البت في الجلسة.');
    }
  };

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'devices', label: 'الأجهزة', icon: <Cpu className="h-4 w-4" /> },
    { id: 'records', label: 'سجلات البصمة', icon: <Fingerprint className="h-4 w-4" /> },
    { id: 'import', label: 'استيراد السجلات', icon: <Upload className="h-4 w-4" /> },
    { id: 'mobile', label: 'حضور الجوال', icon: <Smartphone className="h-4 w-4" /> },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden bg-slate-50 text-slate-900" dir="rtl">
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-200 bg-cyan-50">
          <Cpu className="h-5 w-5 text-cyan-600" />
        </div>
        <div>
          <h1 className="text-base font-black">أجهزة الحضور والانصراف</h1>
          <p className="text-xs font-medium text-slate-500">ربط أجهزة البصمة، استيراد السجلات ومعالجتها، وحضور الجوال بالموقع الجغرافي</p>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-auto p-6">
        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700">{error}</div>}
        {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-700">{notice}</div>}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="إجمالي الأجهزة" value={String(stats?.totalDevices ?? 0)} hint={`${stats?.activeDevices ?? 0} جهاز نشط`} icon={<Cpu className="h-4 w-4" />} tone="border-cyan-200 bg-cyan-50 text-cyan-600" />
          <StatCard label="سجلات معلقة" value={String(stats?.pendingRecords ?? 0)} hint="بانتظار المعالجة" icon={<RefreshCw className="h-4 w-4" />} tone="border-amber-200 bg-amber-50 text-amber-600" />
          <StatCard label="معالجة اليوم" value={String(stats?.processedToday ?? 0)} hint="سجلات بصمة" icon={<CheckCircle2 className="h-4 w-4" />} tone="border-emerald-200 bg-emerald-50 text-emerald-600" />
          <StatCard label="آخر مزامنة" value={stats?.lastSync ? stats.lastSync.slice(0, 10) : '—'} hint={stats?.lastSync ? stats.lastSync.slice(11, 16) : 'لم تتم بعد'} icon={<Download className="h-4 w-4" />} tone="border-slate-200 bg-slate-50 text-slate-600" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {tabs.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${tab === item.id ? 'bg-cyan-600 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
            >
              {item.icon} {item.label}
            </button>
          ))}
          <button onClick={() => { load(); if (tab === 'records') loadRecords(); if (tab === 'mobile') loadMobile(); }} className="mr-auto flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> تحديث
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><RefreshCw className="h-6 w-6 animate-spin text-cyan-500" /></div>
        ) : (
          <>
            {tab === 'devices' && (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_380px]">
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className="border-b border-slate-100 px-4 py-3">
                    <h2 className="text-sm font-black">الأجهزة ({devices.length})</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-right text-xs">
                      <thead className="bg-slate-50 text-[10px] uppercase text-slate-500">
                        <tr>
                          <th className="px-3 py-2 font-bold">الجهاز</th>
                          <th className="px-3 py-2 font-bold">النوع</th>
                          <th className="px-3 py-2 font-bold">الفرع</th>
                          <th className="px-3 py-2 font-bold">الاتصال</th>
                          <th className="px-3 py-2 font-bold">الحالة</th>
                          <th className="px-3 py-2 font-bold">آخر مزامنة</th>
                          <th className="px-3 py-2 font-bold">إجراءات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {devices.map((device) => (
                          <tr key={device.id} className="hover:bg-slate-50/70">
                            <td className="px-3 py-3">
                              <div className="font-bold">{device.deviceName}</div>
                              <div className="font-mono text-[10px] text-slate-500">{device.deviceCode}</div>
                            </td>
                            <td className="px-3 py-3 text-[10px]">{deviceTypeLabel[device.deviceType] || device.deviceType}</td>
                            <td className="px-3 py-3 text-[10px]">{device.branchName}</td>
                            <td className="px-3 py-3 text-[10px]">
                              <div>{device.ipAddress || '—'}{device.port ? `:${device.port}` : ''}</div>
                              {device.geoFenceRadiusMeters > 0 && <div className="text-slate-400">نطاق {money(device.geoFenceRadiusMeters)} م</div>}
                            </td>
                            <td className="px-3 py-3">
                              <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${device.isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>{device.isActive ? 'نشط' : 'موقوف'}</span>
                              <div className={`mt-1 text-[10px] font-bold ${device.syncStatus === 'ERROR' ? 'text-rose-600' : 'text-slate-400'}`}>{syncStatusLabel[device.syncStatus]}</div>
                              {device.lastError && <div className="mt-0.5 max-w-[140px] truncate text-[10px] text-rose-500" title={device.lastError}>{device.lastError}</div>}
                            </td>
                            <td className="px-3 py-3 text-[10px] tabular-nums">{device.lastSyncAt ? device.lastSyncAt.slice(0, 16).replace('T', ' ') : '—'}</td>
                            <td className="px-3 py-3">
                              <div className="flex flex-wrap gap-1">
                                <button onClick={() => startEditDevice(device)} className="rounded border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-50">تعديل</button>
                                <button onClick={() => run(() => AttendanceDeviceService.updateAttendanceDevice(device.id, { isActive: !device.isActive }), device.isActive ? 'تم إيقاف الجهاز.' : 'تم تفعيل الجهاز.')} className="rounded border border-cyan-200 px-2 py-1 text-[10px] font-bold text-cyan-700 hover:bg-cyan-50">{device.isActive ? 'إيقاف' : 'تفعيل'}</button>
                                <button onClick={() => { if (window.confirm('حذف الجهاز؟')) run(() => AttendanceDeviceService.deleteAttendanceDevice(device.id), 'تم حذف الجهاز.'); }} className="rounded border border-rose-200 px-2 py-1 text-[10px] font-bold text-rose-600 hover:bg-rose-50" aria-label="حذف"><Trash2 className="h-3 w-3" /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {!devices.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-xs text-slate-400">لا توجد أجهزة مسجلة.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-black">{editingDeviceId ? 'تعديل جهاز' : 'جهاز جديد'}</h2>
                    {editingDeviceId && <button onClick={resetDeviceForm} className="text-[10px] font-bold text-slate-500 hover:text-slate-800">إلغاء</button>}
                  </div>
                  <label className="block text-[10px] font-bold text-slate-500">الفرع
                    <select value={deviceForm.branchId} onChange={(e) => setDeviceForm((prev) => ({ ...prev, branchId: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                      <option value="">اختر الفرع</option>
                      {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-[10px] font-bold text-slate-500">اسم الجهاز
                      <input value={deviceForm.deviceName} onChange={(e) => setDeviceForm((prev) => ({ ...prev, deviceName: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    </label>
                    <label className="block text-[10px] font-bold text-slate-500">رمز الجهاز
                      <input value={deviceForm.deviceCode} onChange={(e) => setDeviceForm((prev) => ({ ...prev, deviceCode: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono" />
                    </label>
                    <label className="block text-[10px] font-bold text-slate-500">النوع
                      <select value={deviceForm.deviceType} onChange={(e) => setDeviceForm((prev) => ({ ...prev, deviceType: e.target.value as AttendanceDeviceType }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                        {(Object.keys(deviceTypeLabel) as AttendanceDeviceType[]).map((type) => <option key={type} value={type}>{deviceTypeLabel[type]}</option>)}
                      </select>
                    </label>
                    <label className="block text-[10px] font-bold text-slate-500">المنفذ
                      <input type="number" min="0" value={deviceForm.port ?? ''} onChange={(e) => setDeviceForm((prev) => ({ ...prev, port: e.target.value ? Number(e.target.value) : null }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    </label>
                    <label className="block text-[10px] font-bold text-slate-500">عنوان IP
                      <input value={deviceForm.ipAddress || ''} onChange={(e) => setDeviceForm((prev) => ({ ...prev, ipAddress: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono" />
                    </label>
                    <label className="block text-[10px] font-bold text-slate-500">نطاق الموقع (متر)
                      <input type="number" min="0" value={deviceForm.geoFenceRadiusMeters ?? 0} onChange={(e) => setDeviceForm((prev) => ({ ...prev, geoFenceRadiusMeters: Number(e.target.value) || 0 }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    </label>
                    <label className="block text-[10px] font-bold text-slate-500">خط العرض
                      <input value={deviceForm.locationLat || ''} onChange={(e) => setDeviceForm((prev) => ({ ...prev, locationLat: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono" />
                    </label>
                    <label className="block text-[10px] font-bold text-slate-500">خط الطول
                      <input value={deviceForm.locationLng || ''} onChange={(e) => setDeviceForm((prev) => ({ ...prev, locationLng: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono" />
                    </label>
                  </div>
                  <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600">
                    <input type="checkbox" checked={deviceForm.isActive !== false} onChange={(e) => setDeviceForm((prev) => ({ ...prev, isActive: e.target.checked }))} className="h-4 w-4 rounded border-slate-300" />
                    جهاز نشط
                  </label>
                  <button onClick={saveDevice} className="flex w-full items-center justify-center gap-1 rounded-lg bg-cyan-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-cyan-700">
                    <Plus className="h-3.5 w-3.5" /> {editingDeviceId ? 'حفظ التعديلات' : 'إضافة الجهاز'}
                  </button>
                </div>
              </div>
            )}

            {tab === 'records' && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3">
                  <label className="text-[10px] font-bold text-slate-500">الجهاز
                    <select value={recordFilter.deviceId} onChange={(e) => setRecordFilter((prev) => ({ ...prev, deviceId: e.target.value }))} className="mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
                      <option value="">كل الأجهزة</option>
                      {devices.map((device) => <option key={device.id} value={device.id}>{device.deviceName}</option>)}
                    </select>
                  </label>
                  <label className="text-[10px] font-bold text-slate-500">من
                    <input type="date" value={recordFilter.from} onChange={(e) => setRecordFilter((prev) => ({ ...prev, from: e.target.value }))} className="mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
                  </label>
                  <label className="text-[10px] font-bold text-slate-500">إلى
                    <input type="date" value={recordFilter.to} onChange={(e) => setRecordFilter((prev) => ({ ...prev, to: e.target.value }))} className="mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
                  </label>
                  <label className="text-[10px] font-bold text-slate-500">الحالة
                    <select value={recordFilter.status} onChange={(e) => setRecordFilter((prev) => ({ ...prev, status: e.target.value as '' | ProcessingStatus }))} className="mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
                      <option value="">الكل</option>
                      {(Object.keys(processingStatusLabel) as ProcessingStatus[]).map((status) => <option key={status} value={status}>{processingStatusLabel[status]}</option>)}
                    </select>
                  </label>
                  <button onClick={loadRecords} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700">تطبيق</button>
                  <button onClick={processPending} className="rounded-lg bg-cyan-600 px-3 py-2 text-xs font-bold text-white hover:bg-cyan-700">معالجة المعلقة</button>
                  <span className="mr-auto text-[10px] font-semibold text-slate-400">{records.length} سجل</span>
                </div>
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-right text-xs">
                      <thead className="bg-slate-50 text-[10px] uppercase text-slate-500">
                        <tr>
                          <th className="px-3 py-2 font-bold">الموظف</th>
                          <th className="px-3 py-2 font-bold">الجهاز</th>
                          <th className="px-3 py-2 font-bold">وقت البصمة</th>
                          <th className="px-3 py-2 font-bold">الحدث</th>
                          <th className="px-3 py-2 font-bold">الموقع</th>
                          <th className="px-3 py-2 font-bold">الحالة</th>
                          <th className="px-3 py-2 font-bold">ملاحظات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {records.map((record) => (
                          <tr key={record.id} className="hover:bg-slate-50/70">
                            <td className="px-3 py-2.5">
                              <div className="font-bold">{record.employeeName || 'غير مرتبط'}</div>
                              <div className="font-mono text-[10px] text-slate-500">{record.employeeCode || '—'}</div>
                            </td>
                            <td className="px-3 py-2.5 text-[10px]">{record.deviceName}</td>
                            <td className="px-3 py-2.5 text-[10px] tabular-nums">{record.deviceTimestamp.slice(0, 16).replace('T', ' ')}</td>
                            <td className="px-3 py-2.5 text-[10px]">{eventTypeLabel[record.deviceEventType] || record.deviceEventType}</td>
                            <td className="px-3 py-2.5 text-[10px]">
                              {record.latitude && record.longitude ? `${record.latitude}, ${record.longitude}` : '—'}
                              {record.accuracyMeters != null && <div className="text-slate-400">دقة {money(record.accuracyMeters)} م</div>}
                            </td>
                            <td className="px-3 py-2.5">
                              <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusTone(record.processingStatus)}`}>{processingStatusLabel[record.processingStatus]}</span>
                            </td>
                            <td className="px-3 py-2.5 text-[10px] text-slate-500">
                              {record.processingError || (record.processedAt ? `عولج في ${record.processedAt.slice(0, 10)}` : '—')}
                            </td>
                          </tr>
                        ))}
                        {!records.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-xs text-slate-400">لا توجد سجلات بصمة مطابقة.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {tab === 'import' && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                  <h2 className="flex items-center gap-1.5 text-sm font-black"><Upload className="h-4 w-4 text-cyan-600" /> استيراد سجلات البصمة</h2>
                  <label className="block text-[10px] font-bold text-slate-500">الجهاز
                    <select value={importForm.deviceId} onChange={(e) => setImportForm((prev) => ({ ...prev, deviceId: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                      <option value="">اختر الجهاز</option>
                      {devices.filter((device) => device.isActive).map((device) => <option key={device.id} value={device.id}>{device.deviceName} ({device.deviceCode})</option>)}
                    </select>
                  </label>
                  <label className="block text-[10px] font-bold text-slate-500">السجلات (سطر لكل بصمة)
                    <textarea
                      value={importForm.text}
                      onChange={(e) => setImportForm((prev) => ({ ...prev, text: e.target.value }))}
                      rows={12}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs"
                      placeholder={'EMP001,2026-11-11T08:02:00,CHECK_IN\nEMP001,2026-11-11T17:05:00,CHECK_OUT'}
                      dir="ltr"
                    />
                  </label>
                  <button onClick={importRecords} className="w-full rounded-lg bg-cyan-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-cyan-700">استيراد السجلات</button>
                  {importSummary && <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-[11px] font-semibold text-cyan-800">{importSummary}</div>}
                </div>
                <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                  <h2 className="text-sm font-black">تنسيق السجلات</h2>
                  <div className="rounded-lg bg-slate-900 p-3 font-mono text-[11px] leading-5 text-slate-100" dir="ltr">
                    <div>employeeCode,timestamp,eventType,rawData</div>
                    <div className="text-slate-400">EMP001,2026-11-11T08:02:00,CHECK_IN</div>
                    <div className="text-slate-400">EMP001,2026-11-11T17:05:00,CHECK_OUT</div>
                  </div>
                  <ul className="list-inside list-disc space-y-1 text-[11px] leading-5 text-slate-500">
                    <li>رمز الموظف اختياري؛ السجل غير المرتبط يبقى معلقاً حتى الربط.</li>
                    <li>أنواع الأحداث المدعومة: CHECK_IN, CHECK_OUT, BREAK_START, BREAK_END.</li>
                    <li>صيغة التاريخ ISO مثل 2026-11-11T08:02:00 أو تاريخ فقط.</li>
                    <li>يمكن استخدام الفاصلة أو الفاصلة المنقوطة أو Tab كفاصل بين الحقول.</li>
                    <li>السجلات المكررة لنفس الموظف والوقت تُتجاهل تلقائياً.</li>
                  </ul>
                  <p className="text-[10px] leading-4 text-slate-400">بعد الاستيراد استخدم «سجلات البصمة» ثم «معالجة المعلقة» لتحويل السجلات إلى حضور فعلي.</p>
                </div>
              </div>
            )}

            {tab === 'mobile' && (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
                    <label className="text-[10px] font-bold text-slate-500">الحالة
                      <select value={mobileFilter} onChange={(e) => setMobileFilter(e.target.value as typeof mobileFilter)} className="mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
                        <option value="">الكل</option>
                        <option value="PENDING">بالانتظار</option>
                        <option value="VERIFIED">معتمد</option>
                        <option value="REJECTED">مرفوض</option>
                      </select>
                    </label>
                    <button onClick={loadMobile} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700">تحديث</button>
                    <span className="mr-auto text-[10px] font-semibold text-slate-400">{mobileSessions.length} جلسة</span>
                  </div>
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-right text-xs">
                        <thead className="bg-slate-50 text-[10px] uppercase text-slate-500">
                          <tr>
                            <th className="px-3 py-2 font-bold">الموظف</th>
                            <th className="px-3 py-2 font-bold">النوع</th>
                            <th className="px-3 py-2 font-bold">الوقت</th>
                            <th className="px-3 py-2 font-bold">الموقع</th>
                            <th className="px-3 py-2 font-bold">الحالة</th>
                            <th className="px-3 py-2 font-bold">إجراءات</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {mobileSessions.map((session) => (
                            <tr key={session.id} className="hover:bg-slate-50/70">
                              <td className="px-3 py-2.5 font-bold">{session.employeeName}</td>
                              <td className="px-3 py-2.5 text-[10px]">{session.sessionType === 'CHECK_IN' ? 'حضور' : 'انصراف'}</td>
                              <td className="px-3 py-2.5 text-[10px] tabular-nums">{session.recordedAt.slice(0, 16).replace('T', ' ')}</td>
                              <td className="px-3 py-2.5 text-[10px]">
                                {session.latitude}, {session.longitude}
                                {session.accuracyMeters != null && <div className="text-slate-400">دقة {money(session.accuracyMeters)} م</div>}
                              </td>
                              <td className="px-3 py-2.5">
                                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${session.status === 'VERIFIED' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : session.status === 'REJECTED' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                                  {session.status === 'VERIFIED' ? 'معتمد' : session.status === 'REJECTED' ? 'مرفوض' : 'بالانتظار'}
                                </span>
                                {session.rejectionReason && <div className="mt-1 max-w-[140px] truncate text-[10px] text-rose-500" title={session.rejectionReason}>{session.rejectionReason}</div>}
                              </td>
                              <td className="px-3 py-2.5">
                                {session.status === 'PENDING' ? (
                                  <div className="flex gap-1">
                                    <button onClick={() => decideMobile(session, true)} className="rounded border border-emerald-200 px-2 py-1 text-[10px] font-bold text-emerald-700 hover:bg-emerald-50">اعتماد</button>
                                    <button onClick={() => decideMobile(session, false)} className="rounded border border-rose-200 px-2 py-1 text-[10px] font-bold text-rose-700 hover:bg-rose-50">رفض</button>
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-slate-400">{session.verifiedByName || '—'}</span>
                                )}
                              </td>
                            </tr>
                          ))}
                          {!mobileSessions.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-xs text-slate-400">لا توجد جلسات حضور من الجوال.</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                  <h2 className="text-sm font-black">تسجيل جلسة جوال</h2>
                  <label className="block text-[10px] font-bold text-slate-500">الموظف
                    <select value={mobileForm.employeeId} onChange={(e) => {
                      const employee = employees.find((item) => item.id === e.target.value);
                      setMobileForm((prev) => ({ ...prev, employeeId: e.target.value, branchId: employee?.branchId || prev.branchId }));
                    }} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                      <option value="">اختر الموظف</option>
                      {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} ({employee.code})</option>)}
                    </select>
                  </label>
                  <label className="block text-[10px] font-bold text-slate-500">الفرع
                    <select value={mobileForm.branchId} onChange={(e) => setMobileForm((prev) => ({ ...prev, branchId: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                      <option value="">اختر الفرع</option>
                      {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-[10px] font-bold text-slate-500">النوع
                      <select value={mobileForm.sessionType} onChange={(e) => setMobileForm((prev) => ({ ...prev, sessionType: e.target.value as 'CHECK_IN' | 'CHECK_OUT' }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                        <option value="CHECK_IN">حضور</option>
                        <option value="CHECK_OUT">انصراف</option>
                      </select>
                    </label>
                    <label className="block text-[10px] font-bold text-slate-500">الوقت
                      <input type="datetime-local" value={mobileForm.recordedAt} onChange={(e) => setMobileForm((prev) => ({ ...prev, recordedAt: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    </label>
                    <label className="block text-[10px] font-bold text-slate-500">خط العرض
                      <input value={mobileForm.latitude} onChange={(e) => setMobileForm((prev) => ({ ...prev, latitude: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono" />
                    </label>
                    <label className="block text-[10px] font-bold text-slate-500">خط الطول
                      <input value={mobileForm.longitude} onChange={(e) => setMobileForm((prev) => ({ ...prev, longitude: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono" />
                    </label>
                    <label className="block text-[10px] font-bold text-slate-500">دقة الموقع (متر)
                      <input type="number" min="0" value={mobileForm.accuracyMeters} onChange={(e) => setMobileForm((prev) => ({ ...prev, accuracyMeters: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    </label>
                    <label className="block text-[10px] font-bold text-slate-500">معلومات الجهاز
                      <input value={mobileForm.deviceInfo} onChange={(e) => setMobileForm((prev) => ({ ...prev, deviceInfo: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    </label>
                  </div>
                  <button onClick={createMobileSession} className="w-full rounded-lg bg-cyan-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-cyan-700">تسجيل الجلسة</button>
                  <p className="text-[10px] leading-4 text-slate-400">تبقى الجلسة «بالانتظار» حتى يعتمدها مسؤول الحضور من الجدول المجاور.</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AttendanceDevicesPage;
