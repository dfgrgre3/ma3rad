import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EmployeeService } from '../../../services/domains/hr/EmployeeService';
import { EmployeeOrganizationService } from '../../../services/domains/hr/EmployeeOrganizationService';
import { exportToExcel } from '../../../utils/export/export';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { BranchAccessService } from '../../../services/domains/auth/BranchAccessService';
import { localDateString } from '../../../utils/shared/date';
import { EmployeeAnalyticsTab } from './EmployeeAnalyticsTab';
import { EmployeeAttendanceTab } from './EmployeeAttendanceTab';
import { EmployeeDirectoryTab } from './EmployeeDirectoryTab';
import { EmployeeFilters } from './EmployeeFilters';
import { EmployeeFinanceTab } from './EmployeeFinanceTab';
import { EmployeeFormModal } from './EmployeeFormModal';
import { EmployeeHistoryModal } from './EmployeeHistoryModal';
import { EmployeeTabs } from './EmployeeTabs';
import { EmployeeTransactionModal } from './EmployeeTransactionModal';
import { EmployeesHeader } from './EmployeesHeader';
import { calculateTotalWagesBill, filterEmployees, getEmployeeFinancials } from './helpers';
import { OperationalFieldService, type OperationalFieldDefinition } from '../../../services/domains/products/OperationalFieldService';
import { OperationalFieldsFilter, matchesOperationalFieldFilters, type OperationalFieldFilters } from '../../../components/products/OperationalFieldsFilter';
import { OperationalFieldsSummary } from '../../../components/products/OperationalFieldsSummary';
import { OperationalFieldsRecordEditor } from '../../../components/products/OperationalFieldsRecordEditor';
import {
  type AttendanceRecord,
  type Employee,
  type EmployeeFormState,
  type EmployeeTab,
  type FinancialTransaction,
  type PayrollPayable,
  type TransactionFormState,
} from '../../../types/hr/employeesPage';

