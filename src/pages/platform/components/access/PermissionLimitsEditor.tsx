import React from 'react';
import { Plus, Save, ShieldOff, Trash2 } from 'lucide-react';
import { centralPlatformClient } from '../../../../services/domains/platform/CentralPlatformClient';
import type { TenantPermissionLimit } from '../../../../services/domains/platform/PlatformAdminApiClient';
import { GRANULAR_PERMISSIONS } from '../../../../config/permissionMatrix';
import { Button } from '../../../../components/ui/Button';
import { EmptyState, Toggle, inputClass } from '../PlatformUI';
import { useToast } from '../../../../components/ui/Toast';

interface LimitRow {
  permissionCode: string;
  maxAmount: string;
  costVisible: boolean | null;
  profitVisible: boolean | null;
  disabled: boolean;
}

const toRow = (limit: TenantPermissionLimit): LimitRow => ({
  permissionCode: limit.permissionCode,
  maxAmount: limit.maxAmount == null ? '' : String(limit.maxAmount),
  costVisible: limit.costVisible == null ? null : Boolean(Number(limit.costVisible)),
  profitVisible: limit.profitVisible == null ? null : Boolean(Number(limit.profitVisible)),
  disabled: Boolean(Number(limit.disabled)),
});

const emptyRow = (): LimitRow => ({
  permissionCode: '',
  maxAmount: '',
  costVisible: null,
  profitVisible: null,
  disabled: false,
});

const triState = (value: boolean | null): string => (value === null ? 'inherit' : value ? 'yes' : 'no');

/**
 * Editor for tenant_permission_limits — platform-imposed ceilings that
 * restrict (never expand) what the tenant's own roles may do.
 * tenantId '' edits the global defaults that apply to every tenant.
 */
