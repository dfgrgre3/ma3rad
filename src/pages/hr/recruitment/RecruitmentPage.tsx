import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { PageHeader } from '../../../components/ui/PageHeader';
import {
  BriefcaseBusiness, CalendarPlus, Clock3, FilePlus2, Loader2, Plus, RefreshCw,
  Search, UserRound, UserRoundCheck, Users, X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { RecruitmentService } from '../../../services/domains/hr/RecruitmentService';
import { usePermission } from '../../../hooks/domains/auth/usePermission';
import { useToast } from '../../../components/ui/Toast';
import { localDateString } from '../../../utils/shared/date';
import type {
  RecruitmentCandidate,
  RecruitmentCandidateStatus,
  RecruitmentEmploymentType,
  RecruitmentInterview,
  RecruitmentJob,
  RecruitmentJobStatus,
  RecruitmentOffer,
  RecruitmentResumeInput,
  RecruitmentSummary,
} from '../../../types/hr/recruitment';

type Tab = 'jobs' | 'candidates';
type WorkflowTab = 'interview' | 'offer';

const employmentLabels: Record<RecruitmentEmploymentType, string> = {
  FULL_TIME: 'دوام كامل',
  PART_TIME: 'دوام جزئي',
  CONTRACT: 'تعاقد',
  TEMPORARY: 'مؤقت',
  INTERNSHIP: 'تدريب',
};

const jobStatusLabels: Record<RecruitmentJobStatus, string> = {
  OPEN: 'مفتوحة',
  ON_HOLD: 'معلّقة',
  CLOSED: 'مغلقة',
};

const jobStatusStyles: Record<RecruitmentJobStatus, string> = {
  OPEN: 'bg-success-soft text-success border-success-border',
  ON_HOLD: 'bg-warning-soft text-warning border-warning-border',
  CLOSED: 'bg-surface-sunken text-ink-secondary border-line',
};

const candidateStatusLabels: Record<RecruitmentCandidateStatus, string> = {
  NEW: 'جديد',
  SCREENING: 'فرز أولي',
  INTERVIEW: 'مقابلة',
  OFFER: 'عرض وظيفي',
  HIRED: 'تم التعيين',
  REJECTED: 'مرفوض',
};

const candidateStatusStyles: Record<RecruitmentCandidateStatus, string> = {
  NEW: 'bg-accent-soft text-primary border-accent-border',
  SCREENING: 'bg-accent-soft text-primary border-accent-border',
  INTERVIEW: 'bg-warning-soft text-warning border-warning-border',
  OFFER: 'bg-accent-soft text-primary border-accent-border',
  HIRED: 'bg-success-soft text-success border-success-border',
  REJECTED: 'bg-danger-soft text-danger border-danger-border',
};

const candidateNextStatuses: Record<Exclude<RecruitmentCandidateStatus, 'HIRED'>, RecruitmentCandidateStatus[]> = {
  NEW: ['SCREENING', 'REJECTED'],
  SCREENING: ['REJECTED'],
  INTERVIEW: ['SCREENING', 'REJECTED'],
  OFFER: [],
  REJECTED: ['SCREENING'],
};

const emptyJob = {
  title: '',
  department: '',
  location: '',
  employmentType: 'FULL_TIME' as RecruitmentEmploymentType,
  openings: '1',
  description: '',
  requirements: '',
};

const emptyCandidate = {
  jobId: '',
  fullName: '',
  phone: '',
  email: '',
  source: '',
  notes: '',
};

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(new Date(`${value}T00:00:00`));

function SummaryCard({ label, value, icon: Icon, tone }: {
  label: string;
  value: number;
  icon: React.ElementType;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4">
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${tone}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs text-muted">{label}</p>
        <p className="text-xl font-bold text-ink">{value}</p>
      </div>
    </div>
  );
}

export const RecruitmentPage: React.FC = () => {
  const service = useMemo(() => new RecruitmentService(), []);
  const toast = useToast();
  const can = usePermission();
  const canManage = can('hr.recruitment.manage');
  const canHire = canManage && can('employees.manage');
  const canCreateContracts = canHire && can('hr.contracts.manage');
  const [tab, setTab] = useState<Tab>('jobs');
  const [jobs, setJobs] = useState<RecruitmentJob[]>([]);
  const [candidates, setCandidates] = useState<RecruitmentCandidate[]>([]);
  const [summary, setSummary] = useState<RecruitmentSummary>({
    openJobs: 0, candidates: 0, interviews: 0, offers: 0, hires: 0,
  });
  const [jobStatus, setJobStatus] = useState<RecruitmentJobStatus | 'ALL'>('ALL');
  const [candidateStatus, setCandidateStatus] = useState<RecruitmentCandidateStatus | 'ALL'>('ALL');
  const [candidateJobId, setCandidateJobId] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [jobForm, setJobForm] = useState(emptyJob);
  const [candidateForm, setCandidateForm] = useState(emptyCandidate);
  const [resume, setResume] = useState<RecruitmentResumeInput | null>(null);
  const [candidateToHire, setCandidateToHire] = useState<RecruitmentCandidate | null>(null);
  const [workflowCandidate, setWorkflowCandidate] = useState<RecruitmentCandidate | null>(null);
  const [workflowTab, setWorkflowTab] = useState<WorkflowTab>('interview');
  const [workflowInterviews, setWorkflowInterviews] = useState<RecruitmentInterview[]>([]);
  const [workflowOffer, setWorkflowOffer] = useState<RecruitmentOffer | null>(null);
  const [interviewForm, setInterviewForm] = useState({
    scheduledAt: '',
    interviewer: '',
    location: '',
    score: '0',
    result: 'PENDING' as 'PASS' | 'FAIL' | 'PENDING',
    evaluation: '',
    selectedInterviewId: '',
  });
  const [offerForm, setOfferForm] = useState({
    salary: '',
    salaryType: 'MONTHLY' as 'MONTHLY' | 'DAILY',
    offeredAt: localDateString(),
    expiresAt: '',
    terms: '',
  });
  const [hireForm, setHireForm] = useState({
    phone: '',
    location: '',
    joinedDate: localDateString(),
    baseSalary: '',
    salaryType: 'MONTHLY' as 'MONTHLY' | 'DAILY',
    createDraftContract: true,
  });

  const load = useCallback(() => {
    setLoading(true);
    try {
      setJobs(service.getJobs());
      setCandidates(service.getCandidates({
        jobId: candidateJobId || undefined,
        status: candidateStatus,
      }));
      setSummary(service.getSummary());
    } catch (error) {
      toast.error(errorMessage(error, 'تعذر تحميل بيانات التوظيف.'));
    } finally {
      setLoading(false);
    }
  }, [candidateJobId, candidateStatus, service, toast]);

  useEffect(() => { load(); }, [load]);

  const submitJob = (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      service.createJob({
        title: jobForm.title,
        department: jobForm.department,
        location: jobForm.location,
        employmentType: jobForm.employmentType,
        openings: Number(jobForm.openings),
        description: jobForm.description,
        requirements: jobForm.requirements,
      });
      toast.success('تم فتح الوظيفة الشاغرة.');
      setJobForm(emptyJob);
      setShowForm(false);
      load();
    } catch (error) {
      toast.error(errorMessage(error, 'تعذر إنشاء الوظيفة.'));
    } finally {
      setSaving(false);
    }
  };

  const importResume = async () => {
    try {
      const bridge = window.ceramisys?.documents;
      if (!bridge?.importFile) throw new Error('رفع الملفات غير متاح في هذه البيئة.');
      const result = await bridge.importFile({ purpose: 'employee' });
      if (!result.ok) {
        if (result.canceled) return;
        throw new Error(result.error || 'تعذر رفع السيرة الذاتية.');
      }
      if (!result.storageName || !result.fileName || !result.mimeType || !result.fileSize || !result.checksum) {
        throw new Error('لم تكتمل بيانات ملف السيرة الذاتية.');
      }
      if (!['application/pdf', 'image/jpeg', 'image/png'].includes(result.mimeType)) {
        await bridge.discardEmployeeImport?.(result.storageName);
        throw new Error('الملفات المسموحة للسيرة الذاتية PDF وJPG وPNG.');
      }
      if (result.fileSize > 25 * 1024 * 1024) {
        await bridge.discardEmployeeImport?.(result.storageName);
        throw new Error('الحد الأقصى لحجم السيرة الذاتية 25 ميجابايت.');
      }
      if (resume) await bridge.discardEmployeeImport?.(resume.storageName);
      setResume({
        storageName: result.storageName,
        fileName: result.fileName,
        mimeType: result.mimeType,
        fileSize: result.fileSize,
        checksum: result.checksum,
      });
    } catch (error) {
      toast.error(errorMessage(error, 'تعذر رفع السيرة الذاتية.'));
    }
  };

  const submitCandidate = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      service.createCandidate({ ...candidateForm, resume });
      if (resume) {
        const result = await window.ceramisys?.documents?.commitEmployeeImport?.(resume.storageName);
        if (!result?.ok) {
          throw new Error(result?.error || `تم تسجيل المرشح، لكن تعذر تثبيت ملف السيرة الذاتية ${resume.fileName}.`);
        }
      }
      toast.success('تم تسجيل المرشح.');
      setCandidateForm(emptyCandidate);
      setResume(null);
      setShowForm(false);
      setTab('candidates');
      setCandidateJobId('');
      load();
    } catch (error) {
      toast.error(errorMessage(error, 'تعذر تسجيل المرشح.'));
    } finally {
      setSaving(false);
    }
  };

  const changeJobStatus = (job: RecruitmentJob, status: RecruitmentJobStatus) => {
    try {
      service.setJobStatus(job.id, status);
      toast.success(`تم تحديث حالة الوظيفة إلى «${jobStatusLabels[status]}».`);
      load();
    } catch (error) {
      toast.error(errorMessage(error, 'تعذر تحديث حالة الوظيفة.'));
    }
  };

  const changeCandidateStatus = (candidate: RecruitmentCandidate, status: RecruitmentCandidateStatus) => {
    try {
      service.setCandidateStatus(candidate.id, status);
      toast.success('تم تحديث مرحلة المرشح.');
      load();
    } catch (error) {
      toast.error(errorMessage(error, 'تعذر تحديث مرحلة المرشح.'));
    }
  };

  const changeJobApproval = (job: RecruitmentJob, approved: boolean) => {
    try {
      service.approveJob(job.id, approved);
      toast.success(approved ? 'تم اعتماد طلب الاحتياج الوظيفي.' : 'تم رفض طلب الاحتياج الوظيفي.');
      load();
    } catch (error) {
      toast.error(errorMessage(error, 'تعذر تحديث اعتماد الوظيفة.'));
    }
  };

  const changeJobPublication = (job: RecruitmentJob, published: boolean) => {
    try {
      service.setJobPublished(job.id, published);
      toast.success(published ? 'تم نشر إعلان الوظيفة واستقبال الطلبات.' : 'تم إيقاف استقبال الطلبات.');
      load();
    } catch (error) {
      toast.error(errorMessage(error, 'تعذر تحديث نشر الوظيفة.'));
    }
  };

  const beginWorkflow = (candidate: RecruitmentCandidate, selectedTab: WorkflowTab) => {
    try {
      setWorkflowCandidate(candidate);
      setWorkflowTab(selectedTab);
      setWorkflowInterviews(service.getInterviews(candidate.id));
      setWorkflowOffer(service.getOffer(candidate.id));
      setInterviewForm({
        scheduledAt: '',
        interviewer: '',
        location: '',
        score: '0',
        result: 'PENDING',
        evaluation: '',
        selectedInterviewId: '',
      });
      setOfferForm({
        salary: '',
        salaryType: 'MONTHLY',
        offeredAt: localDateString(),
        expiresAt: '',
        terms: '',
      });
    } catch (error) {
      toast.error(errorMessage(error, 'تعذر تحميل بيانات المرشح.'));
    }
  };

  const submitInterview = (event: React.FormEvent) => {
    event.preventDefault();
    if (!workflowCandidate) return;
    try {
      service.scheduleInterview(workflowCandidate.id, {
        scheduledAt: interviewForm.scheduledAt,
        interviewer: interviewForm.interviewer,
        location: interviewForm.location,
      });
      toast.success('تم تحديد المقابلة.');
      setWorkflowCandidate(null);
      load();
    } catch (error) {
      toast.error(errorMessage(error, 'تعذر تحديد المقابلة.'));
    }
  };

  const submitInterviewEvaluation = (event: React.FormEvent) => {
    event.preventDefault();
    if (!interviewForm.selectedInterviewId) {
      toast.error('اختر المقابلة المراد تقييمها.');
      return;
    }
    try {
      service.evaluateInterview(interviewForm.selectedInterviewId, {
        score: Number(interviewForm.score),
        result: interviewForm.result,
        evaluation: interviewForm.evaluation,
      });
      toast.success('تم حفظ تقييم المقابلة.');
      setWorkflowCandidate(null);
      load();
    } catch (error) {
      toast.error(errorMessage(error, 'تعذر حفظ تقييم المقابلة.'));
    }
  };

  const submitOffer = (event: React.FormEvent) => {
    event.preventDefault();
    if (!workflowCandidate) return;
    try {
      const offer = workflowOffer || service.createOffer(workflowCandidate.id, {
        salary: Number(offerForm.salary),
        salaryType: offerForm.salaryType,
        offeredAt: offerForm.offeredAt,
        expiresAt: offerForm.expiresAt || null,
        terms: offerForm.terms,
      });
      const next = offer.status === 'DRAFT'
        ? service.setOfferStatus(workflowCandidate.id, 'SENT')
        : offer.status === 'SENT'
          ? service.setOfferStatus(workflowCandidate.id, 'ACCEPTED')
          : offer;
      toast.success(next.status === 'SENT' ? 'تم إرسال العرض الوظيفي.' : 'تم تسجيل قبول العرض.');
      setWorkflowCandidate(null);
      load();
    } catch (error) {
      toast.error(errorMessage(error, 'تعذر تحديث العرض الوظيفي.'));
    }
  };

  const beginHiring = (candidate: RecruitmentCandidate) => {
    try {
      if (service.getOffer(candidate.id)?.status !== 'ACCEPTED') {
        toast.error('يجب تسجيل قبول العرض الوظيفي أولًا.');
        return;
      }
    } catch (error) {
      toast.error(errorMessage(error, 'تعذر التحقق من حالة العرض.'));
      return;
    }
    setCandidateToHire(candidate);
    setHireForm({
      phone: candidate.phone || '',
      location: candidate.jobLocation || candidate.branchName || '',
      joinedDate: localDateString(),
      baseSalary: '',
      salaryType: 'MONTHLY',
      createDraftContract: canCreateContracts,
    });
  };

  const openResume = async (candidate: RecruitmentCandidate) => {
    if (!candidate.resumeStorageName) return;
    try {
      const result = await window.ceramisys?.documents?.openFile?.(candidate.resumeStorageName);
      if (!result?.ok) throw new Error(result?.error || 'تعذر فتح السيرة الذاتية.');
    } catch (error) {
      toast.error(errorMessage(error, 'تعذر فتح السيرة الذاتية.'));
    }
  };

  const submitHire = (event: React.FormEvent) => {
    event.preventDefault();
    if (!candidateToHire) return;
    setSaving(true);
    try {
      const hired = service.hireCandidate(candidateToHire.id, {
        ...hireForm,
        baseSalary: Number(hireForm.baseSalary),
      });
      toast.success(`تم تعيين ${hired.fullName} وربطه بسجل الموظفين.`);
      setCandidateToHire(null);
      load();
    } catch (error) {
      toast.error(errorMessage(error, 'تعذر إتمام تعيين المرشح.'));
    } finally {
      setSaving(false);
    }
  };

  const visibleJobs = jobs.filter((job) =>
    (jobStatus === 'ALL' || job.status === jobStatus)
      && `${job.title} ${job.department} ${job.location || ''}`.toLowerCase().includes(search.trim().toLowerCase())
  );
  const visibleCandidates = candidates.filter((candidate) =>
    `${candidate.fullName} ${candidate.jobTitle || ''} ${candidate.email || ''} ${candidate.phone || ''}`
      .toLowerCase().includes(search.trim().toLowerCase())
  );
  const openJobs = jobs.filter((job) => job.status === 'OPEN');

  return (
    <div className="space-y-5 p-4 md:p-6">
      <PageHeader
        icon={<BriefcaseBusiness className="h-5 w-5" />}
        title="التوظيف والمرشحون"
        description="إدارة الوظائف الشاغرة ومتابعة المرشحين من التقديم حتى التعيين."
        actions={<>
          <button
            type="button"
            className="rounded-lg border border-line bg-surface p-2 text-ink-secondary hover:bg-surface-muted"
            onClick={load}
            title="تحديث"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {canManage && (
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary"
              onClick={() => setShowForm((value) => !value)}
            >
              {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {showForm ? 'إغلاق' : tab === 'jobs' ? 'وظيفة جديدة' : 'تسجيل مرشح'}
            </button>
          )}
        </>}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="وظائف مفتوحة" value={summary.openJobs} icon={BriefcaseBusiness} tone="bg-accent-soft text-primary" />
        <SummaryCard label="إجمالي المرشحين" value={summary.candidates} icon={Users} tone="bg-accent-soft text-primary" />
        <SummaryCard label="مقابلات" value={summary.interviews} icon={Clock3} tone="bg-warning-soft text-warning" />
        <SummaryCard label="عروض وظيفية" value={summary.offers} icon={FilePlus2} tone="bg-accent-soft text-primary" />
        <SummaryCard label="تم تعيينهم" value={summary.hires} icon={UserRoundCheck} tone="bg-success-soft text-success" />
      </section>

      <div className="flex flex-wrap items-center gap-2 border-b border-line">
        {([
          ['jobs', 'الوظائف الشاغرة', BriefcaseBusiness],
          ['candidates', 'المرشحون', Users],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => { setTab(key); setShowForm(false); setSearch(''); }}
            className={`flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold ${
              tab === key ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
        <label className="relative ms-auto mb-2 min-w-48 flex-1 sm:max-w-xs">
          <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted" />
          <input
            className="w-full rounded-lg border border-line bg-surface py-2 pe-9 ps-3 text-sm"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={tab === 'jobs' ? 'بحث عن وظيفة...' : 'بحث عن مرشح...'}
          />
        </label>
      </div>

      {tab === 'jobs' && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">{visibleJobs.length} وظيفة</p>
          <select
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm"
            value={jobStatus}
            onChange={(event) => setJobStatus(event.target.value as RecruitmentJobStatus | 'ALL')}
          >
            <option value="ALL">كل الحالات</option>
            {Object.entries(jobStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      )}

      {tab === 'candidates' && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">{visibleCandidates.length} مرشح</p>
          <div className="flex flex-wrap gap-2">
            <select
              className="rounded-lg border border-line bg-surface px-3 py-2 text-sm"
              value={candidateJobId}
              onChange={(event) => setCandidateJobId(event.target.value)}
            >
              <option value="">كل الوظائف</option>
              {jobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
            </select>
            <select
              className="rounded-lg border border-line bg-surface px-3 py-2 text-sm"
              value={candidateStatus}
              onChange={(event) => setCandidateStatus(event.target.value as RecruitmentCandidateStatus | 'ALL')}
            >
              <option value="ALL">كل المراحل</option>
              {Object.entries(candidateStatusLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {showForm && canManage && (
        tab === 'jobs' ? (
          <form onSubmit={submitJob} className="rounded-xl border border-line bg-surface p-4">
            <h2 className="mb-4 font-bold text-ink">طلب احتياج وظيفي جديد</h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <label className="text-xs text-ink-secondary">المسمى الوظيفي *
                <input required maxLength={120} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" value={jobForm.title} onChange={(event) => setJobForm({ ...jobForm, title: event.target.value })} />
              </label>
              <label className="text-xs text-ink-secondary">القسم *
                <input required maxLength={100} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" value={jobForm.department} onChange={(event) => setJobForm({ ...jobForm, department: event.target.value })} />
              </label>
              <label className="text-xs text-ink-secondary">الموقع
                <input maxLength={120} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" value={jobForm.location} onChange={(event) => setJobForm({ ...jobForm, location: event.target.value })} />
              </label>
              <label className="text-xs text-ink-secondary">نوع التوظيف
                <select className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm" value={jobForm.employmentType} onChange={(event) => setJobForm({ ...jobForm, employmentType: event.target.value as RecruitmentEmploymentType })}>
                  {Object.entries(employmentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="text-xs text-ink-secondary">عدد الشواغر
                <input required min="1" step="1" type="number" className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" value={jobForm.openings} onChange={(event) => setJobForm({ ...jobForm, openings: event.target.value })} />
              </label>
              <label className="text-xs text-ink-secondary md:col-span-2 xl:col-span-3">وصف الوظيفة
                <textarea rows={2} maxLength={2000} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" value={jobForm.description} onChange={(event) => setJobForm({ ...jobForm, description: event.target.value })} />
              </label>
              <label className="text-xs text-ink-secondary md:col-span-2 xl:col-span-3">المتطلبات
                <textarea rows={2} maxLength={2000} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" value={jobForm.requirements} onChange={(event) => setJobForm({ ...jobForm, requirements: event.target.value })} />
              </label>
            </div>
            <div className="mt-4 flex justify-end">
              <button disabled={saving} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} حفظ الوظيفة
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={submitCandidate} className="rounded-xl border border-line bg-surface p-4">
            <h2 className="mb-4 font-bold text-ink">تسجيل مرشح</h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <label className="text-xs text-ink-secondary">الوظيفة *
                <select required className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm" value={candidateForm.jobId} onChange={(event) => setCandidateForm({ ...candidateForm, jobId: event.target.value })}>
                  <option value="">اختر وظيفة مفتوحة</option>
                  {openJobs.map((job) => <option key={job.id} value={job.id}>{job.title} — {job.department}</option>)}
                </select>
              </label>
              <label className="text-xs text-ink-secondary">اسم المرشح *
                <input required maxLength={150} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" value={candidateForm.fullName} onChange={(event) => setCandidateForm({ ...candidateForm, fullName: event.target.value })} />
              </label>
              <label className="text-xs text-ink-secondary">رقم الهاتف
                <input maxLength={40} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" value={candidateForm.phone} onChange={(event) => setCandidateForm({ ...candidateForm, phone: event.target.value })} />
              </label>
              <label className="text-xs text-ink-secondary">البريد الإلكتروني
                <input type="email" maxLength={160} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" value={candidateForm.email} onChange={(event) => setCandidateForm({ ...candidateForm, email: event.target.value })} />
              </label>
              <label className="text-xs text-ink-secondary">مصدر الترشيح
                <input maxLength={100} placeholder="إحالة، إعلان، موقع توظيف..." className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" value={candidateForm.source} onChange={(event) => setCandidateForm({ ...candidateForm, source: event.target.value })} />
              </label>
              <label className="text-xs text-ink-secondary md:col-span-2 xl:col-span-3">ملاحظات
                <textarea rows={2} maxLength={2000} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" value={candidateForm.notes} onChange={(event) => setCandidateForm({ ...candidateForm, notes: event.target.value })} />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" onClick={importResume} className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink hover:bg-surface-muted">
                إرفاق السيرة الذاتية
              </button>
              <span className="text-xs text-muted">{resume ? resume.fileName : 'PDF أو JPG أو PNG، بحد أقصى 25 ميجابايت'}</span>
              {resume && (
                <button type="button" onClick={async () => {
                  await window.ceramisys?.documents?.discardEmployeeImport?.(resume.storageName);
                  setResume(null);
                }} className="text-xs text-danger hover:text-danger">
                  إزالة الملف
                </button>
              )}
            </div>
            {openJobs.length === 0 && <p className="mt-3 text-xs text-warning">افتح وظيفة شاغرة أولًا لإضافة مرشح.</p>}
            <div className="mt-4 flex justify-end">
              <button disabled={saving || openJobs.length === 0} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} حفظ المرشح
              </button>
            </div>
          </form>
        )
      )}

      {workflowCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/40 p-4">
          <section className="w-full max-w-2xl rounded-2xl bg-surface p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-bold text-ink">استكمال إجراءات {workflowCandidate.fullName}</h2>
                <p className="mt-1 text-xs text-muted">{workflowCandidate.jobTitle}</p>
              </div>
              <button type="button" onClick={() => setWorkflowCandidate(null)} className="rounded-lg p-1 text-muted hover:bg-surface-sunken" aria-label="إغلاق">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mb-4 flex gap-2 border-b border-line">
              <button type="button" onClick={() => setWorkflowTab('interview')} className={`border-b-2 px-3 py-2 text-sm font-semibold ${workflowTab === 'interview' ? 'border-primary text-primary' : 'border-transparent text-muted'}`}>المقابلات والتقييم</button>
              <button type="button" onClick={() => setWorkflowTab('offer')} className={`border-b-2 px-3 py-2 text-sm font-semibold ${workflowTab === 'offer' ? 'border-primary text-primary' : 'border-transparent text-muted'}`}>العرض الوظيفي</button>
            </div>

            {workflowTab === 'interview' ? (
              <div className="space-y-5">
                <form onSubmit={submitInterview} className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs text-ink-secondary">موعد المقابلة *
                    <input required type="datetime-local" className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" value={interviewForm.scheduledAt} onChange={(event) => setInterviewForm({ ...interviewForm, scheduledAt: event.target.value })} />
                  </label>
                  <label className="text-xs text-ink-secondary">القائم بالمقابلة *
                    <input required maxLength={150} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" value={interviewForm.interviewer} onChange={(event) => setInterviewForm({ ...interviewForm, interviewer: event.target.value })} />
                  </label>
                  <label className="text-xs text-ink-secondary sm:col-span-2">المكان أو رابط المقابلة
                    <input maxLength={200} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" value={interviewForm.location} onChange={(event) => setInterviewForm({ ...interviewForm, location: event.target.value })} />
                  </label>
                  <div className="sm:col-span-2 flex justify-end">
                    <button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">تحديد المقابلة</button>
                  </div>
                </form>
                <div className="border-t border-line pt-4">
                  <h3 className="mb-3 text-sm font-bold text-ink">تسجيل نتيجة وتقييم</h3>
                  {workflowInterviews.length ? (
                    <form onSubmit={submitInterviewEvaluation} className="grid gap-3 sm:grid-cols-2">
                      <label className="text-xs text-ink-secondary sm:col-span-2">المقابلة
                        <select required className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm" value={interviewForm.selectedInterviewId} onChange={(event) => setInterviewForm({ ...interviewForm, selectedInterviewId: event.target.value })}>
                          <option value="">اختر مقابلة</option>
                          {workflowInterviews.filter((interview) => interview.status !== 'CANCELLED').map((interview) => (
                            <option key={interview.id} value={interview.id}>
                              {formatDate(interview.scheduledAt.slice(0, 10))} — {interview.interviewer} {interview.result ? `(${interview.result})` : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs text-ink-secondary">التقييم (0–100)
                        <input required min="0" max="100" step="1" type="number" className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" value={interviewForm.score} onChange={(event) => setInterviewForm({ ...interviewForm, score: event.target.value })} />
                      </label>
                      <label className="text-xs text-ink-secondary">النتيجة
                        <select className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm" value={interviewForm.result} onChange={(event) => setInterviewForm({ ...interviewForm, result: event.target.value as 'PASS' | 'FAIL' | 'PENDING' })}>
                          <option value="PASS">اجتاز</option><option value="FAIL">لم يجتز</option><option value="PENDING">معلّق</option>
                        </select>
                      </label>
                      <label className="text-xs text-ink-secondary sm:col-span-2">ملاحظات التقييم
                        <textarea rows={2} maxLength={2000} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" value={interviewForm.evaluation} onChange={(event) => setInterviewForm({ ...interviewForm, evaluation: event.target.value })} />
                      </label>
                      <div className="sm:col-span-2 flex justify-end">
                        <button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">حفظ التقييم</button>
                      </div>
                    </form>
                  ) : <p className="text-xs text-muted">حدد مقابلة أولًا لتسجيل نتيجتها.</p>}
                </div>
              </div>
            ) : workflowOffer ? (
              <div className="space-y-4">
                <div className="rounded-lg bg-surface-muted p-4 text-sm">
                  <p>الراتب المعروض: <strong>{workflowOffer.salary.toLocaleString('ar-EG')} {workflowOffer.salaryType === 'MONTHLY' ? 'شهريًا' : 'يوميًا'}</strong></p>
                  <p className="mt-1 text-xs text-muted">حالة العرض: {workflowOffer.status === 'DRAFT' ? 'مسودة' : workflowOffer.status === 'SENT' ? 'مرسل — بانتظار الموافقة' : workflowOffer.status === 'ACCEPTED' ? 'مقبول' : workflowOffer.status === 'DECLINED' ? 'مرفوض' : 'مسحوب'}</p>
                  {workflowOffer.terms && <p className="mt-2 text-xs text-ink-secondary">{workflowOffer.terms}</p>}
                </div>
                {['DRAFT', 'SENT'].includes(workflowOffer.status) && (
                  <form onSubmit={submitOffer} className="flex justify-end">
                    <button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">
                      {workflowOffer.status === 'DRAFT' ? 'إرسال العرض للمرشح' : 'تسجيل موافقة المرشح'}
                    </button>
                  </form>
                )}
                {workflowOffer.status === 'ACCEPTED' && <p className="text-sm font-semibold text-success">تم قبول العرض؛ يمكن استكمال إنشاء ملف الموظف والعقد.</p>}
              </div>
            ) : (
              <form onSubmit={submitOffer} className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-ink-secondary">الراتب المعروض *
                  <input required min="0" step="0.01" type="number" className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" value={offerForm.salary} onChange={(event) => setOfferForm({ ...offerForm, salary: event.target.value })} />
                </label>
                <label className="text-xs text-ink-secondary">دورة الراتب
                  <select className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm" value={offerForm.salaryType} onChange={(event) => setOfferForm({ ...offerForm, salaryType: event.target.value as 'MONTHLY' | 'DAILY' })}>
                    <option value="MONTHLY">شهري</option><option value="DAILY">يومي</option>
                  </select>
                </label>
                <label className="text-xs text-ink-secondary">تاريخ العرض *
                  <input required type="date" className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" value={offerForm.offeredAt} onChange={(event) => setOfferForm({ ...offerForm, offeredAt: event.target.value })} />
                </label>
                <label className="text-xs text-ink-secondary">صالح حتى
                  <input type="date" className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" value={offerForm.expiresAt} onChange={(event) => setOfferForm({ ...offerForm, expiresAt: event.target.value })} />
                </label>
                <label className="text-xs text-ink-secondary sm:col-span-2">الشروط والمزايا
                  <textarea rows={2} maxLength={2000} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" value={offerForm.terms} onChange={(event) => setOfferForm({ ...offerForm, terms: event.target.value })} />
                </label>
                <div className="sm:col-span-2 flex justify-end">
                  <button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">حفظ وإرسال العرض</button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}

      {candidateToHire && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/40 p-4">
          <form onSubmit={submitHire} className="w-full max-w-xl rounded-2xl bg-surface p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-bold text-ink">إتمام تعيين {candidateToHire.fullName}</h2>
                <p className="mt-1 text-xs text-muted">سيُنشأ سجل الموظف في فرع الوظيفة ويظهر في دليل الموظفين والرواتب والحضور.</p>
              </div>
              <button type="button" onClick={() => setCandidateToHire(null)} className="rounded-lg p-1 text-muted hover:bg-surface-sunken" aria-label="إغلاق">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-ink-secondary">رقم الهاتف *
                <input required maxLength={40} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" value={hireForm.phone} onChange={(event) => setHireForm({ ...hireForm, phone: event.target.value })} />
              </label>
              <label className="text-xs text-ink-secondary">موقع العمل
                <input maxLength={120} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" value={hireForm.location} onChange={(event) => setHireForm({ ...hireForm, location: event.target.value })} />
              </label>
              <label className="text-xs text-ink-secondary">تاريخ الالتحاق *
                <input required type="date" className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" value={hireForm.joinedDate} onChange={(event) => setHireForm({ ...hireForm, joinedDate: event.target.value })} />
              </label>
              <label className="text-xs text-ink-secondary">الراتب الأساسي *
                <input required min="0" step="0.01" type="number" className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" value={hireForm.baseSalary} onChange={(event) => setHireForm({ ...hireForm, baseSalary: event.target.value })} />
              </label>
              <label className="text-xs text-ink-secondary">دورة احتساب الراتب
                <select className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm" value={hireForm.salaryType} onChange={(event) => setHireForm({ ...hireForm, salaryType: event.target.value as 'MONTHLY' | 'DAILY' })}>
                  <option value="MONTHLY">شهري</option>
                  <option value="DAILY">يومي</option>
                </select>
              </label>
              {canCreateContracts && (
                <label className="flex items-center gap-2 self-end rounded-lg border border-line p-3 text-xs text-ink sm:col-span-2">
                  <input type="checkbox" checked={hireForm.createDraftContract} onChange={(event) => setHireForm({ ...hireForm, createDraftContract: event.target.checked })} />
                  إنشاء مسودة عقد مرتبطة بالموظف الجديد
                </label>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setCandidateToHire(null)} className="rounded-lg border border-line px-4 py-2 text-sm text-ink-secondary">إلغاء</button>
              <button disabled={saving} className="flex items-center gap-2 rounded-lg bg-success px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} تأكيد التعيين
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
      ) : tab === 'jobs' ? (
        visibleJobs.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {visibleJobs.map((job) => (
              <article key={job.id} className="rounded-xl border border-line bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-bold text-ink">{job.title}</h2>
                    <p className="mt-1 text-sm text-muted">{job.department}{job.location ? ` • ${job.location}` : ''}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${jobStatusStyles[job.status]}`}>{jobStatusLabels[job.status]}</span>
                </div>
                <p className={`mt-2 text-xs font-semibold ${
                  job.approvalStatus === 'APPROVED' ? 'text-success'
                    : job.approvalStatus === 'REJECTED' ? 'text-danger' : 'text-warning'
                }`}>
                  اعتماد الاحتياج: {job.approvalStatus === 'APPROVED' ? 'معتمد' : job.approvalStatus === 'REJECTED' ? 'مرفوض' : 'بانتظار الاعتماد'}
                  {job.isPublished ? ' • الإعلان منشور' : ''}
                </p>
                <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted">
                  <span>{employmentLabels[job.employmentType]}</span>
                  <span>{job.hiredCount || 0} من {job.openings} تم تعيينهم</span>
                  <span>{job.branchName || 'الفرع'}</span>
                </div>
                {job.description && <p className="mt-3 line-clamp-2 text-sm text-ink-secondary">{job.description}</p>}
                <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
                  <span className="text-xs text-muted">أضيفت {formatDate(job.createdAt.slice(0, 10))}</span>
                  {canManage && (
                    <div className="flex flex-wrap items-center gap-2">
                      {job.approvalStatus === 'PENDING' && (
                        <>
                          <button type="button" onClick={() => changeJobApproval(job, true)} className="rounded-lg bg-success px-2.5 py-1.5 text-xs font-semibold text-white">اعتماد الطلب</button>
                          <button type="button" onClick={() => changeJobApproval(job, false)} className="rounded-lg border border-danger-border px-2.5 py-1.5 text-xs font-semibold text-danger">رفض</button>
                        </>
                      )}
                      {job.approvalStatus === 'APPROVED' && job.status !== 'CLOSED' && (
                        <button
                          type="button"
                          onClick={() => changeJobPublication(job, !job.isPublished)}
                          className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                            job.isPublished ? 'border border-warning-border text-warning' : 'bg-primary text-white'
                          }`}
                        >
                          {job.isPublished ? 'إيقاف استقبال الطلبات' : 'نشر الإعلان'}
                        </button>
                      )}
                      {job.approvalStatus === 'APPROVED' && job.isPublished && job.status !== 'CLOSED' && (
                        <select
                          aria-label={`حالة الوظيفة ${job.title}`}
                          className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs"
                          value={job.status}
                          onChange={(event) => changeJobStatus(job, event.target.value as RecruitmentJobStatus)}
                        >
                          {Object.entries(jobStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      )}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-line-strong bg-surface py-14 text-center text-sm text-muted">لا توجد وظائف تطابق البحث أو عوامل التصفية.</div>
        )
      ) : visibleCandidates.length ? (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <DataTable
            ariaLabel="المرشحون"
            rows={visibleCandidates}
            rowKey={(candidate: any) => String(candidate.id)}
            tableClassName="text-sm"
            rowClassName={() => 'transition hover:bg-surface-muted'}
            columns={[
              {
                key: 'candidate', header: 'المرشح',
                render: (candidate: any) => (
                  <span className="flex items-center gap-2">
                    <UserRound className="h-4 w-4 shrink-0 text-muted" />
                    <span>
                      <span className="block font-semibold text-ink">{candidate.fullName}</span>
                      {candidate.notes && <span className="mt-0.5 block max-w-48 truncate text-xs text-muted">{candidate.notes}</span>}
                      {candidate.resumeStorageName && (
                        <button type="button" onClick={() => openResume(candidate)} className="mt-1 text-xs font-medium text-primary hover:text-primary">
                          السيرة الذاتية: {candidate.resumeFileName || 'فتح الملف'}
                        </button>
                      )}
                    </span>
                  </span>
                ),
              },
              { key: 'job', header: 'الوظيفة', render: (candidate: any) => <span className="text-ink-secondary">{candidate.jobTitle}</span> },
              { key: 'contact', header: 'التواصل', render: (candidate: any) => <span className="text-xs text-muted">{candidate.phone || candidate.email}</span> },
              { key: 'source', header: 'المصدر', render: (candidate: any) => <span className="text-muted">{candidate.source || '—'}</span> },
              { key: 'date', header: 'تاريخ التقديم', render: (candidate: any) => <span className="whitespace-nowrap text-muted">{formatDate(candidate.appliedAt)}</span> },
              {
                key: 'stage', header: 'المرحلة',
                render: (candidate: any) => {
                  const cls = candidateStatusStyles[candidate.status as keyof typeof candidateStatusStyles];
                  const lbl = candidateStatusLabels[candidate.status as keyof typeof candidateStatusLabels];
                  return candidate.status === 'HIRED' ? (
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${cls}`}>{lbl}</span>
                  ) : canManage && candidate.status !== 'OFFER' ? (
                    <select
                      aria-label={`مرحلة المرشح ${candidate.fullName}`}
                      className={`rounded-full border px-2.5 py-1.5 text-xs font-semibold ${cls}`}
                      value={candidate.status}
                      onChange={(event) => changeCandidateStatus(candidate, event.target.value as RecruitmentCandidateStatus)}
                    >
                      <option value={candidate.status}>{candidateStatusLabels[candidate.status as keyof typeof candidateStatusLabels]}</option>
                      {(candidateNextStatuses[candidate.status as keyof typeof candidateNextStatuses] ?? []).map((value: any) => <option key={value} value={value}>{candidateStatusLabels[value as keyof typeof candidateStatusLabels]}</option>)}
                    </select>
                  ) : (
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${cls}`}>{lbl}</span>
                  );
                },
              },
              {
                key: 'action', header: 'الإجراء',
                render: (candidate: any) => (
                  <span className="flex flex-col items-start gap-1.5 whitespace-nowrap">
                    {candidate.employeeId ? (
                      <Link
                        to={`/employees?search=${encodeURIComponent(candidate.fullName)}`}
                        className="text-xs font-semibold text-primary hover:text-primary"
                      >
                        عرض سجل الموظف
                      </Link>
                    ) : canManage && ['SCREENING', 'INTERVIEW'].includes(candidate.status) ? (
                      <button
                        type="button"
                        onClick={() => beginWorkflow(candidate, 'interview')}
                        className="flex items-center gap-1 rounded-lg border border-warning-border px-2.5 py-1.5 text-xs font-semibold text-warning"
                      >
                        <CalendarPlus className="h-3.5 w-3.5" />
                        {candidate.status === 'SCREENING' ? 'تحديد مقابلة' : 'المقابلات والتقييم'}
                      </button>
                    ) : null}
                    {candidate.employeeContractId && (
                      <Link
                        to={`/employees/contracts?employeeId=${encodeURIComponent(candidate.employeeId || '')}`}
                        className="text-xs font-semibold text-primary hover:text-primary"
                      >
                        عرض العقد
                      </Link>
                    )}
                    {canManage && ['INTERVIEW', 'OFFER'].includes(candidate.status) && (
                      <button
                        type="button"
                        onClick={() => beginWorkflow(candidate, 'offer')}
                        className="rounded-lg border border-accent-border px-2.5 py-1.5 text-xs font-semibold text-primary"
                      >
                        العرض الوظيفي
                      </button>
                    )}
                    {!candidate.employeeId && candidate.status === 'OFFER' && canHire && (
                      <button type="button" onClick={() => beginHiring(candidate)} className="rounded-lg bg-success px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-success">
                        إتمام التعيين
                      </button>
                    )}
                    {!candidate.employeeId && candidate.status === 'OFFER' && !canHire && (
                      <span className="text-xs text-muted">يلزم صلاحية إدارة الموظفين</span>
                    )}
                  </span>
                ),
              },
            ]}
          />
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-line-strong bg-surface py-14 text-center text-sm text-muted">لا يوجد مرشحون لهذه الوظائف أو المرحلة.</div>
      )}
    </div>
  );
};
