import React, { useEffect, useMemo, useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { useToast } from '../../../components/ui/Toast';
import { Field, inputClass, formatMoney } from '../components/PlatformUI';
import {
  createSubscription,
  createTrialSubscription,
  listTenants,
} from './subscriptionData';
import type { PlatformPlan, PlatformTenant } from '../../../services/domains/platform/platformTypes';

export type CreateSubscriptionMode = 'NEW' | 'TRIAL';

interface Props {
  open: boolean;
  mode: CreateSubscriptionMode;
  plans: PlatformPlan[];
  onClose: () => void;
  onCreated: () => void;
}

const toDateInput = (d: Date) => d.toISOString().slice(0, 10);

export const CreateSubscriptionModal: React.FC<Props> = ({ open, mode, plans, onClose, onCreated }) => {
  const toast = useToast();
  const [tenants, setTenants] = useState<PlatformTenant[]>([]);
  const [tenantsLoading, setTenantsLoading] = useState(false);
  const [tenantSearch, setTenantSearch] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [planId, setPlanId] = useState('');
  const [seats, setSeats] = useState('');
  const [branchesLimit, setBranchesLimit] = useState('');
  const [startDate, setStartDate] = useState(toDateInput(new Date()));
  const [endDate, setEndDate] = useState('');
  const [price, setPrice] = useState('');
  const [autoRenew, setAutoRenew] = useState(true);
  const [trialDays, setTrialDays] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isTrial = mode === 'TRIAL';
  const activePlans = useMemo(() => plans.filter((p) => p.isActive !== false), [plans]);
  const selectedPlan = activePlans.find((p) => p.id === planId);

  useEffect(() => {
    if (!open) return;
    setTenantId('');
    setPlanId('');
    setSeats('');
    setBranchesLimit('');
    setStartDate(toDateInput(new Date()));
    setEndDate('');
    setPrice('');
    setAutoRenew(true);
    setTrialDays('');
    setTenantSearch('');
    setTenantsLoading(true);
    listTenants('')
      .then(setTenants)
      .catch((err) => toast.error(err instanceof Error ? err.message : 'تعذر تحميل العملاء.'))
      .finally(() => setTenantsLoading(false));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredTenants = useMemo(() => {
    const term = tenantSearch.trim().toLowerCase();
    if (!term) return tenants;
    return tenants.filter(
      (t) =>
        t.name?.toLowerCase().includes(term) ||
        t.code?.toLowerCase().includes(term) ||
        t.email?.toLowerCase().includes(term)
    );
  }, [tenants, tenantSearch]);

  const handleSubmit = async () => {
    if (!tenantId) { toast.warning('يرجى اختيار العميل.'); return; }
    if (!planId) { toast.warning('يرجى اختيار الباقة.'); return; }
    if (submitting) return;
    setSubmitting(true);
    try {
      if (isTrial) {
        await createTrialSubscription({
          tenantId,
          planId,
          trialDays: trialDays ? Number(trialDays) : undefined,
          seats: seats ? Number(seats) : undefined,
          branchesLimit: branchesLimit ? Number(branchesLimit) : undefined,
        });
        toast.success('تم إنشاء الاشتراك التجريبي بنجاح.');
      } else {
        await createSubscription({
          tenantId,
          planId,
          status: 'ACTIVE',
          startDate: startDate || undefined,
          endDate: endDate || null,
          seats: seats ? Number(seats) : undefined,
          price: price ? Number(price) : undefined,
          autoRenew,
          branchesLimit: branchesLimit ? Number(branchesLimit) : undefined,
        });
        toast.success('تم إنشاء الاشتراك بنجاح.');
      }
      onCreated();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشلت عملية الإنشاء.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => { if (!submitting) onClose(); }}
      busy={submitting}
      size="lg"
      title={isTrial ? 'إنشاء اشتراك تجريبي (Trial)' : 'إنشاء اشتراك جديد'}
    >
      <div className="space-y-3.5 text-right">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="العميل / المستأجر" required>
            <input
              type="text"
              value={tenantSearch}
              onChange={(e) => setTenantSearch(e.target.value)}
              placeholder="ابحث بالاسم أو الكود..."
              className={inputClass}
            />
            <select
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className={`${inputClass} mt-1.5`}
              disabled={tenantsLoading}
            >
              <option value="">{tenantsLoading ? 'جارٍ تحميل العملاء...' : '— اختر العميل —'}</option>
              {filteredTenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} {t.code ? `(${t.code})` : ''}
                </option>
              ))}
            </select>
          </Field>

          <Field label="الباقة" required>
            <select value={planId} onChange={(e) => setPlanId(e.target.value)} className={inputClass}>
              <option value="">— اختر الباقة —</option>
              {activePlans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {formatMoney(p.price, p.currency)}
                </option>
              ))}
            </select>
          </Field>

          <Field label="عدد المقاعد">
            <input
              type="number"
              min={1}
              value={seats}
              onChange={(e) => setSeats(e.target.value)}
              placeholder={selectedPlan ? `الافتراضي: ${selectedPlan.seatsLimit}` : 'الافتراضي حسب الباقة'}
              className={inputClass}
            />
          </Field>

          <Field label="حد الفروع">
            <input
              type="number"
              min={1}
              value={branchesLimit}
              onChange={(e) => setBranchesLimit(e.target.value)}
              placeholder={selectedPlan ? `الافتراضي: ${selectedPlan.branchesLimit}` : 'الافتراضي حسب الباقة'}
              className={inputClass}
            />
          </Field>
        </div>

        {isTrial ? (
          <Field label="مدة التجربة (بالأيام)" hint={`الافتراضي: ${selectedPlan?.trialDays ?? 14} يوم حسب الباقة`}>
            <input
              type="number"
              min={1}
              max={365}
              value={trialDays}
              onChange={(e) => setTrialDays(e.target.value)}
              className={inputClass}
            />
          </Field>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="تاريخ البدء">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
            </Field>
            <Field label="تاريخ الانتهاء" hint="اتركه فارغاً لافتراضي سنة">
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
            </Field>
            <Field label="السعر (اختياري)" hint={selectedPlan ? `سعر الباقة: ${formatMoney(selectedPlan.price, selectedPlan.currency)}` : undefined}>
              <input
                type="number"
                min={0}
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="سعر الباقة"
                className={inputClass}
              />
            </Field>
          </div>
        )}

        {!isTrial && (
          <label className="flex items-center gap-2 text-xs font-semibold text-muted">
            <input
              type="checkbox"
              checked={autoRenew}
              onChange={(e) => setAutoRenew(e.target.checked)}
              className="h-4 w-4 accent-success"
            />
            تفعيل التجديد التلقائي
          </label>
        )}

        <div className="flex justify-end gap-2 pt-3 border-t border-line-strong">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={submitting}>
            إلغاء
          </Button>
          <Button size="sm" onClick={() => void handleSubmit()} loading={submitting}>
            {isTrial ? 'إنشاء التجريبي' : 'إنشاء الاشتراك'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default CreateSubscriptionModal;
