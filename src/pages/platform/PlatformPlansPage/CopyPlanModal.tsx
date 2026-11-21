import React from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { useToast } from '../../../components/ui/Toast';
import { Field, inputClass } from '../components/PlatformUI';
import { copyPlan } from './planData';
import type { PlatformPlan } from '../../../services/domains/platform/platformTypes';

interface Props {
  open: boolean;
  source: PlatformPlan | null;
  onClose: () => void;
  onCopied: () => void;
}

export const CopyPlanModal: React.FC<Props> = ({ open, source, onClose, onCopied }) => {
  const toast = useToast();
  const [code, setCode] = React.useState('');
  const [name, setName] = React.useState('');
  const [effectiveFrom, setEffectiveFrom] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open || !source) return;
    setCode(`${source.code}_COPY`.slice(0, 20));
    setName(`${source.name} (نسخة)`);
    setEffectiveFrom('');
  }, [open, source]);

  const handleCopy = async () => {
    if (!source) return;
    if (!code.trim() || !name.trim()) {
      toast.warning('رمز الخطة الجديدة واسمها مطلوبان');
      return;
    }
    if (!/^[A-Z0-9_]+$/.test(code.trim())) {
      toast.error('رمز الخطة يجب أن يحتوي على أحرف إنجليزية كبيرة وأرقام و_ فقط');
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      const result = await copyPlan(source.id, {
        code: code.trim(),
        name: name.trim(),
        effectiveFrom: effectiveFrom || undefined,
      });
      toast.success('تم نسخ الخطة', `${result.copiedRules} قاعدة ترقية نُسخت أيضاً.`);
      onCopied();
      onClose();
    } catch (err) {
      toast.error('تعذر نسخ الخطة', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => { if (!saving) onClose(); }}
      busy={saving}
      size="md"
      title="نسخ خطة"
      description={source ? `سيتم نسخ «${source.name}» بكامل حدودها ووحداتها ومزاياها.` : undefined}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>إلغاء</Button>
          <Button onClick={() => void handleCopy()} loading={saving}>نسخ الخطة</Button>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="رمز الخطة الجديدة" required hint="أحرف إنجليزية وأرقام و_ فقط">
          <input dir="ltr" className={inputClass} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        </Field>
        <Field label="اسم الخطة الجديدة" required>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="تاريخ السريان (اختياري)" className="sm:col-span-2" hint="لسجل الإصدارات — اتركه فارغاً لتاريخ اليوم">
          <input type="date" className={inputClass} value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
};

export default CopyPlanModal;
