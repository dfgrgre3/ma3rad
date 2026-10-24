import React, { useState, useEffect } from 'react';
import { EmployeeService } from '../../services/EmployeeService';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import { localDateString } from '../../utils/date';
import {
  HardHat, Plus, Search, Mail, Phone, Calendar, Landmark,
  TrendingUp, TrendingDown, DollarSign, UserCheck, Clock,
  MapPin, AlertCircle, Trash2, Edit3, Filter, CheckCircle2,
  XCircle, FileText, BarChart3, ChevronLeft, ArrowLeftRight
} from 'lucide-react';

interface Employee {
  id: string;
  name: string;
  location: string; // e.g. مخزن الهرم, معرض بنها, إلخ
  role: string;
  phone: string;
  email: string;
  baseSalary: number;
  salaryType: 'MONTHLY' | 'DAILY';
  status: 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED';
  joinedDate: string;
}

interface FinancialTransaction {
  id: string;
  employeeId: string;
  type: 'ADVANCE' | 'BONUS' | 'DEDUCTION' | 'SALARY_PAYOUT'; // سلفة, مكافأة, خصم, صرف راتب
  amount: number;
  date: string;
  notes: string;
}

interface AttendanceRecord {
  date: string; // YYYY-MM-DD
  employeeId: string;
  status: 'PRESENT' | 'LATE' | 'ABSENT' | 'LEAVE';
  notes?: string;
}

const DEFAULT_LOCATIONS = [
  'معرض بنها',
  'المخزن الرئيسي',
  'مخزن الهرم',
  'معرض مدينة نصر',
  'فرع أكتوبر',
  'الإدارة العامة / الحسابات'
];

