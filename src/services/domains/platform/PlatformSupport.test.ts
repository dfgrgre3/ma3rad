import { describe, it, expect } from 'vitest';
import type {
  PlatformSupportTicket,
  PlatformSupportMessage,
  PlatformCannedReply,
  PlatformRemoteSession,
  PlatformSupportTicketDetails,
} from './platformTypes';

describe('Platform Support Desk Enhancements (Item 16)', () => {
  it('should model support ticket with SLA, ratings, and remote access duration', () => {
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

    expect(ticket.priority).toBe('HIGH');
    expect(ticket.remoteAccessApproved).toBe(true);
    expect(ticket.remoteAccessDurationMinutes).toBe(60);
    expect(ticket.rating).toBe(5);
    expect(ticket.slaDueAt).toBeTruthy();
  });

  it('should differentiate between customer messages and internal notes', () => {
    const publicMsg: PlatformSupportMessage = {
      id: 'msg_01',
      ticketId: 'tkt_001',
      authorName: 'مسؤول الدعم',
      authorRole: 'SUPPORT',
      body: 'أهلاً بك، جارٍ فحص سجلات المزامنة الآن.',
      isInternal: false,
      createdAt: '2026-11-14T20:10:00Z',
    };

    const internalNote: PlatformSupportMessage = {
      id: 'msg_02',
      ticketId: 'tkt_001',
      authorName: 'أحمد كمال',
      authorRole: 'SUPPORT',
      body: 'ملاحظة: جهاز العميل لم يقم بتحديث الـ Schema إلى الإصدار 155.',
      isInternal: true,
      createdAt: '2026-11-14T20:15:00Z',
    };

    expect(publicMsg.isInternal).toBe(false);
    expect(internalNote.isInternal).toBe(true);
    expect(internalNote.authorRole).toBe('SUPPORT');
  });

  it('should model canned replies for fast responses', () => {
    const reply: PlatformCannedReply = {
      id: 'cr_01',
      title: 'طلب تفاصيل إضافية',
      category: 'DIAGNOSIS',
      body: 'نرجو تزويدنا برقم الفاتورة وصورة الخطأ الظاهر.',
      createdAt: '2026-11-14T20:00:00Z',
    };

    expect(reply.category).toBe('DIAGNOSIS');
    expect(reply.title).toBeTruthy();
    expect(reply.body).toContain('نرجو تزويدنا');
  });

  it('should model remote access session logs with duration and status', () => {
    const session: PlatformRemoteSession = {
      id: 'rsess_01',
      ticketId: 'tkt_001',
      tenantId: 'tenant_abc',
      technicianName: 'مهندس أحمد كمال',
      startedAt: '2026-11-14T20:30:00Z',
      endedAt: '2026-11-14T21:10:00Z',
      durationMinutes: 40,
      actionsSummary: 'إعادة تشغيل خدمة المزامنة المحلية وتحديث التوكن',
      status: 'COMPLETED',
    };

    expect(session.status).toBe('COMPLETED');
    expect(session.durationMinutes).toBe(40);
    expect(session.actionsSummary).toBeTruthy();
  });

  it('should aggregate complete ticket details structure', () => {
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
    };

    expect(details.ticket.subject).toBe('استفسار عن الفوترة');
    expect(Array.isArray(details.messages)).toBe(true);
    expect(Array.isArray(details.remoteSessions)).toBe(true);
  });
});
