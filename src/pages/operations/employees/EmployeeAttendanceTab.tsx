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
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-black text-slate-900">تسجيل دفتر حضور يوم {attendanceDate}</h3>
          <p className="text-xs text-slate-500 mt-1">تسجيل الوقت والورديات والاستراحات وإدارة طلبات التصحيح من سجل الحضور والانصراف.</p>
        </div>
        <Link to="/employees/attendance" className="text-xs font-bold text-sky-700 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2">
          فتح سجل الوقت والورديات
        </Link>

        {/* Attendance Summary */}
        <div className="flex gap-4">
          <div className="text-center bg-slate-50 px-4 py-2 rounded-lg border border-slate-200">
            <span className="text-[10px] text-slate-500 block font-bold">حاضر</span>
            <span className="text-base font-black text-emerald-600">
              {countAttendanceByStatus(allEmployees, attendance, attendanceDate, 'PRESENT')}
            </span>
          </div>
          <div className="text-center bg-slate-50 px-4 py-2 rounded-lg border border-slate-200">
            <span className="text-[10px] text-slate-500 block font-bold">متأخر</span>
            <span className="text-base font-black text-amber-600">
              {countAttendanceByStatus(allEmployees, attendance, attendanceDate, 'LATE')}
            </span>
          </div>
          <div className="text-center bg-slate-50 px-4 py-2 rounded-lg border border-slate-200">
            <span className="text-[10px] text-slate-500 block font-bold">غائب</span>
            <span className="text-base font-black text-rose-600">
              {countAttendanceByStatus(allEmployees, attendance, attendanceDate, 'ABSENT')}
            </span>
          </div>
        </div>
      </div>

      {/* Attendance Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <DataTable
            ariaLabel="حضور الموظفين"
            rows={employees}
            rowKey={(emp: any) => String(emp.id)}
            tableClassName="border-collapse text-sm"
            rowClassName={() => 'transition hover:bg-slate-100'}
            columns={[
              {
                key: 'emp', header: 'العامل ومقر العمل',
                render: (emp: any) => (
                  <span className="block font-bold text-slate-900">
                    {emp.name}
                    <span className="block text-[10px] font-medium text-slate-500">{emp.location}</span>
                  </span>
                ),
              },
              { key: 'role', header: 'المسمى الوظيفي', render: (emp: any) => <span className="text-xs font-semibold text-slate-500">{emp.role}</span> },
              {
                key: 'status', header: 'حالة الحضور', align: 'center',
                render: (emp: any) => {
                  const record = attendance.find(a => a.date === attendanceDate && a.employeeId === emp.id);
                  const status = record?.status;
                  return (
                    <span className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => onUpdateAttendance(emp.id, 'PRESENT')}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-all ${status === 'PRESENT' ? 'border-emerald-500 bg-emerald-600 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-50'}`}
                      >
                        حاضر
                      </button>
                      <button
                        onClick={() => onUpdateAttendance(emp.id, 'LATE')}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-all ${status === 'LATE' ? 'border-amber-500 bg-amber-600 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-50'}`}
                      >
                        متأخر
                      </button>
                      <button
                        onClick={() => onUpdateAttendance(emp.id, 'ABSENT')}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-all ${status === 'ABSENT' ? 'border-rose-500 bg-rose-600 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-50'}`}
                      >
                        غائب
                      </button>
                      <button
                        onClick={() => onUpdateAttendance(emp.id, 'LEAVE')}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-all ${status === 'LEAVE' ? 'border-sky-500 bg-sky-600 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-50'}`}
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
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-800 placeholder-slate-400 focus:border-slate-300 focus:outline-none"
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
