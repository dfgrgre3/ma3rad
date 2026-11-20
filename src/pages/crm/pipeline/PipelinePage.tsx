import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { Workflow, Phone, Clock, User, Loader2, ArrowLeft, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { CrmService, Lead, LeadStage } from '../../../services/domains/crm/CrmService';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';

import { useToast } from '../../../components/ui/Toast';
import { PageHeader } from '../../../components/ui/PageHeader';
import { ActivityGate } from '../../../components/ui/ActivityGate';
const STAGES: { id: LeadStage; label: string; color: string; bg: string; border: string }[] = [
  { id: 'NEW',         label: 'عميل محتمل',  color: 'text-ink-secondary',   bg: 'bg-surface-sunken',  border: 'border-line-strong' },
  { id: 'CONTACTED',   label: 'تم التواصل',  color: 'text-primary',     bg: 'bg-accent-soft',     border: 'border-accent-border' },
  { id: 'QUALIFIED',   label: 'مؤهل',        color: 'text-primary',  bg: 'bg-accent-soft',  border: 'border-accent-border' },
  { id: 'QUOTATION',   label: 'عرض سعر',     color: 'text-warning',   bg: 'bg-warning-soft',   border: 'border-warning-border' },
  { id: 'NEGOTIATION', label: 'تفاوض',       color: 'text-warning',  bg: 'bg-warning-soft',  border: 'border-warning-border' },
  { id: 'WON',         label: 'تم الإغلاق',  color: 'text-success', bg: 'bg-success-soft', border: 'border-success-border' },
  { id: 'LOST',        label: 'خسارة',       color: 'text-danger',    bg: 'bg-danger-soft',    border: 'border-danger-border' },
];

const fmt = (n: number) => new Intl.NumberFormat('ar-EG').format(n) + ' ج';

export const PipelinePage: React.FC = () => {
  const toast = useToast();
  const service = useMemo(() => new CrmService(), []);
  const navigate = useNavigate();
  const user = AuthService.getCurrentUser();
  const canUpdate = PermissionService.can(user, 'ui.crm.pipeline.update');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    try {
      setLeads(service.getLeads());
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل الفرص.');
    } finally {
      setLoading(false);
    }
  }, [service, setLeads, setError, setLoading]);

  useEffect(() => { load(); }, [load]);

  const move = (lead: Lead, direction: -1 | 1) => {
    const index = STAGES.findIndex((s) => s.id === lead.stage);
    const next = STAGES[index + direction];
    if (!next) return;
    try {
      service.updateLead(lead.id, { stage: next.id });
      load();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر تحديث المرحلة.');
    }
  };

  const total = leads.reduce((s, l) => s + (l.estimatedValue || 0), 0);

  return (
    <div className="h-full flex flex-col bg-surface-muted text-ink overflow-hidden">
      <div className="bg-surface border-b border-line px-6 pt-4">
        <PageHeader
          icon={<Workflow className="w-5 h-5" />}
          title={
            <span className="flex items-center gap-2">
              Pipeline المبيعات
              <span className="text-xs bg-accent-soft text-primary px-2 py-0.5 rounded-full font-bold border border-accent-border">
                {leads.length} فرصة — {fmt(total)}
              </span>
            </span>
          }
          actions={
            <ActivityGate element="lead"><button onClick={() => navigate('/crm/leads')} className="text-xs font-bold text-primary hover:text-primary transition">
              إدارة العملاء المحتملين
            </button></ActivityGate>
          }
        />
      </div>

      {error && <div className="mx-4 mt-3 px-4 py-2.5 rounded-xl bg-danger-soft border border-danger-border text-danger text-xs font-semibold">{error}</div>}

      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
        {loading ? (
          <div className="h-full flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : (
          <div className="flex gap-3 h-full min-w-max">
            {STAGES.map((stage) => {
              const stageLeads = leads.filter((l) => l.stage === stage.id);
              const stageTotal = stageLeads.reduce((s, l) => s + (l.estimatedValue || 0), 0);
              return (
                <div key={stage.id} className="w-[250px] flex flex-col bg-surface rounded-xl border border-line overflow-hidden">
                  <div className={`px-3 py-2.5 border-b border-line ${stage.bg}`}>
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
                      <div key={lead.id} className="bg-surface-muted hover:bg-surface-sunken rounded-lg p-3 border border-line transition-all group">
                        <div className="font-semibold text-ink text-sm truncate">{lead.name}</div>
                        <div className="text-[10px] text-muted font-mono mt-0.5">{lead.code}</div>

                        <div className="flex items-center justify-between mt-2.5">
                          <div className="flex items-center gap-1 text-[10px] text-muted" dir="ltr">
                            <Phone className="w-2.5 h-2.5" />
                            <span>{lead.phone}</span>
                          </div>
                          <div className="text-[10px] font-bold text-primary">{fmt(lead.estimatedValue || 0)}</div>
                        </div>

                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-line">
                          <div className="flex items-center gap-1 text-[9px] text-muted">
                            <User className="w-2.5 h-2.5" />
                            <span>{(lead as any).assignedName || 'غير مُسند'}</span>
                          </div>
                          {lead.nextFollowUp && (
                            <div className="flex items-center gap-1 text-[9px] text-muted">
                              <Clock className="w-2.5 h-2.5" />
                              <span>{lead.nextFollowUp.slice(0, 10)}</span>
                            </div>
                          )}
                        </div>

                        {canUpdate && (
                          <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition">
                            <button onClick={() => move(lead, -1)} disabled={stage.id === 'NEW'} className="flex-1 py-1 rounded bg-surface border border-line text-ink-secondary disabled:opacity-30 hover:border-line-strong" title="مرحلة سابقة">
                              <ArrowRight className="w-3 h-3 mx-auto" />
                            </button>
                            <button onClick={() => move(lead, 1)} disabled={stage.id === 'LOST'} className="flex-1 py-1 rounded bg-surface border border-line text-ink-secondary disabled:opacity-30 hover:border-line-strong" title="مرحلة تالية">
                              <ArrowLeft className="w-3 h-3 mx-auto" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}

                    {stageLeads.length === 0 && (
                      <div className="text-center text-muted text-xs py-8 border-2 border-dashed border-line rounded-lg">لا توجد فرص</div>
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
