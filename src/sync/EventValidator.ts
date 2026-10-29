import type { SyncEvent, SyncOperation } from './types.ts';

const VALID_OPS: SyncOperation[] = ['CREATE','UPDATE','DELETE','UPSERT'];
const VALID_SCOPES = ['TENANT', 'BRANCH'] as const;
const SENSITIVE_FIELD = /(?:password|passwd|credential|access.?token|refresh.?token|session|secret|private.?key|encryption.?key|pin.?hash|two.?factor)/i;

export class EventValidator {
  validate(event: Partial<SyncEvent>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!event || typeof event !== 'object') return { valid: false, errors: ['event must be object'] };
    if (!event.eventId) errors.push('eventId is required');
    if (!event.branchId) errors.push('branchId is required');
    if (!event.entityType) errors.push('entityType is required');
    if (!event.entityId) errors.push('entityId is required');
    if (!VALID_OPS.includes(event.operationType as SyncOperation)) errors.push('invalid operationType');
    if (!Number.isSafeInteger(event.entityVersion) || event.entityVersion! < 1) errors.push('entityVersion must be a positive integer');
    if (!Number.isSafeInteger(event.schemaVersion) || event.schemaVersion! < 1) errors.push('schemaVersion must be a positive integer');
    if (event.dataScope && !VALID_SCOPES.includes(event.dataScope)) errors.push('invalid dataScope');
    if (typeof event.payload === 'undefined') errors.push('payload is required');
    if (!event.createdAt) errors.push('createdAt is required');
    if (typeof event.payload !== 'undefined') {
      let isSerializable = true;
      try {
        if (typeof JSON.stringify(event.payload) !== 'string') {
          errors.push('payload must be serializable JSON');
          isSerializable = false;
        }
      } catch {
        errors.push('payload must be serializable JSON');
        isSerializable = false;
      }
      if (isSerializable) {
        const inspect = (value: unknown, depth = 0): void => {
          if (depth > 40) {
            errors.push('payload nesting exceeds maximum depth');
            return;
          }
          if (!value || typeof value !== 'object') return;
          for (const [key, child] of Object.entries(value)) {
            if (SENSITIVE_FIELD.test(key)) errors.push(`sensitive payload field is not allowed: ${key}`);
            inspect(child, depth + 1);
          }
        };
        inspect(event.payload);
      }
    }
    return { valid: errors.length === 0, errors };
  }
  assertValid(event: Partial<SyncEvent>): void {
    const r = this.validate(event);
    if (!r.valid) throw new Error(`Invalid sync event: ${r.errors.join(', ')}`);
  }
}
