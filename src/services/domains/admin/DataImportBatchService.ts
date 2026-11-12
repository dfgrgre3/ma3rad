import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { CustomerService } from '../customers/CustomerService';
import { ProductService } from '../products/ProductService';
import { ENTITY_META } from './dataImportMetadata';

export class DataImportBatchService {
  createBatch(entity: 'customers' | 'products', sourceName: string | undefined, userId: string): string {
    const batchId = `dib_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    DatabaseManager.getInstance().run(
      'INSERT INTO data_import_batches (id,entity_type,source_name,status,imported_count,created_by) VALUES (?,?,?,?,?,?)',
      [batchId, entity, sourceName || 'استيراد بيانات', 'COMPLETED', 0, userId],
    );
    return batchId;
  }

  recordImportedEntity(batchId: string, entityId: string): void {
    DatabaseManager.getInstance().run(
      'INSERT INTO data_import_batch_records (id,batch_id,entity_id) VALUES (?,?,?)',
      [`dibr_${uuidv4().replace(/-/g, '').slice(0, 12)}`, batchId, entityId],
    );
  }

  completeBatch(batchId: string, created: number, skipped: number): void {
    DatabaseManager.getInstance().run('UPDATE data_import_batches SET imported_count=?,status=? WHERE id=?', [
      created,
      skipped ? 'PARTIAL' : 'COMPLETED',
      batchId,
    ]);
  }

  getImportBatches(entity: 'customers' | 'products'): Array<{
    id: string;
    entityType: 'customers' | 'products';
    sourceName: string;
    status: string;
    importedCount: number;
    createdAt: string;
  }> {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, ENTITY_META[entity].permission);
    return DatabaseManager.getInstance().query(
      'SELECT id,entity_type,source_name,status,imported_count,created_at FROM data_import_batches WHERE entity_type=? ORDER BY created_at DESC, rowid DESC LIMIT 50',
      [entity],
    );
  }

  rollbackImportBatch(batchId: string): number {
    const actor = AuthService.requireAuth();
    const db = DatabaseManager.getInstance();
    const batch = db.query<{ id: string; entityType: 'customers' | 'products'; status: string }>(
      'SELECT id,entity_type,status FROM data_import_batches WHERE id=?',
      [batchId],
    )[0];
    if (!batch) throw new Error('دفعة الاستيراد غير موجودة.');
    if (batch.status === 'ROLLED_BACK') return 0;
    PermissionService.require(
      actor,
      batch.entityType === 'customers' ? 'ui.customers.list.delete' : 'ui.products.catalog.delete',
    );
    if (batch.entityType === 'customers') PermissionService.require(actor, 'ui.customers.list.view');

    const records = db.query<{ entityId: string }>(
      'SELECT entity_id FROM data_import_batch_records WHERE batch_id=? ORDER BY rowid DESC',
      [batchId],
    );
    for (const { entityId } of records) {
      if (batch.entityType === 'customers') {
        const customer = db.query<{ currentBalance: number }>(
          'SELECT current_balance FROM customers WHERE id=?',
          [entityId],
        )[0];
        if (customer && Math.abs(Number(customer.currentBalance || 0)) > 1e-6) {
          throw new Error('لا يمكن التراجع عن الدفعة لوجود رصيد حالي على أحد العملاء المستوردين.');
        }
      }
      const references = this.getRecordReferences(batch.entityType, entityId);
      if (references.length) {
        throw new Error(`لا يمكن التراجع عن الدفعة لوجود سجلات مرتبطة في «${references[0]}».`);
      }
    }

    for (const { entityId } of records) {
      if (batch.entityType === 'customers') new CustomerService().deleteCustomer(entityId);
      else new ProductService().deleteProduct(entityId);
    }
    db.run("UPDATE data_import_batches SET status='ROLLED_BACK',imported_count=0 WHERE id=?", [batchId]);
    return records.length;
  }

  private getRecordReferences(entityType: 'customers' | 'products', entityId: string): string[] {
    const db = DatabaseManager.getInstance();
    const tables = db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    );
    const references: string[] = [];
    for (const { name } of tables) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;
      const foreignKeys = db.query<{ table: string; from: string; to: string }>(
        `PRAGMA foreign_key_list("${name}")`,
      );
      for (const key of foreignKeys) {
        if (key.table !== entityType || key.to !== 'id' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key.from)) continue;
        const count = db.query<{ count: number }>(
          `SELECT COUNT(*) AS count FROM "${name}" WHERE "${key.from}"=?`,
          [entityId],
        )[0]?.count || 0;
        if (count > 0) references.push(name);
      }
    }
    return references;
  }
}
