'use strict';
const express = require('express');
const crypto = require('crypto');
const { getDb } = require('../lib/db');
const { nowIso } = require('../lib/time');
const { recordAuditEvent } = require('../lib/audit');
const {
  authenticatePlatformUser,
  requirePlatformPermission,
  getScopedTenantIds,
  assertTenantAccess,
} = require('../middleware/auth');

const router = express.Router();

const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED'];
const TICKET_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
const TICKET_CATEGORIES = ['GENERAL', 'BILLING', 'TECHNICAL', 'LICENSE', 'DATA', 'FEATURE_REQUEST', 'OTHER'];

function mapTicketRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name ?? null,
    tenantCode: row.tenant_code ?? null,
    subject: row.subject,
    category: row.category,
    priority: row.priority,
    status: row.status,
    requesterName: row.requester_name ?? null,
    requesterEmail: row.requester_email ?? null,
    requesterPhone: row.requester_phone ?? null,
    assigneeId: row.assignee_id ?? null,
    assigneeName: row.assignee_name ?? null,
    messageCount: row.message_count ?? 0,
    lastMessageAt: row.last_message_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessageRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    ticketId: row.ticket_id,
    authorType: row.author_type,
    authorId: row.author_id ?? null,
    authorName: row.author_name ?? null,
    body: row.body,
    internal: Boolean(row.internal),
    createdAt: row.created_at,
  };
}

async function getTicketOr404(db, id) {
  return db.get(
    `SELECT tk.*, t.name AS tenant_name, t.code AS tenant_code,
            (SELECT COUNT(*) FROM platform_support_messages m WHERE m.ticket_id = tk.id) AS message_count
     FROM platform_support_tickets tk
     LEFT JOIN platform_tenants t ON t.id = tk.tenant_id
     WHERE tk.id = ?`, [id]);
}

