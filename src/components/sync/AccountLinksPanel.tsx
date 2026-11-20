import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTable } from '../ui/DataTable';
import {
  Building2, Copy, Check, KeyRound, Link2, Loader2, Plus, RefreshCw,
  ShieldCheck, ShieldOff, Trash2, Power, PowerOff, X, Search, Lock,
} from 'lucide-react';
import { AccountLinkService } from '../../sync/AccountLinkService';
import { PendingChangeService, type ChangeApprovalMode } from '../../sync/PendingChangeService';
import { BranchAccessService } from '../../services/domains/auth/BranchAccessService';
import { PermissionService } from '../../services/domains/auth/PermissionService';
import type { AccountLinkSummary } from '../../types/sync';
import { useToast } from '../ui/Toast';

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'بانتظار الربط', cls: 'bg-warning-soft text-warning border-warning-border' },
  ACTIVE: { label: 'مرتبط ونشط', cls: 'bg-success-soft text-success border-success-border' },
  DISABLED: { label: 'معطّل', cls: 'bg-surface-sunken text-muted border-line' },
  REVOKED: { label: 'ملغي', cls: 'bg-danger-soft text-danger border-danger-border' },
};

const MODE_OPTIONS: Array<{ value: ChangeApprovalMode; label: string; hint: string }> = [
  { value: 'AUTO', label: 'تلقائي', hint: 'اعتماد التعديلات فقط عندما تكون المزامنة مفعّلة أو يوجد حساب مرتبط.' },
  { value: 'ALWAYS', label: 'دائمًا', hint: 'كل تعديل من حساب غير صاحب النشاط يحتاج اعتمادًا.' },
  { value: 'OFF', label: 'معطّل', hint: 'لا توجد موافقات — تُطبّق تعديلات الفروع مباشرة.' },
];

function formatTimestamp(value?: string | null): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return value;
  }
}

function BranchOptions(): Array<{ id: string; name: string; code: string; isMain: boolean }> {
  try {
    return new BranchAccessService().getSelectableBranches();
  } catch {
    return [];
  }
}