export const PermissionLimitsEditor: React.FC<{
  tenantId: string;
  scopeLabel?: string;
  canManage: boolean;
}> = ({ tenantId, scopeLabel, canManage }) => {
  const toast = useToast();
  const [rows, setRows] = React.useState<LimitRow[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [codeFilter, setCodeFilter] = React.useState('');

  const load = React.useCallback(async () => {
    setLoaded(false);
    try {
      // Effective view = global ('' tenant) rows overridden by this tenant's rows.
      const [globalRows, tenantRows] = await Promise.all([
        centralPlatformClient.getPermissionLimits(''),
        tenantId ? centralPlatformClient.getPermissionLimits(tenantId) : Promise.resolve([] as TenantPermissionLimit[]),
      ]);
      const merged = new Map<string, TenantPermissionLimit>();
      for (const row of globalRows) merged.set(row.permissionCode, row);
      for (const row of tenantRows) merged.set(row.permissionCode, row);
      setRows([...merged.values()].sort((a, b) => a.permissionCode.localeCompare(b.permissionCode)).map(toRow));
    } catch (err) {
      toast.error('تعذر تحميل حدود الصلاحيات', err instanceof Error ? err.message : undefined);
    } finally {
      setLoaded(true);
    }
  }, [tenantId, toast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const update = (index: number, patch: Partial<LimitRow>) => {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const permissionOptions = React.useMemo(() => {
    const term = codeFilter.trim().toLowerCase();
    const all = GRANULAR_PERMISSIONS.map((p) => p.code);
    const existing = new Set(rows.map((r) => r.permissionCode));
    const candidates = term ? all.filter((code) => code.toLowerCase().includes(term)) : all;
    return candidates.filter((code) => !existing.has(code));
  }, [codeFilter, rows]);

  const addRow = (code: string) => {
    if (!code || rows.some((r) => r.permissionCode === code)) return;
    setRows((current) => [...current, { ...emptyRow(), permissionCode: code }]);
    setCodeFilter('');
  };

  const save = async () => {
    const invalid = rows.find((r) => !r.permissionCode.trim());
    if (invalid) {
      toast.error('كل صف يجب أن يحمل كود صلاحية');
      return;
    }
    const amountInvalid = rows.find((r) => r.maxAmount.trim() !== '' && (!Number.isFinite(Number(r.maxAmount)) || Number(r.maxAmount) < 0));
    if (amountInvalid) {
      toast.error(`قيمة الحد الأقصى غير صالحة: ${amountInvalid.permissionCode}`);
      return;
    }
    setSaving(true);
    try {
      const limits = rows.map((row) => ({
        permissionCode: row.permissionCode.trim(),
        maxAmount: row.maxAmount.trim() === '' ? null : Number(row.maxAmount),
        costVisible: row.costVisible === null ? null : row.costVisible,
        profitVisible: row.profitVisible === null ? null : row.profitVisible,
        disabled: row.disabled,
      }));
      await centralPlatformClient.setPermissionLimits(tenantId, limits);
      toast.success('تم حفظ حدود الصلاحيات', scopeLabel);
      await load();
    } catch (err) {
      toast.error('تعذر حفظ حدود الصلاحيات', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-line bg-surface shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <p className="flex items-center gap-1.5 text-[13px] font-black text-ink">
            <ShieldOff className="h-4 w-4 text-warning" />
            حدود الصلاحيات {scopeLabel ? `— ${scopeLabel}` : ''}
          </p>
          <p className="mt-0.5 text-[10.5px] text-muted">
            سقوف يفرضها المنصة ولا يمكن للعميل تجاوزها: حد أقصى للمبالغ، إخفاء التكلفة/الربح، أو تعطيل صلاحية كليًا. الصف الفارغ ( inherit ) يعني «بدون حد على هذا البُعد».
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={save} loading={saving} disabled={!canManage || !loaded} leadingIcon={<Save className="h-3.5 w-3.5" />}>
          حفظ الحدود
        </Button>
      </div>

      {!loaded ? (
        <div className="flex items-center justify-center gap-3 py-10 text-sm font-semibold text-muted">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-success" />
          جارٍ التحميل...
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<ShieldOff className="h-5 w-5" />}
          title="لا توجد حدود مخصصة"
          description="أضف صلاحية من القائمة أدناه لتقييدها لهذا النطاق — بدون حدود يرث العميل صلاحياته المحلية كاملة."
        />
      ) : (
        <div className="max-h-[480px] overflow-auto">
          <table className="w-full min-w-[760px] text-[11px]">
            <thead className="sticky top-0 bg-surface-muted text-[10px] font-bold text-muted">
              <tr>
                <th className="px-3 py-2 text-right">الصلاحية</th>
                <th className="px-3 py-2 text-right">الحد الأقصى للمبلغ</th>
                <th className="px-3 py-2 text-center">التكلفة</th>
                <th className="px-3 py-2 text-center">الربح</th>
                <th className="px-3 py-2 text-center">معطلة</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {rows.map((row, index) => (
                <tr key={`${row.permissionCode}-${index}`} className="hover:bg-surface-muted/50">
                  <td className="px-3 py-1.5">
                    <span className="font-mono text-[10.5px] text-ink" dir="ltr">{row.permissionCode}</span>
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      value={row.maxAmount}
                      onChange={(event) => update(index, { maxAmount: event.target.value })}
                      placeholder="بدون حد"
                      dir="ltr"
                      disabled={!canManage}
                      className={`${inputClass} w-28 py-1 text-center font-mono`}
                    />
                  </td>
                  {(['costVisible', 'profitVisible'] as const).map((key) => (
                    <td key={key} className="px-3 py-1.5 text-center">
                      <select
                        value={triState(row[key])}
                        onChange={(event) => update(index, { [key]: event.target.value === 'inherit' ? null : event.target.value === 'yes' })}
                        disabled={!canManage}
                        className={`${inputClass} w-24 py-1 text-center`}
                      >
                        <option value="inherit">وراثة</option>
                        <option value="yes">إظهار</option>
                        <option value="no">إخفاء</option>
                      </select>
                    </td>
                  ))}
                  <td className="px-3 py-1.5 text-center">
                    <Toggle
                      checked={row.disabled}
                      onChange={(next) => update(index, { disabled: next })}
                      disabled={!canManage}
                      label={`تعطيل ${row.permissionCode}`}
                    />
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <button
                      type="button"
                      onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                      disabled={!canManage}
                      className="rounded-lg p-1.5 text-danger/70 transition hover:bg-danger-soft hover:text-danger disabled:opacity-40"
                      aria-label="حذف الحد"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-line px-4 py-3">
        <input
          value={codeFilter}
          onChange={(event) => setCodeFilter(event.target.value)}
          placeholder="أضف صلاحية بالبحث عن كودها..."
          dir="ltr"
          className={`${inputClass} w-72 py-1.5 font-mono text-[11px]`}
        />
        <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto">
          {permissionOptions.slice(0, 40).map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => addRow(code)}
              disabled={!canManage}
              className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-sunken px-2 py-0.5 font-mono text-[9.5px] text-ink-secondary transition hover:border-primary/40 hover:text-primary disabled:opacity-40"
              dir="ltr"
            >
              <Plus className="h-2.5 w-2.5" /> {code}
            </button>
          ))}
          {permissionOptions.length === 0 && codeFilter && (
            <span className="text-[10.5px] text-muted">لا توجد صلاحيات مطابقة أو مضافة بالفعل.</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default PermissionLimitsEditor;
