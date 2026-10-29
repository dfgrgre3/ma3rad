import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { CustomerService } from '../src/services/CustomerService.ts';
import { SalesService } from '../src/services/SalesService.ts';
import { BackupService } from '../src/services/BackupService.ts';
import officeCrypto from 'officecrypto-tool';
import { createXlsxBackupWorkbook } from '../src/services/xlsxBackup.ts';

/**
 * Restoring a production backup is a destructive, all-or-nothing operation:
 * the file is inspected first, the live data is snapshotted, and the restored
 * database must still pass integrity_check afterwards.
 */

async function boot(): Promise<DatabaseManager> {
  const manager = DatabaseManager.getInstance();
  await manager.initialize();
  await PermissionService.seed();
  AuthService.login('admin', 'admin123');
  return manager;
}

function q<T = any>(sql: string, params: any[] = []): T[] {
  return DatabaseManager.getInstance().query<T>(sql, params);
}

function one<T = any>(sql: string, params: any[] = []): T {
  return q<T>(sql, params)[0];
}

function seedProduct(id: string, stock: number): void {
  q(
    `INSERT OR REPLACE INTO products (
       id, product_type, custom_unit, sku, barcode, name, category_id, brand_id, grade, size,
       base_unit, sell_unit, pieces_per_box, meters_per_box, cost_price, selling_price_m2,
       min_selling_price_m2, is_active
     ) VALUES (?, 'CERAMIC', '', ?, ?, ?, 'cat_floor', 'br_cleo', 'GRADE_1', '60x60',
       'M2', 'M2', 4, 1.44, 100, 300, 0, 1)`,
    [id, `SKU-${id}`, `BAR-${id}`, `صنف استعادة ${id}`]
  );
  q(
    `INSERT OR REPLACE INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2)
     VALUES (?, 'wh_main', ?, ?, 0)`,
    [`stk_${id}`, id, stock]
  );
}

function stubDesktopBackupApi(): { snapshots: Array<{ label: string; bytes: number }> } {
  const snapshots: Array<{ label: string; bytes: number }> = [];
  (globalThis as any).window.ceramisys = {
    db: {
      backup: async (label: string) => {
        snapshots.push({ label, bytes: DatabaseManager.getInstance().exportDatabaseBinary().length });
        return { ok: true, path: `C:\\backups\\${label}_snapshot.sqlite`, bytes: 1024 };
      },
      decryptXlsxBackup: async (bytes: Uint8Array, password: string) =>
        new Uint8Array(await officeCrypto.decrypt(Buffer.from(bytes), { password })),
    },
  };
  return { snapshots };
}

