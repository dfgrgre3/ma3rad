import React, { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, FileWarning, XCircle } from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { ElectronicInvoiceService } from '../../../services/domains/sales/ElectronicInvoiceService';

export const ElectronicInvoiceReadinessPage: React.FC = () => {
  const service = useMemo(() => new ElectronicInvoiceService(), []);
  const readiness = service.getIntegrationReadiness();
  const checks = [
    { label: 'موفر الاتصال بواجهة ETA', ready: readiness.providerConfigured },
    { label: 'باني المستند والتوقيع الرقمي المعتمد', ready: readiness.documentBuilderConfigured },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 p-5 sm:p-8">
      <PageHeader
        icon={<FileWarning className="h-5 w-5" />}
        title="الفاتورة الإلكترونية"
        description="حالة جاهزية الإرسال إلى مصلحة الضرائب المصرية"
      />

      <section className={`rounded-2xl border p-5 ${readiness.ready ? 'border-success bg-success-soft dark:border-success dark:bg-success/30' : 'border-warning bg-warning-soft dark:border-warning dark:bg-warning/30'}`} role="status" aria-live="polite">
        <div className="flex items-start gap-3">
          {readiness.ready
            ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success " />
            : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning " />}
          <div>
            <h2 className="font-black text-ink ">{readiness.ready ? 'جاهز للإرسال إلى ETA' : 'التكامل غير مهيأ حاليًا'}</h2>
            <p className="mt-1 text-sm leading-6 text-ink ">
              {readiness.ready
                ? 'تم إعداد موفر ETA وباني المستند. حالة الجاهزية لا تعني قبول الفواتير؛ تظهر النتيجة بعد الإرسال ومزامنة الحالة.'
                : 'لا يرسل النظام الفواتير إلى ETA في هذا الإصدار. هذه الشاشة تعرض حالة الإعداد فقط؛ لا تنشئ مسودة ولا ترسل مستندًا.'}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5 ">
        <h2 className="mb-4 text-sm font-black text-ink dark:text-white">متطلبات التوصيل</h2>
        <ul className="space-y-3">
          {checks.map((check) => (
            <li key={check.label} className="flex items-center gap-2 text-sm">
              {check.ready ? (
                <CheckCircle2 className="h-4 w-4 text-success" />
              ) : (
                <XCircle className="h-4 w-4 text-danger" />
              )}
              <span className="text-ink ">{check.label}</span>
              <span className={`mr-auto text-xs font-bold ${check.ready ? 'text-success dark:text-success' : 'text-danger dark:text-danger'}`}>
                {check.ready ? 'مهيأ' : 'غير مهيأ'}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 border-t border-line pt-3 text-xs leading-5 text-muted ">
          يتطلب التفعيل أيضًا بيانات المنشأة والفرع، وتصنيفات ETA للمنتجات والوحدات والضرائب، وشهادة توقيع معتمدة.
        </p>
      </section>
    </div>
  );
};

export default ElectronicInvoiceReadinessPage;
