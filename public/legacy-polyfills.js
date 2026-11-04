if (typeof Promise.withResolvers !== 'function') {
  Promise.withResolvers = function () {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

if (typeof Array.prototype.findLast !== 'function') {
  Object.defineProperty(Array.prototype, 'findLast', {
    configurable: true,
    writable: true,
    value: function (callback, thisArg) {
      for (let index = this.length - 1; index >= 0; index -= 1) {
        if (callback.call(thisArg, this[index], index, this)) return this[index];
      }
      return undefined;
    },
  });
}
