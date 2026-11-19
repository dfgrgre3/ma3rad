import React from 'react';
import type { PlatformStaffRole } from '../../../services/domains/platform/platformTypes';
import { ROLE_BADGE } from './constants';

export const RoleBadge: React.FC<{ role: PlatformStaffRole }> = ({ role }) => (
  <span className={`border px-2 py-0.5 rounded text-[10px] font-black ${ROLE_BADGE[role] ?? 'bg-slate-800 text-slate-300 border-slate-700'}`}>
    {role === 'SUPER_ADMIN' ? 'مالك المنصة'
      : role === 'PLATFORM_ADMIN' ? 'مدير المنصة'
      : role === 'SUPPORT_AGENT' ? 'دعم فني'
      : role === 'BILLING_SPECIALIST' ? 'فوترة واشتراكات'
      : role === 'OPERATIONS_ENGINEER' ? 'عمليات وتشغيل'
      : 'إدارة التراخيص'}
  </span>
);
