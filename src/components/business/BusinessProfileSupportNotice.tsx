import React from 'react';
import { getBusinessProfile, getBusinessProfileCapabilities, type BusinessCapabilityStatus } from '../../config/businessProfiles';

const STATUS_LABEL: Record<BusinessCapabilityStatus, string> = {
  implemented: 'منفذ',
  partial: 'منفذ جزئيًا',
  'not-implemented': 'غير منفذ',
};

const STATUS_CLASS: Record<BusinessCapabilityStatus, string> = {
  implemented: 'bg-success-soft text-success',
  partial: 'bg-warning-soft text-warning',
  'not-implemented': 'bg-surface-sunken text-ink',
};

export const BusinessProfileSupportNotice: React.FC<{ businessType: string }> = ({ businessType }) => {
  const profile = getBusinessProfile(businessType);
  const capabilities = getBusinessProfileCapabilities(businessType);

  return (
    <section className="rounded-xl border border-warning-border bg-warning-soft p-3 text-warning" aria-label="حالة دعم وظائف النشاط">
      <div className="mb-2">
        <h3 className="text-xs font-black">حدود دعم النشاط: {profile.name.ar}</h3>
        <p className="mt-1 text-[10px] leading-5">
          ملف النشاط يضبط الإعدادات والوحدات والخصائص فقط. اختيار النشاط لا يفعّل وحده وظائف قطاعية إضافية.
        </p>
      </div>
      <dl className="grid gap-1.5 sm:grid-cols-2">
        {capabilities.map((capability) => (
          <div key={capability.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface/80 px-2.5 py-1.5">
            <dt className="text-[10px] font-semibold">{capability.label}</dt>
            <dd className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black ${STATUS_CLASS[capability.status]}`}>
              {STATUS_LABEL[capability.status]}
            </dd>
          </div>
        ))}
      </dl>
      {businessType === 'manufacturing' && (
        <p className="mt-2 text-[10px] leading-5">التصنيع يوفر وظائف إنتاج أساسية؛ التقارير والقوالب القطاعية غير منفذة.</p>
      )}
    </section>
  );
};
