const fs=require('fs');
const p='src/services/PermissionService.ts';
const lines=fs.readFileSync(p,'utf8').split('\n');
if(lines[415].trim()==='};'){ lines.splice(415,1); }
fs.writeFileSync(p,lines.join('\n'),'utf8');
console.log('done');
