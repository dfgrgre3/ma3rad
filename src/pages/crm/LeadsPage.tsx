import React, { useState } from 'react';
import { UserRound, Plus, Search, Filter, Phone, Mail, Building2, Tag, Calendar, ChevronRight } from 'lucide-react';

interface Lead {
  id: string;
  name: string;
  company: string;
  phone: string;
  email: string;
  source: string;
  interest: string;
  status: 'LEAD' | 'CONTACTED' | 'QUALIFIED' | 'QUOTATION' | 'NEGOTIATION' | 'WON' | 'LOST';
  createdAt: string;
}

const INITIAL_LEADS: Lead[] = [
  { id: '1', name: 'أحمد محمد علي', company: 'مقاولات النيل', phone: '0100000001', email: 'ahmed@nile.com', source: 'فيسبوك', interest: 'سيراميك كليوباترا فرز أول', status: 'QUOTATION', createdAt: '2026-08-20' },
  { id: '2', name: 'سارة إبراهيم', company: 'شركة الفنون', phone: '0110000002', email: 'sara@art.com', source: 'توصية عميل', interest: 'بورسلين مستورد 60x120', status: 'NEGOTIATION', createdAt: '2026-08-18' },
  { id: '3', name: 'كريم عبدالله', company: 'مشاريع الخليج', phone: '0120000003', email: 'karim@gulf.com', source: 'موقع إلكتروني', interest: 'سيراميك حمامات ومطابخ', status: 'QUALIFIED', createdAt: '2026-08-21' },
  { id: '4', name: 'نورا حسن', company: 'منزل خاص', phone: '0130000004', email: 'noura@home.com', source: 'زيارة المعرض', interest: 'أطقم حمامات روكا', status: 'LEAD', createdAt: '2026-08-15' },
  { id: '5', name: 'طارق فتحي', company: 'ديكور برستيج', phone: '0140000005', email: 'tarek@prestige.com', source: 'انستجرام', interest: 'بلاط ديكوري حوائط', status: 'CONTACTED', createdAt: '2026-08-19' },
];

const STATUS_LABELS: Record<Lead['status'], { label: string; color: string }> = {
  LEAD: { label: 'عميل محتمل الجديد', color: 'bg-slate-500/10 text-slate-400 border-slate-500/20' },
  CONTACTED: { label: 'تم التواصل', color: 'bg-sky-500/10 text-sky-400 border-sky-500/20' },
  QUALIFIED: { label: 'مؤهل للشراء', color: 'bg-violet-500/10 text-violet-400 border-violet-500/20' },
  QUOTATION: { label: 'تم تقديم عرض', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  NEGOTIATION: { label: 'مرحلة التفاوض', color: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  WON: { label: 'كسبت الفرصة', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  LOST: { label: 'فرصة ضائعة', color: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
};

export const LeadsPage: React.FC = () => {
  const [leads, setLeads] = useState<Lead[]>(INITIAL_LEADS);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const filteredLeads = leads.filter(lead => {
    const matchesSearch = lead.name.includes(search) || lead.phone.includes(search) || lead.company.includes(search);
    const matchesFilter = statusFilter === 'ALL' || lead.status === statusFilter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center">
            <UserRound className="w-5 h-5 text-pink-400" />
          </div>
          <div>
            <h1 className="text-base font-black text-white">العملاء المحتملون (Leads)</h1>
            <p className="text-xs text-slate-400">متابعة الفرص التسويقية والمهتمين بالمعرض</p>
          </div>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-pink-600 hover:bg-pink-500 text-white rounded-xl text-sm font-semibold transition shrink-0 self-start sm:self-auto">
          <Plus className="w-4 h-4" />
          إضافة عميل محتمل
        </button>
      </div>

      {/* Filters & Search */}
      <div className="p-4 bg-slate-900/50 border-b border-slate-900 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="بحث بالاسم، الهاتف، أو الشركة..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-4 pr-10 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-pink-500/50 transition"
          />
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="appearance-none pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-300 font-medium focus:outline-none focus:border-pink-500/50 transition cursor-pointer min-w-[160px]"
            >
              <option value="ALL">جميع المراحل</option>
              {Object.entries(STATUS_LABELS).map(([key, value]) => (
                <option key={key} value={key}>{value.label}</option>
              ))}
            </select>
            <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Leads List */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredLeads.map((lead) => {
            const statusInfo = STATUS_LABELS[lead.status];
            return (
              <div
                key={lead.id}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-xl p-5 transition flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold border ${statusInfo.color}`}>
                      {statusInfo.label}
                    </span>
                    <span className="text-[10px] text-slate-500 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {lead.createdAt}
                    </span>
                  </div>

                  <h3 className="font-extrabold text-white group-hover:text-pink-400 transition">{lead.name}</h3>
                  {lead.company && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1">
                      <Building2 className="w-3.5 h-3.5 text-slate-500" />
                      <span>{lead.company}</span>
                    </div>
                  )}

                  <div className="bg-slate-950/50 rounded-lg p-3 mt-3 border border-slate-800/40">
                    <div className="text-[10px] text-pink-400/90 font-extrabold flex items-center gap-1 mb-1">
                      <Tag className="w-3 h-3" />
                      الاهتمام والطلب
                    </div>
                    <p className="text-xs text-slate-300 line-clamp-2">{lead.interest}</p>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-800/80 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <a
                      href={`tel:${lead.phone}`}
                      className="p-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-sky-500/30 text-slate-400 hover:text-sky-400 transition"
                      title="اتصال هاتف"
                    >
                      <Phone className="w-4 h-4" />
                    </a>
                    {lead.email && (
                      <a
                        href={`mailto:${lead.email}`}
                        className="p-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-purple-500/30 text-slate-400 hover:text-purple-400 transition"
                        title="ارسال بريد"
                      >
                        <Mail className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                  <button className="flex items-center gap-1 text-xs font-bold text-sky-400 hover:text-sky-300 transition">
                    <span>التفاصيل والمتابعة</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}

          {filteredLeads.length === 0 && (
            <div className="col-span-full py-16 flex flex-col items-center justify-center text-slate-500 bg-slate-900/20 border-2 border-dashed border-slate-800 rounded-2xl">
              <UserRound className="w-12 h-12 text-slate-700 mb-3" />
              <p className="text-sm">لا توجد نتائج مطابقة للبحث أو التصفية</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};