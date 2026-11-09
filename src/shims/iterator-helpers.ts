/* eslint-disable @typescript-eslint/no-this-alias -- `this` must be captured for generator closures */
// Minimal Iterator-helpers polyfill for legacy Chromium (< 117, e.g. the
// Electron 22 / Windows 7 ia32 build). pdfjs-dist evaluates
// `typeof Iterator.prototype.join !== "function"` at module load, which
// throws `ReferenceError: Iterator is not defined` when the global is
// missing and crashes the whole DataImportPage chunk.
// This shim must be imported before pdfjs-dist so it runs first.
export function installIteratorHelpers(): void {
  const g = globalThis as any;
  if (typeof g.Iterator !== 'undefined') return;

  const proto: any = {};

  function makeIter(gen: any): any {
    const obj: any = {
      next: (...args: any[]) => gen.next(...args),
      return: (v: any) => gen.return(v),
      throw: (e: any) => gen.throw(e),
    };
    obj[Symbol.iterator] = () => obj;
    Object.setPrototypeOf(obj, proto);
    return obj;
  }

  proto.map = function (fn: any) {
    const self = this;
    return makeIter(
      (function* () {
        let i = 0;
        for (const v of self) yield fn(v, i++);
      })(),
    );
  };
  proto.filter = function (fn: any) {
    const self = this;
    return makeIter(
      (function* () {
        let i = 0;
        for (const v of self) if (fn(v, i++)) yield v;
      })(),
    );
  };
  proto.take = function (n: any) {
    const self = this;
    return makeIter(
      (function* () {
        if (n <= 0) return;
        let i = 0;
        for (const v of self) {
          yield v;
          if (++i >= n) break;
        }
      })(),
    );
  };
  proto.drop = function (n: any) {
    const self = this;
    return makeIter(
      (function* () {
        let i = 0;
        for (const v of self) if (i++ >= n) yield v;
      })(),
    );
  };
  proto.flatMap = function (fn: any) {
    const self = this;
    return makeIter(
      (function* () {
        let i = 0;
        for (const v of self) yield* fn(v, i++);
      })(),
    );
  };
  proto.reduce = function (fn: any, initial: any) {
    let acc = initial;
    let i = 0;
    for (const v of this) acc = fn(acc, v, i++);
    return acc;
  };
  proto.toArray = function () {
    return [...this];
  };
  proto.forEach = function (fn: any) {
    let i = 0;
    for (const v of this) fn(v, i++);
  };
  proto.some = function (fn: any) {
    let i = 0;
    for (const v of this) if (fn(v, i++)) return true;
    return false;
  };
  proto.every = function (fn: any) {
    let i = 0;
    for (const v of this) if (!fn(v, i++)) return false;
    return true;
  };
  proto.find = function (fn: any) {
    let i = 0;
    for (const v of this) if (fn(v, i++)) return v;
    return undefined;
  };
  proto.join = function (separator: any) {
    return [...this].join(separator);
  };

  function IteratorCtor(this: any) {
    throw new TypeError('Iterator constructor cannot be invoked directly');
  }
  IteratorCtor.prototype = proto;
  proto.constructor = IteratorCtor;
  (IteratorCtor as any).from = function (iterable: any) {
    return makeIter(
      (function* () {
        yield* iterable;
      })(),
    );
  };

  g.Iterator = IteratorCtor;
}

installIteratorHelpers();
