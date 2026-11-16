import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PlatformStaffAuthService } from './PlatformStaffAuthService';
import { PlatformAuthorizationService } from './PlatformAuthorizationService';
import { centralAuditService } from './CentralAuditService';
import {
  PlatformSupportTicket,
  PlatformSupportMessage,
  PlatformCannedReply,
  PlatformRemoteSession,
  PlatformSupportTicketDetails,
} from './platformTypes';
import { nowIso, toNumber, safeJsonArray } from './platformUtils';

export class PlatformSupportService {
  private db = DatabaseManager.getInstance();

  private static requirePlatformAccess(modules: string | string[], action?: string) {
    const user = AuthService.getCurrentUser();
    if (!user || !user.isActive) {
      throw new Error('هذه العملية تتطلب جلسة منصة صالحة.');
    }

    if (user.role === 'SUPER_ADMIN') {
      return user;
    }

    const allowedRoles = new Set(['PLATFORM_ADMIN', 'SUPPORT_AGENT', 'OPERATIONS_ENGINEER', 'BILLING_SPECIALIST', 'LICENSE_MANAGER']);
    if (!allowedRoles.has(String(user.role))) {
      throw new Error('هذه العملية متاحة لمستخدمي المنصة المصرح لهم فقط.');
    }

    const permissionsOverride = PlatformStaffAuthService.getCurrentPermissionsOverride();
    const required = Array.isArray(modules) ? modules : [modules];
    const permitted = required.some((moduleKey) => {
      if (action && action.startsWith('platform.')) {
        return PlatformAuthorizationService.canAccessPermission(user.role, action, permissionsOverride);
      }
      return PlatformAuthorizationService.canAccessModule(user.role, moduleKey, permissionsOverride)
        && (!action || PlatformAuthorizationService.canAccessModule(user.role, action, permissionsOverride));
    });

    if (!permitted) {
      throw new Error('لا تملك صلاحية تنفيذ هذه العملية.');
    }

    return user;
  }

  private audit(
    action: string,
    entityType: string,
    entityId: string | null,
    details?: unknown,
    options?: {
      severity?: import('./platformTypes').AuditSeverity;
      status?: import('./platformTypes').AuditStatus;
      actorType?: import('./platformTypes').AuditActorType;
      tenantId?: string | null;
      deviceId?: string | null;
      deviceName?: string | null;
      ipAddress?: string | null;
      oldValues?: unknown;
      newValues?: unknown;
      errorMessage?: string | null;
    }
  ): void {
    const actor = AuthService.getCurrentUser();
    if (!actor) throw new Error('هذه العملية تتطلب جلسة منصة صالحة.');
    centralAuditService.log(actor, {
      action,
      entityType,
      entityId,
      details,
      severity: options?.severity,
      status: options?.status,
      actorType: options?.actorType,
      tenantId: options?.tenantId,
      deviceId: options?.deviceId,
      deviceName: options?.deviceName,
      ipAddress: options?.ipAddress,
      oldValues: options?.oldValues,
      newValues: options?.newValues,
      errorMessage: options?.errorMessage,
    });
  }

  // ─── Support Tickets ──────────────────────────────────────────────────────────

