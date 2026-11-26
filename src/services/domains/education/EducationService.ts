import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { PermissionService } from '../auth/PermissionService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import { localDateString } from '../../../utils/shared/date';
import { round2 } from '../finance/financials';

export type EnrollmentStatus = 'ENROLLED' | 'ACTIVE' | 'COMPLETED' | 'WITHDRAWN' | 'SUSPENDED';
export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
export type FeeStatus = 'PENDING' | 'PAID' | 'PARTIAL' | 'WAIVED' | 'OVERDUE';

export interface EduClass {
  id: string; branchId: string | null; name: string; subject: string | null;
  teacherId: string | null; teacherName: string | null; capacity: number;
  academicYear: string | null; isActive: number; enrolledCount: number;
}

export interface ClassSchedule {
  id: string; classId: string; className: string; dayOfWeek: number;
  startTime: string; endTime: string; room: string | null;
}

export interface Enrollment {
  id: string; classId: string; className: string; customerId: string;
  studentName: string; status: EnrollmentStatus; enrolledAt: string; notes: string | null;
}

export interface AttendanceRecord {
  id: string; enrollmentId: string; classId: string; studentName: string;
  sessionDate: string; status: AttendanceStatus; notes: string | null;
}

export interface FeeInstallment {
  id: string; enrollmentId: string; studentName: string; className: string;
  title: string; amount: number; dueDate: string | null; status: FeeStatus;
  paidAmount: number; remaining: number; invoiceId: string | null; notes: string | null;
}

