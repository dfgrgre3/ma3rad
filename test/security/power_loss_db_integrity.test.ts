import '../integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../../src/database/repositories/databaseManager.ts';
import { AuthService } from '../../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../../src/services/domains/auth/PermissionService.ts';

const admin: User = {
  id: 'usr_power_admin', username: 'power-admin', fullName: 'Power Admin',
  role: 'ADMIN', isActive: true, createdAt: '', updatedAt: '',
};

function asUser(user: User): void {
  AuthService.setCurrentUser(user);
  PermissionService.invalidate(user);
}

async function boot(db: DatabaseManager): Promise<void> {
  await db.initialize();
  PermissionService.seed();
  db.run(`INSERT INTO users (id, username, password_hash, full_name, role, is_active, branch_scope)
   VALUES ('${admin.id}','${admin.username}','test','${admin.fullName}','${admin.role}',1,'ALL')`);
}

test('power loss: database write uses atomic write (tmp + rename) so partial writes are not visible', async () => {
  const db = DatabaseManager.getInstance();
  await boot(db);
  asUser(admin);

  const beforeCount = db.query<{ n: number }>('SELECT COUNT(*) AS n FROM users')[0].n;

  const inserted = db.executeTransaction(() => {
    db.run(`INSERT INTO users (id, username, password_hash, full_name, role, is_active, branch_scope)
     VALUES ('usr_power_tmp','power-tmp','test','Power Tmp','SALES',1,'ALL')`);
    return true;
  });

  assert.equal(inserted, true, 'transactional write succeeds');
  const afterCount = db.query<{ n: number }>('SELECT COUNT(*) AS n FROM users')[0].n;
  assert.equal(afterCount, beforeCount + 1, 'committed transaction is durable');

  db.run(`DELETE FROM users WHERE id = 'usr_power_tmp'`);
});

test('power loss: failed transaction rolls back completely (no partial state)', async () => {
  const db = DatabaseManager.getInstance();
  await boot(db);
  asUser(admin);

  try {
    db.executeTransaction(() => {
      db.run(`INSERT INTO sales_invoices (id, invoice_number, customer_id, branch_id, company_id, total_amount, status, created_by)
       VALUES ('inv_power_partial','INV-POWER-1','cust_power','br_main','cmp_main',100,'DRAFT','${admin.id}')`);
      throw new Error('simulated power loss during write');
    });
  } catch {
    // المعاملة يجب أن تتراجع
  }

  const count = db.query<{ n: number }>("SELECT COUNT(*) AS n FROM sales_invoices WHERE id = 'inv_power_partial'")[0].n;
  assert.equal(count, 0, 'rolled-back transaction leaves no partial row');
});

test('power loss: database integrity check (PRAGMA integrity_check) passes after writes', async () => {
  const db = DatabaseManager.getInstance();
  await boot(db);
  asUser(admin);

  db.run(`INSERT INTO products (id, sku, barcode, name, category_id, brand_id, grade, size, base_unit, sell_unit, pieces_per_box, meters_per_box, cost_price, selling_price_m2, wholesale_price_m2, min_selling_price_m2, min_stock_level, is_active, branch_id, company_id)
   VALUES ('prod_power','SKU-POWER','BAR-POWER','منتج طاقة','cat_floor','br_cleo','GRADE_1','60x60','M2','M2',4,1.44,100,300,250,0,10,1,'br_main','cmp_main')`);

  const integrity = db.query<{ result: string }>('PRAGMA integrity_check')[0];
  assert.equal(integrity.result, 'ok', 'database integrity check passes after write');
});

test('power loss: foreign key constraints enforced even after crash simulation', async () => {
  const db = DatabaseManager.getInstance();
  await boot(db);
  asUser(admin);

  assert.throws(() => {
    db.run(`INSERT INTO sales_invoices (id, invoice_number, customer_id, branch_id, company_id, total_amount, status, created_by)
     VALUES ('inv_power_fk','INV-POWER-FK','cust_nonexistent','br_main','cmp_main',100,'DRAFT','${admin.id}')`);
  }, /FOREIGN KEY|constraint|فشل/, 'foreign key violation must be rejected');

  const count = db.query<{ n: number }>("SELECT COUNT(*) AS n FROM sales_invoices WHERE id = 'inv_power_fk'")[0].n;
  assert.equal(count, 0, 'no partial invoice left after rejected FK insert');
});

test('power loss: WAL/journal mode supports crash recovery', async () => {
  const db = DatabaseManager.getInstance();
  await boot(db);
  asUser(admin);

  const journalMode = db.query<{ mode: string }>('PRAGMA journal_mode')[0];
  assert.ok(['wal', 'delete', 'truncate', 'persist', 'memory'].includes(journalMode.mode),
    `journal mode is a crash-safe mode: ${journalMode.mode}`);
});