export const EmployeesPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const canManageEmployees = PermissionService.can(AuthService.getCurrentUser(), 'ui.employees.employees.manage');
  const canExportEmployees = PermissionService.can(AuthService.getCurrentUser(), 'ui.employees.employees.export');
  // --- Database State ---
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [payrollPayables, setPayrollPayables] = useState<PayrollPayable[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [employeeBranches, setEmployeeBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [departments, setDepartments] = useState<Array<{
    id: string;
    name: string;
    branchId: string | null;
    description: string | null;
  }>>([]);
  const [jobTitles, setJobTitles] = useState<Array<{ id: string; title: string; departmentId: string | null }>>([]);
  const [operationalFields, setOperationalFields] = useState<OperationalFieldDefinition[]>([]);
  const [operationalFieldValues, setOperationalFieldValues] = useState<Record<string, string>>({});
  const [valuesByEmployee, setValuesByEmployee] = useState<Record<string, Record<string, string>>>({});
  const [fieldFilters, setFieldFilters] = useState<OperationalFieldFilters>({});
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);

  const loadAll = () => {
    setLoading(true);
    try {
      const branchAccess = new BranchAccessService();
      const currentBranchId = branchAccess.getCurrentBranchId();
      setEmployeeBranches(
        branchAccess.getSelectableBranches()
          .filter((branch) => branch.id === currentBranchId)
          .map(({ id, name }) => ({ id, name }))
      );
      const organizationService = new EmployeeOrganizationService();
      setDepartments(organizationService.getDepartments(currentBranchId));
      setJobTitles(organizationService.getJobTitles());
      const currentEmployees = EmployeeService.getAll() as unknown as Employee[];
      setEmployees(currentEmployees);
      const fieldService = new OperationalFieldService();
      setOperationalFields(fieldService.getDefinitions('employees'));
      setValuesByEmployee(fieldService.getRecordValuesForRecords('employees', currentEmployees.map((employee) => employee.id)));
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
  useEffect(() => { setSearchQuery(searchParams.get('search') || ''); }, [searchParams]);
  const handleExportEmployees = () => {
    const fieldService = new OperationalFieldService();
    const valueMap = fieldService.getRecordValuesForExport('employees', employees.map((employee) => employee.id));
    const fields = fieldService.getDefinitions('employees');
    exportToExcel({
      title: 'الموظفون',
      subtitle: 'قائمة الموظفين',
      columns: [
        { key: 'name', label: 'الاسم' },
        { key: 'role', label: 'الدور' },
        { key: 'location', label: 'الموقع' },
        { key: 'phone', label: 'الهاتف' },
        { key: 'email', label: 'البريد' },
        { key: 'status', label: 'الحالة' },
        ...fields.map((field) => ({ key: field.name, label: field.name })),
      ],
      rows: employees.map((e) => ({ name: e.name, role: e.role, location: e.location, phone: e.phone, email: e.email, status: e.status, ...(valueMap[e.id] || {}) })),
      fileName: 'employees',
      permission: 'employees.export',
    });
  };


  // --- Active Tab ---
  const [activeTab, setActiveTab] = useState<EmployeeTab>('directory');

  // --- Filtering & Search ---
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [selectedLocation, setSelectedLocation] = useState<string>('ALL');

  // --- Modal States ---
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [isEmployeeSaving, setIsEmployeeSaving] = useState(false);
  const [employeeFormError, setEmployeeFormError] = useState<string | null>(null);

  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [selectedEmpForTx, setSelectedEmpForTx] = useState<string>('');

  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedEmpForHistory, setSelectedEmpForHistory] = useState<string>('');

  // --- Forms Fields ---
  const [empForm, setEmpForm] = useState<EmployeeFormState>({
    branchId: '',
    employmentType: 'FULL_TIME',
    name: '',
    nationalId: '',
    birthDate: '',
    gender: 'OTHER',
    location: '',
    role: '',
    phone: '',
    phone2: '',
    email: '',
    address: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    departmentId: '',
    managerEmployeeId: '',
    probationStartDate: '',
    probationEndDate: '',
    baseSalary: 6000,
    salaryType: 'MONTHLY' as Employee['salaryType'],
    salaryPaymentMethod: 'CASH',
    bankName: '',
    bankAccountNumber: '',
    walletProvider: '',
    walletNumber: '',
    socialInsuranceNumber: '',
    taxFileNumber: '',
    taxExempt: false,
    taxExemptionAmount: 0,
    taxDependents: 0,
    education: '',
    previousExperience: '',
    status: 'ACTIVE' as Employee['status'],
    joinedDate: localDateString(),
    notes: '',
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
    setJobTitles(new EmployeeOrganizationService().getJobTitles());
    setOperationalFieldValues({});
    setEmployeeFormError(null);
    setEmpForm({
      branchId: employeeBranches[0]?.id || '',
      employmentType: 'FULL_TIME',
      name: '',
      nationalId: '',
      birthDate: '',
      gender: 'OTHER',
      location: employeeBranches[0]?.name || '',
      role: '',
      phone: '',
      phone2: '',
      email: '',
      address: '',
      emergencyContactName: '',
      emergencyContactPhone: '',
      departmentId: '',
      managerEmployeeId: '',
      probationStartDate: '',
      probationEndDate: '',
      baseSalary: 6000,
      salaryType: 'MONTHLY',
      salaryPaymentMethod: 'CASH',
      bankName: '',
      bankAccountNumber: '',
      walletProvider: '',
      walletNumber: '',
      socialInsuranceNumber: '',
      taxFileNumber: '',
    taxExempt: false,
    taxExemptionAmount: 0,
    taxDependents: 0,
      education: '',
      previousExperience: '',
      status: 'ACTIVE',
      joinedDate: localDateString(),
      notes: '',
    });
    setIsEmployeeModalOpen(true);
  };

  const handleOpenEditEmployee = (emp: Employee) => {
    setEditingEmployee(emp);
    setJobTitles(new EmployeeOrganizationService().getJobTitles(emp.departmentId || undefined));
    setOperationalFieldValues(new OperationalFieldService().getRecordValues('employees', emp.id));
    setEmployeeFormError(null);
    setEmpForm({
      branchId: emp.branchId || employeeBranches[0]?.id || '',
      employmentType: emp.employmentType || 'FULL_TIME',
      name: emp.name,
      nationalId: emp.nationalId || '',
      birthDate: emp.birthDate || '',
      gender: emp.gender || 'OTHER',
      location: employeeBranches.find((branch) => branch.id === (emp.branchId || employeeBranches[0]?.id))?.name || emp.location,
      role: emp.role,
      phone: emp.phone,
      phone2: emp.phone2 || '',
      email: emp.email,
      address: emp.address || '',
      emergencyContactName: emp.emergencyContactName || '',
      emergencyContactPhone: emp.emergencyContactPhone || '',
      departmentId: emp.departmentId || '',
      managerEmployeeId: emp.managerEmployeeId || '',
      probationStartDate: emp.probationStartDate || '',
      probationEndDate: emp.probationEndDate || '',
      baseSalary: emp.baseSalary,
      salaryType: emp.salaryType,
      salaryPaymentMethod: emp.salaryPaymentMethod || 'CASH',
      bankName: emp.bankName || '',
      bankAccountNumber: emp.bankAccountNumber || '',
      walletProvider: emp.walletProvider || '',
      walletNumber: emp.walletNumber || '',
      socialInsuranceNumber: emp.socialInsuranceNumber || '',
      taxFileNumber: emp.taxFileNumber || '',
      taxExempt: Boolean(emp.taxExempt),
      taxExemptionAmount: Number(emp.taxExemptionAmount) || 0,
      taxDependents: Number(emp.taxDependents) || 0,
      education: emp.education || '',
      previousExperience: emp.previousExperience || '',
      status: emp.status,
      joinedDate: emp.joinedDate,
      notes: emp.notes || '',
    });
    setIsEmployeeModalOpen(true);
  };

  const handleCreateDepartment = () => {
    const name = window.prompt('اسم القسم الجديد:');
    if (!name?.trim()) return;
    try {
      const department = new EmployeeOrganizationService().createDepartment({
        name,
        branchId: empForm.branchId,
      });
      setDepartments((current) => [...current.filter((item) => item.id !== department.id), department]);
      setEmpForm((current) => ({ ...current, departmentId: department.id }));
      setJobTitles(new EmployeeOrganizationService().getJobTitles(department.id));
    } catch (error: any) {
      setEmployeeFormError(error?.message || 'تعذر إنشاء القسم.');
    }
  };

  const handleUpdateDepartment = () => {
    const department = departments.find((item) => item.id === empForm.departmentId);
    if (!department) {
      setEmployeeFormError('اختر قسماً صالحاً لتعديله.');
      return;
    }
    const name = window.prompt('اسم القسم:', department.name);
    if (!name?.trim()) return;
    try {
      const updated = new EmployeeOrganizationService().updateDepartment(department.id, {
        name,
        description: department.description || undefined,
      });
      setDepartments((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (error: any) {
      setEmployeeFormError(error?.message || 'تعذر تعديل القسم.');
    }
  };

  const handleDeactivateDepartment = () => {
    const department = departments.find((item) => item.id === empForm.departmentId);
    if (!department || !window.confirm(`تعطيل القسم «${department.name}»؟ سيظل القسم محفوظاً في السجلات السابقة.`)) return;
    try {
      new EmployeeOrganizationService().deactivateDepartment(department.id);
      setDepartments((current) => current.filter((item) => item.id !== department.id));
      setEmpForm((current) => ({ ...current, departmentId: '' }));
      setJobTitles(new EmployeeOrganizationService().getJobTitles());
    } catch (error: any) {
      setEmployeeFormError(error?.message || 'تعذر تعطيل القسم.');
    }
  };

  const handleCreateJobTitle = () => {
    const title = window.prompt('المسمى الوظيفي الجديد:');
    if (!title?.trim()) return;
    try {
      const jobTitle = new EmployeeOrganizationService().createJobTitle({
        title,
        departmentId: empForm.departmentId || null,
      });
      setJobTitles((current) => [...current.filter((item) => item.id !== jobTitle.id), jobTitle]);
      setEmpForm((current) => ({ ...current, role: jobTitle.title }));
    } catch (error: any) {
      setEmployeeFormError(error?.message || 'تعذر إنشاء المسمى الوظيفي.');
    }
  };

  const handleUpdateJobTitle = () => {
    const jobTitle = jobTitles.find((item) =>
      item.title === empForm.role
      && (item.departmentId === empForm.departmentId || item.departmentId === null)
    );
    if (!jobTitle) {
      setEmployeeFormError('اختر مسمى محفوظاً لتعديله.');
      return;
    }
    const title = window.prompt('المسمى الوظيفي:', jobTitle.title);
    if (!title?.trim()) return;
    try {
      const updated = new EmployeeOrganizationService().updateJobTitle(jobTitle.id, title);
      setJobTitles((current) => current.map((item) => item.id === updated.id ? updated : item));
      setEmpForm((current) => ({ ...current, role: updated.title }));
    } catch (error: any) {
      setEmployeeFormError(error?.message || 'تعذر تعديل المسمى الوظيفي.');
    }
  };

  const handleDeactivateJobTitle = () => {
    const jobTitle = jobTitles.find((item) =>
      item.title === empForm.role
      && (item.departmentId === empForm.departmentId || item.departmentId === null)
    );
    if (!jobTitle || !window.confirm(`تعطيل المسمى «${jobTitle.title}»؟ سيظل محفوظاً في ملفات الموظفين السابقة.`)) return;
    try {
      new EmployeeOrganizationService().deactivateJobTitle(jobTitle.id);
      setJobTitles((current) => current.filter((item) => item.id !== jobTitle.id));
    } catch (error: any) {
      setEmployeeFormError(error?.message || 'تعذر تعطيل المسمى الوظيفي.');
    }
  };

  const handleSaveEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEmployeeSaving) return;
    if (!empForm.name.trim() || !empForm.role.trim()) {
      setEmployeeFormError('اسم الموظف والمسمى الوظيفي مطلوبان.');
      return;
    }
    if (!empForm.branchId) {
      setEmployeeFormError('لا يوجد فرع نشط متاح لحفظ الموظف.');
      return;
    }
    setEmployeeFormError(null);
    setIsEmployeeSaving(true);
    try {
      new OperationalFieldService().validateRecordValues(
        'employees', operationalFieldValues, editingEmployee ? 'update' : 'create', editingEmployee?.id,
      );
      if (editingEmployee) {
        const status = ['RESIGNED', 'TERMINATED'].includes(editingEmployee.status)
          ? undefined
          : empForm.status;
        EmployeeService.update(editingEmployee.id, { ...empForm, status });
        new OperationalFieldService().setRecordValues('employees', editingEmployee.id, operationalFieldValues, 'update');
      } else {
        const created = EmployeeService.create(empForm);
        new OperationalFieldService().setRecordValues('employees', created.id, operationalFieldValues, 'create');
      }
      setOperationalFieldValues({});
      setIsEmployeeModalOpen(false);
      loadAll();
    } catch (err: any) {
      setEmployeeFormError(err?.message || 'تعذر حفظ بيانات الموظف.');
    } finally {
      setIsEmployeeSaving(false);
    }
  };

  const handleCloseEmployeeForm = () => {
    if (isEmployeeSaving) return;
    setEmployeeFormError(null);
    setIsEmployeeModalOpen(false);
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

  const handleUpdateAttendance = (empId: string, status: AttendanceRecord['status']) => {
    try {
      const result = EmployeeService.upsertAttendance({
        employeeId: empId,
        date: attendanceDate,
        status,
        recordedBy: AuthService.getCurrentUser()?.id || 'usr_admin',
      });
      if (result.pendingApproval) alert('أُرسل تعديل الحضور للموافقة، ولن يتغير السجل قبل اعتماده.');
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

  const filteredEmployees = filterEmployees(employees, searchQuery, selectedLocation)
    .filter((employee) => matchesOperationalFieldFilters(employee.id, valuesByEmployee, fieldFilters));
  const employeeLocations = [...new Set([
    ...employees.map((employee) => employee.location).filter(Boolean),
  ])];

  // --- Reports calculations ---
  const totalWagesBill = calculateTotalWagesBill(employees);

  const txEmployeeName = employees.find(e => e.id === selectedEmpForTx)?.name;
  const historyEmployeeName = employees.find(e => e.id === selectedEmpForHistory)?.name;
  const historyTransactions = isHistoryModalOpen
    ? transactions.filter(t => t.employeeId === selectedEmpForHistory && t.date.slice(0, 7) === payrollPeriod)
    : [];
  const historyNetDue = isHistoryModalOpen
    ? getEmployeeFinancials(employees, transactions, selectedEmpForHistory, payrollPeriod).netDue
    : 0;

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">

      <EmployeesHeader
        loading={loading}
        dbError={dbError}
        onAddEmployee={handleOpenAddEmployee}
        onRetry={loadAll}
        canExport={canExportEmployees}
        onExport={handleExportEmployees}
      />
      {activeTab === 'directory' && <div className="px-4 pb-2"><OperationalFieldsFilter fields={operationalFields} values={fieldFilters} onChange={setFieldFilters} /></div>}

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
          locations={employeeLocations}
        />

        {/* Tab Content Panels */}
        <div className="flex-1 overflow-y-auto p-4">

          {/* TAB 1: DIRECTORY (دليل العمال وتوزيعهم) */}
          {activeTab === 'directory' && (
            <EmployeeDirectoryTab
              employees={filteredEmployees}
              canManageEmployees={canManageEmployees}
              operationalFields={operationalFields}
              operationalValuesByRecord={valuesByEmployee}
              onSaveOperationalFields={(employeeId, values) => {
                new OperationalFieldService().setRecordValues('employees', employeeId, values, 'update');
                setValuesByEmployee((previous) => ({ ...previous, [employeeId]: values }));
              }}
              onEditEmployee={handleOpenEditEmployee}
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
              locations={employeeLocations}
            />
          )}

        </div>
      </div>

      {/* --- MODAL 1: ADD / EDIT EMPLOYEE --- */}
      <EmployeeFormModal
        open={isEmployeeModalOpen}
        editingEmployee={editingEmployee}
        form={empForm}
        branches={employeeBranches}
        departments={departments.filter((department) =>
          !department.branchId || department.branchId === empForm.branchId
        )}
        jobTitles={jobTitles}
        managers={employees.filter((employee) =>
          employee.id !== editingEmployee?.id
          && employee.branchId === empForm.branchId
          && ['ACTIVE', 'PROBATION', 'ON_LEAVE'].includes(employee.status)
        )}
        isSaving={isEmployeeSaving}
        error={employeeFormError}
        onFormChange={setEmpForm}
        onClose={handleCloseEmployeeForm}
        onSubmit={handleSaveEmployee}
        operationalFields={operationalFields}
        operationalFieldValues={operationalFieldValues}
        onOperationalFieldValuesChange={setOperationalFieldValues}
        onDepartmentChange={(departmentId) => {
          setJobTitles(new EmployeeOrganizationService().getJobTitles(departmentId || undefined));
        }}
        onCreateDepartment={handleCreateDepartment}
        onUpdateDepartment={handleUpdateDepartment}
        onDeactivateDepartment={handleDeactivateDepartment}
        onCreateJobTitle={handleCreateJobTitle}
        onUpdateJobTitle={handleUpdateJobTitle}
        onDeactivateJobTitle={handleDeactivateJobTitle}
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
        period={payrollPeriod}
        transactions={historyTransactions}
        netDue={historyNetDue}
        onClose={() => setIsHistoryModalOpen(false)}
        onDeleteTransaction={handleDeleteTransaction}
      />

    </div>
  );
};
