import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, BarChart3, LayoutDashboard, LayoutGrid, RotateCcw, Zap } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import {
  PULSE_WIDGETS_META,
  getQuickActionCatalog,
  type PulseWidgetId,
} from '../../config/activityDashboardLayout';
import { getProfileKpiCatalog } from '../../config/profileDashboardKpis';
import { getEffectiveBusinessType } from '../../services/domains/config/BusinessTypeService';
import { DashboardPreferencesService } from '../../services/domains/dashboard/DashboardPreferencesService';
import type { BusinessProfileDashboardKpi } from '../../config/businessProfiles';
import type { DashboardSectionConfig, QuickActionItem, SectionId } from '../../types/dashboard/components';

type CustomizeTab = 'sections' | 'widgets' | 'kpis' | 'actions';

interface DashboardCustomizeDialogProps {
  open: boolean;
  onClose: () => void;
  /** Sections the user may toggle and reorder (permission/activity filtered, 'all' excluded). */
  sections: DashboardSectionConfig[];
  /** Current effective order of those sections. */
  sectionOrder: SectionId[];
  /** Currently user-hidden section ids. */
  hiddenSections: SectionId[];
  /** Currently enabled pulse widgets. */
  pulseWidgets: PulseWidgetId[];
  /** Currently selected KPI ids, in display order. */
  selectedKpis: string[];
  /** Currently selected quick-action paths, in display order. */
  selectedQuickActions: string[];
}

const TABS: Array<{ id: CustomizeTab; label: string; icon: React.ElementType }> = [
  { id: 'sections', label: 'الأقسام', icon: LayoutGrid },
  { id: 'widgets', label: 'ودجات الملخص', icon: LayoutDashboard },
  { id: 'kpis', label: 'مؤشرات KPI', icon: BarChart3 },
  { id: 'actions', label: 'الإجراءات السريعة', icon: Zap },
];

function move<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const next = [...list];
  const target = index + delta;
  if (target < 0 || target >= next.length) return list;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

const rowClass =
  'flex min-w-0 items-center gap-2 rounded-lg border border-[#d9d9d9] bg-surface px-2.5 py-2 dark:border-[#3d3d3d] dark:bg-[#2b2b2b]';

const ReorderButtons: React.FC<{ index: number; length: number; onMove: (delta: -1 | 1) => void }> = ({
  index, length, onMove,
}) => (
  <span className="flex shrink-0 flex-col">
    <button
      type="button"
      onClick={() => onMove(-1)}
      disabled={index === 0}
      aria-label="تحريك لأعلى"
      className="rounded p-0.5 text-[#4d4d4d] hover:bg-[#eef4fa] disabled:opacity-30 dark:text-[#c8c8c8] dark:hover:bg-[#333f47]"
    >
      <ArrowUp className="h-3 w-3" />
    </button>
    <button
      type="button"
      onClick={() => onMove(1)}
      disabled={index === length - 1}
      aria-label="تحريك لأسفل"
      className="rounded p-0.5 text-[#4d4d4d] hover:bg-[#eef4fa] disabled:opacity-30 dark:text-[#c8c8c8] dark:hover:bg-[#333f47]"
    >
      <ArrowDown className="h-3 w-3" />
    </button>
  </span>
);

/**
 * Per-user dashboard customization: reorder/hide sections, toggle pulse
 * widgets, pick KPIs and quick actions. Saved per user via
 * DashboardPreferencesService and merged over the activity layout.
 */
