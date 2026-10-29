// Creates a migrated CeramiSys database for the Electron end-to-end tests.
// Usage: node --import ./test/register-hook.mjs scripts/e2e/seed-db.ts <userDataDir>
import '../../test/integration.setup.ts';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseManager } from '../../src/database/db.ts';

const dataDir = process.argv[2];
if (!dataDir) throw new Error('Usage: seed-db.ts <userDataDir>');

const manager = DatabaseManager.getInstance();
await manager.initialize();

// A returning installation: setup already finished and a product exists.
manager.run(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('setup_completed', '1')`);
manager.run(
  `INSERT OR REPLACE INTO products (
     id, product_type, custom_unit, sku, barcode, name, category_id, brand_id, grade, size,
     base_unit, sell_unit, pieces_per_box, meters_per_box, cost_price, selling_price_m2,
     min_selling_price_m2, is_active)
   VALUES ('e2e_prod_1', 'CERAMIC', '', 'E2E-1', 'E2E-BAR-1', 'بلاط اختبار E2E',
     'cat_floor', 'br_cleo', 'GRADE_1', '60x60', 'M2', 'M2', 4, 1.44, 100, 300, 0, 1)`
);
manager.run(
  `INSERT OR REPLACE INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2)
   VALUES ('e2e_stock_1', 'wh_main', 'e2e_prod_1', 120, 0)`
);

const dbDir = path.join(dataDir, 'data');
fs.mkdirSync(dbDir, { recursive: true });
const target = path.join(dbDir, 'ceramisys.sqlite');
fs.writeFileSync(target, manager.exportDatabaseBinary());
console.log(`seeded ${target}`);