export const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export class EducationService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();

  private currentBranchId(): string {
    try { return this.branchAccess.getCurrentBranchId(); } catch { return ''; }
  }

  private requireView() {
    ModuleRegistryService.assertModuleEnabled('customers');
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'customers.view');
    return actor;
  }

  private requireManage() {
    ModuleRegistryService.assertModuleEnabled('customers');
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'customers.create');
    return actor;
  }

  // ── Teachers ────────────────────────────────────────────────────────────

  public getTeachers(): Array<{ id: string; fullName: string; jobTitle: string | null }> {
    this.requireView();
    return this.db.query<any>(
      `SELECT id, full_name AS fullName, job_title AS jobTitle
       FROM employees WHERE COALESCE(is_active,1)=1 ORDER BY full_name`
    );
  }

  // ── Classes ─────────────────────────────────────────────────────────────

  public getClasses(branchId?: string): EduClass[] {
    this.requireView();
    return this.db.query<any>(
      `SELECT cl.id, cl.branch_id AS branchId, cl.name, cl.subject,
              cl.teacher_id AS teacherId, e.full_name AS teacherName,
              cl.capacity, cl.academic_year AS academicYear, cl.is_active AS isActive,
              (SELECT COUNT(*) FROM edu_enrollments en WHERE en.class_id = cl.id AND en.status IN ('ENROLLED','ACTIVE')) AS enrolledCount
       FROM edu_classes cl LEFT JOIN employees e ON e.id = cl.teacher_id
       ${branchId ? 'WHERE cl.branch_id = ?' : ''} ORDER BY cl.name`,
      branchId ? [branchId] : []
    );
  }

  public saveClass(input: { id?: string; branchId?: string; name: string; subject?: string; teacherId?: string; capacity?: number; academicYear?: string; isActive?: number }): EduClass {
    this.requireManage();
    const id = input.id || uuidv4();
    if (input.id) {
      this.db.run(
        `UPDATE edu_classes SET name=?, subject=?, teacher_id=?, capacity=?, academic_year=?, is_active=? WHERE id=?`,
        [input.name, input.subject || null, input.teacherId || null, input.capacity ?? 30, input.academicYear || null, input.isActive ?? 1, id]
      );
    } else {
      this.db.run(
        `INSERT INTO edu_classes (id, branch_id, name, subject, teacher_id, capacity, academic_year, is_active)
         VALUES (?,?,?,?,?,?,?,?)`,
        [id, input.branchId || this.currentBranchId(), input.name, input.subject || null, input.teacherId || null, input.capacity ?? 30, input.academicYear || null, input.isActive ?? 1]
      );
    }
    return this.getClasses().find((c) => c.id === id)!;
  }

  // ── Timetable ───────────────────────────────────────────────────────────

  public getSchedules(classId?: string, dayOfWeek?: number): ClassSchedule[] {
    this.requireView();
    const where: string[] = [];
    const params: unknown[] = [];
    if (classId) { where.push('s.class_id = ?'); params.push(classId); }
    if (dayOfWeek !== undefined) { where.push('s.day_of_week = ?'); params.push(dayOfWeek); }
    return this.db.query<any>(
      `SELECT s.id, s.class_id AS classId, cl.name AS className, s.day_of_week AS dayOfWeek,
              s.start_time AS startTime, s.end_time AS endTime, s.room
       FROM edu_class_schedules s JOIN edu_classes cl ON cl.id = s.class_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY s.day_of_week, s.start_time`,
      params
    );
  }

  /** Weekly grid: day -> sessions sorted by start time. */
  public getWeeklyGrid(): Array<{ day: number; dayName: string; sessions: ClassSchedule[] }> {
    const all = this.getSchedules();
    return DAY_NAMES.map((dayName, day) => ({
      day, dayName,
      sessions: all.filter((s) => s.dayOfWeek === day),
    }));
  }

  public saveSchedule(input: { id?: string; classId: string; dayOfWeek: number; startTime: string; endTime: string; room?: string }): ClassSchedule {
    this.requireManage();
    const id = input.id || uuidv4();
    if (input.endTime <= input.startTime) throw new Error('وقت النهاية يجب أن يكون بعد البداية.');
    // Conflict check: same day overlapping slot in the same room.
    if (input.room) {
      const conflicts = this.db.query<any>(
        `SELECT s.id FROM edu_class_schedules s
         WHERE s.day_of_week = ? AND s.id != ?
           AND s.start_time < ? AND s.end_time > ? AND s.room = ?`,
        [input.dayOfWeek, id, input.endTime, input.startTime, input.room]
      );
      if (conflicts.length > 0) throw new Error('يوجد حصة أخرى في نفس القاعة والوقت.');
    }
    if (input.id) {
      this.db.run(
        `UPDATE edu_class_schedules SET day_of_week=?, start_time=?, end_time=?, room=? WHERE id=?`,
        [input.dayOfWeek, input.startTime, input.endTime, input.room ?? null, id]
      );
    } else {
      this.db.run(
        `INSERT INTO edu_class_schedules (id, class_id, day_of_week, start_time, end_time, room) VALUES (?,?,?,?,?,?)`,
        [id, input.classId, input.dayOfWeek, input.startTime, input.endTime, input.room ?? null]
      );
    }
    return this.getSchedules().find((s) => s.id === id)!;
  }

  public deleteSchedule(id: string): void {
    this.requireManage();
    this.db.run(`DELETE FROM edu_class_schedules WHERE id=?`, [id]);
  }

  // ── Enrollments ─────────────────────────────────────────────────────────

  public getEnrollments(classId?: string, customerId?: string): Enrollment[] {
    this.requireView();
    const where: string[] = [];
    const params: unknown[] = [];
    if (classId) { where.push('en.class_id = ?'); params.push(classId); }
    if (customerId) { where.push('en.customer_id = ?'); params.push(customerId); }
    return this.db.query<any>(
      `SELECT en.id, en.class_id AS classId, cl.name AS className, en.customer_id AS customerId,
              c.name AS studentName, en.status, en.enrolled_at AS enrolledAt, en.notes
       FROM edu_enrollments en
       JOIN edu_classes cl ON cl.id = en.class_id
       JOIN customers c ON c.id = en.customer_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY en.enrolled_at DESC`,
      params
    );
  }

  public enrollStudent(classId: string, customerId: string, notes?: string): Enrollment {
    this.requireManage();
    if (!customerId) throw new Error('يجب اختيار الطالب.');
    const cls = this.db.query<any>(`SELECT capacity FROM edu_classes WHERE id=?`, [classId])[0];
    if (!cls) throw new Error('الفصل غير موجود.');
    const count = this.db.query<any>(
      `SELECT COUNT(*) c FROM edu_enrollments WHERE class_id=? AND status IN ('ENROLLED','ACTIVE')`, [classId]
    )[0];
    if (Number(count?.c ?? 0) >= Number(cls.capacity)) throw new Error('الفصل بلغ الطاقة الاستيعابية القصوى.');
    const existing = this.db.query<any>(
      `SELECT id FROM edu_enrollments WHERE class_id=? AND customer_id=? AND status IN ('ENROLLED','ACTIVE')`,
      [classId, customerId]
    )[0];
    if (existing) throw new Error('الطالب مسجل بالفعل في هذا الفصل.');
    const id = uuidv4();
    this.db.run(
      `INSERT INTO edu_enrollments (id, class_id, customer_id, status, notes) VALUES (?,?,?,'ENROLLED',?)`,
      [id, classId, customerId, notes ?? null]
    );
    return this.getEnrollments().find((e) => e.id === id)!;
  }

  public updateEnrollmentStatus(id: string, status: EnrollmentStatus): void {
    this.requireManage();
    this.db.run(`UPDATE edu_enrollments SET status=? WHERE id=?`, [status, id]);
  }

  // ── Attendance ──────────────────────────────────────────────────────────

  public getAttendance(classId: string, date?: string): AttendanceRecord[] {
    this.requireView();
    const sessionDate = date ?? localDateString();
    return this.db.query<any>(
      `SELECT a.id, a.enrollment_id AS enrollmentId, a.class_id AS classId,
              c.name AS studentName, a.session_date AS sessionDate,
              a.status, a.notes
       FROM edu_attendance a JOIN edu_enrollments en ON en.id = a.enrollment_id
       JOIN customers c ON c.id = en.customer_id
       WHERE a.class_id=? AND a.session_date=?
       ORDER BY c.name`,
      [classId, sessionDate]
    );
  }

  public getAttendanceForAllClasses(date?: string): AttendanceRecord[] {
    this.requireView();
    const sessionDate = date ?? localDateString();
    return this.db.query<any>(
      `SELECT a.id, a.enrollment_id AS enrollmentId, a.class_id AS classId,
              c.name AS studentName, a.session_date AS sessionDate,
              a.status, a.notes
       FROM edu_attendance a JOIN edu_enrollments en ON en.id = a.enrollment_id
       JOIN customers c ON c.id = en.customer_id
       WHERE a.session_date=?
       ORDER BY a.class_id, c.name`,
      [sessionDate]
    );
  }

  public getClassRoster(classId: string): Array<{ enrollmentId: string; studentName: string; status: AttendanceStatus | null }> {
    const roster = this.db.query<any>(
      `SELECT en.id AS enrollmentId, c.name AS studentName
       FROM edu_enrollments en JOIN customers c ON c.id = en.customer_id
       WHERE en.class_id=? AND en.status IN ('ENROLLED','ACTIVE') ORDER BY c.name`,
      [classId]
    );
    const date = localDateString();
    const marked = new Map(this.getAttendance(classId, date).map((a) => [a.enrollmentId, a.status]));
    return roster.map((r) => ({ enrollmentId: r.enrollmentId, studentName: r.studentName, status: marked.get(r.enrollmentId) ?? null }));
  }

  public markAttendance(classId: string, sessionDate: string, records: Array<{ enrollmentId: string; status: AttendanceStatus; notes?: string }>): number {
    this.requireManage();
    const actor = AuthService.requireAuth();
    let count = 0;
    this.db.executeTransaction(() => {
      for (const rec of records) {
        const existing = this.db.query<any>(
          `SELECT id FROM edu_attendance WHERE enrollment_id=? AND session_date=?`,
          [rec.enrollmentId, sessionDate]
        )[0];
        if (existing) {
          this.db.run(`UPDATE edu_attendance SET status=?, notes=?, recorded_by=? WHERE id=?`,
            [rec.status, rec.notes ?? null, actor.id, existing.id]);
        } else {
          this.db.run(
            `INSERT INTO edu_attendance (id, enrollment_id, class_id, session_date, status, notes, recorded_by)
             VALUES (?,?,?,?,?,?,?)`,
            [uuidv4(), rec.enrollmentId, classId, sessionDate, rec.status, rec.notes ?? null, actor.id]
          );
        }
        count += 1;
      }
    });
    return count;
  }

  public getAttendanceStats(classId: string, from?: string, to?: string): { total: number; present: number; absent: number; late: number; excused: number; rate: number } {
    this.requireView();
    const where = ['a.class_id=?'];
    const params: unknown[] = [classId];
    if (from) { where.push('a.session_date>=?'); params.push(from); }
    if (to) { where.push('a.session_date<=?'); params.push(to); }
    const rows = this.db.query<any>(
      `SELECT a.status, COUNT(*) c FROM edu_attendance a WHERE ${where.join(' AND ')} GROUP BY a.status`,
      params
    );
    const get = (s: string) => Number(rows.find((r) => r.status === s)?.c ?? 0);
    const total = rows.reduce((s, r) => s + Number(r.c), 0);
    const present = get('PRESENT') + get('LATE');
    return {
      total, present, absent: get('ABSENT'), late: get('LATE'), excused: get('EXCUSED'),
      rate: total ? round2((present / total) * 100) : 0,
    };
  }

  // ── Fees ────────────────────────────────────────────────────────────────

  public getFeeInstallments(filters?: { enrollmentId?: string; status?: FeeStatus; customerId?: string }): FeeInstallment[] {
    this.requireView();
    const where: string[] = [];
    const params: unknown[] = [];
    if (filters?.enrollmentId) { where.push('f.enrollment_id = ?'); params.push(filters.enrollmentId); }
    if (filters?.status) { where.push('f.status = ?'); params.push(filters.status); }
    if (filters?.customerId) { where.push('en.customer_id = ?'); params.push(filters.customerId); }
    return this.db.query<any>(
      `SELECT f.id, f.enrollment_id AS enrollmentId, c.name AS studentName,
              cl.name AS className, f.title, f.amount, f.due_date AS dueDate,
              f.status, f.paid_amount AS paidAmount, f.invoice_id AS invoiceId, f.notes
       FROM edu_fee_installments f
       JOIN edu_enrollments en ON en.id = f.enrollment_id
       JOIN edu_classes cl ON cl.id = en.class_id
       JOIN customers c ON c.id = en.customer_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY f.due_date IS NULL, f.due_date`,
      params
    ).map((r) => ({ ...r, amount: round2(r.amount), paidAmount: round2(r.paidAmount), remaining: round2(r.amount - r.paidAmount) }));
  }

  public addFeeInstallment(input: { enrollmentId: string; title: string; amount: number; dueDate?: string; notes?: string }): FeeInstallment {
    this.requireManage();
    if (input.amount <= 0) throw new Error('المبلغ يجب أن يكون أكبر من صفر.');
    const id = uuidv4();
    this.db.run(
      `INSERT INTO edu_fee_installments (id, enrollment_id, title, amount, due_date, notes) VALUES (?,?,?,?,?,?)`,
      [id, input.enrollmentId, input.title, round2(input.amount), input.dueDate ?? null, input.notes ?? null]
    );
    return this.getFeeInstallments().find((f) => f.id === id)!;
  }

  public recordFeePayment(id: string, amount: number): void {
    this.requireManage();
    const fee = this.db.query<any>(`SELECT amount, paid_amount AS paid FROM edu_fee_installments WHERE id=?`, [id])[0];
    if (!fee) throw new Error('القسط غير موجود.');
    const newPaid = round2(Number(fee.paid) + amount);
    const status: FeeStatus = newPaid >= Number(fee.amount) ? 'PAID' : 'PARTIAL';
    this.db.run(`UPDATE edu_fee_installments SET paid_amount=?, status=? WHERE id=?`, [newPaid, status, id]);
  }

  public markOverdueFees(): number {
    this.requireManage();
    const today = localDateString();
    const overdue = this.db.query<any>(
      `SELECT COUNT(*) c FROM edu_fee_installments
       WHERE status IN ('PENDING','PARTIAL') AND due_date IS NOT NULL AND due_date < ? AND paid_amount < amount`,
      [today]
    )[0];
    this.db.run(
      `UPDATE edu_fee_installments SET status='OVERDUE'
       WHERE status IN ('PENDING','PARTIAL') AND due_date IS NOT NULL AND due_date < ? AND paid_amount < amount`,
      [today]
    );
    return Number(overdue?.c ?? 0);
  }
}
