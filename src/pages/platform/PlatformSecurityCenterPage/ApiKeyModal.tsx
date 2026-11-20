import React from 'react';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { inputClass } from '../components/PlatformUI';
import type { PlatformTenant } from '../../../services/domains/platform/platformTypes';
import type { ApiKeyFormState } from './constants';

interface ApiKeyModalProps {
  open: boolean;
  onClose: () => void;
  form: ApiKeyFormState;
  setForm: React.Dispatch<React.SetStateAction<ApiKeyFormState>>;
  tenants: PlatformTenant[];
  canManageSecurity: boolean;
  onSubmit: () => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ open, onClose, form, setForm, tenants, canManageSecurity, onSubmit }) => (
  <Modal
    open={open}
    onClose={onClose}
    title="إنشاء مفتاح API تجاري مركزي"
  >
    <div className="space-y-3.5 text-right">
      <div>
        <label className="block text-xs font-semibold text-muted mb-1">اسم المفتاح / الوصف *</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="مثلاً: مفتاح الربط مع متجر Shopify أو نظام المحاسبة الخارجي"
          className={inputClass}
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-muted mb-1">العميل المرتبط (المستأجر) *</label>
        <select
          value={form.tenantId}
          onChange={(e) => setForm({ ...form, tenantId: e.target.value })}
          className={inputClass}
        >
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.code})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-semibold text-muted mb-1">نطاقات الصلاحية (Scopes)</label>
        <div className="grid grid-cols-2 gap-2 text-xs text-muted mt-1">
          {[
            { id: 'read', label: 'قراءة البيانات (read)' },
            { id: 'write', label: 'كتابة وتعديل (write)' },
            { id: 'invoices', label: 'الفواتير والمدفوعات (invoices)' },
            { id: 'products', label: 'الكتالوج والمنتجات (products)' },
            { id: 'webhooks', label: 'إدارة Webhooks' },
            { id: 'admin', label: 'تحكم إداري كامل (admin)' },
          ].map((s) => {
            const checked = form.scopes.includes(s.id);
            return (
              <label key={s.id} className="flex items-center gap-2 cursor-pointer bg-primary/40 p-2 rounded border border-line-strong">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setForm({ ...form, scopes: [...form.scopes, s.id] });
                    } else {
                      setForm({ ...form, scopes: form.scopes.filter((sc) => sc !== s.id) });
                    }
                  }}
                  className="rounded border-line-strong text-primary focus:ring-primary"
                />
                <span>{s.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-muted mb-1">تاريخ انتهاء الصلاحية (اختياري)</label>
        <input
          type="datetime-local"
          value={form.expiresAt}
          onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
          className={inputClass}
        />
        <span className="text-[10px] text-muted mt-0.5 block">اتركه فارغاً ليكون المفتاح دائماً وغير مقيد بوقت انتهاء.</span>
      </div>

      <div className="flex justify-end gap-2 pt-3 border-t border-line-strong">
        <Button variant="secondary" size="sm" onClick={onClose}>
          إلغاء
        </Button>
        <Button size="sm" onClick={onSubmit} disabled={!canManageSecurity}>
          إنشاء المفتاح الآن
        </Button>
      </div>
    </div>
  </Modal>
);
