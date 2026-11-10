import test from 'node:test';
import assert from 'node:assert/strict';
import { EffectEngine, EffectRegistry } from '../src/services/domains/effects';

test('EffectEngine runs handlers in declaration order', () => {
  const registry = new EffectRegistry();
  const calls: string[] = [];
  registry.register('audit.log', () => calls.push('audit'));
  registry.register('ledger.post', () => calls.push('ledger'));
  const engine = new EffectEngine(registry);
  engine.run(
    { db: null, actorId: 'u', actorName: 'U' },
    [
      { type: 'ledger.post', payload: { aggregateType: 'x', aggregateId: '1', data: {} } },
      { type: 'audit.log', payload: { aggregateType: 'x', aggregateId: '1', data: {} } },
    ]
  );
  assert.deepEqual(calls, ['ledger', 'audit']);
});

test('EffectEngine propagates handler errors (caller must rollback)', () => {
  const registry = new EffectRegistry();
  registry.register('ledger.post', () => { throw new Error('boom'); });
  const engine = new EffectEngine(registry);
  assert.throws(() => {
    engine.run(
      { db: null, actorId: 'u', actorName: 'U' },
      [{ type: 'ledger.post', payload: { aggregateType: 'x', aggregateId: '1', data: {} } }]
    );
  }, /boom/);
});

test('EffectEngine.runIfAny is a no-op for empty lists', () => {
  const registry = new EffectRegistry();
  let called = false;
  registry.register('audit.log', () => { called = true; });
  const engine = new EffectEngine(registry);
  engine.runIfAny({ db: null, actorId: 'u', actorName: 'U' }, []);
  assert.equal(called, false);
});
