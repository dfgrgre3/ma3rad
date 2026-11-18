const fs=require('fs'),path=require('path');
const dirs=['src/database/migrations','src/database/schema'];
const files=[];
for(const d of dirs){for(const f of fs.readdirSync(d)){if(f.endsWith('.ts'))files.push(path.join(d,f));}}
const realCols={};
const pat=/fixed_asset|facility|vehicle|manufactur|warranty|handover|partner|subledger|maintenance|depreciation|disposal|operation|shift|quality|bom|work_order/i;
for(const file of files){
  const s=fs.readFileSync(file,'utf8');
  const re=/CREATE TABLE(?: IF NOT EXISTS)?\s+"?(\w+)"?\s*\(([\s\S]*?)\n\s*\)/g;
  let m;
  while((m=re.exec(s))){
    const table=m[1], body=m[2];
    if(!pat.test(table))continue;
    const colRe=/"?(\w+)"?\s+REAL\b/g;let c;
    while((c=colRe.exec(body))){(realCols[table]=realCols[table]||new Set()).add(c[1]);}
  }
  const re2=/addColumn\(db,\s*'(\w+)',\s*'(\w+)',\s*'[^']*REAL[^']*'\)/g;let m2;
  while((m2=re2.exec(s))){if(pat.test(m2[1])){(realCols[m2[1]]=realCols[m2[1]]||new Set()).add(m2[2]);}}
  const re3=/ALTER TABLE\s+"?(\w+)"?\s+ADD COLUMN\s+"?(\w+)"?\s+REAL/gi;let m3;
  while((m3=re3.exec(s))){if(pat.test(m3[1])){(realCols[m3[1]]=realCols[m3[1]]||new Set()).add(m3[2]);}}
}
for(const t of Object.keys(realCols).sort())console.log(t+': '+[...realCols[t]].join(', '));