test('restoring a production backup replaces live data only after a verified snapshot', async () => {
  const manager = await boot();
  seedProduct('prod_restore_a', 40);
  seedProduct('prod_restore_b', 25);
  const customer = new CustomerService().createCustomer({
    name: 'عميل استعادة النسخة',
    phone: '01000009501',
    customerType: 'RETAIL',
    creditLimit: 100000,
  });

  const sales = new SalesService();

  const kept = sales.createSale({
    customerId: customer.id,
    warehouseId: 'wh_main',
    items: [{ productId: 'prod_restore_a', soldBy: 'M2', quantityM2: 2, boxesCount: 2, piecesCount: 8, unitPrice: 300 }],
    paidAmount: 600,
    paymentType: 'CASH',
  });

  // This is the "production" backup: everything written so far is the truth.
  await manager.flush();
  const productionBytes = manager.exportDatabaseBinary();
  const productionSummary = {
    customers: Number(one<{ n: number }>(`SELECT COUNT(*) AS n FROM customers`).n),
    invoices: Number(one<{ n: number }>(`SELECT COUNT(*) AS n FROM sales_invoices`).n),
    journal: Number(one<{ n: number }>(`SELECT COUNT(*) AS n FROM journal_entries`).n),
  };
  assert.ok(productionSummary.invoices >= 1);
  assert.ok(productionSummary.journal >= 1);

  // Work that happened after the backup and must disappear on restore.
  const discarded = sales.createSale({
    customerId: customer.id,
    warehouseId: 'wh_main',
    items: [{ productId: 'prod_restore_b', soldBy: 'M2', quantityM2: 1, boxesCount: 1, piecesCount: 4, unitPrice: 300 }],
    paidAmount: 300,
    paymentType: 'CASH',
  });
  assert.equal(
    q(`SELECT COUNT(*) AS n FROM sales_invoices WHERE id = ?`, [discarded.id])[0].n,
    1
  );
  const stockAfterExtraSale = Number(one<{ q: number }>(
    `SELECT quantity_m2 AS q FROM warehouse_stock WHERE product_id = 'prod_restore_b'`
  ).q);
  assert.equal(stockAfterExtraSale, 24);

  const { snapshots } = stubDesktopBackupApi();
  (globalThis as any).window.confirm = () => true;
  (globalThis as any).window.prompt = () => 'unused-password';

  const restored = await new BackupService().restoreBackupFromFile(
    new File([productionBytes], 'ceramisys_backup_production.ceramisys-backup', { type: 'application/octet-stream' })
  );

  // 1. A pre-restore snapshot was taken before touching the live database.
  assert.deepEqual(snapshots.map((s) => s.label), ['pre_restore']);
  assert.ok(snapshots[0].bytes > 0);

  // 2. The restored counts come from inspecting the file, and match the live DB.
  assert.equal(restored.invoicesCount, productionSummary.invoices);
  assert.equal(restored.customersCount, productionSummary.customers);
  assert.equal(restored.journalEntriesCount, productionSummary.journal);
  assert.equal(
    Number(one<{ n: number }>(`SELECT COUNT(*) AS n FROM sales_invoices`).n),
    productionSummary.invoices,
    'the restored database is the live database'
  );

  // 3. Post-backup work is gone, and the restored documents are intact.
  assert.equal(q(`SELECT COUNT(*) AS n FROM sales_invoices WHERE id = ?`, [discarded.id])[0].n, 0);
  assert.equal(q(`SELECT COUNT(*) AS n FROM sales_invoices WHERE id = ?`, [kept.id])[0].n, 1);
  assert.equal(
    Number(one<{ q: number }>(`SELECT quantity_m2 AS q FROM warehouse_stock WHERE product_id = 'prod_restore_a'`).q),
    38,
    'stock is exactly what the backup held'
  );
  assert.equal(
    Number(one<{ q: number }>(`SELECT quantity_m2 AS q FROM warehouse_stock WHERE product_id = 'prod_restore_b'`).q),
    25
  );

  // 4. The restored database is still healthy and fully migrated.
  const inspection = new BackupService().verifyBackupFile(manager.exportDatabaseBinary());
  assert.equal(inspection.valid, true);
  assert.equal(inspection.integrity, 'ok');
  const migrations = Number(one<{ n: number }>(`SELECT COUNT(*) AS n FROM schema_migrations`).n);
  assert.ok(migrations > 80, 'a restored database keeps its migration history');

  // 5. A corrupt file is refused without replacing anything.
  const liveHandle = manager.getDatabase();
  const invoicesBeforeBadRestore = Number(one<{ n: number }>(`SELECT COUNT(*) AS n FROM sales_invoices`).n);
  await assert.rejects(
    () => new BackupService().restoreBackupFromFile(
      new File([new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7])], 'broken.ceramisys-backup')
    ),
    /تالف|غير صالح/
  );
  assert.equal(manager.getDatabase(), liveHandle, 'a rejected restore never swaps the live handle');
  assert.equal(
    Number(one<{ n: number }>(`SELECT COUNT(*) AS n FROM sales_invoices`).n),
    invoicesBeforeBadRestore
  );

  // 6. After all that, sales still post normally against the restored data.
  const afterRestore = new SalesService().createSale({
    customerId: customer.id,
    warehouseId: 'wh_main',
    items: [{ productId: 'prod_restore_a', soldBy: 'M2', quantityM2: 1, boxesCount: 1, piecesCount: 4, unitPrice: 300 }],
    paidAmount: 300,
    paymentType: 'CASH',
  });
  assert.match(afterRestore.invoiceNumber, /^INV-\d{4}-\d{6}$/);
  assert.equal(
    Number(one<{ q: number }>(`SELECT quantity_m2 AS q FROM warehouse_stock WHERE product_id = 'prod_restore_a'`).q),
    37
  );
});

test('an encrypted XLSX workbook restores the complete SQLite backup through the restore flow', async () => {
  const manager = await boot();
  const databaseBytes = manager.exportDatabaseBinary();
  const password = 'correct horse battery';
  const workbookBytes = createXlsxBackupWorkbook(databaseBytes);
  const encryptedWorkbook = officeCrypto.encrypt(Buffer.from(workbookBytes), { password });
  const { snapshots } = stubDesktopBackupApi();
  (globalThis as any).window.prompt = () => password;

  const restored = await new BackupService().restoreBackupFromFile(
    new File([new Uint8Array(encryptedWorkbook)], 'ceramisys_backup_test.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
  );

  assert.deepEqual(snapshots.map((snapshot) => snapshot.label), ['pre_restore']);
  assert.equal(restored.invoicesCount, Number(one<{ n: number }>('SELECT COUNT(*) AS n FROM sales_invoices').n));
  assert.equal(restored.productsCount, Number(one<{ n: number }>('SELECT COUNT(*) AS n FROM products').n));
  assert.equal(new BackupService().verifyBackupFile(manager.exportDatabaseBinary()).valid, true);
});
