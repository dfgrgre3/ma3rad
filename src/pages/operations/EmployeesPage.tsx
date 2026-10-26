import React, { useState, useEffect } from 'react';
import { EmployeeService } from '../../services/EmployeeService';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import { localDateString } from '../../utils/date';
import { EmployeeAnalyticsTab } from './employees/EmployeeAnalyticsTab';
import { EmployeeAttendanceTab } from './employees/EmployeeAttendanceTab';
import { EmployeeDirectoryTab } from './employees/EmployeeDirectoryTab';
import { EmployeeFilters } from './employees/EmployeeFilters';
import { EmployeeFinanceTab } from './employees/EmployeeFinanceTab';
import { EmployeeFormModal } from './employees/EmployeeFormModal';
import { EmployeeHistoryModal } from './employees/EmployeeHistoryModal';
import { EmployeeTabs } from './employees/EmployeeTabs';
import { EmployeeTransactionModal } from './employees/EmployeeTransactionModal';
import { EmployeesHeader } from './employees/EmployeesHeader';
import { calculateTotalWagesBill, filterEmployees, getEmployeeFinancials } from './employees/helpers';
import {
  DEFAULT_LOCATIONS,
  type AttendanceRecord,
  type Employee,
  type EmployeeFormState,
  type EmployeeTab,
  type FinancialTransaction,
  type PayrollPayable,
  type TransactionFormState,
} from './employees/types';

export const EmployeesPage: React.FC = () => {
  const canManageEmployees = PermissionService.can(AuthService.getCurrentUser(), 'employees.manage');
  // --- Database State ---
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [payrollPayables, setPayrollPayables] = useState<PayrollPayable[]>([]);
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
  const [activeTab, setActiveTab] = useState<EmployeeTab>('directory');

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
  const [empForm, setEmpForm] = useState<EmployeeFormState>({
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

  const [txForm, setTxForm] = useState<TransactionFormState>({
    type: 'ADVANCE' as FinancialTransaction['type'],
    amount: 100,
    date: localDateString(),
    notes: ''
  });

  // --- Attendance State ---
  const [attendanceDate, setAttendanceDate] = useState(localDateString());
  const [payrollPeriod, setPayrollPeriod] = useState(localDateString().slice(0, 7));

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

  const handleAttendanceNotesChange = (empId: string, status: AttendanceRecord['status'] | undefined, val: string) => {
    setAttendance(prev => {
      const filtered = prev.filter(rec => !(rec.date === attendanceDate && rec.employeeId === empId));
      return [...filtered, { date: attendanceDate, employeeId: empId, status: status || 'PRESENT', notes: val }];
    });
  };

  const handleOpenTransaction = (empId: string) => {
    setSelectedEmpForTx(empId);
    setIsTxModalOpen(true);
  };

  const handleOpenHistory = (empId: string) => {
    setSelectedEmpForHistory(empId);
    setIsHistoryModalOpen(true);
  };

  const handleDeleteTransaction = (id: string) => {
    setTransactions(prev => prev.filter(item => item.id !== id));
  };

  const filteredEmployees = filterEmployees(employees, searchQuery, selectedLocation);

  // --- Reports calculations ---
  const totalWagesBill = calculateTotalWagesBill(employees);

  const txEmployeeName = employees.find(e => e.id === selectedEmpForTx)?.name;
  const historyEmployeeName = employees.find(e => e.id === selectedEmpForHistory)?.name;
  const historyTransactions = isHistoryModalOpen
    ? transactions.filter(t => t.employeeId === selectedEmpForHistory)
    : [];
  const historyNetDue = isHistoryModalOpen
    ? getEmployeeFinancials(employees, transactions, selectedEmpForHistory).netDue
    : 0;

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">

      <EmployeesHeader
        loading={loading}
        dbError={dbError}
        onAddEmployee={handleOpenAddEmployee}
        onRetry={loadAll}
      />

      {/* Tabs Switcher */}
      <EmployeeTabs
        activeTab={activeTab}
        canManageEmployees={canManageEmployees}
        onTabChange={setActiveTab}
      />

      {/* Main Container */}
      <div className="flex-1 overflow-hidden flex flex-col">

        <EmployeeFilters
          activeTab={activeTab}
          searchQuery={searchQuery}
          selectedLocation={selectedLocation}
          attendanceDate={attendanceDate}
          onSearchQueryChange={setSearchQuery}
          onSelectedLocationChange={setSelectedLocation}
          onAttendanceDateChange={setAttendanceDate}
        />

        {/* Tab Content Panels */}
        <div className="flex-1 overflow-y-auto p-4">

          {/* TAB 1: DIRECTORY (دليل العمال وتوزيعهم) */}
          {activeTab === 'directory' && (
            <EmployeeDirectoryTab
              employees={filteredEmployees}
              canManageEmployees={canManageEmployees}
              onEditEmployee={handleOpenEditEmployee}
              onDeleteEmployee={handleDeleteEmployee}
              onOpenHistory={handleOpenHistory}
            />
          )}

          {/* TAB 2: WAGES & FINANCES (أجور وحسابات العمال) */}
          {activeTab === 'finance' && (
            <EmployeeFinanceTab
              employees={filteredEmployees}
              allEmployees={employees}
              transactions={transactions}
              payrollPayables={payrollPayables}
              payrollPeriod={payrollPeriod}
              totalWagesBill={totalWagesBill}
              canManageEmployees={canManageEmployees}
              onPayrollPeriodChange={setPayrollPeriod}
              onAccruePayroll={handleAccruePayroll}
              onOpenTransaction={handleOpenTransaction}
              onOpenHistory={handleOpenHistory}
            />
          )}

          {/* TAB 3: ATTENDANCE (حضور وانصراف العمال اليومي) */}
          {activeTab === 'attendance' && (
            <EmployeeAttendanceTab
              employees={filteredEmployees}
              allEmployees={employees}
              attendance={attendance}
              attendanceDate={attendanceDate}
              onUpdateAttendance={handleUpdateAttendance}
              onAttendanceNotesChange={handleAttendanceNotesChange}
            />
          )}

          {/* TAB 4: ANALYTICS & REPORTS (لوحة التقارير والتحليلات) */}
          {activeTab === 'analytics' && (
            <EmployeeAnalyticsTab
              employees={employees}
              transactions={transactions}
            />
          )}

        </div>
      </div>

      {/* --- MODAL 1: ADD / EDIT EMPLOYEE --- */}
      <EmployeeFormModal
        open={isEmployeeModalOpen}
        editingEmployee={editingEmployee}
        form={empForm}
        onFormChange={setEmpForm}
        onClose={() => setIsEmployeeModalOpen(false)}
        onSubmit={handleSaveEmployee}
      />

      {/* --- MODAL 2: ADD FINANCIAL TRANSACTION (تسجيل حركة مالية) --- */}
      <EmployeeTransactionModal
        open={isTxModalOpen}
        employeeName={txEmployeeName}
        form={txForm}
        onFormChange={setTxForm}
        onClose={() => setIsTxModalOpen(false)}
        onSubmit={handleAddTransaction}
      />

      {/* --- MODAL 3: LEDGER TRANSACTION HISTORY (السجل المالي المفصل) --- */}
      <EmployeeHistoryModal
        open={isHistoryModalOpen}
        employeeName={historyEmployeeName}
        transactions={historyTransactions}
        netDue={historyNetDue}
        onClose={() => setIsHistoryModalOpen(false)}
        onDeleteTransaction={handleDeleteTransaction}
      />

    </div>
  );
};
