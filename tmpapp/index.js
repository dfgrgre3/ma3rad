console.log('process.versions.electron', process.versions.electron);
console.log('process.type', process.type);
const e = require('electron');
console.log('typeof e', typeof e, Array.isArray(e));
console.log('e sample', e.slice ? e.slice(0,5) : e);
if (process.versions.electron) { const {app}=require('electron'); console.log('app', typeof app); if(app) app.quit(); }
