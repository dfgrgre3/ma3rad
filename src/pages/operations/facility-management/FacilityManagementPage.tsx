import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Building2, CalendarClock, Check, ClipboardCheck, FileText, MapPin,
  Plus, RefreshCw, Search, ShieldCheck, Wrench, X,
} from 'lucide-react';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { FacilityManagementService } from '../../../services/domains/operations/FacilityManagementService';

type TabKey = 'locations' | 'assets' | 'maintenance' | 'contracts' | 'safety';
type LocationRow = ReturnType<FacilityManagementService['getLocations']>[number];
type AssetRow = ReturnType<FacilityManagementService['getAssets']>[number];
type WorkOrderRow = ReturnType<FacilityManagementService['getWorkOrders']>[number];
type ContractRow = ReturnType<FacilityManagementService['getContracts']>[number];
type SafetyRow = ReturnType<FacilityManagementService['getSafetyRecords']>[number];
type FormField = { key: string; label: string; type?: 'text' | 'date' | 'number' | 'textarea' | 'select'; required?: boolean; options?: { value: string; label: string }[]; placeholder?: string };

const tabs: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'locations', label: 'المواقع والمنشآت', icon: Building2 },
  { key: 'assets', label: 'الأصول التشغيلية', icon: Wrench },
  { key: 'maintenance', label: 'الصيانة وأوامر العمل', icon: ClipboardCheck },
  { key: 'contracts', label: 'العقود والخدمات', icon: FileText },
  { key: 'safety', label: 'التفتيش والسلامة', icon: ShieldCheck },
];

const locationTypes = [
  ['BUILDING', 'مبنى'], ['FLOOR', 'طابق'], ['ROOM', 'غرفة'], ['SHOWROOM', 'معرض'],
  ['OFFICE', 'مكتب'], ['FACTORY', 'مصنع'], ['PRODUCTION_AREA', 'منطقة إنتاج'], ['WAREHOUSE', 'مخزن'], ['OTHER', 'أخرى'],
].map(([value, label]) => ({ value, label }));
const typeLabels: Record<string, string> = {
  BUILDING: 'مبنى', FLOOR: 'طابق', ROOM: 'غرفة', SHOWROOM: 'معرض', OFFICE: 'مكتب', FACTORY: 'مصنع',
  PRODUCTION_AREA: 'منطقة إنتاج', WAREHOUSE: 'مخزن', OTHER: 'أخرى', EQUIPMENT: 'معدات',
  PREVENTIVE: 'وقائية', CORRECTIVE: 'تصحيحية', PREDICTIVE: 'تنبؤية', LEASE: 'إيجار', MAINTENANCE: 'صيانة',
  CLEANING: 'نظافة', SECURITY: 'حراسة', UTILITY: 'مرافق', INSPECTION: 'تفتيش', INCIDENT: 'حادث', RISK: 'مخاطر',
  ONE_TIME: 'مرة واحدة', MONTHLY: 'شهري', QUARTERLY: 'ربع سنوي', YEARLY: 'سنوي',
};
const statusLabels: Record<string, string> = {
  ACTIVE: 'ساري', MAINTENANCE: 'تحت الصيانة', OUT_OF_SERVICE: 'خارج الخدمة', RETIRED: 'مستبعد',
  OPEN: 'جديد', APPROVED: 'معتمد', IN_PROGRESS: 'قيد التنفيذ', COMPLETED: 'مكتمل', CANCELLED: 'ملغي',
  EXPIRED: 'منتهي', PASS: 'مطابق', OBSERVATION: 'ملاحظة', FAIL: 'غير مطابق', CLOSED: 'مغلق',
};
const formatNumber = (value: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 0 }).format(value || 0);
const formatDate = (value?: string | null) => value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('ar-EG') : 'غير محدد';
const amountLabel = (value: number) => `${formatNumber(value)} ج`;

