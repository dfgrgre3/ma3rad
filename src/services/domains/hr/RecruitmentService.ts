import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import { PermissionService } from '../auth/PermissionService';
import { EmployeeService } from './EmployeeService';
import { ContractService } from './ContractService';
import { localDateString } from '../../../utils/shared/date';
import type { User } from '../../../types/auth/identity';
import type {
  CreateRecruitmentCandidateDTO,
  CreateRecruitmentJobDTO,
  HireRecruitmentCandidateDTO,
  RecruitmentCandidate,
  RecruitmentCandidateStatus,
  RecruitmentEmploymentType,
  RecruitmentJob,
  RecruitmentJobStatus,
  RecruitmentSummary,
} from '../../../types/hr/recruitment';

const EMPLOYMENT_TYPES: RecruitmentEmploymentType[] = [
  'FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMPORARY', 'INTERNSHIP',
];
const JOB_STATUSES: RecruitmentJobStatus[] = ['OPEN', 'ON_HOLD', 'CLOSED'];
const CANDIDATE_STATUSES: RecruitmentCandidateStatus[] = [
  'NEW', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED',
];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CANDIDATE_TRANSITIONS: Record<Exclude<RecruitmentCandidateStatus, 'HIRED'>, RecruitmentCandidateStatus[]> = {
  NEW: ['SCREENING', 'REJECTED'],
  SCREENING: ['INTERVIEW', 'REJECTED'],
  INTERVIEW: ['SCREENING', 'OFFER', 'REJECTED'],
  OFFER: ['INTERVIEW', 'REJECTED'],
  REJECTED: ['SCREENING'],
};

