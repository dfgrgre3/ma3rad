import React from 'react';
import { Copy, Send, ShieldCheck } from 'lucide-react';
import type { PlatformActivationDetails } from '../../../services/domains/platform/platformTypes';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { InfoItem } from './shared';
import { formatDate, formatDateTime } from '../components/PlatformUI';
import { activationText } from './activation';

interface ActivationModalProps {
  open: boolean;
  onClose: () => void;
  activation: PlatformActivationDetails | null;
  copyToClipboard: (text: string, label: string) => Promise<void>;
  sendActivation: () => void;
  working: boolean;
  canManageTenants: boolean;
  channels: string[];
  setChannels: React.Dispatch<React.SetStateAction<string[]>>;
}

export const ActivationModal: React.FC<ActivationModalProps> = ({
  open,
  onClose,
  activation,
  copyToClipboard,
  sendActivation,
  working,
  canManageTenants,
  channels,
  setChannels,
}) => (
  <>
      {/* Activation details */}
      <Modal
        open={open}
        onClose={onClose}
        title="بيانات تفعيل العميل"
        description="سلّم هذه البيانات للعميل ليتمكن من الدخول وتفعيل ترخيصه."
        icon={<ShieldCheck className="h-5 w-5" />}
        size="lg"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>إغلاق</Button>
            {activation && (
              <>
                <Button variant="secondary" leadingIcon={<Copy className="h-3.5 w-3.5" />} onClick={() => copyToClipboard(activationText(activation), 'بيانات التفعيل')}>
                  نسخ كل البيانات
                </Button>
                <Button variant="primary" leadingIcon={<Send className="h-3.5 w-3.5" />} onClick={sendActivation} loading={working} disabled={!canManageTenants}>
                  إعادة الإرسال
                </Button>
              </>
            )}
          </div>
        }
      >
        {activation && (
          <div className="space-y-3">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-semibold text-amber-800">
              تم تسجيل عملية التفعيل في سجل العميل. لا تشارك هذه البيانات إلا مع المسؤول المعتمد للعميل.
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <InfoItem label="العميل" value={activation.tenant.name} />
              <InfoItem label="رقم العميل" value={activation.tenant.code} ltr />
              <InfoItem label="اسم المستخدم" value={activation.username} ltr />
              <InfoItem
                label="كلمة المرور المؤقتة"
                value={activation.temporaryPassword ? <span className="font-mono text-emerald-700">{activation.temporaryPassword}</span> : 'غير متاحة — استخدم إعادة تعيين كلمة المرور'}
                ltr
              />
              <InfoItem label="كود التفعيل" value={activation.activationCode} ltr />
              <InfoItem label="الباقة" value={activation.planName} />
              <InfoItem label="مفتاح الترخيص" value={activation.licenseKey} ltr />
              <InfoItem label="انتهاء الترخيص" value={formatDate(activation.licenseExpiresAt)} />
              <InfoItem label="رابط الدخول" value={<span className="font-mono text-[10.5px]">{activation.loginUrl}</span>} ltr />
              <InfoItem label="تاريخ التجهيز" value={formatDateTime(activation.generatedAt)} />
            </div>
            {activation.modules.length > 0 && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="mb-1.5 text-[10.5px] font-semibold text-slate-500">الوحدات المضمنة</p>
                <div className="flex flex-wrap gap-1">
                  {activation.modules.map((module) => (
                    <span key={module} className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200" dir="ltr">
                      {module}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="mb-2 text-[10.5px] font-semibold text-slate-500">وسائل الإرسال</p>
              <div className="flex flex-wrap gap-3">
                {['EMAIL', 'SMS', 'WHATSAPP'].map((channel) => (
                  <label key={channel} className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={channels.includes(channel)}
                      onChange={(event) => setChannels((current) => event.target.checked
                        ? [...current, channel]
                        : current.filter((item) => item !== channel))}
                    />
                    {channel === 'EMAIL' ? 'بريد إلكتروني' : channel === 'SMS' ? 'رسالة SMS' : 'واتساب'}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
  </>
);
