import React from 'react';
import {
  Ban,
  CheckCircle2,
  KeyRound,
  Link2,
  RefreshCw,
  ShieldAlert,
  ShieldX,
  Trash2,
} from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Field, StatusBadge, formatDate, formatDateTime, inputClass } from '../components/PlatformUI';
import { useToast } from '../../../components/ui/Toast';
import type {
  PlatformDevice,
  PlatformLicense,
  PlatformTenant,
} from '../../../services/domains/platform/platformTypes';
import {
  activateDevice,
  deleteDevice,
  enrollDeviceCredential,
  reassignDevice,
  releaseDevice,
  revokeDevice,
  setDeviceCloneSuspected,
  suspendDevice,
} from './deviceData';

export const DEVICE_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'نشط',
  SUSPENDED: 'موقوف',
  REVOKED: 'ملغي',
  OFFLINE: 'غير متصل',
  RELEASED: 'محرر',
  INACTIVE: 'غير نشط',
};

interface DeviceDetailsDrawerProps {
  device: PlatformDevice | null;
  tenants: PlatformTenant[];
  licenses: PlatformLicense[];
  canManage: boolean;
  centralMode: boolean;
  onClose: () => void;
  onChanged: () => void;
}

const InfoRow: React.FC<{ label: string; children: React.ReactNode; mono?: boolean }> = ({ label, children, mono }) => (
  <div className="flex items-start justify-between gap-3 border-b border-line/60 py-2 last:border-0">
    <span className="shrink-0 text-[11px] font-semibold text-muted">{label}</span>
    <span className={`min-w-0 text-left text-[11.5px] font-semibold text-ink ${mono ? 'font-mono text-[10.5px]' : ''}`}>{children}</span>
  </div>
);

