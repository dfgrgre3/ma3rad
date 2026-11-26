import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  X, Wallet, CreditCard, Star, Receipt, Truck, CalendarClock, Phone, MapPin, User, ExternalLink, Plus,
} from 'lucide-react';
import type { Customer } from '../../../../types';
import type { CrmActivity } from '../../../../types/crm';
import type { CustomerLoyalty, LoyaltyTransaction } from '../../../../types/customers/customerPrograms';
import type { CustomerService } from '../../../../services/domains/customers/CustomerService';
import type { LoyaltyService } from '../../../../services/domains/sales/LoyaltyService';
import type { OperationsService, Delivery } from '../../../../services/domains/operations/OperationsService';
import type { CrmService } from '../../../../services/domains/crm/CrmService';
import { CeramicMath } from '../../../../utils/products/ceramicMath';
import { CUSTOMER_TYPE_LABELS } from './customerLabels';

const fmt = (n: number) => CeramicMath.formatCurrency(n);

type SectionState<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ok'; data: T };

interface StatementTxn {
  id: string;
  date: string;
  type: 'INVOICE' | 'PAYMENT' | 'RETURN';
  docNumber: string;
  description: string;
  debit: number;
  credit: number;
  balanceAfter: number;
}

const deliveryStatusLabel: Record<string, string> = {
  PENDING: 'قيد الانتظار', SCHEDULED: 'مجدول', IN_TRANSIT: 'في الطريق',
  DELIVERED: 'تم التسليم', FAILED: 'فشل', CANCELLED: 'ملغي',
};
const activityTypeLabel: Record<string, string> = {
  CALL: 'مكالمة', VISIT: 'زيارة', WHATSAPP: 'واتساب', EMAIL: 'بريد',
  MEETING: 'اجتماع', QUOTATION_SENT: 'عرض سعر', SAMPLE_GIVEN: 'عينة',
  NOTE: 'ملاحظة', STAGE_CHANGE: 'تغيير مرحلة',
};
const statementTypeLabel: Record<string, string> = {
  INVOICE: 'فاتورة', PAYMENT: 'سداد', RETURN: 'مرتجع',
};

