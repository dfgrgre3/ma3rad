import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIGRATION_PART_143 } from '../src/database/migrations/part143.ts';

const SQL = await (globalThis as any).initSqlJs();

function createLegacySchema(db: any): void {
  db.exec('CREATE TABLE cash_registers (id TEXT PRIMARY KEY, current_balance INTEGER)');
  db.exec('CREATE TABLE quotations (id TEXT PRIMARY KEY, total_amount INTEGER)');
  db.run(`INSERT INTO cash_registers (id, current_balance) VALUES ('r1', 114.57), ('r2', 0), ('r3', -50.25)`);
  db.run(`INSERT INTO quotations (id, total_amount) VALUES ('q1', 2500.5), ('q2', 0)`);
}

test('part143 converts major-unit balances to INTEGER piastres', () => {
  const db = new SQL.Database();
  createLegacySchema(db);

  MIGRATION_PART_143.up(db as any);

  const reg = db.exec(`SELECT id, current_balance AS v FROM cash_registers ORDER BY id`)[0].values;
  assert.deepEqual(reg.map((r: any[]) => [r[0], Number(r[1])]), [
    ['r1', 11457],
    ['r2', 0],
    ['r3', -5025],
  ]);

  const quo = db.exec(`SELECT id, total_amount AS v FROM quotations ORDER BY id`)[0].values;
  assert.deepEqual(quo.map((r: any[]) => [r[0], Number(r[1])]), [
    ['q1', 250050],
    ['q2', 0],
  ]);

  db.close();
});
