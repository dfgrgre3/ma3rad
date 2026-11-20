import React from 'react';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import type { PlatformSupportTicket, PlatformTenant } from '../../../services/domains/platform/platformTypes';
import { inputClass } from '../components/PlatformUI';

interface NewTicketModalProps {
  open: boolean;
  onClose: () => void;
  tenants: PlatformTenant[];
  tenantId: string;
  setTenantId: (v: string) => void;
  subject: string;
  setSubject: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  priority: PlatformSupportTicket['priority'];
  setPriority: (v: PlatformSupportTicket['priority']) => void;
  assignedTo: string;
  setAssignedTo: (v: string) => void;
  canManageSupport: boolean;
  onSubmit: () => void;
}

export const NewTicketModal: React.FC<NewTicketModalProps> = ({
  open,
  onClose,
  tenants,
  tenantId,
  setTenantId,
  subject,
  setSubject,
  description,
  setDescription,
  priority,
  setPriority,
  assignedTo,
  setAssignedTo,
  canManageSupport,
  onSubmit,
}) => (
  <Modal
    open={open}
    onClose={onClose}
    title="إنشاء تذكرة دعم جديدة"
  >
    <div className="space-y-3.5 text-right">
      <div>
        <label className="block text-xs font-semibold text-muted mb-1">العميل / المتجر *</label>
        <select
          value={tenantId}
          onChange={(e) => setTenantId(e.target.value)}
          className={inputClass}
        >
          <option value="">اختر العميل...</option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.id})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-semibold text-muted mb-1">عنوان التذكرة *</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="مثال: مشكلة في طباعة الفاتورة..."
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-muted mb-1">الأولوية</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as PlatformSupportTicket['priority'])}
            className={inputClass}
          >
            <option value="LOW">منخفضة (SLA: 48h)</option>
            <option value="MEDIUM">متوسطة (SLA: 24h)</option>
            <option value="HIGH">مرتفعة (SLA: 8h)</option>
            <option value="URGENT">عاجلة (SLA: 2h)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted mb-1">الموظف المسؤول</label>
          <input
            type="text"
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            placeholder="اسم الموظف المكلّف"
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-muted mb-1">وصف المشكلة</label>
        <textarea
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="اشرح المشكلة وخطوات إعادة الإنتاج..."
          className={inputClass}
        />
      </div>

      <div className="flex justify-end gap-2 pt-3 border-t border-line-strong">
        <Button variant="secondary" size="sm" onClick={onClose}>
          إلغاء
        </Button>
        <Button size="sm" onClick={onSubmit} disabled={!canManageSupport}>
          إنشاء التذكرة
        </Button>
      </div>
    </div>
  </Modal>
);
