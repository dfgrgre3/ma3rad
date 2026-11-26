import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useDashboardRefresh } from '../../../contexts/DashboardRefreshContext';
import { useDashboardEmbed } from '../../../contexts/DashboardEmbedContext';
import {
  Users, TrendingUp, Target, Activity, Calendar, Award, AlertCircle,
  ArrowUpRight, MessageSquare, Loader2, RefreshCw, BarChart3,
  UserCheck, Star, Wallet, Clock,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { CrmService, Lead, LeadStage } from '../../../services/domains/crm/CrmService';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { PageHeader } from '../../../components/ui/PageHeader';
import { ActivityGate } from '../../../components/ui/ActivityGate';
import { useActivityPageCopy } from '../../../hooks/domains/config/useBusinessTerm';
import { StatCard as UiStatCard } from '../../../components/ui/Card';


const statTone = (cls: string): 'default' | 'success' | 'danger' | 'warning' =>
  /rose|red|danger/.test(cls) ? 'danger' : /amber|orange/.test(cls) ? 'warning' : /emerald|green|success/.test(cls) ? 'success' : 'default';

function StatCard({ label, value, sub, icon: Icon, color, bg }: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color: string; bg: string;
}) {
  return (
    <UiStatCard
      label={label}
      value={value}
      hint={sub}
      icon={Icon ? <Icon className="h-5 w-5" /> : undefined}
      tone={statTone(color || bg || '')}
    />
  );
}
const db = DatabaseManager.getInstance();

interface CrmStats {
  totalLeads: number;
  newLeads: number;
  wonLeads: number;
  lostLeads: number;
  totalPipelineValue: number;
  wonValue: number;
  conversionRate: number;
  avgDealSize: number;
  activitiesThisWeek: number;
  overdueFollowUps: number;
  leadsPerStage: { stage: LeadStage; count: number; value: number }[];
  leadsPerSource: { source: string; count: number; value: number }[];
  leadsPerAssignee: { name: string; count: number; won: number; value: number }[];
  recentLeads: Lead[];
}

const STAGE_CONFIG: Record<LeadStage, { label: string; color: string; bg: string; border: string; dark: string }> = {
  NEW:         { label: 'جديد',       color: 'text-ink-secondary',   bg: 'bg-surface-muted',   border: 'border-line',  dark: 'bg-line-strong' },
  CONTACTED:   { label: 'تواصلنا',    color: 'text-primary',     bg: 'bg-accent-soft',     border: 'border-accent-border',    dark: 'bg-primary' },
  QUALIFIED:   { label: 'مؤهل',       color: 'text-primary',  bg: 'bg-accent-soft',  border: 'border-accent-border', dark: 'bg-primary' },
  QUOTATION:   { label: 'عرض سعر',    color: 'text-warning',   bg: 'bg-warning-soft',   border: 'border-warning-border',  dark: 'bg-warning' },
  NEGOTIATION: { label: 'تفاوض',      color: 'text-warning',  bg: 'bg-warning-soft',  border: 'border-warning-border', dark: 'bg-warning' },
  WON:         { label: 'مكتسب',      color: 'text-success', bg: 'bg-success-soft', border: 'border-success-border',dark: 'bg-success' },
  LOST:        { label: 'خسارة',      color: 'text-danger',    bg: 'bg-danger-soft',    border: 'border-danger-border',   dark: 'bg-danger' },
};

const SOURCE_LABELS: Record<string, string> = {
  WALK_IN: 'زيارة المعرض', PHONE: 'اتصال', WHATSAPP: 'واتساب',
  REFERRAL: 'توصية', SOCIAL: 'سوشيال', CAMPAIGN: 'حملة',
  ENGINEER: 'مهندس', CONTRACTOR: 'مقاول', OTHER: 'أخرى',
};

const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 0 }).format(n);
const fmtK = (n: number) => n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + 'م' : n >= 1000 ? (n / 1000).toFixed(1) + 'ك' : fmt(n);

