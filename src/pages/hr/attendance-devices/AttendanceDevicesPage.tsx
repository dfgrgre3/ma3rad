import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { PageHeader } from '../../../components/ui/PageHeader';
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
import { useTabPermissions } from '../../../hooks/domains/auth/useTabPermissions';
import { StatCard as UiStatCard } from '../../../components/ui/Card';


const statTone = (cls: string): 'default' | 'success' | 'danger' | 'warning' =>
  /rose|red|danger/.test(cls) ? 'danger' : /amber|orange/.test(cls) ? 'warning' : /emerald|green|success/.test(cls) ? 'success' : 'default';

const StatCard: React.FC<{ label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: React.ReactNode; tone?: string }> = ({ label, value, hint, icon, tone }: any) => (
  <UiStatCard label={label} value={value} hint={hint} icon={icon} tone={statTone(tone || '')} />
);
type Tab = 'devices' | 'records' | 'import' | 'mobile';

const TAB_PERMISSIONS: Record<Tab, readonly string[]> = {
  devices: ['hr.attendance.manage', 'employees.attendance.manage'],
  records: ['employees.attendance.view', 'employees.attendance.manage', 'employees.attendance.approve', 'hr.attendance.manage'],
  import: ['employees.attendance.manage', 'hr.attendance.manage'],
  mobile: ['employees.attendance.view', 'employees.attendance.manage', 'employees.attendance.approve', 'hr.attendance.manage'],
};

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
    case 'PROCESSED': return 'bg-success-soft text-success border-success-border';
    case 'PENDING': return 'bg-warning-soft text-warning border-warning-border';
    case 'ERROR': return 'bg-danger-soft text-danger border-danger-border';
    case 'SKIPPED': return 'bg-surface-sunken text-muted border-line';
    default: return 'bg-accent-soft text-primary border-accent-border';
  }
};

const money = (value: number) => Number(value || 0).toLocaleString('ar-EG', { maximumFractionDigits: 2 });


const emptyDeviceForm = (): AttendanceDeviceInput & { port: number | null } => ({
  branchId: '', deviceName: '', deviceType: 'FINGERPRINT', deviceCode: '',
  ipAddress: '', port: null, locationLat: '', locationLng: '',
  geoFenceRadiusMeters: 0, isActive: true,
});