export interface PosCustomerProfileDialogProps {
  customer: Customer;
  customerService: Pick<CustomerService, 'getCustomerStatement'>;
  loyaltyService: Pick<LoyaltyService, 'getCustomerLoyaltyByCustomerId' | 'getLoyaltyTransactions'>;
  operationsService: Pick<OperationsService, 'getDeliveries' | 'createDelivery'>;
  crmService: Pick<CrmService, 'getCustomerActivities' | 'createActivity'>;
  onClose: () => void;
  notify?: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

export const PosCustomerProfileDialog: React.FC<PosCustomerProfileDialogProps> = ({
  customer, customerService, loyaltyService, operationsService, crmService, onClose, notify,
}) => {
  const [statement, setStatement] = useState<SectionState<StatementTxn[]> | null>(null);
  const [loyalty, setLoyalty] = useState<SectionState<{ loyalty: CustomerLoyalty | null; transactions: LoyaltyTransaction[] }> | null>(null);
  const [deliveries, setDeliveries] = useState<SectionState<Delivery[]> | null>(null);
  const [activities, setActivities] = useState<SectionState<CrmActivity[]> | null>(null);
  const [actType, setActType] = useState('CALL');
  const [actSubject, setActSubject] = useState('');
  const [actDate, setActDate] = useState('');
  const [actBusy, setActBusy] = useState(false);
  const [dlvFormOpen, setDlvFormOpen] = useState(false);
  const [dlvAddress, setDlvAddress] = useState('');
  const [dlvCity, setDlvCity] = useState('');
  const [dlvDate, setDlvDate] = useState('');
  const [dlvFee, setDlvFee] = useState('');
  const [dlvBusy, setDlvBusy] = useState(false);

  const load = useCallback(() => {
    setStatement({ status: 'loading' });
    setLoyalty({ status: 'loading' });
    setDeliveries({ status: 'loading' });
    setActivities({ status: 'loading' });
    try {
      const txns = customerService.getCustomerStatement(customer.id).transactions;
      setStatement({ status: 'ok', data: txns.slice().reverse().slice(0, 15) });
    } catch (e: any) {
      setStatement({ status: 'error', message: e?.message || 'غير متاح' });
    }
    try {
      const loy = loyaltyService.getCustomerLoyaltyByCustomerId(customer.id);
      const txns = loyaltyService.getLoyaltyTransactions(customer.id, 8);
      setLoyalty({ status: 'ok', data: { loyalty: loy, transactions: txns } });
    } catch (e: any) {
      setLoyalty({ status: 'error', message: e?.message || 'غير متاح' });
    }
    try {
      const all = operationsService.getDeliveries('', 'ALL');
      setDeliveries({ status: 'ok', data: all.filter((d) => d.customerId === customer.id).slice(0, 10) });
    } catch (e: any) {
      setDeliveries({ status: 'error', message: e?.message || 'غير متاح' });
    }
    try {
      setActivities({ status: 'ok', data: crmService.getCustomerActivities(customer.id, 10) });
    } catch (e: any) {
      setActivities({ status: 'error', message: e?.message || 'غير متاح' });
    }
  }, [customer.id, customerService, loyaltyService, operationsService, crmService]);

  useEffect(() => {
    load();
    setDlvAddress(customer.address || '');
    setDlvCity(customer.city || '');
  }, [load, customer.address, customer.city]);

  const refreshDeliveries = useCallback(() => {
    try {
      const all = operationsService.getDeliveries('', 'ALL');
      setDeliveries({ status: 'ok', data: all.filter((d) => d.customerId === customer.id).slice(0, 10) });
    } catch (e: any) {
      setDeliveries({ status: 'error', message: e?.message || 'غير متاح' });
    }
  }, [operationsService, customer.id]);

  const createManualDelivery = () => {
    if (!dlvAddress.trim()) { notify?.('أدخل عنوان التسليم', 'warning'); return; }
    setDlvBusy(true);
    try {
      const record = operationsService.createDelivery({
        customerId: customer.id,
        address: dlvAddress.trim(),
        city: dlvCity.trim() || undefined,
        scheduledAt: dlvDate ? new Date(dlvDate).toISOString() : undefined,
        deliveryFee: Number(dlvFee) || 0,
        notes: 'أمر توصيل يدوي من ملف العميل في نقطة البيع',
      });
      setDlvFormOpen(false);
      notify?.(`تم إنشاء أمر التوصيل ${record.deliveryNumber}`, 'success');
      refreshDeliveries();
    } catch (e: any) {
      notify?.(e?.message || 'تعذر إنشاء أمر التوصيل', 'error');
    } finally {
      setDlvBusy(false);
    }
  };

  const scheduleFollowUp = () => {
    if (!actSubject.trim()) { notify?.('أدخل موضوع المتابعة', 'warning'); return; }
    setActBusy(true);
    try {
      crmService.createActivity({
        customerId: customer.id,
        activityType: actType,
        subject: actSubject.trim(),
        scheduledAt: actDate ? new Date(actDate).toISOString() : undefined,
      });
      setActSubject(''); setActDate('');
      notify?.('تمت جدولة متابعة العميل', 'success');
      setActivities({ status: 'ok', data: crmService.getCustomerActivities(customer.id, 10) });
    } catch (e: any) {
      notify?.(e?.message || 'تعذر جدولة المتابعة', 'error');
    } finally {
      setActBusy(false);
    }
  };

  const sectionTitle = 'flex items-center gap-1.5 text-xs font-black text-ink ';
  const sectionBox = 'rounded-xl border border-line bg-surface-muted/60 p-2.5 space-y-1.5 ';

  return (
    <div className="fixed inset-0 z-[120] bg-primary/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface rounded-3xl border border-line shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-line p-4 pb-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-sm font-black text-ink">
              <User className="w-4 h-4 text-primary" /> ملف العميل — {customer.name}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
              <span>{CUSTOMER_TYPE_LABELS[customer.customerType]}</span>
              {customer.code && <span>كود: {customer.code}</span>}
              {customer.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{customer.phone}</span>}
              {(customer.city || customer.address) && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{[customer.city, customer.address].filter(Boolean).join(' — ')}</span>}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Link to={`/customers/${customer.id}`} onClick={onClose} className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1 text-[11px] font-black text-primary hover:bg-surface-muted">
                فتح صفحة العميل <ExternalLink className="w-3 h-3" />
              </Link>
              <Link to="/crm/activities" onClick={onClose} className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1 text-[11px] font-black text-muted hover:bg-surface-muted">
                متابعة CRM <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق ملف العميل" className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-surface-muted">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {/* ملخص مالي سريع */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl border border-line px-2 py-1.5">
              <div className="flex items-center justify-center gap-1 text-[10px] font-bold text-muted"><Wallet className="w-3 h-3" />الرصيد</div>
              <div className={`text-sm font-black tabular-nums ${customer.currentBalance > 0 ? 'text-warning' : customer.currentBalance < 0 ? 'text-success' : 'text-ink'}`}>{fmt(customer.currentBalance)}</div>
            </div>
            <div className="rounded-xl border border-line px-2 py-1.5">
              <div className="flex items-center justify-center gap-1 text-[10px] font-bold text-muted"><CreditCard className="w-3 h-3" />الحد الائتماني</div>
              <div className="text-sm font-black tabular-nums text-ink">{fmt(customer.creditLimit)}</div>
            </div>
            <div className="rounded-xl border border-line px-2 py-1.5">
              <div className="flex items-center justify-center gap-1 text-[10px] font-bold text-muted"><Star className="w-3 h-3" />نقاط الولاء</div>
              <div className="text-sm font-black tabular-nums text-warning">
                {loyalty?.status === 'ok' && loyalty.data.loyalty ? `${loyalty.data.loyalty.currentPoints} نقطة` : '—'}
              </div>
            </div>
          </div>

          {/* كشف الحساب */}
          <section className={sectionBox}>
            <h4 className={sectionTitle}><Receipt className="w-3.5 h-3.5 text-primary" /> كشف الحساب — فواتير وسدادات ومرتجعات</h4>
            {statement === null || statement.status === 'loading' ? (
              <p className="text-[11px] text-muted">جارٍ التحميل…</p>
            ) : statement.status === 'error' ? (
              <p className="text-[11px] font-bold text-muted">{statement.message}</p>
            ) : statement.data.length === 0 ? (
              <p className="text-[11px] text-muted">لا توجد حركات مسجلة.</p>
            ) : (
              <ul className="max-h-56 space-y-1 overflow-y-auto">
                {statement.data.map((t) => (
                  <li key={`${t.type}-${t.id}`} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg bg-surface px-2 py-1 text-[11px] border border-line">
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black ${t.type === 'INVOICE' ? 'bg-primary/10 text-primary' : t.type === 'PAYMENT' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                      {statementTypeLabel[t.type] ?? t.type}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-ink-secondary">{t.docNumber}</span>
                    <span className="text-muted">{t.date?.slice(0, 10)}</span>
                    <span className="tabular-nums">
                      {t.debit > 0 && <span className="font-bold text-danger">+{fmt(t.debit)}</span>}
                      {t.credit > 0 && <span className="font-bold text-success">−{fmt(t.credit)}</span>}
                    </span>
                    <span className="tabular-nums font-black text-ink">{fmt(t.balanceAfter)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* الولاء */}
          <section className={sectionBox}>
            <h4 className={sectionTitle}><Star className="w-3.5 h-3.5 text-warning" /> نقاط الولاء</h4>
            {loyalty === null || loyalty.status === 'loading' ? (
              <p className="text-[11px] text-muted">جارٍ التحميل…</p>
            ) : loyalty.status === 'error' ? (
              <p className="text-[11px] font-bold text-muted">{loyalty.message}</p>
            ) : (
              <>
                {loyalty.data.loyalty ? (
                  <p className="text-[11px] text-ink-secondary">
                    الرصيد الحالي <strong className="text-warning">{loyalty.data.loyalty.currentPoints}</strong> نقطة
                    {loyalty.data.loyalty.tierName ? <> — الشريحة: <strong>{loyalty.data.loyalty.tierName}</strong></> : null}
                    {' '}· إجمالي مكتسب {loyalty.data.loyalty.totalPointsEarned} · مستبدل {loyalty.data.loyalty.totalPointsRedeemed}
                  </p>
                ) : (
                  <p className="text-[11px] text-muted">العميل غير مشترك في برنامج الولاء بعد.</p>
                )}
                {loyalty.data.transactions.length > 0 && (
                  <ul className="max-h-36 space-y-1 overflow-y-auto">
                    {loyalty.data.transactions.map((tx) => (
                      <li key={tx.id} className="flex items-center gap-2 rounded-lg bg-surface px-2 py-1 text-[11px] border border-line">
                        <span className={`font-black tabular-nums ${tx.type === 'EARN' ? 'text-success' : 'text-danger'}`}>
                          {tx.type === 'EARN' ? '+' : '−'}{tx.points}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-ink-secondary">{tx.description || tx.type}</span>
                        <span className="text-muted">{tx.createdAt?.slice(0, 10)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>

          {/* التوصيلات */}
          <section className={sectionBox}>
            <div className="flex items-center justify-between gap-2">
              <h4 className={sectionTitle}><Truck className="w-3.5 h-3.5 text-primary" /> طلبات التوصيل</h4>
              {!dlvFormOpen && (
                <button type="button" onClick={() => { setDlvFormOpen(true); setDlvAddress(customer.address || ''); setDlvCity(customer.city || ''); }} className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1 text-[11px] font-black text-primary hover:bg-surface-muted">
                  <Plus className="w-3 h-3" /> توصيل جديد
                </button>
              )}
            </div>
            {dlvFormOpen && (
              <div className="space-y-1.5 rounded-lg border border-primary/30 bg-primary/5 p-2">
                <input value={dlvAddress} onChange={(e) => setDlvAddress(e.target.value)} placeholder="عنوان التسليم" className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-[11px] font-bold text-ink" />
                <div className="grid grid-cols-[1fr_8rem] gap-1.5">
                  <input value={dlvCity} onChange={(e) => setDlvCity(e.target.value)} placeholder="المدينة" className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-[11px] font-bold text-ink" />
                  <input value={dlvFee} onChange={(e) => setDlvFee(e.target.value.replace(/[^\d.]/g, ''))} placeholder="رسوم التوصيل" inputMode="decimal" className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-[11px] font-bold text-ink" />
                </div>
                <input type="datetime-local" value={dlvDate} onChange={(e) => setDlvDate(e.target.value)} className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-[11px] font-bold text-ink" />
                <div className="flex gap-1.5">
                  <button type="button" disabled={dlvBusy} onClick={createManualDelivery} className="flex-1 rounded-lg bg-primary px-2 py-1.5 text-[11px] font-black text-white disabled:opacity-50">إنشاء أمر التوصيل</button>
                  <button type="button" onClick={() => setDlvFormOpen(false)} className="rounded-lg border border-line px-2 py-1.5 text-[11px] font-bold text-muted">إلغاء</button>
                </div>
              </div>
            )}
            {deliveries === null || deliveries.status === 'loading' ? (
              <p className="text-[11px] text-muted">جارٍ التحميل…</p>
            ) : deliveries.status === 'error' ? (
              <p className="text-[11px] font-bold text-muted">{deliveries.message}</p>
            ) : deliveries.data.length === 0 ? (
              <p className="text-[11px] text-muted">لا توجد طلبات توصيل لهذا العميل.</p>
            ) : (
              <ul className="max-h-44 space-y-1 overflow-y-auto">
                {deliveries.data.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg bg-surface px-2 py-1 text-[11px] border border-line">
                    <span className="font-mono font-bold text-ink">{d.deliveryNumber}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-black ${d.status === 'DELIVERED' ? 'bg-success/10 text-success' : d.status === 'CANCELLED' || d.status === 'FAILED' ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning'}`}>
                      {deliveryStatusLabel[d.status] ?? d.status}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-muted">{[d.address, d.city].filter(Boolean).join(' — ')}</span>
                    <span className="text-muted">{d.date?.slice(0, 10)}</span>
                    {d.scheduledAt && <span className="flex items-center gap-0.5 text-muted"><CalendarClock className="w-3 h-3" />{d.scheduledAt.slice(0, 16).replace('T', ' ')}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* متابعة المبيعات / CRM */}
          <section className={sectionBox}>
            <h4 className={sectionTitle}><CalendarClock className="w-3.5 h-3.5 text-primary" /> متابعة المبيعات والاتصال</h4>
            <div className="grid grid-cols-[7rem_1fr_auto] items-center gap-1.5">
              <select value={actType} onChange={(e) => setActType(e.target.value)} className="min-h-9 rounded-lg border border-line bg-surface px-2 text-[11px] font-bold text-ink">
                {Object.entries(activityTypeLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <input value={actSubject} onChange={(e) => setActSubject(e.target.value)} placeholder="موضوع المتابعة (مثال: الاتصال لتجديد الطلب)" className="min-h-9 min-w-0 rounded-lg border border-line bg-surface px-2 text-[11px] font-bold text-ink" />
              <input type="datetime-local" value={actDate} onChange={(e) => setActDate(e.target.value)} className="min-h-9 rounded-lg border border-line bg-surface px-2 text-[11px] font-bold text-ink" />
              <button type="button" onClick={scheduleFollowUp} disabled={actBusy} className="col-span-3 min-h-9 rounded-lg bg-primary px-3 text-[11px] font-black text-white transition hover:bg-primary disabled:opacity-50">
                {actBusy ? 'جارٍ الحفظ…' : '+ جدولة متابعة'}
              </button>
            </div>
            {activities === null || activities.status === 'loading' ? (
              <p className="text-[11px] text-muted">جارٍ التحميل…</p>
            ) : activities.status === 'error' ? (
              <p className="text-[11px] font-bold text-muted">{activities.message}</p>
            ) : activities.data.length === 0 ? (
              <p className="text-[11px] text-muted">لا توجد أنشطة متابعة مسجلة.</p>
            ) : (
              <ul className="max-h-44 space-y-1 overflow-y-auto">
                {activities.data.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg bg-surface px-2 py-1 text-[11px] border border-line">
                    <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-black text-primary">{activityTypeLabel[a.activityType] ?? a.activityType}</span>
                    <span className="min-w-0 flex-1 truncate font-bold text-ink">{a.subject}</span>
                    <span className={`text-[10px] font-black ${a.status === 'COMPLETED' ? 'text-success' : a.status === 'CANCELLED' ? 'text-muted' : 'text-warning'}`}>
                      {a.status === 'COMPLETED' ? 'مكتمل' : a.status === 'CANCELLED' ? 'ملغي' : 'مجدول'}
                    </span>
                    <span className="text-muted">{(a.scheduledAt || a.createdAt)?.slice(0, 16).replace('T', ' ')}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
