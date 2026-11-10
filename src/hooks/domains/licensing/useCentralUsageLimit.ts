import { useEffect, useState } from 'react';
import {
  CentralUsageLimitService,
  type CentralUsageMetric,
  type CentralUsageState,
} from '../../../services/domains/licensing/CentralUsageLimitService';
import { CENTRAL_CONFIG_CHANGED_EVENT } from '../../../services/domains/licensing/CentralLicenseService';

/**
 * يعيد حالة حد الاستخدام المركزي ويتحدّث تلقائيًا عند وصول تكوين جديد من
 * منصة الإدارة المركزية.
 */
export function useCentralUsageLimit(metric: CentralUsageMetric): CentralUsageState {
  const [state, setState] = useState<CentralUsageState>(() =>
    CentralUsageLimitService.getState(metric)
  );

  useEffect(() => {
    const refresh = () => setState(CentralUsageLimitService.getState(metric));
    refresh();
    window.addEventListener(CENTRAL_CONFIG_CHANGED_EVENT, refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener(CENTRAL_CONFIG_CHANGED_EVENT, refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [metric]);

  return state;
}
