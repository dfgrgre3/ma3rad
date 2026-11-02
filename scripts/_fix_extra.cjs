const fs=require('fs');
const p='src/services/PermissionService.ts';
const lines=fs.readFileSync(p,'utf8').split('\n');
// remove the extra closing brace at line 415 (1-based)
if(lines[414].trim()==='};'){ lines.splice(414,1); }
fs.writeFileSync(p,lines.join('\n'),'utf8');
console.log('done');
