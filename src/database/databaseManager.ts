import { open } from 'sql.js';
import { DatabaseManager } from './databaseManager';

// Singleton pattern for the worker database
let workerDb: any = null;

// Initialize the database in the worker
export async function initializeWorkerDatabase(): Promise<any> {
  if (workerDb) return workerDb;
  
  const file = await fetch('data:application/sql,');
  const arrbuf = await file.arrayBuffer();
  const db = await open({ filename: ':memory:' }, arrbuf);
  workerDb = db;
  return db;
}

// Run a SQL query in the worker context
export async function runWorkerQuery(sql: string): Promise<any> {
  if (!workerDb) {
    await initializeWorkerDatabase();
  }
  
  const stmt = workerDb.prepare(sql);
  const result = stmt.all();
  stmt.free();
  return result;
}

// Export for use by the main thread
export { DatabaseManager };