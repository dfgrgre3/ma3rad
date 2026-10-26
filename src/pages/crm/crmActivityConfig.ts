import type React from 'react';
import { Activity, Calendar, MessageSquare, Phone, User } from 'lucide-react';

export const TYPE_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  CALL: { label: 'اتصال هاتف', color: 'text-sky-600 bg-sky-50 border-sky-200', icon: Phone },
  MEETING: { label: 'اجتماع', color: 'text-violet-600 bg-violet-50 border-violet-200', icon: User },
  VISIT: { label: 'زيارة موقع', color: 'text-amber-600 bg-amber-50 border-amber-200', icon: Calendar },
  WHATSAPP: { label: 'واتساب', color: 'text-emerald-600 bg-emerald-50 border-emerald-200', icon: MessageSquare },
  EMAIL: { label: 'بريد إلكتروني', color: 'text-indigo-600 bg-indigo-50 border-indigo-200', icon: MessageSquare },
  QUOTATION_SENT: { label: 'عرض سعر', color: 'text-emerald-600 bg-emerald-50 border-emerald-200', icon: Activity },
  SAMPLE_GIVEN: { label: 'تسليم عينة', color: 'text-teal-600 bg-teal-50 border-teal-200', icon: Activity },
  NOTE: { label: 'ملاحظة', color: 'text-slate-600 bg-slate-100 border-slate-200', icon: MessageSquare },
  STAGE_CHANGE: { label: 'تغيير مرحلة', color: 'text-orange-600 bg-orange-50 border-orange-200', icon: Activity },
};

