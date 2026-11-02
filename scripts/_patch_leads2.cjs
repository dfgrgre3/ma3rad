const fs=require('fs');
const p='src/pages/crm/LeadsPage.tsx';
const lines=fs.readFileSync(p,'utf8').split('\n');
const idx=lines.findIndex((l,i)=>l.trim()==='};' && i>100 && i<120);
const block=[
"  const handleDelete = (lead: Lead) => {",
"    if (!confirm(`حذف العميل المحتمل \"${lead.name}\"؟`)) return;",
"    try { service.deleteLead(lead.id); load(); }",
"    catch (err: any) { alert(err?.message || 'تعذر حذف العميل المحتمل.'); }",
"  };",
];
lines.splice(idx+1,0,...block);
fs.writeFileSync(p,lines.join('\n'),'utf8');
console.log('done');
