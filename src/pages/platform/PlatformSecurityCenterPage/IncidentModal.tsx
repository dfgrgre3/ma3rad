import React from 'react';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { inputClass } from '../components/PlatformUI';
import type { IncidentFormState } from './constants';

interface IncidentModalProps {
  open: boolean;
  onClose: () => void;
  form: IncidentFormState;
  setForm: React.Dispatch<React.SetStateAction<IncidentFormState>>;
  canManageSecurity: boolean;
  onSubmit: () => void;
}

export const IncidentModal: React.FC<IncidentModalProps> = ({ open, onClose, form, setForm, canManageSecurity, onSubmit }) => (
  <Modal
    open={open}
    onClose={onClose}
    title="تسجيل بلاغ أمني جديد"
  >
    <div className="space-y-3.5 text-right">
      <div>
        <label className="block text-xs font-semibold text-muted mb-1">عنوان البلاغ الأمني *</label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="مثلاً: محاولات هجوم Brute Force مكثفة..."
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-muted mb-1">مستوى الخطورة</label>
          <select
            value={form.severity}
            onChange={(e) => setForm({ ...form, severity: e.target.value as any })}
            className={inputClass}
          >
            <option value="CRITICAL">حرجة (Critical)</option>
            <option value="HIGH">عالية (High)</option>
            <option value="MEDIUM">متوسطة (Medium)</option>
            <option value="LOW">منخفضة (Low)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted mb-1">مصدر IP المشتبه به</label>
          <input
            type="text"
            value={form.sourceIp}
            onChange={(e) => setForm({ ...form, sourceIp: e.target.value })}
            placeholder="192.168.1.1"
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-muted mb-1">تفاصيل وملاحظات الحادث</label>
        <textarea
          rows={3}
          value={form.details}
          onChange={(e) => setForm({ ...form, details: e.target.value })}
          className={inputClass}
        />
      </div>

      <div className="flex justify-end gap-2 pt-3 border-t border-line-strong">
        <Button variant="secondary" size="sm" onClick={onClose}>
          إلغاء
        </Button>
        <Button size="sm" onClick={onSubmit} disabled={!canManageSecurity}>
          تسجيل البلاغ
        </Button>
      </div>
    </div>
  </Modal>
);
