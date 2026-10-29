import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronUp, RefreshCw, ShieldCheck, Upload, Settings2 } from 'lucide-react';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import {
  MasterDataSyncService,
  type SyncBootstrapProgress,
  type SyncConflict,
} from '../../sync/MasterDataSyncService';
import { SUPPORTED_SYNC_ENTITIES, SyncPolicyService, type SyncEntityPolicy } from '../../sync/SyncPolicyService';
import { BusinessRecordSyncService } from '../../sync/BusinessRecordSyncService';
import { BranchRegistry } from '../../sync/BranchRegistry';
import { DeviceRegistry } from '../../sync/DeviceRegistry';
import { useToast } from '../../components/ui/Toast';

const entityLabels: Record<string, string> = {
  category: 'تصنيف',
  brand: 'ماركة',
  product: 'منتج',
  customer: 'عميل',
  supplier: 'مورد',
  stock_transfer: 'تحويل مخزني',
};

function prettyPayload(raw: string | null): string {
  if (!raw) return 'لا توجد لقطة محلية';
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function remoteRecordHeader(raw: string): Record<string, unknown> {
  try {
    const header = JSON.parse(raw)?.record?.header;
    return header && typeof header === 'object' && !Array.isArray(header) ? header : {};
  } catch {
    return {};
  }
}

function businessDocumentLabel(entityType: string): string {
  switch (entityType) {
    case 'sales_invoice': return 'فاتورة بيع';
    case 'sales_return': return 'مرتجع بيع';
    case 'purchase_invoice': return 'فاتورة شراء';
    case 'purchase_return': return 'مرتجع شراء';
    case 'customer_payment': return 'مدفوعات العملاء';
    case 'supplier_payment': return 'سداد الموردين';
    case 'stock_transfer': return 'تحويل مخزني';
    default: return entityType;
  }
}

function formatTimestamp(value?: string | null): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return value;
  }
}

function connectionState(lastContactAt?: string | null, status?: string): string {
  if (status === 'REVOKED') return 'مرفوض';
  if (status === 'DISABLED') return 'معطل';
  if (!lastContactAt) return 'غير متصل';
  const diffMinutes = (Date.now() - new Date(lastContactAt).getTime()) / 60000;
  if (diffMinutes <= 2) return 'متصل الآن';
  if (diffMinutes <= 10) return 'متصل قبل قليل';
  return 'غير متصل';
}

