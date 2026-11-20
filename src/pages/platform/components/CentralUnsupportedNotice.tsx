import React from 'react';
import { CloudOff } from 'lucide-react';
import { getCentralDataSourceState } from '../../../hooks/platform/useCentralDataSource';

/**
 * يعرض لافتة تحذير عندما يكون مصدر البيانات المركزي مفعّلاً لكن الصفحة لا
 * تدعم جلب بياناتها من الخادم المركزي بعد — حتى لا تُعرض بيانات محلية
 * على أنها بيانات المنصة المركزية.
 */
export const CentralUnsupportedNotice: React.FC<{ feature?: string }> = ({ feature }) => {
  // getCentralDataSourceState() reads the platform.dataSource setting which
  // has no change event — re-check on mount and periodically so the banner
  // appears/disappears without a full page reload.
  const [state, setState] = React.useState(() => getCentralDataSourceState());
  React.useEffect(() => {
    const refresh = () => setState(getCentralDataSourceState());
    refresh();
    const timer = window.setInterval(refresh, 3000);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  if (!state.active) return null;
  return (
    <div className="flex items-start gap-2 rounded-xl border border-warning-border bg-warning-soft px-4 py-3 text-sm font-semibold text-warning">
      <CloudOff className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        {feature
          ? `«${feature}» غير مدعوم بعد في الوضع المركزي — يتم عرض بيانات محلية مؤقتًا.`
          : 'هذا القسم غير مدعوم بعد في الوضع المركزي — يتم عرض بيانات محلية مؤقتًا.'}
      </span>
    </div>
  );
};

export default CentralUnsupportedNotice;
