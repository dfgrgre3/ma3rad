import React, { useEffect, useState } from 'react';
import { Truck, Plus, Search, Loader2, X, Calendar, Fuel } from 'lucide-react';
import { OperationsService, Vehicle, Driver } from '../../services/OperationsService';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';

const STATUS_LABEL: Record<Vehicle['status'], string> = {
  AVAILABLE: 'متاحة', ON_DELIVERY: 'في رحلة', MAINTENANCE: 'صيانة', OUT_OF_SERVICE: 'خارج الخدمة',
};
const STATUS_STYLE: Record<Vehicle['status'], string> = {
  AVAILABLE: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  ON_DELIVERY: 'bg-sky-50 text-sky-600 border-sky-200',
  MAINTENANCE: 'bg-amber-50 text-amber-600 border-amber-200',
  OUT_OF_SERVICE: 'bg-rose-50 text-rose-600 border-rose-200',
};

export const VehiclesPage: React.FC = () => {
  const service = new OperationsService();
  const canManage = PermissionService.can(AuthService.getCurrentUser(), 'vehicles.manage');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    plateNumber: '', make: '', model: '', year: '', capacityKg: '', assignedDriverId: '',
    licenseExpiresAt: '', insuranceExpiresAt: '',
  });

  const load = () => {
    setLoading(true);
    try {
      setVehicles(service.getVehicles(search));
      setDrivers(service.getDrivers());
      setError(null);
    } catch (e: any) { setError(e?.message || 'تعذر تحميل المركبات.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      service.createVehicle({
        plateNumber: form.plateNumber,
        make: form.make || undefined,
        model: form.model || undefined,
        year: form.year ? Number(form.year) : undefined,
        capacityKg: form.capacityKg ? Number(form.capacityKg) : undefined,
        assignedDriverId: form.assignedDriverId || undefined,
        licenseExpiresAt: form.licenseExpiresAt || undefined,
        insuranceExpiresAt: form.insuranceExpiresAt || undefined,
      });
      setModalOpen(false);
      setForm({ plateNumber: '', make: '', model: '', year: '', capacityKg: '', assignedDriverId: '', licenseExpiresAt: '', insuranceExpiresAt: '' });
      load();
    } catch (err: any) { alert(err?.message || 'تعذر إضافة المركبة.'); }
    finally { setSaving(false); }
  };

  const changeStatus = (v: Vehicle, status: Vehicle['status']) => {
    try { service.updateVehicleStatus(v.id, status); load(); } catch (e: any) { alert(e?.message); }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center"><Truck className="w-5 h-5 text-teal-600" /></div>
          <div>
            <h1 className="text-base font-black text-slate-900">المركبات</h1>
            <p className="text-xs text-slate-500 font-medium">أسطول التوصيل وحالات المركبات</p>
          </div>
        </div>
        {canManage && (
          <button onClick={() => setModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold transition shrink-0">
            <Plus className="w-4 h-4" /> إضافة مركبة
          </button>
        )}
      </div>

      <div className="p-4 bg-white border-b border-slate-200">
        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="relative">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث برقم اللوحة أو الماركة ثم Enter..." className="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-teal-400" />
        </form>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {error && <div className="mb-3 px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{error}</div>}
        {loading ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-teal-500" /></div> : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {vehicles.map((v) => (
              <div key={v.id} className="bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-5 transition">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-black text-lg text-slate-900 font-mono tracking-wider">{v.plateNumber}</h3>
                    <p className="text-xs text-slate-500">{[v.make, v.model].filter(Boolean).join(' ') || v.vehicleType} {v.year ? `• ${v.year}` : ''}</p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${STATUS_STYLE[v.status]}`}>{STATUS_LABEL[v.status]}</span>
                </div>
                <div className="space-y-1.5 text-xs text-slate-500 mt-3">
                  <div className="flex items-center gap-1.5"><Fuel className="w-3.5 h-3.5" /><span>السائق: {v.assignedDriverName || 'غير مسند'}</span></div>
                  <div className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /><span>انتهاء الترخيص: {v.licenseExpiresAt ? new Date(v.licenseExpiresAt).toLocaleDateString('ar-EG') : '—'}</span></div>
                </div>
                {canManage && (
                  <div className="mt-4 pt-3 border-t border-slate-100">
                    <select value={v.status} onChange={(e) => changeStatus(v, e.target.value as Vehicle['status'])} className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700">
                      {Object.entries(STATUS_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                    </select>
                  </div>
                )}
              </div>
            ))}
            {vehicles.length === 0 && <div className="col-span-full py-16 text-center text-slate-500 border-2 border-dashed border-slate-200 rounded-2xl bg-white">لا توجد مركبات</div>}
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold text-slate-900">إضافة مركبة</h3>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div><label className="font-bold text-slate-700 block mb-1">رقم اللوحة *</label><input required value={form.plateNumber} onChange={(e) => setForm({ ...form, plateNumber: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono font-bold" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="font-bold text-slate-700 block mb-1">الماركة</label><input value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" /></div>
                <div><label className="font-bold text-slate-700 block mb-1">الموديل</label><input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" /></div>
                <div><label className="font-bold text-slate-700 block mb-1">سنة الصنع</label><input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" /></div>
                <div><label className="font-bold text-slate-700 block mb-1">الحمولة (كجم)</label><input type="number" value={form.capacityKg} onChange={(e) => setForm({ ...form, capacityKg: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" /></div>
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">السائق المسند</label>
                <select value={form.assignedDriverId} onChange={(e) => setForm({ ...form, assignedDriverId: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                  <option value="">— غير مسند —</option>
                  {drivers.map((d) => <option key={d.id} value={d.id}>{d.fullName}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="font-bold text-slate-700 block mb-1">انتهاء الترخيص</label><input type="date" value={form.licenseExpiresAt} onChange={(e) => setForm({ ...form, licenseExpiresAt: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" /></div>
                <div><label className="font-bold text-slate-700 block mb-1">انتهاء التأمين</label><input type="date" value={form.insuranceExpiresAt} onChange={(e) => setForm({ ...form, insuranceExpiresAt: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" /></div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl">إلغاء</button>
                <button type="submit" disabled={saving} className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl flex items-center gap-2">{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} إضافة</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
