import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BedDouble, CalendarDays, ClipboardList, CreditCard, Hotel, RefreshCw, Sparkles, UserRound,
} from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card, CardHeader, StatCard } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { FormField } from '../../../components/ui/FormField';
import { useToast } from '../../../components/ui/Toast';
import { usePermission } from '../../../hooks/domains/auth/usePermission';
import { CustomerService } from '../../../services/domains/customers/CustomerService';
import type { Customer } from '../../../types';
import {
  HospitalityService,
  type HotelReservation,
  type HotelRoom,
  type HotelRoomType,
  type HousekeepingTask,
  type ReservationStatus,
  type RoomStatus,
} from '../../../services/domains/hospitality/HospitalityService';
import { localDateString } from '../../../utils/shared/date';

const currency = new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 });

const ROOM_STATUS_LABEL: Record<RoomStatus, string> = {
  AVAILABLE: 'متاحة', OCCUPIED: 'مشغولة', RESERVED: 'محجوزة',
  CLEANING: 'تنظيف', MAINTENANCE: 'صيانة', OUT_OF_SERVICE: 'خارج الخدمة',
};
const ROOM_STATUS_TONE: Record<RoomStatus, string> = {
  AVAILABLE: 'bg-success-soft text-success', OCCUPIED: 'bg-danger-soft text-danger',
  RESERVED: 'bg-accent-soft text-primary', CLEANING: 'bg-warning-soft text-warning',
  MAINTENANCE: 'bg-warning-soft text-warning', OUT_OF_SERVICE: 'bg-surface-sunken text-ink-secondary',
};
const RES_STATUS_LABEL: Record<ReservationStatus, string> = {
  CONFIRMED: 'مؤكد', CHECKED_IN: 'مسجل دخول', CHECKED_OUT: 'مسجل خروج',
  CANCELLED: 'ملغي', NO_SHOW: 'لم يحضر',
};

const inputCls = 'w-full rounded-lg border border-[var(--cerami-border)] bg-[var(--cerami-surface)] px-3 py-2 text-sm';
const selectCls = inputCls;