export const AccountLinksPanel: React.FC = () => {
  const toast = useToast();
  const links = useMemo(() => new AccountLinkService(), []);
  const pending = useMemo(() => new PendingChangeService(), []);

  const [items, setItems] = useState<AccountLinkSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [mode, setMode] = useState<ChangeApprovalMode>('AUTO');
  const [issueOpen, setIssueOpen] = useState(false);
  const [permissionsFor, setPermissionsFor] = useState<AccountLinkSummary | null>(null);
  const [credentials, setCredentials] = useState<{ companyName: string; code: string | null; apiToken: string | null } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [activation, setActivation] = useState({ value: '', password: '', useToken: false });
  const [activating, setActivating] = useState(false);

  const branches = useMemo(BranchOptions, []);

  const refresh = useCallback(() => {
    setLoading(true);
    try {
      setItems(links.list());
      setMode(pending.getMode());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تحميل الحسابات المرتبطة.');
    } finally {
      setLoading(false);
    }
  }, [links, pending, toast]);

  useEffect(() => { refresh(); }, [refresh]);

  const copy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error('تعذر النسخ إلى الحافظة.');
    }
  };

  const changeMode = (next: ChangeApprovalMode) => {
    try {
      pending.setMode(next);
      setMode(next);
      toast.success('تم تحديث سياسة اعتماد التعديلات.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تحديث السياسة.');
    }
  };

  const toggleApproval = (link: AccountLinkSummary) => {
    setBusy(link.id);
    try {
      links.setRequiresApproval(link.id, !link.requiresApproval);
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تحديث إعداد الاعتماد.');
    } finally {
      setBusy(null);
    }
  };

  const setEnabled = (link: AccountLinkSummary, enabled: boolean) => {
    setBusy(link.id);
    try {
      if (enabled) links.enable(link.id); else links.disable(link.id);
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تحديث حالة الربط.');
    } finally {
      setBusy(null);
    }
  };

  const revoke = (link: AccountLinkSummary) => {
    if (!window.confirm(`إلغاء ربط «${link.companyName}» نهائيًا؟`)) return;
    setBusy(link.id);
    try {
      links.revoke(link.id);
      refresh();
      toast.success('تم إلغاء الربط.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر إلغاء الربط.');
    } finally {
      setBusy(null);
    }
  };

  const activate = () => {
    if (!activation.value.trim() || !activation.password) {
      toast.error('أدخل بيانات الربط وكلمة السر.');
      return;
    }
    setActivating(true);
    try {
      const link = activation.useToken
        ? links.linkWithApiToken({ apiToken: activation.value, password: activation.password })
        : links.linkWithCode({ code: activation.value, password: activation.password });
      toast.success(`تم ربط «${link.companyName}» بنجاح.`);
      setActivation({ value: '', password: '', useToken: false });
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تفعيل الربط.');
    } finally {
      setActivating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-black text-ink">الحسابات المرتبطة بكود / مفتاح API</h3>
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-primary">
            {items.filter((item) => item.status === 'ACTIVE').length} نشط
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refresh}
            className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[11px] font-bold text-ink hover:bg-surface-muted"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> تحديث
          </button>
          <button
            type="button"
            onClick={() => setIssueOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-white hover:bg-primary"
          >
            <Plus className="h-3.5 w-3.5" /> ربط حساب جديد
          </button>
        </div>
      </div>

      {/* Approval policy */}
      <div className="rounded-2xl border border-line bg-surface p-4">
        <p className="flex items-center gap-1.5 text-[11px] font-bold text-ink">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" /> سياسة اعتماد تعديلات الفروع والحسابات
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => changeMode(option.value)}
              className={`rounded-xl border p-3 text-right transition ${
                mode === option.value
                  ? 'border-primary bg-accent-soft/70'
                  : 'border-line bg-surface hover:border-line-strong'
              }`}
            >
              <span className="block text-xs font-black text-ink">{option.label}</span>
              <span className="mt-1 block text-[10px] text-muted">{option.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Recipient side: activate with a code or API token received from the owner */}
      <div className="rounded-2xl border border-line bg-surface p-4">
        <p className="flex items-center gap-1.5 text-[11px] font-bold text-ink">
          <KeyRound className="h-3.5 w-3.5 text-primary" /> تفعيل ربط بكود أو مفتاح API مستلم
        </p>
        <p className="mt-1 text-[10px] text-muted">
          أدخل الكود أو المفتاح الذي سلّمه لك صاحب النشاط مع كلمة سر الربط.
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
          <input
            value={activation.value}
            onChange={(event) => setActivation({ ...activation, value: event.target.value })}
            placeholder={activation.useToken ? 'lkn_...' : 'LK-XXXXXXXX'}
            className="rounded-xl border border-line bg-surface-muted px-3 py-2 font-mono text-xs"
          />
          <input
            value={activation.password}
            onChange={(event) => setActivation({ ...activation, password: event.target.value })}
            type="password"
            placeholder="كلمة سر الربط"
            className="rounded-xl border border-line bg-surface-muted px-3 py-2 text-xs"
          />
          <button
            type="button"
            onClick={() => setActivation({ ...activation, useToken: !activation.useToken })}
            className="rounded-xl border border-line bg-surface px-3 py-2 text-[11px] font-bold text-ink-secondary hover:bg-surface-muted"
          >
            {activation.useToken ? 'مفتاح API' : 'كود'}
          </button>
          <button
            type="button"
            onClick={activate}
            disabled={activating}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-[11px] font-bold text-white hover:bg-primary disabled:opacity-60"
          >
            {activating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />} تفعيل
          </button>
        </div>
      </div>

      {credentials && (
        <div className="rounded-2xl border border-success-border bg-success-soft/70 p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-black text-success">بيانات ربط «{credentials.companyName}»</p>
              <p className="text-[11px] text-success">
                سلّمها للحساب الآخر مرة واحدة فقط — لا يمكن استرجاع كلمة السر لاحقًا.
              </p>
            </div>
            <button type="button" onClick={() => setCredentials(null)} className="text-success hover:text-success">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {credentials.code && (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-success-border bg-surface px-3 py-2">
                <span className="text-[10px] font-bold text-muted">كود الربط</span>
                <span className="font-mono text-sm font-black tracking-wider text-ink">{credentials.code}</span>
                <button type="button" onClick={() => copy(credentials.code!, 'code')} className="rounded-lg p-1 text-muted hover:bg-surface-sunken">
                  {copied === 'code' ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            )}
            {credentials.apiToken && (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-success-border bg-surface px-3 py-2">
                <span className="text-[10px] font-bold text-muted">مفتاح API</span>
                <span className="truncate font-mono text-[11px] font-bold tracking-wider text-ink">{credentials.apiToken}</span>
                <button type="button" onClick={() => copy(credentials.apiToken!, 'token')} className="rounded-lg p-1 text-muted hover:bg-surface-sunken">
                  {copied === 'token' ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Links table */}
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <DataTable
          ariaLabel="الحسابات المرتبطة"
          rows={loading ? [] : items}
          rowKey={(link: any) => String(link.id)}
          loading={loading}
          dense
          tableClassName="text-xs"
          columns={[
            {
              key: 'account', header: 'الحساب',
              render: (link: any) => {
                const status = STATUS_STYLES[link.status] ?? STATUS_STYLES.PENDING;
                return (
                  <span>
                    <span className="flex items-center gap-1.5 font-bold text-ink">
                      <Building2 className="h-3.5 w-3.5 text-muted" /> {link.companyName}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1 font-mono text-[10px] text-muted">
                      <span>{link.branchId || 'كل الفروع'}</span>
                      {(link.linkCode || link.apiToken) && (
                        <button
                          type="button"
                          onClick={() => copy(String(link.linkCode || link.apiToken), link.id)}
                          title="نسخ بيانات الربط"
                          className="rounded p-0.5 text-muted hover:bg-surface-sunken hover:text-ink-secondary"
                        >
                          {copied === link.id ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                        </button>
                      )}
                    </span>
                  </span>
                );
              },
            },
            {
              key: 'status', header: 'الحالة',
              render: (link: any) => {
                const status = STATUS_STYLES[link.status] ?? STATUS_STYLES.PENDING;
                return <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${status.cls}`}>{status.label}</span>;
              },
            },
            {
              key: 'approval', header: 'الاعتماد',
              render: (link: any) => (
                <button
                  type="button"
                  onClick={() => toggleApproval(link)}
                  className={`flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[10px] font-bold ${
                    link.requiresApproval
                      ? 'border-warning-border bg-warning-soft text-warning'
                      : 'border-line bg-surface text-muted'
                  }`}
                >
                  {link.requiresApproval ? <ShieldCheck className="h-3 w-3" /> : <ShieldOff className="h-3 w-3" />}
                  {link.requiresApproval ? 'يحتاج اعتماد' : 'مباشر'}
                </button>
              ),
            },
            {
              key: 'perms', header: 'الصلاحيات',
              render: (link: any) => (
                <button
                  type="button"
                  onClick={() => setPermissionsFor(link)}
                  className="rounded-lg border border-line px-2 py-0.5 text-[10px] font-bold text-ink-secondary hover:bg-surface-muted"
                >
                  {link.permissions.length} صلاحية
                </button>
              ),
            },
            { key: 'verified', header: 'آخر تحقق', render: (link: any) => <span className="font-mono text-[10px] text-muted">{formatTimestamp(link.lastVerifiedAt)}</span> },
            {
              key: 'pending', header: 'معلّق',
              render: (link: any) => <span className={`text-[11px] font-black ${link.pendingChanges > 0 ? 'text-warning' : 'text-muted'}`}>{link.pendingChanges}</span>,
            },
            {
              key: 'actions', header: 'إجراءات',
              render: (link: any) => (
                <div className="flex items-center gap-1">
                  {link.status === 'REVOKED' ? (
                    <span className="text-[10px] text-muted">—</span>
                  ) : (
                    <>
                      {link.status === 'ACTIVE' ? (
                        <button type="button" onClick={() => setEnabled(link, false)} title="تعطيل" className="rounded-lg p-1.5 text-muted hover:bg-surface-sunken">
                          <PowerOff className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <button type="button" onClick={() => setEnabled(link, true)} title="تفعيل" className="rounded-lg p-1.5 text-success hover:bg-success-soft">
                          <Power className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button type="button" onClick={() => revoke(link)} title="إلغاء" className="rounded-lg p-1.5 text-danger hover:bg-danger-soft">
                        {busy === link.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </>
                  )}
                </div>
              ),
            },
          ]}
          emptyTitle="لا توجد حسابات مرتبطة بعد. اضغط «ربط حساب جديد» لإصدار كود أو مفتاح API."
        />
      </div>

      {issueOpen && (
        <IssueLinkModal
          branches={branches}
          onClose={() => setIssueOpen(false)}
          onIssued={(result) => {
            setIssueOpen(false);
            setCredentials(result);
            refresh();
          }}
        />
      )}

      {permissionsFor && (
        <PermissionsModal
          link={permissionsFor}
          onClose={() => setPermissionsFor(null)}
          onSaved={() => { setPermissionsFor(null); refresh(); }}
        />
      )}
    </div>
  );
};

// ─── Issue modal ──────────────────────────────────────────────────────────────

const IssueLinkModal: React.FC<{
  branches: Array<{ id: string; name: string; code: string; isMain: boolean }>;
  onClose: () => void;
  onIssued: (result: { companyName: string; code: string | null; apiToken: string | null }) => void;
}> = ({ branches, onClose, onIssued }) => {
  const toast = useToast();
  const service = useMemo(() => new AccountLinkService(), []);
  const [form, setForm] = useState({
    companyName: '',
    password: '',
    branchId: '',
    requiresApproval: true,
    useApiToken: false,
    permissions: [] as string[],
  });
  const [saving, setSaving] = useState(false);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const result = service.issue({
        companyName: form.companyName,
        password: form.password,
        branchId: form.branchId || null,
        requiresApproval: form.requiresApproval,
        useApiToken: form.useApiToken,
        permissions: form.permissions,
      });
      toast.success('تم إصدار بيانات الربط.');
      onIssued({ companyName: form.companyName.trim(), code: result.code, apiToken: result.apiToken });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر إصدار بيانات الربط.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-black text-ink">ربط حساب شركة جديد</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-surface-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-3 text-xs">
          <div>
            <label htmlFor="link-company" className="mb-1 block font-bold text-ink">اسم حساب الشركة *</label>
            <input
              id="link-company"
              required
              value={form.companyName}
              onChange={(event) => setForm({ ...form, companyName: event.target.value })}
              className="w-full rounded-xl border border-line bg-surface-muted px-3 py-2 font-semibold"
              placeholder="مثال: فرع الشركة الشقيق"
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label htmlFor="link-password" className="mb-1 block font-bold text-ink">كلمة سر الربط *</label>
              <input
                id="link-password"
                required
                type="text"
                minLength={6}
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                className="w-full rounded-xl border border-line bg-surface-muted px-3 py-2 font-mono"
                placeholder="6 محارف على الأقل"
              />
            </div>
            <div>
              <label htmlFor="link-branch" className="mb-1 block font-bold text-ink">الفرع المخصص</label>
              <select
                id="link-branch"
                value={form.branchId}
                onChange={(event) => setForm({ ...form, branchId: event.target.value })}
                className="w-full rounded-xl border border-line bg-surface-muted px-3 py-2 font-bold"
              >
                <option value="">كل الفروع المتاحة</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}{branch.isMain ? ' (رئيسي)' : ''}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <p className="mb-1 font-bold text-ink">نوع بيانات الربط</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, useApiToken: false })}
                  className={`flex-1 rounded-xl border px-3 py-2 font-bold ${!form.useApiToken ? 'border-primary bg-accent-soft text-primary' : 'border-line bg-surface text-ink-secondary'}`}
                >
                  <KeyRound className="ml-1 inline h-3.5 w-3.5" /> كود
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, useApiToken: true })}
                  className={`flex-1 rounded-xl border px-3 py-2 font-bold ${form.useApiToken ? 'border-primary bg-accent-soft text-primary' : 'border-line bg-surface text-ink-secondary'}`}
                >
                  <Lock className="ml-1 inline h-3.5 w-3.5" /> API
                </button>
              </div>
            </div>
            <div className="flex items-end">
              <label className="flex w-full cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface-muted px-3 py-2 font-bold text-ink">
                <input
                  type="checkbox"
                  checked={form.requiresApproval}
                  onChange={(event) => setForm({ ...form, requiresApproval: event.target.checked })}
                  className="h-4 w-4 rounded border-line-strong"
                />
                تعديلات هذا الحساب تحتاج اعتمادك
              </label>
            </div>
          </div>

          <div>
            <p className="mb-1 font-bold text-ink">الصلاحيات الممنوحة</p>
            <PermissionPicker
              selected={form.permissions}
              onChange={(permissions) => setForm({ ...form, permissions })}
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-line pt-3">
            <button type="button" onClick={onClose} className="rounded-xl bg-surface-sunken px-4 py-2 font-bold text-ink">إلغاء</button>
            <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2 font-bold text-white hover:bg-primary disabled:opacity-60">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} إصدار البيانات
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Permissions picker ───────────────────────────────────────────────────────

const PermissionPicker: React.FC<{
  selected: string[];
  onChange: (permissions: string[]) => void;
}> = ({ selected, onChange }) => {
  const [search, setSearch] = useState('');
  const groups = useMemo(() => PermissionService.getCatalogGroups(), []);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const toggle = (code: string) => {
    const next = new Set(selectedSet);
    if (next.has(code)) next.delete(code); else next.add(code);
    onChange(Array.from(next));
  };

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return groups;
    return groups
      .map((module) => ({
        module: module.module,
        groups: module.groups
          .map((group) => ({
            name: group.name,
            permissions: group.permissions.filter((permission) =>
              permission.code.toLowerCase().includes(needle) || permission.name.includes(needle)
            ),
          }))
          .filter((group) => group.permissions.length > 0),
      }))
      .filter((module) => module.groups.length > 0);
  }, [groups, search]);

  return (
    <div className="rounded-xl border border-line">
      <div className="relative border-b border-line p-2">
        <Search className="absolute right-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="بحث في الصلاحيات…"
          className="w-full rounded-lg bg-surface-muted py-1.5 pl-2 pr-8 text-[11px] focus:outline-none"
        />
      </div>
      <div className="max-h-48 space-y-3 overflow-y-auto p-2">
        {filtered.map((module) => (
          <div key={module.module}>
            <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-muted">{module.module}</p>
            <div className="space-y-2">
              {module.groups.map((group) => (
                <div key={`${module.module}-${group.name}`}>
                  <p className="text-[10px] font-bold text-muted">{group.name}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {group.permissions.map((permission) => {
                      const active = selectedSet.has(permission.code);
                      return (
                        <button
                          key={permission.code}
                          type="button"
                          onClick={() => toggle(permission.code)}
                          title={permission.code}
                          className={`rounded-lg border px-2 py-0.5 text-[10px] font-bold transition ${
                            active
                              ? 'border-primary bg-accent-soft text-primary'
                              : 'border-line bg-surface text-ink-secondary hover:bg-surface-muted'
                          }`}
                        >
                          {permission.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p className="p-3 text-center text-[11px] text-muted">لا توجد صلاحيات مطابقة.</p>}
      </div>
      <div className="border-t border-line px-2 py-1.5 text-[10px] text-muted">
        تم اختيار {selected.length} صلاحية
        {selected.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="mr-2 font-bold text-danger hover:underline">
            مسح الكل
          </button>
        )}
      </div>
    </div>
  );
};

// ─── Permissions modal ────────────────────────────────────────────────────────

const PermissionsModal: React.FC<{
  link: AccountLinkSummary;
  onClose: () => void;
  onSaved: () => void;
}> = ({ link, onClose, onSaved }) => {
  const toast = useToast();
  const service = useMemo(() => new AccountLinkService(), []);
  const [selected, setSelected] = useState<string[]>(link.permissions);
  const [saving, setSaving] = useState(false);

  const save = () => {
    setSaving(true);
    try {
      service.setPermissions(link.id, selected);
      toast.success('تم تحديث صلاحيات الحساب المرتبط.');
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تحديث الصلاحيات.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl border border-line bg-surface p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-black text-ink">صلاحيات «{link.companyName}»</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-surface-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>
        <PermissionPicker selected={selected} onChange={setSelected} />
        <div className="mt-3 flex justify-end gap-2 border-t border-line pt-3 text-xs">
          <button type="button" onClick={onClose} className="rounded-xl bg-surface-sunken px-4 py-2 font-bold text-ink">إلغاء</button>
          <button type="button" onClick={save} disabled={saving} className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2 font-bold text-white hover:bg-primary disabled:opacity-60">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} حفظ الصلاحيات
          </button>
        </div>
      </div>
    </div>
  );
};

export default AccountLinksPanel;
