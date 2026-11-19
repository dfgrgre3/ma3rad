// Support ticket delegations → PlatformSupportService and notification checks
// → PlatformNotificationService.
import { platformSupportService } from '../PlatformSupportService';
import { platformNotificationService } from '../PlatformNotificationService';
import type {
  PlatformSupportTicket,
  PlatformSupportMessage,
  PlatformCannedReply,
  PlatformRemoteSession,
  PlatformSupportTicketDetails,
} from '../platformTypes';

export interface SupportApi {
  // Support - Delegate to PlatformSupportService
  listSupportTickets(search?: string, status?: string): PlatformSupportTicket[];
  createSupportTicket(input: {
    tenantId: string;
    subject: string;
    description?: string;
    category?: string;
    priority?: PlatformSupportTicket['priority'];
    assignedTo?: string | null;
  }): PlatformSupportTicket;
  setSupportTicketStatus(id: string, status: PlatformSupportTicket['status']): PlatformSupportTicket;
  assignSupportTicket(id: string, assignedTo: string | null): PlatformSupportTicket;
  setSupportTicketPriority(id: string, priority: PlatformSupportTicket['priority']): PlatformSupportTicket;
  rateSupportTicket(id: string, rating: number, feedback?: string): PlatformSupportTicket;
  requestRemoteAccess(id: string, requested: boolean, durationMinutes?: number): PlatformSupportTicket;
  approveRemoteAccess(id: string, approved: boolean): PlatformSupportTicket;
  addSupportMessage(input: {
    ticketId: string;
    authorId?: string;
    authorType?: 'STAFF' | 'TENANT';
    authorName?: string;
    authorRole?: 'CUSTOMER' | 'SUPPORT' | 'SYSTEM';
    body: string;
    internal?: boolean;
    isInternal?: boolean;
    attachmentUrl?: string | null;
    attachmentName?: string | null;
    attachmentSize?: string | null;
  }): PlatformSupportMessage;
  listSupportMessages(ticketId: string): PlatformSupportMessage[];
  getSupportTicketDetails(ticketId: string): PlatformSupportTicketDetails;
  listCannedReplies(): PlatformCannedReply[];
  createCannedReply(input: { title: string; category?: string; body: string }): PlatformCannedReply;
  startRemoteSession(input: {
    ticketId: string;
    staffId?: string;
    tenantId?: string;
    technicianName?: string;
    durationMinutes?: number;
  }): PlatformRemoteSession;
  endRemoteSession(sessionId: string, actionsSummary?: string): PlatformRemoteSession;
  listRemoteSessions(ticketId: string): PlatformRemoteSession[];
  // Notifications - Delegate to PlatformNotificationService
  checkExpiringLicensesAndSubscriptions(): { licenseNotifications: number; subscriptionNotifications: number; offlineLeaseWarnings: number };
  handleNotificationAction(notificationId: string, action: string): void;
}

export function createSupportApi(): SupportApi {
  return {
    // Support - Delegate to PlatformSupportService
    listSupportTickets(search = '', status = '') {
      return platformSupportService.listSupportTickets(search, status);
    },

    createSupportTicket(input: {
      tenantId: string;
      subject: string;
      description?: string;
      category?: string;
      priority?: PlatformSupportTicket['priority'];
      assignedTo?: string | null;
    }) {
      return platformSupportService.createSupportTicket(input);
    },

    setSupportTicketStatus(id: string, status: PlatformSupportTicket['status']) {
      return platformSupportService.setSupportTicketStatus(id, status);
    },

    assignSupportTicket(id: string, assignedTo: string | null) {
      return platformSupportService.assignSupportTicket(id, assignedTo);
    },

    setSupportTicketPriority(id: string, priority: PlatformSupportTicket['priority']) {
      return platformSupportService.setSupportTicketPriority(id, priority);
    },

    rateSupportTicket(id: string, rating: number, feedback?: string) {
      return platformSupportService.rateSupportTicket(id, rating, feedback);
    },

    requestRemoteAccess(id: string, requested: boolean, durationMinutes = 60) {
      return platformSupportService.requestRemoteAccess(id, requested, durationMinutes);
    },

    approveRemoteAccess(id: string, approved: boolean) {
      return platformSupportService.approveRemoteAccess(id, approved);
    },

    addSupportMessage(input: {
      ticketId: string;
      authorId?: string;
      authorType?: 'STAFF' | 'TENANT';
      authorName?: string;
      authorRole?: 'CUSTOMER' | 'SUPPORT' | 'SYSTEM';
      body: string;
      internal?: boolean;
      isInternal?: boolean;
      attachmentUrl?: string | null;
      attachmentName?: string | null;
      attachmentSize?: string | null;
    }) {
      return platformSupportService.addSupportMessage(input);
    },

    listSupportMessages(ticketId: string) {
      return platformSupportService.listSupportMessages(ticketId);
    },

    getSupportTicketDetails(ticketId: string) {
      return platformSupportService.getSupportTicketDetails(ticketId);
    },

    listCannedReplies() {
      return platformSupportService.listCannedReplies();
    },

    createCannedReply(input: { title: string; category?: string; body: string }) {
      return platformSupportService.createCannedReply(input);
    },

    startRemoteSession(input: {
      ticketId: string;
      staffId?: string;
      tenantId?: string;
      technicianName?: string;
      durationMinutes?: number;
    }) {
      return platformSupportService.startRemoteSession(input);
    },

    endRemoteSession(sessionId: string, actionsSummary?: string) {
      return platformSupportService.endRemoteSession(sessionId, actionsSummary);
    },

    listRemoteSessions(ticketId: string) {
      return platformSupportService.listRemoteSessions(ticketId);
    },

    // Notifications - Delegate to PlatformNotificationService
    checkExpiringLicensesAndSubscriptions() {
      return platformNotificationService.checkExpiringLicensesAndSubscriptions();
    },

    handleNotificationAction(notificationId: string, action: string) {
      platformNotificationService.handleNotificationAction(notificationId, action);
    },
  };
}
