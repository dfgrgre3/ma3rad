import './integration.setup.ts';
import { test } from 'node:test';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';

test('fk probe', async () => {
  const m = DatabaseManager.getInstance() as any;
  const db = await m.initialize();
  console.log('facade:', JSON.stringify(db.exec('PRAGMA foreign_keys')));
  console.log('rawdb :', JSON.stringify(m.db.exec('PRAGMA foreign_keys')));
});
