import React, { useState } from 'react';
import { Workflow, Plus, Phone, Clock, DollarSign, User } from 'lucide-react';

type Stage = 'LEAD' | 'CONTACTED' | 'QUALIFIED' | 'QUOTATION' | 'NEGOTIATION' | 'WON' | 'LOST';

interface Lead {
  id: string; name: string; company: string; phone: string;
  value: number; stage: Stage; assignedTo: string; lastActivity: string;
}

const STAGES: { id: Stage; label: string; color: string; bg: string; border: string }[] = [
  { id: 'LEAD',        label: 'عميل محتمل',  color: 'text-slate-400',   bg: 'bg-slate-800',       border: 'border-slate-700' },
  { id: 'CONTACTED',   label: 'تم التواصل',  color: 'text-sky-400',     bg: 'bg-sky-500/10',      border: 'border-sky-500/30' },
  { id: 'QUALIFIED',   label: 'مؤهل',        color: 'text-violet-400',  bg: 'bg-violet-500/10',   border: 'border-violet-500/30' },
  { id: 'QUOTATION',   label: 'عرض سعر',     color: 'text-amber-400',   bg: 'bg-amber-500/10',    border: 'border-amber-500/30' },
  { id: 'NEGOTIATION', label: 'تفاوض',       color: 'text-orange-400',  bg: 'bg-orange-500/10',   border: 'border-orange-500/30' },
  { id: 'WON',         label: 'تم الإغلاق',  color: 'text-emerald-400', bg: 'bg-emerald-500/10',  border: 'border-emerald-500/30' },
  { id: 'LOST',        label: 'خسارة',       color: 'text-rose-400',    bg: 'bg-rose-500/10',     border: 'border-rose-500/30' },
];

// Demo data
const DEMO_LEADS: Lead[] = [
  { id: '1', name: 'أحمد محمد علي', company: 'مقاولات النيل', phone: '0100000001', value: 85000, stage: 'QUOTATION', assignedTo: 'محمد سعيد', lastActivity: 'منذ يوم' },
  { id: '2', name: 'سارة إبراهيم', company: 'شركة الفنون', phone: '0110000002', value: 42000, stage: 'NEGOTIATION', assignedTo: 'أمل خالد', lastActivity: 'منذ 3 أيام' },
  { id: '3', name: 'كريم عبدالله', company: 'مشاريع الخليج', phone: '0120000003', value: 120000, stage: 'QUALIFIED', assignedTo: 'محمد سعيد', lastActivity: 'اليوم' },
  { id: '4', name: 'نورا حسن', company: '', phone: '0130000004', value: 25000, stage: 'LEAD', assignedTo: 'أمل خالد', lastActivity: 'منذ أسبوع' },
  { id: '5', name: 'طارق فتحي', company: 'ديكور برستيج', phone: '0140000005', value: 65000, stage: 'CONTACTED', assignedTo: 'محمد سعيد', lastActivity: 'منذ يومين' },
  { id: '6', name: 'منى صلاح', company: 'فيلا مشروع النرجس', phone: '0150000006', value: 200000, stage: 'WON', assignedTo: 'أمل خالد', lastActivity: 'منذ 5 أيام' },
];

export const PipelinePage: React.FC = () => {
  const [leads] = useState<Lead[]>(DEMO_LEADS);

  const fmt = (n: number) => new Intl.NumberFormat('ar-EG').format(n) + ' ج';

  const getLeadsForStage = (stage: Stage) => leads.filter(l => l.stage === stage);
  const stageTotal = (stage: Stage) => getLeadsForStage(stage).reduce((s, l) => s + l.value, 0);

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Workflow className="w-5 h-5 text-violet-400" />
          <h1 className="text-base font-black text-white">Pipeline المبيعات</h1>
          <span className="text-xs bg-violet-500/20 text-violet-400 px-2 py-0.5 rounded-full font-bold">
            {leads.length} فرصة — {fmt(leads.reduce((s, l) => s + l.value, 0))}
          </span>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-sm font-semibold transition">
          <Plus className="w-4 h-4" />
          فرصة جديدة
        </button>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
        <div className="flex gap-3 h-full min-w-max">
          {STAGES.map(stage => {
            const stageLeads = getLeadsForStage(stage.id);
            return (
              <div key={stage.id} className="w-[240px] flex flex-col bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
                {/* Stage Header */}
                <div className={`px-3 py-2.5 border-b border-slate-800 ${stage.bg}`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-bold ${stage.color}`}>{stage.label}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-500 font-mono">{stageLeads.length}</span>
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black ${stage.bg} ${stage.color} border ${stage.border}`}>
                        {stageLeads.length}
                      </span>
                    </div>
                  </div>
                  {stageLeads.length > 0 && (
                    <div className={`text-[10px] mt-0.5 ${stage.color} font-semibold opacity-70`}>
                      {fmt(stageTotal(stage.id))}
                    </div>
                  )}
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {stageLeads.map(lead => (
                    <div
                      key={lead.id}
                      className="bg-slate-800 hover:bg-slate-750 rounded-lg p-3 cursor-pointer border border-slate-700 hover:border-slate-600 transition-all group"
                    >
                      <div className="font-semibold text-white text-sm truncate">{lead.name}</div>
                      {lead.company && (
                        <div className="text-[10px] text-slate-400 truncate mt-0.5">{lead.company}</div>
                      )}

                      <div className="flex items-center justify-between mt-2.5">
                        <div className="flex items-center gap-1 text-[10px] text-slate-500">
                          <Phone className="w-2.5 h-2.5" />
                          <span>{lead.phone}</span>
                        </div>
                        <div className="text-[10px] font-bold text-sky-400">{fmt(lead.value)}</div>
                      </div>

                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-700">
                        <div className="flex items-center gap-1 text-[9px] text-slate-500">
                          <User className="w-2.5 h-2.5" />
                          <span className="truncate max-w-[80px]">{lead.assignedTo}</span>
                        </div>
                        <div className="flex items-center gap-1 text-[9px] text-slate-500">
                          <Clock className="w-2.5 h-2.5" />
                          <span>{lead.lastActivity}</span>
                        </div>
                      </div>
                    </div>
                  ))}

                  {stageLeads.length === 0 && (
                    <div className="text-center text-slate-600 text-xs py-8 border-2 border-dashed border-slate-800 rounded-lg">
                      لا توجد فرص
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