  public listSupportTickets(search = '', status = ''): PlatformSupportTicket[] {
    PlatformSupportService.requirePlatformAccess('support', 'platform.support.view');

    const where: string[] = [];
    const params: (string | number)[] = [];

    if (search) {
      where.push('(st.subject LIKE ? OR st.id LIKE ? OR t.name LIKE ? OR t.code LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }
    if (status) {
      where.push('st.status = ?');
      params.push(status);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const rows = this.db.query<any>(
      `SELECT st.*, t.name AS tenantName, t.code AS tenantCode
       FROM platform_support_tickets st
       JOIN platform_tenants t ON t.id = st.tenant_id
       ${whereSql}
       ORDER BY st.created_at DESC`,
      params
    );

    return rows.map(this.mapTicket);
  }

  public createSupportTicket(input: {
    tenantId: string;
    subject: string;
    description: string;
    category?: string;
    priority?: PlatformSupportTicket['priority'];
  }): PlatformSupportTicket {
    PlatformSupportService.requirePlatformAccess('support', 'platform.support.create');

    const tenant = this.db.query<any>('SELECT * FROM platform_tenants WHERE id = ?', [input.tenantId])[0];
    if (!tenant) throw new Error('العميل غير موجود.');

    const id = `st_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = nowIso();

    this.db.run(
      `INSERT INTO platform_support_tickets
        (id, tenant_id, subject, description, category, priority, status, assigned_to, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'OPEN', NULL, ?, ?)`,
      [id, input.tenantId, input.subject.trim(), input.description.trim(), input.category ?? null, input.priority ?? 'MEDIUM', now, now]
    );

    this.audit('إنشاء تذكرة دعم', 'SUPPORT_TICKET', id, { tenantId: input.tenantId, subject: input.subject });

    const ticket = this.getSupportTicket(id);
    if (!ticket) throw new Error('فشل إنشاء التذكرة.');
    return ticket;
  }

  public getSupportTicket(id: string): PlatformSupportTicket | null {
    PlatformSupportService.requirePlatformAccess('support', 'platform.support.view');
    const row = this.db.query<any>('SELECT * FROM platform_support_tickets WHERE id = ?', [id])[0];
    return row ? this.mapTicket(row) : null;
  }

  public setSupportTicketStatus(id: string, status: PlatformSupportTicket['status']): PlatformSupportTicket {
    PlatformSupportService.requirePlatformAccess('support', 'platform.support.update');

    const ticket = this.getSupportTicket(id);
    if (!ticket) throw new Error('التذكرة غير موجودة.');

    const now = nowIso();
    const updates = ['status = ?', 'updated_at = ?'];
    const params: (string | number)[] = [status, now];

    if (status === 'RESOLVED' || status === 'CLOSED') {
      updates.push('resolved_at = ?');
      params.push(now);
    }

    this.db.run(`UPDATE platform_support_tickets SET ${updates.join(', ')} WHERE id = ?`, [...params, id]);

    this.audit('تغيير حالة التذكرة', 'SUPPORT_TICKET', id, { status });

    const updated = this.getSupportTicket(id);
    if (!updated) throw new Error('فشل تحديث التذكرة.');
    return updated;
  }

  public assignSupportTicket(id: string, assignedTo: string | null): PlatformSupportTicket {
    PlatformSupportService.requirePlatformAccess('support', 'platform.support.update');

    const ticket = this.getSupportTicket(id);
    if (!ticket) throw new Error('التذكرة غير موجودة.');

    if (assignedTo) {
      const staff = this.db.query<any>('SELECT * FROM platform_staff WHERE id = ?', [assignedTo])[0];
      if (!staff) throw new Error('الموظف غير موجود.');
    }

    const now = nowIso();
    this.db.run('UPDATE platform_support_tickets SET assigned_to = ?, updated_at = ? WHERE id = ?', [assignedTo, now, id]);

    this.audit(assignedTo ? 'تعيين تذكرة' : 'إلغاء تعيين تذكرة', 'SUPPORT_TICKET', id, { assignedTo });

    const updated = this.getSupportTicket(id);
    if (!updated) throw new Error('فشل تحديث التذكرة.');
    return updated;
  }

  public setSupportTicketPriority(id: string, priority: PlatformSupportTicket['priority']): PlatformSupportTicket {
    PlatformSupportService.requirePlatformAccess('support', 'platform.support.update');

    const ticket = this.getSupportTicket(id);
    if (!ticket) throw new Error('التذكرة غير موجودة.');

    const now = nowIso();
    this.db.run('UPDATE platform_support_tickets SET priority = ?, updated_at = ? WHERE id = ?', [priority, now, id]);

    this.audit('تغيير أولوية التذكرة', 'SUPPORT_TICKET', id, { priority });

    const updated = this.getSupportTicket(id);
    if (!updated) throw new Error('فشل تحديث التذكرة.');
    return updated;
  }

  public rateSupportTicket(id: string, rating: number, feedback?: string): PlatformSupportTicket {
    PlatformSupportService.requirePlatformAccess('support', 'platform.support.update');

    const ticket = this.getSupportTicket(id);
    if (!ticket) throw new Error('التذكرة غير موجودة.');

    if (rating < 1 || rating > 5) throw new Error('التقييم يجب أن يكون بين 1 و 5.');

    const now = nowIso();
    this.db.run(
      'UPDATE platform_support_tickets SET rating = ?, rating_feedback = ?, updated_at = ? WHERE id = ?',
      [rating, feedback ?? null, now, id]
    );

    this.audit('تقييم تذكرة', 'SUPPORT_TICKET', id, { rating, feedback });

    const updated = this.getSupportTicket(id);
    if (!updated) throw new Error('فشل تحديث التذكرة.');
    return updated;
  }

  public requestRemoteAccess(id: string, requested: boolean, durationMinutes = 60): PlatformSupportTicket {
    PlatformSupportService.requirePlatformAccess('support', 'platform.support.remote');

    const ticket = this.getSupportTicket(id);
    if (!ticket) throw new Error('التذكرة غير موجودة.');

    const now = nowIso();
    this.db.run(
      'UPDATE platform_support_tickets SET remote_access_requested = ?, remote_access_duration = ?, updated_at = ? WHERE id = ?',
      [requested ? 1 : 0, requested ? durationMinutes : null, now, id]
    );

    this.audit(requested ? 'طلب وصول عن بعد' : 'إلغاء طلب وصول عن بعد', 'SUPPORT_TICKET', id, { durationMinutes });

    const updated = this.getSupportTicket(id);
    if (!updated) throw new Error('فشل تحديث التذكرة.');
    return updated;
  }

  public approveRemoteAccess(id: string, approved: boolean): PlatformSupportTicket {
    PlatformSupportService.requirePlatformAccess('support', 'platform.support.remote');

    const ticket = this.getSupportTicket(id);
    if (!ticket) throw new Error('التذكرة غير موجودة.');

    const now = nowIso();
    this.db.run(
      'UPDATE platform_support_tickets SET remote_access_approved = ?, updated_at = ? WHERE id = ?',
      [approved ? 1 : 0, now, id]
    );

    this.audit(approved ? 'الموافقة على وصول عن بعد' : 'رفض وصول عن بعد', 'SUPPORT_TICKET', id, {});

    const updated = this.getSupportTicket(id);
    if (!updated) throw new Error('فشل تحديث التذكرة.');
    return updated;
  }

  // ─── Support Messages ─────────────────────────────────────────────────────────

  public addSupportMessage(input: {
    ticketId: string;
    authorId: string;
    authorType: 'STAFF' | 'TENANT';
    body: string;
    internal?: boolean;
  }): PlatformSupportMessage {
    PlatformSupportService.requirePlatformAccess('support', 'platform.support.message');

    const ticket = this.getSupportTicket(input.ticketId);
    if (!ticket) throw new Error('التذكرة غير موجودة.');

    const id = `sm_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = nowIso();

    this.db.run(
      `INSERT INTO platform_support_messages
        (id, ticket_id, author_id, author_type, body, internal, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, input.ticketId, input.authorId, input.authorType, input.body.trim(), input.internal ? 1 : 0, now]
    );

    // Update ticket timestamp
    this.db.run('UPDATE platform_support_tickets SET updated_at = ? WHERE id = ?', [now, input.ticketId]);

    this.audit('إضافة رسالة دعم', 'SUPPORT_MESSAGE', id, { ticketId: input.ticketId });

    const message = this.getSupportMessage(id);
    if (!message) throw new Error('فشل إضافة الرسالة.');
    return message;
  }

  public listSupportMessages(ticketId: string): PlatformSupportMessage[] {
    PlatformSupportService.requirePlatformAccess('support', 'platform.support.view');
    const rows = this.db.query<any>('SELECT * FROM platform_support_messages WHERE ticket_id = ? ORDER BY created_at', [ticketId]);
    return rows.map(this.mapMessage);
  }

  public getSupportMessage(id: string): PlatformSupportMessage | null {
    const row = this.db.query<any>('SELECT * FROM platform_support_messages WHERE id = ?', [id])[0];
    return row ? this.mapMessage(row) : null;
  }

  public getSupportTicketDetails(ticketId: string): PlatformSupportTicketDetails {
    PlatformSupportService.requirePlatformAccess('support', 'platform.support.view');

    const ticket = this.getSupportTicket(ticketId);
    if (!ticket) throw new Error('التذكرة غير موجودة.');

    const messages = this.listSupportMessages(ticketId);
    const tenant = this.db.query<any>('SELECT * FROM platform_tenants WHERE id = ?', [ticket.tenantId])[0];
    const assignedStaff = ticket.assignedTo ? this.db.query<any>('SELECT * FROM platform_staff WHERE id = ?', [ticket.assignedTo])[0] : null;

    return {
      ticket,
      messages,
      remoteSessions: this.listRemoteSessions(ticketId),
      tenant: tenant ? {
        id: String(tenant.id),
        code: String(tenant.code),
        name: String(tenant.name),
        email: tenant.email ?? null,
        phone: tenant.phone ?? null,
        status: tenant.status,
      } : null,
      assignedStaff: assignedStaff ? {
        id: String(assignedStaff.id),
        username: String(assignedStaff.username),
        fullName: String(assignedStaff.full_name),
        email: assignedStaff.email ?? null,
        role: String(assignedStaff.role),
      } : null,
    };
  }

  // ─── Canned Replies ───────────────────────────────────────────────────────────

  public listCannedReplies(): PlatformCannedReply[] {
    PlatformSupportService.requirePlatformAccess('support', 'platform.support.canned');
    const rows = this.db.query<any>('SELECT * FROM platform_canned_replies ORDER BY category, title');
    return rows.map(this.mapCannedReply);
  }

  public createCannedReply(input: { title: string; category?: string; body: string }): PlatformCannedReply {
    PlatformSupportService.requirePlatformAccess('support', 'platform.support.canned');

    const id = `cr_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = nowIso();

    this.db.run(
      `INSERT INTO platform_canned_replies (id, title, category, body, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, input.title.trim(), input.category ?? null, input.body.trim(), now, now]
    );

    this.audit('إنشاء رد جاهز', 'CANNED_REPLY', id, { title: input.title });

    const reply = this.getCannedReply(id);
    if (!reply) throw new Error('فشل إنشاء الرد الجاهز.');
    return reply;
  }

  public getCannedReply(id: string): PlatformCannedReply | null {
    const row = this.db.query<any>('SELECT * FROM platform_canned_replies WHERE id = ?', [id])[0];
    return row ? this.mapCannedReply(row) : null;
  }

  // ─── Remote Sessions ──────────────────────────────────────────────────────────

  public startRemoteSession(input: {
    ticketId: string;
    staffId: string;
    tenantId: string;
    durationMinutes?: number;
  }): PlatformRemoteSession {
    PlatformSupportService.requirePlatformAccess('support', 'platform.support.remote');

    const ticket = this.getSupportTicket(input.ticketId);
    if (!ticket) throw new Error('التذكرة غير موجودة.');
    if (!ticket.remoteAccessApproved) throw new Error('الوصول عن بعد غير مصرح به لهذه التذكرة.');

    const id = `rs_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = nowIso();
    const expiresAt = new Date(Date.now() + (input.durationMinutes ?? 60) * 60 * 1000).toISOString();

    this.db.run(
      `INSERT INTO platform_remote_sessions
        (id, ticket_id, staff_id, tenant_id, status, started_at, expires_at, created_at)
       VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?)`,
      [id, input.ticketId, input.staffId, input.tenantId, now, expiresAt, now]
    );

    this.audit('بدء جلسة وصول عن بعد', 'REMOTE_SESSION', id, { ticketId: input.ticketId, tenantId: input.tenantId });

    const session = this.getRemoteSession(id);
    if (!session) throw new Error('فشل بدء الجلسة.');
    return session;
  }

  public endRemoteSession(sessionId: string, actionsSummary?: string): PlatformRemoteSession {
    PlatformSupportService.requirePlatformAccess('support', 'platform.support.remote');

    const session = this.getRemoteSession(sessionId);
    if (!session) throw new Error('الجلسة غير موجودة.');

    const now = nowIso();
    this.db.run(
      'UPDATE platform_remote_sessions SET status = \'ENDED\', ended_at = ?, actions_summary = ?, updated_at = ? WHERE id = ?',
      [now, actionsSummary ?? null, now, sessionId]
    );

    this.audit('إنهاء جلسة وصول عن بعد', 'REMOTE_SESSION', sessionId, { actionsSummary });

    const updated = this.getRemoteSession(sessionId);
    if (!updated) throw new Error('فشل إنهاء الجلسة.');
    return updated;
  }

  public listRemoteSessions(ticketId: string): PlatformRemoteSession[] {
    PlatformSupportService.requirePlatformAccess('support', 'platform.support.view');
    const rows = this.db.query<any>('SELECT * FROM platform_remote_sessions WHERE ticket_id = ? ORDER BY created_at DESC', [ticketId]);
    return rows.map(this.mapRemoteSession);
  }

  public getRemoteSession(id: string): PlatformRemoteSession | null {
    const row = this.db.query<any>('SELECT * FROM platform_remote_sessions WHERE id = ?', [id])[0];
    return row ? this.mapRemoteSession(row) : null;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private mapTicket(row: any): PlatformSupportTicket {
    return {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      subject: String(row.subject),
      description: String(row.description),
      category: row.category ?? null,
      priority: row.priority,
      status: row.status,
      assignedTo: row.assigned_to ?? null,
      remoteAccessRequested: Boolean(row.remote_access_requested),
      remoteAccessApproved: Boolean(row.remote_access_approved),
      remoteAccessDurationMinutes: row.remote_access_duration ?? null,
      rating: row.rating ?? null,
      feedback: row.rating_feedback ?? null,
      resolvedAt: row.resolved_at ?? null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapMessage(row: any): PlatformSupportMessage {
    return {
      id: String(row.id),
      ticketId: String(row.ticket_id),
      authorId: String(row.author_id),
      authorType: row.author_type,
      authorName: row.author_name ?? '',
      authorRole: row.author_role ?? 'SUPPORT',
      body: String(row.body),
      isInternal: Boolean(row.internal),
      createdAt: String(row.created_at),
    };
  }

  private mapCannedReply(row: any): PlatformCannedReply {
    return {
      id: String(row.id),
      title: String(row.title),
      category: row.category ?? null,
      body: String(row.body),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapRemoteSession(row: any): PlatformRemoteSession {
    return {
      id: String(row.id),
      ticketId: String(row.ticket_id),
      staffId: String(row.staff_id),
      tenantId: String(row.tenant_id),
      status: row.status,
      startedAt: String(row.started_at),
      endedAt: row.ended_at ?? null,
      expiresAt: String(row.expires_at),
      durationMinutes: toNumber(row.duration_minutes, 0),
      actionsSummary: row.actions_summary ?? null,
      technicianName: row.technician_name ?? '',
    };
  }
}

export const platformSupportService = new PlatformSupportService();