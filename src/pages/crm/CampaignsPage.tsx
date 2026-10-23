import React, { useEffect, useMemo, useState } from 'react';
import { Megaphone, Plus, Loader2, X, Trash2, Search, Users, CalendarDays, Wallet } from 'lucide-react';
import { DatabaseManager } from '../../database/db';
import { AuthService } from '../../services/AuthService';
import { v4 as uuidv4 } from 'uuid';

type CampaignStatus = 'PLANNED' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
type Channel = 'WHATSAPP' | 'SMS' | 'EMAIL' | 'PHONE' | 'SOCIAL' | 'WALK_IN' | 'REFERRAL' | 'OTHER';

interface Campaign {
  id: string;
  code: string;
  name: string;
  channel: Channel;
  startsAt?: string | null;
  endsAt?: string | null;
  budget: number;
  targetAudience?: string | null;
  status: CampaignStatus;
  notes?: string | null;
  leadCount?: number;
}

const STATUS_LABELS: Record<CampaignStatus, string> = { PLANNED: 'مخطط لها', RUNNING: 'جارية', PAUSED: 'متوقفة', COMPLETED: 'مكتملة', CANCELLED: 'ملغاة' };
const STATUS_COLORS: Record<CampaignStatus, string> = {
  PLANNED: 'bg-slate-100 text-slate-600 border-slate-200',
  RUNNING: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PAUSED: 'bg-amber-50 text-amber-700 border-amber-200',
  COMPLETED: 'bg-sky-50 text-sky-700 border-sky-200',
  CANCELLED: 'bg-rose-50 text-rose-700 border-rose-200',
};
const CHANNEL_LABELS: Record<Channel, string> = {
  WHATSAPP: 'واتساب', SMS: 'رسائل SMS', EMAIL: 'بريد إلكتروني', PHONE: 'اتصالات', SOCIAL: 'سوشيال ميديا',
  WALK_IN: 'زيارة المعرض', REFERRAL: 'توصية', OTHER: 'أخرى',
};
const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(n || 0) + ' ج';

