import React from 'react';
import { useCentralUsageLimit } from '../../hooks/licensing/useCentralUsageLimit';
import type { CentralUsageMetric } from '../../services/licensing/CentralUsageLimitService';

interface CentralLimitGuardProps {
  metric: CentralUsageMetric;
  /** بديل اختياري يظهر مكان الإجراء المخفي. */
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * حارس إجراء مرتبط بحد ترخيص مركزي:
 *   <CentralLimitGuard metric="maxUsers"><button>مستخدم جديد</button></CentralLimitGuard>
 * يُخفى الإجراء بالكامل عند بلوغ الحد المنشور من الإدارة المركزية.
 */
export const CentralLimitGuard: React.FC<CentralLimitGuardProps> = ({
  metric,
  fallback = null,
  children,
}) => {
  const { reached } = useCentralUsageLimit(metric);
  return <>{reached ? fallback : children}</>;
};
