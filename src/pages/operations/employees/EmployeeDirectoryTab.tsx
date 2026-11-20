import React from 'react';
import { AlertCircle, Calendar, DollarSign, Edit3, FileText, Mail, MapPin, Phone } from 'lucide-react';
import { fmtCurrency } from './helpers';
import { STATUS_LABELS, type Employee } from '../../../types/hr/employeesPage';
import type { OperationalFieldDefinition } from '../../../services/domains/products/OperationalFieldService';
import { OperationalFieldsSummary } from '../../../components/products/OperationalFieldsSummary';
import { OperationalFieldsRecordEditor } from '../../../components/products/OperationalFieldsRecordEditor';

interface EmployeeDirectoryTabProps {
  employees: Employee[];
  canManageEmployees: boolean;
  onEditEmployee: (emp: Employee) => void;
  onOpenHistory: (empId: string) => void;
  operationalFields: OperationalFieldDefinition[];
  operationalValuesByRecord: Record<string, Record<string, string>>;
  onSaveOperationalFields: (employeeId: string, values: Record<string, string>) => void;
}

export const EmployeeDirectoryTab: React.FC<EmployeeDirectoryTabProps> = ({
  employees,
  canManageEmployees,
  onEditEmployee,
  onOpenHistory,
  operationalFields,
  operationalValuesByRecord,
  onSaveOperationalFields,
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {employees.map((emp) => {
        const st = STATUS_LABELS[emp.status];
        return (
          <div
            key={emp.id}
            className="bg-surface border border-line hover:border-line-strong/80 rounded-xl p-5 transition flex flex-col justify-between group relative overflow-hidden"
          >
            {/* Visual location glow indicator */}
            <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-l from-warning via-warning to-transparent opacity-60" />

            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] px-2.5 py-1 rounded-lg bg-warning/40 text-warning font-bold border border-warning/20 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  {emp.location}
                </span>
                <span className="flex items-center gap-1.5">
                  {emp.isSalesRep && (
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full font-bold border bg-warning/10 text-warning border-warning/25"
                      title={emp.additionalBranchIds?.length ? `يخدم ${emp.additionalBranchIds.length + 1} فروع` : 'مندوب مبيعات'}
                    >
                      مندوب{emp.additionalBranchIds?.length ? ` · ${emp.additionalBranchIds.length + 1} فروع` : ''}
                    </span>
                  )}
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${st.color}`}>
                    {st.label}
                  </span>
                </span>
              </div>
              <OperationalFieldsSummary fields={operationalFields} values={operationalValuesByRecord[emp.id] || {}} />
              <OperationalFieldsRecordEditor
                recordLabel={emp.name}
                fields={operationalFields}
                initialValues={operationalValuesByRecord[emp.id] || {}}
                canEdit={canManageEmployees}
                onSave={(values) => onSaveOperationalFields(emp.id, values)}
              />

              <h3 className="font-extrabold text-ink group-hover:text-warning transition mb-1 text-base">{emp.name}</h3>
              <div className="text-xs text-muted font-bold mb-3">{emp.role}</div>

              <div className="space-y-2 text-xs text-muted border-t border-line pt-3">
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-ink" />
                  <a href={`tel:${emp.phone}`} className="text-muted hover:text-warning transition">{emp.phone}</a>
                </div>
                {emp.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-ink" />
                    <a href={`mailto:${emp.email}`} className="text-muted hover:text-warning transition">{emp.email}</a>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-ink" />
                  <span>تاريخ التعيين: <span className="text-ink font-medium">{emp.joinedDate}</span></span>
                </div>
                <div className="flex items-center gap-2">
                  <DollarSign className="w-3.5 h-3.5 text-ink" />
                  <span>
                    {canManageEmployees ? (
                      <>الأجر الأساسي: <span className="text-success font-bold">{fmtCurrency(emp.baseSalary)}</span>
                        <span className="text-[10px] text-muted"> ({emp.salaryType === 'MONTHLY' ? 'شهرياً' : 'يومي'})</span></>
                    ) : 'بيانات الراتب محمية'}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-line flex justify-between items-center">
              <div className="flex gap-1.5">
                <button
                  onClick={() => onEditEmployee(emp)}
                  className="p-2 bg-surface-muted hover:bg-surface-sunken border border-line rounded-lg text-ink hover:text-warning transition"
                  title="تعديل بيانات العامل"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                onClick={() => onOpenHistory(emp.id)}
                className="px-3 py-1.5 bg-surface-muted hover:bg-surface-sunken border border-line rounded-lg text-xs font-bold text-ink transition flex items-center gap-1"
              >
                <FileText className="w-3.5 h-3.5 text-muted" />
                السجل المالي
              </button>
            </div>
          </div>
        );
      })}
      {employees.length === 0 && (
        <div className="col-span-full py-12 flex flex-col items-center justify-center text-muted bg-surface-muted border border-dashed border-line rounded-2xl">
          <AlertCircle className="w-10 h-10 mb-2 text-ink-secondary" />
          <p className="text-sm font-bold">لا يوجد عمال يطابقون خيارات البحث الحالية.</p>
        </div>
      )}
    </div>
  );
};
