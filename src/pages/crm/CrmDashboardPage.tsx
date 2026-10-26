import React, { useEffect, useMemo, useState } from 'react';
import {
  Users, TrendingUp, Target, Phone, Activity, Calendar, Award, AlertCircle,
  ArrowUpRight, Clock, MessageSquare, Loader2, RefreshCw, Filter, BarChart3,
  UserCheck, UserX, Star, Wallet, CheckCircle2, XCircle, Building2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { CrmService, Lead, LeadStage } from '../../services/CrmService';
import { DatabaseManager } from '../../database/db';
import { AuthService } from '../../services/AuthService';

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
  NEW:         { label: 'جديد',       color: 'text-slate-600',   bg: 'bg-slate-50',   border: 'border-slate-200',  dark: 'bg-slate-400' },
  CONTACTED:   { label: 'تواصلنا',    color: 'text-sky-700',     bg: 'bg-sky-50',     border: 'border-sky-200',    dark: 'bg-sky-500' },
  QUALIFIED:   { label: 'مؤهل',       color: 'text-violet-700',  bg: 'bg-violet-50',  border: 'border-violet-200', dark: 'bg-violet-500' },
  QUOTATION:   { label: 'عرض سعر',    color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200',  dark: 'bg-amber-500' },
  NEGOTIATION: { label: 'تفاوض',      color: 'text-orange-700',  bg: 'bg-orange-50',  border: 'border-orange-200', dark: 'bg-orange-500' },
  WON:         { label: 'مكتسب',      color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200',dark: 'bg-emerald-500' },
  LOST:        { label: 'خسارة',      color: 'text-rose-700',    bg: 'bg-rose-50',    border: 'border-rose-200',   dark: 'bg-rose-500' },
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

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, color, bg }: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color: string; bg: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-start gap-4 hover:shadow-md transition-shadow">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${bg}`}>
        <Icon className={`w-6 h-6 ${color}`} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 font-medium">{label}</p>
        <p className="text-2xl font-black text-slate-900 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Pipeline Funnel ──────────────────────────────────────────────────────────
function PipelineFunnel({ stages }: { stages: { stage: LeadStage; count: number; value: number }[] }) {
  const PIPELINE_STAGES: LeadStage[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'QUOTATION', 'NEGOTIATION', 'WON'];
  const max = Math.max(...stages.map(s => s.count), 1);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Target className="w-4 h-4 text-violet-500" />
        <h3 className="text-sm font-black text-slate-900">مسار المبيعات</h3>
      </div>
      <div className="space-y-2">
        {PIPELINE_STAGES.map(stageId => {
          const cfg = STAGE_CONFIG[stageId];
          const data = stages.find(s => s.stage === stageId) || { count: 0, value: 0 };
          const pct = Math.round((data.count / max) * 100);
          return (
            <div key={stageId} className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-500 w-16 text-left shrink-0">{cfg.label}</span>
              <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                <div
                  className={`h-full rounded-full ${cfg.dark} transition-all duration-700 flex items-center justify-end pr-2`}
                  style={{ width: `${Math.max(pct, data.count > 0 ? 8 : 0)}%` }}
                >
                  {data.count > 0 && (
                    <span className="text-white text-xs font-black">{data.count}</span>
                  )}
                </div>
              </div>
              <span className="text-xs text-slate-500 w-20 text-left shrink-0">{fmtK(data.value)} ج</span>
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
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className={`text-xs font-bold ${cfg.color}`}>خسائر: {lost.count} فرصة</span>
            <span className="text-xs text-rose-400">{fmtK(lost.value)} ج</span>
          </div>
        );
      })()}
    </div>
  );
}

// ─── Sources Chart ────────────────────────────────────────────────────────────
function SourcesChart({ sources }: { sources: { source: string; count: number; value: number }[] }) {
  const max = Math.max(...sources.map(s => s.count), 1);
  const colors = ['bg-sky-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500', 'bg-orange-500', 'bg-pink-500', 'bg-teal-500', 'bg-indigo-500', 'bg-slate-400'];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-4 h-4 text-sky-500" />
        <h3 className="text-sm font-black text-slate-900">مصادر العملاء المحتملين</h3>
      </div>
      <div className="space-y-2.5">
        {sources.slice(0, 7).map((s, i) => {
          const pct = Math.round((s.count / max) * 100);
          return (
            <div key={s.source} className="flex items-center gap-3">
              <span className="text-xs text-slate-600 w-20 shrink-0 font-medium">{SOURCE_LABELS[s.source] || s.source}</span>
              <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden">
                <div
                  className={`h-full rounded-full ${colors[i % colors.length]} transition-all duration-700`}
                  style={{ width: `${Math.max(pct, 5)}%` }}
                />
              </div>
              <span className="text-xs font-bold text-slate-700 w-6 shrink-0">{s.count}</span>
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
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Award className="w-4 h-4 text-amber-500" />
        <h3 className="text-sm font-black text-slate-900">أفضل المندوبين</h3>
      </div>
      {performers.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-6">لا توجد بيانات بعد</p>
      ) : (
        <div className="space-y-3">
          {performers.map((p, i) => {
            const rate = p.count > 0 ? Math.round((p.won / p.count) * 100) : 0;
            return (
              <div key={p.name} className="flex items-center gap-3">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                  i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-slate-100 text-slate-600' : 'bg-orange-50 text-orange-600'
                }`}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-900 truncate">{p.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-slate-400">{p.count} فرصة</span>
                    <span className="text-xs text-emerald-600 font-bold">{rate}% تحويل</span>
                  </div>
                </div>
                <div className="text-left">
                  <p className="text-xs font-black text-slate-900">{fmtK(p.value)} ج</p>
                  <p className="text-xs text-emerald-600">{p.won} مكتسب</p>
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
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-slate-500" />
          <h3 className="text-sm font-black text-slate-900">أحدث العملاء المحتملين</h3>
        </div>
        <button
          onClick={() => navigate('/crm/leads')}
          className="text-xs font-bold text-sky-600 hover:text-sky-700 transition flex items-center gap-1"
        >
          الكل <ArrowUpRight className="w-3 h-3" />
        </button>
      </div>
      {leads.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-6">لا يوجد عملاء محتملون بعد</p>
      ) : (
        <div className="space-y-2">
          {leads.map(lead => {
            const cfg = STAGE_CONFIG[lead.stage];
            const isOverdue = lead.nextFollowUp && new Date(lead.nextFollowUp) < new Date() && !['WON', 'LOST'].includes(lead.stage);
            return (
              <button
                key={lead.id}
                type="button"
                className="flex w-full items-center gap-3 p-2.5 rounded-xl text-right hover:bg-slate-50 transition"
                onClick={() => navigate('/crm/leads')}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${cfg.bg} ${cfg.color} ${cfg.border} border`}>
                  {lead.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-900 truncate">{lead.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`text-xs px-1.5 py-0.5 rounded-full border font-medium ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                      {cfg.label}
                    </span>
                    {isOverdue && (
                      <span className="text-xs text-rose-500 font-bold flex items-center gap-0.5">
                        <AlertCircle className="w-3 h-3" /> متأخر
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-left shrink-0">
                  <p className="text-xs font-black text-slate-700">{fmtK(lead.estimatedValue || 0)} ج</p>
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
  const service = useMemo(() => new CrmService(), []);
  const navigate = useNavigate();
  const [stats, setStats] = useState<CrmStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    try {
      setStats(buildStats(service));
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل إحصاءات CRM.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center shadow">
            <Target className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-black text-slate-900">لوحة تحكم CRM</h1>
            <p className="text-xs text-slate-400">مسار المبيعات وإدارة علاقات العملاء</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/crm/leads')} className="text-xs font-bold text-white bg-pink-600 hover:bg-pink-700 transition px-3 py-2 rounded-lg flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> العملاء المحتملون
          </button>
          <button onClick={() => navigate('/crm/pipeline')} className="text-xs font-bold text-violet-700 bg-violet-50 hover:bg-violet-100 transition px-3 py-2 rounded-lg flex items-center gap-1.5 border border-violet-200">
            <Target className="w-3.5 h-3.5" /> Pipeline
          </button>
          <button onClick={load} className="p-2 hover:bg-slate-100 rounded-lg transition" title="تحديث">
            <RefreshCw className={`w-4 h-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-6 mt-3 px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-pink-500" />
        </div>
      ) : stats ? (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* KPI Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="إجمالي العملاء المحتملين"
              value={fmt(stats.totalLeads)}
              sub={`${stats.newLeads} جديد هذه الفترة`}
              icon={Users} color="text-sky-600" bg="bg-sky-50"
            />
            <StatCard
              label="قيمة Pipeline الكلية"
              value={fmtK(stats.totalPipelineValue) + ' ج'}
              sub={`مكتسب: ${fmtK(stats.wonValue)} ج`}
              icon={Wallet} color="text-emerald-600" bg="bg-emerald-50"
            />
            <StatCard
              label="معدل التحويل"
              value={stats.conversionRate + '%'}
              sub={`${stats.wonLeads} فرصة مكتسبة`}
              icon={TrendingUp} color="text-violet-600" bg="bg-violet-50"
            />
            <StatCard
              label="متوسط قيمة الصفقة"
              value={fmtK(stats.avgDealSize) + ' ج'}
              sub={`${stats.lostLeads} فرصة ضائعة`}
              icon={Star} color="text-amber-600" bg="bg-amber-50"
            />
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'متابعات متأخرة', value: stats.overdueFollowUps, color: 'text-rose-600 bg-rose-50 border-rose-200', icon: AlertCircle, to: '/crm/leads' },
              { label: 'أنشطة هذا الأسبوع', value: stats.activitiesThisWeek, color: 'text-sky-600 bg-sky-50 border-sky-200', icon: Activity, to: '/crm/activities' },
              { label: 'في مرحلة التفاوض', value: stats.leadsPerStage.find(s => s.stage === 'NEGOTIATION')?.count || 0, color: 'text-orange-600 bg-orange-50 border-orange-200', icon: MessageSquare, to: '/crm/pipeline' },
              { label: 'عروض أسعار مرسلة', value: stats.leadsPerStage.find(s => s.stage === 'QUOTATION')?.count || 0, color: 'text-amber-600 bg-amber-50 border-amber-200', icon: Calendar, to: '/crm/pipeline' },
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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'إدارة العملاء المحتملين', desc: 'إضافة وتتبع وتحديث الفرص', icon: UserCheck, to: '/crm/leads', color: 'from-pink-500 to-rose-600' },
              { label: 'Pipeline المبيعات', desc: 'عرض كانبان لمراحل البيع', icon: Target, to: '/crm/pipeline', color: 'from-violet-500 to-purple-600' },
              { label: 'الأنشطة والمتابعة', desc: 'المكالمات والزيارات والمواعيد', icon: Activity, to: '/crm/activities', color: 'from-sky-500 to-blue-600' },
              { label: 'الحملات التسويقية', desc: 'إدارة الحملات والنتائج', icon: Star, to: '/crm/campaigns', color: 'from-amber-500 to-orange-600' },
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