export const CampaignsPage: React.FC = () => {
  const db = useMemo(() => DatabaseManager.getInstance(), []);
  const [rows, setRows] = useState<Campaign[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | CampaignStatus>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', channel: 'SOCIAL' as Channel, startsAt: '', endsAt: '', budget: '0', targetAudience: '', status: 'PLANNED' as CampaignStatus, notes: '',
  });

  const load = () => {
    setLoading(true);
    try {
      setRows(db.query<Campaign>(
        `SELECT c.*, (SELECT COUNT(*) FROM leads l WHERE l.campaign_id = c.id) AS lead_count
         FROM campaigns c ORDER BY c.created_at DESC`
      ));
      setError(null);
    } catch (e: any) { setError(e?.message || 'تعذر تحميل الحملات.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = rows.filter((c) => {
    const q = search.trim();
    return (statusFilter === 'ALL' || c.status === statusFilter) && (!q || c.name.includes(q) || c.code.includes(q));
  });

  const totals = useMemo(() => ({
    budget: rows.reduce((s, c) => s + Number(c.budget), 0),
    running: rows.filter((c) => c.status === 'RUNNING').length,
    leads: rows.reduce((s, c) => s + Number(c.leadCount || 0), 0),
  }), [rows]);

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', channel: 'SOCIAL', startsAt: '', endsAt: '', budget: '0', targetAudience: '', status: 'PLANNED', notes: '' });
    setModal(true);
  };

  const openEdit = (c: Campaign) => {
    setEditing(c);
    setForm({ name: c.name, channel: c.channel, startsAt: c.startsAt || '', endsAt: c.endsAt || '', budget: String(c.budget), targetAudience: c.targetAudience || '', status: c.status, notes: c.notes || '' });
    setModal(true);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        db.run(
          `UPDATE campaigns SET name = ?, channel = ?, starts_at = ?, ends_at = ?, budget = ?, target_audience = ?, status = ?, notes = ? WHERE id = ?`,
          [form.name.trim(), form.channel, form.startsAt || null, form.endsAt || null, Number(form.budget || 0), form.targetAudience || null, form.status, form.notes || null, editing.id]
        );
      } else {
        const maxCode = db.query<{ code: string }>('SELECT code FROM campaigns ORDER BY code DESC LIMIT 1')[0]?.code;
        const lastNumber = maxCode ? Number(String(maxCode).replace(/\D/g, '')) : 0;
        const next = Number.isFinite(lastNumber) ? lastNumber + 1 : 1;
        db.run(
          `INSERT INTO campaigns (id, code, name, channel, starts_at, ends_at, budget, target_audience, status, notes, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [`cmp_${uuidv4().substring(0, 8)}`, `CMP-${String(next).padStart(4, '0')}`, form.name.trim(), form.channel, form.startsAt || null, form.endsAt || null, Number(form.budget || 0), form.targetAudience || null, form.status, form.notes || null, AuthService.getCurrentUser()?.id || 'usr_admin']
        );
      }
      setModal(false);
      load();
    } catch (err: any) { alert(err?.message || 'تعذر حفظ الحملة.'); }
    finally { setSaving(false); }
  };

  const remove = (c: Campaign) => {
    if (!confirm(`حذف الحملة "${c.name}"؟ سيتم فصل العملاء المحتملين المرتبطين بها.`)) return;
    try { db.run('DELETE FROM campaigns WHERE id = ?', [c.id]); load(); }
    catch (err: any) { alert(err?.message || 'تعذر حذف الحملة.'); }
  };

  const setStatus = (c: Campaign, status: CampaignStatus) => {
    try { db.run('UPDATE campaigns SET status = ? WHERE id = ?', [status, c.id]); load(); }
    catch (err: any) { alert(err?.message || 'تعذر تحديث الحالة.'); }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-pink-50 border border-pink-200 flex items-center justify-center"><Megaphone className="w-5 h-5 text-pink-600" /></div>
          <div>
            <h1 className="text-base font-black">الحملات التسويقية</h1>
            <p className="text-xs text-slate-500 font-medium">تخطيط الحملات ومتابعة الميزانية والعملاء المحتملين الناتجين عنها</p>
          </div>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-xl text-sm font-bold transition shrink-0">
          <Plus className="w-4 h-4" /> حملة جديدة
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-white border-b border-slate-200">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-[10px] font-bold text-slate-500 flex items-center gap-1"><Wallet className="w-3 h-3" /> إجمالي الميزانيات</div>
          <div className="text-lg font-black text-slate-900 mt-1">{fmt(totals.budget)}</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="text-[10px] font-bold text-emerald-700">حملات جارية</div>
          <div className="text-lg font-black text-emerald-700 mt-1">{totals.running}</div>
        </div>
        <div className="rounded-xl border border-pink-200 bg-pink-50 px-4 py-3">
          <div className="text-[10px] font-bold text-pink-700 flex items-center gap-1"><Users className="w-3 h-3" /> عملاء محتملون من الحملات</div>
          <div className="text-lg font-black text-pink-700 mt-1">{totals.leads}</div>
        </div>
      </div>

      <div className="px-6 py-3 bg-white border-b border-slate-200 flex flex-wrap items-center gap-2">
        <form onSubmit={(e) => e.preventDefault()} className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث باسم الحملة أو الكود..." className="w-full pl-4 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-pink-400" />
        </form>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold">
          <option value="ALL">كل الحالات</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {error && <div className="mb-3 px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{error}</div>}
        {loading ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-pink-500" /></div> : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl bg-white">لا توجد حملات مطابقة</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((c) => (
              <div key={c.id} className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col hover:border-slate-300 transition">
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-[10px] px-2 py-1 rounded border font-bold ${STATUS_COLORS[c.status]}`}>{STATUS_LABELS[c.status]}</span>
                  <span className="text-[10px] font-mono text-slate-400">{c.code}</span>
                </div>
                <h3 className="font-extrabold text-slate-900">{c.name}</h3>
                <div className="text-[11px] text-slate-500 mt-1">القناة: {CHANNEL_LABELS[c.channel] || c.channel}</div>
                <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-2">
                  <span className="flex items-center gap-1"><Wallet className="w-3 h-3" />{fmt(Number(c.budget))}</span>
                  <span className="flex items-center gap-1"><Users className="w-3 h-3" />{c.leadCount || 0} عميل</span>
                </div>
                {(c.startsAt || c.endsAt) && (
                  <div className="flex items-center gap-1 text-[11px] text-slate-400 mt-1"><CalendarDays className="w-3 h-3" />{c.startsAt || '—'} → {c.endsAt || '—'}</div>
                )}
                {c.targetAudience && <p className="text-[11px] text-slate-400 mt-2">الجمهور: {c.targetAudience}</p>}
                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-1">
                  <select value={c.status} onChange={(e) => setStatus(c, e.target.value as CampaignStatus)} className="text-[10px] px-2 py-1 border border-slate-200 rounded-lg bg-white font-bold">
                    {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEdit(c)} className="text-[10px] px-2 py-1 rounded-lg bg-slate-100 text-slate-600 font-bold hover:bg-slate-200">تعديل</button>
                    <button onClick={() => remove(c)} className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold">{editing ? 'تعديل حملة' : 'حملة تسويقية جديدة'}</h3>
              <button onClick={() => setModal(false)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={submit} className="space-y-3 text-xs">
              <div><label className="font-bold text-slate-700 block mb-1">اسم الحملة *</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">القناة</label>
                  <select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value as Channel })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                    {Object.entries(CHANNEL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">الحالة</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as CampaignStatus })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                    {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="font-bold text-slate-700 block mb-1">تاريخ البدء</label><input type="date" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" /></div>
                <div><label className="font-bold text-slate-700 block mb-1">تاريخ الانتهاء</label><input type="date" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="font-bold text-slate-700 block mb-1">الميزانية</label><input type="number" min={0} step="0.01" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" /></div>
                <div><label className="font-bold text-slate-700 block mb-1">الجمهور المستهدف</label><input value={form.targetAudience} onChange={(e) => setForm({ ...form, targetAudience: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" /></div>
              </div>
              <div><label className="font-bold text-slate-700 block mb-1">ملاحظات</label><textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" /></div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setModal(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl">إلغاء</button>
                <button type="submit" disabled={saving} className="px-5 py-2 bg-pink-600 hover:bg-pink-700 text-white font-bold rounded-xl flex items-center gap-2">{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} حفظ</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
