import type { PlatformSupportTicket } from '../../../services/domains/platform/platformTypes';

export interface CentralTicketRow {
  id: string;
  tenantId: string;
  tenantName?: string | null;
  tenantCode?: string | null;
  subject: string;
  category: string;
  priority: string;
  status: string;
  requesterName?: string | null;
  requesterEmail?: string | null;
  requesterPhone?: string | null;
  assigneeId?: string | null;
  assigneeName?: string | null;
  messageCount?: number;
  lastMessageAt?: string | null;
  createdAt: string;
  updatedAt: string;
  messages?: any[];
}

export function mapPriorityToCentral(p: string): string {
  return p === 'MEDIUM' ? 'NORMAL' : p;
}
export function mapPriorityFromCentral(p: string): PlatformSupportTicket['priority'] {
  return (p === 'NORMAL' ? 'MEDIUM' : p) as PlatformSupportTicket['priority'];
}

export function mapCentralTicket(row: CentralTicketRow): PlatformSupportTicket {
  return {
    id: row.id,
    tenantId: row.tenantId,
    tenantName: row.tenantName ?? null,
    subject: row.subject,
    category: row.category,
    priority: mapPriorityFromCentral(row.priority),
    status: row.status as PlatformSupportTicket['status'],
    assignedTo: row.assigneeName ?? null,
    remoteAccessRequested: false,
    remoteAccessApproved: false,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapCentralMessage(row: any) {
  return {
    id: row.id,
    ticketId: row.ticketId,
    authorId: row.authorId ?? '',
    authorType: (row.authorType === 'STAFF' ? 'STAFF' : 'TENANT') as 'STAFF' | 'TENANT',
    authorName: row.authorName ?? '—',
    authorRole: (row.authorType === 'STAFF' ? 'SUPPORT' : 'CUSTOMER') as 'CUSTOMER' | 'SUPPORT' | 'SYSTEM',
    body: row.body,
    isInternal: row.internal,
    createdAt: row.createdAt,
  };
}
