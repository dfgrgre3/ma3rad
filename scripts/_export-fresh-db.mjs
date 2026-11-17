import '../test/integration.setup.ts';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import fs from 'node:fs';

const manager = DatabaseManager.getInstance();
await manager.initialize();
const bytes = manager.exportDatabaseBinary();
fs.writeFileSync(process.argv[2] || 'tmp-fresh.db', Buffer.from(bytes));
console.log(`wrote ${bytes.length} bytes`);
process.exit(0);
