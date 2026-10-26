import React from 'react';

export const TransferStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  switch (status) {
    case 'REQUESTED':
      return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-amber-100 text-amber-800 border border-amber-300">طلب جديد (بانتظار الاعتماد)</span>;
    case 'APPROVED':
      return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-blue-100 text-blue-800 border border-blue-300">معتمد (جاهز للتجهيز)</span>;
    case 'PREPARING':
      return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-indigo-100 text-indigo-800 border border-indigo-300">قيد التجهيز والتحميل</span>;
    case 'IN_TRANSIT':
      return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-purple-100 text-purple-800 border border-purple-300 animate-pulse">قيد النقل والتوصيل 🚚</span>;
    case 'RECEIVED_FULL':
      return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">مستلم بالكامل</span>;
    case 'RECEIVED_PARTIAL':
      return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-orange-100 text-orange-800 border border-orange-300">استلام جزئي (يوجد فقد/عجز)</span>;
    case 'REJECTED':
      return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-rose-100 text-rose-800 border border-rose-300">مرفوض / ملغي</span>;
    default:
      return <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-slate-100">{status}</span>;
  }
};
