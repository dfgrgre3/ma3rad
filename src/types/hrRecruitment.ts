export type RecruitmentJobStatus = 'OPEN' | 'ON_HOLD' | 'CLOSED';
export type RecruitmentEmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'TEMPORARY' | 'INTERNSHIP';
export type RecruitmentCandidateStatus = 'NEW' | 'SCREENING' | 'INTERVIEW' | 'OFFER' | 'HIRED' | 'REJECTED';

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
