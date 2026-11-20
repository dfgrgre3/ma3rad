import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock3, Plus, Receipt, RefreshCw, TrendingUp } from 'lucide-react';
import { ActivityGate } from '../../../components/ui/ActivityGate';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card, StatCard } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { FormField } from '../../../components/ui/FormField';
import { useToast } from '../../../components/ui/Toast';
import { usePermission } from '../../../hooks/domains/auth/usePermission';
import { CustomerService } from '../../../services/domains/customers/CustomerService';
import type { Customer } from '../../../types';
import {
  TimeBillingService,
  type BillingBatch,
  type TimeEntry,
  type TimeEntryStatus,
} from '../../../services/domains/professional/TimeBillingService';
import { localDateString } from '../../../utils/shared/date';

const currency = new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 });
const inputCls = 'w-full rounded-lg border border-[var(--cerami-border)] bg-[var(--cerami-surface)] px-3 py-2 text-sm';
const selectCls = inputCls;

const STATUS_LABEL: Record<TimeEntryStatus, string> = {
  DRAFT: 'مسودة', SUBMITTED: 'مقدم', APPROVED: 'معتمد', INVOICED: 'مفوتر', REJECTED: 'مرفوض',
};
const STATUS_TONE: Record<TimeEntryStatus, string> = {
  DRAFT: 'bg-surface-sunken text-ink-secondary', SUBMITTED: 'bg-accent-soft text-primary',
  APPROVED: 'bg-success-soft text-success', INVOICED: 'bg-accent-soft text-primary',
  REJECTED: 'bg-danger-soft text-danger',
};

