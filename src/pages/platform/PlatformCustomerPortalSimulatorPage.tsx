import React from 'react';
import { Building2, AlertTriangle, ShieldAlert, ExternalLink } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';

/**
 * Customer Portal (platform-side entry point).
 *
 * This page intentionally does NOT simulate a customer login or display
 * fabricated tenant, subscription, invoice, or license data. A production
 * customer portal requires:
 *   - a dedicated tenant-facing authentication flow (separate from platform staff),
 *   - tenant-scoped Central API endpoints for profile, billing, licenses, and devices,
 *   - server-side enforcement so a tenant can never read another tenant's data.
 *
 * Until those endpoints are provisioned and wired, the portal is reported as
 * unavailable rather than presenting mock or hardcoded records.
 */
export const PlatformCustomerPortalSimulatorPage: React.FC = () => {
  // Reactive snapshot — the data-source flag can change while the page is open.
  const [dataSource, setDataSource] = React.useState<'local' | 'central'>(() => {
    try {
      return platformAdminService.getDataSource();
    } catch {
      return 'local';
    }
  });
  React.useEffect(() => {
    const refresh = () => {
      try {
        setDataSource(platformAdminService.getDataSource());
      } catch {
        setDataSource('local');
      }
    };
    refresh();
    const timer = window.setInterval(refresh, 3000);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  const checks: Array<{ label: string; ok: boolean; detail: string }> = [
    {
      label: 'مصادقة بوابة العملاء (منفصلة عن موظفي المنصة)',
      ok: false,
      detail: 'غير مهيأة — يلزم تدفق تسجيل دخول خاص بالعميل مع عزل تام عن هوية المنصة.',
    },
    {
      label: 'واجهات API خاصة بالعميل (ملف، اشتراك، فواتير، تراخيص، أجهزة)',
      ok: false,
      detail: 'غير متصلة — لا توجد نقاط نهاية مفعّلة لبوابة العميل على الخادم المركزي.',
    },
    {
      label: 'عزل المستأجر (Tenant Isolation) على مستوى الخادم',
      ok: false,
      detail: 'يتطلب تحققًا من هوية العميل ونطاقه على الخادم قبل أي عملية قراءة/كتابة.',
    },
    {
      label: 'مصدر بيانات المنصة المركزي',
      ok: dataSource === 'central',
      detail:
        dataSource === 'central'
          ? 'مضبوط على الخادم المركزي.'
          : 'المصدر الحالي محلي؛ يلزم التبديل إلى الخادم المركزي لربط بوابة العملاء.',
    },
  ];

  return (
    <div className="space-y-4 text-right">
      <PageHeader
        title="بوابة العملاء المركزية (Customer Portal)"
        description="واجهة العميل النهائي للاطلاع على اشتراكه وفواتيره وتراخيصه وأجهزته وإدارة مستخدميه — وفق صلاحياته فقط."
        icon={<Building2 className="h-5 w-5 text-primary" />}
      />

      <div className="flex items-start gap-3 rounded-xl border border-warning-border bg-warning-soft p-4 text-warning">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="space-y-1 text-sm leading-relaxed">
          <p className="font-bold">بوابة العملاء غير مفعّلة للإنتاج بعد</p>
          <p>
            لا تُعرض هنا أي بيانات تجريبية أو محاكاة تسجيل دخول. تفعيل البوابة يتطلب استكمال مصادقة العميل وواجهات
            API المركزية المعزولة لكل مستأجر.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-line-strong bg-primary/70 p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-muted">
          <ShieldAlert className="h-4 w-4 text-danger" />
          متطلبات الجاهزية (حالة حقيقية)
        </h3>
        <ul className="space-y-3">
          {checks.map((item) => (
            <li key={item.label} className="flex items-start gap-3 rounded-lg border border-line-strong bg-primary/40 p-3">
              <span
                className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                  item.ok ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'
                }`}
                aria-label={item.ok ? 'متوفر' : 'غير متوفر'}
              >
                {item.ok ? '✓' : '×'}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold text-muted">{item.label}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{item.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border border-line-strong bg-primary/60 p-4 text-xs text-muted leading-relaxed">
        <p className="flex items-center gap-2 font-semibold text-muted">
          <ExternalLink className="h-3.5 w-3.5" />
          ملاحظة تشغيلية
        </p>
        <p className="mt-1">
          عند اكتمال ربط البوابة بالخادم المركزي، ستعرض هذه الصفحة بيانات العميل الحقيقية (اشتراك، فواتير، مدفوعات،
          تراخيص، أجهزة، مستخدمون، حالة مزامنة) بعد مصادقة آمنة وعلى أساس نطاق المستأجر فقط.
        </p>
      </div>
    </div>
  );
};

export default PlatformCustomerPortalSimulatorPage;
