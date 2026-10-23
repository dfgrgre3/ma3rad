import React, { useEffect, useState } from 'react';
import { Workflow, Phone, Clock, User, Loader2, ArrowLeft, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { CrmService, Lead, LeadStage } from '../../services/CrmService';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';

const STAGES: { id: LeadStage; label: string; color: string; bg: string; border: string }[] = [
  { id: 'NEW',         label: 'عميل محتمل',  color: 'text-slate-600',   bg: 'bg-slate-100',  border: 'border-slate-300' },
  { id: 'CONTACTED',   label: 'تم التواصل',  color: 'text-sky-600',     bg: 'bg-sky-50',     border: 'border-sky-200' },
  { id: 'QUALIFIED',   label: 'مؤهل',        color: 'text-violet-600',  bg: 'bg-violet-50',  border: 'border-violet-200' },
  { id: 'QUOTATION',   label: 'عرض سعر',     color: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-200' },
  { id: 'NEGOTIATION', label: 'تفاوض',       color: 'text-orange-600',  bg: 'bg-orange-50',  border: 'border-orange-200' },
  { id: 'WON',         label: 'تم الإغلاق',  color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  { id: 'LOST',        label: 'خسارة',       color: 'text-rose-600',    bg: 'bg-rose-50',    border: 'border-rose-200' },
];

const fmt = (n: number) => new Intl.NumberFormat('ar-EG').format(n) + ' ج';

export const PipelinePage: React.FC = () => {
  const service = new CrmService();
  const navigate = useNavigate();
  const user = AuthService.getCurrentUser();
  const canUpdate = PermissionService.can(user, 'crm.update');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    try {
      setLeads(service.getLeads());
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل الفرص.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const move = (lead: Lead, direction: -1 | 1) => {
    const index = STAGES.findIndex((s) => s.id === lead.stage);
    const next = STAGES[index + direction];
    if (!next) return;
    try {
      service.updateLead(lead.id, { stage: next.id });
      load();
    } catch (err: any) {
      alert(err?.message || 'تعذر تحديث المرحلة.');
    }
  };

  const total = leads.reduce((s, l) => s + (l.estimatedValue || 0), 0);

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Workflow className="w-5 h-5 text-violet-600" />
          <h1 className="text-base font-black text-slate-900">Pipeline المبيعات</h1>
          <span className="text-xs bg-violet-50 text-violet-600 px-2 py-0.5 rounded-full font-bold border border-violet-200">
            {leads.length} فرصة — {fmt(total)}
          </span>
        </div>
        <button onClick={() => navigate('/crm/leads')} className="text-xs font-bold text-sky-600 hover:text-sky-700 transition">
          إدارة العملاء المحتملين
        </button>
      </div>

      {error && <div className="mx-4 mt-3 px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{error}</div>}

      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
        {loading ? (
          <div className="h-full flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-violet-500" /></div>
        ) : (
          <div className="flex gap-3 h-full min-w-max">
            {STAGES.map((stage) => {
              const stageLeads = leads.filter((l) => l.stage === stage.id);
              const stageTotal = stageLeads.reduce((s, l) => s + (l.estimatedValue || 0), 0);
              return (
                <div key={stage.id} className="w-[250px] flex flex-col bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className={`px-3 py-2.5 border-b border-slate-200 ${stage.bg}`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-bold ${stage.color}`}>{stage.label}</span>
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black ${stage.bg} ${stage.color} border ${stage.border}`}>
                        {stageLeads.length}
                      </span>
                    </div>
                    {stageLeads.length > 0 && (
                      <div className={`text-[10px] mt-0.5 ${stage.color} font-semibold opacity-80`}>{fmt(stageTotal)}</div>
                    )}
                  </div>

                  <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {stageLeads.map((lead) => (
                      <div key={lead.id} className="bg-slate-50 hover:bg-slate-100 rounded-lg p-3 border border-slate-200 transition-all group">
                        <div className="font-semibold text-slate-900 text-sm truncate">{lead.name}</div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">{lead.code}</div>

                        <div className="flex items-center justify-between mt-2.5">
                          <div className="flex items-center gap-1 text-[10px] text-slate-500" dir="ltr">
                            <Phone className="w-2.5 h-2.5" />
                            <span>{lead.phone}</span>
                          </div>
                          <div className="text-[10px] font-bold text-sky-600">{fmt(lead.estimatedValue || 0)}</div>
                        </div>

                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200">
                          <div className="flex items-center gap-1 text-[9px] text-slate-500">
                            <User className="w-2.5 h-2.5" />
                            <span>{(lead as any).assignedName || 'غير مُسند'}</span>
                          </div>
                          {lead.nextFollowUp && (
                            <div className="flex items-center gap-1 text-[9px] text-slate-500">
                              <Clock className="w-2.5 h-2.5" />
                              <span>{lead.nextFollowUp.slice(0, 10)}</span>
                            </div>
                          )}
                        </div>

                        {canUpdate && (
                          <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition">
                            <button onClick={() => move(lead, -1)} disabled={stage.id === 'NEW'} className="flex-1 py-1 rounded bg-white border border-slate-200 text-slate-600 disabled:opacity-30 hover:border-slate-300" title="مرحلة سابقة">
                              <ArrowRight className="w-3 h-3 mx-auto" />
                            </button>
                            <button onClick={() => move(lead, 1)} disabled={stage.id === 'LOST'} className="flex-1 py-1 rounded bg-white border border-slate-200 text-slate-600 disabled:opacity-30 hover:border-slate-300" title="مرحلة تالية">
                              <ArrowLeft className="w-3 h-3 mx-auto" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}

                    {stageLeads.length === 0 && (
                      <div className="text-center text-slate-400 text-xs py-8 border-2 border-dashed border-slate-100 rounded-lg">لا توجد فرص</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
