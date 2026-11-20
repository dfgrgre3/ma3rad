import React from 'react';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Field, inputClass } from '../components/PlatformUI';

interface BranchModalProps {
  open: boolean;
  onClose: () => void;
  branchForm: { code: string; name: string; city: string; phone: string; seatsLimit: number; devicesLimit: number; isMain: boolean };
  setBranchForm: React.Dispatch<React.SetStateAction<{ code: string; name: string; city: string; phone: string; seatsLimit: number; devicesLimit: number; isMain: boolean }>>;
  working: boolean;
  canManageTenants: boolean;
  saveBranch: () => void;
}

export const BranchModal: React.FC<BranchModalProps> = ({
  open,
  onClose,
  branchForm,
  setBranchForm,
  working,
  canManageTenants,
  saveBranch,
}) => (
      <Modal
        open={open}
        onClose={onClose}
        title="إضافة فرع للعميل"
        description="الفروع تُحتسب ضمن حد الفروع المسموح للباقة."
        size="md"
        busy={working}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={working}>إلغاء</Button>
            <Button variant="primary" onClick={saveBranch} loading={working} disabled={!canManageTenants}>إضافة الفرع</Button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="كود الفرع" required>
            <input className={inputClass} dir="ltr" value={branchForm.code} onChange={(e) => setBranchForm({ ...branchForm, code: e.target.value })} />
          </Field>
          <Field label="اسم الفرع" required>
            <input className={inputClass} value={branchForm.name} onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })} />
          </Field>
          <Field label="المدينة">
            <input className={inputClass} value={branchForm.city} onChange={(e) => setBranchForm({ ...branchForm, city: e.target.value })} />
          </Field>
          <Field label="الهاتف">
            <input className={inputClass} dir="ltr" value={branchForm.phone} onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })} />
          </Field>
          <Field label="حد المقاعد">
            <input type="number" min={1} className={inputClass} value={branchForm.seatsLimit} onChange={(e) => setBranchForm({ ...branchForm, seatsLimit: Number(e.target.value) })} />
          </Field>
          <Field label="حد الأجهزة">
            <input type="number" min={1} className={inputClass} value={branchForm.devicesLimit} onChange={(e) => setBranchForm({ ...branchForm, devicesLimit: Number(e.target.value) })} />
          </Field>
          <label className="flex items-center gap-2 text-[12px] font-semibold text-ink sm:col-span-2">
            <input type="checkbox" checked={branchForm.isMain} onChange={(e) => setBranchForm({ ...branchForm, isMain: e.target.checked })} />
            الفرع الرئيسي للعميل
          </label>
        </div>
      </Modal>
);