export const FacilityManagementPage: React.FC = () => {
  const service = useMemo(() => new FacilityManagementService(), []);
  const user = AuthService.getCurrentUser();
  const canManage = PermissionService.can(user, 'operations.update');
  const [activeTab, setActiveTab] = useState<TabKey>('locations');
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrderRow[]>([]);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [safetyRecords, setSafetyRecords] = useState<SafetyRow[]>([]);
  const [branches, setBranches] = useState<ReturnType<FacilityManagementService['getBranches']>>([]);
  const [users, setUsers] = useState<ReturnType<FacilityManagementService['getUsers']>>([]);
  const [fixedAssets, setFixedAssets] = useState<ReturnType<FacilityManagementService['getFixedAssets']>>([]);
  const [expenses, setExpenses] = useState<ReturnType<FacilityManagementService['getExpenses']>>([]);
  const [stockIssues, setStockIssues] = useState<ReturnType<FacilityManagementService['getStockIssueTransactions']>>([]);
  const [maintenanceSchedules, setMaintenanceSchedules] = useState<ReturnType<FacilityManagementService['getMaintenanceSchedules']>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    try {
      setBranches(service.getBranches());
      setUsers(service.getUsers());
      setFixedAssets(service.getFixedAssets());
      setExpenses(service.getExpenses());
      setStockIssues(service.getStockIssueTransactions());
      setMaintenanceSchedules(service.getMaintenanceSchedules());
      service.runFacilityReminders();
      setLocations(service.getLocations());
      setAssets(service.getAssets());
      setWorkOrders(service.getWorkOrders());
      setContracts(service.getContracts());
      setSafetyRecords(service.getSafetyRecords());
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل بيانات إدارة المنشأة.');
    } finally {
      setLoading(false);
    }
  }, [service]);

  useEffect(() => { load(); }, [load]);

  const openCount = workOrders.filter((item) => ['OPEN', 'APPROVED', 'IN_PROGRESS'].includes(item.status)).length;
  const overdueContracts = contracts.filter((item) => item.endsAt && item.endsAt <= new Date().toISOString().slice(0, 10) && item.status === 'ACTIVE').length;
  const dueSafety = safetyRecords.filter((item) => item.result !== 'CLOSED' && item.result !== 'PASS').length;
  const maintenanceSpend = workOrders.reduce((sum, item) => sum + Number(item.laborCost || 0) + Number(item.partsCost || 0) + Number(item.serviceCost || 0), 0);

  const locationOptions = locations.map((item) => ({ value: item.id, label: `${item.name} · ${item.branchName}` }));
  const assetOptions = assets.map((item) => ({ value: item.id, label: item.name }));
  const userOptions = users.map((item) => ({ value: item.id, label: item.fullName }));
  const fixedAssetOptions = fixedAssets.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` }));
  const expenseOptions = expenses.map((item) => ({ value: item.id, label: `${item.date} · ${item.description} · ${formatNumber(item.amount)} ج` }));
  const stockIssueOptions = stockIssues.map((item) => ({ value: item.id, label: `${item.transactionNumber} · ${item.productName} · ${item.warehouseName} · ${formatNumber(item.quantityM2)}` }));
  const fields: Record<TabKey, FormField[]> = {
    locations: [
      { key: 'branchId', label: 'الفرع', type: 'select', required: true, options: branches.map((item) => ({ value: item.id, label: item.name })) },
      { key: 'parentId', label: 'الموقع الأعلى', type: 'select', options: [{ value: '', label: 'موقع رئيسي' }, ...locations.map((item) => ({ value: item.id, label: item.name }))] },
      { key: 'locationType', label: 'نوع الموقع', type: 'select', required: true, options: locationTypes },
      { key: 'name', label: 'اسم الموقع', required: true }, { key: 'code', label: 'رمز الموقع' },
      { key: 'managerUserId', label: 'المسؤول', type: 'select', options: [{ value: '', label: 'غير محدد' }, ...userOptions] },
      { key: 'address', label: 'العنوان', type: 'textarea' },
    ],
    assets: [
      { key: 'locationId', label: 'الموقع', type: 'select', required: true, options: locationOptions },
      { key: 'name', label: 'اسم الأصل', required: true }, { key: 'code', label: 'رقم الأصل', required: true },
      { key: 'fixedAssetId', label: 'الأصل الثابت المرتبط', type: 'select', options: [{ value: '', label: 'غير مرتبط' }, ...fixedAssetOptions] },
      { key: 'category', label: 'الفئة', placeholder: 'تكييف، كهرباء، مولد...' }, { key: 'serialNumber', label: 'الرقم التسلسلي' },
      { key: 'responsibleUserId', label: 'المسؤول عنه', type: 'select', options: [{ value: '', label: 'غير محدد' }, ...userOptions] },
      { key: 'warrantyExpiresAt', label: 'انتهاء الضمان', type: 'date' }, { key: 'notes', label: 'ملاحظات', type: 'textarea' },
    ],
    maintenance: [
      { key: 'locationId', label: 'الموقع', type: 'select', required: true, options: locationOptions },
      { key: 'assetId', label: 'الأصل', type: 'select', options: [{ value: '', label: 'بدون أصل محدد' }, ...assetOptions] },
      { key: 'requestType', label: 'نوع الصيانة', type: 'select', required: true, options: [['PREVENTIVE', 'وقائية'], ['CORRECTIVE', 'تصحيحية'], ['PREDICTIVE', 'تنبؤية']].map(([value, label]) => ({ value, label })) },
      { key: 'priority', label: 'الأولوية', type: 'select', options: [['LOW', 'منخفضة'], ['NORMAL', 'عادية'], ['HIGH', 'عالية'], ['URGENT', 'عاجلة']].map(([value, label]) => ({ value, label })) },
      { key: 'title', label: 'عنوان الطلب', required: true }, { key: 'description', label: 'وصف العطل أو الإجراء', type: 'textarea' },
      { key: 'assignedTo', label: 'الفني المسؤول', type: 'select', options: [{ value: '', label: 'غير محدد' }, ...userOptions] },
      { key: 'vendorName', label: 'مقدم الخدمة' }, { key: 'scheduledDate', label: 'موعد التنفيذ', type: 'date' },
      { key: 'nextMaintenanceDate', label: 'موعد الصيانة الوقائية التالية', type: 'date' },
      { key: 'repeatIntervalDays', label: 'تكرار الصيانة بالأيام (للوقائية)', type: 'number', placeholder: 'مثال: 30' },
      { key: 'laborCost', label: 'تكلفة العمالة', type: 'number' }, { key: 'partsCost', label: 'تكلفة قطع الغيار', type: 'number' },
      { key: 'serviceCost', label: 'تكلفة الخدمات', type: 'number' },
      { key: 'expenseId', label: 'مصروف مسجل مرتبط', type: 'select', options: [{ value: '', label: 'بدون ربط' }, ...expenseOptions] },
      { key: 'inventoryTransactionId', label: 'حركة صرف مخزني', type: 'select', options: [{ value: '', label: 'بدون ربط' }, ...stockIssueOptions] },
    ],
    contracts: [
      { key: 'locationId', label: 'الموقع', type: 'select', required: true, options: locationOptions },
      { key: 'contractType', label: 'نوع العقد', type: 'select', required: true, options: [['LEASE', 'إيجار'], ['MAINTENANCE', 'صيانة'], ['CLEANING', 'نظافة'], ['SECURITY', 'حراسة'], ['UTILITY', 'خدمات المرافق'], ['OTHER', 'أخرى']].map(([value, label]) => ({ value, label })) },
      { key: 'title', label: 'موضوع العقد', required: true }, { key: 'vendorName', label: 'المورد أو مقدم الخدمة', required: true },
      { key: 'startsAt', label: 'بداية العقد', type: 'date' }, { key: 'endsAt', label: 'نهاية العقد', type: 'date' },
      { key: 'nextPaymentDate', label: 'موعد الدفعة التالية', type: 'date' }, { key: 'paymentAmount', label: 'قيمة الدفعة', type: 'number' },
      { key: 'paymentCycle', label: 'دورية الدفع', type: 'select', options: [['ONE_TIME', 'مرة واحدة'], ['MONTHLY', 'شهري'], ['QUARTERLY', 'ربع سنوي'], ['YEARLY', 'سنوي']].map(([value, label]) => ({ value, label })) },
      { key: 'expenseReference', label: 'مرجع المصروف' },
    ],
    safety: [
      { key: 'locationId', label: 'الموقع', type: 'select', required: true, options: locationOptions },
      { key: 'assetId', label: 'الأصل', type: 'select', options: [{ value: '', label: 'بدون أصل محدد' }, ...assetOptions] },
      { key: 'recordType', label: 'نوع السجل', type: 'select', required: true, options: [['INSPECTION', 'تفتيش'], ['INCIDENT', 'حادث'], ['RISK', 'تقييم مخاطر']].map(([value, label]) => ({ value, label })) },
      { key: 'title', label: 'عنوان السجل', required: true }, { key: 'checklistName', label: 'قائمة التفتيش' },
      { key: 'result', label: 'النتيجة', type: 'select', options: [['OPEN', 'مفتوح'], ['PASS', 'مطابق'], ['OBSERVATION', 'ملاحظة'], ['FAIL', 'غير مطابق']].map(([value, label]) => ({ value, label })) },
      { key: 'riskLevel', label: 'مستوى الخطورة', type: 'select', options: [{ value: '', label: 'غير محدد' }, ...[['LOW', 'منخفض'], ['MEDIUM', 'متوسط'], ['HIGH', 'مرتفع'], ['CRITICAL', 'حرج']].map(([value, label]) => ({ value, label }))] },
      { key: 'observations', label: 'الملاحظات أو وصف الحادث', type: 'textarea' },
      { key: 'correctiveAction', label: 'الإجراء التصحيحي', type: 'textarea' }, { key: 'dueDate', label: 'موعد الإغلاق', type: 'date' },
    ],
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (activeTab === 'locations') service.createLocation(form as never);
      if (activeTab === 'assets') service.createAsset(form as never);
      if (activeTab === 'maintenance') service.createWorkOrder(form as never);
      if (activeTab === 'contracts') service.createContract(form as never);
      if (activeTab === 'safety') service.createSafetyRecord(form as never);
      setModalOpen(false);
      setForm({});
      setNotice('تم حفظ السجل.');
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر حفظ السجل.');
    } finally {
      setSaving(false);
    }
  };

  const visible = (text: string) => text.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
  const openForm = (tab: TabKey) => { setActiveTab(tab); setForm({}); setError(''); setModalOpen(true); };

  const statusBadge = (status: string) => {
    const tone = ['COMPLETED', 'ACTIVE', 'PASS', 'CLOSED'].includes(status) ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : ['FAIL', 'OUT_OF_SERVICE', 'EXPIRED', 'CANCELLED'].includes(status) ? 'border-rose-200 bg-rose-50 text-rose-700'
        : ['IN_PROGRESS', 'OBSERVATION', 'MAINTENANCE', 'HIGH', 'URGENT'].includes(status) ? 'border-amber-200 bg-amber-50 text-amber-800'
          : 'border-slate-200 bg-slate-100 text-slate-700';
    return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${tone}`}>{statusLabels[status] || status}</span>;
  };

  const renderBody = () => {
    if (activeTab === 'locations') {
      const rows = locations.filter((item) => visible(`${item.name} ${item.code || ''} ${item.branchName}`));
      return <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-right"><thead><tr className="border-b border-slate-200 text-xs text-slate-500"><th className="px-4 py-3 font-semibold">الموقع</th><th className="px-4 py-3 font-semibold">التصنيف</th><th className="px-4 py-3 font-semibold">الفرع</th><th className="px-4 py-3 font-semibold">المسؤول</th><th className="px-4 py-3 font-semibold">العنوان</th></tr></thead><tbody>{rows.map((item) => <tr key={item.id} className="border-b border-slate-100 last:border-0"><td className="px-4 py-3"><div className="font-bold text-slate-800">{item.name}</div><div className="text-xs text-slate-400">{item.code || 'بدون رمز'}</div></td><td className="px-4 py-3 text-sm">{typeLabels[item.locationType] || item.locationType}</td><td className="px-4 py-3 text-sm">{item.branchName}</td><td className="px-4 py-3 text-sm">{item.managerName || 'غير محدد'}</td><td className="px-4 py-3 text-sm text-slate-500">{item.address || '—'}</td></tr>)}</tbody></table></div>;
    }
    if (activeTab === 'assets') {
      const rows = assets.filter((item) => visible(`${item.name} ${item.code} ${item.locationName} ${item.serialNumber || ''}`));
      return <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-right"><thead><tr className="border-b border-slate-200 text-xs text-slate-500"><th className="px-4 py-3 font-semibold">الأصل</th><th className="px-4 py-3 font-semibold">الموقع</th><th className="px-4 py-3 font-semibold">الفئة / الرقم التسلسلي</th><th className="px-4 py-3 font-semibold">المسؤول</th><th className="px-4 py-3 font-semibold">الضمان</th><th className="px-4 py-3 font-semibold">الحالة</th></tr></thead><tbody>{rows.map((item) => <tr key={item.id} className="border-b border-slate-100 last:border-0"><td className="px-4 py-3"><div className="font-bold text-slate-800">{item.name}</div><div className="text-xs text-slate-400">{item.code}</div></td><td className="px-4 py-3 text-sm">{item.locationName}</td><td className="px-4 py-3 text-sm">{item.category}<div className="text-xs text-slate-400">{item.serialNumber || '—'}</div></td><td className="px-4 py-3 text-sm">{item.responsibleName || 'غير محدد'}</td><td className="px-4 py-3 text-sm">{formatDate(item.warrantyExpiresAt)}</td><td className="px-4 py-3">{statusBadge(item.status)}</td></tr>)}</tbody></table></div>;
    }
    if (activeTab === 'maintenance') {
      const rows = workOrders.filter((item) => visible(`${item.workOrderNumber} ${item.title} ${item.locationName} ${item.assetName || ''} ${item.vendorName || ''}`));
      return <div className="divide-y divide-slate-100">{rows.map((item) => <article key={item.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(130px,.7fr)_minmax(130px,.7fr)_minmax(130px,.8fr)_auto] lg:items-center"><div><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-slate-400">{item.workOrderNumber}</span>{statusBadge(item.status)}<span className="text-xs text-slate-500">{typeLabels[item.requestType]}</span></div><h3 className="mt-1 font-bold text-slate-800">{item.title}</h3><p className="mt-1 text-xs text-slate-500">{item.locationName}{item.assetName ? ` · ${item.assetName}` : ''}</p>{item.description && <p className="mt-1 text-sm text-slate-600">{item.description}</p>}</div><div className="text-sm"><div className="text-xs text-slate-400">الفني / المورد</div><div>{item.assigneeName || item.vendorName || 'غير محدد'}</div></div><div className="text-sm"><div className="text-xs text-slate-400">الموعد</div><div>{formatDate(item.scheduledDate)}</div></div><div className="text-sm"><div className="text-xs text-slate-400">إجمالي التكلفة</div><div className="font-bold">{amountLabel(Number(item.laborCost) + Number(item.partsCost) + Number(item.serviceCost))}</div></div>{canManage && !['COMPLETED', 'CANCELLED'].includes(item.status) && <div className="flex flex-wrap gap-1"><button onClick={() => { service.updateWorkOrderStatus(item.id, item.status === 'OPEN' ? 'APPROVED' : 'IN_PROGRESS'); load(); }} className="rounded border border-sky-200 px-2 py-1 text-xs font-bold text-sky-700 hover:bg-sky-50">{item.status === 'OPEN' ? 'اعتماد' : 'بدء'}</button><button onClick={() => { service.updateWorkOrderStatus(item.id, 'COMPLETED'); load(); }} className="rounded border border-emerald-200 px-2 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-50">إكمال</button></div>}</article>)}</div>;
    }
    if (activeTab === 'contracts') {
      const rows = contracts.filter((item) => visible(`${item.contractNumber} ${item.title} ${item.vendorName} ${item.locationName}`));
      return <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-right"><thead><tr className="border-b border-slate-200 text-xs text-slate-500"><th className="px-4 py-3 font-semibold">العقد</th><th className="px-4 py-3 font-semibold">النوع والموقع</th><th className="px-4 py-3 font-semibold">المورد</th><th className="px-4 py-3 font-semibold">الانتهاء</th><th className="px-4 py-3 font-semibold">الدفعة التالية</th><th className="px-4 py-3 font-semibold">قيمة الدفعة</th><th className="px-4 py-3 font-semibold">الحالة</th></tr></thead><tbody>{rows.map((item) => <tr key={item.id} className="border-b border-slate-100 last:border-0"><td className="px-4 py-3"><div className="font-bold text-slate-800">{item.title}</div><div className="text-xs text-slate-400">{item.contractNumber}</div></td><td className="px-4 py-3 text-sm">{typeLabels[item.contractType]}<div className="text-xs text-slate-400">{item.locationName}</div></td><td className="px-4 py-3 text-sm">{item.vendorName}</td><td className="px-4 py-3 text-sm">{formatDate(item.endsAt)}</td><td className="px-4 py-3 text-sm">{formatDate(item.nextPaymentDate)}</td><td className="px-4 py-3 text-sm font-bold">{amountLabel(item.paymentAmount)} <span className="font-normal text-slate-400">/ {typeLabels[item.paymentCycle] || item.paymentCycle}</span></td><td className="px-4 py-3">{statusBadge(item.status)}</td></tr>)}</tbody></table></div>;
    }
    const rows = safetyRecords.filter((item) => visible(`${item.title} ${item.locationName} ${item.assetName || ''} ${item.checklistName || ''} ${item.observations || ''}`));
    return <div className="divide-y divide-slate-100">{rows.map((item) => <article key={item.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(140px,.7fr)_minmax(130px,.7fr)_minmax(140px,.8fr)_auto] lg:items-center"><div><div className="flex flex-wrap items-center gap-2">{statusBadge(item.result)}<span className="text-xs text-slate-500">{typeLabels[item.recordType]}{item.riskLevel ? ` · خطورة ${typeLabels[item.riskLevel] || item.riskLevel}` : ''}</span></div><h3 className="mt-1 font-bold text-slate-800">{item.title}</h3><p className="mt-1 text-xs text-slate-500">{item.locationName}{item.assetName ? ` · ${item.assetName}` : ''}{item.checklistName ? ` · ${item.checklistName}` : ''}</p>{item.observations && <p className="mt-1 text-sm text-slate-600">{item.observations}</p>}</div><div className="text-sm"><div className="text-xs text-slate-400">الإجراء التصحيحي</div><div>{item.correctiveAction || 'لا يوجد'}</div></div><div className="text-sm"><div className="text-xs text-slate-400">موعد المتابعة</div><div>{formatDate(item.dueDate)}</div></div><div className="text-sm"><div className="text-xs text-slate-400">مسجل بواسطة</div><div>{item.recorderName}</div></div>{canManage && item.result !== 'CLOSED' && <button onClick={() => { service.closeSafetyRecord(item.id); load(); }} className="inline-flex items-center gap-1 rounded border border-emerald-200 px-2.5 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50"><Check size={14} /> إغلاق</button>}</article>)}</div>;
  };

  const activeTabInfo = tabs.find((tab) => tab.key === activeTab)!;
  return (
    <main className="mx-auto max-w-[1500px] space-y-5 p-4 pb-10 md:p-6" dir="rtl">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="mb-1 flex items-center gap-2 text-sm font-bold text-teal-700"><Building2 size={17} /> إدارة المنشأة</div>
          <h1 className="text-2xl font-black text-slate-900">المرافق والأصول التشغيلية</h1>
          <p className="mt-1 text-sm text-slate-500">المواقع، الصيانة، الالتزامات، وسجلات السلامة في مساحة تشغيلية موحدة.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} title="تحديث" className="inline-flex h-10 w-10 items-center justify-center rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"><RefreshCw size={17} /></button>
          {canManage && <button onClick={() => openForm(activeTab)} className="inline-flex h-10 items-center gap-2 rounded bg-teal-700 px-4 text-sm font-bold text-white hover:bg-teal-800"><Plus size={17} /> إضافة {activeTab === 'locations' ? 'موقع' : activeTab === 'assets' ? 'أصل' : activeTab === 'maintenance' ? 'طلب صيانة' : activeTab === 'contracts' ? 'عقد' : 'سجل سلامة'}</button>}
        </div>
      </header>

      {notice && <div className="flex items-center justify-between border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="إغلاق" className="p-1"><X size={15} /></button></div>}
      {error && !modalOpen && <div role="alert" className="flex items-center gap-2 border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"><AlertTriangle size={17} />{error}</div>}

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Summary icon={MapPin} label="المواقع النشطة" value={formatNumber(locations.length)} accent="teal" />
        <Summary icon={Wrench} label="أوامر عمل مفتوحة" value={formatNumber(openCount)} sub={`${formatNumber(maintenanceSchedules.filter((item) => item.nextDueDate <= new Date().toISOString().slice(0, 10)).length)} صيانة وقائية مستحقة`} accent="amber" />
        <Summary icon={CalendarClock} label="عقود تحتاج متابعة" value={formatNumber(overdueContracts)} sub={`${contracts.filter((item) => item.nextPaymentDate && item.nextPaymentDate <= new Date().toISOString().slice(0, 10)).length} دفعة مستحقة`} accent="blue" />
        <Summary icon={AlertTriangle} label="ملاحظات سلامة مفتوحة" value={formatNumber(dueSafety)} sub={`تكلفة الصيانة المسجلة ${amountLabel(maintenanceSpend)}`} accent="rose" />
      </section>

      {activeTab === 'maintenance' && maintenanceSchedules.length > 0 && <section className="border border-teal-200 bg-teal-50/50 p-4">
        <div className="mb-3 flex items-center justify-between"><h2 className="font-bold text-slate-800">جداول الصيانة الوقائية</h2><span className="text-xs text-slate-500">{formatNumber(maintenanceSchedules.length)} جدول</span></div>
        <div className="grid gap-2 md:grid-cols-2">{maintenanceSchedules.map((schedule) => <article key={schedule.id} className="flex flex-wrap items-center justify-between gap-3 border border-teal-100 bg-white p-3"><div><div className="font-bold text-slate-800">{schedule.title}</div><div className="mt-1 text-xs text-slate-500">{schedule.locationName}{schedule.assetName ? ` · ${schedule.assetName}` : ''} · كل {formatNumber(schedule.intervalDays)} يوم · التالي {formatDate(schedule.nextDueDate)}</div></div>{canManage && schedule.nextDueDate <= new Date().toISOString().slice(0, 10) && <button onClick={() => { try { service.createDueScheduleWorkOrder(schedule.id); setNotice('تم إنشاء أمر الصيانة الوقائية المستحق.'); load(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر إنشاء أمر الصيانة.'); } }} className="border border-teal-700 px-3 py-1.5 text-xs font-bold text-teal-800 hover:bg-teal-50">إنشاء أمر مستحق</button>}</article>)}</div>
      </section>}

      {activeTab === 'maintenance' && workOrders.some((item) => item.expenseId || item.inventoryTransactionId) && <section className="border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-bold text-slate-800">روابط المصروف والمخزون</h2>
        <div className="grid gap-2 md:grid-cols-2">{workOrders.filter((item) => (item.expenseId || item.inventoryTransactionId) && visible(`${item.title} ${item.workOrderNumber}`)).map((item) => <article key={item.id} className="border border-slate-100 p-3"><div className="font-bold text-slate-800">{item.workOrderNumber} · {item.title}</div><div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-teal-800">{item.expenseId && <span>مصروف: {item.expenseDescription || item.expenseId}</span>}{item.inventoryTransactionId && <span>حركة صرف: {item.stockTransactionNumber || item.inventoryTransactionId}</span>}</div></article>)}</div>
      </section>}

      <section className="overflow-hidden border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 pt-3 md:flex-row md:items-center md:justify-between">
          <nav className="flex gap-1 overflow-x-auto" aria-label="أقسام إدارة المنشأة">{tabs.map(({ key, label, icon: Icon }) => <button key={key} onClick={() => { setActiveTab(key); setSearch(''); }} className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-bold transition ${activeTab === key ? 'border-teal-700 text-teal-800' : 'border-transparent text-slate-500 hover:text-slate-800'}`}><Icon size={16} />{label}</button>)}</nav>
          <label className="mb-2 flex h-9 min-w-[220px] items-center gap-2 border border-slate-200 px-3 text-slate-400 md:mb-0"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="بحث في السجلات" className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400" /></label>
        </div>
        {loading ? <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><RefreshCw className="animate-spin" size={17} /> جارٍ تحميل البيانات</div>
          : (activeTab === 'locations' && !locations.length || activeTab === 'assets' && !assets.length || activeTab === 'maintenance' && !workOrders.length || activeTab === 'contracts' && !contracts.length || activeTab === 'safety' && !safetyRecords.length)
            ? <div className="py-16 text-center"><div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center bg-slate-100 text-slate-500"><activeTabInfo.icon size={22} /></div><h2 className="font-bold text-slate-800">لا توجد سجلات في هذا القسم</h2><p className="mt-1 text-sm text-slate-500">ابدأ بإضافة أول سجل ليظهر هنا.</p>{canManage && <button onClick={() => openForm(activeTab)} className="mt-4 inline-flex items-center gap-2 border border-teal-700 px-3 py-2 text-sm font-bold text-teal-800 hover:bg-teal-50"><Plus size={16} /> إضافة سجل</button>}</div>
            : renderBody()}
      </section>

      {modalOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-3" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby="facility-form-title" className="max-h-[92vh] w-full max-w-3xl overflow-y-auto border border-slate-200 bg-white shadow-2xl"><div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4"><div><p className="text-xs font-bold text-teal-700">{activeTabInfo.label}</p><h2 id="facility-form-title" className="mt-1 text-lg font-black text-slate-900">إضافة سجل جديد</h2></div><button onClick={() => setModalOpen(false)} aria-label="إغلاق" className="flex h-9 w-9 items-center justify-center border border-slate-200 text-slate-500 hover:bg-slate-50"><X size={18} /></button></div><form onSubmit={submit} className="p-5"><div className="grid gap-4 sm:grid-cols-2">{fields[activeTab].map((field) => <label key={field.key} className={`block ${field.type === 'textarea' ? 'sm:col-span-2' : ''}`}><span className="mb-1.5 block text-sm font-bold text-slate-700">{field.label}{field.required && <span className="mr-1 text-rose-600">*</span>}</span>{field.type === 'select' ? <select required={field.required} value={form[field.key] || ''} onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))} className="h-10 w-full border border-slate-300 bg-white px-3 text-sm outline-none focus:border-teal-700"><option value="">اختر...</option>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : field.type === 'textarea' ? <textarea value={form[field.key] || ''} onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))} rows={3} className="w-full border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-700" /> : <input required={field.required} type={field.type || 'text'} min={field.type === 'number' ? 0 : undefined} step={field.type === 'number' ? '0.01' : undefined} value={form[field.key] || ''} placeholder={field.placeholder} onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))} className="h-10 w-full border border-slate-300 px-3 text-sm outline-none focus:border-teal-700" />}</label>)}</div>{error && <p role="alert" className="mt-4 border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}<div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setModalOpen(false)} className="h-10 border border-slate-300 px-4 text-sm font-bold text-slate-600 hover:bg-slate-50">إلغاء</button><button disabled={saving} className="inline-flex h-10 items-center gap-2 bg-teal-700 px-5 text-sm font-bold text-white hover:bg-teal-800 disabled:opacity-60">{saving ? <RefreshCw className="animate-spin" size={16} /> : <Check size={16} />} حفظ السجل</button></div></form></section></div>}
    </main>
  );
};

function Summary({ icon: Icon, label, value, sub, accent }: { icon: React.ElementType; label: string; value: string; sub?: string; accent: 'teal' | 'amber' | 'blue' | 'rose' }) {
  const tones = { teal: 'text-teal-700 bg-teal-50', amber: 'text-amber-700 bg-amber-50', blue: 'text-blue-700 bg-blue-50', rose: 'text-rose-700 bg-rose-50' };
  return <article className="flex min-h-[104px] items-start gap-3 border border-slate-200 bg-white p-4"><div className={`flex h-10 w-10 shrink-0 items-center justify-center ${tones[accent]}`}><Icon size={19} /></div><div className="min-w-0"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-1 text-2xl font-black text-slate-900">{value}</p>{sub && <p className="mt-1 truncate text-xs text-slate-500">{sub}</p>}</div></article>;
}
