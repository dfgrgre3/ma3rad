import { InboxRepository } from './InboxRepository.ts';

export class IdempotencyService {
  private inbox: InboxRepository;
  constructor(inbox?: InboxRepository) { this.inbox = inbox || new InboxRepository(); }
  isNew(eventId: string): boolean {
    return !this.inbox.isDuplicate(eventId);
  }
  recordReceived(event: any): boolean {
    return this.inbox.recordReceived(event);
  }
}
