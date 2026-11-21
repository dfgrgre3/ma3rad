export interface PlatformSupportTicket {
  id: string;
  tenantId: string;
  tenantName?: string | null;
  deviceId?: string | null;
  subject: string;
  description?: string | null;
  category?: string | null;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'OPEN' | 'IN_PROGRESS' | 'WAITING_CUSTOMER' | 'RESOLVED' | 'CLOSED';
  assignedTo?: string | null;
  remoteAccessRequested: boolean;
  remoteAccessApproved: boolean;
  remoteAccessDurationMinutes?: number;
  remoteAccessExpiresAt?: string | null;
  slaDueAt?: string | null;
  firstRespondedAt?: string | null;
  rating?: number | null;
  feedback?: string | null;
  ratedAt?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformSupportMessage {
  id: string;
  ticketId: string;
  authorId: string;
  authorType: 'STAFF' | 'TENANT';
  authorName: string;
  authorRole: 'CUSTOMER' | 'SUPPORT' | 'SYSTEM';
  body: string;
  isInternal?: boolean;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentSize?: string | null;
  createdAt: string;
}

export interface PlatformCannedReply {
  id: string;
  title: string;
  category: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformRemoteSession {
  id: string;
  ticketId: string;
  tenantId: string;
  staffId: string;
  technicianName: string;
  startedAt: string;
  endedAt?: string | null;
  expiresAt?: string | null;
  durationMinutes: number;
  actionsSummary?: string | null;
  status: 'ACTIVE' | 'COMPLETED' | 'TERMINATED';
}

export interface PlatformSupportTicketDetails {
  ticket: PlatformSupportTicket;
  messages: PlatformSupportMessage[];
  remoteSessions: PlatformRemoteSession[];
  tenant: {
    id: string;
    code: string;
    name: string;
    email: string | null;
    phone: string | null;
    status: string;
  } | null;
  assignedStaff: {
    id: string;
    username: string;
    fullName: string;
    email: string | null;
    role: string;
  } | null;
}
