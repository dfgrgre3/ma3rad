import React from 'react';
import { FileCheck } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Field, Toggle, inputClass } from '../components/PlatformUI';
import type { PlatformRelease } from '../../../services/domains/platform/platformTypes';
import { CHANNEL_LABELS, RELEASE_STATUS_LABELS, type ReleaseFormState } from './constants';

interface ReleaseModalProps {
  open: boolean;
  onClose: () => void;
  form: ReleaseFormState;
  setForm: React.Dispatch<React.SetStateAction<ReleaseFormState>>;
  saving: boolean;
  canManageProduct: boolean;
  onSave: () => void;
}

export const ReleaseModal: React.FC<ReleaseModalProps> = ({
  open,
  onClose,
  form,
  setForm,
  saving,
  canManageProduct,
  onSave,
}) => (
  <Modal
    open={open}
    onClose={onClose}
    title={form.id ? `تعديل إصدار v${form.version}` : 'إصدار جديد وحزمة تحديث'}
    size="lg"
    busy={saving}
    footer={
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          إلغاء
        </Button>
        <Button variant="primary" onClick={onSave} loading={saving} disabled={!canManageProduct}>
          حفظ الإصدار
        </Button>
      </div>
    }
  >
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="رقم الإصدار" required hint="مثال: 2.5.0">
        <input dir="ltr" className={inputClass} value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} />
      </Field>
      <Field label="القناة (Channel)">
        <select className={inputClass} value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value as PlatformRelease['channel'] })}>
          {Object.entries(CHANNEL_LABELS).map(([val, lbl]) => (
            <option key={val} value={val}>
              {lbl}
            </option>
          ))}
        </select>
      </Field>
      <Field label="الحالة (Status)">
        <select className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
          {Object.entries(RELEASE_STATUS_LABELS).map(([val, lbl]) => (
            <option key={val} value={val}>
              {lbl}
            </option>
          ))}
        </select>
      </Field>

      <Field label="النسخة الدنيا المطلوبة (Min Version)" hint="تمنع التخطي إذا كانت النسخة أقدم">
        <input dir="ltr" placeholder="مثال: 2.0.0" className={inputClass} value={form.minVersion} onChange={(e) => setForm({ ...form, minVersion: e.target.value })} />
      </Field>
      <Field label="بيئة النشر (Staging Group)">
        <select className={inputClass} value={form.stagingGroup} onChange={(e) => setForm({ ...form, stagingGroup: e.target.value })}>
          <option value="PRODUCTION">الإنتاج الكامل (Production)</option>
          <option value="CANARY">إطلاق تدريجي (Canary 10%)</option>
          <option value="BETA_TESTERS">مختبرو بيتا (Beta Testers)</option>
          <option value="INTERNAL">فريق العمل الداخلي (Internal)</option>
        </select>
      </Field>
      <Field label="تاريخ الإصدار">
        <input type="date" className={inputClass} value={form.releasedAt} onChange={(e) => setForm({ ...form, releasedAt: e.target.value })} />
      </Field>

      {/* Package details */}
      <div className="sm:col-span-3 rounded-xl border border-line bg-surface-muted/50 p-3 space-y-3">
        <p className="text-[12px] font-bold text-ink flex items-center gap-1.5">
          <FileCheck className="h-4 w-4 text-primary" /> بيانات ملف التثبيت والتوقيع والـ Checksum
        </p>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Field label="رابط تحميل الحزمة (URL)">
            <input dir="ltr" placeholder="https://releases.ceramisys.com/v2.5.0.exe" className={inputClass} value={form.fileUrl} onChange={(e) => setForm({ ...form, fileUrl: e.target.value })} />
          </Field>
          <Field label="اسم الملف (File Name)">
            <input dir="ltr" placeholder="Ceramisys-Setup-2.5.0.exe" className={inputClass} value={form.fileName} onChange={(e) => setForm({ ...form, fileName: e.target.value })} />
          </Field>
          <Field label="بصمة التجزئة SHA-256 Checksum" hint="للتحقق من سلامة الملف عند التنزيل">
            <input dir="ltr" placeholder="e.g. 5d41402abc4b2a76b9719d911017c592..." className={inputClass} value={form.checksumSha256} onChange={(e) => setForm({ ...form, checksumSha256: e.target.value })} />
          </Field>
          <Field label="التوقيع الرقمي للحزمة (Digital Signature)">
            <input dir="ltr" placeholder="ceramisys-signed-pkg-..." className={inputClass} value={form.packageSignature} onChange={(e) => setForm({ ...form, packageSignature: e.target.value })} />
          </Field>
          <Field label="حجم الملف بالبايت (Size in Bytes)">
            <input type="number" dir="ltr" placeholder="e.g. 85000000" className={inputClass} value={form.fileSize} onChange={(e) => setForm({ ...form, fileSize: e.target.value })} />
          </Field>
          <Field label="إصدار التراجع الآمن في الطوارئ (Rollback Target)">
            <input dir="ltr" placeholder="مثال: 2.4.9" className={inputClass} value={form.rollbackVersion} onChange={(e) => setForm({ ...form, rollbackVersion: e.target.value })} />
          </Field>
        </div>
      </div>

      <div className="sm:col-span-3 flex items-center justify-between rounded-xl border border-line px-3 py-2 bg-surface">
        <div>
          <p className="text-[12px] font-bold text-ink">تحديث إلزامي (Mandatory Enforcement)</p>
          <p className="text-[10px] text-muted">منع متابعة العمل على النسخ السابقة حتى إتمام ترقية العميل.</p>
        </div>
        <Toggle checked={form.isMandatory} onChange={(val) => setForm({ ...form, isMandatory: val })} label="إلزامي" />
      </div>

      <Field label="سجل التغييرات الكامل (Changelog)" className="sm:col-span-3">
        <textarea rows={3} placeholder="ما الجديد في هذا الإصدار..." className={inputClass} value={form.changelog} onChange={(e) => setForm({ ...form, changelog: e.target.value })} />
      </Field>
      <Field label="ملاحظات داخلية" className="sm:col-span-3">
        <textarea rows={2} className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </Field>
    </div>
  </Modal>
);