export const DashboardCustomizeDialog: React.FC<DashboardCustomizeDialogProps> = ({
  open,
  onClose,
  sections,
  sectionOrder,
  hiddenSections,
  pulseWidgets,
  selectedKpis,
  selectedQuickActions,
}) => {
  const [tab, setTab] = useState<CustomizeTab>('sections');
  const [order, setOrder] = useState<SectionId[]>([]);
  const [hidden, setHidden] = useState<SectionId[]>([]);
  const [widgets, setWidgets] = useState<PulseWidgetId[]>([]);
  const [kpis, setKpis] = useState<string[]>([]);
  const [actions, setActions] = useState<string[]>([]);

  const businessType = getEffectiveBusinessType();
  const kpiCatalog = useMemo(() => getProfileKpiCatalog(businessType), [businessType]);
  const actionCatalog = useMemo(() => getQuickActionCatalog(), []);

  // Re-initialize the draft every time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setTab('sections');
    setOrder(sectionOrder.filter((id) => sections.some((s) => s.id === id)));
    setHidden([...hiddenSections]);
    setWidgets([...pulseWidgets]);
    setKpis([...selectedKpis]);
    setActions([...selectedQuickActions]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const visibleCount = order.filter((id) => !hidden.includes(id)).length;
  const toggleHidden = (id: SectionId) => {
    const isHidden = hidden.includes(id);
    if (isHidden) {
      setHidden(hidden.filter((item) => item !== id));
    } else if (visibleCount > 1) {
      setHidden([...hidden, id]);
    }
  };
  const toggleIn = <T,>(list: T[], value: T, set: (next: T[]) => void) => {
    set(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  };

  const save = () => {
    const current = DashboardPreferencesService.getPreferences();
    DashboardPreferencesService.savePreferences({
      ...current,
      hiddenSections: hidden,
      sectionOrder: order,
      pulseWidgets: widgets,
      kpis,
      quickActions: actions,
    });
    onClose();
  };

  const reset = () => {
    DashboardPreferencesService.resetPreferences();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="تخصيص لوحة المعلومات"
      description="رتّب الأقسام، وأظهر أو أخفِ الودجات والمؤشرات والإجراءات — تُحفظ التخصيصات لحسابك فقط."
      icon={<LayoutGrid className="h-5 w-5" />}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={reset} leadingIcon={<RotateCcw className="h-3.5 w-3.5" />}>
            استعادة افتراضي النشاط
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>إلغاء</Button>
            <Button variant="primary" size="sm" onClick={save}>حفظ التخصيص</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1 border-b border-[#d9d9d9] pb-2 dark:border-[#3d3d3d]" role="tablist">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-bold transition ${
                tab === id
                  ? 'bg-[#0078d4] text-white'
                  : 'text-[#4d4d4d] hover:bg-[#f0f6fc] dark:text-[#c8c8c8] dark:hover:bg-[#30363b]'
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>

        <div className="max-h-[55vh] space-y-1.5 overflow-y-auto pe-1">
          {tab === 'sections' && (
            <>
              <p className="pb-1 text-[11px] text-[#767676] dark:text-[#a6a6a6]">
                فعّل القسم لعرضه في التبويبات، ورتّبها بالأسهم. يجب إبقاء قسم واحد على الأقل ظاهرًا.
              </p>
              {order.map((id, index) => {
                const section = sections.find((s) => s.id === id);
                if (!section) return null;
                const Icon = section.icon;
                const isHidden = hidden.includes(id);
                return (
                  <div key={id} className={`${rowClass} ${isHidden ? 'opacity-60' : ''}`}>
                    <input
                      type="checkbox"
                      checked={!isHidden}
                      onChange={() => toggleHidden(id)}
                      aria-label={`إظهار ${section.label}`}
                      className="h-4 w-4 shrink-0 accent-[#0078d4]"
                    />
                    <Icon className="h-4 w-4 shrink-0 text-[#0078d4]" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-[#1b1b1b] dark:text-[#f0f0f0]">
                      {section.label}
                    </span>
                    <ReorderButtons index={index} length={order.length} onMove={(d) => setOrder(move(order, index, d))} />
                  </div>
                );
              })}
            </>
          )}

          {tab === 'widgets' && (
            <>
              <p className="pb-1 text-[11px] text-[#767676] dark:text-[#a6a6a6]">
                اختر الودجات التي تظهر داخل قسم «نبض حركة اليوم».
              </p>
              {PULSE_WIDGETS_META.map(({ id, label }) => (
                <label key={id} className={`${rowClass} cursor-pointer`}>
                  <input
                    type="checkbox"
                    checked={widgets.includes(id)}
                    onChange={() => toggleIn(widgets, id, setWidgets)}
                    className="h-4 w-4 shrink-0 accent-[#0078d4]"
                  />
                  <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[#1b1b1b] dark:text-[#f0f0f0]">{label}</span>
                </label>
              ))}
            </>
          )}

          {tab === 'kpis' && (
            <>
              <p className="pb-1 text-[11px] text-[#767676] dark:text-[#a6a6a6]">
                اختر مؤشرات النشاط الظاهرة ورتّبها — المتاح حاليًا مؤشرات نشاطك.
              </p>
              {kpiCatalog.map((kpi: BusinessProfileDashboardKpi) => {
                const index = kpis.indexOf(kpi.id);
                const checked = index !== -1;
                return (
                  <div key={kpi.id} className={`${rowClass} ${checked ? '' : 'opacity-60'}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleIn(kpis, kpi.id, setKpis)}
                      aria-label={kpi.label.ar}
                      className="h-4 w-4 shrink-0 accent-[#0078d4]"
                    />
                    <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[#1b1b1b] dark:text-[#f0f0f0]">
                      {kpi.label.ar}
                    </span>
                    {checked && <ReorderButtons index={index} length={kpis.length} onMove={(d) => setKpis(move(kpis, index, d))} />}
                  </div>
                );
              })}
            </>
          )}

          {tab === 'actions' && (
            <>
              <p className="pb-1 text-[11px] text-[#767676] dark:text-[#a6a6a6]">
                اختر الاختصارات السريعة الظاهرة ورتّبها — الروابط المخفية لنشاطك لا تظهر.
              </p>
              {actionCatalog.map((action: QuickActionItem) => {
                const index = actions.indexOf(action.to);
                const checked = index !== -1;
                const Icon = action.icon;
                return (
                  <div key={action.to} className={`${rowClass} ${checked ? '' : 'opacity-60'}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleIn(actions, action.to, setActions)}
                      aria-label={action.label}
                      className="h-4 w-4 shrink-0 accent-[#0078d4]"
                    />
                    <Icon className="h-4 w-4 shrink-0 text-[#0078d4]" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-bold text-[#1b1b1b] dark:text-[#f0f0f0]">{action.label}</span>
                      <span className="block truncate text-[10px] text-[#767676] dark:text-[#a6a6a6]">{action.detail} · {action.to}</span>
                    </span>
                    {checked && <ReorderButtons index={index} length={actions.length} onMove={(d) => setActions(move(actions, index, d))} />}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default DashboardCustomizeDialog;
