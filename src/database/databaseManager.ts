import initSqlJs from 'sql.js';
import { DatabaseManager } from './repositories/databaseManager';

// Singleton pattern for the worker database
let workerDb: any = null;

// Initialize the database in the worker
export async function initializeWorkerDatabase(): Promise<any> {
  if (workerDb) return workerDb;

  const SQL = await initSqlJs();
  workerDb = new SQL.Database();
  return workerDb;
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
