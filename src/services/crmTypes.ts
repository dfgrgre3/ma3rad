export type LeadStage = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'QUOTATION' | 'NEGOTIATION' | 'WON' | 'LOST';

export interface Lead {
  id: string;
  code: string;
  name: string;
  phone: string;
  phone2?: string | null;
  email?: string | null;
  city?: string | null;
  address?: string | null;
  source: string;
  leadType: string;
  stage: LeadStage;
  estimatedValue: number;
  probability: number;
  assignedTo?: string | null;
  nextFollowUp?: string | null;
  lostReason?: string | null;
  convertedCustomerId?: string | null;
  notes?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CrmActivity {
  id: string;
  leadId?: string | null;
  customerId?: string | null;
  leadName?: string;
  activityType: string;
  subject: string;
  body?: string | null;
  outcome?: string | null;
  scheduledAt?: string | null;
  completedAt?: string | null;
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  assignedTo?: string | null;
  createdBy: string;
  createdAt: string;
}
