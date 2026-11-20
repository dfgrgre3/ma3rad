import type React from 'react';
import { Activity, Calendar, MessageSquare, Phone, User } from 'lucide-react';

export const TYPE_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  CALL: { label: 'اتصال هاتف', color: 'text-primary bg-accent-soft border-accent-border', icon: Phone },
  MEETING: { label: 'اجتماع', color: 'text-primary bg-accent-soft border-accent-border', icon: User },
  VISIT: { label: 'زيارة موقع', color: 'text-warning bg-warning-soft border-warning-border', icon: Calendar },
  WHATSAPP: { label: 'واتساب', color: 'text-success bg-success-soft border-success-border', icon: MessageSquare },
  EMAIL: { label: 'بريد إلكتروني', color: 'text-primary bg-accent-soft border-accent-border', icon: MessageSquare },
  QUOTATION_SENT: { label: 'عرض سعر', color: 'text-success bg-success-soft border-success-border', icon: Activity },
  SAMPLE_GIVEN: { label: 'تسليم عينة', color: 'text-success bg-success-soft border-success-border', icon: Activity },
  NOTE: { label: 'ملاحظة', color: 'text-ink-secondary bg-surface-sunken border-line', icon: MessageSquare },
  STAGE_CHANGE: { label: 'تغيير مرحلة', color: 'text-warning bg-warning-soft border-warning-border', icon: Activity },
};