export const SyncConflictsPage: React.FC = () => {
  const service = useMemo(() => new MasterDataSyncService(), []);
  const policyService = useMemo(() => new SyncPolicyService(), []);
  const businessRecordService = useMemo(() => new BusinessRecordSyncService(), []);
  const branchRegistry = useMemo(() => new BranchRegistry(), []);
  const deviceRegistry = useMemo(() => new DeviceRegistry(), []);
  const toast = useToast();
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [bootstrapProgress, setBootstrapProgress] = useState<SyncBootstrapProgress | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [policies, setPolicies] = useState<SyncEntityPolicy[]>([]);
  const [remoteRecords, setRemoteRecords] = useState<ReturnType<BusinessRecordSyncService['listRemoteRecords']>>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [savingPolicy, setSavingPolicy] = useState<string | null>(null);
  const [expandedRemoteRecordId, setExpandedRemoteRecordId] = useState<string | null>(null);
  const [branchForm, setBranchForm] = useState({ name: '', baseUrl: '', tenantId: '' });
  const [deviceForm, setDeviceForm] = useState({ branchId: '', deviceId: '', deviceName: '' });
  const policyAuthority = SyncPolicyService.isPolicyAuthority();

  const load = useCallback(() => {
    setLoading(true);
    try {
      PermissionService.require(AuthService.requireAuth(), 'admin.view');
      setConflicts(service.listOpenConflicts());
      setPolicies(policyService.list());
      setRemoteRecords(businessRecordService.listRemoteRecords());
      setBranches(branchRegistry.list());
      setDevices(deviceRegistry.list());
      setBootstrapProgress(MasterDataSyncService.isConfigured() ? service.getBootstrapProgress() : null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تحميل تعارضات المزامنة.');
    } finally {
      setLoading(false);
    }
  }, [branchRegistry, businessRecordService, deviceRegistry, policyService, service, toast]);

  const updatePolicy = (policy: SyncEntityPolicy) => {
    const previous = policies.find((item) => item.entityType === policy.entityType);
    if (
      ['customer', 'supplier', 'sales_invoice', 'sales_return', 'purchase_invoice', 'purchase_return'].includes(policy.entityType) &&
      policy.enabled &&
      policy.outboundEnabled &&
      policy.dataScope === 'TENANT' &&
      (!previous?.enabled || !previous.outboundEnabled || previous.dataScope !== 'TENANT') &&
      !window.confirm(
        ['customer', 'supplier'].includes(policy.entityType)
          ? 'سيتم إرسال بيانات اتصال العملاء أو الموردين إلى جميع فروع المؤسسة عبر قناة المزامنة المشفرة. هل تريد المتابعة؟'
          : ['sales_invoice', 'sales_return'].includes(policy.entityType)
            ? 'سيتم إرسال نسخ تقارير فواتير البيع أو المرتجعات إلى فروع المؤسسة. لن تُطبّق هذه النسخ على نقدية الفرع أو مخزونه. هل تريد المتابعة؟'
            : 'سيتم إرسال نسخ تقارير فواتير أو مرتجعات الشراء إلى فروع المؤسسة. لن تُطبّق هذه النسخ على النقدية أو المخزون أو القيود المحلية. هل تريد المتابعة؟'
      )
    ) {
      return;
    }
    try {
      PermissionService.require(AuthService.requireAuth(), 'admin.view');
      setSavingPolicy(policy.entityType);
      const updated = policyService.update(policy);
      setPolicies((current) => current.map((item) => item.entityType === updated.entityType ? updated : item));
      setBootstrapProgress(MasterDataSyncService.isConfigured() ? service.getBootstrapProgress() : null);
      toast.success('تم حفظ سياسة المزامنة. ستُطبق على الأحداث الجديدة والبيانات الواردة.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر حفظ سياسة المزامنة.');
    } finally {
      setSavingPolicy(null);
    }
  };

  const publishNextBatch = () => {
    if (!MasterDataSyncService.isConfigured()) {
      toast.error('اتصال المزامنة غير مهيأ على هذا الجهاز.');
      return;
    }
    if (!bootstrapProgress?.entities.some((entity) => entity.processed > 0) &&
        !window.confirm('سيتم نشر بيانات التصنيفات والماركات والعملاء والموردين والمنتجات الحالية إلى كل فروع هذه المؤسسة. تحتوي هذه البيانات على معلومات اتصال العملاء والموردين. هل تريد المتابعة؟')) {
      return;
    }
    try {
      PermissionService.require(AuthService.requireAuth(), 'admin.view');
      const progress = service.publishExistingDataBatch(100);
      setBootstrapProgress(progress);
      toast.success(
        progress.completed
          ? 'اكتمل نشر البيانات الرئيسية الحالية.'
          : `تم تجهيز ${progress.processedThisBatch} سجل للمزامنة. تابع الدفعة التالية عند الاستعداد.`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر نشر البيانات الرئيسية الحالية.');
    }
  };

  const registerBranch = () => {
    const name = branchForm.name.trim();
    if (!name) {
      toast.error('يجب إدخال اسم الفرع.');
      return;
    }
    try {
      PermissionService.require(AuthService.requireAuth(), 'admin.view');
      const branchId = branchRegistry.register({
        tenantId: branchForm.tenantId.trim() || null,
        name,
        baseUrl: branchForm.baseUrl.trim() || null,
      });
      setBranches(branchRegistry.list());
      setBranchForm({ name: '', baseUrl: '', tenantId: '' });
      toast.success(`تم تسجيل الفرع ${branchId} في قائمة المزامنة.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تسجيل الفرع.');
    }
  };

  const registerDevice = () => {
    const branchId = deviceForm.branchId.trim();
    const deviceName = deviceForm.deviceName.trim();
    if (!branchId) {
      toast.error('يجب اختيار فرع قبل تسجيل الجهاز.');
      return;
    }
    if (!deviceName) {
      toast.error('يجب إدخال اسم الجهاز.');
      return;
    }
    try {
      PermissionService.require(AuthService.requireAuth(), 'admin.view');
      const id = deviceRegistry.register({
        deviceId: deviceForm.deviceId.trim() || undefined,
        branchId,
        tenantId: null,
        deviceName,
      });
      setDevices(deviceRegistry.list());
      setDeviceForm({ branchId: '', deviceId: '', deviceName: '' });
      toast.success(`تم تسجيل الجهاز ${id} وربطه بالفرع ${branchId}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تسجيل الجهاز.');
    }
  };

  const runInstantSync = async () => {
    try {
      PermissionService.require(AuthService.requireAuth(), 'admin.view');
      const runner = window.ceramisys?.sync?.runSyncNow;
      if (!runner) {
        toast.error('مزامنة فورية غير متاحة في هذا الجهاز حالياً.');
        return;
      }
      await runner();
      toast.success('تم تشغيل مزامنة فورية بنجاح.');
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تشغيل المزامنة الفورية.');
    }
  };

  const setBranchAccess = (branchId: string, action: 'verify' | 'disable' | 'revoke') => {
    try {
      PermissionService.require(AuthService.requireAuth(), 'admin.view');
      const actor = AuthService.requireAuth();
      if (action === 'verify') branchRegistry.verify(branchId, true, actor.id || 'admin');
      if (action === 'disable') branchRegistry.disable(branchId);
      if (action === 'revoke') branchRegistry.revoke(branchId);
      setBranches(branchRegistry.list());
      toast.success(action === 'verify' ? 'تم اعتماد الفرع ورفع وثيقته.' : action === 'disable' ? 'تم تعطيل الفرع مؤقتاً.' : 'تم إبطال الفرع من قائمة المزامنة.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تحديث حالة الفرع.');
    }
  };

  const setDeviceAccess = (deviceId: string, action: 'verify' | 'disable' | 'revoke') => {
    try {
      PermissionService.require(AuthService.requireAuth(), 'admin.view');
      const actor = AuthService.requireAuth();
      if (action === 'verify') deviceRegistry.verify(deviceId, true, actor.id || 'admin');
      if (action === 'disable') deviceRegistry.disable(deviceId);
      if (action === 'revoke') deviceRegistry.revoke(deviceId);
      setDevices(deviceRegistry.list());
      toast.success(action === 'verify' ? 'تم اعتماد الجهاز ورفع وثيقته.' : action === 'disable' ? 'تم تعطيل الجهاز مؤقتاً.' : 'تم إبطال الجهاز من قائمة المزامنة.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تحديث حالة الجهاز.');
    }
  };

  useEffect(() => {
    load();
  }, [load]);

  const resolve = (conflict: SyncConflict, resolution: 'KEEP_LOCAL' | 'ACCEPT_REMOTE') => {
    const choice = resolution === 'KEEP_LOCAL' ? 'الإبقاء على بيانات هذا الجهاز' : 'استبدالها بالبيانات الواردة';
    if (!window.confirm(`هل تريد ${choice}؟ سيتم تسجيل قرارك وإرساله لبقية الفروع.`)) return;
    try {
      PermissionService.require(AuthService.requireAuth(), 'admin.view');
      service.resolveConflict(conflict.id, resolution);
      toast.success('تم حسم التعارض وإضافة التغيير الناتج إلى قائمة المزامنة.');
      setExpandedId(null);
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر حسم تعارض المزامنة.');
    }
  };

  return (
    <div className="h-full overflow-auto bg-slate-50 p-4 text-slate-900 sm:p-6" dir="rtl">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-black">تعارضات مزامنة الفروع</h1>
            <p className="text-xs text-slate-500">راجع اختلافات البيانات الرئيسية واختر النسخة المعتمدة.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={runInstantSync}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"
          >
            <RefreshCw className="h-4 w-4" />
            مزامنة فورية
          </button>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold hover:bg-slate-100 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            تحديث
          </button>
        </div>
      </header>

      {!MasterDataSyncService.isConfigured() && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
          <p>هوية مزامنة هذا الجهاز غير مهيأة حاليًا. ستظهر التعارضات بعد إعداد اتصال الفرع وتشغيل المزامنة.</p>
        </div>
      )}

      <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <h3 className="mb-3 text-sm font-black">تسجيل فرع جديد</h3>
            <div className="space-y-2">
              <input value={branchForm.name} onChange={(event) => setBranchForm((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs" placeholder="اسم الفرع" />
              <input value={branchForm.tenantId} onChange={(event) => setBranchForm((current) => ({ ...current, tenantId: event.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs" placeholder="معرّف المؤسسة (اختياري)" />
              <input value={branchForm.baseUrl} onChange={(event) => setBranchForm((current) => ({ ...current, baseUrl: event.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs" placeholder="عنوان الاستقبال HTTPS" />
              <button type="button" onClick={registerBranch} className="w-full rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white">تسجيل الفرع</button>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <h3 className="mb-3 text-sm font-black">تسجيل جهاز فرع</h3>
            <div className="space-y-2">
              <select value={deviceForm.branchId} onChange={(event) => setDeviceForm((current) => ({ ...current, branchId: event.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
                <option value="">اختر الفرع</option>
                {branches.map((branch) => (
                  <option key={branch.branch_id || branch.branchId} value={branch.branch_id || branch.branchId}>
                    {branch.name || branch.branch_id || branch.branchId}
                  </option>
                ))}
              </select>
              <input value={deviceForm.deviceId} onChange={(event) => setDeviceForm((current) => ({ ...current, deviceId: event.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs" placeholder="معرّف الجهاز (اختياري)" />
              <input value={deviceForm.deviceName} onChange={(event) => setDeviceForm((current) => ({ ...current, deviceName: event.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs" placeholder="اسم الجهاز" />
              <button type="button" onClick={registerDevice} className="w-full rounded-lg bg-sky-700 px-3 py-2 text-xs font-bold text-white">تسجيل الجهاز</button>
            </div>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <h3 className="mb-2 text-sm font-black">الفروع المسجلة</h3>
            {branches.length === 0 ? <p className="text-xs text-slate-500">لا توجد فروع مسجلة.</p> : (
              <div className="space-y-2">
                {branches.map((branch) => {
                  const branchId = branch.branch_id || branch.branchId;
                  const branchStatus = connectionState(branch.lastContactAt || branch.last_contact_at, branch.status || 'ACTIVE');
                  return (
                    <div key={branchId} className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold">{branch.name}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${branch.status === 'REVOKED' ? 'bg-red-100 text-red-700' : branch.status === 'DISABLED' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {branch.status || 'ACTIVE'}
                        </span>
                      </div>
                      <div className="mt-1 text-slate-500">{branchId}</div>
                      {branch.baseUrl ? <div className="mt-1 text-slate-500" dir="ltr">{branch.baseUrl}</div> : null}
                      <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-600">
                        <span className="rounded bg-white px-2 py-1">الحالة: {branchStatus}</span>
                        <span className="rounded bg-white px-2 py-1">آخر اتصال: {formatTimestamp(branch.lastContactAt || branch.last_contact_at)}</span>
                        <span className="rounded bg-white px-2 py-1">آخر مزامنة: {formatTimestamp(branch.lastSyncAt || branch.last_sync_at)}</span>
                        <span className="rounded bg-white px-2 py-1">وثيقة: {branch.isVerified || branch.is_verified ? 'معتمدة' : 'غير معتمدة'}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button type="button" onClick={() => setBranchAccess(branchId, 'verify')} className="rounded bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white">اعتماد</button>
                        <button type="button" onClick={() => setBranchAccess(branchId, 'disable')} className="rounded bg-amber-500 px-2 py-1 text-[10px] font-bold text-white">تعطيل</button>
                        <button type="button" onClick={() => setBranchAccess(branchId, 'revoke')} className="rounded bg-red-600 px-2 py-1 text-[10px] font-bold text-white">إبطال</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <h3 className="mb-2 text-sm font-black">الأجهزة المسجلة</h3>
            {devices.length === 0 ? <p className="text-xs text-slate-500">لا توجد أجهزة مسجلة.</p> : (
              <div className="space-y-2">
                {devices.map((device) => {
                  const deviceId = device.device_id || device.deviceId;
                  const deviceStatus = connectionState(device.lastContactAt || device.last_contact_at, device.status || 'ACTIVE');
                  return (
                    <div key={deviceId} className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold">{device.device_name || device.deviceName || 'جهاز'}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${device.status === 'REVOKED' ? 'bg-red-100 text-red-700' : device.status === 'DISABLED' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}`}>
                          {device.status || 'ACTIVE'}
                        </span>
                      </div>
                      <div className="mt-1 text-slate-500">{deviceId}</div>
                      <div className="mt-1 text-slate-500">الفرع: {device.branch_id || device.branchId}</div>
                      <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-600">
                        <span className="rounded bg-white px-2 py-1">الحالة: {deviceStatus}</span>
                        <span className="rounded bg-white px-2 py-1">آخر اتصال: {formatTimestamp(device.lastContactAt || device.last_contact_at)}</span>
                        <span className="rounded bg-white px-2 py-1">آخر مزامنة: {formatTimestamp(device.lastSyncAt || device.last_sync_at)}</span>
                        <span className="rounded bg-white px-2 py-1">وثيقة: {device.isVerified || device.is_verified ? 'معتمدة' : 'غير معتمدة'}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button type="button" onClick={() => setDeviceAccess(deviceId, 'verify')} className="rounded bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white">اعتماد</button>
                        <button type="button" onClick={() => setDeviceAccess(deviceId, 'disable')} className="rounded bg-amber-500 px-2 py-1 text-[10px] font-bold text-white">تعطيل</button>
                        <button type="button" onClick={() => setDeviceAccess(deviceId, 'revoke')} className="rounded bg-red-600 px-2 py-1 text-[10px] font-bold text-white">إبطال</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-start gap-3">
          <Settings2 className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" />
          <div>
            <h2 className="text-sm font-black">سياسات مزامنة البيانات</h2>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              تعتمد سياسات المؤسسة من جهاز الإدارة الرئيسي وتنتقل إلى الفروع عبر المزامنة. عند إيقاف الاستقبال تُحفظ الأحداث الواردة محليًا وتُطبّق بعد إعادة تفعيله.
            </p>
          </div>
        </div>
        {!policyAuthority && (
          <p className="mb-3 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">
            هذا الجهاز ليس مخولًا لاعتماد سياسات المؤسسة. تُعرض السياسات المستلمة فقط؛ إعداد صلاحية جهاز الإدارة الرئيسي مطلوب.
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-right text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="p-2">نوع البيانات</th>
                <th className="p-2">مفعّل</th>
                <th className="p-2">إرسال</th>
                <th className="p-2">استقبال</th>
                <th className="p-2">النطاق</th>
              </tr>
            </thead>
            <tbody>
              {SUPPORTED_SYNC_ENTITIES.map(({ entityType, label }) => {
                const policy = policies.find((item) => item.entityType === entityType);
                if (!policy) return null;
                const busy = savingPolicy === entityType || !policyAuthority;
                const save = (patch: Partial<SyncEntityPolicy>) => updatePolicy({ ...policy, ...patch });
                return (
                  <tr key={entityType} className="border-b border-slate-100 last:border-0">
                    <td className="p-2 font-bold">
                      {label}
                      {!policy.managedByHeadOffice && (
                        <span className="mr-2 text-[10px] font-normal text-amber-700">بانتظار سياسة الإدارة الرئيسية</span>
                      )}
                    </td>
                    <td className="p-2">
                      <input aria-label={`${label} - تفعيل`} type="checkbox" checked={policy.enabled} disabled={busy}
                        onChange={(event) => save({ enabled: event.target.checked })} />
                    </td>
                    <td className="p-2">
                      <input aria-label={`${label} - إرسال`} type="checkbox" checked={policy.outboundEnabled} disabled={busy || !policy.enabled}
                        onChange={(event) => save({ outboundEnabled: event.target.checked })} />
                    </td>
                    <td className="p-2">
                      <input aria-label={`${label} - استقبال`} type="checkbox" checked={policy.inboundEnabled} disabled={busy || !policy.enabled}
                        onChange={(event) => save({ inboundEnabled: event.target.checked })} />
                    </td>
                    <td className="p-2">
                      <select aria-label={`${label} - النطاق`} value={policy.dataScope} disabled={busy || !policy.enabled}
                        onChange={(event) => save({ dataScope: event.target.value as SyncEntityPolicy['dataScope'] })}
                        className="rounded-md border border-slate-200 bg-white px-2 py-1">
                        <option value="TENANT">كل فروع المؤسسة</option>
                        <option value="BRANCH">هذا الفرع فقط</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] leading-5 text-amber-800">
          الفواتير والمرتجعات المتاحة هنا تُرسل كنسخ تقارير منفصلة فقط، ولا تُنشئ حركة نقدية أو مخزنية أو قيدًا محاسبيًا في الفرع المستقبل. المدفوعات التفصيلية والمشتريات والأرصدة والمخزون غير مشمولة.
        </p>
      </section>

      <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-black">نسخ تقارير الفواتير والمرتجعات الواردة</h2>
        <p className="mt-1 text-xs leading-5 text-slate-600">
          سجلات للقراءة من الفروع الأخرى؛ لا تغيّر أرصدة العملاء أو الصندوق أو المخزون أو القيود المحلية.
        </p>
        {remoteRecords.length === 0 ? (
          <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">لا توجد نسخ تقارير واردة.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-right text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="p-2">النوع</th><th className="p-2">الفرع المصدر</th>
                  <th className="p-2">رقم المستند</th><th className="p-2">المبلغ</th>
                  <th className="p-2">الإصدار</th><th className="p-2">آخر تحديث</th>
                </tr>
              </thead>
              <tbody>
                {remoteRecords.map((record) => {
                  const recordKey = `${record.sourceBranchId}:${record.entityType}:${record.entityId}`;
                  const header = remoteRecordHeader(record.payload);
                  const amount = Number(header.totalAmount ?? header.totalCost ?? header.totalQuantityM2 ?? header.amount ?? 0);
                  return (
                    <React.Fragment key={recordKey}>
                      <tr className="border-b border-slate-100 last:border-0">
                        <td className="p-2 font-bold">{businessDocumentLabel(record.entityType)}</td>
                        <td className="p-2">{record.sourceBranchId}</td>
                        <td className="p-2">
                          <button type="button" className="font-mono text-sky-700 underline"
                            onClick={() => setExpandedRemoteRecordId((current) => current === recordKey ? null : recordKey)}>
                            {String(header.invoiceNumber || header.returnNumber || record.entityId)}
                          </button>
                        </td>
                        <td className="p-2">{Number.isFinite(amount) ? amount.toLocaleString('ar-EG') : '—'}</td>
                        <td className="p-2">{record.entityVersion}</td>
                        <td className="p-2" dir="ltr">{record.updatedAt}</td>
                      </tr>
                      {expandedRemoteRecordId === recordKey && (
                        <tr>
                          <td className="p-2" colSpan={6}>
                            <pre className="max-h-64 overflow-auto rounded-lg bg-slate-50 p-3 text-[10px]" dir="ltr">
                              {prettyPayload(record.payload)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {MasterDataSyncService.isConfigured() && bootstrapProgress && (
        <section className="mb-4 rounded-xl border border-sky-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-black">إرسال البيانات الموجودة للفروع</h2>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">
                ينشر البيانات الرئيسية الحالية بالتدريج، مع استئناف آمن بعد إغلاق التطبيق. تُرسل التصنيفات والماركات أولًا ثم العملاء والموردون والمنتجات. لا تُرسل أرصدة الحسابات أو كميات المخزون أو الصور.
              </p>
            </div>
            <button
              type="button"
              onClick={publishNextBatch}
              disabled={loading || bootstrapProgress.completed}
              className="flex shrink-0 items-center gap-2 rounded-lg bg-sky-700 px-3 py-2 text-xs font-bold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              {bootstrapProgress.completed ? 'اكتمل النشر الأولي' : 'إرسال الدفعة التالية (100 سجل)'}
            </button>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {bootstrapProgress.entities.map((entity) => (
              <div key={entity.entityType} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold">{entityLabels[entity.entityType]}</span>
                  <span className={`text-[10px] font-bold ${entity.completed ? 'text-emerald-700' : 'text-slate-500'}`}>
                    {entity.completed ? 'مكتمل' : 'قيد الانتظار'}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">{entity.processed} / {entity.total}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">جارٍ تحميل التعارضات...</div>
      ) : conflicts.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
          <Check className="mx-auto mb-3 h-8 w-8 text-emerald-600" />
          <p className="font-bold">لا توجد تعارضات مفتوحة</p>
          <p className="mt-1 text-xs text-slate-500">التغييرات التي تحتاج إلى مراجعة ستظهر هنا.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs font-bold text-slate-500">عرض أول {conflicts.length} تعارض مفتوح</p>
          {conflicts.map((conflict) => {
            const expanded = expandedId === conflict.id;
            return (
              <article key={conflict.id} className="overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm">
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : conflict.id)}
                  aria-expanded={expanded}
                  className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-right hover:bg-amber-50/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-black text-amber-800">{entityLabels[conflict.entityType]}</span>
                      <span className="truncate font-mono text-xs font-bold" dir="ltr">{conflict.entityId}</span>
                    </div>
                    <p className="mt-2 text-xs text-slate-600">{conflict.reason}</p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      الفرع الوارد: {conflict.sourceBranchId} · الإصدار المحلي: {conflict.localVersion ?? 'غير معروف'} · الوارد: {conflict.remoteVersion}
                    </p>
                  </div>
                  {expanded ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                </button>

                {expanded && (
                  <div className="border-t border-slate-200 p-4">
                    <div className="grid gap-3 lg:grid-cols-2">
                      <section>
                        <h2 className="mb-2 text-xs font-black text-slate-700">البيانات الحالية على هذا الجهاز</h2>
                        <pre dir="ltr" className="max-h-72 overflow-auto rounded-lg bg-slate-950 p-3 text-left text-[11px] text-slate-100">{prettyPayload(conflict.localPayload)}</pre>
                      </section>
                      <section>
                        <h2 className="mb-2 text-xs font-black text-slate-700">البيانات الواردة من الفرع</h2>
                        <pre dir="ltr" className="max-h-72 overflow-auto rounded-lg bg-slate-950 p-3 text-left text-[11px] text-slate-100">{prettyPayload(conflict.remotePayload)}</pre>
                      </section>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => resolve(conflict, 'KEEP_LOCAL')}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold hover:bg-slate-100"
                      >
                        إبقاء المحلي وإرسال نسخته
                      </button>
                      <button
                        type="button"
                        onClick={() => resolve(conflict, 'ACCEPT_REMOTE')}
                        className="rounded-lg bg-sky-700 px-3 py-2 text-xs font-bold text-white hover:bg-sky-800"
                      >
                        اعتماد الوارد
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SyncConflictsPage;
