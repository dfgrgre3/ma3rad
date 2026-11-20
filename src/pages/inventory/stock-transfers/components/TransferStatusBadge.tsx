import React from 'react';

export const TransferStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  switch (status) {
    case 'REQUESTED':
      return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-warning-soft text-warning border border-warning">طلب جديد (بانتظار الاعتماد)</span>;
    case 'APPROVED':
      return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-accent-soft text-primary border border-accent-border">معتمد (جاهز للتجهيز)</span>;
    case 'PREPARING':
      return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-accent-soft text-primary border border-accent-border">قيد التجهيز والتحميل</span>;
    case 'IN_TRANSIT':
      return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-accent-soft text-primary border border-accent-border animate-pulse">قيد النقل والتوصيل 🚚</span>;
    case 'RECEIVED_FULL':
      return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-success-soft text-success border border-success">مستلم بالكامل</span>;
    case 'RECEIVED_PARTIAL':
      return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-warning-soft text-warning border border-warning">استلام جزئي (يوجد فقد/عجز)</span>;
    case 'COMPLETED':
      return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-warning-soft text-warning border border-warning">مكتمل مع فقد موثق</span>;
    case 'REJECTED':
      return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-danger-soft text-danger border border-danger">مرفوض / ملغي</span>;
    default:
      return <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-surface-sunken">{status}</span>;
  }
};
