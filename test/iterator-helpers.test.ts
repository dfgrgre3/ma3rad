import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installIteratorHelpers } from '../src/shims/iterator-helpers.ts';

test('iterator helpers polyfill defines Iterator on legacy runtimes without it', () => {
  const g = globalThis as any;
  const original = g.Iterator;
  try {
    delete g.Iterator;
    installIteratorHelpers();
    assert.equal(typeof g.Iterator, 'function');
    assert.deepEqual(g.Iterator.from([1, 2, 3]).map((x: number) => x * 2).filter((x: number) => x > 2).toArray(), [4, 6]);
    assert.equal(g.Iterator.from(['a', 'b']).join('-'), 'a-b');
    assert.deepEqual(g.Iterator.from([1, 2, 3, 4]).take(2).toArray(), [1, 2]);
    assert.equal(g.Iterator.from([1, 2, 3]).reduce((a: number, b: number) => a + b, 0), 6);
  } finally {
    g.Iterator = original;
  }
});

test('iterator helpers polyfill is a no-op when Iterator already exists', () => {
  const g = globalThis as any;
  const before = g.Iterator;
  installIteratorHelpers();
  assert.equal(g.Iterator, before);
});
