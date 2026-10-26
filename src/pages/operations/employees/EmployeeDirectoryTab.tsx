import React from 'react';
import { AlertCircle, Calendar, DollarSign, Edit3, FileText, Mail, MapPin, Phone, Trash2 } from 'lucide-react';
import { fmtCurrency } from './helpers';
import { STATUS_LABELS, type Employee } from './types';

interface EmployeeDirectoryTabProps {
  employees: Employee[];
  canManageEmployees: boolean;
  onEditEmployee: (emp: Employee) => void;
  onDeleteEmployee: (id: string) => void;
  onOpenHistory: (empId: string) => void;
}

export const EmployeeDirectoryTab: React.FC<EmployeeDirectoryTabProps> = ({
  employees,
  canManageEmployees,
  onEditEmployee,
  onDeleteEmployee,
  onOpenHistory,
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {employees.map((emp) => {
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
                  onClick={() => onEditEmployee(emp)}
                  className="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-700 hover:text-orange-600 transition"
                  title="تعديل بيانات العامل"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onDeleteEmployee(emp.id)}
                  className="p-2 bg-rose-950/20 hover:bg-rose-950/40 border border-rose-500/10 rounded-lg text-rose-600 hover:text-rose-600 transition"
                  title="حذف العامل"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                onClick={() => onOpenHistory(emp.id)}
                className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 transition flex items-center gap-1"
              >
                <FileText className="w-3.5 h-3.5 text-slate-500" />
                السجل المالي
              </button>
            </div>
          </div>
        );
      })}
      {employees.length === 0 && (
        <div className="col-span-full py-12 flex flex-col items-center justify-center text-slate-500 bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
          <AlertCircle className="w-10 h-10 mb-2 text-slate-600" />
          <p className="text-sm font-bold">لا يوجد عمال يطابقون خيارات البحث الحالية.</p>
        </div>
      )}
    </div>
  );
};
