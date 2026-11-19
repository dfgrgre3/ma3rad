import type { ComponentType, FC } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import {
  AlertTriangle, CalendarClock, CheckCircle2, Clock3, Factory,
  Loader2, RefreshCw, Settings2, Users,
} from 'lucide-react';
import { useOperationsShifts } from './OperationsShiftsPage/useOperationsShifts';
import { BoardTab } from './OperationsShiftsPage/BoardTab';
import { ScheduleTab } from './OperationsShiftsPage/ScheduleTab';
import { SettingsTab } from './OperationsShiftsPage/SettingsTab';
import { ReportsTab } from './OperationsShiftsPage/ReportsTab';
import type { Tab } from './OperationsShiftsPage/constants';

export const OperationsShiftsPage: FC = () => {
  const state = useOperationsShifts();
  const {
    service,
    tab,
    setTab,
    loadSettings,
    loadSchedule,
    setReport,
    reportFrom,
    reportTo,
    loadAll,
    loading,
    notice,
    error,
  } = state;

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full relative">
      {notice && (
        <div className="fixed top-6 left-6 z-[60] px-4 py-3 rounded-xl shadow-2xl bg-emerald-600 text-white flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5" /> <span className="text-sm font-bold">{notice}</span>
        </div>
      )}
      {error && (
        <div className="fixed top-6 left-6 z-[60] px-4 py-3 rounded-xl shadow-2xl bg-rose-600 text-white flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" /> <span className="text-sm font-bold">{error}</span>
        </div>
      )}

      <PageHeader
        icon={<Clock3 className="w-6 h-6" />}
        title="إدارة ورديات التشغيل 24/7"
        description="ورديات التشغيل المستقلة عن ورديات الكاشير، مع الحضور والتسليم الإلكتروني والإنتاج."
        actions={
          <button
            type="button"
            onClick={loadAll}
            className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-bold flex items-center gap-2 hover:bg-slate-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> تحديث
          </button>
        }
      />

      <div className="flex gap-2 bg-slate-100 p-1 rounded-xl w-fit">
        {([
          ['board', 'لوحة الورديات', CalendarClock],
          ['schedule', 'الجدولة والموارد', Users],
          ['settings', 'إعدادات الورديات', Settings2],
          ['reports', 'تقارير الورديات', Factory],
        ] as Array<[Tab, string, ComponentType<{ className?: string }>]>).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setTab(id);
              if (id === 'settings') loadSettings();
              if (id === 'schedule') loadSchedule();
              if (id === 'reports') setReport(service.getShiftReport(reportFrom, reportTo));
            }}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 ${
              tab === id ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500'
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'board' && <BoardTab state={state} />}
      {tab === 'schedule' && <ScheduleTab state={state} />}
      {tab === 'settings' && <SettingsTab state={state} />}
      {tab === 'reports' && <ReportsTab state={state} />}

      {loading && (
        <div className="fixed inset-0 bg-white/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
        </div>
      )}
    </div>
  );
};

export default OperationsShiftsPage;
