import React from 'react';
import {
  Boxes,
  Plus,
  Pencil,
  Rocket,
  Sparkles,
  SlidersHorizontal,
  BadgeCheck,
  AlertTriangle,
} from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import type {
  PlatformFeatureFlag,
  PlatformModule,
  PlatformRelease,
} from '../../services/domains/platform/platformTypes';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { useToast } from '../../components/ui/Toast';
import {
  EmptyState,
  Field,
  StatusBadge,
  Toggle,
  formatDate,
  inputClass,
} from './components/PlatformUI';

const TABS = [
  { id: 'modules', label: 'الوحدات', icon: SlidersHorizontal },
  { id: 'features', label: 'المزايا', icon: Sparkles },
  { id: 'releases', label: 'الإصدارات', icon: Rocket },
] as const;

type TabId = (typeof TABS)[number]['id'];

const RELEASE_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'مسودة',
  PUBLISHED: 'منشور',
  DEPRECATED: 'متوقف',
};

const CHANNEL_LABELS: Record<string, string> = {
  STABLE: 'مستقر',
  BETA: 'تجريبي',
  NIGHTLY: 'ليلي',
};

const emptyFeature = { id: undefined as string | undefined, code: '', name: '', description: '', category: '', isEnabled: true, rolloutPercent: 100 };
const emptyRelease = {
  id: undefined as string | undefined,
  version: '',
  channel: 'STABLE' as PlatformRelease['channel'],
  status: 'PUBLISHED' as PlatformRelease['status'],
  notes: '',
  releasedAt: new Date().toISOString().slice(0, 10),
};

