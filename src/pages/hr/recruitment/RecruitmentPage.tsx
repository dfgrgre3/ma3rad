import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BriefcaseBusiness, Clock3, FilePlus2, Loader2, Plus, RefreshCw,
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
  RecruitmentJob,
  RecruitmentJobStatus,
  RecruitmentSummary,
} from '../../../types/hr/recruitment';

type Tab = 'jobs' | 'candidates';

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
  OPEN: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  ON_HOLD: 'bg-amber-50 text-amber-700 border-amber-200',
  CLOSED: 'bg-slate-100 text-slate-600 border-slate-200',
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
  NEW: 'bg-sky-50 text-sky-700 border-sky-200',
  SCREENING: 'bg-violet-50 text-violet-700 border-violet-200',
  INTERVIEW: 'bg-amber-50 text-amber-700 border-amber-200',
  OFFER: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  HIRED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  REJECTED: 'bg-rose-50 text-rose-700 border-rose-200',
};

const candidateNextStatuses: Record<Exclude<RecruitmentCandidateStatus, 'HIRED'>, RecruitmentCandidateStatus[]> = {
  NEW: ['SCREENING', 'REJECTED'],
  SCREENING: ['INTERVIEW', 'REJECTED'],
  INTERVIEW: ['SCREENING', 'OFFER', 'REJECTED'],
  OFFER: ['INTERVIEW', 'REJECTED'],
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
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${tone}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-xl font-bold text-slate-900">{value}</p>
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
  const [candidateToHire, setCandidateToHire] = useState<RecruitmentCandidate | null>(null);
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

  const submitCandidate = (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      service.createCandidate(candidateForm);
      toast.success('تم تسجيل المرشح.');
      setCandidateForm(emptyCandidate);
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

  const beginHiring = (candidate: RecruitmentCandidate) => {
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
    <div className="space-y-5 p-4 md:p-6" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <BriefcaseBusiness className="h-5 w-5 text-sky-600" /> التوظيف والمرشحون
          </h1>
          <p className="mt-1 text-sm text-slate-500">إدارة الوظائف الشاغرة ومتابعة المرشحين من التقديم حتى التعيين.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
            onClick={load}
            title="تحديث"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {canManage && (
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700"
              onClick={() => setShowForm((value) => !value)}
            >
              {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {showForm ? 'إغلاق' : tab === 'jobs' ? 'وظيفة جديدة' : 'تسجيل مرشح'}
            </button>
          )}
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="وظائف مفتوحة" value={summary.openJobs} icon={BriefcaseBusiness} tone="bg-sky-50 text-sky-700" />
        <SummaryCard label="إجمالي المرشحين" value={summary.candidates} icon={Users} tone="bg-violet-50 text-violet-700" />
        <SummaryCard label="مقابلات" value={summary.interviews} icon={Clock3} tone="bg-amber-50 text-amber-700" />
        <SummaryCard label="عروض وظيفية" value={summary.offers} icon={FilePlus2} tone="bg-indigo-50 text-indigo-700" />
        <SummaryCard label="تم تعيينهم" value={summary.hires} icon={UserRoundCheck} tone="bg-emerald-50 text-emerald-700" />
      </section>

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200">
        {([
          ['jobs', 'الوظائف الشاغرة', BriefcaseBusiness],
          ['candidates', 'المرشحون', Users],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => { setTab(key); setShowForm(false); setSearch(''); }}
            className={`flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold ${
              tab === key ? 'border-sky-600 text-sky-700' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
        <label className="relative ms-auto mb-2 min-w-48 flex-1 sm:max-w-xs">
          <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pe-9 ps-3 text-sm"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={tab === 'jobs' ? 'بحث عن وظيفة...' : 'بحث عن مرشح...'}
          />
        </label>
      </div>

      {tab === 'jobs' && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500">{visibleJobs.length} وظيفة</p>
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
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
          <p className="text-sm text-slate-500">{visibleCandidates.length} مرشح</p>
          <div className="flex flex-wrap gap-2">
            <select
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              value={candidateJobId}
              onChange={(event) => setCandidateJobId(event.target.value)}
            >
              <option value="">كل الوظائف</option>
              {jobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
            </select>
            <select
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
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
          <form onSubmit={submitJob} className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-4 font-bold text-slate-800">فتح وظيفة شاغرة</h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <label className="text-xs text-slate-600">المسمى الوظيفي *
                <input required maxLength={120} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={jobForm.title} onChange={(event) => setJobForm({ ...jobForm, title: event.target.value })} />
              </label>
              <label className="text-xs text-slate-600">القسم *
                <input required maxLength={100} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={jobForm.department} onChange={(event) => setJobForm({ ...jobForm, department: event.target.value })} />
              </label>
              <label className="text-xs text-slate-600">الموقع
                <input maxLength={120} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={jobForm.location} onChange={(event) => setJobForm({ ...jobForm, location: event.target.value })} />
              </label>
              <label className="text-xs text-slate-600">نوع التوظيف
                <select className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={jobForm.employmentType} onChange={(event) => setJobForm({ ...jobForm, employmentType: event.target.value as RecruitmentEmploymentType })}>
                  {Object.entries(employmentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="text-xs text-slate-600">عدد الشواغر
                <input required min="1" step="1" type="number" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={jobForm.openings} onChange={(event) => setJobForm({ ...jobForm, openings: event.target.value })} />
              </label>
              <label className="text-xs text-slate-600 md:col-span-2 xl:col-span-3">وصف الوظيفة
                <textarea rows={2} maxLength={2000} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={jobForm.description} onChange={(event) => setJobForm({ ...jobForm, description: event.target.value })} />
              </label>
              <label className="text-xs text-slate-600 md:col-span-2 xl:col-span-3">المتطلبات
                <textarea rows={2} maxLength={2000} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={jobForm.requirements} onChange={(event) => setJobForm({ ...jobForm, requirements: event.target.value })} />
              </label>
            </div>
            <div className="mt-4 flex justify-end">
              <button disabled={saving} className="flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} حفظ الوظيفة
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={submitCandidate} className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-4 font-bold text-slate-800">تسجيل مرشح</h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <label className="text-xs text-slate-600">الوظيفة *
                <select required className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={candidateForm.jobId} onChange={(event) => setCandidateForm({ ...candidateForm, jobId: event.target.value })}>
                  <option value="">اختر وظيفة مفتوحة</option>
                  {openJobs.map((job) => <option key={job.id} value={job.id}>{job.title} — {job.department}</option>)}
                </select>
              </label>
              <label className="text-xs text-slate-600">اسم المرشح *
                <input required maxLength={150} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={candidateForm.fullName} onChange={(event) => setCandidateForm({ ...candidateForm, fullName: event.target.value })} />
              </label>
              <label className="text-xs text-slate-600">رقم الهاتف
                <input maxLength={40} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={candidateForm.phone} onChange={(event) => setCandidateForm({ ...candidateForm, phone: event.target.value })} />
              </label>
              <label className="text-xs text-slate-600">البريد الإلكتروني
                <input type="email" maxLength={160} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={candidateForm.email} onChange={(event) => setCandidateForm({ ...candidateForm, email: event.target.value })} />
              </label>
              <label className="text-xs text-slate-600">مصدر الترشيح
                <input maxLength={100} placeholder="إحالة، إعلان، موقع توظيف..." className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={candidateForm.source} onChange={(event) => setCandidateForm({ ...candidateForm, source: event.target.value })} />
              </label>
              <label className="text-xs text-slate-600 md:col-span-2 xl:col-span-3">ملاحظات
                <textarea rows={2} maxLength={2000} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={candidateForm.notes} onChange={(event) => setCandidateForm({ ...candidateForm, notes: event.target.value })} />
              </label>
            </div>
            {openJobs.length === 0 && <p className="mt-3 text-xs text-amber-700">افتح وظيفة شاغرة أولًا لإضافة مرشح.</p>}
            <div className="mt-4 flex justify-end">
              <button disabled={saving || openJobs.length === 0} className="flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} حفظ المرشح
              </button>
            </div>
          </form>
        )
      )}

      {candidateToHire && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <form onSubmit={submitHire} className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl" dir="rtl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-bold text-slate-900">إتمام تعيين {candidateToHire.fullName}</h2>
                <p className="mt-1 text-xs text-slate-500">سيُنشأ سجل الموظف في فرع الوظيفة ويظهر في دليل الموظفين والرواتب والحضور.</p>
              </div>
              <button type="button" onClick={() => setCandidateToHire(null)} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100" aria-label="إغلاق">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-slate-600">رقم الهاتف *
                <input required maxLength={40} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={hireForm.phone} onChange={(event) => setHireForm({ ...hireForm, phone: event.target.value })} />
              </label>
              <label className="text-xs text-slate-600">موقع العمل
                <input maxLength={120} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={hireForm.location} onChange={(event) => setHireForm({ ...hireForm, location: event.target.value })} />
              </label>
              <label className="text-xs text-slate-600">تاريخ الالتحاق *
                <input required type="date" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={hireForm.joinedDate} onChange={(event) => setHireForm({ ...hireForm, joinedDate: event.target.value })} />
              </label>
              <label className="text-xs text-slate-600">الراتب الأساسي *
                <input required min="0" step="0.01" type="number" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={hireForm.baseSalary} onChange={(event) => setHireForm({ ...hireForm, baseSalary: event.target.value })} />
              </label>
              <label className="text-xs text-slate-600">دورة احتساب الراتب
                <select className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={hireForm.salaryType} onChange={(event) => setHireForm({ ...hireForm, salaryType: event.target.value as 'MONTHLY' | 'DAILY' })}>
                  <option value="MONTHLY">شهري</option>
                  <option value="DAILY">يومي</option>
                </select>
              </label>
              {canCreateContracts && (
                <label className="flex items-center gap-2 self-end rounded-lg border border-slate-200 p-3 text-xs text-slate-700 sm:col-span-2">
                  <input type="checkbox" checked={hireForm.createDraftContract} onChange={(event) => setHireForm({ ...hireForm, createDraftContract: event.target.checked })} />
                  إنشاء مسودة عقد مرتبطة بالموظف الجديد
                </label>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setCandidateToHire(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600">إلغاء</button>
              <button disabled={saving} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} تأكيد التعيين
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-sky-600" /></div>
      ) : tab === 'jobs' ? (
        visibleJobs.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {visibleJobs.map((job) => (
              <article key={job.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-bold text-slate-900">{job.title}</h2>
                    <p className="mt-1 text-sm text-slate-500">{job.department}{job.location ? ` • ${job.location}` : ''}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${jobStatusStyles[job.status]}`}>{jobStatusLabels[job.status]}</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500">
                  <span>{employmentLabels[job.employmentType]}</span>
                  <span>{job.hiredCount || 0} من {job.openings} تم تعيينهم</span>
                  <span>{job.branchName || 'الفرع'}</span>
                </div>
                {job.description && <p className="mt-3 line-clamp-2 text-sm text-slate-600">{job.description}</p>}
                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                  <span className="text-xs text-slate-400">أضيفت {formatDate(job.createdAt.slice(0, 10))}</span>
                  {canManage && (
                    <select
                      aria-label={`حالة الوظيفة ${job.title}`}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
                      value={job.status}
                      onChange={(event) => changeJobStatus(job, event.target.value as RecruitmentJobStatus)}
                    >
                      {Object.entries(jobStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white py-14 text-center text-sm text-slate-500">لا توجد وظائف تطابق البحث أو عوامل التصفية.</div>
        )
      ) : visibleCandidates.length ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-right text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">المرشح</th>
                <th className="px-4 py-3 font-semibold">الوظيفة</th>
                <th className="px-4 py-3 font-semibold">التواصل</th>
                <th className="px-4 py-3 font-semibold">المصدر</th>
                <th className="px-4 py-3 font-semibold">تاريخ التقديم</th>
                <th className="px-4 py-3 font-semibold">المرحلة</th>
                <th className="px-4 py-3 font-semibold">الإجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleCandidates.map((candidate) => (
                <tr key={candidate.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <UserRound className="h-4 w-4 shrink-0 text-slate-400" />
                      <div>
                        <p className="font-semibold text-slate-800">{candidate.fullName}</p>
                        {candidate.notes && <p className="mt-0.5 max-w-48 truncate text-xs text-slate-400">{candidate.notes}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{candidate.jobTitle}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{candidate.phone || candidate.email}</td>
                  <td className="px-4 py-3 text-slate-500">{candidate.source || '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-500">{formatDate(candidate.appliedAt)}</td>
                  <td className="px-4 py-3">
                    {candidate.status === 'HIRED' ? (
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${candidateStatusStyles[candidate.status]}`}>{candidateStatusLabels[candidate.status]}</span>
                    ) : canManage ? (
                      <select
                        aria-label={`مرحلة المرشح ${candidate.fullName}`}
                        className={`rounded-full border px-2.5 py-1.5 text-xs font-semibold ${candidateStatusStyles[candidate.status]}`}
                        value={candidate.status}
                        onChange={(event) => changeCandidateStatus(candidate, event.target.value as RecruitmentCandidateStatus)}
                      >
                        <option value={candidate.status}>{candidateStatusLabels[candidate.status]}</option>
                        {candidateNextStatuses[candidate.status].map((value) => <option key={value} value={value}>{candidateStatusLabels[value]}</option>)}
                      </select>
                    ) : (
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${candidateStatusStyles[candidate.status]}`}>{candidateStatusLabels[candidate.status]}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {candidate.employeeId ? (
                      <div className="flex flex-col items-start gap-1">
                        <Link
                          to={`/employees?search=${encodeURIComponent(candidate.fullName)}`}
                          className="text-xs font-semibold text-sky-700 hover:text-sky-900"
                        >
                          عرض سجل الموظف
                        </Link>
                        {candidate.employeeContractId && (
                          <Link
                            to={`/employees/contracts?employeeId=${encodeURIComponent(candidate.employeeId)}`}
                            className="text-xs font-semibold text-violet-700 hover:text-violet-900"
                          >
                            عرض العقد
                          </Link>
                        )}
                      </div>
                    ) : candidate.status === 'OFFER' && canHire ? (
                      <button type="button" onClick={() => beginHiring(candidate)} className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">
                        إتمام التعيين
                      </button>
                    ) : candidate.status === 'OFFER' && !canHire ? (
                      <span className="text-xs text-slate-400">يلزم صلاحية إدارة الموظفين</span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white py-14 text-center text-sm text-slate-500">لا يوجد مرشحون لهذه الوظائف أو المرحلة.</div>
      )}
    </div>
  );
};