function buildStats(service: CrmService): CrmStats {
  const leads = service.getLeads();
  const stages = service.getPipelineStats();

  const wonLeads = leads.filter(l => l.stage === 'WON').length;
  const lostLeads = leads.filter(l => l.stage === 'LOST').length;
  const closedLeads = wonLeads + lostLeads;
  const conversionRate = closedLeads > 0 ? Math.round((wonLeads / closedLeads) * 100) : 0;

  const wonValue = leads.filter(l => l.stage === 'WON').reduce((s, l) => s + (l.estimatedValue || 0), 0);
  const totalPipelineValue = leads.reduce((s, l) => s + (l.estimatedValue || 0), 0);
  const avgDealSize = wonLeads > 0 ? wonValue / wonLeads : 0;

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const activitiesThisWeek = db.query<{ c: number }>(
    `SELECT COUNT(*) AS c FROM crm_activities WHERE created_at >= ?`, [weekAgo]
  )[0]?.c ?? 0;

  const overdueFollowUps = leads.filter(l =>
    l.nextFollowUp && new Date(l.nextFollowUp) < now &&
    !['WON', 'LOST'].includes(l.stage)
  ).length;

  // Sources breakdown
  const sourceMap: Record<string, { count: number; value: number }> = {};
  leads.forEach(l => {
    if (!sourceMap[l.source]) sourceMap[l.source] = { count: 0, value: 0 };
    sourceMap[l.source].count++;
    sourceMap[l.source].value += l.estimatedValue || 0;
  });
  const leadsPerSource = Object.entries(sourceMap)
    .map(([source, d]) => ({ source, ...d }))
    .sort((a, b) => b.count - a.count);

  // Assignee breakdown
  const assigneeMap: Record<string, { count: number; won: number; value: number }> = {};
  leads.forEach(l => {
    const key = (l as any).assigned_name || 'غير مخصص';
    if (!assigneeMap[key]) assigneeMap[key] = { count: 0, won: 0, value: 0 };
    assigneeMap[key].count++;
    if (l.stage === 'WON') assigneeMap[key].won++;
    assigneeMap[key].value += l.estimatedValue || 0;
  });
  const leadsPerAssignee = Object.entries(assigneeMap)
    .map(([name, d]) => ({ name, ...d }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  return {
    totalLeads: leads.length,
    newLeads: leads.filter(l => l.stage === 'NEW').length,
    wonLeads,
    lostLeads,
    totalPipelineValue,
    wonValue,
    conversionRate,
    avgDealSize,
    activitiesThisWeek,
    overdueFollowUps,
    leadsPerStage: stages,
    leadsPerSource,
    leadsPerAssignee,
    recentLeads: leads.slice(0, 8),
  };
}

// ─── Pipeline Funnel ──────────────────────────────────────────────────────────
function PipelineFunnel({ stages }: { stages: { stage: LeadStage; count: number; value: number }[] }) {
  const PIPELINE_STAGES: LeadStage[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'QUOTATION', 'NEGOTIATION', 'WON'];
  const max = Math.max(...stages.map(s => s.count), 1);

  return (
    <div className="bg-surface rounded-2xl border border-line p-5">
      <div className="flex items-center gap-2 mb-4">
        <Target className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-black text-ink">مسار المبيعات</h3>
      </div>
      <div className="space-y-2">
        {PIPELINE_STAGES.map(stageId => {
          const cfg = STAGE_CONFIG[stageId];
          const data = stages.find(s => s.stage === stageId) || { count: 0, value: 0 };
          const pct = Math.round((data.count / max) * 100);
          return (
            <div key={stageId} className="flex items-center gap-3">
              <span className="text-xs font-bold text-muted w-16 text-left shrink-0">{cfg.label}</span>
              <div className="flex-1 bg-surface-sunken rounded-full h-5 overflow-hidden">
                <div
                  className={`h-full rounded-full ${cfg.dark} transition-all duration-700 flex items-center justify-end pr-2`}
                  style={{ width: `${Math.max(pct, data.count > 0 ? 8 : 0)}%` }}
                >
                  {data.count > 0 && (
                    <span className="text-white text-xs font-black">{data.count}</span>
                  )}
                </div>
              </div>
              <span className="text-xs text-muted w-20 text-left shrink-0">{fmtK(data.value)} ج</span>
            </div>
          );
        })}
      </div>
      {/* Lost separately */}
      {(() => {
        const lost = stages.find(s => s.stage === 'LOST');
        if (!lost || lost.count === 0) return null;
        const cfg = STAGE_CONFIG['LOST'];
        return (
          <div className="mt-3 pt-3 border-t border-line flex items-center justify-between">
            <span className={`text-xs font-bold ${cfg.color}`}>خسائر: {lost.count} فرصة</span>
            <span className="text-xs text-danger">{fmtK(lost.value)} ج</span>
          </div>
        );
      })()}
    </div>
  );
}

// ─── Sources Chart ────────────────────────────────────────────────────────────
function SourcesChart({ sources }: { sources: { source: string; count: number; value: number }[] }) {
  const max = Math.max(...sources.map(s => s.count), 1);
  const colors = ['bg-primary', 'bg-primary', 'bg-success', 'bg-warning', 'bg-warning', 'bg-primary', 'bg-success', 'bg-primary', 'bg-line-strong'];

  return (
    <div className="bg-surface rounded-2xl border border-line p-5">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-black text-ink">مصادر العملاء المحتملين</h3>
      </div>
      <div className="space-y-2.5">
        {sources.slice(0, 7).map((s, i) => {
          const pct = Math.round((s.count / max) * 100);
          return (
            <div key={s.source} className="flex items-center gap-3">
              <span className="text-xs text-ink-secondary w-20 shrink-0 font-medium">{SOURCE_LABELS[s.source] || s.source}</span>
              <div className="flex-1 bg-surface-sunken rounded-full h-4 overflow-hidden">
                <div
                  className={`h-full rounded-full ${colors[i % colors.length]} transition-all duration-700`}
                  style={{ width: `${Math.max(pct, 5)}%` }}
                />
              </div>
              <span className="text-xs font-bold text-ink w-6 shrink-0">{s.count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Top Performers ───────────────────────────────────────────────────────────
function TopPerformers({ performers }: { performers: { name: string; count: number; won: number; value: number }[] }) {
  return (
    <div className="bg-surface rounded-2xl border border-line p-5">
      <div className="flex items-center gap-2 mb-4">
        <Award className="w-4 h-4 text-warning" />
        <h3 className="text-sm font-black text-ink">أفضل المندوبين</h3>
      </div>
      {performers.length === 0 ? (
        <p className="text-xs text-muted text-center py-6">لا توجد بيانات بعد</p>
      ) : (
        <div className="space-y-3">
          {performers.map((p, i) => {
            const rate = p.count > 0 ? Math.round((p.won / p.count) * 100) : 0;
            return (
              <div key={p.name} className="flex items-center gap-3">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                  i === 0 ? 'bg-warning-soft text-warning' : i === 1 ? 'bg-surface-sunken text-ink-secondary' : 'bg-warning-soft text-warning'
                }`}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-ink truncate">{p.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted">{p.count} فرصة</span>
                    <span className="text-xs text-success font-bold">{rate}% تحويل</span>
                  </div>
                </div>
                <div className="text-left">
                  <p className="text-xs font-black text-ink">{fmtK(p.value)} ج</p>
                  <p className="text-xs text-success">{p.won} مكتسب</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Recent Leads ─────────────────────────────────────────────────────────────
function RecentLeadsList({ leads }: { leads: Lead[] }) {
  const navigate = useNavigate();
  return (
    <div className="bg-surface rounded-2xl border border-line p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted" />
          <h3 className="text-sm font-black text-ink">أحدث العملاء المحتملين</h3>
        </div>
        <button
          onClick={() => navigate('/crm/leads')}
          className="text-xs font-bold text-primary hover:text-primary transition flex items-center gap-1"
        >
          الكل <ArrowUpRight className="w-3 h-3" />
        </button>
      </div>
      {leads.length === 0 ? (
        <p className="text-xs text-muted text-center py-6">لا يوجد عملاء محتملون بعد</p>
      ) : (
        <div className="space-y-2">
          {leads.map(lead => {
            const cfg = STAGE_CONFIG[lead.stage];
            const isOverdue = lead.nextFollowUp && new Date(lead.nextFollowUp) < new Date() && !['WON', 'LOST'].includes(lead.stage);
            return (
              <button
                key={lead.id}
                type="button"
                className="flex w-full items-center gap-3 p-2.5 rounded-xl text-right hover:bg-surface-muted transition"
                onClick={() => navigate('/crm/leads')}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${cfg.bg} ${cfg.color} ${cfg.border} border`}>
                  {lead.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-ink truncate">{lead.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`text-xs px-1.5 py-0.5 rounded-full border font-medium ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                      {cfg.label}
                    </span>
                    {isOverdue && (
                      <span className="text-xs text-danger font-bold flex items-center gap-0.5">
                        <AlertCircle className="w-3 h-3" /> متأخر
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-left shrink-0">
                  <p className="text-xs font-black text-ink">{fmtK(lead.estimatedValue || 0)} ج</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export const CrmDashboardPage: React.FC = () => {
  const pageCopy = useActivityPageCopy('crm');
  const refreshToken = useDashboardRefresh()?.refreshToken;
  const embedded = useDashboardEmbed();
  const initialRef = useRef(true);
  const service = useMemo(() => new CrmService(), []);
  const navigate = useNavigate();
  const [stats, setStats] = useState<CrmStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    try {
      PermissionService.requireAny(AuthService.requireAuth(), ['crm.view', 'crm.dashboard.view'], '/crm/dashboard');
      setStats(buildStats(service));
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل إحصاءات CRM.');
    } finally {
      setLoading(false);
    }
  }, [service, setLoading, setStats, setError]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (refreshToken === undefined) return;
    if (initialRef.current) { initialRef.current = false; return; }
    load();
  }, [refreshToken, load]);

  return (
    <div className="h-full flex flex-col bg-surface-muted text-ink overflow-hidden">
      {/* Header */}
      {embedded ? (
        <div className="flex flex-wrap items-center justify-end gap-2 px-4 pt-3 flex-shrink-0">
          <ActivityGate element="lead"><button onClick={() => navigate('/crm/leads')} className="text-xs font-bold text-white bg-primary hover:bg-primary transition px-3 py-1.5 rounded-lg flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> العملاء المحتملون
          </button></ActivityGate>
          <ActivityGate element="pipeline"><button onClick={() => navigate('/crm/pipeline')} className="text-xs font-bold text-primary bg-accent-soft hover:bg-accent-soft transition px-3 py-1.5 rounded-lg flex items-center gap-1.5 border border-accent-border">
            <Target className="w-3.5 h-3.5" /> Pipeline
          </button></ActivityGate>
          <button onClick={load} className="p-1.5 hover:bg-surface-sunken rounded-lg transition" title="تحديث">
            <RefreshCw className={`w-4 h-4 text-muted ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      ) : (
      <div className="bg-surface border-b border-line px-6 pt-4 flex-shrink-0">
        <PageHeader
          icon={<Target className="w-5 h-5" />}
          title={pageCopy?.title || 'لوحة تحكم CRM'}
          description={pageCopy?.description || 'مسار المبيعات وإدارة علاقات العملاء'}
          actions={<>
            <ActivityGate element="lead"><button onClick={() => navigate('/crm/leads')} className="text-xs font-bold text-white bg-primary hover:bg-primary transition px-3 py-2 rounded-lg flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> العملاء المحتملون
            </button></ActivityGate>
            <ActivityGate element="pipeline"><button onClick={() => navigate('/crm/pipeline')} className="text-xs font-bold text-primary bg-accent-soft hover:bg-accent-soft transition px-3 py-2 rounded-lg flex items-center gap-1.5 border border-accent-border">
              <Target className="w-3.5 h-3.5" /> Pipeline
            </button></ActivityGate>
            <button onClick={load} className="p-2 hover:bg-surface-sunken rounded-lg transition" title="تحديث">
              <RefreshCw className={`w-4 h-4 text-muted ${loading ? 'animate-spin' : ''}`} />
            </button>
          </>}
        />
      </div>
      )}

      {/* Error */}
      {error && (
        <div className="mx-6 mt-3 px-4 py-3 bg-danger-soft border border-danger-border rounded-xl text-danger text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : stats ? (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* KPI Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="إجمالي العملاء المحتملين"
              value={fmt(stats.totalLeads)}
              sub={`${stats.newLeads} جديد هذه الفترة`}
              icon={Users} color="text-primary" bg="bg-accent-soft"
            />
            <StatCard
              label="قيمة Pipeline الكلية"
              value={fmtK(stats.totalPipelineValue) + ' ج'}
              sub={`مكتسب: ${fmtK(stats.wonValue)} ج`}
              icon={Wallet} color="text-success" bg="bg-success-soft"
            />
            <StatCard
              label="معدل التحويل"
              value={stats.conversionRate + '%'}
              sub={`${stats.wonLeads} فرصة مكتسبة`}
              icon={TrendingUp} color="text-primary" bg="bg-accent-soft"
            />
            <StatCard
              label="متوسط قيمة الصفقة"
              value={fmtK(stats.avgDealSize) + ' ج'}
              sub={`${stats.lostLeads} فرصة ضائعة`}
              icon={Star} color="text-warning" bg="bg-warning-soft"
            />
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'متابعات متأخرة', value: stats.overdueFollowUps, color: 'text-danger bg-danger-soft border-danger-border', icon: AlertCircle, to: '/crm/leads' },
              { label: 'أنشطة هذا الأسبوع', value: stats.activitiesThisWeek, color: 'text-primary bg-accent-soft border-accent-border', icon: Activity, to: '/crm/activities' },
              { label: 'في مرحلة التفاوض', value: stats.leadsPerStage.find(s => s.stage === 'NEGOTIATION')?.count || 0, color: 'text-warning bg-warning-soft border-warning-border', icon: MessageSquare, to: '/crm/pipeline' },
              { label: 'عروض أسعار مرسلة', value: stats.leadsPerStage.find(s => s.stage === 'QUOTATION')?.count || 0, color: 'text-warning bg-warning-soft border-warning-border', icon: Calendar, to: '/crm/pipeline' },
            ].map(item => (
              <button
                key={item.label}
                onClick={() => navigate(item.to)}
                className={`flex items-center gap-3 p-4 rounded-2xl border text-right hover:shadow-md transition-shadow ${item.color}`}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                <div>
                  <p className="text-xl font-black">{item.value}</p>
                  <p className="text-xs font-medium opacity-80">{item.label}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Middle Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <PipelineFunnel stages={stats.leadsPerStage} />
            <SourcesChart sources={stats.leadsPerSource} />
          </div>

          {/* Bottom Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TopPerformers performers={stats.leadsPerAssignee} />
            <RecentLeadsList leads={stats.recentLeads} />
          </div>

          {/* Navigation Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'إدارة العملاء المحتملين', desc: 'إضافة وتتبع وتحديث الفرص', icon: UserCheck, to: '/crm/leads', color: 'from-primary to-danger' },
              { label: 'Pipeline المبيعات', desc: 'عرض كانبان لمراحل البيع', icon: Target, to: '/crm/pipeline', color: 'from-primary to-primary' },
              { label: 'الأنشطة والمتابعة', desc: 'المكالمات والزيارات والمواعيد', icon: Activity, to: '/crm/activities', color: 'from-primary to-primary' },
              { label: 'الحملات التسويقية', desc: 'إدارة الحملات والنتائج', icon: Star, to: '/crm/campaigns', color: 'from-warning to-warning' },
            ].map(card => (
              <button
                key={card.to}
                onClick={() => navigate(card.to)}
                className={`bg-gradient-to-br ${card.color} text-white rounded-2xl p-4 text-right hover:opacity-90 hover:shadow-lg transition-all`}
              >
                <card.icon className="w-6 h-6 mb-2 opacity-90" />
                <p className="text-sm font-black">{card.label}</p>
                <p className="text-xs opacity-70 mt-0.5">{card.desc}</p>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};
