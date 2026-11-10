import React from 'react';
import type { Employee, EmployeeFormState } from '../../../types/hr/employeesPage';
import type { OperationalFieldDefinition } from '../../../services/domains/products/OperationalFieldService';
import { OperationalFieldsForm } from '../../../components/products/OperationalFieldsForm';

interface EmployeeBranchOption {
  id: string;
  name: string;
}

interface DepartmentOption {
  id: string;
  name: string;
  description?: string | null;
}

interface JobTitleOption {
  id: string;
  title: string;
}

interface EmployeeFormModalProps {
  open: boolean;
  editingEmployee: Employee | null;
  form: EmployeeFormState;
  branches: EmployeeBranchOption[];
  departments: DepartmentOption[];
  jobTitles: JobTitleOption[];
  managers: Employee[];
  isSaving: boolean;
  error: string | null;
  onFormChange: React.Dispatch<React.SetStateAction<EmployeeFormState>>;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  operationalFields: OperationalFieldDefinition[];
  operationalFieldValues: Record<string, string>;
  onOperationalFieldValuesChange: (values: Record<string, string>) => void;
  onDepartmentChange: (departmentId: string) => void;
  onCreateDepartment: () => void;
  onUpdateDepartment: () => void;
  onDeactivateDepartment: () => void;
  onCreateJobTitle: () => void;
  onUpdateJobTitle: () => void;
  onDeactivateJobTitle: () => void;
}

const fieldClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 disabled:cursor-not-allowed disabled:bg-slate-100';
const labelClass = 'mb-1.5 block text-xs font-bold text-slate-600';

