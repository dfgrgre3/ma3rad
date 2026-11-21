import React from 'react';
import { Check, Copy, KeyRound, Plus, Trash2, Webhook } from 'lucide-react';
import { centralPlatformClient } from '../../../services/domains/platform/CentralPlatformClient';
import type { PlatformTenant } from '../../../services/domains/platform/platformTypes';
import { Button } from '../../../components/ui/Button';
import { EmptyState, StatusBadge, Field, formatDateTime, inputClass } from '../components/PlatformUI';
import { useToast } from '../../../components/ui/Toast';

interface ApiKeyRow {
  id: string;
  name: string;
  prefix?: string | null;
  scopes?: string[];
  isActive?: boolean;
  lastUsedAt?: string | null;
  expiresAt?: string | null;
  createdAt?: string;
  revokedAt?: string | null;
}

interface CreatedKey extends ApiKeyRow {
  key?: string;
}

const API_BASE_NOTE = '/api/v1/tenant/v1';

/**
 * «API العميل» — issue/revoke tenant-scoped API keys that authenticate
 * against the customer-facing read-only API (/api/v1/tenant/v1/*).
 */
export const TenantApiTab: React.FC<{
  tenant: PlatformTenant;
  canManageTenants: boolean;
}> = ({ tenant, canManageTenants }) => {
  const toast = useToast();
  const [keys, setKeys] = React.useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [name, setName] = React.useState('');
  const [expiresInDays, setExpiresInDays] = React.useState('');
  const [creating, setCreating] = React.useState(false);
  const [created, setCreated] = React.useState<CreatedKey | null>(null);
  const [copied, setCopied] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await centralPlatformClient.listTenantApiKeys(tenant.id);
      setKeys(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'تعذر تحميل مفاتيح API.');
    } finally {
      setLoading(false);
    }
  }, [tenant.id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error('تعذر النسخ إلى الحافظة');
    }
  };

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('اسم المفتاح مطلوب');
      return;
    }
    const days = expiresInDays.trim() === '' ? null : Number(expiresInDays);
    if (days != null && (!Number.isFinite(days) || days <= 0)) {
      toast.error('مدة الصلاحية يجب أن تكون رقمًا موجبًا بالأيام');
      return;
    }
    setCreating(true);
    try {
      const result = (await centralPlatformClient.createTenantApiKey(tenant.id, {
        name: trimmed,
        scopes: ['read'],
        expiresInDays: days,
      })) as CreatedKey;
      setCreated(result);
      setName('');
      setExpiresInDays('');
      toast.success('تم إنشاء مفتاح API', 'انسخ المفتاح الآن — لن يظهر مرة أخرى');
      await load();
    } catch (err) {
      toast.error('تعذر إنشاء المفتاح', err instanceof Error ? err.message : undefined);
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (key: ApiKeyRow) => {
    if (!window.confirm(`إلغاء المفتاح "${key.name}"؟ سيفقد فورًا الوصول لـ ${API_BASE_NOTE}.`)) return;
    try {
      await centralPlatformClient.revokeTenantApiKey(tenant.id, key.id);
      toast.success('تم إلغاء المفتاح', key.name);
      if (created?.id === key.id) setCreated(null);
      await load();
    } catch (err) {
      toast.error('تعذر إلغاء المفتاح', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
        <p className="flex items-center gap-1.5 text-[13px] font-black text-ink">
          <Webhook className="h-4 w-4 text-primary" />
          API العميل — وصول قراءة فقط لبيانات هذا العميل
        </p>
        <p className="mt-1 text-[11px] leading-5 text-muted">
          كل مفتاح مقيد بهذا العميل فقط ويعمل على <code className="font-mono" dir="ltr">{API_BASE_NOTE}</code>:
          {' '}/me · /subscription · /licenses · /usage · /devices · /entitlements — بصيغة <code className="font-mono" dir="ltr">Authorization: Bearer pk_...</code>
        </p>
      </div>

      {created?.key && (
        <div className="rounded-2xl border border-success-border bg-success-soft p-4">
          <p className="text-[12px] font-black text-success">المفتاح الجديد — انسخه الآن، لن يُعرض مرة أخرى:</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-surface px-3 py-2 font-mono text-[11px] text-ink" dir="ltr">
              {created.key}
            </code>
            <Button variant="secondary" size="sm" onClick={() => void copy(created.key!, 'المفتاح')} leadingIcon={copied === 'المفتاح' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}>
              نسخ
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setCreated(null)}>إخفاء</Button>
          </div>
        </div>
      )}

      {canManageTenants && (
        <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <Field label="اسم المفتاح" className="w-64">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="مثال: تكامل المتجر"
              className={inputClass}
            />
          </Field>
          <Field label="صلاحية بالأيام (اختياري)" className="w-40">
            <input
              value={expiresInDays}
              onChange={(event) => setExpiresInDays(event.target.value.replace(/[^0-9]/g, ''))}
              placeholder="بلا انتهاء"
              dir="ltr"
              className={inputClass}
            />
          </Field>
          <Button variant="primary" size="sm" onClick={create} loading={creating} disabled={!name.trim()} leadingIcon={<Plus className="h-3.5 w-3.5" />}>
            إنشاء مفتاح
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-3 py-10 text-sm font-semibold text-muted">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-success" />
          جارٍ تحميل المفاتيح...
        </div>
      ) : loadError ? (
        <div role="alert" className="rounded-xl border border-danger-border bg-danger-soft px-4 py-3 text-[12px] font-semibold text-danger">
          {loadError}
          <button type="button" onClick={() => void load()} className="mr-3 text-success hover:underline">إعادة المحاولة</button>
        </div>
      ) : keys.length === 0 ? (
        <EmptyState icon={<KeyRound className="h-5 w-5" />} title="لا توجد مفاتيح API" description="أنشئ أول مفتاح للعميل ليمكّنه من قراءة بياناته عبر الـ API." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
          <table className="w-full text-[11.5px]">
            <thead className="bg-surface-muted text-[10px] font-bold text-muted">
              <tr>
                <th className="px-4 py-2.5 text-right">الاسم</th>
                <th className="px-4 py-2.5 text-right">المفتاح</th>
                <th className="px-4 py-2.5 text-right">الصلاحيات</th>
                <th className="px-4 py-2.5 text-right">آخر استخدام</th>
                <th className="px-4 py-2.5 text-right">الانتهاء</th>
                <th className="px-4 py-2.5 text-right">الحالة</th>
                {canManageTenants && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {keys.map((key) => (
                <tr key={key.id} className="hover:bg-surface-muted/50">
                  <td className="px-4 py-2.5 font-bold text-ink">{key.name}</td>
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-[10.5px] text-muted" dir="ltr">{key.prefix ?? 'pk_…'}••••</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-[10px] text-ink-secondary" dir="ltr">{(key.scopes ?? []).join(', ') || 'read'}</span>
                  </td>
                  <td className="px-4 py-2.5 text-muted">{formatDateTime(key.lastUsedAt)}</td>
                  <td className="px-4 py-2.5 text-muted">{key.expiresAt ? formatDateTime(key.expiresAt) : '—'}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge value={key.isActive ? 'ACTIVE' : 'REVOKED'} label={key.isActive ? 'نشط' : 'ملغى'} />
                  </td>
                  {canManageTenants && (
                    <td className="px-4 py-2.5 text-center">
                      {key.isActive && (
                        <button
                          type="button"
                          onClick={() => void revoke(key)}
                          className="rounded-lg p-1.5 text-danger/70 transition hover:bg-danger-soft hover:text-danger"
                          aria-label={`إلغاء ${key.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10.5px] text-muted">
        المفاتيح تُخزَّن مجزّأة (SHA-256) ولا يمكن استرجاعها بعد الإنشاء. الإلغاء يسري فورًا على كل الطلبات الجديدة.
      </p>
    </div>
  );
};

export default TenantApiTab;
