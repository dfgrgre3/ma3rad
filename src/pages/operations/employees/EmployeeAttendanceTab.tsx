import React from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { Link } from 'react-router-dom';
import { countAttendanceByStatus } from './helpers';
import type { AttendanceRecord, Employee } from '../../../types/hr/employeesPage';

interface EmployeeAttendanceTabProps {
  employees: Employee[];
  allEmployees: Employee[];
  attendance: AttendanceRecord[];
  attendanceDate: string;
  onUpdateAttendance: (empId: string, status: AttendanceRecord['status']) => void;
  onAttendanceNotesChange: (empId: string, status: AttendanceRecord['status'] | undefined, notes: string) => void;
}

export const EmployeeAttendanceTab: React.FC<EmployeeAttendanceTabProps> = ({
  employees,
  allEmployees,
  attendance,
  attendanceDate,
  onUpdateAttendance,
  onAttendanceNotesChange,
}) => {
  return (
    <div className="space-y-4">
      <div className="bg-surface border border-line rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-black text-ink">تسجيل دفتر حضور يوم {attendanceDate}</h3>
          <p className="text-xs text-muted mt-1">تسجيل الوقت والورديات والاستراحات وإدارة طلبات التصحيح من سجل الحضور والانصراف.</p>
        </div>
        <Link to="/employees/attendance" className="text-xs font-bold text-primary bg-accent-soft border border-accent-border rounded-lg px-3 py-2">
          فتح سجل الوقت والورديات
        </Link>

        {/* Attendance Summary */}
        <div className="flex gap-4">
          <div className="text-center bg-surface-muted px-4 py-2 rounded-lg border border-line">
            <span className="text-[10px] text-muted block font-bold">حاضر</span>
            <span className="text-base font-black text-success">
              {countAttendanceByStatus(allEmployees, attendance, attendanceDate, 'PRESENT')}
            </span>
          </div>
          <div className="text-center bg-surface-muted px-4 py-2 rounded-lg border border-line">
            <span className="text-[10px] text-muted block font-bold">متأخر</span>
            <span className="text-base font-black text-warning">
              {countAttendanceByStatus(allEmployees, attendance, attendanceDate, 'LATE')}
            </span>
          </div>
          <div className="text-center bg-surface-muted px-4 py-2 rounded-lg border border-line">
            <span className="text-[10px] text-muted block font-bold">غائب</span>
            <span className="text-base font-black text-danger">
              {countAttendanceByStatus(allEmployees, attendance, attendanceDate, 'ABSENT')}
            </span>
          </div>
        </div>
      </div>

      {/* Attendance Table */}
      <div className="bg-surface border border-line rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <DataTable
            ariaLabel="حضور الموظفين"
            rows={employees}
            rowKey={(emp: any) => String(emp.id)}
            tableClassName="border-collapse text-sm"
            rowClassName={() => 'transition hover:bg-surface-sunken'}
            columns={[
              {
                key: 'emp', header: 'العامل ومقر العمل',
                render: (emp: any) => (
                  <span className="block font-bold text-ink">
                    {emp.name}
                    <span className="block text-[10px] font-medium text-muted">{emp.location}</span>
                  </span>
                ),
              },
              { key: 'role', header: 'المسمى الوظيفي', render: (emp: any) => <span className="text-xs font-semibold text-muted">{emp.role}</span> },
              {
                key: 'status', header: 'حالة الحضور', align: 'center',
                render: (emp: any) => {
                  const record = attendance.find(a => a.date === attendanceDate && a.employeeId === emp.id);
                  const status = record?.status;
                  return (
                    <span className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => onUpdateAttendance(emp.id, 'PRESENT')}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-all ${status === 'PRESENT' ? 'border-success bg-success text-white' : 'bg-surface-muted text-muted hover:bg-surface-muted'}`}
                      >
                        حاضر
                      </button>
                      <button
                        onClick={() => onUpdateAttendance(emp.id, 'LATE')}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-all ${status === 'LATE' ? 'border-warning bg-warning text-white' : 'bg-surface-muted text-muted hover:bg-surface-muted'}`}
                      >
                        متأخر
                      </button>
                      <button
                        onClick={() => onUpdateAttendance(emp.id, 'ABSENT')}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-all ${status === 'ABSENT' ? 'border-danger bg-danger text-white' : 'bg-surface-muted text-muted hover:bg-surface-muted'}`}
                      >
                        غائب
                      </button>
                      <button
                        onClick={() => onUpdateAttendance(emp.id, 'LEAVE')}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-all ${status === 'LEAVE' ? 'border-primary bg-primary text-white' : 'bg-surface-muted text-muted hover:bg-surface-muted'}`}
                      >
                        إجازة
                      </button>
                    </span>
                  );
                },
              },
              {
                key: 'notes', header: 'ملاحظات اليوم',
                render: (emp: any) => {
                  const record = attendance.find(a => a.date === attendanceDate && a.employeeId === emp.id);
                  const status = record?.status;
                  return (
                    <input
                      type="text"
                      placeholder="أضف ملاحظة (مثال: تأخير إذن، عذر طبي)..."
                      value={record?.notes || ''}
                      onChange={(e) => onAttendanceNotesChange(emp.id, status, e.target.value)}
                      className="w-full rounded-lg border border-line bg-surface-muted px-2.5 py-1 text-xs text-ink placeholder-muted focus:border-line-strong focus:outline-none"
                    />
                  );
                },
              },
            ]}
            emptyTitle="لا يوجد موظفون متاحون للتسجيل."
          />
        </div>
      </div>
    </div>
  );
};
