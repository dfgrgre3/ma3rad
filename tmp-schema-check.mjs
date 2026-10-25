import initSqlJs from 'sql.js';
import fs from 'node:fs';

const src = fs.readFileSync('d:/ma3rad/src/database/schema.ts', 'utf8');
const start = src.indexOf('`') + 1;
const end = src.lastIndexOf('`');
const sql = src.slice(start, end);

const SQL = await initSqlJs();
const db = new SQL.Database();
try {
  db.exec(sql);
  console.log('SCHEMA OK');
} catch (e) {
  console.log('SCHEMA ERROR:', e.message);
}
const cols = db.exec('PRAGMA table_info(branches)');
console.log('branches columns:', (cols[0]?.values || []).map((r) => r[1]).join(', '));
