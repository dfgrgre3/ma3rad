console.log('process.type', process.type);
const e = require('electron');
console.log('keys', Object.keys(e).slice(0,20));
console.log('app', typeof e.app);
