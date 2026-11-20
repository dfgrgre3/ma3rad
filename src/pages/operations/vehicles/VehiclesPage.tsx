import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Truck, Plus, Search, Loader2, X, Calendar, Fuel } from 'lucide-react';
import { OperationsService, Vehicle, Driver } from '../../../services/domains/operations/OperationsService';
import { PageHeader } from '../../../components/ui/PageHeader';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { OperationalFieldService, type OperationalFieldDefinition } from '../../../services/domains/products/OperationalFieldService';
import { OperationalFieldsForm } from '../../../components/products/OperationalFieldsForm';
import { OperationalFieldsSummary } from '../../../components/products/OperationalFieldsSummary';
import { OperationalFieldsRecordEditor } from '../../../components/products/OperationalFieldsRecordEditor';
import { OperationalFieldsFilter, matchesOperationalFieldFilters, type OperationalFieldFilters } from '../../../components/products/OperationalFieldsFilter';

import { useToast } from '../../../components/ui/Toast';
const STATUS_LABEL: Record<Vehicle['status'], string> = {
  AVAILABLE: 'متاحة', ON_DELIVERY: 'في رحلة', MAINTENANCE: 'صيانة', OUT_OF_SERVICE: 'خارج الخدمة',
};
const STATUS_STYLE: Record<Vehicle['status'], string> = {
  AVAILABLE: 'bg-success-soft text-success border-success-border',
  ON_DELIVERY: 'bg-accent-soft text-primary border-accent-border',
  MAINTENANCE: 'bg-warning-soft text-warning border-warning-border',
  OUT_OF_SERVICE: 'bg-danger-soft text-danger border-danger-border',
};

