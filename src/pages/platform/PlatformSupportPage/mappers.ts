import type { PlatformSupportTicket, PlatformSupportMessage } from '../../../services/domains/platform/platformTypes';

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
  remoteAccessRequested?: boolean;
  remoteAccessApproved?: boolean;
  remoteAccessRequestedAt?: string | null;
  remoteAccessApprovedAt?: string | null;
  remoteAccessDurationMinutes?: number | null;
  createdAt: string;
  updatedAt: string;
  messages?: CentralMessageRow[];
}

/** Raw central message row — snake_case as returned by mapMessageRow. */
export interface CentralMessageRow {
  id: string;
  ticket_id?: string;
  ticketId?: string;
  author_type?: string;
  authorType?: string;
  author_id?: string | null;
  authorId?: string | null;
  author_name?: string | null;
  authorName?: string | null;
  body: string;
  internal?: boolean;
  isInternal?: boolean;
  created_at?: string;
  createdAt?: string;
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
    remoteAccessRequested: Boolean(row.remoteAccessRequested),
    remoteAccessApproved: Boolean(row.remoteAccessApproved),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapCentralMessage(row: CentralMessageRow): PlatformSupportMessage {
  const authorType = String(row.authorType ?? row.author_type ?? 'TENANT').toUpperCase();
  const isStaff = authorType === 'STAFF' || authorType === 'SUPPORT' || authorType === 'AGENT';
  return {
    id: row.id,
    ticketId: String(row.ticketId ?? row.ticket_id ?? ''),
    authorId: String(row.authorId ?? row.author_id ?? ''),
    authorType: isStaff ? 'STAFF' : 'TENANT',
    authorName: String(row.authorName ?? row.author_name ?? '—'),
    authorRole: isStaff ? 'SUPPORT' : 'CUSTOMER',
    body: row.body,
    isInternal: Boolean(row.isInternal ?? row.internal),
    createdAt: String(row.createdAt ?? row.created_at ?? ''),
  } as PlatformSupportMessage;
}