export const EmployeeFormModal: React.FC<EmployeeFormModalProps> = ({
  open,
  editingEmployee,
  form,
  branches,
  departments,
  jobTitles,
  managers,
  isSaving,
  error,
  onFormChange,
  onClose,
  onSubmit,
  operationalFields,
  operationalFieldValues,
  onOperationalFieldValuesChange,
  onDepartmentChange,
  onCreateDepartment,
  onUpdateDepartment,
  onDeactivateDepartment,
  onCreateJobTitle,
  onUpdateJobTitle,
  onDeactivateJobTitle,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" dir="rtl">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="employee-form-title"
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4 sm:px-6">
          <div>
            <h2 id="employee-form-title" className="text-base font-black text-slate-900">
              {editingEmployee ? 'تعديل بيانات العامل / الموظف' : 'إضافة عامل / موظف جديد'}
            </h2>
            <p className="mt-1 text-xs text-slate-500">تُستخدم البيانات في سجل الموظفين والدوام والرواتب.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="rounded-lg px-3 py-2 text-xs font-bold text-slate-500 transition hover:bg-slate-200 hover:text-slate-900 disabled:opacity-50"
          >
            إغلاق
          </button>
        </header>

        <form onSubmit={onSubmit} className="overflow-y-auto p-5 sm:p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="sm:col-span-1">
              <span className={labelClass}>الاسم بالكامل *</span>
              <input
                type="text"
                required
                maxLength={120}
                autoComplete="name"
                value={form.name}
                onChange={(e) => onFormChange((prev) => ({ ...prev, name: e.target.value }))}
                className={fieldClass}
                placeholder="مثال: أحمد محمد علي"
              />
              {editingEmployee?.code && (
                <span className="mt-1 block font-mono text-[11px] text-slate-500">كود الموظف: {editingEmployee.code}</span>
              )}
            </label>

            <label>
              <span className={labelClass}>الرقم القومي / الهوية</span>
              <input
                type="text"
                maxLength={24}
                value={form.nationalId}
                onChange={(e) => onFormChange((prev) => ({ ...prev, nationalId: e.target.value }))}
                className={fieldClass}
                autoComplete="off"
              />
            </label>

            <label>
              <span className={labelClass}>تاريخ الميلاد</span>
              <input type="date" value={form.birthDate}
                onChange={(e) => onFormChange((prev) => ({ ...prev, birthDate: e.target.value }))}
                className={fieldClass} />
            </label>

            <label>
              <span className={labelClass}>النوع</span>
              <select value={form.gender}
                onChange={(e) => onFormChange((prev) => ({ ...prev, gender: e.target.value as EmployeeFormState['gender'] }))}
                className={fieldClass}>
                <option value="OTHER">غير محدد</option>
                <option value="MALE">ذكر</option>
                <option value="FEMALE">أنثى</option>
              </select>
            </label>

            <label>
              <span className={labelClass}>رقم الهاتف *</span>
              <input
                type="tel"
                required
                maxLength={20}
                autoComplete="tel"
                value={form.phone}
                onChange={(e) => onFormChange((prev) => ({ ...prev, phone: e.target.value }))}
                className={fieldClass}
                placeholder="01xxxxxxxxx"
              />
            </label>

            <label>
              <span className={labelClass}>البريد الإلكتروني</span>
              <input
                type="email"
                maxLength={254}
                autoComplete="email"
                value={form.email}
                onChange={(e) => onFormChange((prev) => ({ ...prev, email: e.target.value }))}
                className={fieldClass}
                placeholder="name@company.com"
              />
            </label>
            <label>
              <span className={labelClass}>الهاتف البديل</span>
              <input type="tel" maxLength={20} autoComplete="tel"
                value={form.phone2}
                onChange={(e) => onFormChange((prev) => ({ ...prev, phone2: e.target.value }))}
                className={fieldClass} />
            </label>
            <label className="sm:col-span-2">
              <span className={labelClass}>العنوان</span>
              <input type="text" maxLength={250} autoComplete="street-address"
                value={form.address}
                onChange={(e) => onFormChange((prev) => ({ ...prev, address: e.target.value }))}
                className={fieldClass} />
            </label>
            <label>
              <span className={labelClass}>جهة اتصال الطوارئ</span>
              <input type="text" maxLength={120} value={form.emergencyContactName}
                onChange={(e) => onFormChange((prev) => ({ ...prev, emergencyContactName: e.target.value }))}
                className={fieldClass} />
            </label>
            <label>
              <span className={labelClass}>هاتف الطوارئ</span>
              <input type="tel" maxLength={20} value={form.emergencyContactPhone}
                onChange={(e) => onFormChange((prev) => ({ ...prev, emergencyContactPhone: e.target.value }))}
                className={fieldClass} />
            </label>
          </div>

          <section className="mt-5 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <h3 className="mb-3 text-xs font-black text-slate-700">البيانات الوظيفية والهيكل التنظيمي</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label>
                <span className={labelClass}>المسمى الوظيفي *</span>
                <input type="text" required maxLength={100} list="employee-job-titles"
                  value={form.role}
                  onChange={(e) => onFormChange((prev) => ({ ...prev, role: e.target.value }))}
                  className={fieldClass} placeholder="اختر أو أدخل مسمى وظيفياً" />
                <datalist id="employee-job-titles">
                  {jobTitles.map((jobTitle) => <option key={jobTitle.id} value={jobTitle.title} />)}
                </datalist>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  <button type="button" className="text-[11px] font-bold text-sky-700" onClick={onCreateJobTitle}>+ إضافة مسمى</button>
                  <button type="button" className="text-[11px] font-bold text-slate-600" onClick={onUpdateJobTitle}>تعديل المحفوظ</button>
                  <button type="button" className="text-[11px] font-bold text-rose-700" onClick={onDeactivateJobTitle}>تعطيل المحفوظ</button>
                </div>
              </label>
              <label>
                <span className={labelClass}>القسم</span>
                <select value={form.departmentId} disabled={isSaving}
                  onChange={(e) => {
                    onFormChange((prev) => ({ ...prev, departmentId: e.target.value }));
                    onDepartmentChange(e.target.value);
                  }}
                  className={fieldClass}>
                  <option value="">بدون قسم</option>
                  {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                </select>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  <button type="button" className="text-[11px] font-bold text-sky-700" onClick={onCreateDepartment}>+ إضافة قسم</button>
                  <button type="button" className="text-[11px] font-bold text-slate-600" onClick={onUpdateDepartment}>تعديل المحدد</button>
                  <button type="button" className="text-[11px] font-bold text-rose-700" onClick={onDeactivateDepartment}>تعطيل المحدد</button>
                </div>
              </label>
              <label>
                <span className={labelClass}>المدير المباشر</span>
                <select value={form.managerEmployeeId} disabled={isSaving}
                  onChange={(e) => onFormChange((prev) => ({ ...prev, managerEmployeeId: e.target.value }))}
                  className={fieldClass}>
                  <option value="">بدون مدير مباشر</option>
                  {managers.map((manager) => <option key={manager.id} value={manager.id}>{manager.name} — {manager.role}</option>)}
                </select>
              </label>
              <label>
                <span className={labelClass}>موقع العمل / الفرع *</span>
                <select required value={form.branchId} disabled={!branches.length || isSaving}
                  onChange={(e) => {
                    const branch = branches.find((item) => item.id === e.target.value);
                    onFormChange((prev) => ({
                      ...prev, branchId: e.target.value, location: branch?.name || prev.location,
                      departmentId: '', managerEmployeeId: '',
                    }));
                    onDepartmentChange('');
                  }}
                  className={fieldClass}>
                  {!branches.length && <option value="">لا يوجد فرع نشط متاح</option>}
                  {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </select>
              </label>
              <label>
                <span className={labelClass}>نوع التوظيف *</span>
                <select required value={form.employmentType}
                  onChange={(e) => onFormChange((prev) => ({ ...prev, employmentType: e.target.value as EmployeeFormState['employmentType'] }))}
                  className={fieldClass}>
                  <option value="FULL_TIME">دوام كامل</option><option value="PART_TIME">دوام جزئي</option>
                  <option value="CONTRACT">تعاقد</option><option value="TEMPORARY">مؤقت</option>
                </select>
              </label>
              <label>
                <span className={labelClass}>الحالة الوظيفية *</span>
                {['RESIGNED', 'TERMINATED'].includes(form.status) ? (
                  <p className={`${fieldClass} bg-slate-100`}>
                    {form.status === 'RESIGNED' ? 'مستقيل' : 'منتهية خدمته'} — تُدار الحالة من دورة إنهاء الخدمة
                  </p>
                ) : (
                  <select value={form.status}
                    onChange={(e) => onFormChange((prev) => ({ ...prev, status: e.target.value as Employee['status'] }))}
                    className={fieldClass}>
                    <option value="PROBATION">تحت الاختبار</option><option value="ACTIVE">على رأس العمل</option>
                    <option value="ON_LEAVE">في إجازة</option><option value="SUSPENDED">موقوف مؤقتاً</option>
                  </select>
                )}
              </label>
              <label>
                <span className={labelClass}>تاريخ بداية الاختبار</span>
                <input type="date" value={form.probationStartDate}
                  onChange={(e) => onFormChange((prev) => ({ ...prev, probationStartDate: e.target.value }))}
                  className={fieldClass} />
              </label>
              <label>
                <span className={labelClass}>تاريخ نهاية الاختبار</span>
                <input type="date" value={form.probationEndDate}
                  onChange={(e) => onFormChange((prev) => ({ ...prev, probationEndDate: e.target.value }))}
                  className={fieldClass} />
              </label>
            </div>
            {editingEmployee?.terminatedAt && (
              <p className="mt-3 text-xs text-slate-500">تاريخ انتهاء الخدمة: {editingEmployee.terminatedAt} (يُدار من دورة إنهاء العقد)</p>
            )}
          </section>

          <section className="mt-5 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <h3 className="mb-3 text-xs font-black text-slate-700">بيانات الأجر والتعيين</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <label>
                <span className={labelClass}>الراتب / الأجر الأساسي *</span>
                <input
                  type="number"
                  required
                  min={0}
                  step="0.01"
                  value={form.baseSalary}
                  onChange={(e) => onFormChange((prev) => ({ ...prev, baseSalary: e.target.value === '' ? 0 : Number(e.target.value) }))}
                  className={fieldClass}
                />
              </label>

              <label>
                <span className={labelClass}>دورة احتساب الأجر *</span>
                <select
                  value={form.salaryType}
                  onChange={(e) => onFormChange((prev) => ({ ...prev, salaryType: e.target.value as Employee['salaryType'] }))}
                  className={fieldClass}
                >
                  <option value="MONTHLY">شهرياً (ثابت)</option>
                  <option value="DAILY">يومي (يوميات)</option>
                </select>
              </label>

              <label>
                <span className={labelClass}>طريقة صرف الراتب</span>
                <select value={form.salaryPaymentMethod}
                  onChange={(e) => onFormChange((prev) => ({ ...prev, salaryPaymentMethod: e.target.value as EmployeeFormState['salaryPaymentMethod'] }))}
                  className={fieldClass}>
                  <option value="CASH">نقداً</option><option value="BANK_TRANSFER">تحويل بنكي</option><option value="WALLET">محفظة إلكترونية</option>
                </select>
              </label>

              <label>
                <span className={labelClass}>تاريخ الالتحاق *</span>
                <input
                  type="date"
                  required
                  value={form.joinedDate}
                  onChange={(e) => onFormChange((prev) => ({ ...prev, joinedDate: e.target.value }))}
                  className={fieldClass}
                />
              </label>

              <label><span className={labelClass}>اسم البنك</span>
                <input type="text" maxLength={100} value={form.bankName}
                  onChange={(e) => onFormChange((prev) => ({ ...prev, bankName: e.target.value }))}
                  className={fieldClass} /></label>
              <label><span className={labelClass}>رقم الحساب / IBAN</span>
                <input type="text" maxLength={34} autoComplete="off" value={form.bankAccountNumber}
                  onChange={(e) => onFormChange((prev) => ({ ...prev, bankAccountNumber: e.target.value }))}
                  className={fieldClass} /></label>
              <label><span className={labelClass}>رقم التأمينات الاجتماعية</span>
                <input type="text" maxLength={40} value={form.socialInsuranceNumber}
                  onChange={(e) => onFormChange((prev) => ({ ...prev, socialInsuranceNumber: e.target.value }))}
                  className={fieldClass} /></label>
              <label><span className={labelClass}>رقم الملف الضريبي</span>
                <input type="text" maxLength={40} value={form.taxFileNumber}
                  onChange={(e) => onFormChange((prev) => ({ ...prev, taxFileNumber: e.target.value }))}
                  className={fieldClass} /></label>
            </div>
          </section>

          <section className="mt-5 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <h3 className="mb-3 text-xs font-black text-slate-700">المؤهل والخبرات</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <label><span className={labelClass}>المؤهل الدراسي</span>
                <textarea rows={2} maxLength={1000} value={form.education}
                  onChange={(e) => onFormChange((prev) => ({ ...prev, education: e.target.value }))}
                  className={`${fieldClass} resize-y`} /></label>
              <label><span className={labelClass}>الخبرات السابقة</span>
                <textarea rows={2} maxLength={2000} value={form.previousExperience}
                  onChange={(e) => onFormChange((prev) => ({ ...prev, previousExperience: e.target.value }))}
                  className={`${fieldClass} resize-y`} /></label>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">أضف الهوية والشهادات والمستندات الرسمية من وحدة مستندات الموظفين.</p>
          </section>
          <div className="mt-4"><OperationalFieldsForm fields={operationalFields} values={operationalFieldValues} onChange={onOperationalFieldValuesChange} title="بيانات إضافية للموظف" /></div>

          <label className="mt-4 block">
            <span className={labelClass}>ملاحظات</span>
            <textarea
              rows={3}
              maxLength={1000}
              value={form.notes}
              onChange={(e) => onFormChange((prev) => ({ ...prev, notes: e.target.value }))}
              className={`${fieldClass} resize-y`}
              placeholder="ملاحظات إدارية أو تفاصيل إضافية..."
            />
          </label>

          {!branches.length && (
            <p role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
              لا يمكن حفظ الموظف قبل اختيار فرع نشط متاح.
            </p>
          )}
          {error && (
            <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
              {error}
            </p>
          )}

          <footer className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isSaving || !branches.length}
              className="rounded-lg bg-orange-700 px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-orange-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? 'جارٍ الحفظ...' : editingEmployee ? 'حفظ التغييرات' : 'إضافة الموظف'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
};