export const PlatformProductPage: React.FC = () => {
  const toast = useToast();
  const [tab, setTab] = React.useState<TabId>('modules');
  const [modules, setModules] = React.useState<PlatformModule[]>([]);
  const [features, setFeatures] = React.useState<PlatformFeatureFlag[]>([]);
  const [releases, setReleases] = React.useState<PlatformRelease[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [featureOpen, setFeatureOpen] = React.useState(false);
  const [featureForm, setFeatureForm] = React.useState(emptyFeature);
  const [releaseOpen, setReleaseOpen] = React.useState(false);
  const [releaseForm, setReleaseForm] = React.useState(emptyRelease);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(() => {
    setLoading(true);
    try {
      setModules(platformAdminService.listModules());
      setFeatures(platformAdminService.listFeatureFlags());
      setReleases(platformAdminService.listReleases());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل بيانات المنتج.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const toggleModule = (module: PlatformModule) => {
    try {
      platformAdminService.setModuleEnabled(module.id, !module.isEnabled);
      toast.success(module.isEnabled ? 'تم تعطيل الوحدة' : 'تم تفعيل الوحدة');
      load();
    } catch (err) {
      toast.error('تعذر تحديث الوحدة', err instanceof Error ? err.message : undefined);
    }
  };

  const openFeature = (flag?: PlatformFeatureFlag) => {
    setFeatureForm(flag ? {
      id: flag.id,
      code: flag.code,
      name: flag.name,
      description: flag.description ?? '',
      category: flag.category ?? '',
      isEnabled: flag.isEnabled,
      rolloutPercent: flag.rolloutPercent,
    } : { ...emptyFeature });
    setFeatureOpen(true);
  };

  const saveFeature = () => {
    setSaving(true);
    try {
      platformAdminService.upsertFeatureFlag(featureForm);
      toast.success(featureForm.id ? 'تم تحديث الميزة' : 'تم إنشاء الميزة');
      setFeatureOpen(false);
      load();
    } catch (err) {
      toast.error('تعذر حفظ الميزة', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const toggleFeature = (flag: PlatformFeatureFlag) => {
    try {
      platformAdminService.setFeatureEnabled(flag.id, !flag.isEnabled);
      toast.success(flag.isEnabled ? 'تم تعطيل الميزة' : 'تم تفعيل الميزة');
      load();
    } catch (err) {
      toast.error('تعذر تحديث الميزة', err instanceof Error ? err.message : undefined);
    }
  };

  const openRelease = (release?: PlatformRelease) => {
    setReleaseForm(release ? {
      id: release.id,
      version: release.version,
      channel: release.channel,
      status: release.status,
      notes: release.notes ?? '',
      releasedAt: (release.releasedAt ?? release.createdAt).slice(0, 10),
    } : { ...emptyRelease });
    setReleaseOpen(true);
  };

  const saveRelease = () => {
    setSaving(true);
    try {
      platformAdminService.upsertRelease({
        ...releaseForm,
        releasedAt: releaseForm.releasedAt ? new Date(releaseForm.releasedAt).toISOString() : undefined,
      });
      toast.success(releaseForm.id ? 'تم تحديث الإصدار' : 'تم إنشاء الإصدار');
      setReleaseOpen(false);
      load();
    } catch (err) {
      toast.error('تعذر حفظ الإصدار', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="التحكم في المنتج"
        description="إدارة وحدات النظام ومزايا المنتج وإصداراته."
        icon={<Boxes className="h-5 w-5" />}
        actions={
          tab === 'features' ? (
            <Button variant="primary" size="sm" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => openFeature()}>
              ميزة جديدة
            </Button>
          ) : tab === 'releases' ? (
            <Button variant="primary" size="sm" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => openRelease()}>
              إصدار جديد
            </Button>
          ) : undefined
        }
      />

      <div className="inline-flex rounded-lg bg-slate-100 p-1">
        {TABS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-bold transition ${tab === item.id ? 'bg-white text-slate-900 shadow' : 'text-slate-500'}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700">{error}</div>
      )}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm font-semibold text-slate-500 shadow-sm">جارٍ تحميل بيانات المنتج...</div>
      ) : tab === 'modules' ? (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {modules.length === 0 ? (
            <EmptyState icon={<Boxes className="h-5 w-5" />} title="لا توجد وحدات" />
          ) : (
            <div className="divide-y divide-slate-100">
              {modules.map((module) => (
                <div key={module.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${module.isEnabled ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                      <BadgeCheck className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-[12.5px] font-bold text-slate-800">
                        {module.name}
                        <span className="font-mono text-[9.5px] font-normal text-slate-400" dir="ltr">{module.code}</span>
                      </p>
                      <p className="text-[10.5px] text-slate-500">{module.description || 'بدون وصف'}</p>
                      {module.minPlanCode && (
                        <p className="mt-0.5 text-[9.5px] font-semibold text-sky-600">الحد الأدنى: {module.minPlanCode}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`text-[10.5px] font-bold ${module.isEnabled ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {module.isEnabled ? 'مفعّلة' : 'معطّلة'}
                    </span>
                    <Toggle checked={module.isEnabled} onChange={() => toggleModule(module)} label={module.name} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : tab === 'features' ? (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {features.length === 0 ? (
            <EmptyState icon={<Sparkles className="h-5 w-5" />} title="لا توجد مزايا" description="أضف ميزة للتحكم في إتاحتها للمشتركين." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-right">
                <thead className="bg-slate-50">
                  <tr className="text-[10.5px] text-slate-500">
                    <th className="px-4 py-2.5 font-semibold">الميزة</th>
                    <th className="px-4 py-2.5 font-semibold">الفئة</th>
                    <th className="px-4 py-2.5 font-semibold">نسبة الإتاحة</th>
                    <th className="px-4 py-2.5 font-semibold">الحالة</th>
                    <th className="px-4 py-2.5 font-semibold">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {features.map((flag) => (
                    <tr key={flag.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                      <td className="px-4 py-2.5">
                        <p className="text-[12px] font-bold text-slate-800">{flag.name}</p>
                        <p className="font-mono text-[9.5px] text-slate-400" dir="ltr">{flag.code}</p>
                        {flag.description && <p className="text-[10px] text-slate-500">{flag.description}</p>}
                      </td>
                      <td className="px-4 py-2.5 text-[11px] text-slate-600">{flag.category || '—'}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200">
                            <div className="h-full rounded-full bg-sky-500" style={{ width: `${flag.rolloutPercent}%` }} />
                          </div>
                          <span className="text-[10.5px] font-semibold text-slate-600">{flag.rolloutPercent}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10.5px] font-bold ${flag.isEnabled ? 'text-emerald-600' : 'text-slate-400'}`}>{flag.isEnabled ? 'مفعّلة' : 'معطّلة'}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <Toggle checked={flag.isEnabled} onChange={() => toggleFeature(flag)} label={flag.name} />
                          <button type="button" onClick={() => openFeature(flag)} className="rounded p-1.5 text-slate-500 hover:bg-sky-50 hover:text-sky-700" title="تعديل">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {releases.length === 0 ? (
            <EmptyState icon={<Rocket className="h-5 w-5" />} title="لا توجد إصدارات" description="سجّل إصدارات المنتج لمتابعة النشر." />
          ) : (
            <div className="divide-y divide-slate-100">
              {releases.map((release) => (
                <div key={release.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                      <Rocket className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-[12.5px] font-bold text-slate-800">
                        <span dir="ltr">v{release.version}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9.5px] font-bold text-slate-600">{CHANNEL_LABELS[release.channel]}</span>
                        <StatusBadge value={release.status} label={RELEASE_STATUS_LABELS[release.status]} />
                      </p>
                      <p className="text-[10.5px] text-slate-500">{release.notes || 'بدون ملاحظات'}</p>
                      <p className="text-[9.5px] text-slate-400">{formatDate(release.releasedAt)}</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => openRelease(release)} className="rounded p-1.5 text-slate-500 hover:bg-sky-50 hover:text-sky-700" title="تعديل">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Feature modal */}
      <Modal
        open={featureOpen}
        onClose={() => setFeatureOpen(false)}
        title={featureForm.id ? 'تعديل ميزة' : 'ميزة جديدة'}
        size="md"
        busy={saving}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setFeatureOpen(false)} disabled={saving}>إلغاء</Button>
            <Button variant="primary" onClick={saveFeature} loading={saving}>حفظ</Button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="اسم الميزة" required>
            <input className={inputClass} value={featureForm.name} onChange={(event) => setFeatureForm({ ...featureForm, name: event.target.value })} />
          </Field>
          <Field label="الرمز" required hint={featureForm.id ? 'لا يمكن تغيير الرمز' : 'أحرف إنجليزية صغيرة وأرقام و_ فقط'}>
            <input dir="ltr" className={inputClass} value={featureForm.code} disabled={Boolean(featureForm.id)} onChange={(event) => setFeatureForm({ ...featureForm, code: event.target.value.toLowerCase() })} />
          </Field>
          <Field label="الفئة">
            <input className={inputClass} value={featureForm.category} onChange={(event) => setFeatureForm({ ...featureForm, category: event.target.value })} />
          </Field>
          <Field label="نسبة الإتاحة (%)">
            <input type="number" min={0} max={100} className={inputClass} value={featureForm.rolloutPercent} onChange={(event) => setFeatureForm({ ...featureForm, rolloutPercent: Number(event.target.value) })} />
          </Field>
          <Field label="الوصف" className="sm:col-span-2">
            <textarea rows={2} className={inputClass} value={featureForm.description} onChange={(event) => setFeatureForm({ ...featureForm, description: event.target.value })} />
          </Field>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2">
          <div>
            <p className="text-[12px] font-bold text-slate-800">تفعيل الميزة</p>
            <p className="text-[10.5px] text-slate-500">عند التعطيل لن تكون الميزة متاحة لأي مشترك.</p>
          </div>
          <Toggle checked={featureForm.isEnabled} onChange={(next) => setFeatureForm({ ...featureForm, isEnabled: next })} label="تفعيل الميزة" />
        </div>
      </Modal>

      {/* Release modal */}
      <Modal
        open={releaseOpen}
        onClose={() => setReleaseOpen(false)}
        title={releaseForm.id ? 'تعديل إصدار' : 'إصدار جديد'}
        size="md"
        busy={saving}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setReleaseOpen(false)} disabled={saving}>إلغاء</Button>
            <Button variant="primary" onClick={saveRelease} loading={saving}>حفظ</Button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="رقم الإصدار" required hint="مثال: 2.4.0">
            <input dir="ltr" className={inputClass} value={releaseForm.version} onChange={(event) => setReleaseForm({ ...releaseForm, version: event.target.value })} />
          </Field>
          <Field label="القناة">
            <select className={inputClass} value={releaseForm.channel} onChange={(event) => setReleaseForm({ ...releaseForm, channel: event.target.value as PlatformRelease['channel'] })}>
              {Object.entries(CHANNEL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <Field label="الحالة">
            <select className={inputClass} value={releaseForm.status} onChange={(event) => setReleaseForm({ ...releaseForm, status: event.target.value as PlatformRelease['status'] })}>
              {Object.entries(RELEASE_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <Field label="تاريخ الإصدار">
            <input type="date" className={inputClass} value={releaseForm.releasedAt} onChange={(event) => setReleaseForm({ ...releaseForm, releasedAt: event.target.value })} />
          </Field>
          <Field label="ملاحظات الإصدار" className="sm:col-span-2">
            <textarea rows={3} className={inputClass} value={releaseForm.notes} onChange={(event) => setReleaseForm({ ...releaseForm, notes: event.target.value })} />
          </Field>
        </div>
        {releaseForm.status === 'DEPRECATED' && (
          <p className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5" /> الإصدارات المتوقفة تظهر للعملاء كإصدارات قديمة.
          </p>
        )}
      </Modal>
    </div>
  );
};

export default PlatformProductPage;