export const AttendanceDevicesPage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('devices');
  const canTab = useTabPermissions<Tab>(TAB_PERMISSIONS);
  const anyTabAllowed = (['devices', 'records', 'import', 'mobile'] as Tab[]).some(canTab);
  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'devices', label: 'الأجهزة', icon: <Cpu className="h-4 w-4" /> },
    { id: 'records', label: 'سجلات البصمة', icon: <Fingerprint className="h-4 w-4" /> },
    { id: 'import', label: 'استيراد السجلات', icon: <Upload className="h-4 w-4" /> },
    { id: 'mobile', label: 'حضور الجوال', icon: <Smartphone className="h-4 w-4" /> },
  ];
  const visibleTabs = tabs.filter((t) => canTab(t.id));
  const activeTab: Tab = canTab(tab) ? tab : (visibleTabs[0]?.id ?? tab);
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = AttendanceDeviceService.getAttendanceDevices();
      setDevices(list);
      setStats(AttendanceDeviceService.getDeviceStats());
      setEmployees(await EmployeeService.getAllAsync({}));
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

  useEffect(() => { if (anyTabAllowed) load(); }, [load, anyTabAllowed]);

  const loadRecords = useCallback(() => {
    if (!canTab('records')) return;
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
    if (!canTab('mobile')) return;
    setError(null);
    try {
      setMobileSessions(AttendanceDeviceService.getMobileAttendanceSessions(mobileFilter || undefined));
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل جلسات الحضور من الجوال.');
    }
  }, [mobileFilter]);

  useEffect(() => { if (activeTab === 'records' && canTab('records')) loadRecords(); }, [activeTab, loadRecords, canTab]);
  useEffect(() => { if (activeTab === 'mobile' && canTab('mobile')) loadMobile(); }, [activeTab, loadMobile, canTab]);

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

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface-muted text-ink">
      <div className="border-b border-line bg-surface px-6 pt-4">
        <PageHeader
          icon={<Cpu className="h-5 w-5" />}
          title="أجهزة الحضور والانصراف"
          description="ربط أجهزة البصمة، استيراد السجلات ومعالجتها، وحضور الجوال بالموقع الجغرافي"
        />
      </div>

      <div className="flex-1 space-y-4 overflow-auto p-6">
        {error && <div className="rounded-xl border border-danger-border bg-danger-soft px-4 py-2.5 text-xs font-semibold text-danger">{error}</div>}
        {notice && <div className="rounded-xl border border-success-border bg-success-soft px-4 py-2.5 text-xs font-semibold text-success">{notice}</div>}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="إجمالي الأجهزة" value={String(stats?.totalDevices ?? 0)} hint={`${stats?.activeDevices ?? 0} جهاز نشط`} icon={<Cpu className="h-4 w-4" />} tone="border-accent-border bg-accent-soft text-primary" />
          <StatCard label="سجلات معلقة" value={String(stats?.pendingRecords ?? 0)} hint="بانتظار المعالجة" icon={<RefreshCw className="h-4 w-4" />} tone="border-warning-border bg-warning-soft text-warning" />
          <StatCard label="معالجة اليوم" value={String(stats?.processedToday ?? 0)} hint="سجلات بصمة" icon={<CheckCircle2 className="h-4 w-4" />} tone="border-success-border bg-success-soft text-success" />
          <StatCard label="آخر مزامنة" value={stats?.lastSync ? stats.lastSync.slice(0, 10) : '—'} hint={stats?.lastSync ? stats.lastSync.slice(11, 16) : 'لم تتم بعد'} icon={<Download className="h-4 w-4" />} tone="border-line bg-surface-muted text-ink-secondary" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {visibleTabs.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${activeTab === item.id ? 'bg-primary text-white' : 'border border-line bg-surface text-ink hover:bg-surface-muted'}`}
            >
              {item.icon} {item.label}
            </button>
          ))}
          <button onClick={() => { load(); if (activeTab === 'records' && canTab('records')) loadRecords(); if (activeTab === 'mobile' && canTab('mobile')) loadMobile(); }} className="mr-auto flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white hover:bg-primary">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> تحديث
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><RefreshCw className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <>
            {activeTab === 'devices' && canTab('devices') && (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_380px]">
                <div className="overflow-hidden rounded-xl border border-line bg-surface">
                  <div className="border-b border-line px-4 py-3">
                    <h2 className="text-sm font-black">الأجهزة ({devices.length})</h2>
                  </div>
                  <DataTable
                                        ariaLabel="الأجهزة"
                                        rows={devices}
                                        rowKey={(device) => device.id}
                                        dense
                                        columns={[
                                          {
                                            key: 'device', header: 'الجهاز',
                                            render: (device) => (
                                              <span>
                                                <span className="font-bold block">{device.deviceName}</span>
                                                <span className="font-mono text-[10px] text-muted">{device.deviceCode}</span>
                                              </span>
                                            ),
                                          },
                                          { key: 'type', header: 'النوع', render: (device) => deviceTypeLabel[device.deviceType] || device.deviceType },
                                          { key: 'branch', header: 'الفرع', render: (device) => device.branchName },
                                          {
                                            key: 'conn', header: 'الاتصال',
                                            render: (device) => (
                                              <span>
                                                <span className="block">{device.ipAddress || '—'}{device.port ? `:${device.port}` : ''}</span>
                                                {device.geoFenceRadiusMeters > 0 && <span className="text-muted">نطاق {money(device.geoFenceRadiusMeters)} م</span>}
                                              </span>
                                            ),
                                          },
                                          {
                                            key: 'status', header: 'الحالة',
                                            render: (device) => (
                                              <span>
                                                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${device.isActive ? 'border-success-border bg-success-soft text-success' : 'border-line bg-surface-muted text-muted'}`}>{device.isActive ? 'نشط' : 'موقوف'}</span>
                                                <span className={`mt-1 block text-[10px] font-bold ${device.syncStatus === 'ERROR' ? 'text-danger' : 'text-muted'}`}>{syncStatusLabel[device.syncStatus]}</span>
                                                {device.lastError && <span className="mt-0.5 block max-w-[140px] truncate text-[10px] text-danger" title={device.lastError}>{device.lastError}</span>}
                                              </span>
                                            ),
                                          },
                                          { key: 'sync', header: 'آخر مزامنة', render: (device) => <span className="tabular-nums">{device.lastSyncAt ? device.lastSyncAt.slice(0, 16).replace('T', ' ') : '—'}</span> },
                                          {
                                            key: 'actions', header: 'إجراءات',
                                            render: (device) => (
                                              <div className="flex flex-wrap gap-1">
                                                <button onClick={() => startEditDevice(device)} className="rounded border border-line px-2 py-1 text-[10px] font-bold text-ink hover:bg-surface-muted">تعديل</button>
                                                <button onClick={() => run(() => AttendanceDeviceService.updateAttendanceDevice(device.id, { isActive: !device.isActive }), device.isActive ? 'تم إيقاف الجهاز.' : 'تم تفعيل الجهاز.')} className="rounded border border-accent-border px-2 py-1 text-[10px] font-bold text-primary hover:bg-accent-soft">{device.isActive ? 'إيقاف' : 'تفعيل'}</button>
                                                <button onClick={() => { if (window.confirm('حذف الجهاز؟')) run(() => AttendanceDeviceService.deleteAttendanceDevice(device.id), 'تم حذف الجهاز.'); }} className="rounded border border-danger-border px-2 py-1 text-[10px] font-bold text-danger hover:bg-danger-soft" aria-label="حذف"><Trash2 className="h-3 w-3" /></button>
                                              </div>
                                            ),
                                          },
                                        ]}
                                        emptyTitle="لا توجد أجهزة مسجلة."
                                      />

                </div>

                <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-black">{editingDeviceId ? 'تعديل جهاز' : 'جهاز جديد'}</h2>
                    {editingDeviceId && <button onClick={resetDeviceForm} className="text-[10px] font-bold text-muted hover:text-ink">إلغاء</button>}
                  </div>
                  <label className="block text-[10px] font-bold text-muted">الفرع
                    <select value={deviceForm.branchId} onChange={(e) => setDeviceForm((prev) => ({ ...prev, branchId: e.target.value }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm">
                      <option value="">اختر الفرع</option>
                      {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-[10px] font-bold text-muted">اسم الجهاز
                      <input value={deviceForm.deviceName} onChange={(e) => setDeviceForm((prev) => ({ ...prev, deviceName: e.target.value }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" />
                    </label>
                    <label className="block text-[10px] font-bold text-muted">رمز الجهاز
                      <input value={deviceForm.deviceCode} onChange={(e) => setDeviceForm((prev) => ({ ...prev, deviceCode: e.target.value }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm font-mono" />
                    </label>
                    <label className="block text-[10px] font-bold text-muted">النوع
                      <select value={deviceForm.deviceType} onChange={(e) => setDeviceForm((prev) => ({ ...prev, deviceType: e.target.value as AttendanceDeviceType }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm">
                        {(Object.keys(deviceTypeLabel) as AttendanceDeviceType[]).map((type) => <option key={type} value={type}>{deviceTypeLabel[type]}</option>)}
                      </select>
                    </label>
                    <label className="block text-[10px] font-bold text-muted">المنفذ
                      <input type="number" min="0" value={deviceForm.port ?? ''} onChange={(e) => setDeviceForm((prev) => ({ ...prev, port: e.target.value ? Number(e.target.value) : null }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" />
                    </label>
                    <label className="block text-[10px] font-bold text-muted">عنوان IP
                      <input value={deviceForm.ipAddress || ''} onChange={(e) => setDeviceForm((prev) => ({ ...prev, ipAddress: e.target.value }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm font-mono" />
                    </label>
                    <label className="block text-[10px] font-bold text-muted">نطاق الموقع (متر)
                      <input type="number" min="0" value={deviceForm.geoFenceRadiusMeters ?? 0} onChange={(e) => setDeviceForm((prev) => ({ ...prev, geoFenceRadiusMeters: Number(e.target.value) || 0 }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" />
                    </label>
                    <label className="block text-[10px] font-bold text-muted">خط العرض
                      <input value={deviceForm.locationLat || ''} onChange={(e) => setDeviceForm((prev) => ({ ...prev, locationLat: e.target.value }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm font-mono" />
                    </label>
                    <label className="block text-[10px] font-bold text-muted">خط الطول
                      <input value={deviceForm.locationLng || ''} onChange={(e) => setDeviceForm((prev) => ({ ...prev, locationLng: e.target.value }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm font-mono" />
                    </label>
                  </div>
                  <label className="flex items-center gap-2 text-[11px] font-bold text-ink-secondary">
                    <input type="checkbox" checked={deviceForm.isActive !== false} onChange={(e) => setDeviceForm((prev) => ({ ...prev, isActive: e.target.checked }))} className="h-4 w-4 rounded border-line-strong" />
                    جهاز نشط
                  </label>
                  <button onClick={saveDevice} className="flex w-full items-center justify-center gap-1 rounded-lg bg-primary px-4 py-2.5 text-xs font-bold text-white hover:bg-primary">
                    <Plus className="h-3.5 w-3.5" /> {editingDeviceId ? 'حفظ التعديلات' : 'إضافة الجهاز'}
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'records' && canTab('records') && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-surface p-3">
                  <label className="text-[10px] font-bold text-muted">الجهاز
                    <select value={recordFilter.deviceId} onChange={(e) => setRecordFilter((prev) => ({ ...prev, deviceId: e.target.value }))} className="mt-1 block rounded-lg border border-line px-2 py-1.5 text-xs">
                      <option value="">كل الأجهزة</option>
                      {devices.map((device) => <option key={device.id} value={device.id}>{device.deviceName}</option>)}
                    </select>
                  </label>
                  <label className="text-[10px] font-bold text-muted">من
                    <input type="date" value={recordFilter.from} onChange={(e) => setRecordFilter((prev) => ({ ...prev, from: e.target.value }))} className="mt-1 block rounded-lg border border-line px-2 py-1.5 text-xs" />
                  </label>
                  <label className="text-[10px] font-bold text-muted">إلى
                    <input type="date" value={recordFilter.to} onChange={(e) => setRecordFilter((prev) => ({ ...prev, to: e.target.value }))} className="mt-1 block rounded-lg border border-line px-2 py-1.5 text-xs" />
                  </label>
                  <label className="text-[10px] font-bold text-muted">الحالة
                    <select value={recordFilter.status} onChange={(e) => setRecordFilter((prev) => ({ ...prev, status: e.target.value as '' | ProcessingStatus }))} className="mt-1 block rounded-lg border border-line px-2 py-1.5 text-xs">
                      <option value="">الكل</option>
                      {(Object.keys(processingStatusLabel) as ProcessingStatus[]).map((status) => <option key={status} value={status}>{processingStatusLabel[status]}</option>)}
                    </select>
                  </label>
                  <button onClick={loadRecords} className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white hover:bg-primary">تطبيق</button>
                  <button onClick={processPending} className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white hover:bg-primary">معالجة المعلقة</button>
                  <span className="mr-auto text-[10px] font-semibold text-muted">{records.length} سجل</span>
                </div>
                <div className="overflow-hidden rounded-xl border border-line bg-surface">
                  <DataTable
                                        ariaLabel="سجلات البصمة"
                                        rows={records}
                                        rowKey={(record) => record.id}
                                        dense
                                        columns={[
                                          {
                                            key: 'employee', header: 'الموظف',
                                            render: (record) => (
                                              <span>
                                                <span className="font-bold block">{record.employeeName || 'غير مرتبط'}</span>
                                                <span className="font-mono text-[10px] text-muted">{record.employeeCode || '—'}</span>
                                              </span>
                                            ),
                                          },
                                          { key: 'device', header: 'الجهاز', render: (record) => record.deviceName },
                                          { key: 'time', header: 'وقت البصمة', render: (record) => <span className="tabular-nums">{record.deviceTimestamp.slice(0, 16).replace('T', ' ')}</span> },
                                          { key: 'event', header: 'الحدث', render: (record) => eventTypeLabel[record.deviceEventType] || record.deviceEventType },
                                          {
                                            key: 'location', header: 'الموقع',
                                            render: (record) => (
                                              <span>
                                                {record.latitude && record.longitude ? `${record.latitude}, ${record.longitude}` : '—'}
                                                {record.accuracyMeters != null && <span className="block text-muted">دقة {money(record.accuracyMeters)} م</span>}
                                              </span>
                                            ),
                                          },
                                          { key: 'status', header: 'الحالة', render: (record) => <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusTone(record.processingStatus)}`}>{processingStatusLabel[record.processingStatus]}</span> },
                                          { key: 'notes', header: 'ملاحظات', render: (record) => <span className="text-muted">{record.processingError || (record.processedAt ? `عولج في ${record.processedAt.slice(0, 10)}` : '—')}</span> },
                                        ]}
                                        emptyTitle="لا توجد سجلات بصمة مطابقة."
                                      />

                </div>
              </div>
            )}

            {activeTab === 'import' && canTab('import') && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
                  <h2 className="flex items-center gap-1.5 text-sm font-black"><Upload className="h-4 w-4 text-primary" /> استيراد سجلات البصمة</h2>
                  <label className="block text-[10px] font-bold text-muted">الجهاز
                    <select value={importForm.deviceId} onChange={(e) => setImportForm((prev) => ({ ...prev, deviceId: e.target.value }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm">
                      <option value="">اختر الجهاز</option>
                      {devices.filter((device) => device.isActive).map((device) => <option key={device.id} value={device.id}>{device.deviceName} ({device.deviceCode})</option>)}
                    </select>
                  </label>
                  <label className="block text-[10px] font-bold text-muted">السجلات (سطر لكل بصمة)
                    <textarea
                      value={importForm.text}
                      onChange={(e) => setImportForm((prev) => ({ ...prev, text: e.target.value }))}
                      rows={12}
                      className="mt-1 w-full rounded-lg border border-line px-3 py-2 font-mono text-xs"
                      placeholder={'EMP001,2026-11-11T08:02:00,CHECK_IN\nEMP001,2026-11-11T17:05:00,CHECK_OUT'}
                      dir="ltr"
                    />
                  </label>
                  <button onClick={importRecords} className="w-full rounded-lg bg-primary px-4 py-2.5 text-xs font-bold text-white hover:bg-primary">استيراد السجلات</button>
                  {importSummary && <div className="rounded-lg border border-accent-border bg-accent-soft px-3 py-2 text-[11px] font-semibold text-primary">{importSummary}</div>}
                </div>
                <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
                  <h2 className="text-sm font-black">تنسيق السجلات</h2>
                  <div className="rounded-lg bg-primary p-3 font-mono text-[11px] leading-5 text-muted" dir="ltr">
                    <div>employeeCode,timestamp,eventType,rawData</div>
                    <div className="text-muted">EMP001,2026-11-11T08:02:00,CHECK_IN</div>
                    <div className="text-muted">EMP001,2026-11-11T17:05:00,CHECK_OUT</div>
                  </div>
                  <ul className="list-inside list-disc space-y-1 text-[11px] leading-5 text-muted">
                    <li>رمز الموظف اختياري؛ السجل غير المرتبط يبقى معلقاً حتى الربط.</li>
                    <li>أنواع الأحداث المدعومة: CHECK_IN, CHECK_OUT, BREAK_START, BREAK_END.</li>
                    <li>صيغة التاريخ ISO مثل 2026-11-11T08:02:00 أو تاريخ فقط.</li>
                    <li>يمكن استخدام الفاصلة أو الفاصلة المنقوطة أو Tab كفاصل بين الحقول.</li>
                    <li>السجلات المكررة لنفس الموظف والوقت تُتجاهل تلقائياً.</li>
                  </ul>
                  <p className="text-[10px] leading-4 text-muted">بعد الاستيراد استخدم «سجلات البصمة» ثم «معالجة المعلقة» لتحويل السجلات إلى حضور فعلي.</p>
                </div>
              </div>
            )}

            {activeTab === 'mobile' && canTab('mobile') && (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-3">
                    <label className="text-[10px] font-bold text-muted">الحالة
                      <select value={mobileFilter} onChange={(e) => setMobileFilter(e.target.value as typeof mobileFilter)} className="mt-1 block rounded-lg border border-line px-2 py-1.5 text-xs">
                        <option value="">الكل</option>
                        <option value="PENDING">بالانتظار</option>
                        <option value="VERIFIED">معتمد</option>
                        <option value="REJECTED">مرفوض</option>
                      </select>
                    </label>
                    <button onClick={loadMobile} className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white hover:bg-primary">تحديث</button>
                    <span className="mr-auto text-[10px] font-semibold text-muted">{mobileSessions.length} جلسة</span>
                  </div>
                  <div className="overflow-hidden rounded-xl border border-line bg-surface">
                    <DataTable
                                            ariaLabel="جلسات الحضور من الجوال"
                                            rows={mobileSessions}
                                            rowKey={(session) => session.id}
                                            dense
                                            columns={[
                                              { key: 'employee', header: 'الموظف', render: (session) => <span className="font-bold">{session.employeeName}</span> },
                                              { key: 'type', header: 'النوع', render: (session) => session.sessionType === 'CHECK_IN' ? 'حضور' : 'انصراف' },
                                              { key: 'time', header: 'الوقت', render: (session) => <span className="tabular-nums">{session.recordedAt.slice(0, 16).replace('T', ' ')}</span> },
                                              {
                                                key: 'location', header: 'الموقع',
                                                render: (session) => (
                                                  <span>
                                                    {session.latitude}, {session.longitude}
                                                    {session.accuracyMeters != null && <span className="block text-muted">دقة {money(session.accuracyMeters)} م</span>}
                                                  </span>
                                                ),
                                              },
                                              {
                                                key: 'status', header: 'الحالة',
                                                render: (session) => (
                                                  <span>
                                                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${session.status === 'VERIFIED' ? 'border-success-border bg-success-soft text-success' : session.status === 'REJECTED' ? 'border-danger-border bg-danger-soft text-danger' : 'border-warning-border bg-warning-soft text-warning'}`}>
                                                      {session.status === 'VERIFIED' ? 'معتمد' : session.status === 'REJECTED' ? 'مرفوض' : 'بالانتظار'}
                                                    </span>
                                                    {session.rejectionReason && <span className="mt-1 block max-w-[140px] truncate text-[10px] text-danger" title={session.rejectionReason}>{session.rejectionReason}</span>}
                                                  </span>
                                                ),
                                              },
                                              {
                                                key: 'actions', header: 'إجراءات',
                                                render: (session) => session.status === 'PENDING' ? (
                                                  <div className="flex gap-1">
                                                    <button onClick={() => decideMobile(session, true)} className="rounded border border-success-border px-2 py-1 text-[10px] font-bold text-success hover:bg-success-soft">اعتماد</button>
                                                    <button onClick={() => decideMobile(session, false)} className="rounded border border-danger-border px-2 py-1 text-[10px] font-bold text-danger hover:bg-danger-soft">رفض</button>
                                                  </div>
                                                ) : (
                                                  <span className="text-[10px] text-muted">{session.verifiedByName || '—'}</span>
                                                ),
                                              },
                                            ]}
                                            emptyTitle="لا توجد جلسات حضور من الجوال."
                                          />

                  </div>
                </div>

                <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
                  <h2 className="text-sm font-black">تسجيل جلسة جوال</h2>
                  <label className="block text-[10px] font-bold text-muted">الموظف
                    <select value={mobileForm.employeeId} onChange={(e) => {
                      const employee = employees.find((item) => item.id === e.target.value);
                      setMobileForm((prev) => ({ ...prev, employeeId: e.target.value, branchId: employee?.branchId || prev.branchId }));
                    }} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm">
                      <option value="">اختر الموظف</option>
                      {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} ({employee.code})</option>)}
                    </select>
                  </label>
                  <label className="block text-[10px] font-bold text-muted">الفرع
                    <select value={mobileForm.branchId} onChange={(e) => setMobileForm((prev) => ({ ...prev, branchId: e.target.value }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm">
                      <option value="">اختر الفرع</option>
                      {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-[10px] font-bold text-muted">النوع
                      <select value={mobileForm.sessionType} onChange={(e) => setMobileForm((prev) => ({ ...prev, sessionType: e.target.value as 'CHECK_IN' | 'CHECK_OUT' }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm">
                        <option value="CHECK_IN">حضور</option>
                        <option value="CHECK_OUT">انصراف</option>
                      </select>
                    </label>
                    <label className="block text-[10px] font-bold text-muted">الوقت
                      <input type="datetime-local" value={mobileForm.recordedAt} onChange={(e) => setMobileForm((prev) => ({ ...prev, recordedAt: e.target.value }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" />
                    </label>
                    <label className="block text-[10px] font-bold text-muted">خط العرض
                      <input value={mobileForm.latitude} onChange={(e) => setMobileForm((prev) => ({ ...prev, latitude: e.target.value }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm font-mono" />
                    </label>
                    <label className="block text-[10px] font-bold text-muted">خط الطول
                      <input value={mobileForm.longitude} onChange={(e) => setMobileForm((prev) => ({ ...prev, longitude: e.target.value }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm font-mono" />
                    </label>
                    <label className="block text-[10px] font-bold text-muted">دقة الموقع (متر)
                      <input type="number" min="0" value={mobileForm.accuracyMeters} onChange={(e) => setMobileForm((prev) => ({ ...prev, accuracyMeters: e.target.value }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" />
                    </label>
                    <label className="block text-[10px] font-bold text-muted">معلومات الجهاز
                      <input value={mobileForm.deviceInfo} onChange={(e) => setMobileForm((prev) => ({ ...prev, deviceInfo: e.target.value }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" />
                    </label>
                  </div>
                  <button onClick={createMobileSession} className="w-full rounded-lg bg-primary px-4 py-2.5 text-xs font-bold text-white hover:bg-primary">تسجيل الجلسة</button>
                  <p className="text-[10px] leading-4 text-muted">تبقى الجلسة «بالانتظار» حتى يعتمدها مسؤول الحضور من الجدول المجاور.</p>
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