export const HotelPage: React.FC = () => {
  const service = useMemo(() => new HospitalityService(), []);
  const toast = useToast();
  const can = usePermission();
  const canManage = can('orders.update') || can('orders.create');

  const [tab, setTab] = useState<'overview' | 'rooms' | 'reservations' | 'housekeeping'>('overview');
  const [loading, setLoading] = useState(true);
  const [rooms, setRooms] = useState<HotelRoom[]>([]);
  const [roomTypes, setRoomTypes] = useState<HotelRoomType[]>([]);
  const [reservations, setReservations] = useState<HotelReservation[]>([]);
  const [tasks, setTasks] = useState<HousekeepingTask[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stats, setStats] = useState<ReturnType<HospitalityService['getDashboardStats']> | null>(null);
  const [selectedRes, setSelectedRes] = useState<HotelReservation | null>(null);
  const [folio, setFolio] = useState<any[]>([]);
  const [folioBalance, setFolioBalance] = useState(0);

  // modals
  const [roomModal, setRoomModal] = useState<Partial<HotelRoom> | null>(null);
  const [typeModal, setTypeModal] = useState<Partial<HotelRoomType> | null>(null);
  const [resModal, setResModal] = useState(false);
  const [folioModal, setFolioModal] = useState(false);
  const [taskModal, setTaskModal] = useState(false);

  // form states
  const [resForm, setResForm] = useState({ customerId: '', roomId: '', checkIn: localDateString(), checkOut: localDateString(), guestsCount: '1', notes: '' });
  const [folioForm, setFolioForm] = useState({ description: '', amount: '', entryType: 'CHARGE' as const });
  const [taskForm, setTaskForm] = useState({ roomId: '', taskType: 'CLEANING', assignedTo: '', scheduledDate: localDateString(), notes: '' });
  const [roomForm, setRoomForm] = useState({ roomNumber: '', floor: '0', roomTypeId: '', notes: '' });
  const [typeForm, setTypeForm] = useState({ name: '', capacity: '2', baseRate: '0', description: '' });

  const run = useCallback((fn: () => void) => {
    try { fn(); } catch (e: any) { toast.error('خطأ', e?.message || 'حدث خطأ'); }
  }, [toast]);

  const load = useCallback(() => {
    setLoading(true);
    try {
      setStats(service.getDashboardStats());
      setRooms(service.getRooms());
      setRoomTypes(service.getRoomTypes());
      setReservations(service.getReservations());
      setTasks(service.getHousekeepingTasks());
      setCustomers(can('customers.view') ? new CustomerService().getAllCustomers() : []);
    } catch (e: any) {
      toast.error('تعذر تحميل بيانات الفندق', e?.message);
    } finally {
      setLoading(false);
    }
  }, [service, toast, can]);

  useEffect(() => { load(); }, [load]);

  const openFolio = (res: HotelReservation) => {
    setSelectedRes(res);
    setFolio(service.getFolio(res.id));
    setFolioBalance(service.getFolioBalance(res.id));
    setFolioModal(true);
  };

  const floors = useMemo(() => {
    const map = new Map<number, HotelRoom[]>();
    for (const r of rooms) {
      const list = map.get(r.floor) ?? [];
      list.push(r);
      map.set(r.floor, list);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [rooms]);

  const tabs = [
    { id: 'overview' as const, label: 'نظرة عامة', icon: Hotel },
    { id: 'rooms' as const, label: 'خريطة الطوابق', icon: BedDouble },
    { id: 'reservations' as const, label: 'الحجوزات', icon: CalendarDays },
    { id: 'housekeeping' as const, label: 'التنظيف والصيانة', icon: Sparkles },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="إدارة الفندق والغرف"
        description="خريطة الطوابق، حالة الغرف، الحجوزات، الفوترة الليلية ومهام التنظيف."
        icon={<Hotel className="w-6 h-6" />}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={load} leadingIcon={<RefreshCw className="w-4 h-4" />}>تحديث</Button>
            <Button variant="secondary" size="sm" onClick={() => { service.postNightlyCharges(); toast.success('تم ترحيل رسوم الليالي'); load(); }}>ترحيل رسوم الليلة</Button>
          </div>
        }
      />

      <div className="flex gap-1 border-b border-[var(--cerami-border)]">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-2 ${tab === t.id ? 'border-[var(--cerami-primary)] text-[var(--cerami-primary)]' : 'border-transparent text-[var(--cerami-muted)] hover:text-[var(--cerami-text)]'}`}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-line border-primary rounded-full animate-spin" /></div>
      ) : tab === 'overview' && stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="إجمالي الغرف" value={stats.totalRooms} icon={<BedDouble className="w-4 h-4" />} />
          <StatCard label="مشغولة" value={stats.occupied} tone="danger" hint={`نسبة الإشغال ${stats.occupancyRate}%`} />
          <StatCard label="متاحة" value={stats.available} tone="success" />
          <StatCard label="محجوزة" value={stats.reserved} tone="warning" />
          <StatCard label="وصول اليوم" value={stats.arrivalsToday} icon={<UserRound className="w-4 h-4" />} />
          <StatCard label="مغادرة اليوم" value={stats.departuresToday} icon={<CalendarDays className="w-4 h-4" />} />
          <StatCard label="مهام معلقة" value={stats.pendingTasks} tone={stats.pendingTasks ? 'warning' : 'default'} icon={<ClipboardList className="w-4 h-4" />} />
          <StatCard label="أرصدة حسابات النزلاء" value={currency.format(stats.folioBalance)} tone={stats.folioBalance > 0 ? 'warning' : 'default'} icon={<CreditCard className="w-4 h-4" />} />
        </div>
      ) : tab === 'rooms' ? (
        <div className="space-y-4">
          <div className="flex justify-end gap-2">
            {canManage && <Button size="sm" variant="secondary" onClick={() => { setRoomForm({ roomNumber: '', floor: '0', roomTypeId: '', notes: '' }); setRoomModal({}); }}>+ غرفة</Button>}
            {canManage && <Button size="sm" variant="secondary" onClick={() => { setTypeForm({ name: '', capacity: '2', baseRate: '0', description: '' }); setTypeModal({}); }}>+ نوع غرفة</Button>}
          </div>
          {floors.map(([floor, floorRooms]) => (
            <Card key={floor} padding="sm">
              <CardHeader title={`الطابق ${floor === 0 ? 'الأرضي' : floor}`} />
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 mt-3">
                {floorRooms.map((room) => (
                  <button key={room.id}
                    onClick={() => canManage && setRoomModal(room)}
                    className={`rounded-xl border p-3 text-right transition ${ROOM_STATUS_TONE[room.status]} border-transparent hover:border-[var(--cerami-primary)]`}>
                    <div className="font-bold text-lg">{room.roomNumber}</div>
                    <div className="text-[11px] opacity-80">{room.roomTypeName || 'بدون نوع'}</div>
                    <div className="text-[11px] font-medium mt-1">{ROOM_STATUS_LABEL[room.status]}</div>
                    {room.currentGuest && <div className="text-[10px] mt-1 truncate">👤 {room.currentGuest}</div>}
                    <div className="text-[10px] mt-1">{room.housekeepingStatus === 'CLEAN' ? 'نظيفة' : room.housekeepingStatus === 'DIRTY' ? 'متسخة' : 'مفحوصة'}</div>
                  </button>
                ))}
              </div>
            </Card>
          ))}
          {rooms.length === 0 && <Card><p className="text-center text-sm text-[var(--cerami-muted)] py-8">لا توجد غرف بعد — أضف نوع غرفة ثم الغرف.</p></Card>}
        </div>
      ) : tab === 'reservations' ? (
        <Card padding="none">
          <div className="flex justify-between items-center p-4 border-b border-[var(--cerami-border)]">
            <h3 className="font-semibold">الحجوزات</h3>
            {canManage && <Button size="sm" onClick={() => { setResForm({ customerId: '', roomId: '', checkIn: localDateString(), checkOut: localDateString(), guestsCount: '1', notes: '' }); setResModal(true); }}>+ حجز جديد</Button>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-right text-[var(--cerami-muted)] border-b border-[var(--cerami-border)]">
                <th className="p-3">رقم الحجز</th><th className="p-3">النزيل</th><th className="p-3">الغرفة</th>
                <th className="p-3">الدخول</th><th className="p-3">الخروج</th><th className="p-3">ليالي</th>
                <th className="p-3">الإجمالي</th><th className="p-3">الحالة</th><th className="p-3">إجراءات</th>
              </tr></thead>
              <tbody>
                {reservations.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--cerami-border)] last:border-0 hover:bg-[var(--cerami-bg)]">
                    <td className="p-3 font-mono text-xs">{r.reservationNumber}</td>
                    <td className="p-3">{r.customerName || 'عميل نقدي'}</td>
                    <td className="p-3">{r.roomNumber || '—'}</td>
                    <td className="p-3">{r.checkIn}</td><td className="p-3">{r.checkOut}</td>
                    <td className="p-3">{r.nights}</td>
                    <td className="p-3 font-semibold">{currency.format(r.totalAmount)}</td>
                    <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-[11px] ${r.status === 'CHECKED_IN' ? 'bg-success-soft text-success' : r.status === 'CANCELLED' ? 'bg-danger-soft text-danger' : 'bg-accent-soft text-primary'}`}>{RES_STATUS_LABEL[r.status]}</span></td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openFolio(r)}>الفاتورة</Button>
                        {canManage && r.status === 'CONFIRMED' && <Button size="sm" variant="ghost" onClick={() => run(() => { service.updateReservationStatus(r.id, 'CHECKED_IN'); load(); })}>دخول</Button>}
                        {canManage && r.status === 'CHECKED_IN' && <Button size="sm" variant="ghost" onClick={() => run(() => { service.updateReservationStatus(r.id, 'CHECKED_OUT'); load(); })}>خروج</Button>}
                        {canManage && (r.status === 'CONFIRMED') && <Button size="sm" variant="ghost" onClick={() => run(() => { service.updateReservationStatus(r.id, 'CANCELLED'); load(); })}>إلغاء</Button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {reservations.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-[var(--cerami-muted)]">لا توجد حجوزات.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold">مهام التنظيف والصيانة</h3>
            {canManage && <Button size="sm" onClick={() => { setTaskForm({ roomId: rooms[0]?.id || '', taskType: 'CLEANING', assignedTo: '', scheduledDate: localDateString(), notes: '' }); setTaskModal(true); }}>+ مهمة</Button>}
          </div>
          <div className="grid gap-2">
            {tasks.map((t) => (
              <Card key={t.id} padding="sm" className="flex items-center justify-between">
                <div>
                  <span className="font-bold">غرفة {t.roomNumber}</span>
                  <span className="mx-2 text-[var(--cerami-muted)]">•</span>
                  <span>{t.taskType === 'CLEANING' ? 'تنظيف' : t.taskType === 'INSPECTION' ? 'فحص' : 'صيانة'}</span>
                  {t.assignedTo && <span className="mx-2 text-[var(--cerami-muted)]">• {t.assignedTo}</span>}
                  {t.scheduledDate && <span className="mx-2 text-[var(--cerami-muted)]">• {t.scheduledDate}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-[11px] ${t.status === 'DONE' ? 'bg-success-soft text-success' : t.status === 'IN_PROGRESS' ? 'bg-warning-soft text-warning' : 'bg-surface-sunken text-ink-secondary'}`}>
                    {t.status === 'DONE' ? 'منجز' : t.status === 'IN_PROGRESS' ? 'جاري' : t.status === 'CANCELLED' ? 'ملغي' : 'معلق'}
                  </span>
                  {canManage && t.status === 'PENDING' && <Button size="sm" variant="ghost" onClick={() => run(() => { service.updateHousekeepingTask(t.id, 'IN_PROGRESS'); load(); })}>بدء</Button>}
                  {canManage && (t.status === 'PENDING' || t.status === 'IN_PROGRESS') && <Button size="sm" variant="ghost" onClick={() => run(() => { service.updateHousekeepingTask(t.id, 'DONE'); load(); })}>إنجاز</Button>}
                </div>
              </Card>
            ))}
            {tasks.length === 0 && <Card><p className="text-center text-sm text-[var(--cerami-muted)] py-8">لا توجد مهام.</p></Card>}
          </div>
        </div>
      )}

      {/* Room modal */}
      <Modal open={!!roomModal} onClose={() => setRoomModal(null)} title={roomModal?.id ? 'تعديل غرفة' : 'غرفة جديدة'} size="sm"
        footer={<div className="flex gap-2 justify-end"><Button variant="ghost" onClick={() => setRoomModal(null)}>إلغاء</Button><Button onClick={() => run(() => { service.saveRoom({ id: roomModal?.id, branchId: '', roomTypeId: roomForm.roomTypeId || undefined, roomNumber: roomForm.roomNumber, floor: Number(roomForm.floor), notes: roomForm.notes }); setRoomModal(null); load(); })}>حفظ</Button></div>}>
        <div className="space-y-3">
          <FormField label="رقم الغرفة" required><input className={inputCls} value={roomForm.roomNumber} onChange={(e) => setRoomForm({ ...roomForm, roomNumber: e.target.value })} /></FormField>
          <FormField label="الطابق"><input type="number" className={inputCls} value={roomForm.floor} onChange={(e) => setRoomForm({ ...roomForm, floor: e.target.value })} /></FormField>
          <FormField label="نوع الغرفة"><select className={selectCls} value={roomForm.roomTypeId} onChange={(e) => setRoomForm({ ...roomForm, roomTypeId: e.target.value })}><option value="">—</option>{roomTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></FormField>
          <FormField label="ملاحظات"><input className={inputCls} value={roomForm.notes} onChange={(e) => setRoomForm({ ...roomForm, notes: e.target.value })} /></FormField>
        </div>
      </Modal>

      {/* Room type modal */}
      <Modal open={!!typeModal} onClose={() => setTypeModal(null)} title={typeModal?.id ? 'تعديل نوع' : 'نوع غرفة جديد'} size="sm"
        footer={<div className="flex gap-2 justify-end"><Button variant="ghost" onClick={() => setTypeModal(null)}>إلغاء</Button><Button onClick={() => run(() => { service.saveRoomType({ id: typeModal?.id, name: typeForm.name, capacity: Number(typeForm.capacity), baseRate: Number(typeForm.baseRate), description: typeForm.description }); setTypeModal(null); load(); })}>حفظ</Button></div>}>
        <div className="space-y-3">
          <FormField label="الاسم" required><input className={inputCls} value={typeForm.name} onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })} /></FormField>
          <FormField label="السعة"><input type="number" className={inputCls} value={typeForm.capacity} onChange={(e) => setTypeForm({ ...typeForm, capacity: e.target.value })} /></FormField>
          <FormField label="سعر الليلة"><input type="number" step="0.01" className={inputCls} value={typeForm.baseRate} onChange={(e) => setTypeForm({ ...typeForm, baseRate: e.target.value })} /></FormField>
          <FormField label="وصف"><input className={inputCls} value={typeForm.description} onChange={(e) => setTypeForm({ ...typeForm, description: e.target.value })} /></FormField>
        </div>
      </Modal>

      {/* Reservation modal */}
      <Modal open={resModal} onClose={() => setResModal(false)} title="حجز جديد" size="md"
        footer={<div className="flex gap-2 justify-end"><Button variant="ghost" onClick={() => setResModal(false)}>إلغاء</Button><Button onClick={() => run(() => { service.createReservation({ branchId: '', customerId: resForm.customerId || undefined, roomId: resForm.roomId || undefined, checkIn: resForm.checkIn, checkOut: resForm.checkOut, guestsCount: Number(resForm.guestsCount), notes: resForm.notes }); setResModal(false); load(); })}>إنشاء</Button></div>}>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="العميل"><select className={selectCls} value={resForm.customerId} onChange={(e) => setResForm({ ...resForm, customerId: e.target.value })}><option value="">— نقدي —</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></FormField>
          <FormField label="الغرفة"><select className={selectCls} value={resForm.roomId} onChange={(e) => setResForm({ ...resForm, roomId: e.target.value })}><option value="">—</option>{rooms.filter((r) => r.status === 'AVAILABLE' || r.status === 'RESERVED').map((r) => <option key={r.id} value={r.id}>{r.roomNumber} ({ROOM_STATUS_LABEL[r.status]})</option>)}</select></FormField>
          <FormField label="تاريخ الدخول" required><input type="date" className={inputCls} value={resForm.checkIn} onChange={(e) => setResForm({ ...resForm, checkIn: e.target.value })} /></FormField>
          <FormField label="تاريخ الخروج" required><input type="date" className={inputCls} value={resForm.checkOut} onChange={(e) => setResForm({ ...resForm, checkOut: e.target.value })} /></FormField>
          <FormField label="عدد الضيوف"><input type="number" className={inputCls} value={resForm.guestsCount} onChange={(e) => setResForm({ ...resForm, guestsCount: e.target.value })} /></FormField>
          <FormField label="ملاحظات"><input className={inputCls} value={resForm.notes} onChange={(e) => setResForm({ ...resForm, notes: e.target.value })} /></FormField>
        </div>
      </Modal>

      {/* Folio modal */}
      <Modal open={folioModal} onClose={() => setFolioModal(false)} title={`حساب النزيل — ${selectedRes?.reservationNumber || ''}`} size="lg"
        footer={<div className="flex gap-2 justify-end"><Button variant="ghost" onClick={() => setFolioModal(false)}>إغلاق</Button></div>}>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <div className="text-sm">الرصيد المستحق: <strong className={folioBalance > 0 ? 'text-danger' : 'text-success'}>{currency.format(folioBalance)}</strong></div>
            {canManage && (
              <div className="flex gap-1">
                <input className={`${inputCls} w-40`} placeholder="البيان" value={folioForm.description} onChange={(e) => setFolioForm({ ...folioForm, description: e.target.value })} />
                <input type="number" step="0.01" className={`${inputCls} w-28`} placeholder="المبلغ" value={folioForm.amount} onChange={(e) => setFolioForm({ ...folioForm, amount: e.target.value })} />
                <select className={`${selectCls} w-28`} value={folioForm.entryType} onChange={(e) => setFolioForm({ ...folioForm, entryType: e.target.value as any })}>
                  <option value="CHARGE">مصروف</option><option value="PAYMENT">دفعة</option><option value="ADJUSTMENT">تسوية</option>
                </select>
                <Button size="sm" onClick={() => run(() => { if (selectedRes) { service.addFolioEntry(selectedRes.id, { description: folioForm.description || 'بند', amount: Number(folioForm.amount), entryType: folioForm.entryType }); setFolio(service.getFolio(selectedRes.id)); setFolioBalance(service.getFolioBalance(selectedRes.id)); setFolioForm({ description: '', amount: '', entryType: 'CHARGE' }); } })}>إضافة</Button>
              </div>
            )}
          </div>
          <table className="w-full text-sm">
            <thead><tr className="text-right text-[var(--cerami-muted)] border-b border-[var(--cerami-border)]"><th className="p-2">التاريخ</th><th className="p-2">البيان</th><th className="p-2">النوع</th><th className="p-2">المبلغ</th></tr></thead>
            <tbody>
              {folio.map((f) => (
                <tr key={f.id} className="border-b border-[var(--cerami-border)] last:border-0">
                  <td className="p-2">{f.entryDate}</td><td className="p-2">{f.description}</td>
                  <td className="p-2">{f.entryType === 'PAYMENT' ? 'دفعة' : f.entryType === 'ADJUSTMENT' ? 'تسوية' : 'مصروف'}</td>
                  <td className={`p-2 font-semibold ${f.entryType === 'PAYMENT' ? 'text-success' : ''}`}>{f.entryType === 'PAYMENT' ? '-' : ''}{currency.format(f.amount)}</td>
                </tr>
              ))}
              {folio.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-[var(--cerami-muted)]">لا توجد حركات.</td></tr>}
            </tbody>
          </table>
        </div>
      </Modal>

      {/* Task modal */}
      <Modal open={taskModal} onClose={() => setTaskModal(false)} title="مهمة تنظيف / صيانة" size="sm"
        footer={<div className="flex gap-2 justify-end"><Button variant="ghost" onClick={() => setTaskModal(false)}>إلغاء</Button><Button onClick={() => run(() => { service.createHousekeepingTask({ branchId: '', roomId: taskForm.roomId, taskType: taskForm.taskType, assignedTo: taskForm.assignedTo || undefined, scheduledDate: taskForm.scheduledDate || undefined, notes: taskForm.notes }); setTaskModal(false); load(); })}>إنشاء</Button></div>}>
        <div className="space-y-3">
          <FormField label="الغرفة" required><select className={selectCls} value={taskForm.roomId} onChange={(e) => setTaskForm({ ...taskForm, roomId: e.target.value })}>{rooms.map((r) => <option key={r.id} value={r.id}>{r.roomNumber}</option>)}</select></FormField>
          <FormField label="نوع المهمة"><select className={selectCls} value={taskForm.taskType} onChange={(e) => setTaskForm({ ...taskForm, taskType: e.target.value })}><option value="CLEANING">تنظيف</option><option value="INSPECTION">فحص</option><option value="MAINTENANCE">صيانة</option></select></FormField>
          <FormField label="المسند إلى"><input className={inputCls} value={taskForm.assignedTo} onChange={(e) => setTaskForm({ ...taskForm, assignedTo: e.target.value })} /></FormField>
          <FormField label="التاريخ"><input type="date" className={inputCls} value={taskForm.scheduledDate} onChange={(e) => setTaskForm({ ...taskForm, scheduledDate: e.target.value })} /></FormField>
          <FormField label="ملاحظات"><input className={inputCls} value={taskForm.notes} onChange={(e) => setTaskForm({ ...taskForm, notes: e.target.value })} /></FormField>
        </div>
      </Modal>
    </div>
  );
};

export default HotelPage;
