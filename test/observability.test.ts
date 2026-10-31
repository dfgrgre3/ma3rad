import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditLogger } from '../src/services/auditLogger.ts';

test('auditLogger logs and redacts sensitive changes without crashing', () => {
  auditLogger.log('u1', 's1', 'update', 'user', 'u2', 'change', { password: 'secret', token: 'abc', name: 'x' }, true);
  const logs = auditLogger.getLogs({ limit: 1 });
  assert.equal((logs[0].changes as any).password, '[REDACTED]');
  assert.equal((logs[0].changes as any).token, '[REDACTED]');
  assert.equal((logs[0].changes as any).name, 'x');
});