const fs=require('fs');
const p='src/services/PermissionService.ts';
let s=fs.readFileSync(p,'utf8');
s=s.replace(/\}\;\r?\n\r?\n\}\;\r?\n\r?\nconst ROLE_NAMES/, '};\n\nconst ROLE_NAMES');
fs.writeFileSync(p,s,'utf8');
console.log('done');
