import React, { useCallback, useEffect, useState } from 'react';
import { Building2, GitBranch, Briefcase, Wallet, MoveRight, Activity, RefreshCw } from 'lucide-react';
import { EmployeeOrganizationService, EmployeeDepartment, EmployeeJobTitle, EmployeeJobGrade, EmployeeCostCenter, EmployeeTransfer, EmployeeLifecycleEvent, DepartmentNode } from '../../../services/domains/hr/EmployeeOrganizationService';
import { fmt } from '../../operations/payroll/payrollDisplay';

type Tab = 'structure' | 'departments' | 'titles' | 'costCenters' | 'transfers' | 'lifecycle' | 'onboarding' | 'custody' | 'probation';

const service = new EmployeeOrganizationService();

export const HrOrganizationPage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('structure');
  const [departments, setDepartments] = useState<EmployeeDepartment[]>([]);
  const [jobTitles, setJobTitles] = useState<EmployeeJobTitle[]>([]);
  const [jobGrades, setJobGrades] = useState<EmployeeJobGrade[]>([]);
  const [costCenters, setCostCenters] = useState<EmployeeCostCenter[]>([]);
  const [transfers, setTransfers] = useState<EmployeeTransfer[]>([]);
  const [lifecycleEmployeeId, setLifecycleEmployeeId] = useState('');
  const [lifecycleEvents, setLifecycleEvents] = useState<EmployeeLifecycleEvent[]>([]);
  const [orgTree, setOrgTree] = useState<DepartmentNode[]>([]);
  const [vacancies, setVacancies] = useState<Array<{ departmentId: string; departmentName: string; required: number; actual: number; vacant: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [departmentForm, setDepartmentForm] = useState({ name: '', description: '', parentId: '', managerEmployeeId: '', requiredHeadcount: '0' });
  const [gradeForm, setGradeForm] = useState({ name: '', level: '1', minSalary: '0', maxSalary: '0', description: '' });
  const [costCenterForm, setCostCenterForm] = useState({ code: '', name: '' });
  const [transferForm, setTransferForm] = useState({ employeeId: '', toDepartmentId: '', toJobTitle: '', transferDate: new Date().toISOString().slice(0, 10), reason: '' });
  const [lifecycleForm, setLifecycleForm] = useState({ eventType: 'PROMOTION', eventDate: new Date().toISOString().slice(0, 10), fromValue: '', toValue: '', notes: '' });

  const [procedureEmployeeId, setProcedureEmployeeId] = useState('');
  const [onboardingTasks, setOnboardingTasks] = useState<any[]>([]);
  const [custodyItems, setCustodyItems] = useState<any[]>([]);
  const [probationReviews, setProbationReviews] = useState<any[]>([]);
  const [custodyForm, setCustodyForm] = useState({ itemName: '', itemType: 'EQUIPMENT', serialNumber: '', notes: '' });
  const [probationForm, setProbationForm] = useState({ reviewDate: new Date().toISOString().slice(0, 10), score: '0', rating: 'SATISFACTORY', recommendation: 'CONTINUE', notes: '' });

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    try {
      setDepartments(service.getDepartments());
      setJobTitles(service.getJobTitles());
      setJobGrades(service.getJobGrades());
      setCostCenters(service.getCostCenters());
      setTransfers(service.getTransfers());
      setOrgTree(service.getOrgTree());
      setVacancies(service.getVacancies());
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل بيانات الهيكل التنظيمي.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createDepartment = () => {
    try {
      const created = service.createDepartment({ name: departmentForm.name, description: departmentForm.description });
      if (departmentForm.parentId || departmentForm.managerEmployeeId || Number(departmentForm.requiredHeadcount) > 0) {
        service.updateDepartmentStructure(created.id, {
          parentId: departmentForm.parentId || null,
          managerEmployeeId: departmentForm.managerEmployeeId || null,
          requiredHeadcount: Number(departmentForm.requiredHeadcount) || 0,
        });
      }
      setDepartmentForm({ name: '', description: '', parentId: '', managerEmployeeId: '', requiredHeadcount: '0' });
      load();
    } catch (e: any) { setError(e?.message || 'تعذر إضافة القسم.'); }
  };

  const createGrade = () => {
    try {
      service.createJobGrade({
        name: gradeForm.name,
        level: Number(gradeForm.level) || 1,
        minSalary: Number(gradeForm.minSalary) || 0,
        maxSalary: Number(gradeForm.maxSalary) || 0,
        description: gradeForm.description,
      });
      setGradeForm({ name: '', level: '1', minSalary: '0', maxSalary: '0', description: '' });
      load();
    } catch (e: any) { setError(e?.message || 'تعذر إضافة الدرجة.'); }
  };

  const createCostCenter = () => {
    try {
      service.createCostCenter({ code: costCenterForm.code, name: costCenterForm.name });
      setCostCenterForm({ code: '', name: '' });
      load();
    } catch (e: any) { setError(e?.message || 'تعذر إضافة مركز التكلفة.'); }
  };

  const createTransfer = () => {
    try {
      service.transferEmployee({
        employeeId: transferForm.employeeId,
        toDepartmentId: transferForm.toDepartmentId || null,
        toJobTitle: transferForm.toJobTitle || null,
        transferDate: transferForm.transferDate,
        reason: transferForm.reason,
      });
      setTransferForm({ employeeId: '', toDepartmentId: '', toJobTitle: '', transferDate: new Date().toISOString().slice(0, 10), reason: '' });
      load();
    } catch (e: any) { setError(e?.message || 'تعذر تنفيذ النقل.'); }
  };

  const loadLifecycle = () => {
    if (!lifecycleEmployeeId.trim()) return;
    try {
      setLifecycleEvents(service.getLifecycleEvents(lifecycleEmployeeId.trim()));
      setError(null);
    } catch (e: any) { setError(e?.message || 'تعذر تحميل أحداث دورة الحياة.'); }
  };

  const addLifecycle = () => {
    if (!lifecycleEmployeeId.trim()) return;
    try {
      service.addLifecycleEvent({
        employeeId: lifecycleEmployeeId.trim(),
        eventType: lifecycleForm.eventType,
        eventDate: lifecycleForm.eventDate,
        fromValue: lifecycleForm.fromValue,
        toValue: lifecycleForm.toValue,
        notes: lifecycleForm.notes,
      });
      setLifecycleForm({ eventType: 'PROMOTION', eventDate: new Date().toISOString().slice(0, 10), fromValue: '', toValue: '', notes: '' });
      loadLifecycle();
    } catch (e: any) { setError(e?.message || 'تعذر إضافة الحدث.'); }
  };

  const loadProcedures = () => {
    if (!procedureEmployeeId.trim()) return;
    try {
      setOnboardingTasks(service.getOnboardingTasks(procedureEmployeeId.trim()));
      setCustodyItems(service.getCustodyItems(procedureEmployeeId.trim()));
      setProbationReviews(service.getProbationReviews(procedureEmployeeId.trim()));
      setError(null);
    } catch (e: any) { setError(e?.message || 'تعذر تحميل الإجراءات.'); }
  };

  const createOnboarding = () => {
    if (!procedureEmployeeId.trim()) return;
    try {
      service.createOnboardingChecklist(procedureEmployeeId.trim());
      loadProcedures();
    } catch (e: any) { setError(e?.message || 'تعذر إنشاء قائمة التأهيل.'); }
  };

  const addCustody = () => {
    if (!procedureEmployeeId.trim() || !custodyForm.itemName.trim()) return;
    try {
      service.assignCustodyItem({
        employeeId: procedureEmployeeId.trim(),
        itemName: custodyForm.itemName,
        itemType: custodyForm.itemType,
        serialNumber: custodyForm.serialNumber,
        notes: custodyForm.notes,
      });
      setCustodyForm({ itemName: '', itemType: 'EQUIPMENT', serialNumber: '', notes: '' });
      loadProcedures();
    } catch (e: any) { setError(e?.message || 'تعذر إسناد العهدة.'); }
  };

  const addProbation = () => {
    if (!procedureEmployeeId.trim()) return;
    try {
      service.createProbationReview({
        employeeId: procedureEmployeeId.trim(),
        reviewDate: probationForm.reviewDate,
        score: Number(probationForm.score) || 0,
        rating: probationForm.rating,
        recommendation: probationForm.recommendation,
        notes: probationForm.notes,
      });
      setProbationForm({ reviewDate: new Date().toISOString().slice(0, 10), score: '0', rating: 'SATISFACTORY', recommendation: 'CONTINUE', notes: '' });
      loadProcedures();
    } catch (e: any) { setError(e?.message || 'تعذر إضافة التقييم.'); }
  };

  const requestOffboarding = () => {
    if (!procedureEmployeeId.trim()) return;
    try {
      service.requestOffboardingApproval({ employeeId: procedureEmployeeId.trim(), reason: 'طلب إخلاء طرف' });
      setError(null);
      alert('تم إنشاء طلب اعتماد إخلاء الطرف.');
    } catch (e: any) { setError(e?.message || 'تعذر إنشاء طلب الاعتماد.'); }
  };

  const renderTree = (nodes: DepartmentNode[], level = 0): React.ReactNode => (
    <div className={level ? 'mr-6 border-r border-slate-200 pr-4' : ''}>
      {nodes.map((node) => (
        <div key={node.id} className="mb-3">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="font-bold text-slate-800">{node.name}</div>
                <div className="text-[10px] text-slate-500">
                  المدير: {node.managerName || '—'} • المطلوب: {node.requiredHeadcount} • الفعلي: {node.actualHeadcount}
                  {node.requiredHeadcount > 0 && node.actualHeadcount < node.requiredHeadcount && (
                    <span className="mr-2 font-bold text-rose-600">شاغر: {node.requiredHeadcount - node.actualHeadcount}</span>
                  )}
                </div>
              </div>
              <GitBranch className="h-4 w-4 text-slate-400" />
            </div>
          </div>
          {node.children.length > 0 && renderTree(node.children, level + 1)}
        </div>
      ))}
    </div>
  );

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'structure', label: 'الهيكل والشواغر', icon: <GitBranch className="h-4 w-4" /> },
    { id: 'departments', label: 'الأقسام', icon: <Building2 className="h-4 w-4" /> },
    { id: 'titles', label: 'المسميات والدرجات', icon: <Briefcase className="h-4 w-4" /> },
    { id: 'costCenters', label: 'مراكز التكلفة', icon: <Wallet className="h-4 w-4" /> },
    { id: 'transfers', label: 'الانتقالات', icon: <MoveRight className="h-4 w-4" /> },
    { id: 'lifecycle', label: 'دورة الحياة', icon: <Activity className="h-4 w-4" /> },
    { id: 'onboarding', label: 'التأهيل والتسليم', icon: <Building2 className="h-4 w-4" /> },
    { id: 'custody', label: 'العهد', icon: <Wallet className="h-4 w-4" /> },
    { id: 'probation', label: 'تقييم الاختبار', icon: <Activity className="h-4 w-4" /> },
  ];

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center">
          <Building2 className="w-5 h-5 text-teal-600" />
        </div>
        <div>
          <h1 className="text-base font-black">الهيكل التنظيمي ودورة حياة الموظف</h1>
          <p className="text-xs text-slate-500 font-medium">أقسام، درجات، مراكز تكلفة، انتقالات وأحداث دورة الحياة</p>
        </div>
        <button onClick={load} className="mr-auto flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
          <RefreshCw className="h-3.5 w-3.5" /> تحديث
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-4">
        {error && <div className="px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{error}</div>}
        <div className="flex flex-wrap gap-2">
          {tabs.map((item) => (
            <button key={item.id} onClick={() => setTab(item.id)} className={`flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold ${tab === item.id ? 'bg-teal-600 text-white' : 'border border-slate-200 bg-white text-slate-700'}`}>
              {item.icon} {item.label}
            </button>
          ))}
        </div>

        {loading ? <div className="py-16 flex justify-center"><RefreshCw className="w-6 h-6 animate-spin text-teal-500" /></div> : (
          <>
            {tab === 'structure' && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <h3 className="text-sm font-black mb-3">الهيكل التنظيمي</h3>
                  {orgTree.length ? renderTree(orgTree) : <div className="text-xs text-slate-400">لا توجد أقسام.</div>}
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <h3 className="text-sm font-black mb-3">الشواغر (المطلوب vs الفعلي)</h3>
                  <div className="space-y-2">
                    {vacancies.map((row) => (
                      <div key={row.departmentId} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-xs">
                        <span className="font-bold">{row.departmentName}</span>
                        <span>مطلوب {row.required} • فعلي {row.actual} • <b className={row.vacant > 0 ? 'text-rose-600' : 'text-emerald-600'}>{row.vacant > 0 ? `شاغر ${row.vacant}` : 'مكتمل'}</b></span>
                      </div>
                    ))}
                    {!vacancies.length && <div className="text-xs text-slate-400">لا توجد بيانات.</div>}
                  </div>
                </div>
              </div>
            )}

            {tab === 'departments' && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                  <h3 className="text-sm font-black">الأقسام</h3>
                  {departments.map((dept) => (
                    <div key={dept.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-xs">
                      <span className="font-bold">{dept.name}</span>
                      <button onClick={() => { try { service.deactivateDepartment(dept.id); load(); } catch (e: any) { setError(e?.message); } }} className="text-rose-600 font-bold">تعطيل</button>
                    </div>
                  ))}
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                  <h3 className="text-sm font-black">إضافة قسم</h3>
                  <input value={departmentForm.name} onChange={(e) => setDepartmentForm((p) => ({ ...p, name: e.target.value }))} placeholder="اسم القسم" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <textarea value={departmentForm.description} onChange={(e) => setDepartmentForm((p) => ({ ...p, description: e.target.value }))} placeholder="الوصف" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" rows={2} />
                  <select value={departmentForm.parentId} onChange={(e) => setDepartmentForm((p) => ({ ...p, parentId: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <option value="">بدون قسم أب</option>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  <input value={departmentForm.managerEmployeeId} onChange={(e) => setDepartmentForm((p) => ({ ...p, managerEmployeeId: e.target.value }))} placeholder="معرف مدير القسم (employee id)" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input type="number" value={departmentForm.requiredHeadcount} onChange={(e) => setDepartmentForm((p) => ({ ...p, requiredHeadcount: e.target.value }))} placeholder="العدد المطلوب" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <button onClick={createDepartment} className="w-full rounded-lg bg-teal-600 px-4 py-2.5 text-xs font-bold text-white">إضافة</button>
                </div>
              </div>
            )}

            {tab === 'titles' && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                  <h3 className="text-sm font-black">المسميات الوظيفية</h3>
                  {jobTitles.map((title) => (
                    <div key={title.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-xs">
                      <span className="font-bold">{title.title}</span>
                      <button onClick={() => { try { service.deactivateJobTitle(title.id); load(); } catch (e: any) { setError(e?.message); } }} className="text-rose-600 font-bold">تعطيل</button>
                    </div>
                  ))}
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                  <h3 className="text-sm font-black">الدرجات الوظيفية</h3>
                  {jobGrades.map((grade) => (
                    <div key={grade.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-xs">
                      <span className="font-bold">{grade.name} (مستوى {grade.level})</span>
                      <span>{fmt(grade.minSalary)} - {fmt(grade.maxSalary)}</span>
                    </div>
                  ))}
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <input value={gradeForm.name} onChange={(e) => setGradeForm((p) => ({ ...p, name: e.target.value }))} placeholder="اسم الدرجة" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    <input type="number" value={gradeForm.level} onChange={(e) => setGradeForm((p) => ({ ...p, level: e.target.value }))} placeholder="المستوى" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    <input type="number" value={gradeForm.minSalary} onChange={(e) => setGradeForm((p) => ({ ...p, minSalary: e.target.value }))} placeholder="الحد الأدنى" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    <input type="number" value={gradeForm.maxSalary} onChange={(e) => setGradeForm((p) => ({ ...p, maxSalary: e.target.value }))} placeholder="الحد الأعلى" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    <input value={gradeForm.description} onChange={(e) => setGradeForm((p) => ({ ...p, description: e.target.value }))} placeholder="الوصف" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    <button onClick={createGrade} className="w-full rounded-lg bg-teal-600 px-4 py-2.5 text-xs font-bold text-white">إضافة درجة</button>
                  </div>
                </div>
              </div>
            )}

            {tab === 'costCenters' && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                  <h3 className="text-sm font-black">مراكز التكلفة</h3>
                  {costCenters.map((cc) => (
                    <div key={cc.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-xs">
                      <span className="font-bold">{cc.code} - {cc.name}</span>
                      <button onClick={() => { try { service.deactivateCostCenter(cc.id); load(); } catch (e: any) { setError(e?.message); } }} className="text-rose-600 font-bold">تعطيل</button>
                    </div>
                  ))}
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                  <h3 className="text-sm font-black">إضافة مركز تكلفة</h3>
                  <input value={costCenterForm.code} onChange={(e) => setCostCenterForm((p) => ({ ...p, code: e.target.value }))} placeholder="الرمز" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input value={costCenterForm.name} onChange={(e) => setCostCenterForm((p) => ({ ...p, name: e.target.value }))} placeholder="الاسم" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <button onClick={createCostCenter} className="w-full rounded-lg bg-teal-600 px-4 py-2.5 text-xs font-bold text-white">إضافة</button>
                </div>
              </div>
            )}

            {tab === 'transfers' && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                  <h3 className="text-sm font-black">الانتقالات</h3>
                  {transfers.map((tr) => (
                    <div key={tr.id} className="rounded-lg border border-slate-100 px-3 py-2 text-xs">
                      <div className="font-bold">{tr.employeeId}</div>
                      <div className="text-slate-500">{tr.transferDate} • {tr.fromDepartmentId || '—'} → {tr.toDepartmentId || '—'}</div>
                    </div>
                  ))}
                  {!transfers.length && <div className="text-xs text-slate-400">لا توجد انتقالات.</div>}
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                  <h3 className="text-sm font-black">نقل موظف</h3>
                  <input value={transferForm.employeeId} onChange={(e) => setTransferForm((p) => ({ ...p, employeeId: e.target.value }))} placeholder="معرف الموظف" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <select value={transferForm.toDepartmentId} onChange={(e) => setTransferForm((p) => ({ ...p, toDepartmentId: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <option value="">القسم (اختياري)</option>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  <input value={transferForm.toJobTitle} onChange={(e) => setTransferForm((p) => ({ ...p, toJobTitle: e.target.value }))} placeholder="المسمى الجديد (اختياري)" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input type="date" value={transferForm.transferDate} onChange={(e) => setTransferForm((p) => ({ ...p, transferDate: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <textarea value={transferForm.reason} onChange={(e) => setTransferForm((p) => ({ ...p, reason: e.target.value }))} placeholder="السبب" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" rows={2} />
                  <button onClick={createTransfer} className="w-full rounded-lg bg-teal-600 px-4 py-2.5 text-xs font-bold text-white">تنفيذ النقل</button>
                </div>
              </div>
            )}

            {tab === 'lifecycle' && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                  <h3 className="text-sm font-black">أحداث دورة الحياة</h3>
                  <div className="flex gap-2">
                    <input value={lifecycleEmployeeId} onChange={(e) => setLifecycleEmployeeId(e.target.value)} placeholder="معرف الموظف" className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    <button onClick={loadLifecycle} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white">تحميل</button>
                  </div>
                  {lifecycleEvents.map((ev) => (
                    <div key={ev.id} className="rounded-lg border border-slate-100 px-3 py-2 text-xs">
                      <div className="font-bold">{ev.eventType} • {ev.eventDate}</div>
                      <div className="text-slate-500">{ev.fromValue || '—'} → {ev.toValue || '—'}</div>
                      {ev.notes && <div className="text-slate-400">{ev.notes}</div>}
                    </div>
                  ))}
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                  <h3 className="text-sm font-black">إضافة حدث</h3>
                  <select value={lifecycleForm.eventType} onChange={(e) => setLifecycleForm((p) => ({ ...p, eventType: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    {['HIRE', 'ONBOARDING', 'PROBATION_REVIEW', 'PROMOTION', 'TRANSFER', 'SALARY_CHANGE', 'TERMINATION', 'OFFBOARDING', 'FINAL_SETTLEMENT'].map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                  <input type="date" value={lifecycleForm.eventDate} onChange={(e) => setLifecycleForm((p) => ({ ...p, eventDate: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input value={lifecycleForm.fromValue} onChange={(e) => setLifecycleForm((p) => ({ ...p, fromValue: e.target.value }))} placeholder="من (اختياري)" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input value={lifecycleForm.toValue} onChange={(e) => setLifecycleForm((p) => ({ ...p, toValue: e.target.value }))} placeholder="إلى (اختياري)" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <textarea value={lifecycleForm.notes} onChange={(e) => setLifecycleForm((p) => ({ ...p, notes: e.target.value }))} placeholder="ملاحظات" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" rows={2} />
                  <button onClick={addLifecycle} className="w-full rounded-lg bg-teal-600 px-4 py-2.5 text-xs font-bold text-white">إضافة حدث</button>
                </div>
              </div>
            
            )}
{tab === 'onboarding' && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                  <h3 className="text-sm font-black">التأهيل (Onboarding)</h3>
                  <div className="flex gap-2">
                    <input value={procedureEmployeeId} onChange={(e) => setProcedureEmployeeId(e.target.value)} placeholder="معرف الموظف" className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    <button onClick={loadProcedures} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white">تحميل</button>
                    <button onClick={createOnboarding} className="rounded-lg bg-teal-600 px-3 py-2 text-xs font-bold text-white">إنشاء قائمة</button>
                  </div>
                  {onboardingTasks.map((task) => (
                    <div key={task.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-xs">
                      <span className={task.status === 'COMPLETED' ? 'line-through text-slate-400' : 'font-bold'}>{task.taskName}</span>
                      {task.status !== 'COMPLETED' && (
                        <button onClick={() => { try { service.completeOnboardingTask(task.id); loadProcedures(); } catch (e: any) { setError(e?.message); } }} className="text-emerald-600 font-bold">إكمال</button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                  <h3 className="text-sm font-black">إخلاء طرف (Offboarding)</h3>
                  <p className="text-xs text-slate-500">إنشاء طلب اعتماد إخلاء طرف (يتطلب موافقة).</p>
                  <button onClick={requestOffboarding} className="w-full rounded-lg bg-rose-600 px-4 py-2.5 text-xs font-bold text-white">طلب إخلاء طرف</button>
                  <button onClick={() => { if (procedureEmployeeId.trim()) { try { service.finalizeOffboarding(procedureEmployeeId.trim(), new Date().toISOString().slice(0, 10), 'إنهاء خدمة'); loadProcedures(); } catch (e: any) { setError(e?.message); } } }} className="w-full rounded-lg border border-rose-200 px-4 py-2.5 text-xs font-bold text-rose-600"> finalize (إنهاء خدمة)</button>
                </div>
              </div>
            )}

            {tab === 'custody' && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                  <h3 className="text-sm font-black">العهد</h3>
                  <div className="flex gap-2">
                    <input value={procedureEmployeeId} onChange={(e) => setProcedureEmployeeId(e.target.value)} placeholder="معرف الموظف" className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    <button onClick={loadProcedures} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white">تحميل</button>
                  </div>
                  {custodyItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-xs">
                      <span className="font-bold">{item.itemName} ({item.status})</span>
                      {item.status === 'ASSIGNED' && (
                        <button onClick={() => { try { service.returnCustodyItem(item.id, 'RETURNED'); loadProcedures(); } catch (e: any) { setError(e?.message); } }} className="text-emerald-600 font-bold">إرجاع</button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                  <h3 className="text-sm font-black">إسناد عهدة</h3>
                  <input value={custodyForm.itemName} onChange={(e) => setCustodyForm((p) => ({ ...p, itemName: e.target.value }))} placeholder="اسم العنصر" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input value={custodyForm.itemType} onChange={(e) => setCustodyForm((p) => ({ ...p, itemType: e.target.value }))} placeholder="النوع" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input value={custodyForm.serialNumber} onChange={(e) => setCustodyForm((p) => ({ ...p, serialNumber: e.target.value }))} placeholder="الرقم التسلسلي" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <textarea value={custodyForm.notes} onChange={(e) => setCustodyForm((p) => ({ ...p, notes: e.target.value }))} placeholder="ملاحظات" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" rows={2} />
                  <button onClick={addCustody} className="w-full rounded-lg bg-teal-600 px-4 py-2.5 text-xs font-bold text-white">إسناد</button>
                </div>
              </div>
            )}

            {tab === 'probation' && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                  <h3 className="text-sm font-black">تقييم فترة الاختبار</h3>
                  <div className="flex gap-2">
                    <input value={procedureEmployeeId} onChange={(e) => setProcedureEmployeeId(e.target.value)} placeholder="معرف الموظف" className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    <button onClick={loadProcedures} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white">تحميل</button>
                  </div>
                  {probationReviews.map((review) => (
                    <div key={review.id} className="rounded-lg border border-slate-100 px-3 py-2 text-xs">
                      <div className="font-bold">{review.reviewDate} • {review.rating} • {review.score}</div>
                      <div className="text-slate-500">{review.recommendation}</div>
                    </div>
                  ))}
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                  <h3 className="text-sm font-black">إضافة تقييم</h3>
                  <input type="date" value={probationForm.reviewDate} onChange={(e) => setProbationForm((p) => ({ ...p, reviewDate: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input type="number" value={probationForm.score} onChange={(e) => setProbationForm((p) => ({ ...p, score: e.target.value }))} placeholder="الدرجة" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <select value={probationForm.rating} onChange={(e) => setProbationForm((p) => ({ ...p, rating: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    {['EXCELLENT', 'GOOD', 'SATISFACTORY', 'NEEDS_IMPROVEMENT', 'UNSATISFACTORY'].map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <select value={probationForm.recommendation} onChange={(e) => setProbationForm((p) => ({ ...p, recommendation: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    {['CONTINUE', 'EXTEND_PROBATION', 'CONFIRM', 'TERMINATE'].map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <textarea value={probationForm.notes} onChange={(e) => setProbationForm((p) => ({ ...p, notes: e.target.value }))} placeholder="ملاحظات" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" rows={2} />
                  <button onClick={addProbation} className="w-full rounded-lg bg-teal-600 px-4 py-2.5 text-xs font-bold text-white">إضافة تقييم</button>
                </div>
              </div>
            )}

          </>
        )}
      </div>
    </div>
  );
};
