import React, { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, FileWarning, XCircle } from 'lucide-react';
import { ElectronicInvoiceService } from '../../../services/domains/sales/ElectronicInvoiceService';

export const ElectronicInvoiceReadinessPage: React.FC = () => {
  const service = useMemo(() => new ElectronicInvoiceService(), []);
  const readiness = service.getIntegrationReadiness();
  const checks = [
    { label: 'موفر الاتصال بواجهة ETA', ready: readiness.providerConfigured },
    { label: 'باني المستند والتوقيع الرقمي المعتمد', ready: readiness.documentBuilderConfigured },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 p-5 sm:p-8" dir="rtl">
      <header className="flex items-start gap-3">
        <span className="rounded-xl bg-sky-100 p-3 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
          <FileWarning className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">الفاتورة الإلكترونية</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">حالة جاهزية الإرسال إلى مصلحة الضرائب المصرية</p>
        </div>
      </header>

      <section className={`rounded-2xl border p-5 ${readiness.ready ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30' : 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30'}`} role="status" aria-live="polite">
        <div className="flex items-start gap-3">
          {readiness.ready
            ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-300" />
            : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />}
          <div>
            <h2 className="font-black text-slate-950 dark:text-slate-100">{readiness.ready ? 'جاهز للإرسال إلى ETA' : 'التكامل غير مهيأ حاليًا'}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-800 dark:text-slate-200">
              {readiness.ready
                ? 'تم إعداد موفر ETA وباني المستند. حالة الجاهزية لا تعني قبول الفواتير؛ تظهر النتيجة بعد الإرسال ومزامنة الحالة.'
                : 'لا يرسل النظام الفواتير إلى ETA في هذا الإصدار. هذه الشاشة تعرض حالة الإعداد فقط؛ لا تنشئ مسودة ولا ترسل مستندًا.'}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
        <h2 className="mb-4 text-sm font-black text-slate-900 dark:text-white">متطلبات التوصيل</h2>
        <ul className="space-y-3">
          {checks.map((check) => (
            <li key={check.label} className="flex items-center gap-2 text-sm">
              {check.ready ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <XCircle className="h-4 w-4 text-rose-600" />
              )}
              <span className="text-slate-700 dark:text-slate-200">{check.label}</span>
              <span className={`mr-auto text-xs font-bold ${check.ready ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
                {check.ready ? 'مهيأ' : 'غير مهيأ'}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500 dark:border-slate-700 dark:text-slate-400">
          يتطلب التفعيل أيضًا بيانات المنشأة والفرع، وتصنيفات ETA للمنتجات والوحدات والضرائب، وشهادة توقيع معتمدة.
        </p>
      </section>
    </div>
  );
};

export default ElectronicInvoiceReadinessPage;