export const VehiclesPage: React.FC = () => {
  const toast = useToast();
  const service = useMemo(() => new OperationsService(), []);
  const fieldService = useMemo(() => new OperationalFieldService(), []);
  const currentUser = AuthService.getCurrentUser();
  const canCreate = PermissionService.can(currentUser, 'ui.vehicles.vehicles.create');
  const canUpdate = PermissionService.can(currentUser, 'ui.vehicles.vehicles.update');
  const canManage = PermissionService.can(currentUser, 'ui.vehicles.vehicles.manage');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState<OperationalFieldDefinition[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [valuesByVehicle, setValuesByVehicle] = useState<Record<string, Record<string, string>>>({});
  const [fieldFilters, setFieldFilters] = useState<OperationalFieldFilters>({});
  const [form, setForm] = useState({
    plateNumber: '', make: '', model: '', year: '', capacityKg: '', assignedDriverId: '',
    licenseExpiresAt: '', insuranceExpiresAt: '',
  });

  const load = useCallback((query: string) => {
    setLoading(true);
    try {
      const currentVehicles = service.getVehicles(query);
      setVehicles(currentVehicles);
      setFields(fieldService.getDefinitions('vehicles'));
      setValuesByVehicle(fieldService.getRecordValuesForRecords('vehicles', currentVehicles.map((vehicle) => vehicle.id)));
      setDrivers(service.getDrivers());
      setError(null);
    } catch (e: any) { setError(e?.message || 'تعذر تحميل المركبات.'); }
    finally { setLoading(false); }
  }, [service, fieldService]);

  useEffect(() => { load(''); }, [load]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      fieldService.validateRecordValues('vehicles', values, 'create');
      const created = service.createVehicle({
        plateNumber: form.plateNumber,
        make: form.make || undefined,
        model: form.model || undefined,
        year: form.year ? Number(form.year) : undefined,
        capacityKg: form.capacityKg ? Number(form.capacityKg) : undefined,
        assignedDriverId: form.assignedDriverId || undefined,
        licenseExpiresAt: form.licenseExpiresAt || undefined,
        insuranceExpiresAt: form.insuranceExpiresAt || undefined,
      });
      fieldService.setRecordValues('vehicles', created.id, values, 'create');
      setValues({});
      setModalOpen(false);
      setForm({ plateNumber: '', make: '', model: '', year: '', capacityKg: '', assignedDriverId: '', licenseExpiresAt: '', insuranceExpiresAt: '' });
      load(search);
    } catch (err: any) { toast.error(err?.message || 'تعذر إضافة المركبة.'); }
    finally { setSaving(false); }
  };

  const changeStatus = (v: Vehicle, status: Vehicle['status']) => {
    try { service.updateVehicleStatus(v.id, status); load(search); } catch (e: any) { toast.warning(e?.message); }
  };

  return (
    <div className="h-full flex flex-col bg-surface-muted text-ink overflow-hidden">
      <div className="bg-surface px-6 pt-4">
        <PageHeader
          icon={<Truck className="h-5 w-5" />}
          title="المركبات"
          description="أسطول التوصيل وحالات المركبات"
          actions={canCreate && (
            <button onClick={() => setModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-success hover:bg-success text-white rounded-xl text-sm font-semibold transition shrink-0">
              <Plus className="w-4 h-4" /> إضافة مركبة
            </button>
          )}
        />
      </div>

      <div className="p-4 bg-surface border-b border-line">
        <form onSubmit={(e) => { e.preventDefault(); load(search); }} className="relative">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث برقم اللوحة أو الماركة ثم اضغط إدخال..." className="w-full pl-4 pr-10 py-2.5 bg-surface border border-line rounded-xl text-sm focus:outline-none focus:border-success" />
        </form>
        <div className="mt-3"><OperationalFieldsFilter fields={fields} values={fieldFilters} onChange={setFieldFilters} /></div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {error && <div className="mb-3 px-4 py-2.5 rounded-xl bg-danger-soft border border-danger-border text-danger text-xs font-semibold">{error}</div>}
        {loading ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-success" /></div> : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {vehicles.filter((vehicle) => matchesOperationalFieldFilters(vehicle.id, valuesByVehicle, fieldFilters)).map((v) => (
              <div key={v.id} className="bg-surface border border-line hover:border-line-strong rounded-xl p-5 transition">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-black text-lg text-ink font-mono tracking-wider">{v.plateNumber}</h3>
                    <p className="text-xs text-muted">{[v.make, v.model].filter(Boolean).join(' ') || v.vehicleType} {v.year ? `• ${v.year}` : ''}</p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${STATUS_STYLE[v.status]}`}>{STATUS_LABEL[v.status]}</span>
                </div>
                <div className="space-y-1.5 text-xs text-muted mt-3">
                  <div className="flex items-center gap-1.5"><Fuel className="w-3.5 h-3.5" /><span>السائق: {v.assignedDriverName || 'غير مسند'}</span></div>
                  <div className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /><span>انتهاء الترخيص: {v.licenseExpiresAt ? new Date(v.licenseExpiresAt).toLocaleDateString('ar-EG') : '—'}</span></div>
                </div>
                <OperationalFieldsSummary fields={fields} values={valuesByVehicle[v.id] || {}} />
                <OperationalFieldsRecordEditor
                  recordLabel={v.plateNumber}
                  fields={fields}
                  initialValues={valuesByVehicle[v.id] || {}}
                  canEdit={canUpdate || canManage}
                  onSave={(next) => {
                    fieldService.setRecordValues('vehicles', v.id, next, 'update');
                    setValuesByVehicle((previous) => ({ ...previous, [v.id]: next }));
                  }}
                />
                {(canUpdate || canManage) && (
                  <div className="mt-4 pt-3 border-t border-line">
                    <select value={v.status} onChange={(e) => changeStatus(v, e.target.value as Vehicle['status'])} className="w-full px-2 py-1.5 bg-surface-muted border border-line rounded-lg text-xs font-bold text-ink">
                      {Object.entries(STATUS_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                    </select>
                  </div>
                )}
              </div>
            ))}
            {vehicles.length === 0 && <div className="col-span-full py-16 text-center text-muted border-2 border-dashed border-line rounded-2xl bg-surface">لا توجد مركبات</div>}
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl border border-line shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold text-ink">إضافة مركبة</h3>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg text-muted hover:bg-surface-sunken"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div><label className="font-bold text-ink block mb-1">رقم اللوحة *</label><input required value={form.plateNumber} onChange={(e) => setForm({ ...form, plateNumber: e.target.value })} className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line font-mono font-bold" /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div><label className="font-bold text-ink block mb-1">الماركة</label><input value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line" /></div>
                <div><label className="font-bold text-ink block mb-1">الموديل</label><input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line" /></div>
                <div><label className="font-bold text-ink block mb-1">سنة الصنع</label><input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line" /></div>
                <div><label className="font-bold text-ink block mb-1">الحمولة (كجم)</label><input type="number" value={form.capacityKg} onChange={(e) => setForm({ ...form, capacityKg: e.target.value })} className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line" /></div>
              </div>
              <div>
                <label className="font-bold text-ink block mb-1">السائق المسند</label>
                <select value={form.assignedDriverId} onChange={(e) => setForm({ ...form, assignedDriverId: e.target.value })} className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line font-bold">
                  <option value="">— غير مسند —</option>
                  {drivers.map((d) => <option key={d.id} value={d.id}>{d.fullName}</option>)}
                </select>
              </div>
              <OperationalFieldsForm fields={fields} values={values} onChange={setValues} title="بيانات إضافية للمركبة" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div><label className="font-bold text-ink block mb-1">انتهاء الترخيص</label><input type="date" value={form.licenseExpiresAt} onChange={(e) => setForm({ ...form, licenseExpiresAt: e.target.value })} className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line" /></div>
                <div><label className="font-bold text-ink block mb-1">انتهاء التأمين</label><input type="date" value={form.insuranceExpiresAt} onChange={(e) => setForm({ ...form, insuranceExpiresAt: e.target.value })} className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line" /></div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-line">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 bg-surface-sunken text-ink font-bold rounded-xl">إلغاء</button>
                <button type="submit" disabled={saving} className="px-5 py-2 bg-success hover:bg-success text-white font-bold rounded-xl flex items-center gap-2">{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} إضافة</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