export class RecruitmentService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();

  private require(permission: string): User {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, permission);
    return actor;
  }

  private guardWrites(): void {
    ModuleRegistryService.assertModuleEnabled('hr');
  }

  public getJobs(status: RecruitmentJobStatus | 'ALL' = 'ALL'): RecruitmentJob[] {
    const actor = this.require('hr.recruitment.view');
    if (status !== 'ALL' && !JOB_STATUSES.includes(status)) throw new Error('حالة الوظيفة غير صالحة.');
    const scope = this.branchAccess.sqlScope('j.branch_id', undefined, actor);
    const conditions = [scope.clause];
    const params: Array<string | number> = [...scope.params];
    if (status !== 'ALL') {
      conditions.push('j.status = ?');
      params.push(status);
    }
    return this.db.query<RecruitmentJob>(
      `SELECT j.*, b.name AS branch_name,
              (SELECT COUNT(*) FROM hr_job_candidates c
               WHERE c.job_id = j.id AND c.status = 'HIRED') AS hired_count
       FROM hr_job_postings j
       JOIN branches b ON b.id = j.branch_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY CASE j.status WHEN 'OPEN' THEN 0 WHEN 'ON_HOLD' THEN 1 ELSE 2 END,
                j.created_at DESC`,
      params
    );
  }

  public getCandidates(filters: {
    jobId?: string;
    status?: RecruitmentCandidateStatus | 'ALL';
  } = {}): RecruitmentCandidate[] {
    const actor = this.require('hr.recruitment.view');
    if (filters.status && filters.status !== 'ALL' && !CANDIDATE_STATUSES.includes(filters.status)) {
      throw new Error('مرحلة المرشح غير صالحة.');
    }
    const scope = this.branchAccess.sqlScope('c.branch_id', undefined, actor);
    const conditions = [scope.clause];
    const params: Array<string | number> = [...scope.params];
    if (filters.jobId) {
      conditions.push('c.job_id = ?');
      params.push(filters.jobId);
    }
    if (filters.status && filters.status !== 'ALL') {
      conditions.push('c.status = ?');
      params.push(filters.status);
    }
    return this.db.query<RecruitmentCandidate>(
      `SELECT c.*, j.title AS job_title, j.location AS job_location,
              j.employment_type AS job_employment_type, b.name AS branch_name,
              (SELECT ec.id FROM employee_contracts ec
               WHERE ec.employee_id = c.employee_id
               ORDER BY ec.created_at DESC LIMIT 1) AS employee_contract_id
       FROM hr_job_candidates c
       JOIN hr_job_postings j ON j.id = c.job_id
       JOIN branches b ON b.id = c.branch_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY c.applied_at DESC, c.created_at DESC`,
      params
    );
  }

  public getSummary(): RecruitmentSummary {
    const actor = this.require('hr.recruitment.view');
    const jobsScope = this.branchAccess.sqlScope('branch_id', undefined, actor);
    const candidatesScope = this.branchAccess.sqlScope('branch_id', undefined, actor);
    const jobs = this.db.query<{ openJobs: number }>(
      `SELECT COUNT(*) AS openJobs FROM hr_job_postings WHERE status = 'OPEN' AND ${jobsScope.clause}`,
      jobsScope.params
    )[0]?.openJobs ?? 0;
    const rows = this.db.query<{ status: RecruitmentCandidateStatus; count: number }>(
      `SELECT status, COUNT(*) AS count
       FROM hr_job_candidates WHERE ${candidatesScope.clause}
       GROUP BY status`,
      candidatesScope.params
    );
    const counts = new Map(rows.map((row) => [row.status, Number(row.count)]));
    return {
      openJobs: Number(jobs),
      candidates: rows.reduce((total, row) => total + Number(row.count), 0),
      interviews: counts.get('INTERVIEW') ?? 0,
      offers: counts.get('OFFER') ?? 0,
      hires: counts.get('HIRED') ?? 0,
    };
  }

  public createJob(input: CreateRecruitmentJobDTO): RecruitmentJob {
    this.guardWrites();
    const actor = this.require('hr.recruitment.manage');
    const title = input.title?.trim();
    const department = input.department?.trim();
    if (!title) throw new Error('المسمى الوظيفي مطلوب.');
    if (!department) throw new Error('القسم مطلوب.');
    if (!EMPLOYMENT_TYPES.includes(input.employmentType)) throw new Error('نوع التوظيف غير صالح.');
    if (!Number.isInteger(input.openings) || input.openings < 1) {
      throw new Error('عدد الشواغر يجب أن يكون رقمًا صحيحًا أكبر من صفر.');
    }
    const branchId = this.branchAccess.getCurrentBranchId(actor);
    const id = `hrjob_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO hr_job_postings (
         id, title, department, location, employment_type, openings, description,
         requirements, status, branch_id, created_by, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?)`,
      [
        id, title, department, input.location?.trim() || null, input.employmentType, input.openings,
        input.description?.trim() || null, input.requirements?.trim() || null,
        branchId, actor.id, now, now,
      ]
    );
    this.audit(actor, 'فتح وظيفة شاغرة', id, { title, department, branchId, openings: input.openings });
    return this.requireJob(actor, id);
  }

  public setJobStatus(id: string, status: RecruitmentJobStatus): RecruitmentJob {
    this.guardWrites();
    const actor = this.require('hr.recruitment.manage');
    if (!JOB_STATUSES.includes(status)) throw new Error('حالة الوظيفة غير صالحة.');
    const job = this.requireJob(actor, id);
    if (job.status === status) return job;
    if (status === 'OPEN' && Number(job.hiredCount) >= job.openings) {
      throw new Error('لا يمكن إعادة فتح الوظيفة بعد اكتمال عدد التعيينات المطلوب.');
    }
    const now = new Date().toISOString();
    this.db.run(
      'UPDATE hr_job_postings SET status = ?, updated_at = ? WHERE id = ?',
      [status, now, id]
    );
    this.audit(actor, 'تحديث حالة وظيفة', id, { oldStatus: job.status, status });
    return this.requireJob(actor, id);
  }

  public createCandidate(input: CreateRecruitmentCandidateDTO): RecruitmentCandidate {
    this.guardWrites();
    const actor = this.require('hr.recruitment.manage');
    const fullName = input.fullName?.trim();
    if (!input.jobId) throw new Error('اختر الوظيفة المطلوبة.');
    if (!fullName) throw new Error('اسم المرشح مطلوب.');
    const email = input.email?.trim().toLowerCase() || null;
    if (email && !EMAIL_PATTERN.test(email)) throw new Error('البريد الإلكتروني غير صالح.');
    const phone = input.phone?.trim() || null;
    if (!email && !phone) throw new Error('أدخل رقم هاتف المرشح أو بريده الإلكتروني.');
    const job = this.requireJob(actor, input.jobId);
    if (job.status !== 'OPEN') throw new Error('لا يمكن إضافة مرشحين إلى وظيفة غير مفتوحة.');
    if (email && this.db.query(
      'SELECT 1 FROM hr_job_candidates WHERE job_id = ? AND lower(email) = lower(?) LIMIT 1',
      [job.id, email]
    ).length) {
      throw new Error('هذا البريد الإلكتروني مسجل بالفعل لهذه الوظيفة.');
    }

    const id = `hrcand_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO hr_job_candidates (
         id, job_id, branch_id, full_name, phone, email, source, status,
         applied_at, notes, created_by, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'NEW', ?, ?, ?, ?, ?)`,
      [
        id, job.id, job.branchId, fullName, phone, email, input.source?.trim() || null,
        localDateString(), input.notes?.trim() || null, actor.id, now, now,
      ]
    );
    this.audit(actor, 'إضافة مرشح لوظيفة', id, { jobId: job.id, fullName, email });
    return this.requireCandidate(actor, id);
  }

  public setCandidateStatus(id: string, status: RecruitmentCandidateStatus): RecruitmentCandidate {
    this.guardWrites();
    const actor = this.require('hr.recruitment.manage');
    if (!CANDIDATE_STATUSES.includes(status)) throw new Error('مرحلة المرشح غير صالحة.');
    const candidate = this.requireCandidate(actor, id);
    if (candidate.status === status) return candidate;
    if (status === 'HIRED' || candidate.status === 'HIRED') {
      throw new Error('يجب إتمام التعيين من إجراء التعيين لضمان إنشاء سجل الموظف.');
    }
    if (!CANDIDATE_TRANSITIONS[candidate.status].includes(status)) {
      throw new Error(`لا يمكن نقل المرشح من «${candidate.status}» إلى «${status}».`);
    }
    this.db.run(
      'UPDATE hr_job_candidates SET status = ?, updated_at = ? WHERE id = ?',
      [status, new Date().toISOString(), id]
    );
    this.audit(actor, 'تحديث مرحلة مرشح', id, { oldStatus: candidate.status, status });
    return this.requireCandidate(actor, id);
  }

  public hireCandidate(id: string, input: HireRecruitmentCandidateDTO): RecruitmentCandidate {
    this.guardWrites();
    const actor = this.require('hr.recruitment.manage');
    PermissionService.require(actor, 'employees.manage');
    const candidate = this.requireCandidate(actor, id);
    if (candidate.status !== 'OFFER') {
      throw new Error('لا يمكن تعيين المرشح قبل وصوله إلى مرحلة العرض الوظيفي.');
    }
    if (candidate.employeeId) throw new Error('تم ربط المرشح بسجل موظف بالفعل.');
    const phone = input.phone?.trim();
    if (!phone) throw new Error('رقم هاتف الموظف مطلوب لإتمام التعيين.');
    const parsedDate = DATE_PATTERN.test(input.joinedDate)
      ? new Date(`${input.joinedDate}T00:00:00Z`)
      : null;
    if (!parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== input.joinedDate) {
      throw new Error('تاريخ التعيين غير صالح.');
    }
    if (!Number.isFinite(input.baseSalary) || input.baseSalary < 0) {
      throw new Error('الراتب الأساسي يجب أن يكون رقمًا غير سالب.');
    }
    if (input.salaryType !== 'MONTHLY' && input.salaryType !== 'DAILY') {
      throw new Error('دورة احتساب الراتب غير صالحة.');
    }
    if (input.createDraftContract) PermissionService.require(actor, 'hr.contracts.manage');

    const job = this.requireJob(actor, candidate.jobId);
    const employeeType = job.employmentType === 'INTERNSHIP' ? 'TEMPORARY' : job.employmentType;
    this.db.executeTransaction(() => {
      const employee = EmployeeService.create({
        name: candidate.fullName,
        phone,
        email: candidate.email || '',
        location: input.location?.trim() || job.location || job.branchName || '',
        role: job.title,
        branchId: job.branchId,
        employmentType: employeeType,
        joinedDate: input.joinedDate,
        baseSalary: input.baseSalary,
        salaryType: input.salaryType,
        status: 'ACTIVE',
        notes: `تم التعيين من طلب التوظيف ${job.title}.`,
      });

      if (input.createDraftContract) {
        const contractType = job.employmentType === 'PART_TIME'
          ? 'PART_TIME'
          : job.employmentType === 'CONTRACT'
            ? 'FIXED_TERM'
            : job.employmentType === 'TEMPORARY' || job.employmentType === 'INTERNSHIP'
              ? 'TEMPORARY'
              : 'PERMANENT';
        new ContractService().createContract({
          employeeId: employee.id,
          contractType,
          startDate: input.joinedDate,
          jobTitle: job.title,
          salary: input.baseSalary,
          notes: `مسودة عقد من طلب التوظيف ${job.title}.`,
        });
      }

      const now = new Date().toISOString();
      this.db.run(
        `UPDATE hr_job_candidates
         SET status = 'HIRED', employee_id = ?, hired_at = ?, updated_at = ?
         WHERE id = ? AND status = 'OFFER' AND employee_id IS NULL`,
        [employee.id, now, now, id]
      );
      if (!this.db.query(
        'SELECT 1 FROM hr_job_candidates WHERE id = ? AND employee_id = ? AND status = ?',
        [id, employee.id, 'HIRED']
      ).length) {
        throw new Error('تعذر ربط المرشح بسجل الموظف. لم يتم حفظ عملية التعيين.');
      }
      this.audit(actor, 'تعيين مرشح', id, {
        employeeId: employee.id,
        jobId: job.id,
        joinedDate: input.joinedDate,
        baseSalary: input.baseSalary,
      });

      const hiredCount = this.db.query<{ count: number }>(
        `SELECT COUNT(*) AS count FROM hr_job_candidates WHERE job_id = ? AND status = 'HIRED'`,
        [job.id]
      )[0]?.count ?? 0;
      if (job.status !== 'CLOSED' && Number(hiredCount) >= job.openings) {
        this.db.run(
          "UPDATE hr_job_postings SET status = 'CLOSED', updated_at = ? WHERE id = ? AND status = 'OPEN'",
          [now, job.id]
        );
        this.audit(actor, 'إغلاق وظيفة بعد اكتمال الشواغر', job.id, {
          hiredCount: Number(hiredCount),
          openings: job.openings,
        });
      }
    });

    return this.requireCandidate(actor, id);
  }

  private requireJob(actor: User, id: string): RecruitmentJob {
    const scope = this.branchAccess.sqlScope('j.branch_id', undefined, actor);
    const job = this.db.query<RecruitmentJob>(
      `SELECT j.*, b.name AS branch_name,
              (SELECT COUNT(*) FROM hr_job_candidates c
               WHERE c.job_id = j.id AND c.status = 'HIRED') AS hired_count
       FROM hr_job_postings j JOIN branches b ON b.id = j.branch_id
       WHERE j.id = ? AND ${scope.clause}`,
      [id, ...scope.params]
    )[0];
    if (!job) throw new Error('الوظيفة غير موجودة أو ليست ضمن نطاق صلاحيتك.');
    return job;
  }

  private requireCandidate(actor: User, id: string): RecruitmentCandidate {
    const scope = this.branchAccess.sqlScope('c.branch_id', undefined, actor);
    const candidate = this.db.query<RecruitmentCandidate>(
      `SELECT c.*, j.title AS job_title, j.location AS job_location,
              j.employment_type AS job_employment_type, b.name AS branch_name,
              (SELECT ec.id FROM employee_contracts ec
               WHERE ec.employee_id = c.employee_id
               ORDER BY ec.created_at DESC LIMIT 1) AS employee_contract_id
       FROM hr_job_candidates c
       JOIN hr_job_postings j ON j.id = c.job_id
       JOIN branches b ON b.id = c.branch_id
       WHERE c.id = ? AND ${scope.clause}`,
      [id, ...scope.params]
    )[0];
    if (!candidate) throw new Error('المرشح غير موجود أو ليس ضمن نطاق صلاحيتك.');
    return candidate;
  }

  private audit(actor: User, action: string, recordId: string, values: object): void {
    this.db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
       VALUES (?, ?, ?, ?, 'HR', ?, ?)`,
      [
        `aud_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
        actor.id,
        actor.fullName,
        action,
        recordId,
        JSON.stringify(values),
      ]
    );
  }
}
