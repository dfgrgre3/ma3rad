const fs=require('fs');
const p='src/services/PermissionService.ts';
let s=fs.readFileSync(p,'utf8');
s=s.replace(/\n\};\n\n\};\n\nconst ROLE_NAMES/, '\n};\n\nconst ROLE_NAMES');
fs.writeFileSync(p,s,'utf8');
console.log('done');
