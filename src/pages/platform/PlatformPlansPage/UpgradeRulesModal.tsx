import React from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { useToast } from '../../../components/ui/Toast';
import { EmptyState, Field, Toggle, inputClass } from '../components/PlatformUI';
import { listUpgradeRules, upsertUpgradeRule } from './planData';
import type {
  PlatformPlan,
  PlatformPlanUpgradeRule,
  PlatformPlanUpgradeRuleInput,
} from '../../../services/domains/platform/platformTypes';
import { GitBranch, Plus } from 'lucide-react';

interface Props {
  open: boolean;
  plans: PlatformPlan[];
  onClose: () => void;
  onSaved: () => void;
}

interface DraftRule {
  fromPlanId: string;
  toPlanId: string;
  allowed: boolean;
  requiresApproval: boolean;
  upgradeFeePercent: number;
  notes: string;
}

const emptyDraft: DraftRule = {
  fromPlanId: '',
  toPlanId: '',
  allowed: true,
  requiresApproval: false,
  upgradeFeePercent: 0,
  notes: '',
};

export const UpgradeRulesModal: React.FC<Props> = ({ open, plans, onClose, onSaved }) => {
  const toast = useToast();
  const [rules, setRules] = React.useState<PlatformPlanUpgradeRule[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [savingKey, setSavingKey] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<DraftRule>(emptyDraft);
  const [adding, setAdding] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setRules(await listUpgradeRules());
    } catch (err) {
      toast.error('تعذر تحميل قواعد الترقية', err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const planName = (id: string) => plans.find((p) => p.id === id)?.name ?? id;

  const save = async (input: PlatformPlanUpgradeRuleInput, key: string) => {
    if (savingKey) return;
    setSavingKey(key);
    try {
      await upsertUpgradeRule(input);
      toast.success('تم حفظ قاعدة الترقية');
      await load();
      onSaved();
    } catch (err) {
      toast.error('تعذر حفظ القاعدة', err instanceof Error ? err.message : undefined);
    } finally {
      setSavingKey(null);
    }
  };

  const saveDraft = () => {
    if (!draft.fromPlanId || !draft.toPlanId) {
      toast.warning('اختر الخطة المصدر والهدف');
      return;
    }
    if (draft.fromPlanId === draft.toPlanId) {
      toast.warning('لا يمكن إنشاء قاعدة من الخطة لنفسها');
      return;
    }
    void save(
      {
        fromPlanId: draft.fromPlanId,
        toPlanId: draft.toPlanId,
        allowed: draft.allowed,
        requiresApproval: draft.requiresApproval,
        upgradeFeePercent: draft.upgradeFeePercent,
        notes: draft.notes || undefined,
      },
      'new'
    ).then(() => {
      setDraft(emptyDraft);
      setAdding(false);
    });
  };

  const updateRule = (rule: PlatformPlanUpgradeRule, patch: Partial<PlatformPlanUpgradeRuleInput>) => {
    void save(
      {
        fromPlanId: rule.fromPlanId,
        toPlanId: rule.toPlanId,
        allowed: patch.allowed ?? rule.allowed,
        requiresApproval: patch.requiresApproval ?? rule.requiresApproval,
        upgradeFeePercent: patch.upgradeFeePercent ?? rule.upgradeFeePercent ?? 0,
        notes: patch.notes !== undefined ? patch.notes : rule.notes ?? undefined,
      },
      rule.id
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="قواعد الترقية والتخفيض بين الخطط"
      description="حدد هل يمكن للعميل الانتقال من خطة لأخرى، وهل يتطلب موافقة أو رسوم ترقية."
    >
      <div className="space-y-3">
        {loading ? (
          <p className="py-8 text-center text-[12px] font-semibold text-muted">جارٍ التحميل...</p>
        ) : rules.length === 0 && !adding ? (
          <EmptyState icon={<GitBranch className="h-5 w-5" />} title="لا توجد قواعد" description="أضف قاعدة لتحديد مسارات الترقية المسموحة بين الخطط." />
        ) : (
          <div className="space-y-2">
            {rules.map((rule) => (
              <div key={rule.id} className="rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-[12px] font-black text-ink">
                    <span className="rounded-lg bg-surface-muted px-2 py-1">{planName(rule.fromPlanId)}</span>
                    <span className="text-muted">←</span>
                    <span className="rounded-lg bg-surface-muted px-2 py-1">{planName(rule.toPlanId)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-[10.5px] font-semibold text-muted">
                      رسوم %
                      <input
                        type="number"
                        min={0}
                        max={100}
                        className={`${inputClass} w-16 px-1.5 py-1 text-center`}
                        defaultValue={rule.upgradeFeePercent ?? 0}
                        disabled={savingKey === rule.id}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v) && v !== (rule.upgradeFeePercent ?? 0)) updateRule(rule, { upgradeFeePercent: v });
                        }}
                      />
                    </label>
                    <label className="flex items-center gap-1.5 text-[10.5px] font-semibold text-muted">
                      موافقة
                      <Toggle
                        checked={rule.requiresApproval}
                        disabled={savingKey === rule.id}
                        onChange={(next) => updateRule(rule, { requiresApproval: next })}
                        label="تتطلب موافقة"
                      />
                    </label>
                    <label className="flex items-center gap-1.5 text-[10.5px] font-semibold text-muted">
                      مسموح
                      <Toggle
                        checked={rule.allowed}
                        disabled={savingKey === rule.id}
                        onChange={(next) => updateRule(rule, { allowed: next })}
                        label="مسموح"
                      />
                    </label>
                  </div>
                </div>
                <input
                  className={`${inputClass} mt-2 w-full px-2 py-1 text-[11px]`}
                  placeholder="ملاحظة (اختياري)"
                  defaultValue={rule.notes ?? ''}
                  disabled={savingKey === rule.id}
                  onBlur={(e) => {
                    if ((e.target.value || '') !== (rule.notes ?? '')) {
                      updateRule(rule, { notes: e.target.value || undefined });
                    }
                  }}
                />
              </div>
            ))}
          </div>
        )}

        {adding ? (
          <div className="rounded-xl border border-dashed border-line-strong p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="من خطة" required>
                <select className={inputClass} value={draft.fromPlanId} onChange={(e) => setDraft({ ...draft, fromPlanId: e.target.value })}>
                  <option value="">— اختر —</option>
                  {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
              <Field label="إلى خطة" required>
                <select className={inputClass} value={draft.toPlanId} onChange={(e) => setDraft({ ...draft, toPlanId: e.target.value })}>
                  <option value="">— اختر —</option>
                  {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
              <Field label="رسوم الترقية %">
                <input type="number" min={0} max={100} className={inputClass} value={draft.upgradeFeePercent} onChange={(e) => setDraft({ ...draft, upgradeFeePercent: Number(e.target.value) })} />
              </Field>
              <Field label="ملاحظة">
                <input className={inputClass} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
              </Field>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
                  مسموح <Toggle checked={draft.allowed} onChange={(next) => setDraft({ ...draft, allowed: next })} label="مسموح" />
                </label>
                <label className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
                  تتطلب موافقة <Toggle checked={draft.requiresApproval} onChange={(next) => setDraft({ ...draft, requiresApproval: next })} label="تتطلب موافقة" />
                </label>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => { setAdding(false); setDraft(emptyDraft); }}>إلغاء</Button>
                <Button size="sm" onClick={saveDraft} loading={savingKey === 'new'}>حفظ القاعدة</Button>
              </div>
            </div>
          </div>
        ) : (
          <Button variant="secondary" size="sm" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setAdding(true)}>
            إضافة قاعدة
          </Button>
        )}
      </div>
    </Modal>
  );
};

export default UpgradeRulesModal;
