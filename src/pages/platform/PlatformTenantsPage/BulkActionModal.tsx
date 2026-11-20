import React from 'react';
import type { PlatformPlan, PlatformTenantStatus } from '../../../services/domains/platform/platformTypes';
import { PLATFORM_TENANT_STATUS_LABELS } from '../../../services/domains/platform/PlatformAdminService';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Field, formatMoney, inputClass } from '../components/PlatformUI';
import { STATUSES } from './constants';

interface BulkActionModalProps {
  open: boolean;
  onClose: () => void;
  bulkActionType: 'status' | 'plan' | 'activation' | 'export' | 'import';
  selectedCount: number;
  bulkWorking: boolean;
  executeBulkAction: () => void;
  canManageTenants: boolean;
  bulkStatus: PlatformTenantStatus;
  setBulkStatus: React.Dispatch<React.SetStateAction<PlatformTenantStatus>>;
  bulkPlanId: string;
  setBulkPlanId: React.Dispatch<React.SetStateAction<string>>;
  plans: PlatformPlan[];
  bulkMonths: number;
  setBulkMonths: React.Dispatch<React.SetStateAction<number>>;
  bulkChannels: string[];
  setBulkChannels: React.Dispatch<React.SetStateAction<string[]>>;
}

export const BulkActionModal: React.FC<BulkActionModalProps> = ({
  open,
  onClose,
  bulkActionType,
  selectedCount,
  bulkWorking,
  executeBulkAction,
  canManageTenants,
  bulkStatus,
  setBulkStatus,
  bulkPlanId,
  setBulkPlanId,
  plans,
  bulkMonths,
  setBulkMonths,
  bulkChannels,
  setBulkChannels,
}) => (
      <Modal
        open={open}
        onClose={onClose}
        title={bulkActionType === 'status' ? 'تغيير حالة العملاء المحددين' :
               bulkActionType === 'plan' ? 'تغيير باقة العملاء المحددين' :
               bulkActionType === 'activation' ? 'إرسال بيانات تفعيل للعملاء المحددين' :
               'تصدير بيانات العملاء'}
        description={`سيتم تطبيق العملية على ${selectedCount} عميل.`}
        size="md"
        busy={bulkWorking}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={bulkWorking}>إلغاء</Button>
            <Button variant="primary" onClick={executeBulkAction} loading={bulkWorking} disabled={!canManageTenants}>
              {bulkActionType === 'status' ? 'تطبيق الحالة' :
               bulkActionType === 'plan' ? 'تطبيق الباقة' :
               bulkActionType === 'activation' ? 'إرسال التفعيل' : 'تصدير'}
            </Button>
          </div>
        }
      >
        {bulkActionType === 'status' && (
          <div className="grid gap-3">
            <Field label="الحالة الجديدة">
              <select className={inputClass} value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value as PlatformTenantStatus)}>
                {STATUSES.map((value) => <option key={value} value={value}>{PLATFORM_TENANT_STATUS_LABELS[value]}</option>)}
              </select>
            </Field>
            <p className="text-[11px] text-warning">سيتم تحديث حالة العميل والتراخيص والاشتراكات المرتبطة.</p>
          </div>
        )}
        {bulkActionType === 'plan' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="الباقة الجديدة" className="sm:col-span-2">
              <select className={inputClass} value={bulkPlanId} onChange={(e) => setBulkPlanId(e.target.value)}>
                <option value="">اختر الباقة</option>
                {plans.filter((plan) => plan.isActive).map((plan) => (
                  <option key={plan.id} value={plan.id}>{plan.name} — {formatMoney(plan.price, plan.currency)}</option>
                ))}
              </select>
            </Field>
            <Field label="المدة (أشهر)">
              <input type="number" min={1} className={inputClass} value={bulkMonths} onChange={(e) => setBulkMonths(Math.max(1, Number(e.target.value)))} />
            </Field>
            <p className="text-[11px] text-warning sm:col-span-2">سيتم إلغاء التراخيص والاشتراكات الحالية وإصدار تراخيص جديدة بالباقة المختارة.</p>
          </div>
        )}
        {bulkActionType === 'activation' && (
          <div className="grid gap-3">
            <p className="text-[11px] font-semibold text-ink">وسائل الإرسال</p>
            <div className="flex flex-wrap gap-3">
              {['EMAIL', 'SMS', 'WHATSAPP'].map((channel) => (
                <label key={channel} className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-ink">
                  <input
                    type="checkbox"
                    checked={bulkChannels.includes(channel)}
                    onChange={(event) => setBulkChannels((current) => event.target.checked
                      ? [...current, channel]
                      : current.filter((item) => item !== channel))}
                  />
                  {channel === 'EMAIL' ? 'بريد إلكتروني' : channel === 'SMS' ? 'رسالة SMS' : 'واتساب'}
                </label>
              ))}
            </div>
          </div>
        )}
        {bulkActionType === 'export' && (
          <p className="text-[11px] text-ink-secondary">سيتم تصدير بيانات العملاء المحددين إلى ملف CSV.</p>
        )}
      </Modal>
);
