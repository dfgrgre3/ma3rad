import React from 'react';
import { Loader2, X } from 'lucide-react';
import type { Driver, Vehicle } from '../../services/OperationsService';
interface Customer { id: string; name: string; phone?: string | null; address?: string | null; city?: string | null }
interface DeliveryForm { customerId: string; address: string; city: string; driverId: string; vehicleId: string; scheduledAt: string; deliveryFee: string; notes: string }
interface Props { form: DeliveryForm; setForm: React.Dispatch<React.SetStateAction<DeliveryForm>>; customers: Customer[]; drivers: Driver[]; vehicles: Vehicle[]; saving: boolean; onClose: () => void; onSubmit: (event: React.FormEvent) => void; onPickCustomer: (customerId: string) => void }
export const DeliveryCreateModal: React.FC<Props> = ({ form, setForm, customers, drivers, vehicles, saving, onClose, onSubmit, onPickCustomer }) => (
<div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold text-slate-900">أمر تسليم جديد</h3>
              <button onClick={() => onClose()} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={onSubmit} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">العميل *</label>
                <select required value={form.customerId} onChange={(e) => onPickCustomer(e.target.value)} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                  <option value="">— اختر العميل —</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ''}</option>)}
                </select>
              </div>
              <div><label className="font-bold text-slate-700 block mb-1">عنوان التسليم *</label><input required value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="font-bold text-slate-700 block mb-1">المدينة</label><input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" /></div>
                <div><label className="font-bold text-slate-700 block mb-1">موعد التسليم</label><input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" /></div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">السائق</label>
                  <select value={form.driverId} onChange={(e) => setForm({ ...form, driverId: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                    <option value="">— غير مسند —</option>
                    {drivers.map((d) => <option key={d.id} value={d.id}>{d.fullName}</option>)}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">المركبة</label>
                  <select value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                    <option value="">— بدون —</option>
                    {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plateNumber}</option>)}
                  </select>
                </div>
                <div><label className="font-bold text-slate-700 block mb-1">رسوم التوصيل</label><input type="number" min={0} step="0.01" value={form.deliveryFee} onChange={(e) => setForm({ ...form, deliveryFee: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" /></div>
              </div>
              <div><label className="font-bold text-slate-700 block mb-1">ملاحظات</label><textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" /></div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => onClose()} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl">إلغاء</button>
                <button type="submit" disabled={saving} className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl flex items-center gap-2">{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} إنشاء</button>
              </div>
            </form>
          </div>
        </div>
);
