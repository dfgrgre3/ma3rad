import React, { useMemo } from 'react';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import type { PlatformStaff, PlatformStaffDataScope } from '../../../services/domains/platform/platformTypes';
import { inputClass } from '../components/PlatformUI';

interface TenantOption {
  id: string;
  name: string;
  code: string;
}

interface DataScopeModalProps {
  target: PlatformStaff | null;
  onClose: () => void;
  scope: PlatformStaffDataScope;
  setScope: (v: PlatformStaffDataScope) => void;
  scopeTenantIds: string[];
  setScopeTenantIds: React.Dispatch<React.SetStateAction<string[]>>;
  tenantSearch: string;
  setTenantSearch: (v: string) => void;
  tenantOptions: TenantOption[];
  onSave: () => void;
}

export const DataScopeModal: React.FC<DataScopeModalProps> = ({
  target,
  onClose,
  scope,
  setScope,
  scopeTenantIds,
  setScopeTenantIds,
  tenantSearch,
  setTenantSearch,
  tenantOptions,
  onSave,
}) => {
  const filteredTenants = useMemo(() => {
    const term = tenantSearch.trim();
    if (!term) return tenantOptions;
    return tenantOptions.filter((t) => t.name.includes(term) || t.code.toLowerCase().includes(term.toLowerCase()));
  }, [tenantOptions, tenantSearch]);

  return (
    <Modal open={Boolean(target)} onClose={onClose} title={`نطاق البيانات: ${target?.fullName ?? ''}`} size="lg">
      <div className="space-y-3.5 text-right">
        <div className="flex gap-2">
          {(['ALL', 'LIMITED'] as const).map((option) => (
            <button
              key={option}
              onClick={() => setScope(option)}
              className={`flex-1 rounded-xl border px-4 py-3 text-xs font-bold transition-all ${
                scope === option ? 'border-warning bg-warning/10 text-warning' : 'border-line-strong text-muted hover:border-line-strong'
              }`}
            >
              {option === 'ALL' ? 'كل العملاء (الافتراضي)' : 'عملاء محددون'}
            </button>
          ))}
        </div>
        {scope === 'LIMITED' && (
          <>
            <input value={tenantSearch} onChange={(e) => setTenantSearch(e.target.value)} placeholder="ابحث باسم العميل أو الكود..." className={inputClass} />
            <div className="max-h-64 overflow-y-auto rounded-xl border border-line-strong divide-y divide-primary/80">
              {filteredTenants.length === 0 ? (
                <p className="px-4 py-6 text-center text-[11px] text-muted">لا توجد نتائج مطابقة.</p>
              ) : filteredTenants.map((tenant) => {
                const checked = scopeTenantIds.includes(tenant.id);
                return (
                  <label key={tenant.id} className="flex cursor-pointer items-center gap-3 px-4 py-2 hover:bg-primary/30">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setScopeTenantIds((prev) => prev.includes(tenant.id) ? prev.filter((id) => id !== tenant.id) : [...prev, tenant.id])}
                      className="rounded border-line-strong text-warning focus:ring-warning"
                    />
                    <span className="text-xs font-bold text-muted">{tenant.name}</span>
                    <span className="text-[10px] font-mono text-muted" dir="ltr">{tenant.code}</span>
                  </label>
                );
              })}
            </div>
            <p className="text-[10px] text-muted">{scopeTenantIds.length} عميل محدد — لن يرى الموظف أي عميل خارج هذه القائمة (لا في القوائم ولا بالبحث المباشر).</p>
          </>
        )}
        <div className="flex justify-end gap-2 pt-3 border-t border-line-strong">
          <Button variant="secondary" size="sm" onClick={onClose}>إلغاء</Button>
          <Button size="sm" onClick={onSave}>حفظ النطاق</Button>
        </div>
      </div>
    </Modal>
  );
};