export const TimeBillingPage: React.FC = () => {
  const service = useMemo(() => new TimeBillingService(), []);
  const toast = useToast();
  const can = usePermission();
  const canManage = can('projects.view');

  const [tab, setTab] = useState<'entries' | 'batches' | 'profitability'>('entries');
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [batches, setBatches] = useState<BillingBatch[]>([]);
  const [profitability, setProfitability] = useState<any[]>([]);
  const [unbilled, setUnbilled] = useState({ count: 0, hours: 0, amount: 0 });
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState('');

  const [entryModal, setEntryModal] = useState(false);
  const [entryForm, setEntryForm] = useState({ customerId: '', projectId: '', employeeId: '', entryDate: localDateString(), description: '', hours: '1', hourlyRate: '0', billable: true });
  const [batchModal, setBatchModal] = useState(false);
  const [batchForm, setBatchForm] = useState({ customerId: '', projectId: '', periodStart: '', periodEnd: '', notes: '' });

  const run = useCallback((fn: () => void) => {
    try { fn(); } catch (e: any) { toast.error('خطأ', e?.message || 'حدث خطأ'); }
  }, [toast]);

  const load = useCallback(() => {
    setLoading(true);
    try {
      setEntries(service.getTimeEntries(statusFilter ? { status: statusFilter as TimeEntryStatus } : undefined));
      setBatches(service.getBatches());
      setProfitability(service.getProfitability());
      setUnbilled(service.getUnbilledSummary());
      setCustomers(can('customers.view') ? new CustomerService().getAllCustomers() : []);
      setProjects(service.getProjects());
      setEmployees(service.getEmployees());
    } catch (e: any) {
      toast.error('تعذر تحميل البيانات', e?.message);
    } finally {
      setLoading(false);
    }
  }, [service, statusFilter, can, toast]);

  useEffect(() => { load(); }, [load]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const tabs = [
    { id: 'entries' as const, label: 'قيود الوقت', icon: Clock3 },
    { id: 'batches' as const, label: 'دفعات الفوترة', icon: Receipt },
    { id: 'profitability' as const, label: 'الربحية', icon: TrendingUp },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="التتبع بالوقت والأتعاب"
        description="سجلات ساعات العمل على ملفات العملاء والمشروعات، اعتمادها وتحويلها لفواتير أتعاب."
        icon={<Clock3 className="w-6 h-6" />}
        actions={<div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={load} leadingIcon={<RefreshCw className="w-4 h-4" />}>تحديث</Button>
          {canManage && <ActivityGate element="new-time-entry"><Button size="sm" onClick={() => { setEntryForm({ customerId: '', projectId: '', employeeId: '', entryDate: localDateString(), description: '', hours: '1', hourlyRate: '0', billable: true }); setEntryModal(true); }} leadingIcon={<Plus className="w-4 h-4" />}>قيد وقت</Button></ActivityGate>}
        </div>}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="قيود معتمدة غير مفوترة" value={unbilled.count} tone="warning" />
        <StatCard label="ساعات غير مفوترة" value={unbilled.hours} />
        <StatCard label="قيمة غير مفوترة" value={currency.format(unbilled.amount)} tone="warning" />
        <StatCard label="دفعات مفتوحة" value={batches.filter((b) => b.status === 'OPEN').length} />
      </div>

      <div className="flex gap-1 border-b border-[var(--cerami-border)] flex-wrap items-center">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-2 ${tab === t.id ? 'border-[var(--cerami-primary)] text-[var(--cerami-primary)]' : 'border-transparent text-[var(--cerami-muted)] hover:text-[var(--cerami-text)]'}`}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
        {tab === 'entries' && (
          <div className="mr-auto flex gap-2 items-center">
            <select className={`${selectCls} w-40`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">كل الحالات</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            {canManage && selected.size > 0 && (
              <>
                <Button size="sm" variant="secondary" onClick={() => run(() => { const n = service.submitEntries([...selected]); toast.success(`تم تقديم ${n} قيد`); setSelected(new Set()); load(); })}>تقديم</Button>
                <Button size="sm" onClick={() => run(() => { const n = service.approveEntries([...selected]); toast.success(`تم اعتماد ${n} قيد`); setSelected(new Set()); load(); })}>اعتماد</Button>
              </>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-line border-primary rounded-full animate-spin" /></div>
      ) : tab === 'entries' ? (
        <Card padding="none">
          <table className="w-full text-sm">
            <thead><tr className="text-right text-[var(--cerami-muted)] border-b border-[var(--cerami-border)]">
              {canManage && <th className="p-3 w-8"></th>}
              <th className="p-3">التاريخ</th><th className="p-3">العميل</th><th className="p-3">المشروع</th>
              <th className="p-3">الموظف</th><th className="p-3">الوصف</th><th className="p-3">الساعات</th>
              <th className="p-3">الأتعاب</th><th className="p-3">قابل للفوترة</th><th className="p-3">الحالة</th>
            </tr></thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-[var(--cerami-border)] last:border-0 hover:bg-[var(--cerami-bg)]">
                  {canManage && <td className="p-3"><input type="checkbox" checked={selected.has(e.id)} onChange={() => toggle(e.id)} disabled={!['DRAFT', 'SUBMITTED'].includes(e.status)} /></td>}
                  <td className="p-3 text-xs">{e.entryDate}</td>
                  <td className="p-3">{e.customerName || '—'}</td>
                  <td className="p-3 text-xs">{e.projectName || '—'}</td>
                  <td className="p-3 text-xs">{e.employeeName || '—'}</td>
                  <td className="p-3 max-w-[200px] truncate">{e.description}</td>
                  <td className="p-3">{e.hours}</td>
                  <td className="p-3 font-semibold">{currency.format(e.amount)}</td>
                  <td className="p-3">{e.billable ? 'نعم' : 'لا'}</td>
                  <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-[11px] ${STATUS_TONE[e.status]}`}>{STATUS_LABEL[e.status]}</span></td>
                </tr>
              ))}
              {entries.length === 0 && <tr><td colSpan={10} className="p-8 text-center text-[var(--cerami-muted)]">لا توجد قيود وقت.</td></tr>}
            </tbody>
          </table>
        </Card>
      ) : tab === 'batches' ? (
        <div className="space-y-4">
          {canManage && (
            <div className="flex justify-end">
              <Button onClick={() => { setBatchForm({ customerId: '', projectId: '', periodStart: '', periodEnd: '', notes: '' }); setBatchModal(true); }} leadingIcon={<Receipt className="w-4 h-4" />}>إنشاء دفعة فوترة من المعتمد</Button>
            </div>
          )}
          <div className="grid gap-3">
            {batches.map((b) => (
              <Card key={b.id} padding="sm" className="flex justify-between items-center">
                <div>
                  <div className="font-semibold">{b.batchNumber}</div>
                  <div className="text-xs text-[var(--cerami-muted)]">{b.customerName || '—'} {b.projectName ? `• ${b.projectName}` : ''} • {b.itemCount} قيد • {b.periodStart || '—'} → {b.periodEnd || '—'}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold">{currency.format(b.totalAmount)}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] ${b.status === 'INVOICED' ? 'bg-accent-soft text-primary' : b.status === 'OPEN' ? 'bg-warning-soft text-warning' : 'bg-surface-sunken text-ink-secondary'}`}>{b.status === 'INVOICED' ? 'مفوترة' : b.status === 'OPEN' ? 'مفتوحة' : 'ملغاة'}</span>
                  {canManage && b.status === 'OPEN' && (
                    <Button size="sm" variant="ghost" onClick={() => {
                      const invoiceId = prompt('رقم/معرف فاتورة المبيعات؟', '') || `INV-${Date.now()}`;
                      run(() => { service.markBatchInvoiced(b.id, invoiceId); toast.success('تم ربط الدفعة بالفاتورة'); load(); });
                    }}>ربط بفاتورة</Button>
                  )}
                </div>
              </Card>
            ))}
            {batches.length === 0 && <Card><p className="text-center text-sm text-[var(--cerami-muted)] py-8">لا توجد دفعات فوترة.</p></Card>}
          </div>
        </div>
      ) : (
        <Card padding="none">
          <table className="w-full text-sm">
            <thead><tr className="text-right text-[var(--cerami-muted)] border-b border-[var(--cerami-border)]">
              <th className="p-3">العميل</th><th className="p-3">عدد القيود</th><th className="p-3">الساعات القابلة للفوترة</th><th className="p-3">قيمة الأتعاب</th>
            </tr></thead>
            <tbody>
              {profitability.map((p, i) => (
                <tr key={i} className="border-b border-[var(--cerami-border)] last:border-0">
                  <td className="p-3 font-medium">{p.customerName}</td>
                  <td className="p-3">{p.entryCount}</td>
                  <td className="p-3">{p.billableHours}</td>
                  <td className="p-3 font-semibold">{currency.format(p.billableAmount)}</td>
                </tr>
              ))}
              {profitability.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-[var(--cerami-muted)]">لا توجد بيانات.</td></tr>}
            </tbody>
          </table>
        </Card>
      )}

      {/* Entry modal */}
      <Modal open={entryModal} onClose={() => setEntryModal(false)} title="قيد وقت جديد" size="md"
        footer={<div className="flex gap-2 justify-end"><Button variant="ghost" onClick={() => setEntryModal(false)}>إلغاء</Button><Button onClick={() => run(() => { service.createTimeEntry({ customerId: entryForm.customerId || undefined, projectId: entryForm.projectId || undefined, employeeId: entryForm.employeeId || undefined, entryDate: entryForm.entryDate, description: entryForm.description, minutes: Number(entryForm.hours) * 60, hourlyRate: Number(entryForm.hourlyRate), billable: entryForm.billable }); setEntryModal(false); load(); })}>حفظ</Button></div>}>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="العميل"><select className={selectCls} value={entryForm.customerId} onChange={(e) => setEntryForm({ ...entryForm, customerId: e.target.value })}><option value="">—</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></FormField>
          <FormField label="المشروع"><select className={selectCls} value={entryForm.projectId} onChange={(e) => setEntryForm({ ...entryForm, projectId: e.target.value })}><option value="">—</option>{projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></FormField>
          <FormField label="الموظف"><select className={selectCls} value={entryForm.employeeId} onChange={(e) => setEntryForm({ ...entryForm, employeeId: e.target.value })}><option value="">— أنا —</option>{employees.map((em: any) => <option key={em.id} value={em.id}>{em.fullName}</option>)}</select></FormField>
          <FormField label="التاريخ"><input type="date" className={inputCls} value={entryForm.entryDate} onChange={(e) => setEntryForm({ ...entryForm, entryDate: e.target.value })} /></FormField>
          <FormField label="ساعات العمل"><input type="number" step="0.25" className={inputCls} value={entryForm.hours} onChange={(e) => setEntryForm({ ...entryForm, hours: e.target.value })} /></FormField>
          <FormField label="الأجرة بالساعة"><input type="number" step="0.01" className={inputCls} value={entryForm.hourlyRate} onChange={(e) => setEntryForm({ ...entryForm, hourlyRate: e.target.value })} /></FormField>
          <FormField label="قابل للفوترة"><select className={selectCls} value={entryForm.billable ? '1' : '0'} onChange={(e) => setEntryForm({ ...entryForm, billable: e.target.value === '1' })}><option value="1">نعم</option><option value="0">لا</option></select></FormField>
          <div className="col-span-2"><FormField label="وصف العمل" required><textarea className={inputCls} rows={2} value={entryForm.description} onChange={(e) => setEntryForm({ ...entryForm, description: e.target.value })} placeholder="مثال: مراجعة عقود العميل" /></FormField></div>
        </div>
      </Modal>

      {/* Batch modal */}
      <Modal open={batchModal} onClose={() => setBatchModal(false)} title="دفعة فوترة جديدة" size="sm"
        footer={<div className="flex gap-2 justify-end"><Button variant="ghost" onClick={() => setBatchModal(false)}>إلغاء</Button><Button onClick={() => run(() => { const b = service.createBatch({ customerId: batchForm.customerId || undefined, projectId: batchForm.projectId || undefined, periodStart: batchForm.periodStart || undefined, periodEnd: batchForm.periodEnd || undefined, notes: batchForm.notes || undefined }); setBatchModal(false); toast.success(`تم إنشاء الدفعة ${b.batchNumber}`); load(); })}>إنشاء</Button></div>}>
        <div className="space-y-3">
          <p className="text-xs text-[var(--cerami-muted)]">سيتم تجميع كل القيود المعتمدة (قابلة للفوترة) المطابقة للعميل/المشروع المحددين.</p>
          <FormField label="العميل"><select className={selectCls} value={batchForm.customerId} onChange={(e) => setBatchForm({ ...batchForm, customerId: e.target.value })}><option value="">الكل</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></FormField>
          <FormField label="المشروع"><select className={selectCls} value={batchForm.projectId} onChange={(e) => setBatchForm({ ...batchForm, projectId: e.target.value })}><option value="">الكل</option>{projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="من تاريخ"><input type="date" className={inputCls} value={batchForm.periodStart} onChange={(e) => setBatchForm({ ...batchForm, periodStart: e.target.value })} /></FormField>
            <FormField label="إلى تاريخ"><input type="date" className={inputCls} value={batchForm.periodEnd} onChange={(e) => setBatchForm({ ...batchForm, periodEnd: e.target.value })} /></FormField>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default TimeBillingPage;
