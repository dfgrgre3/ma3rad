import type { ApprovalRequest } from './approvalTypes';
import type { DatabaseManager } from '../../../database/repositories/databaseManager';
import type { User } from '../../../types';

type ApprovalEffect = (request: ApprovalRequest, actor: User, db: DatabaseManager) => string | null;
const effects = new Map<string, ApprovalEffect>();
const rejectionEffects = new Map<string, ApprovalEffect>();

export const registerApprovalEffect = (requestType: string, effect: ApprovalEffect): void => {
  effects.set(requestType, effect);
};

export const registerApprovalRejectionEffect = (requestType: string, effect: ApprovalEffect): void => {
  rejectionEffects.set(requestType, effect);
};

export const applyRegisteredApprovalEffect = (
  request: ApprovalRequest,
  actor: User,
  db: DatabaseManager
): string | null => effects.get(request.requestType)?.(request, actor, db) ?? null;

export const applyRegisteredRejectionEffect = (
  request: ApprovalRequest,
  actor: User,
  db: DatabaseManager
): string | null => rejectionEffects.get(request.requestType)?.(request, actor, db) ?? null;