export const DeviceDetailsDrawer: React.FC<DeviceDetailsDrawerProps> = ({
  device,
  tenants,
  licenses,
  canManage,
  centralMode,
  onClose,
  onChanged,
}) => {
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const [confirm, setConfirm] = React.useState<{
    action: 'suspend' | 'release' | 'revoke' | 'activate' | 'delete' | 'clone' | 'clear-clone';
    title: string;
    description: string;
    danger?: boolean;
  } | null>(null);
  const [reassignOpen, setReassignOpen] = React.useState(false);
  const [reassignLicenseId, setReassignLicenseId] = React.useState('');
  const [credentialOpen, setCredentialOpen] = React.useState(false);
  const [credential, setCredential] = React.useState('');

  const deviceId = device?.id ?? null;

  React.useEffect(() => {
    setConfirm(null);
    setReassignOpen(false);
    setCredentialOpen(false);
    setCredential('');
    setReassignLicenseId('');
  }, [deviceId]);

  const tenant = device ? tenants.find((item) => item.id === device.tenantId) : null;
  const license = device?.licenseId ? licenses.find((item) => item.id === device.licenseId) ?? null : null;
  const reassignCandidates = device
    ? licenses.filter((item) => item.tenantId === device.tenantId && item.id !== device.licenseId && item.status !== 'REVOKED')
    : [];

  const runAction = async () => {
    if (!device || !confirm) return;
    setBusy(true);
    try {
      const reason = `إجراء ${confirm.action} من صفحة الأجهزة`;
      switch (confirm.action) {
        case 'suspend': await suspendDevice(device.id, reason); break;
        case 'release': await releaseDevice(device.id, reason); break;
        case 'revoke': await revokeDevice(device.id, reason); break;
        case 'activate': await activateDevice(device.id, reason); break;
        case 'delete': await deleteDevice(device.id); break;
        case 'clone': await setDeviceCloneSuspected(device.id, true); break;
        case 'clear-clone': await setDeviceCloneSuspected(device.id, false); break;
      }
      toast.success('تم تنفيذ الإجراء');
      setConfirm(null);
      onChanged();
    } catch (err) {
      toast.error('تعذر تنفيذ الإجراء', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const confirmReassign = async () => {
    if (!device || !reassignLicenseId) return;
    setBusy(true);
    try {
      await reassignDevice(device.id, reassignLicenseId, 'نقل جهاز من صفحة الأجهزة');
      toast.success('تم نقل الجهاز إلى الترخيص الجديد');
      setReassignOpen(false);
      onChanged();
    } catch (err) {
      toast.error('تعذر نقل الجهاز', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const submitCredential = async () => {
    if (!device || credential.trim().length < 16) {
      toast.error('بيانات الاعتماد يجب أن تكون 16 حرفاً على الأقل');
      return;
    }
    setBusy(true);
    try {
      await enrollDeviceCredential(device.id, credential.trim());
      toast.success('تم تسجيل بيانات اعتماد الجهاز');
      setCredentialOpen(false);
      setCredential('');
    } catch (err) {
      toast.error('تعذر تسجيل بيانات الاعتماد', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const actionButtons = device && canManage ? (
    <div className="flex flex-wrap items-center gap-1 border-t border-line pt-3">
      {device.status === 'ACTIVE' ? (
        <Button variant="ghost" size="sm" leadingIcon={<Ban className="h-3.5 w-3.5" />} disabled={busy}
          onClick={() => setConfirm({ action: 'suspend', title: 'إيقاف الجهاز عن بُعد', description: 'سيتم منع هذا الجهاز من الاتصال بالمنصة فوراً.', danger: true })}>
          إيقاف
        </Button>
      ) : device.status !== 'REVOKED' && device.licenseId ? (
        <Button variant="ghost" size="sm" leadingIcon={<CheckCircle2 className="h-3.5 w-3.5" />} disabled={busy}
          onClick={() => setConfirm({ action: 'activate', title: 'إعادة تفعيل الجهاز', description: 'سيعود الجهاز للحالة نشط ويُسمح له بالاتصال بالمنصة.' })}>
          تفعيل
        </Button>
      ) : null}
      {device.licenseId && (
        <Button variant="ghost" size="sm" leadingIcon={<Link2 className="h-3.5 w-3.5" />} disabled={busy}
          onClick={() => setConfirm({ action: 'release', title: 'تحرير الجهاز', description: 'سيتم فك ارتباط الجهاز بالترخيص — سيتطلب تفعيلاً جديداً برخصة صالحة.', danger: true })}>
          تحرير
        </Button>
      )}
      {device.status !== 'REVOKED' && (
        <Button variant="ghost" size="sm" leadingIcon={<ShieldX className="h-3.5 w-3.5" />} disabled={busy}
          onClick={() => setConfirm({ action: 'revoke', title: 'إلغاء الجهاز', description: 'إجراء نهائي: لن يتمكن الجهاز من العمل مع أي ترخيص على المنصة.', danger: true })}>
          إلغاء
        </Button>
      )}
      {device.status !== 'REVOKED' && reassignCandidates.length > 0 && (
        <Button variant="ghost" size="sm" leadingIcon={<RefreshCw className="h-3.5 w-3.5" />} disabled={busy} onClick={() => setReassignOpen(true)}>
          نقل لترخيص آخر
        </Button>
      )}
      {device.cloneSuspected ? (
        <Button variant="ghost" size="sm" leadingIcon={<CheckCircle2 className="h-3.5 w-3.5" />} disabled={busy}
          onClick={() => setConfirm({ action: 'clear-clone', title: 'إزالة اشتباه الاستنساخ', description: 'سيتم مسح علامة الاستنساخ عن هذا الجهاز.' })}>
          إزالة الاشتباه
        </Button>
      ) : (
        <Button variant="ghost" size="sm" leadingIcon={<ShieldAlert className="h-3.5 w-3.5" />} disabled={busy}
          onClick={() => setConfirm({ action: 'clone', title: 'تمييز الجهاز كمشبوه', description: 'سيُعلَّم الجهاز كمشتبه به في سجلات المراقبة.' })}>
          تمييز كمشبوه
        </Button>
      )}
      {centralMode && (
        <Button variant="ghost" size="sm" leadingIcon={<KeyRound className="h-3.5 w-3.5" />} disabled={busy} onClick={() => setCredentialOpen(true)}>
          بيانات الاعتماد
        </Button>
      )}
      <Button variant="ghost" size="sm" leadingIcon={<Trash2 className="h-3.5 w-3.5" />} disabled={busy}
        onClick={() => setConfirm({ action: 'delete', title: 'حذف تفعيل الجهاز', description: 'سيتم حذف سجل الجهاز نهائياً — لا يمكن التراجع.', danger: true })}>
        حذف
      </Button>
    </div>
  ) : null;

  return (
    <Modal
      open={Boolean(device)}
      onClose={onClose}
      title={device ? `جهاز ${device.name ?? device.hardwareId}` : ''}
      description={device?.hardwareId}
      size="lg"
      footer={
        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>إغلاق</Button>
        </div>
      }
    >
      {device && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge value={device.status} label={DEVICE_STATUS_LABELS[device.status] ?? device.status} />
            {device.cloneSuspected && (
              <span className="rounded-full bg-warning-soft px-2.5 py-1 text-[10px] font-bold text-warning">اشتباه استنساخ</span>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-surface-muted/40 p-3">
              <InfoRow label="العميل">{tenant?.name ?? device.tenantId}</InfoRow>
              <InfoRow label="الترخيص" mono>
                {license ? <span dir="ltr">{license.licenseKey}</span> : device.licenseId ? <span dir="ltr">{device.licenseId}</span> : 'غير مرتبط'}
              </InfoRow>
              <InfoRow label="معرف العتاد" mono><span dir="ltr">{device.hardwareId}</span></InfoRow>
              <InfoRow label="الاسم">{device.name ?? '—'}</InfoRow>
              <InfoRow label="نظام التشغيل">{device.os ?? '—'}</InfoRow>
              <InfoRow label="إصدار التطبيق">{device.appVersion ?? '—'}</InfoRow>
              <InfoRow label="عنوان IP" mono><span dir="ltr">{device.ipAddress ?? '—'}</span></InfoRow>
            </div>
            <div className="rounded-xl border border-line bg-surface-muted/40 p-3">
              <InfoRow label="أول تفعيل">{formatDate(device.firstActivatedAt)}</InfoRow>
              <InfoRow label="آخر ظهور">{device.lastSeenAt ? formatDateTime(device.lastSeenAt) : '—'}</InfoRow>
              <InfoRow label="تاريخ الإنشاء">{formatDate(device.createdAt)}</InfoRow>
              <InfoRow label="آخر تحديث">{formatDateTime(device.updatedAt)}</InfoRow>
              {device.notes && <InfoRow label="ملاحظات"><span className="whitespace-pre-wrap">{device.notes}</span></InfoRow>}
            </div>
          </div>

          {actionButtons}
        </div>
      )}

      {/* Action confirmation */}
      <Modal
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title={confirm?.title ?? ''}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirm(null)}>إلغاء</Button>
            <Button variant={confirm?.danger ? 'danger' : 'primary'} onClick={() => void runAction()} disabled={busy}>
              تأكيد
            </Button>
          </div>
        }
      >
        <p className="text-[11px] text-ink-secondary leading-relaxed">{confirm?.description}</p>
      </Modal>

      {/* Reassign modal */}
      <Modal
        open={reassignOpen}
        onClose={() => setReassignOpen(false)}
        title="نقل الجهاز إلى ترخيص آخر"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setReassignOpen(false)}>إلغاء</Button>
            <Button variant="primary" onClick={() => void confirmReassign()} disabled={!reassignLicenseId || busy}>
              نقل الجهاز
            </Button>
          </div>
        }
      >
        <Field label="الترخيص الهدف" required>
          <select className={inputClass} value={reassignLicenseId} onChange={(event) => setReassignLicenseId(event.target.value)}>
            <option value="">اختر الترخيص</option>
            {reassignCandidates.map((item) => (
              <option key={item.id} value={item.id}>
                {item.tenantName ?? item.tenantId} — {item.licenseKey}
              </option>
            ))}
          </select>
        </Field>
      </Modal>

      {/* Credential enrollment (central only) */}
      <Modal
        open={credentialOpen}
        onClose={() => setCredentialOpen(false)}
        title="تسجيل بيانات اعتماد الجهاز"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCredentialOpen(false)}>إلغاء</Button>
            <Button variant="primary" onClick={() => void submitCredential()} disabled={busy || credential.trim().length < 16}>
              حفظ
            </Button>
          </div>
        }
      >
        <p className="mb-3 text-[11px] text-ink-secondary leading-relaxed">
          أدخل سر الجهاز (16 حرفاً على الأقل). يُخزَّن على الخادم بصيغة hash فقط ولا يمكن استرجاعه لاحقاً — هذا الإجراء يستبدل أي اعتماد سابق.
        </p>
        <Field label="سر الجهاز" required>
          <input
            className={inputClass}
            dir="ltr"
            value={credential}
            onChange={(event) => setCredential(event.target.value)}
            placeholder="device secret…"
            autoComplete="off"
          />
        </Field>
      </Modal>
    </Modal>
  );
};

export default DeviceDetailsDrawer;
