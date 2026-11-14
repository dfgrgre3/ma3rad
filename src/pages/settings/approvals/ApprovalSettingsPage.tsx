import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Save, Search } from 'lucide-react';
import { APPROVAL_OPERATIONS, ApprovalPolicyService, type ApprovalPolicy, type ApprovalOperationDefinition } from '../../../services/domains/approvals/ApprovalPolicyService';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PageHeader } from '../../../components/ui/PageHeader';

interface RoleOption { code: string; name: string }
type PolicyMap = Record<string, ApprovalPolicy>;

export const ApprovalSettingsPage: React.FC = () => {
  const service = useMemo(() => new ApprovalPolicyService(), []);
  const canManage = PermissionService.can(AuthService.getCurrentUser(), 'approvals.settings.manage');
  const [policies, setPolicies] = useState<PolicyMap>({});
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [search, setSearch] = useState('');
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!canManage) return;
    try {
      setPolicies(Object.fromEntries(APPROVAL_OPERATIONS.map(({ code }) => [code, service.getPolicy(code)])));
      setRoles(DatabaseManager.getInstance().query<RoleOption>('SELECT code, name FROM roles ORDER BY name'));
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : String(error) });
    }
  }, [canManage, service]);

  const update = (operationCode: string, patch: Partial<ApprovalPolicy>) => setPolicies((current) => ({
    ...current,
    [operationCode]: { ...current[operationCode], ...patch },
  }));
  const save = (operation: ApprovalOperationDefinition) => {
    const policy = policies[operation.code];
    if (!policy) return;
    setSavingCode(operation.code);
    setMessage(null);
    try {
      service.setPolicy(policy);
      setMessage({ ok: true, text: `تم حفظ سياسة «${operation.label}».` });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : String(error) });
    } finally { setSavingCode(null); }
  };
  const visibleOperations = APPROVAL_OPERATIONS.filter((operation) =>
    `${operation.label} ${operation.category} ${operation.code}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const categories = [...new Set(visibleOperations.map(({ category }) => category))];

  return (
    <div className="erp-page space-y-4" dir="rtl">
      <PageHeader title="إعدادات الاعتمادات والموافقات" description="سياسات العمليات وصلاحيات التنفيذ والاعتماد." />
      {!canManage ? <section className="erp-card text-sm">لا تملك صلاحية إدارة سياسات الموافقات.</section> : (
        <>
          <section className="erp-card space-y-3">
            <p className="text-sm text-[var(--cerami-muted)]">حالة التكامل موضحة لكل عملية. تغيير السياسة لعملية غير موصولة لا يوقف تنفيذها بعد؛ اربطها بخدمة العملية قبل تفعيل وضع المنع أو الاعتماد.</p>
            <label className="relative block max-w-xl"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className="erp-input w-full pr-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث عن عملية أو قسم" /></label>
            {message && <div className={`flex items-center gap-2 text-sm ${message.ok ? 'text-emerald-700' : 'text-red-700'}`}>{message.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}{message.text}</div>}
          </section>
          {categories.map((category) => (
            <section className="erp-card space-y-4" key={category}>
              <h2 className="erp-card__title">{category}</h2>
              {visibleOperations.filter((operation) => operation.category === category).map((operation) => {
                const policy = policies[operation.code];
                if (!policy) return <div key={operation.code} className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />جارٍ التحميل…</div>;
                const toggleRole = (field: 'executorRoles' | 'approverRoles', role: string) => {
                  const selected = policy[field];
                  update(operation.code, { [field]: selected.includes(role) ? selected.filter((item) => item !== role) : [...selected, role] });
                };
                const saveOperation = () => {
                  if (policy.mode === 'DISABLED' && !window.confirm(`سيتم منع «${operation.label}» حيثما كانت السياسة موصولة. هل تريد المتابعة؟`)) return;
                  save(operation);
                };
                return (
                  <article className="space-y-3 border-t border-slate-200 pt-4" key={operation.code}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div><h3 className="font-semibold">{operation.label}</h3><p className={`text-xs ${operation.integrated ? 'text-emerald-700' : 'text-amber-700'}`}>{operation.integrated ? 'متصلة بالتنفيذ الفعلي' : 'إعداد فقط — ربط التنفيذ غير مكتمل'}</p></div>
                      <select className="erp-input" value={policy.mode} onChange={(event) => update(operation.code, { mode: event.target.value as ApprovalPolicy['mode'] })}>
                        <option value="APPROVAL">يتطلب موافقة</option><option value="DIRECT">تنفيذ مباشر</option><option value="DISABLED">ممنوع</option>
                      </select>
                    </div>
                    <label className="block max-w-sm space-y-1 text-sm"><span>حد القيمة قبل طلب الموافقة (اتركه فارغًا بلا حد)</span><input className="erp-input w-full" type="number" min="0" step="0.01" value={policy.maxValue ?? ''} onChange={(event) => update(operation.code, { maxValue: event.target.value === '' ? null : Number(event.target.value) })} /></label>
                    <label className="block max-w-sm space-y-1 text-sm"><span>عدد الموافقات المطلوبة</span><input className="erp-input w-full" type="number" min="1" max="10" value={policy.minApprovals} onChange={(event) => update(operation.code, { minApprovals: Number(event.target.value) })} /></label>
                    <label className="block max-w-sm space-y-1 text-sm"><span>نمط الاعتماد</span><select className="erp-input w-full" value={policy.approvalMode} onChange={(event) => update(operation.code, { approvalMode: event.target.value as ApprovalPolicy['approvalMode'] })}><option value="SINGLE">معتمد واحد</option><option value="MULTI">موافقات متعددة</option></select></label>
                    <label className="block max-w-sm space-y-1 text-sm"><span>نطاق السياسة</span><select className="erp-input w-full" value={policy.scopeType} onChange={(event) => update(operation.code, { scopeType: event.target.value as ApprovalPolicy['scopeType'] })}><option value="BRANCH">الفرع</option><option value="WAREHOUSE">المستودع</option><option value="GLOBAL">عام</option></select></label>
                    <label className="block max-w-sm space-y-1 text-sm"><span>انتهاء الطلب (بالساعات، اتركه فارغًا بلا انتهاء)</span><input className="erp-input w-full" type="number" min="1" max="8760" value={policy.expiresAfterHours ?? ''} onChange={(event) => update(operation.code, { expiresAfterHours: event.target.value === '' ? null : Number(event.target.value) })} /></label>
                    <RolePicker title="أدوار التنفيذ (فارغ = أي دور لديه الصلاحية الأساسية)" roles={roles} selected={policy.executorRoles} onToggle={(role) => toggleRole('executorRoles', role)} />
                    <RolePicker title="أدوار الاعتماد (فارغ = صلاحية الاعتماد ونطاق الفرع)" roles={roles} selected={policy.approverRoles} onToggle={(role) => toggleRole('approverRoles', role)} />
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={policy.allowSelfApproval} onChange={(event) => update(operation.code, { allowSelfApproval: event.target.checked })} />السماح لمنشئ الطلب باعتماده</label>
                    <div><button type="button" disabled={savingCode !== null} onClick={saveOperation} className="erp-button erp-button--primary inline-flex items-center gap-2"><Save className="h-4 w-4" />{savingCode === operation.code ? 'جارٍ الحفظ…' : 'حفظ هذه السياسة'}</button></div>
                  </article>
                );
              })}
            </section>
          ))}
        </>
      )}
    </div>
  );
};

const RolePicker: React.FC<{ title: string; roles: RoleOption[]; selected: string[]; onToggle: (role: string) => void }> = ({ title, roles, selected, onToggle }) => (
  <fieldset className="space-y-2"><legend className="text-sm font-semibold">{title}</legend><div className="flex flex-wrap gap-2">{roles.map((role) => <label key={role.code} className="flex items-center gap-2 rounded border px-3 py-2 text-sm"><input type="checkbox" checked={selected.includes(role.code)} onChange={() => onToggle(role.code)} />{role.name}</label>)}</div></fieldset>
);

export default ApprovalSettingsPage;
