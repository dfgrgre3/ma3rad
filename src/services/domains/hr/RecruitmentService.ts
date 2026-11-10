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
  CreateRecruitmentInterviewDTO,
  CreateRecruitmentJobDTO,
  CreateRecruitmentOfferDTO,
  EvaluateRecruitmentInterviewDTO,
  HireRecruitmentCandidateDTO,
  RecruitmentCandidate,
  RecruitmentCandidateStatus,
  RecruitmentEmploymentType,
  RecruitmentInterview,
  RecruitmentOffer,
  RecruitmentOfferStatus,
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
const RESUME_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);
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
         requirements, status, approval_status, is_published, branch_id, created_by, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ON_HOLD', 'PENDING', 0, ?, ?, ?, ?)`,
      [
        id, title, department, input.location?.trim() || null, input.employmentType, input.openings,
        input.description?.trim() || null, input.requirements?.trim() || null,
        branchId, actor.id, now, now,
      ]
    );
    this.audit(actor, 'إنشاء طلب احتياج وظيفي', id, {
      title, department, branchId, openings: input.openings, approvalStatus: 'PENDING',
    });
    return this.requireJob(actor, id);
  }

  public approveJob(id: string, approved: boolean): RecruitmentJob {
    this.guardWrites();
    const actor = this.require('hr.recruitment.manage');
    const job = this.requireJob(actor, id);
    if (job.approvalStatus !== 'PENDING') {
      throw new Error('طلب الاحتياج الوظيفي ليس بانتظار الاعتماد.');
    }
    const now = new Date().toISOString();
    this.db.run(
      `UPDATE hr_job_postings
       SET approval_status = ?, approved_by = ?, approved_at = ?, updated_at = ?
       WHERE id = ? AND approval_status = 'PENDING'`,
      [approved ? 'APPROVED' : 'REJECTED', approved ? actor.id : null, approved ? now : null, now, id]
    );
    this.audit(actor, approved ? 'اعتماد طلب احتياج وظيفي' : 'رفض طلب احتياج وظيفي', id, {
      previousStatus: job.approvalStatus,
      approvalStatus: approved ? 'APPROVED' : 'REJECTED',
    });
    return this.requireJob(actor, id);
  }

  public setJobPublished(id: string, published: boolean): RecruitmentJob {
    this.guardWrites();
    const actor = this.require('hr.recruitment.manage');
    const job = this.requireJob(actor, id);
    if (published && job.approvalStatus !== 'APPROVED') {
      throw new Error('يجب اعتماد طلب الاحتياج قبل نشر الإعلان.');
    }
    if (job.status === 'CLOSED') throw new Error('لا يمكن نشر وظيفة مغلقة.');
    const now = new Date().toISOString();
    this.db.run(
      `UPDATE hr_job_postings SET is_published = ?, status = ?, updated_at = ? WHERE id = ?`,
      [published ? 1 : 0, published ? 'OPEN' : 'ON_HOLD', now, id]
    );
    this.audit(actor, published ? 'نشر إعلان وظيفة' : 'إيقاف نشر إعلان وظيفة', id, {
      isPublished: published,
    });
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
    if (status === 'OPEN' && (job.approvalStatus !== 'APPROVED' || !job.isPublished)) {
      throw new Error('يجب اعتماد الوظيفة ونشر إعلانها قبل فتح استقبال الطلبات.');
    }
    const now = new Date().toISOString();
    this.db.run(
      'UPDATE hr_job_postings SET status = ?, is_published = CASE WHEN ? = ? THEN 0 ELSE is_published END, updated_at = ? WHERE id = ?',
      [status, status, 'CLOSED', now, id]
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
    if (job.status !== 'OPEN' || !job.isPublished || job.approvalStatus !== 'APPROVED') {
      throw new Error('لا يمكن استقبال طلبات لوظيفة غير معتمدة ومنشورة.');
    }
    if (email && this.db.query(
      'SELECT 1 FROM hr_job_candidates WHERE job_id = ? AND lower(email) = lower(?) LIMIT 1',
      [job.id, email]
    ).length) {
      throw new Error('هذا البريد الإلكتروني مسجل بالفعل لهذه الوظيفة.');
    }
    if (input.resume) {
      const { storageName, fileName, mimeType, fileSize, checksum } = input.resume;
      if (!storageName?.trim() || !fileName?.trim() || !checksum?.trim()
        || !RESUME_MIME_TYPES.has(mimeType) || !Number.isInteger(fileSize)
        || fileSize <= 0 || fileSize > 25 * 1024 * 1024) {
        throw new Error('ملف السيرة الذاتية غير صالح؛ الأنواع المسموحة PDF وJPG وPNG وبحد أقصى 25 ميجابايت.');
      }
    }

    const id = `hrcand_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO hr_job_candidates (
         id, job_id, branch_id, full_name, phone, email, source, status,
         applied_at, notes, resume_storage_name, resume_file_name, resume_mime_type,
         resume_file_size, resume_checksum, created_by, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'NEW', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, job.id, job.branchId, fullName, phone, email, input.source?.trim() || null,
        localDateString(), input.notes?.trim() || null,
        input.resume?.storageName || null, input.resume?.fileName || null,
        input.resume?.mimeType || null, input.resume?.fileSize || null, input.resume?.checksum || null,
        actor.id, now, now,
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
    if (status === 'HIRED' || status === 'INTERVIEW' || status === 'OFFER' || candidate.status === 'HIRED') {
      throw new Error('تُدار المقابلات والعروض والتعيين من إجراءاتها المخصصة لضمان حفظ تفاصيلها.');
    }
    if (candidate.status === 'OFFER') {
      throw new Error('تُدار حالة المرشح في مرحلة العرض من سجل العرض الوظيفي.');
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

  public getInterviews(candidateId: string): RecruitmentInterview[] {
    const actor = this.require('hr.recruitment.view');
    this.requireCandidate(actor, candidateId);
    return this.db.query<RecruitmentInterview>(
      `SELECT id, candidate_id AS candidateId, scheduled_at AS scheduledAt,
              interviewer, location, status, score, result, evaluation
       FROM hr_candidate_interviews WHERE candidate_id = ?
       ORDER BY scheduled_at DESC`,
      [candidateId]
    );
  }

  public scheduleInterview(candidateId: string, input: CreateRecruitmentInterviewDTO): RecruitmentInterview {
    this.guardWrites();
    const actor = this.require('hr.recruitment.manage');
    const candidate = this.requireCandidate(actor, candidateId);
    if (!['SCREENING', 'INTERVIEW'].includes(candidate.status)) {
      throw new Error('يجب فرز المرشح قبل تحديد المقابلة.');
    }
    const interviewer = input.interviewer?.trim();
    if (!interviewer) throw new Error('اسم القائم بالمقابلة مطلوب.');
    const scheduledAt = new Date(input.scheduledAt);
    if (!input.scheduledAt || Number.isNaN(scheduledAt.getTime())) {
      throw new Error('تاريخ ووقت المقابلة غير صالح.');
    }
    const id = `hrint_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO hr_candidate_interviews
       (id, candidate_id, scheduled_at, interviewer, location, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, candidateId, scheduledAt.toISOString(), interviewer, input.location?.trim() || null, actor.id, now, now]
    );
    if (candidate.status !== 'INTERVIEW') {
      this.db.run(
        `UPDATE hr_job_candidates SET status = 'INTERVIEW', updated_at = ? WHERE id = ?`,
        [now, candidateId]
      );
    }
    this.audit(actor, 'تحديد مقابلة لمرشح', id, {
      candidateId, scheduledAt: scheduledAt.toISOString(), interviewer,
    });
    return this.db.query<RecruitmentInterview>(
      `SELECT id, candidate_id AS candidateId, scheduled_at AS scheduledAt,
              interviewer, location, status, score, result, evaluation
       FROM hr_candidate_interviews WHERE id = ?`,
      [id]
    )[0];
  }

  public evaluateInterview(
    interviewId: string,
    input: EvaluateRecruitmentInterviewDTO
  ): RecruitmentInterview {
    this.guardWrites();
    const actor = this.require('hr.recruitment.manage');
    if (!Number.isFinite(input.score) || input.score < 0 || input.score > 100) {
      throw new Error('تقييم المقابلة يجب أن يكون من صفر إلى 100.');
    }
    if (!['PASS', 'FAIL', 'PENDING'].includes(input.result)) {
      throw new Error('نتيجة المقابلة غير صالحة.');
    }
    const interview = this.db.query<RecruitmentInterview>(
      `SELECT id, candidate_id AS candidateId, scheduled_at AS scheduledAt,
              interviewer, location, status, score, result, evaluation
       FROM hr_candidate_interviews WHERE id = ?`,
      [interviewId]
    )[0];
    if (!interview) throw new Error('المقابلة غير موجودة.');
    this.requireCandidate(actor, interview.candidateId);
    if (interview.status === 'CANCELLED') throw new Error('لا يمكن تقييم مقابلة ملغاة.');
    const now = new Date().toISOString();
    this.db.run(
      `UPDATE hr_candidate_interviews
       SET status = 'COMPLETED', score = ?, result = ?, evaluation = ?, updated_at = ?
       WHERE id = ?`,
      [input.score, input.result, input.evaluation?.trim() || null, now, interviewId]
    );
    this.audit(actor, 'تسجيل نتيجة مقابلة', interviewId, {
      candidateId: interview.candidateId, score: input.score,
      result: input.result, evaluation: input.evaluation?.trim() || null,
    });
    return { ...interview, status: 'COMPLETED', score: input.score, result: input.result, evaluation: input.evaluation?.trim() || null };
  }

  public getOffer(candidateId: string): RecruitmentOffer | null {
    const actor = this.require('hr.recruitment.view');
    this.requireCandidate(actor, candidateId);
    return this.db.query<RecruitmentOffer>(
      `SELECT id, candidate_id AS candidateId, salary, salary_type AS salaryType,
              offered_at AS offeredAt, expires_at AS expiresAt, status, terms
       FROM hr_candidate_offers WHERE candidate_id = ?`,
      [candidateId]
    )[0] ?? null;
  }

  public createOffer(candidateId: string, input: CreateRecruitmentOfferDTO): RecruitmentOffer {
    this.guardWrites();
    const actor = this.require('hr.recruitment.manage');
    const candidate = this.requireCandidate(actor, candidateId);
    if (candidate.status !== 'INTERVIEW') throw new Error('يجب إجراء مقابلة للمرشح قبل إعداد العرض.');
    const passedInterview = this.db.query<{ id: string }>(
      `SELECT id FROM hr_candidate_interviews
       WHERE candidate_id = ? AND status = 'COMPLETED' AND result = 'PASS'
       LIMIT 1`,
      [candidateId]
    )[0];
    if (!passedInterview) throw new Error('يجب تسجيل مقابلة ناجحة قبل إعداد العرض الوظيفي.');
    if (!Number.isFinite(input.salary) || input.salary < 0) throw new Error('قيمة الراتب المعروض غير صالحة.');
    if (input.salaryType !== 'MONTHLY' && input.salaryType !== 'DAILY') throw new Error('نوع الراتب غير صالح.');
    const assertDate = (value: string, label: string) => {
      if (!DATE_PATTERN.test(value)) throw new Error(`${label} غير صالح.`);
      const parsed = new Date(`${value}T00:00:00Z`);
      if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
        throw new Error(`${label} غير صالح.`);
      }
    };
    assertDate(input.offeredAt, 'تاريخ العرض');
    if (input.expiresAt) {
      assertDate(input.expiresAt, 'تاريخ انتهاء العرض');
      if (input.expiresAt < input.offeredAt) throw new Error('تاريخ انتهاء العرض يسبق تاريخ إصداره.');
    }
    if (this.getOffer(candidateId)) throw new Error('يوجد عرض وظيفي مسجل لهذا المرشح بالفعل.');
    const id = `hroff_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO hr_candidate_offers
       (id, candidate_id, salary, salary_type, offered_at, expires_at, terms, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, candidateId, input.salary, input.salaryType, input.offeredAt, input.expiresAt || null,
        input.terms?.trim() || null, actor.id, now, now]
    );
    this.audit(actor, 'إنشاء عرض وظيفي', id, { candidateId, salary: input.salary, salaryType: input.salaryType });
    return this.getOffer(candidateId)!;
  }

  public setOfferStatus(candidateId: string, status: RecruitmentOfferStatus): RecruitmentOffer {
    this.guardWrites();
    const actor = this.require('hr.recruitment.manage');
    const candidate = this.requireCandidate(actor, candidateId);
    const offer = this.getOffer(candidateId);
    if (!offer) throw new Error('لا يوجد عرض وظيفي لهذا المرشح.');
    const transitions: Record<RecruitmentOfferStatus, RecruitmentOfferStatus[]> = {
      DRAFT: ['SENT', 'WITHDRAWN'],
      SENT: ['ACCEPTED', 'DECLINED', 'WITHDRAWN'],
      ACCEPTED: ['WITHDRAWN'],
      DECLINED: [],
      WITHDRAWN: [],
    };
    if (!transitions[offer.status].includes(status)) {
      throw new Error('لا يمكن نقل العرض إلى الحالة المطلوبة.');
    }
    const now = new Date().toISOString();
    this.db.executeTransaction(() => {
      this.db.run(
        `UPDATE hr_candidate_offers
         SET status = ?, sent_at = CASE WHEN ? = 'SENT' THEN ? ELSE sent_at END,
             responded_at = CASE WHEN ? IN ('ACCEPTED', 'DECLINED') THEN ? ELSE responded_at END,
             updated_at = ? WHERE id = ? AND status = ?`,
        [status, status, now, status, now, now, offer.id, offer.status]
      );
      if (status === 'SENT') {
        this.db.run(
          `UPDATE hr_job_candidates SET status = 'OFFER', updated_at = ? WHERE id = ?`,
          [now, candidateId]
        );
      } else if (status === 'WITHDRAWN' && candidate.status === 'OFFER') {
        this.db.run(
          `UPDATE hr_job_candidates SET status = 'INTERVIEW', updated_at = ? WHERE id = ?`,
          [now, candidateId]
        );
      } else if (status === 'DECLINED') {
        this.db.run(
          `UPDATE hr_job_candidates SET status = 'REJECTED', updated_at = ? WHERE id = ?`,
          [now, candidateId]
        );
      }
      const updated = this.db.query<{ status: RecruitmentOfferStatus }>(
        'SELECT status FROM hr_candidate_offers WHERE id = ?',
        [offer.id]
      )[0];
      if (updated?.status !== status) throw new Error('تعذر تحديث حالة العرض الوظيفي.');
      this.audit(actor, 'تحديث حالة عرض وظيفي', offer.id, {
        candidateId, previousStatus: offer.status, status,
      });
    });
    return this.getOffer(candidateId)!;
  }

  public hireCandidate(id: string, input: HireRecruitmentCandidateDTO): RecruitmentCandidate {
    this.guardWrites();
    const actor = this.require('hr.recruitment.manage');
    PermissionService.require(actor, 'employees.create');
    const candidate = this.requireCandidate(actor, id);
    if (candidate.status !== 'OFFER' || this.getOffer(id)?.status !== 'ACCEPTED') {
      throw new Error('لا يمكن تعيين المرشح قبل قبول العرض الوظيفي.');
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