const STATUS_LABELS: Record<Employee['status'], { label: string; color: string }> = {
  ACTIVE: { label: 'على رأس العمل', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/25' },
  ON_LEAVE: { label: 'في إجازة رسمية', color: 'bg-amber-500/10 text-amber-600 border-amber-500/25' },
  SUSPENDED: { label: 'موقوف مؤقتاً', color: 'bg-rose-500/10 text-rose-600 border-rose-500/25' },
};

const TX_TYPES = {
  ADVANCE: { label: 'سُلفة', color: 'text-amber-600 bg-amber-500/10 border-amber-500/20' },
  BONUS: { label: 'مكافأة / حافز', color: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20' },
  DEDUCTION: { label: 'خصم جزائي', color: 'text-rose-600 bg-rose-500/10 border-rose-500/20' },
  SALARY_PAYOUT: { label: 'صرف راتب / دفعة لليد', color: 'text-sky-600 bg-sky-500/10 border-sky-500/20' },
};

export const EmployeesPage: React.FC = () => {
  const canManageEmployees = PermissionService.can(AuthService.getCurrentUser(), 'employees.manage');
  // --- Database State ---
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [payrollPayables, setPayrollPayables] = useState<{ employeeId: string | null; employeeName: string; balance: number }[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);

  const loadAll = () => {
    setLoading(true);
    try {
      setEmployees(EmployeeService.getAll() as unknown as Employee[]);
      setTransactions(canManageEmployees
        ? EmployeeService.getTransactions() as unknown as FinancialTransaction[]
        : []);
      setPayrollPayables(canManageEmployees ? EmployeeService.getPayrollPayables() : []);
      setAttendance(EmployeeService.getAllAttendance() as unknown as AttendanceRecord[]);
      setDbError(null);
    } catch (e: any) {
      setDbError(e?.message || 'تعذر تحميل بيانات الموظفين.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  // --- Active Tab ---
  const [activeTab, setActiveTab] = useState<'directory' | 'finance' | 'attendance' | 'analytics'>('directory');

  // --- Filtering & Search ---
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<string>('ALL');

  // --- Modal States ---
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [selectedEmpForTx, setSelectedEmpForTx] = useState<string>('');

  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedEmpForHistory, setSelectedEmpForHistory] = useState<string>('');

  // --- Forms Fields ---
  const [empForm, setEmpForm] = useState({
    name: '',
    location: DEFAULT_LOCATIONS[0],
    role: '',
    phone: '',
    email: '',
    baseSalary: 6000,
    salaryType: 'MONTHLY' as Employee['salaryType'],
    status: 'ACTIVE' as Employee['status'],
    joinedDate: localDateString()
  });

  const [txForm, setTxForm] = useState({
    type: 'ADVANCE' as FinancialTransaction['type'],
    amount: 100,
    date: localDateString(),
    notes: ''
  });

  // --- Attendance State ---
  const [attendanceDate, setAttendanceDate] = useState(localDateString());
  const [payrollPeriod, setPayrollPeriod] = useState(localDateString().slice(0, 7));

  // --- Calculations helper ---
  const getEmployeeFinancials = (empId: string) => {
    const emp = employees.find(e => e.id === empId);
    if (!emp) return { base: 0, advances: 0, bonuses: 0, deductions: 0, payouts: 0, netDue: 0 };

    const empTxs = transactions.filter(t => t.employeeId === empId);
    const advances = empTxs.filter(t => t.type === 'ADVANCE').reduce((sum, t) => sum + t.amount, 0);
    const bonuses = empTxs.filter(t => t.type === 'BONUS').reduce((sum, t) => sum + t.amount, 0);
    const deductions = empTxs.filter(t => t.type === 'DEDUCTION').reduce((sum, t) => sum + t.amount, 0);
    const payouts = empTxs.filter(t => t.type === 'SALARY_PAYOUT').reduce((sum, t) => sum + t.amount, 0);

    // netDue calculation: baseSalary + bonuses - (deductions + advances + payouts)
    const netDue = emp.baseSalary + bonuses - (deductions + advances + payouts);

    return {
      base: emp.baseSalary,
      advances,
      bonuses,
      deductions,
      payouts,
      netDue
    };
  };

  // --- Actions handlers ---
  const handleOpenAddEmployee = () => {
    setEditingEmployee(null);
    setEmpForm({
      name: '',
      location: DEFAULT_LOCATIONS[0],
      role: '',
      phone: '',
      email: '',
      baseSalary: 6000,
      salaryType: 'MONTHLY',
      status: 'ACTIVE',
      joinedDate: localDateString()
    });
    setIsEmployeeModalOpen(true);
  };

  const handleOpenEditEmployee = (emp: Employee) => {
    setEditingEmployee(emp);
    setEmpForm({
      name: emp.name,
      location: emp.location,
      role: emp.role,
      phone: emp.phone,
      email: emp.email,
      baseSalary: emp.baseSalary,
      salaryType: emp.salaryType,
      status: emp.status,
      joinedDate: emp.joinedDate
    });
    setIsEmployeeModalOpen(true);
  };

  const handleSaveEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!empForm.name.trim() || !empForm.role.trim()) {
      alert('اسم الموظف والمسمى الوظيفي مطلوبان.');
      return;
    }
    try {
      if (editingEmployee) {
        EmployeeService.update(editingEmployee.id, empForm);
      } else {
        EmployeeService.create(empForm);
      }
      setIsEmployeeModalOpen(false);
      loadAll();
    } catch (err: any) {
      alert(err?.message || 'تعذر حفظ بيانات الموظف.');
    }
  };

  const handleDeleteEmployee = (id: string) => {
    if (window.confirm('هل أنت متأكد من رغبتك في حذف هذا الموظف؟ سيتم حذف كامل سجلاته المالية.')) {
      try {
        EmployeeService.delete(id);
        loadAll();
      } catch (err: any) {
        alert(err?.message || 'تعذر حذف الموظف.');
      }
    }
  };

  const handleAddTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmpForTx || txForm.amount <= 0) return;
    try {
      EmployeeService.addTransaction({
        employeeId: selectedEmpForTx,
        type: txForm.type,
        amount: txForm.amount,
        date: txForm.date,
        notes: txForm.notes,
        createdBy: AuthService.getCurrentUser()?.id || 'usr_admin',
      });
      setIsTxModalOpen(false);
      setTxForm({
        type: 'ADVANCE',
        amount: 100,
        date: localDateString(),
        notes: ''
      });
      loadAll();
    } catch (err: any) {
      alert(err?.message || 'تعذر تسجيل الحركة المالية.');
    }
  };

  const handleAccruePayroll = () => {
    try {
      const result = EmployeeService.accrueMonthlyPayroll(payrollPeriod);
      alert(`تم ترحيل استحقاق الرواتب: ${result.created} موظف، مع تخطي ${result.skipped} قيدًا موجودًا.`);
      loadAll();
    } catch (err: any) {
      alert(err?.message || 'تعذر ترحيل استحقاق الرواتب.');
    }
  };

  const handleUpdateAttendance = (empId: string, status: AttendanceRecord['status']) => {
    try {
      EmployeeService.upsertAttendance({
        employeeId: empId,
        date: attendanceDate,
        status,
        recordedBy: AuthService.getCurrentUser()?.id || 'usr_admin',
      });
      loadAll();
    } catch (err: any) {
      alert(err?.message || 'تعذر تسجيل الحضور.');
    }
  };

  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = emp.name.includes(searchQuery) || emp.role.includes(searchQuery) || emp.phone.includes(searchQuery);
    const matchesLocation = selectedLocation === 'ALL' || emp.location === selectedLocation;
    return matchesSearch && matchesLocation;
  });

  const fmtCurrency = (num: number) => {
    return new Intl.NumberFormat('ar-EG').format(num) + ' ج.م';
  };

  // --- Reports calculations ---
  const totalWagesBill = employees.reduce((sum, e) => sum + (e.salaryType === 'MONTHLY' ? e.baseSalary : e.baseSalary * 26), 0);

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">

      {/* Header Banner */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
            <HardHat className="w-6 h-6 text-orange-600" />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-900">إدارة شؤون وأجور العمال</h1>
            <p className="text-xs text-slate-500 font-medium">تصنيف وتوزيع العمال في المستودعات والمعارض ومتابعة السلفيات، الرواتب، والأجور اليومية</p>
          </div>
        </div>
        <button
          onClick={handleOpenAddEmployee}
          className="flex items-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-orange-600/10 transition-all transform active:scale-95 shrink-0"
        >
          <Plus className="w-4 h-4" />
          إضافة عامل / موظف جديد
        </button>
      </div>

      {loading && (
        <div className="px-6 py-2 text-xs font-bold text-slate-500">جارٍ تحميل بيانات الموظفين...</div>
      )}

      {dbError && (
        <div className="mx-6 mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-bold text-rose-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {dbError}
          <button onClick={loadAll} className="mr-auto underline">إعادة المحاولة</button>
        </div>
      )}

      {/* Tabs Switcher */}
      <div className="bg-white border-b border-slate-200 px-6 py-2 flex flex-wrap gap-2">
        <button
          onClick={() => setActiveTab('directory')}
          className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${activeTab === 'directory' ? 'bg-orange-600 text-slate-900 shadow-md' : 'text-slate-500 hover:text-slate-800 bg-white'
 }`}
        >
          <HardHat className="w-4 h-4" />
          دليل العمال وتوزيعهم
        </button>
        <button
          onClick={() => setActiveTab('finance')}
          disabled={!canManageEmployees}
          className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${activeTab === 'finance' ? 'bg-orange-600 text-slate-900 shadow-md' : 'text-slate-500 hover:text-slate-800 bg-white'
 }`}
        >
          <Landmark className="w-4 h-4" />
          حسابات الأجور والرواتب
        </button>
        <button
          onClick={() => setActiveTab('attendance')}
          className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${activeTab === 'attendance' ? 'bg-orange-600 text-slate-900 shadow-md' : 'text-slate-500 hover:text-slate-800 bg-white'
 }`}
        >
          <UserCheck className="w-4 h-4" />
          سجل الحضور اليومي
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          disabled={!canManageEmployees}
          className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${activeTab === 'analytics' ? 'bg-orange-600 text-slate-900 shadow-md' : 'text-slate-500 hover:text-slate-800 bg-white'
 }`}
        >
          <BarChart3 className="w-4 h-4" />
          تقارير المراقبة والتحليلات
        </button>
      </div>

      {/* Main Container */}
      <div className="flex-1 overflow-hidden flex flex-col">

        {/* Sub-toolbar (Search and Location Filter) - visible on directories, ledger, etc. */}
        {activeTab !== 'analytics' && (
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="بحث باسم العامل، رقم الهاتف، أو المسمى الوظيفي..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-500/50 transition"
              />
            </div>

            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200">
              <Filter className="w-4 h-4 text-slate-500" />
              <span className="text-xs text-slate-500 font-bold ml-1">حسب موقع العمل:</span>
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="bg-transparent text-xs text-slate-800 font-bold focus:outline-none cursor-pointer"
              >
                <option value="ALL" className="bg-white text-slate-800">الكل</option>
                {DEFAULT_LOCATIONS.map(loc => (
                  <option key={loc} value={loc} className="bg-white text-slate-800">{loc}</option>
                ))}
              </select>
            </div>

            {activeTab === 'attendance' && (
              <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200">
                <Calendar className="w-4 h-4 text-slate-500" />
                <span className="text-xs text-slate-500 font-bold">تاريخ الحضور:</span>
                <input
                  type="date"
                  value={attendanceDate}
                  onChange={(e) => setAttendanceDate(e.target.value)}
                  className="bg-transparent text-xs text-slate-800 font-bold focus:outline-none cursor-pointer"
                />
              </div>
            )}
          </div>
        )}

        {/* Tab Content Panels */}
        <div className="flex-1 overflow-y-auto p-4">

          {/* TAB 1: DIRECTORY (دليل العمال وتوزيعهم) */}
          {activeTab === 'directory' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredEmployees.map((emp) => {
                const st = STATUS_LABELS[emp.status];
                return (
                  <div
                    key={emp.id}
                    className="bg-white border border-slate-200 hover:border-slate-300/80 rounded-xl p-5 transition flex flex-col justify-between group relative overflow-hidden"
                  >
                    {/* Visual location glow indicator */}
                    <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-l from-orange-500 via-yellow-500 to-transparent opacity-60" />

                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[11px] px-2.5 py-1 rounded-lg bg-orange-950/40 text-orange-600 font-bold border border-orange-500/20 flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 shrink-0" />
                          {emp.location}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${st.color}`}>
                          {st.label}
                        </span>
                      </div>

                      <h3 className="font-extrabold text-slate-900 group-hover:text-orange-600 transition mb-1 text-base">{emp.name}</h3>
                      <div className="text-xs text-slate-500 font-bold mb-3">{emp.role}</div>

                      <div className="space-y-2 text-xs text-slate-500 border-t border-slate-200 pt-3">
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-slate-550" />
                          <a href={`tel:${emp.phone}`} className="text-slate-355 hover:text-orange-600 transition">{emp.phone}</a>
                        </div>
                        {emp.email && (
                          <div className="flex items-center gap-2">
                            <Mail className="w-3.5 h-3.5 text-slate-550" />
                            <a href={`mailto:${emp.email}`} className="text-slate-355 hover:text-orange-600 transition">{emp.email}</a>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5 text-slate-550" />
                          <span>تاريخ التعيين: <span className="text-slate-700 font-medium">{emp.joinedDate}</span></span>
                        </div>
                        <div className="flex items-center gap-2">
                          <DollarSign className="w-3.5 h-3.5 text-slate-550" />
                          <span>
                            {canManageEmployees ? (
                              <>الأجر الأساسي: <span className="text-emerald-600 font-bold">{fmtCurrency(emp.baseSalary)}</span>
                                <span className="text-[10px] text-slate-500"> ({emp.salaryType === 'MONTHLY' ? 'شهرياً' : 'يومي'})</span></>
                            ) : 'بيانات الراتب محمية'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 pt-3 border-t border-slate-200 flex justify-between items-center">
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => handleOpenEditEmployee(emp)}
                          className="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-700 hover:text-orange-600 transition"
                          title="تعديل بيانات العامل"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteEmployee(emp.id)}
                          className="p-2 bg-rose-950/20 hover:bg-rose-950/40 border border-rose-500/10 rounded-lg text-rose-600 hover:text-rose-600 transition"
                          title="حذف العامل"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <button
                        onClick={() => {
                          setSelectedEmpForHistory(emp.id);
                          setIsHistoryModalOpen(true);
                        }}
                        className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 transition flex items-center gap-1"
                      >
                        <FileText className="w-3.5 h-3.5 text-slate-500" />
                        السجل المالي
                      </button>
                    </div>
                  </div>
                );
              })}
              {filteredEmployees.length === 0 && (
                <div className="col-span-full py-12 flex flex-col items-center justify-center text-slate-500 bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
                  <AlertCircle className="w-10 h-10 mb-2 text-slate-600" />
                  <p className="text-sm font-bold">لا يوجد عمال يطابقون خيارات البحث الحالية.</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: WAGES & FINANCES (أجور وحسابات العمال) */}
          {activeTab === 'finance' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
                <label className="text-xs font-bold text-slate-600">
                  فترة الاستحقاق
                  <input
                    type="month"
                    value={payrollPeriod}
                    onChange={(e) => setPayrollPeriod(e.target.value)}
                    className="mt-1 block px-3 py-2 rounded-lg border border-slate-200 bg-slate-50"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleAccruePayroll}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  ترحيل استحقاق الرواتب
                </button>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-slate-200">
                  <h3 className="text-sm font-black text-slate-800">أرصدة الرواتب المستحقة في دفتر الأستاذ حسب الموظف</h3>
                  <p className="text-xs text-slate-500 mt-1">من قيود حساب 2104، وتشمل الاستحقاق والسلف والخصومات والصرف والقيود العكسية.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500">
                      <tr><th className="p-3">الموظف</th><th className="p-3 text-left">الرصيد المستحق</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {payrollPayables.length ? payrollPayables.map((row) => (
                        <tr key={row.employeeId || 'unassigned'}>
                          <td className="p-3 font-bold">{row.employeeName}</td>
                          <td className="p-3 text-left font-mono">{fmtCurrency(row.balance)}</td>
                        </tr>
                      )) : <tr><td colSpan={2} className="p-5 text-center text-slate-500">لا توجد مستحقات رواتب مفتوحة في دفتر الأستاذ.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Financial Quick Summaries */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-slate-500 font-bold block mb-1">فاتورة الأجور التقديرية</span>
                    <span className="text-lg font-black text-slate-900">{fmtCurrency(totalWagesBill)}</span>
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 text-emerald-600">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-slate-500 font-bold block mb-1">إجمالي السلفيات المسجلة</span>
                    <span className="text-lg font-black text-amber-600">
                      {fmtCurrency(transactions.filter(t => t.type === 'ADVANCE').reduce((sum, t) => sum + t.amount, 0))}
                    </span>
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center border border-amber-500/20 text-amber-600">
                    <TrendingDown className="w-5 h-5" />
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-slate-500 font-bold block mb-1">المكافآت والحوافز</span>
                    <span className="text-lg font-black text-emerald-600">
                      {fmtCurrency(transactions.filter(t => t.type === 'BONUS').reduce((sum, t) => sum + t.amount, 0))}
                    </span>
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 text-emerald-600">
                    <DollarSign className="w-5 h-5" />
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-slate-500 font-bold block mb-1">الخصومات المطبقة</span>
                    <span className="text-lg font-black text-rose-600">
                      {fmtCurrency(transactions.filter(t => t.type === 'DEDUCTION').reduce((sum, t) => sum + t.amount, 0))}
                    </span>
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-rose-500/10 flex items-center justify-center border border-rose-500/20 text-rose-600">
                    <TrendingDown className="w-5 h-5" />
                  </div>
                </div>
              </div>

              {/* Table list of wages ledger */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-right border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500">
                        <th className="p-4">العامل والموقع</th>
                        <th className="p-4">الراتب الأساسي</th>
                        <th className="p-4">إجمالي السلف</th>
                        <th className="p-4">المكافآت (+)</th>
                        <th className="p-4">الخصومات (-)</th>
                        <th className="p-4">المدفوع / المصروف</th>
                        <th className="p-4 text-left">صافي المستحق</th>
                        <th className="p-4 text-center">عمليات الحسابات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-sm">
                      {filteredEmployees.map(emp => {
                        const fin = getEmployeeFinancials(emp.id);
                        return (
                          <tr key={emp.id} className="hover:bg-slate-100 transition">
                            <td className="p-4">
                              <div className="font-extrabold text-slate-900">{emp.name}</div>
                              <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                                <MapPin className="w-3 h-3 text-slate-600" />
                                {emp.location} — {emp.role}
                              </div>
                            </td>
                            <td className="p-4 font-bold text-slate-600">
                              {canManageEmployees ? <>{fmtCurrency(emp.baseSalary)}<span className="text-[10px] text-slate-500 block font-normal">{emp.salaryType === 'MONTHLY' ? 'شهري' : 'يومي'}</span></> : '—'}
                            </td>
                            <td className="p-4 font-bold text-amber-500">{fmtCurrency(fin.advances)}</td>
                            <td className="p-4 font-bold text-emerald-500">{fmtCurrency(fin.bonuses)}</td>
                            <td className="p-4 font-bold text-rose-500">{fmtCurrency(fin.deductions)}</td>
                            <td className="p-4 font-bold text-sky-500">{fmtCurrency(fin.payouts)}</td>
                            <td className={`p-4 font-black text-left ${fin.netDue >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {fmtCurrency(fin.netDue)}
                            </td>
                            <td className="p-4">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={() => {
                                    setSelectedEmpForTx(emp.id);
                                    setIsTxModalOpen(true);
                                  }}
                                  className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-bold text-orange-600 rounded-lg transition"
                                >
                                  تسجيل حركة مالية
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedEmpForHistory(emp.id);
                                    setIsHistoryModalOpen(true);
                                  }}
                                  className="p-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-500 hover:text-slate-900 transition"
                                  title="عرض حركة الحساب"
                                >
                                  <FileText className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {filteredEmployees.length === 0 && (
                        <tr>
                          <td colSpan={8} className="text-center py-10 text-slate-500 font-bold">
                            لا يوجد عمال مسجلين حالياً.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ATTENDANCE (حضور وانصراف العمال اليومي) */}
          {activeTab === 'attendance' && (
            <div className="space-y-4">
              <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-black text-slate-900">تسجيل دفتر حضور يوم {attendanceDate}</h3>
                  <p className="text-xs text-slate-500 mt-1">قم بتحديد حضور وغياب العمال لتحديث كشف الرواتب تلقائياً وحساب اليوميات بدقة</p>
                </div>

                {/* Attendance Summary */}
                <div className="flex gap-4">
                  <div className="text-center bg-slate-50 px-4 py-2 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-500 block font-bold">حاضر</span>
                    <span className="text-base font-black text-emerald-600">
                      {employees.filter(e => attendance.find(a => a.date === attendanceDate && a.employeeId === e.id && a.status === 'PRESENT')).length}
                    </span>
                  </div>
                  <div className="text-center bg-slate-50 px-4 py-2 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-500 block font-bold">متأخر</span>
                    <span className="text-base font-black text-amber-600">
                      {employees.filter(e => attendance.find(a => a.date === attendanceDate && a.employeeId === e.id && a.status === 'LATE')).length}
                    </span>
                  </div>
                  <div className="text-center bg-slate-50 px-4 py-2 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-500 block font-bold">غائب</span>
                    <span className="text-base font-black text-rose-600">
                      {employees.filter(e => attendance.find(a => a.date === attendanceDate && a.employeeId === e.id && a.status === 'ABSENT')).length}
                    </span>
                  </div>
                </div>
              </div>

              {/* Attendance Table */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-right border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500">
                        <th className="p-4">العامل ومقر العمل</th>
                        <th className="p-4">المسمى الوظيفي</th>
                        <th className="p-4 text-center">حالة الحضور</th>
                        <th className="p-4">ملاحظات اليوم</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-sm">
                      {filteredEmployees.map(emp => {
                        const record = attendance.find(a => a.date === attendanceDate && a.employeeId === emp.id);
                        const status = record?.status;

                        return (
                          <tr key={emp.id} className="hover:bg-slate-100 transition">
                            <td className="p-4 font-bold text-slate-900">
                              {emp.name}
                              <span className="text-[10px] text-slate-500 font-medium block">{emp.location}</span>
                            </td>
                            <td className="p-4 text-slate-500 text-xs font-semibold">{emp.role}</td>
                            <td className="p-4">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => handleUpdateAttendance(emp.id, 'PRESENT')}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${status === 'PRESENT'
 ? 'bg-emerald-600 border-emerald-500 text-white'
 : 'bg-slate-50 hover:bg-slate-50 text-slate-500'
 }`}
                                >
                                  حاضر
                                </button>
                                <button
                                  onClick={() => handleUpdateAttendance(emp.id, 'LATE')}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${status === 'LATE'
 ? 'bg-amber-600 border-amber-500 text-white'
 : 'bg-slate-50 hover:bg-slate-50 text-slate-500'
 }`}
                                >
                                  متأخر
                                </button>
                                <button
                                  onClick={() => handleUpdateAttendance(emp.id, 'ABSENT')}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${status === 'ABSENT'
 ? 'bg-rose-600 border-rose-500 text-white'
 : 'bg-slate-50 hover:bg-slate-50 text-slate-500'
 }`}
                                >
                                  غائب
                                </button>
                                <button
                                  onClick={() => handleUpdateAttendance(emp.id, 'LEAVE')}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${status === 'LEAVE'
 ? 'bg-sky-600 border-sky-500 text-white'
 : 'bg-slate-50 hover:bg-slate-50 text-slate-500'
 }`}
                                >
                                  إجازة
                                </button>
                              </div>
                            </td>
                            <td className="p-4 text-xs text-slate-500">
                              <input
                                type="text"
                                placeholder="أضف ملاحظة (مثال: تأخير إذن، عذر طبي)..."
                                value={record?.notes || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setAttendance(prev => {
                                    const filtered = prev.filter(rec => !(rec.date === attendanceDate && rec.employeeId === emp.id));
                                    return [...filtered, { date: attendanceDate, employeeId: emp.id, status: status || 'PRESENT', notes: val }];
                                  });
                                }}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-slate-300 text-xs"
                              />
                            </td>
                          </tr>
                        );
                      })}
                      {filteredEmployees.length === 0 && (
                        <tr>
                          <td colSpan={4} className="text-center py-8 text-slate-500 font-bold">
                            لا يوجد موظفون متاحون للتسجيل.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: ANALYTICS & REPORTS (لوحة التقارير والتحليلات) */}
          {activeTab === 'analytics' && (
            <div className="space-y-6">

              {/* Distribution of Workers by Location */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* Visual Location distribution */}
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-orange-600" />
                    توزيع العمال حسب موقع العمل
                  </h3>

                  <div className="space-y-4">
                    {DEFAULT_LOCATIONS.map(loc => {
                      const count = employees.filter(e => e.location === loc).length;
                      const percentage = employees.length > 0 ? (count / employees.length) * 100 : 0;

                      return (
                        <div key={loc}>
                          <div className="flex justify-between items-center text-xs mb-1">
                            <span className="font-extrabold text-slate-600">{loc}</span>
                            <span className="text-slate-500 font-bold">{count} عمال ({Math.round(percentage)}%)</span>
                          </div>
                          <div className="w-full bg-slate-50 h-2.5 rounded-full overflow-hidden border border-slate-200">
                            <div
                              className="bg-gradient-to-l from-orange-500 to-amber-500 h-full rounded-full transition-all duration-500"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Payroll Type & Status Distribution */}
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2">
                    <Landmark className="w-4 h-4 text-emerald-600" />
                    نظام تعاقد العمل والرواتب
                  </h3>

                  <div className="space-y-6">
                    <div>
                      <h4 className="text-xs text-slate-500 font-black mb-3">حسب نوع الراتب:</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center">
                          <span className="text-[10px] text-slate-500 font-bold block mb-1">راتب شهري ثابت</span>
                          <span className="text-lg font-black text-slate-900">
                            {employees.filter(e => e.salaryType === 'MONTHLY').length} عمال
                          </span>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center">
                          <span className="text-[10px] text-slate-500 font-bold block mb-1">أجر يومي / باليومية</span>
                          <span className="text-lg font-black text-slate-900">
                            {employees.filter(e => e.salaryType === 'DAILY').length} عمال
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-slate-200 pt-4">
                      <h4 className="text-xs text-slate-500 font-black mb-3">حالات العمال حالياً:</h4>
                      <div className="flex gap-2">
                        <span className="text-[11px] font-bold px-3 py-1 bg-emerald-500/10 text-emerald-600 rounded-lg border border-emerald-500/20">
                          {employees.filter(e => e.status === 'ACTIVE').length} على رأس العمل
                        </span>
                        <span className="text-[11px] font-bold px-3 py-1 bg-amber-500/10 text-amber-600 rounded-lg border border-amber-500/20">
                          {employees.filter(e => e.status === 'ON_LEAVE').length} إجازات رسمية
                        </span>
                        <span className="text-[11px] font-bold px-3 py-1 bg-rose-500/10 text-rose-600 rounded-lg border border-rose-500/20">
                          {employees.filter(e => e.status === 'SUSPENDED').length} موقوف
                        </span>
                      </div>
                    </div>

                  </div>
                </div>

              </div>

              {/* Transactions log overview */}
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2">
                  <ArrowLeftRight className="w-4 h-4 text-sky-600" />
                  أحدث العمليات المالية المسجلة (المكافآت، الخصومات، السُلف، الصرف)
                </h3>

                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {transactions.slice(0, 10).map((t) => {
                    const emp = employees.find(e => e.id === t.employeeId);
                    const typeDetails = TX_TYPES[t.type];
                    return (
                      <div key={t.id} className="bg-slate-50 border border-slate-200 p-3 rounded-lg flex items-center justify-between text-xs hover:border-slate-200 transition">
                        <div className="flex items-center gap-3">
                          <span className={`px-2 py-0.5 rounded font-black border text-[10px] ${typeDetails.color}`}>
                            {typeDetails.label}
                          </span>
                          <div>
                            <span className="font-extrabold text-slate-900">{emp ? emp.name : 'موظف محذوف'}</span>
                            <span className="text-slate-500 block text-[10px] mt-0.5">{t.notes || 'بدون ملاحظات'}</span>
                          </div>
                        </div>
                        <div className="text-left">
                          <span className="font-black text-slate-800 block">{fmtCurrency(t.amount)}</span>
                          <span className="text-slate-550 text-[10px] block mt-0.5">{t.date}</span>
                        </div>
                      </div>
                    );
                  })}
                  {transactions.length === 0 && (
                    <div className="text-center py-6 text-slate-500">لا يوجد عمليات مالية مسجلة.</div>
                  )}
                </div>
              </div>

            </div>
          )}

        </div>
      </div>

      {/* --- MODAL 1: ADD / EDIT EMPLOYEE --- */}
      {isEmployeeModalOpen && (
        <div className="fixed inset-0 z-50 bg-white backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200" dir="rtl">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
              <h2 className="text-sm font-black text-slate-900">
                {editingEmployee ? 'تعديل بيانات العامل / الموظف' : 'إضافة عامل / موظف جديد'}
              </h2>
              <button
                onClick={() => setIsEmployeeModalOpen(false)}
                className="text-slate-500 hover:text-slate-900 font-bold text-xs"
              >
                إغلاق
              </button>
            </div>

            <form onSubmit={handleSaveEmployee} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">الاسم بالكامل *</label>
                  <input
                    type="text"
                    required
                    value={empForm.name}
                    onChange={(e) => setEmpForm(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-orange-500/50 text-xs"
                    placeholder="مثال: أحمد محمد علي"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">موقع العمل *</label>
                  <select
                    value={empForm.location}
                    onChange={(e) => setEmpForm(prev => ({ ...prev, location: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-orange-500/50 text-xs"
                  >
                    {DEFAULT_LOCATIONS.map(loc => (
                      <option key={loc} value={loc}>{loc}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">المسمى الوظيفي *</label>
                  <input
                    type="text"
                    required
                    value={empForm.role}
                    onChange={(e) => setEmpForm(prev => ({ ...prev, role: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-orange-500/50 text-xs"
                    placeholder="مثال: أمين مستودع، كاشير"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">رقم الهاتف *</label>
                  <input
                    type="tel"
                    required
                    value={empForm.phone}
                    onChange={(e) => setEmpForm(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-orange-500/50 text-xs"
                    placeholder="01xxxxxxxxx"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">البريد الإلكتروني</label>
                  <input
                    type="email"
                    value={empForm.email}
                    onChange={(e) => setEmpForm(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-orange-500/50 text-xs"
                    placeholder="name@company.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">تاريخ التعيين / الالتحاق</label>
                  <input
                    type="date"
                    value={empForm.joinedDate}
                    onChange={(e) => setEmpForm(prev => ({ ...prev, joinedDate: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-orange-500/50 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 bg-white p-4 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">الراتب الأساسي *</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={empForm.baseSalary}
                    onChange={(e) => setEmpForm(prev => ({ ...prev, baseSalary: Number(e.target.value) }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 font-bold focus:outline-none focus:border-orange-500/50 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">دورة الاحتساب *</label>
                  <select
                    value={empForm.salaryType}
                    onChange={(e) => setEmpForm(prev => ({ ...prev, salaryType: e.target.value as Employee['salaryType'] }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-slate-800 focus:outline-none focus:border-orange-500/50 text-xs"
                  >
                    <option value="MONTHLY">شهرياً (ثابت)</option>
                    <option value="DAILY">يومي (يوميات)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">الحالة الإدارية *</label>
                  <select
                    value={empForm.status}
                    onChange={(e) => setEmpForm(prev => ({ ...prev, status: e.target.value as Employee['status'] }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-slate-800 focus:outline-none focus:border-orange-500/50 text-xs"
                  >
                    <option value="ACTIVE">على رأس العمل</option>
                    <option value="ON_LEAVE">في إجازة</option>
                    <option value="SUSPENDED">موقوف مؤقتاً</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEmployeeModalOpen(false)}
                  className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-900 border border-slate-200 rounded-xl text-xs font-bold transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-orange-700 hover:bg-orange-600 text-slate-900 rounded-xl text-xs font-bold shadow-lg transition"
                >
                  {editingEmployee ? 'حفظ التغييرات' : 'إضافة العامل'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 2: ADD FINANCIAL TRANSACTION (تسجيل حركة مالية) --- */}
      {isTxModalOpen && (
        <div className="fixed inset-0 z-50 bg-white backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200" dir="rtl">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
              <h2 className="text-sm font-black text-slate-900">
                تسجيل حركة حساب مالي للعامل:{' '}
                <span className="text-orange-600">
                  {employees.find(e => e.id === selectedEmpForTx)?.name}
                </span>
              </h2>
              <button
                onClick={() => setIsTxModalOpen(false)}
                className="text-slate-500 hover:text-slate-900 font-bold text-xs"
              >
                إغلاق
              </button>
            </div>

            <form onSubmit={handleAddTransaction} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">نوع الحركة المالية</label>
                <select
                  value={txForm.type}
                  onChange={(e) => setTxForm(prev => ({ ...prev, type: e.target.value as FinancialTransaction['type'] }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-orange-500/50 text-xs"
                >
                  <option value="ADVANCE">سُلفة (تُخصم من راتبه)</option>
                  <option value="BONUS">مكافأة / حافز إضافي</option>
                  <option value="DEDUCTION">خصم جزائي (يُطرح من المستحقات)</option>
                  <option value="SALARY_PAYOUT">صرف راتب / دفعة نقدية مسلّمة باليد</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">المبلغ بالجنيه *</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={txForm.amount}
                    onChange={(e) => setTxForm(prev => ({ ...prev, amount: Number(e.target.value) }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-bold focus:outline-none focus:border-orange-500/50 text-xs"
                    placeholder="مثال: 500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">التاريخ *</label>
                  <input
                    type="date"
                    required
                    value={txForm.date}
                    onChange={(e) => setTxForm(prev => ({ ...prev, date: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-orange-500/50 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">البيان / ملاحظات توضيحية *</label>
                <textarea
                  required
                  value={txForm.notes}
                  onChange={(e) => setTxForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-orange-500/50 text-xs h-20 resize-none"
                  placeholder="اكتب تفاصيل المعاملة بدقة..."
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsTxModalOpen(false)}
                  className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-900 border border-slate-200 rounded-xl text-xs font-bold transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-orange-700 hover:bg-orange-600 text-slate-900 rounded-xl text-xs font-bold shadow-lg transition"
                >
                  تسجيل الحركة المالية
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 3: LEDGER TRANSACTION HISTORY (السجل المالي المفصل) --- */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 z-50 bg-white backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200" dir="rtl">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
              <div>
                <h2 className="text-sm font-black text-slate-900">
                  السجل المالي التفصيلي للعامل:{' '}
                  <span className="text-orange-600">
                    {employees.find(e => e.id === selectedEmpForHistory)?.name}
                  </span>
                </h2>
                <p className="text-[10px] text-slate-500 mt-0.5">كافة العمليات والدفعات المالية المسجلة على الحساب</p>
              </div>
              <button
                onClick={() => setIsHistoryModalOpen(false)}
                className="text-slate-500 hover:text-slate-900 font-bold text-xs"
              >
                إغلاق
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[400px] space-y-3">
              {transactions.filter(t => t.employeeId === selectedEmpForHistory).length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-xs font-bold">
                  لا توجد حركات مالية مسجلة لهذا العامل بعد.
                </div>
              ) : (
                transactions
                  .filter(t => t.employeeId === selectedEmpForHistory)
                  .map((t) => {
                    const typeDetails = TX_TYPES[t.type];
                    return (
                      <div key={t.id} className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex items-center justify-between text-xs hover:border-slate-200 transition">
                        <div className="flex items-center gap-3">
                          <span className={`px-2.5 py-1 rounded font-bold border text-[10px] ${typeDetails.color}`}>
                            {typeDetails.label}
                          </span>
                          <div>
                            <span className="font-extrabold text-slate-900 text-xs block">{t.notes}</span>
                            <span className="text-slate-500 text-[10px] block mt-0.5">التاريخ: {t.date}</span>
                          </div>
                        </div>
                        <div className="text-left flex items-center gap-3">
                          <span className="font-black text-slate-800 text-sm">{fmtCurrency(t.amount)}</span>
                          <button
                            onClick={() => {
                              if (window.confirm('هل أنت متأكد من حذف هذه المعاملة المالية؟')) {
                                setTransactions(prev => prev.filter(item => item.id !== t.id));
                              }
                            }}
                            className="text-rose-500 hover:text-rose-600 p-1 bg-white border border-slate-200 rounded hover:border-rose-500/20 transition"
                            title="حذف القيد"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>

            <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-between items-center text-xs">
              <span className="text-slate-500 font-bold">الحساب الحالي:</span>
              <span className="font-black text-orange-600 text-sm">
                {fmtCurrency(getEmployeeFinancials(selectedEmpForHistory).netDue)}
              </span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
