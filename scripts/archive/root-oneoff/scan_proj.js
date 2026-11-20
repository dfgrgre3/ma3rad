const fs=require('fs'),path=require('path');
const dirs=['src/database/migrations','src/database/schema'];
const files=[];
for(const d of dirs){for(const f of fs.readdirSync(d)){if(f.endsWith('.ts'))files.push(path.join(d,f));}}
const realCols={};
for(const file of files){
  const s=fs.readFileSync(file,'utf8');
  // find CREATE TABLE blocks
  const re=/CREATE TABLE(?: IF NOT EXISTS)?\s+"?(\w+)"?\s*\(([\s\S]*?)\n\s*\)/g;
  let m;
  while((m=re.exec(s))){
    const table=m[1], body=m[2];
    if(!/project|estimate|contract|certificate|change_request|budget|milestone|deliverable|task|time_entry/i.test(table))continue;
    const colRe=/"?(\w+)"?\s+REAL\b/g;let c;
    while((c=colRe.exec(body))){
      (realCols[table]=realCols[table]||new Set()).add(c[1]);
    }
  }
}
// also ALTER ADD COLUMN ... REAL
for(const file of files){
  const s=fs.readFileSync(file,'utf8');
  const re=/addColumn\(db,\s*'(\w+)',\s*'(\w+)',\s*'[^']*REAL[^']*'\)/g;let m;
  while((m=re.exec(s))){
    if(!/project|estimate|contract|certificate|change_request|budget|milestone|deliverable/i.test(m[1]))continue;
    (realCols[m[1]]=realCols[m[1]]||new Set()).add(m[2]);
  }
  const re2=/ALTER TABLE\s+"?(\w+)"?\s+ADD COLUMN\s+"?(\w+)"?\s+REAL/gi;let m2;
  while((m2=re2.exec(s))){
    (realCols[m2[1]]=realCols[m2[1]]||new Set()).add(m2[2]);
  }
}
for(const t of Object.keys(realCols).sort())console.log(t+': '+[...realCols[t]].join(', '));
