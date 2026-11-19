import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import type { PlatformStaff } from '../../../services/domains/platform/platformTypes';
import { inputClass } from '../components/PlatformUI';

interface ResetPasswordModalProps {
  target: PlatformStaff | null;
  onClose: () => void;
  password: string;
  setPassword: (v: string) => void;
  confirm: string;
  setConfirm: (v: string) => void;
  onSubmit: () => void;
}

export const ResetPasswordModal: React.FC<ResetPasswordModalProps> = ({
  target,
  onClose,
  password,
  setPassword,
  confirm,
  setConfirm,
  onSubmit,
}) => (
  <Modal open={Boolean(target)} onClose={onClose} title={`إعادة تعيين كلمة المرور: ${target?.fullName ?? ''}`} size="sm">
    <div className="space-y-3.5 text-right">
      <p className="text-[11px] text-amber-400 flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> ستُنهى كل جلسات الموظف فوراً، وسيُفرض عليه تغيير كلمة المرور عند أول دخول.</p>
      <div>
        <label className="block text-xs font-semibold text-slate-300 mb-1">كلمة المرور الجديدة *</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8 أحرف على الأقل" className={inputClass} autoComplete="new-password" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-300 mb-1">تأكيد كلمة المرور *</label>
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="أعد إدخال كلمة المرور" className={inputClass} autoComplete="new-password" />
      </div>
      <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
        <Button variant="secondary" size="sm" onClick={onClose}>إلغاء</Button>
        <Button size="sm" onClick={onSubmit}>إعادة التعيين</Button>
      </div>
    </div>
  </Modal>
);
