import initSqlJs from 'sql.js';
import { runMigrations } from './src/database/migrations.ts';

const SQL = await initSqlJs();
const db = new SQL.Database();
const report = runMigrations(db);
console.log('applied:', report.applied.length, 'skipped:', report.skipped.length);
console.log('failed:', JSON.stringify(report.failed, null, 2));

const cols = db.exec('PRAGMA table_info(branches)');
console.log('branches columns:', (cols[0]?.values || []).map((r) => r[1]).join(', '));

// Queries that previously failed with "no such column: is_default"
console.log('branch rows:', JSON.stringify(db.exec('SELECT id, code, name, is_main FROM branches')[0]?.values));
db.run(`INSERT INTO branches (id, code, name, is_main, is_active) VALUES ('br_x', 'BR-X', 'فرع تجربة', 0, 1)`);
console.log('insert branch with is_main: OK');
