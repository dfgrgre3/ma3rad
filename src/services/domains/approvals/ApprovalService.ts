import { ApprovalDecisionService } from './ApprovalDecisionService';
import { ApprovalQueryService } from './ApprovalQueryService';
import { ApprovalRequestService } from './ApprovalRequestService';
import type { ApprovalRequest, CreateApprovalRequestInput } from './approvalTypes';

export type { ApprovalRequest, ApprovalType, CreateApprovalRequestInput } from './approvalTypes';

export class ApprovalService {
  private readonly queries = new ApprovalQueryService();
  private readonly requests = new ApprovalRequestService();
  private readonly decisions = new ApprovalDecisionService();

  getRequests(status = 'ALL', search = '', type = 'ALL'): ApprovalRequest[] {
    return this.queries.getRequests(status, search, type);
  }

  getStats(): { pending: number; approved: number; rejected: number } {
    return this.queries.getStats();
  }

  createRequest(input: CreateApprovalRequestInput): ApprovalRequest {
    return this.requests.createRequest(input);
  }

  decide(id: string, approved: boolean, notes?: string): void {
    this.decisions.decide(id, approved, notes);
  }

  cancel(id: string): void {
    this.requests.cancel(id);
  }
}
