export type RecruitmentJobStatus = 'OPEN' | 'ON_HOLD' | 'CLOSED';
export type RecruitmentApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type RecruitmentEmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'TEMPORARY' | 'INTERNSHIP';
export type RecruitmentCandidateStatus = 'NEW' | 'SCREENING' | 'INTERVIEW' | 'OFFER' | 'HIRED' | 'REJECTED';
export type RecruitmentInterviewResult = 'PASS' | 'FAIL' | 'PENDING';
export type RecruitmentOfferStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'DECLINED' | 'WITHDRAWN';

export interface RecruitmentJob {
  id: string;
  title: string;
  department: string;
  location: string | null;
  employmentType: RecruitmentEmploymentType;
  openings: number;
  hiredCount: number;
  description: string | null;
  requirements: string | null;
  status: RecruitmentJobStatus;
  approvalStatus: RecruitmentApprovalStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  isPublished: number;
  branchId: string;
  branchName?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecruitmentCandidate {
  id: string;
  jobId: string;
  jobTitle?: string;
  jobLocation?: string | null;
  jobEmploymentType?: RecruitmentEmploymentType;
  branchId: string;
  branchName?: string | null;
  fullName: string;
  phone: string | null;
  email: string | null;
  source: string | null;
  status: RecruitmentCandidateStatus;
  employeeId: string | null;
  employeeContractId?: string | null;
  hiredAt: string | null;
  appliedAt: string;
  notes: string | null;
  resumeStorageName: string | null;
  resumeFileName: string | null;
  resumeMimeType: string | null;
  resumeFileSize: number | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRecruitmentJobDTO {
  title: string;
  department: string;
  location?: string | null;
  employmentType: RecruitmentEmploymentType;
  openings: number;
  description?: string | null;
  requirements?: string | null;
}

export interface CreateRecruitmentCandidateDTO {
  jobId: string;
  fullName: string;
  phone?: string | null;
  email?: string | null;
  source?: string | null;
  notes?: string | null;
  resume?: RecruitmentResumeInput | null;
}

export interface RecruitmentResumeInput {
  storageName: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  checksum: string;
}

export interface RecruitmentInterview {
  id: string;
  candidateId: string;
  scheduledAt: string;
  interviewer: string;
  location: string | null;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
  score: number | null;
  result: RecruitmentInterviewResult | null;
  evaluation: string | null;
}

export interface RecruitmentOffer {
  id: string;
  candidateId: string;
  salary: number;
  salaryType: 'MONTHLY' | 'DAILY';
  offeredAt: string;
  expiresAt: string | null;
  status: RecruitmentOfferStatus;
  terms: string | null;
}

export interface CreateRecruitmentInterviewDTO {
  scheduledAt: string;
  interviewer: string;
  location?: string | null;
}

export interface EvaluateRecruitmentInterviewDTO {
  score: number;
  result: RecruitmentInterviewResult;
  evaluation?: string | null;
}

export interface CreateRecruitmentOfferDTO {
  salary: number;
  salaryType: 'MONTHLY' | 'DAILY';
  offeredAt: string;
  expiresAt?: string | null;
  terms?: string | null;
}

export interface HireRecruitmentCandidateDTO {
  phone: string;
  location: string;
  joinedDate: string;
  baseSalary: number;
  salaryType: 'MONTHLY' | 'DAILY';
  createDraftContract?: boolean;
}

export interface RecruitmentSummary {
  openJobs: number;
  candidates: number;
  interviews: number;
  offers: number;
  hires: number;
}
