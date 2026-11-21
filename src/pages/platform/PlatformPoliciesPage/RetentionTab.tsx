import React, { useEffect, useState } from 'react';
import { DatabaseBackup, Info, Save } from 'lucide-react';
import type { PlatformPolicyRetentionConfig } from '../../../services/domains/platform/platformTypes';
import { Button } from '../../../components/ui/Button';
import { inputClass } from '../components/PlatformUI';

interface RetentionField {
  key: keyof PlatformPolicyRetentionConfig;
  label: string;
  hint: string;
  optional?: boolean;
}

const FIELDS: RetentionField[] = [
  {
    key: 'auditRetentionDays',
    label: 'سجلات العمليات والتدقيق (Audit Logs)',
    hint: 'مدة الاحتفاظ بأحداث التدقيق المركزية قبل الأرشفة أو الحذف.',
  },
  {
    key: 'backupRetentionDays',
    label: 'النسخ الاحتياطية السحابية (Backups)',
    hint: 'مدة الاحتفاظ بنسخ المنصة الاحتياطية المركزية.',
  },
  {
    key: 'syncLogRetentionDays',
    label: 'سجلات المزامنة التشغيلية (Sync Logs)',
    hint: 'مدة الاحتفاظ بأحداث ومذكرات المزامنة بين الأجهزة.',
  },
  {
    key: 'softDeleteGraceDays',
    label: 'مهلة الحذف المبدئي (Soft Delete)',
    hint: 'الفترة بين الحذف المنطقي والإتلاف النهائي للبيانات.',
  },
  {
    key: 'notificationLogRetentionDays',
    label: 'سجلات الإشعارات (Notification Logs)',
    hint: 'مدة الاحتفاظ بسجلات تسليم الإشعارات. اتركه فارغاً للاحتفاظ الافتراضي.',
    optional: true,
  },
  {
    key: 'supportTicketRetentionDays',
    label: 'تذاكر الدعم (Support Tickets)',
    hint: 'مدة الاحتفاظ بسجلات تذاكر الدعم بعد الإغلاق. فارغ = الافتراضي.',
    optional: true,
  },
  {
    key: 'errorReportRetentionDays',
    label: 'تقارير الأخطاء (Error Reports)',
    hint: 'مدة الاحتفاظ بتقارير أعطال العملاء المرفوعة. فارغ = الافتراضي.',
    optional: true,
  },
];

interface RetentionTabProps {
  value: PlatformPolicyRetentionConfig | null;
  loading: boolean;
  canUpdate: boolean;
  saving: boolean;
  onSave: (input: Partial<PlatformPolicyRetentionConfig>) => Promise<void>;
}

const clampDays = (raw: string): number => {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(36500, Math.max(0, Math.round(n))) : 0;
};

export const RetentionTab: React.FC<RetentionTabProps> = ({ value, loading, canUpdate, saving, onSave }) => {
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!value) return;
    const next: Record<string, string> = {};
    for (const field of FIELDS) {
      const v = value[field.key];
      next[field.key] = v === undefined || v === null ? '' : String(v);
    }
    setForm(next);
  }, [value]);

  const setField = (key: string, raw: string) => {
    if (raw === '') {
      setForm((prev) => ({ ...prev, [key]: '' }));
      return;
    }
    setForm((prev) => ({ ...prev, [key]: String(clampDays(raw)) }));
  };

  const dirty = React.useMemo(() => {
    if (!value) return false;
    return FIELDS.some((field) => {
      const current = value[field.key];
      const currentStr = current === undefined || current === null ? '' : String(current);
      return (form[field.key] ?? '') !== currentStr;
    });
  }, [value, form]);

  const handleSave = async () => {
    const input: Partial<PlatformPolicyRetentionConfig> = {};
    for (const field of FIELDS) {
      const raw = form[field.key];
      if (raw === '') {
        if (field.optional) (input as Record<string, unknown>)[field.key] = undefined;
        continue;
      }
      (input as Record<string, unknown>)[field.key] = clampDays(raw);
    }
    await onSave(input);
  };

  if (loading && !value) {
    return <p className="py-10 text-center text-xs font-semibold text-muted">جارٍ تحميل قواعد الاحتفاظ...</p>;
  }

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
        <DatabaseBackup className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="text-[11.5px] leading-6 text-ink">
          <p className="font-bold">قواعد الاحتفاظ بالبيانات (Data Retention)</p>
          <p className="text-muted">
            تحدد هذه القيم المدد الافتراضية لاحتفاظ المنصة بفئات البيانات المختلفة. تُطبَّق على النسخ الاحتياطية
            والتدقيق والسجلات التشغيلية، وتُوثَّق كل عملية حفظ في سجل التدقيق غير القابل للتعديل.
          </p>
        </div>
      </div>

      <div className="grid gap-4 rounded-xl border border-line bg-surface p-4 sm:grid-cols-2">
        {FIELDS.map((field) => (
          <div key={field.key}>
            <label className="block">
              <span className="mb-1 block text-[11.5px] font-semibold text-ink">
                {field.label}
                {field.optional && <span className="mr-1 text-[10px] font-normal text-muted">(اختياري)</span>}
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={36500}
                  value={form[field.key] ?? ''}
                  disabled={!canUpdate}
                  onChange={(e) => setField(field.key, e.target.value)}
                  className={inputClass}
                  placeholder={field.optional ? 'افتراضي' : '0'}
                />
                <span className="shrink-0 text-[11px] text-muted">يوماً</span>
              </div>
            </label>
            <p className="mt-1 text-[10.5px] leading-4 text-muted">{field.hint}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between rounded-xl border border-line bg-surface-sunken px-4 py-3">
        <span className="flex items-center gap-2 text-[10.5px] text-muted">
          <Info className="h-3.5 w-3.5" />
          القيم المختارة «فارغة» للحقول الاختيارية تعني الرجوع للاحتفاظ الافتراضي للمنصة.
        </span>
        {canUpdate && (
          <Button
            size="sm"
            variant="primary"
            onClick={handleSave}
            disabled={saving || !dirty}
            loading={saving}
            leadingIcon={<Save className="h-4 w-4" />}
          >
            {saving ? 'جارٍ الحفظ...' : 'حفظ قواعد الاحتفاظ'}
          </Button>
        )}
      </div>
    </div>
  );
};

export default RetentionTab;
