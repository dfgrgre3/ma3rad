import React, { useEffect, useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { useToast } from '../../../components/ui/Toast';
import { Field, inputClass, Toggle } from '../components/PlatformUI';
import {
  setSubscriptionAutoRenew,
  updateSubscriptionSeats,
} from './subscriptionData';
import type { PlatformSubscription } from '../../../services/domains/platform/platformTypes';

interface Props {
  subscription: PlatformSubscription | null;
  onClose: () => void;
  onSaved: () => void;
}

export const SubscriptionSettingsModal: React.FC<Props> = ({ subscription, onClose, onSaved }) => {
  const toast = useToast();
  const [seats, setSeats] = useState('');
  const [branchesLimit, setBranchesLimit] = useState('');
  const [autoRenew, setAutoRenew] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!subscription) return;
    setSeats(String(subscription.seats ?? ''));
    setBranchesLimit(String(subscription.branchesLimit ?? ''));
    setAutoRenew(Boolean(subscription.autoRenew));
  }, [subscription]);

  const handleSave = async () => {
    if (!subscription || saving) return;
    const nextSeats = seats ? Number(seats) : subscription.seats;
    const nextBranches = branchesLimit ? Number(branchesLimit) : subscription.branchesLimit;
    if (!Number.isFinite(nextSeats) || nextSeats < 1) { toast.warning('عدد المقاعد غير صالح.'); return; }
    if (!Number.isFinite(nextBranches) || nextBranches < 1) { toast.warning('حد الفروع غير صالح.'); return; }

    setSaving(true);
    try {
      const seatsChanged = nextSeats !== subscription.seats || nextBranches !== subscription.branchesLimit;
      const renewChanged = autoRenew !== Boolean(subscription.autoRenew);
      if (seatsChanged) {
        await updateSubscriptionSeats(subscription.tenantId, nextSeats, nextBranches);
      }
      if (renewChanged) {
        await setSubscriptionAutoRenew(subscription.tenantId, autoRenew);
      }
      if (!seatsChanged && !renewChanged) {
        toast.info('لا توجد تغييرات للحفظ.');
        return;
      }
      toast.success('تم حفظ إعدادات الاشتراك.');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل حفظ الإعدادات.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(subscription)}
      onClose={() => { if (!saving) onClose(); }}
      busy={saving}
      size="sm"
      title={`إعدادات الاشتراك: ${subscription?.tenantName || subscription?.tenantId || ''}`}
    >
      <div className="space-y-3.5 text-right">
        <div className="grid grid-cols-2 gap-3">
          <Field label="عدد المقاعد" required>
            <input
              type="number"
              min={1}
              value={seats}
              onChange={(e) => setSeats(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="حد الفروع" required>
            <input
              type="number"
              min={1}
              value={branchesLimit}
              onChange={(e) => setBranchesLimit(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-line-strong bg-surface-sunken px-3 py-2.5">
          <div>
            <p className="text-xs font-bold text-ink">التجديد التلقائي</p>
            <p className="text-[10.5px] text-muted">تجديد الاشتراك تلقائياً عند انتهاء المدة</p>
          </div>
          <Toggle checked={autoRenew} onChange={setAutoRenew} label="التجديد التلقائي" disabled={saving} />
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-line-strong">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
            إلغاء
          </Button>
          <Button size="sm" onClick={() => void handleSave()} loading={saving}>
            حفظ الإعدادات
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default SubscriptionSettingsModal;
