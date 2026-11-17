import { test } from 'node:test';
import assert from 'node:assert/strict';
import type {
  PlatformSupportTicket,
  PlatformSupportMessage,
  PlatformCannedReply,
  PlatformRemoteSession,
  PlatformSupportTicketDetails,
} from './platformTypes';

test('should model support ticket with SLA, ratings, and remote access duration', () => {
  const ticket: PlatformSupportTicket = {
    id: 'tkt_001',
    tenantId: 'tenant_abc',
    tenantName: 'شركة السيراميك الذهبي',
    subject: 'توقف مزامنة نقطة البيع في فرع المعادي',
    description: 'فشل إرسال الفواتير لمركز المنصة مع كود خطأ 504',
    priority: 'HIGH',
    status: 'IN_PROGRESS',
    assignedTo: 'مهندس أحمد كمال',
    remoteAccessRequested: true,
    remoteAccessApproved: true,
    remoteAccessDurationMinutes: 60,
    remoteAccessExpiresAt: '2026-11-14T22:30:00Z',
    slaDueAt: '2026-11-15T04:00:00Z',
    firstRespondedAt: '2026-11-14T20:45:00Z',
    rating: 5,
    feedback: 'تم الحل بسرعة واحترافية ممتازة',
    createdAt: '2026-11-14T20:00:00Z',
    updatedAt: '2026-11-14T21:00:00Z',
  };

  assert.strictEqual(ticket.priority, 'HIGH');
  assert.strictEqual(ticket.remoteAccessApproved, true);
  assert.strictEqual(ticket.remoteAccessDurationMinutes, 60);
  assert.strictEqual(ticket.rating, 5);
  assert.ok(ticket.slaDueAt);
});

test('should differentiate between customer messages and internal notes', () => {
  const publicMsg: PlatformSupportMessage = {
    id: 'msg_01',
    ticketId: 'tkt_001',
    authorId: 'staff_001',
    authorType: 'STAFF',
    authorName: 'مسؤول الدعم',
    authorRole: 'SUPPORT',
    body: 'أهلاً بك، جارٍ فحص سجلات المزامنة الآن.',
    isInternal: false,
    createdAt: '2026-11-14T20:10:00Z',
  };

  const internalNote: PlatformSupportMessage = {
    id: 'msg_02',
    ticketId: 'tkt_001',
    authorId: 'staff_002',
    authorType: 'STAFF',
    authorName: 'أحمد كمال',
    authorRole: 'SUPPORT',
    body: 'ملاحظة: جهاز العميل لم يقم بتحديث الـ Schema إلى الإصدار 155.',
    isInternal: true,
    createdAt: '2026-11-14T20:15:00Z',
  };

  assert.strictEqual(publicMsg.isInternal, false);
  assert.strictEqual(internalNote.isInternal, true);
  assert.strictEqual(internalNote.authorRole, 'SUPPORT');
});

test('should model canned replies for fast responses', () => {
  const reply: PlatformCannedReply = {
    id: 'cr_01',
    title: 'طلب تفاصيل إضافية',
    category: 'DIAGNOSIS',
    body: 'نرجو تزويدنا برقم الفاتورة وصورة الخطأ الظاهر.',
    createdAt: '2026-11-14T20:00:00Z',
    updatedAt: '2026-11-14T20:00:00Z',
  };

  assert.strictEqual(reply.category, 'DIAGNOSIS');
  assert.ok(reply.title);
  assert.ok(reply.body.includes('نرجو تزويدنا'));
});

test('should model remote access session logs with duration and status', () => {
  const session: PlatformRemoteSession = {
    id: 'rsess_01',
    ticketId: 'tkt_001',
    tenantId: 'tenant_abc',
    staffId: 'staff_001',
    technicianName: 'مهندس أحمد كمال',
    startedAt: '2026-11-14T20:30:00Z',
    endedAt: '2026-11-14T21:10:00Z',
    durationMinutes: 40,
    actionsSummary: 'إعادة تشغيل خدمة المزامنة المحلية وتحديث التوكن',
    status: 'COMPLETED',
  };

  assert.strictEqual(session.status, 'COMPLETED');
  assert.strictEqual(session.durationMinutes, 40);
  assert.ok(session.actionsSummary);
});

test('should aggregate complete ticket details structure', () => {
  const details: PlatformSupportTicketDetails = {
    ticket: {
      id: 'tkt_001',
      tenantId: 'tenant_abc',
      subject: 'استفسار عن الفوترة',
      priority: 'LOW',
      status: 'OPEN',
      remoteAccessRequested: false,
      remoteAccessApproved: false,
      createdAt: '2026-11-14T20:00:00Z',
      updatedAt: '2026-11-14T20:00:00Z',
    },
    messages: [],
    remoteSessions: [],
    tenant: {
      id: 'tenant_abc',
      code: 'ABC',
      name: 'Tenant ABC',
      email: 'tenant@example.com',
      phone: '+1234567890',
      status: 'ACTIVE',
    },
    assignedStaff: {
      id: 'staff_001',
      username: 'support_staff',
      fullName: 'Support Staff',
      email: 'support@example.com',
      role: 'SUPPORT_AGENT',
    },
  };

  assert.strictEqual(details.ticket.subject, 'استفسار عن الفوترة');
  assert.ok(Array.isArray(details.messages));
  assert.ok(Array.isArray(details.remoteSessions));
});
