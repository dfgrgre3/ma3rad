import React, { useState } from 'react';
import { Activity, Plus, Search, Calendar, CheckCircle2, Clock, Phone, AlertCircle, User, MessageSquare } from 'lucide-react';

interface CrmActivity {
  id: string;
  leadName: string;
  type: 'CALL' | 'MEETING' | 'VISIT' | 'QUOTATION' | 'NOTE';
  summary: string;
  dateTime: string;
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  notes: string;
}

const INITIAL_ACTIVITIES: CrmActivity[] = [
  { id: '1', leadName: 'أحمد محمد علي', type: 'CALL', summary: 'مكالمة لمناقشة تعديلات عرض السعر', dateTime: '2026-08-21 11:30', status: 'PENDING', notes: 'العميل يطلب خصم إضافي 3% على كميات البورسلين الكبيرة.' },
  { id: '2', leadName: 'سارة إبراهيم', type: 'MEETING', summary: 'اجتماع في المعرض لاختيار الموديلات', dateTime: '2026-08-20 14:00', status: 'COMPLETED', notes: 'تم الاستقرار على الموديلات الإسبانية وتم تسليم كتالوجات الحمامات.' },
  { id: '3', leadName: 'طارق فتحي', type: 'VISIT', summary: 'زيارة موقع الفيلا لمعاينة المقاسات', dateTime: '2026-08-19 10:00', status: 'COMPLETED', notes: 'المقاسات الفعلية مطابقة للمخطط الهندسي.' },
  { id: '4', leadName: 'كريم عبدالله', type: 'QUOTATION', summary: 'إرسال عرض السعر الأول عبر الواتساب', dateTime: '2026-08-21 09:00', status: 'COMPLETED', notes: 'العرض صالح لمدة 15 يوماً.' },
  { id: '5', leadName: 'نورا حسن', type: 'CALL', summary: 'مكالمة ترحيبية وتعريفية بالمعرض', dateTime: '2026-08-22 12:00', status: 'PENDING', notes: 'متابعة أولية لمعرفة موعد استلام الشقة.' },
];

const TYPE_CONFIG: Record<CrmActivity['type'], { label: string; color: string; icon: React.ElementType }> = {
  CALL: { label: 'اتصال هاتف', color: 'text-sky-400 bg-sky-500/10 border-sky-500/20', icon: Phone },
  MEETING: { label: 'اجتماع', color: 'text-violet-400 bg-violet-500/10 border-violet-500/20', icon: User },
  VISIT: { label: 'زيارة موقع', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', icon: Calendar },
  QUOTATION: { label: 'عرض سعر', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', icon: Activity },
  NOTE: { label: 'ملاحظة', color: 'text-slate-400 bg-slate-500/10 border-slate-500/20', icon: MessageSquare },
};

export const CrmActivitiesPage: React.FC = () => {
  const [activities, setActivities] = useState<CrmActivity[]>(INITIAL_ACTIVITIES);
  const [search, setSearch] = useState('');

  const filteredActivities = activities.filter(act => 
    act.leadName.includes(search) || act.summary.includes(search) || act.notes.includes(search)
  );

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <Activity className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-base font-black text-white">الأنشطة والمتابعات</h1>
            <p className="text-xs text-slate-400">سجل وتخطيط الفعاليات والمتابعات مع العملاء</p>
          </div>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-sm font-semibold transition shrink-0 self-start sm:self-auto">
          <Plus className="w-4 h-4" />
          جدولة نشاط جديد
        </button>
      </div>

      {/* Filters */}
      <div className="p-4 bg-slate-900/50 border-b border-slate-900 flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="بحث باسم العميل، الوصف، الملاحظات..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-4 pr-10 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500/50 transition"
          />
        </div>
      </div>

      {/* Content split in Timeline & Details */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6 relative before:absolute before:right-6 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
          {filteredActivities.map((act) => {
            const config = TYPE_CONFIG[act.type];
            const Icon = config.icon;
            return (
              <div key={act.id} className="relative pr-12 group">
                {/* Timeline node icon */}
                <div className={`absolute right-3.5 top-1.5 w-6 h-6 rounded-full border-2 border-slate-950 flex items-center justify-center z-10 ${
                  act.status === 'COMPLETED' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                }`}>
                  {act.status === 'COMPLETED' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                </div>

                {/* Card Container */}
                <div className="bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-xl p-4 transition">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-white">{act.leadName}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold border ${config.color} flex items-center gap-1`}>
                        <Icon className="w-3 h-3" />
                        {config.label}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1 sm:self-auto self-start">
                      <Clock className="w-3 h-3" />
                      {act.dateTime}
                    </span>
                  </div>

                  <h4 className="text-sm font-bold text-slate-200 mb-1.5">{act.summary}</h4>
                  {act.notes && (
                    <p className="text-xs text-slate-400 bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/40 leading-relaxed">
                      {act.notes}
                    </p>
                  )}

                  {/* Quick actions for Pending items */}
                  {act.status === 'PENDING' && (
                    <div className="mt-3 flex gap-2">
                      <button 
                        onClick={() => {
                          setActivities(prev => prev.map(a => a.id === act.id ? { ...a, status: 'COMPLETED' } : a));
                        }}
                        className="px-3 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-lg text-[10px] font-bold transition"
                      >
                        تحديد كمكتمل
                      </button>
                      <button 
                        className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] font-bold transition"
                      >
                        تعديل الموعد
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {filteredActivities.length === 0 && (
            <div className="py-16 text-center text-slate-500 border-2 border-dashed border-slate-800 rounded-2xl">
              <AlertCircle className="w-12 h-12 text-slate-700 mx-auto mb-3" />
              <p className="text-sm">لا توجد أنشطة مجدولة أو مسجلة حالياً</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};