import React from 'react';
import { countAttendanceByStatus } from './helpers';
import type { AttendanceRecord, Employee } from './types';

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
          <p className="text-xs text-slate-500 mt-1">قم بتحديد حضور وغياب العمال لتحديث كشف الرواتب تلقائياً وحساب اليوميات بدقة</p>
        </div>

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
              {employees.map(emp => {
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
                          onClick={() => onUpdateAttendance(emp.id, 'PRESENT')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${status === 'PRESENT'
 ? 'bg-emerald-600 border-emerald-500 text-white'
 : 'bg-slate-50 hover:bg-slate-50 text-slate-500'
 }`}
                        >
                          حاضر
                        </button>
                        <button
                          onClick={() => onUpdateAttendance(emp.id, 'LATE')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${status === 'LATE'
 ? 'bg-amber-600 border-amber-500 text-white'
 : 'bg-slate-50 hover:bg-slate-50 text-slate-500'
 }`}
                        >
                          متأخر
                        </button>
                        <button
                          onClick={() => onUpdateAttendance(emp.id, 'ABSENT')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${status === 'ABSENT'
 ? 'bg-rose-600 border-rose-500 text-white'
 : 'bg-slate-50 hover:bg-slate-50 text-slate-500'
 }`}
                        >
                          غائب
                        </button>
                        <button
                          onClick={() => onUpdateAttendance(emp.id, 'LEAVE')}
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
                        onChange={(e) => onAttendanceNotesChange(emp.id, status, e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-slate-300 text-xs"
                      />
                    </td>
                  </tr>
                );
              })}
              {employees.length === 0 && (
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
  );
};