router.get(
  '/',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.support.view']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { tenantId = '', status = '', priority = '', category = '', q = '', assigneeId = '' } = req.query;
      const clauses = [];
      const params = [];
      const scoped = await getScopedTenantIds(req);
      if (Array.isArray(scoped)) {
        const visible = scoped.filter(Boolean);
        if (tenantId) {
          if (!visible.includes(String(tenantId))) {
            return res.status(403).json({ error: 'Tenant is outside your data scope' });
          }
          clauses.push('tk.tenant_id = ?');
          params.push(tenantId);
        } else if (visible.length) {
          clauses.push(`tk.tenant_id IN (${visible.map(() => '?').join(',')})`);
          params.push(...visible);
        } else {
          return res.json({ data: [], meta: { total: 0 }, requestId: req.requestId });
        }
      } else if (tenantId) {
        clauses.push('tk.tenant_id = ?');
        params.push(tenantId);
      }
      if (status) { clauses.push('tk.status = ?'); params.push(status); }
      if (priority) { clauses.push('tk.priority = ?'); params.push(priority); }
      if (category) { clauses.push('tk.category = ?'); params.push(category); }
      if (assigneeId) { clauses.push('tk.assignee_id = ?'); params.push(assigneeId); }
      if (q) {
        clauses.push('(tk.subject LIKE ? OR tk.requester_name LIKE ? OR tk.requester_email LIKE ?)');
        params.push(`%${q}%`, `%${q}%`, `%${q}%`);
      }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const rows = await db.all(
        `SELECT tk.*, t.name AS tenant_name, t.code AS tenant_code,
                (SELECT COUNT(*) FROM platform_support_messages m WHERE m.ticket_id = tk.id) AS message_count
         FROM platform_support_tickets tk
         LEFT JOIN platform_tenants t ON t.id = tk.tenant_id
         ${where} ORDER BY tk.last_message_at DESC, tk.created_at DESC LIMIT 500`,
        params
      );
      res.json({ data: rows.map(mapTicketRow), meta: { total: rows.length }, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

router.post(
  '/',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.support.create', 'platform.support.update']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const {
        tenantId, subject, category = 'GENERAL', priority = 'NORMAL',
        requesterName = '', requesterEmail = '', requesterPhone = '', body = '',
      } = req.body || {};
      if (!tenantId) return res.status(400).json({ error: 'tenantId is required' });
      if (!subject || String(subject).trim().length < 3) {
        return res.status(400).json({ error: 'subject is required' });
      }
      if (!(await assertTenantAccess(req, res, tenantId))) return;
      if (!TICKET_PRIORITIES.includes(priority)) {
        return res.status(400).json({ error: `priority must be one of ${TICKET_PRIORITIES.join(', ')}` });
      }
      if (!TICKET_CATEGORIES.includes(category)) {
        return res.status(400).json({ error: `category must be one of ${TICKET_CATEGORIES.join(', ')}` });
      }

      const ticketId = `tkt_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      const messageId = `msg_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      const now = nowIso();
      await db.run('BEGIN TRANSACTION');
      try {
        await db.run(
          `INSERT INTO platform_support_tickets
            (id, tenant_id, subject, category, priority, status, requester_name, requester_email, requester_phone,
             assignee_id, assignee_name, created_at, updated_at, last_message_at)
           VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            ticketId, tenantId, String(subject).trim(), category, priority,
            requesterName || null, requesterEmail || null, requesterPhone || null,
            req.platformUser?.id ?? null, req.platformUser?.full_name ?? null,
            now, now, now,
          ]
        );
        if (body && String(body).trim()) {
          await db.run(
            `INSERT INTO platform_support_messages (id, ticket_id, author_type, author_id, author_name, body, internal, created_at)
             VALUES (?, ?, 'STAFF', ?, ?, ?, 0, ?)`,
            [messageId, ticketId, req.platformUser?.id ?? null, req.platformUser?.full_name ?? 'فريق المنصة', String(body).trim(), now]
          );
        }
        await db.exec('COMMIT');
      } catch (err) {
        await db.exec('ROLLBACK');
        throw err;
      }
      await recordAuditEvent({
        actorId: req.platformUser?.id, actorName: req.platformUser?.full_name, tenantId,
        action: 'SUPPORT_TICKET_CREATED', resourceType: 'platform_support_tickets', resourceId: ticketId,
        afterData: { subject, category, priority },
        ipAddress: req.ip, userAgent: req.headers['user-agent'],
      });
      const row = await getTicketOr404(db, ticketId);
      res.status(201).json({ data: mapTicketRow(row), requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

router.get(
  '/:id',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.support.view']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const row = await getTicketOr404(db, req.params.id);
      if (!row) return res.status(404).json({ error: 'Ticket not found' });
      if (!(await assertTenantAccess(req, res, row.tenant_id))) return;
      const messages = await db.all(
        'SELECT * FROM platform_support_messages WHERE ticket_id = ? ORDER BY created_at ASC', [row.id]);
      res.json({
        data: { ...mapTicketRow(row), messages: messages.map(mapMessageRow) },
        requestId: req.requestId,
      });
    } catch (err) { next(err); }
  }
);

router.put(
  '/:id',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.support.update']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const ticket = await getTicketOr404(db, req.params.id);
      if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
      if (!(await assertTenantAccess(req, res, ticket.tenant_id))) return;
      const { subject, category, priority, status, assigneeId, assigneeName } = req.body || {};
      const updates = [];
      const params = [];
      if (subject !== undefined) { updates.push('subject = ?'); params.push(String(subject).trim()); }
      if (category !== undefined) {
        if (!TICKET_CATEGORIES.includes(category)) {
          return res.status(400).json({ error: `category must be one of ${TICKET_CATEGORIES.join(', ')}` });
        }
        updates.push('category = ?'); params.push(category);
      }
      if (priority !== undefined) {
        if (!TICKET_PRIORITIES.includes(priority)) {
          return res.status(400).json({ error: `priority must be one of ${TICKET_PRIORITIES.join(', ')}` });
        }
        updates.push('priority = ?'); params.push(priority);
      }
      if (status !== undefined) {
        if (!TICKET_STATUSES.includes(status)) {
          return res.status(400).json({ error: `status must be one of ${TICKET_STATUSES.join(', ')}` });
        }
        updates.push('status = ?'); params.push(status);
      }
      if (assigneeId !== undefined) { updates.push('assignee_id = ?'); params.push(assigneeId || null); }
      if (assigneeName !== undefined) { updates.push('assignee_name = ?'); params.push(assigneeName || null); }
      if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
      updates.push('updated_at = ?');
      params.push(nowIso(), ticket.id);
      await db.run(`UPDATE platform_support_tickets SET ${updates.join(', ')} WHERE id = ?`, params);
      await recordAuditEvent({
        actorId: req.platformUser?.id, actorName: req.platformUser?.full_name, tenantId: ticket.tenant_id,
        action: 'SUPPORT_TICKET_UPDATED', resourceType: 'platform_support_tickets', resourceId: ticket.id,
        afterData: req.body,
        ipAddress: req.ip, userAgent: req.headers['user-agent'],
      });
      const row = await getTicketOr404(db, ticket.id);
      res.json({ data: mapTicketRow(row), requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

router.post(
  '/:id/messages',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.support.update']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const ticket = await getTicketOr404(db, req.params.id);
      if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
      if (!(await assertTenantAccess(req, res, ticket.tenant_id))) return;
      const { body = '', internal = false } = req.body || {};
      if (!body || !String(body).trim()) {
        return res.status(400).json({ error: 'body is required' });
      }
      const messageId = `msg_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      const now = nowIso();
      await db.run(
        `INSERT INTO platform_support_messages (id, ticket_id, author_type, author_id, author_name, body, internal, created_at)
         VALUES (?, ?, 'STAFF', ?, ?, ?, ?, ?)`,
        [messageId, ticket.id, req.platformUser?.id ?? null, req.platformUser?.full_name ?? 'فريق المنصة', String(body).trim(), internal ? 1 : 0, now]
      );
      await db.run(
        `UPDATE platform_support_tickets SET last_message_at = ?, updated_at = ?,
           status = CASE WHEN status IN ('RESOLVED','CLOSED') THEN 'IN_PROGRESS' ELSE status END
         WHERE id = ?`,
        [now, now, ticket.id]
      );
      const row = await db.get('SELECT * FROM platform_support_messages WHERE id = ?', [messageId]);
      res.status(201).json({ data: mapMessageRow(row), requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

router.delete(
  '/:id',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.support.delete']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const ticket = await getTicketOr404(db, req.params.id);
      if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
      if (!(await assertTenantAccess(req, res, ticket.tenant_id))) return;
      await db.run('DELETE FROM platform_support_tickets WHERE id = ?', [ticket.id]);
      await recordAuditEvent({
        actorId: req.platformUser?.id, actorName: req.platformUser?.full_name, tenantId: ticket.tenant_id,
        action: 'SUPPORT_TICKET_DELETED', resourceType: 'platform_support_tickets', resourceId: ticket.id,
        ipAddress: req.ip, userAgent: req.headers['user-agent'],
      });
      res.json({ data: { id: ticket.id, deleted: true }, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);


// ── Remote Access ──────────────────────────────────────────────────────────
router.post(
  '/:id/remote-access/request',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.support.update']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const ticket = await getTicketOr404(db, req.params.id);
      if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
      const { requested, durationMinutes = 60 } = req.body || {};
      const now = nowIso();
      await db.run(
        `UPDATE platform_support_tickets SET remote_access_requested = ?, remote_access_requested_at = ?, updated_at = ? WHERE id = ?`,
        [requested ? 1 : 0, now, now, ticket.id]
      );
      const updated = await db.get('SELECT * FROM platform_support_tickets WHERE id = ?', [ticket.id]);
      res.json({ data: updated, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

router.post(
  '/:id/remote-access/approve',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.support.update']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const ticket = await getTicketOr404(db, req.params.id);
      if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
      const { approved } = req.body || {};
      const now = nowIso();
      await db.run(
        `UPDATE platform_support_tickets SET remote_access_approved = ?, remote_access_approved_at = ?, updated_at = ? WHERE id = ?`,
        [approved ? 1 : 0, now, now, ticket.id]
      );
      const updated = await db.get('SELECT * FROM platform_support_tickets WHERE id = ?', [ticket.id]);
      res.json({ data: updated, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

router.post(
  '/:id/remote-access/start',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.support.update']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const ticket = await getTicketOr404(db, req.params.id);
      if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
      if (!ticket.remote_access_approved) {
        return res.status(400).json({ error: 'Remote access must be approved first' });
      }
      const { technicianName, durationMinutes = 60 } = req.body || {};
      const sessionId = `rs_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      const now = nowIso();
      await db.run(
        `INSERT INTO platform_remote_sessions (id, ticket_id, tenant_id, staff_id, technician_name, status, started_at, duration_minutes)
         VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`,
        [sessionId, ticket.id, ticket.tenant_id, req.platformUser?.id || null, technicianName || 'Unknown', now, durationMinutes]
      );
      const session = await db.get('SELECT * FROM platform_remote_sessions WHERE id = ?', [sessionId]);
      res.status(201).json({ data: session, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

router.post(
  '/remote-sessions/:sessionId/end',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.support.update']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { sessionId } = req.params;
      const { summary } = req.body || {};
      const now = nowIso();
      await db.run(
        `UPDATE platform_remote_sessions SET status = 'ENDED', ended_at = ?, summary = ? WHERE id = ?`,
        [now, summary || null, sessionId]
      );
      const session = await db.get('SELECT * FROM platform_remote_sessions WHERE id = ?', [sessionId]);
      res.json({ data: session, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

router.get(
  '/:id/remote-sessions',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.support.view']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const sessions = await db.all(
        'SELECT * FROM platform_remote_sessions WHERE ticket_id = ? ORDER BY started_at DESC',
        [req.params.id]
      );
      res.json({ data: sessions, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

module.exports = router;
