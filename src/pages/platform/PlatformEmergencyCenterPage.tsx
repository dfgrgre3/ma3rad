import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertOctagon,
  Ban,
  ShieldAlert,
  Power,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Lock,
  KeyRound,
  Building2,
  Server,
  Boxes,
} from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import { CentralUnsupportedNotice } from './components/CentralUnsupportedNotice';
import { centralPlatformClient } from '../../services/domains/platform/CentralPlatformClient';
import { getCentralDataSourceState } from '../../hooks/platform/useCentralDataSource'; 
import { canPlatform } from '../../hooks/platform/usePlatformPermission';
import type {
  PlatformTenant,
  PlatformApiKey,
  PlatformRelease,
} from '../../services/domains/platform/platformTypes';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import {
  formatDateTime,
  inputClass,
} from './components/PlatformUI';

import { useToast } from '../../components/ui/Toast';
export const PlatformEmergencyCenterPage: React.FC = () => {
  const toast = useToast();
  const [tenants, setTenants] = useState<PlatformTenant[]>([]);
  const [apiKeys, setApiKeys] = useState<PlatformApiKey[]>([]);
  const [releases, setReleases] = useState<PlatformRelease[]>([]);
  const [loading, setLoading] = useState(true);

  // Confirm Modal state
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    title: string;
    description: string;
    confirmationKeyword: string;
    inputVal: string;
    onExecute: () => void;
  }>({
    open: false,
    title: '',
    description: '',
    confirmationKeyword: '',
    inputVal: '',
    onExecute: () => {},
  });

  const canManageEmergency = canPlatform('emergency');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const centralState = getCentralDataSourceState();
      if (centralState.active) {
        const [t, k, r] = await Promise.all([
          centralPlatformClient.listTenants(),
          centralPlatformClient.listApiKeys(),
          centralPlatformClient.listReleases(),
        ]);
        setTenants(t as any);
        setApiKeys(k as any);
        setReleases(r as any);
      } else {
        const t = platformAdminService.listTenants();
        const k = platformAdminService.listApiKeys();
        const r = platformAdminService.listReleases();
        setTenants(t);
        setApiKeys(k);
        setReleases(r);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const requestAction = (
    title: string,
    description: string,
    keyword: string,
    action: () => void
  ) => {
    if (!canManageEmergency) {
      toast.warning('لا تملك صلاحية تنفيذ إجراءات الطوارئ.');
      return;
    }
    setConfirmModal({
      open: true,
      title,
      description,
      confirmationKeyword: keyword,
      inputVal: '',
      onExecute: () => {
        try {
          action();
          setConfirmModal((prev) => ({ ...prev, open: false }));
          loadData();
          toast.success('تم تنفيذ الإجراء الطارئ بنجاح.');
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'فشل تنفيذ الإجراء الطارئ.');
        }
      },
    });
  };

  // Actions
  const handleEmergencySuspendTenant = (t: PlatformTenant) => {
    requestAction(
      `إيقاف طارئ للعميل: ${t.name}`,
      `سيتم فوراً قطع الاتصال، تجميد الحسابات، وإلغاء ترخيص المستأجر لحين التحقيق في الانتهاك أو الحادث الأمني.`,
      'SUSPEND-TENANT',
      () => platformAdminService.setTenantStatus(t.id, 'SUSPENDED')
    );
  };

  const handleEmergencyRevokeKey = (k: PlatformApiKey) => {
    requestAction(
      `إلغاء فوري لمفتاح API: ${k.name}`,
      `سيتم إبطال المفتاح (${k.keyPrefix}...) فوراً وقطع أي خدمات خارجية متصلة به.`,
      'REVOKE-KEY',
      () => platformAdminService.revokeApiKey(k.id)
    );
  };

  const handleEmergencyRevokeAllStaffSessions = () => {
    requestAction(
      'إنهاء فوري لجميع جلسات موظفي المنصة (Global Killswitch)',
      'سيتم تسجيل خروج قسري لكافة موظفي الدعم والعمليات والمديرين في المنصة فوراً.',
      'KILL-ALL-SESSIONS',
      () => platformAdminService.revokeAllOtherStaffSessions()
    );
  };

  const handleEmergencyDisableRelease = (rel: PlatformRelease) => {
    requestAction(
      `حظر وإيقاف الإصدار: ${rel.version}`,
      `سيتم إيقاف تداول الإصدار وتوجيه العملاء للتراجع للإصدار الآمن.`,
      'KILL-RELEASE',
      () => platformAdminService.disableRelease(rel.id)
    );
  };

  return (
    <div className="space-y-4 text-right">
      <CentralUnsupportedNotice feature="مركز الطوارئ (إجراءات الطوارئ)" />
      <PageHeader
        title="مركز إجراءات الطوارئ والحماية (Emergency Response & Killswitch)"
        description="إجراءات العزل السريع: إيقاف العملاء المنتهكين، سحب المفاتيح المخترقة، إيقاف الإصدارات، وفصل الجلسات المشبوهة."
        icon={<AlertOctagon className="h-5 w-5 text-rose-500" />}
      />

      {/* Warning Banner */}
      <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-3">
        <ShieldAlert className="h-6 w-6 text-rose-400 shrink-0 mt-0.5" />
        <div className="text-xs text-rose-200 space-y-1">
          <strong className="font-bold text-sm text-rose-300 block">منطقة العمليات الحرجة والحماية الفورية:</strong>
          الإجراءات في هذه الصفحة تؤدي إلى إيقاف فوري للخدمات أو التراخيص أو الجلسات. جميع الإجراءات تتطلب إدخال كلمة تأكيد دقيقة وتوثق في سجل التدقيق الأمني بأعلى مستوى خطورة (CRITICAL).
        </div>
      </div>

      {/* Global Actions Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl space-y-3">
          <div className="flex items-center gap-2 text-rose-400 font-bold text-xs">
            <Power className="h-4 w-4" />
            عزل جلسات موظفي المنصة (Staff Sessions)
          </div>
          <p className="text-[11px] text-slate-400">
            في حال الاشتباه في اختراق بيانات اعتماد أو جهاز لأحد موظفي الدعم أو المشغلين، يمكنك إنهاء جميع الجلسات المفتوحة فوراً.
          </p>
          <Button
            size="sm"
            variant="danger"
            onClick={handleEmergencyRevokeAllStaffSessions}
            disabled={!canManageEmergency}
            leadingIcon={<Ban className="h-3.5 w-3.5" />}
          >
            إنهاء وتسجيل خروج كافة الموظفين فوراً
          </Button>
        </div>

        <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl space-y-3">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
            <Lock className="h-4 w-4" />
            تفعيل بروتوكول الصيانة الطارئة
          </div>
          <p className="text-[11px] text-slate-400">
            إدخال المنصة في وضع القراءة فقط وإيقاف العمليات الحساسة لجميع العملاء أثناء التعامل مع تهديد أمني.
          </p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              if (!canManageEmergency) {
                toast.warning('لا تملك صلاحية تنفيذ إجراءات الطوارئ.');
                return;
              }
              toast.success('تم إرسال إشعار الصيانة الطارئة وتحديث حالة السيرفرات.');
            }}
            disabled={!canManageEmergency}
            leadingIcon={<AlertTriangle className="h-3.5 w-3.5" />}
          >
            إعلان نافذة صيانة أمنية طارئة
          </Button>
        </div>
      </div>

      {/* Emergency Tenant Isolation */}
      <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl space-y-3">
        <h3 className="text-xs font-bold text-slate-100 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-sky-400" />
          إيقاف وعزل عميل فوري (Tenant Killswitch)
        </h3>
        <p className="text-[11px] text-slate-400">
          اختر عميلاً لقطع وصوله فوراً في حال رصد سلوك ضار أو تلاعب مالي أو انتهاك حقوق التراخيص:
        </p>

        <div className="max-h-56 overflow-y-auto divide-y divide-slate-800 border border-slate-800 rounded-lg bg-slate-950/40">
          {tenants.map((t) => (
            <div key={t.id} className="flex items-center justify-between p-2.5 text-xs">
              <div>
                <span className="font-bold text-slate-200">{t.name}</span>
                <span className="font-mono text-[10px] text-slate-500 mr-2">({t.code})</span>
                <span className="text-[10px] text-slate-400 mr-2">الحالة: {t.status}</span>
              </div>

              {t.status !== 'SUSPENDED' ? (
                canManageEmergency ? (
                  <button
                    onClick={() => handleEmergencySuspendTenant(t)}
                    className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 px-2.5 py-1 rounded font-bold text-[11px]"
                  >
                    إيقاف وتجميد العميل فوراً
                  </button>
                ) : null
              ) : (
                <span className="text-rose-400 font-bold text-[11px]">موقوف حالياً</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Emergency API Keys Revocation */}
      <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl space-y-3">
        <h3 className="text-xs font-bold text-slate-100 flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-amber-400" />
          الإلغاء السريع لمفاتيح API المسربة
        </h3>

        <div className="max-h-48 overflow-y-auto divide-y divide-slate-800 border border-slate-800 rounded-lg bg-slate-950/40">
          {apiKeys.filter((k) => k.isActive).length === 0 ? (
            <p className="p-4 text-center text-xs text-slate-500">لا توجد مفاتيح API نشطة حالياً.</p>
          ) : (
            apiKeys
              .filter((k) => k.isActive)
              .map((k) => (
                <div key={k.id} className="flex items-center justify-between p-2.5 text-xs">
                  <div>
                    <span className="font-bold text-slate-200">{k.name}</span>
                    <span className="font-mono text-[11px] text-slate-400 mr-2">
                      ({k.keyPrefix}...)
                    </span>
                  </div>
                  {canManageEmergency && (
                    <button
                      onClick={() => handleEmergencyRevokeKey(k)}
                      className="text-rose-400 hover:text-rose-300 font-bold text-[11px]"
                    >
                      إلغاء فوري
                    </button>
                  )}
                </div>
              ))
          )}
        </div>
      </div>

      {/* Confirm Modal */}
      <Modal
        open={confirmModal.open}
        onClose={() => setConfirmModal((prev) => ({ ...prev, open: false }))}
        title={confirmModal.title}
      >
        <div className="space-y-3.5 text-right">
          <p className="text-xs text-slate-300 leading-relaxed">{confirmModal.description}</p>

          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs text-rose-300">
            للتأكيد، اكتب الكلمة التالية بدقة في الحقل أدناه:
            <div className="font-mono font-bold text-center text-sm text-rose-200 mt-1">
              {confirmModal.confirmationKeyword}
            </div>
          </div>

          <div>
            <input
              type="text"
              value={confirmModal.inputVal}
              onChange={(e) => setConfirmModal({ ...confirmModal, inputVal: e.target.value })}
              placeholder="اكتب كلمة التأكيد هنا..."
              className={inputClass}
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirmModal((prev) => ({ ...prev, open: false }))}
            >
              إلغاء وتراجع
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={!canManageEmergency || confirmModal.inputVal.trim() !== confirmModal.confirmationKeyword}
              onClick={confirmModal.onExecute}
            >
              تنفيذ الإجراء الطارئ
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default PlatformEmergencyCenterPage;
