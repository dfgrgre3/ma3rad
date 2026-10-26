import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { postLedgerEntry } from '../src/database/ledger.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { FinancialStatementsService } from '../src/services/FinancialStatementsService.ts';
import { localDateString } from '../src/utils/date.ts';
import { DATA_INTEGRITY_BASELINE } from './fixtures/data-integrity-baseline.ts';

test('reference balances reconcile to the ledger and detect customer, supplier, and stock drift', async () => {
  const manager = DatabaseManager.getInstance();
  await manager.initialize();
  await PermissionService.seed();
  const actor = AuthService.login('admin', 'admin123');
  const db = manager.getDatabase();
  const statements = new FinancialStatementsService();
  const expected = DATA_INTEGRITY_BASELINE.balanceReconciliation;

  manager.executeTransaction(() => {
    manager.run(`INSERT INTO customers (id,code,name,phone,current_balance,total_purchases)
      VALUES ('cust_integrity_ref','CUST-INTEGRITY-REF','Reference customer','01000000991',?,0)`,
      [expected.customerBalance]);
    manager.run(`INSERT INTO suppliers (id,code,name,phone,current_balance,total_purchases)
      VALUES ('sup_integrity_ref','SUP-INTEGRITY-REF','Reference supplier','01000000992',?,0)`,
      [expected.supplierBalance]);
    manager.run(`INSERT INTO products (id,sku,barcode,name,category_id,brand_id,size,cost_price)
      VALUES ('prod_integrity_ref','SKU-INTEGRITY-REF','BAR-INTEGRITY-REF','Reference stock','cat_floor','br_cleo','60x60',?)`,
      [expected.stockUnitCost]);
    manager.run(`INSERT INTO warehouse_stock (id,warehouse_id,product_id,quantity_m2,reserved_m2)
      VALUES ('stock_integrity_ref','wh_main','prod_integrity_ref',?,0)`, [expected.stockQuantityM2]);
    manager.run(`INSERT OR REPLACE INTO system_settings (key,value) VALUES ('costingMethod','AVERAGE_COST')`);

    const sourceBalances = [
      { code: '1103', target: Number(manager.query<any>('SELECT SUM(current_balance) AS v FROM customers')[0].v) },
      { code: '2101', target: -Number(manager.query<any>('SELECT SUM(current_balance) AS v FROM suppliers')[0].v) },
      { code: '1104', target: Number(manager.query<any>(`SELECT SUM(ws.quantity_m2*p.cost_price) AS v FROM warehouse_stock ws JOIN products p ON p.id=ws.product_id`)[0].v) },
    ];
    const adjustments = sourceBalances.map(({ code, target }) => {
      const current = Number(manager.query<any>(`SELECT COALESCE(SUM(l.debit-l.credit),0) AS v
        FROM journal_entry_lines l JOIN journal_entries e ON e.id=l.entry_id
        JOIN chart_of_accounts a ON a.id=l.account_id WHERE e.is_posted=1 AND a.code=?`, [code])[0].v);
      return { code, delta: Math.round((target - current) * 100) / 100 };
    }).filter((row) => Math.abs(row.delta) >= 0.01);
    const netDebit = adjustments.reduce((sum, row) => sum + row.delta, 0);
    const equityCode = manager.query<any>(`SELECT code FROM chart_of_accounts WHERE type='EQUITY' AND is_active=1 ORDER BY code LIMIT 1`)[0]?.code;
    assert.ok(equityCode, 'an active equity account is required for the reference opening balances');
    const lines = adjustments.map(({ code, delta }) => ({
      accountCode: code, debit: Math.max(0, delta), credit: Math.max(0, -delta),
    }));
    if (Math.abs(netDebit) >= 0.01) lines.push({
      accountCode: equityCode, debit: Math.max(0, -netDebit), credit: Math.max(0, netDebit),
    });
    if (lines.length) postLedgerEntry(db, {
      date: localDateString(), description: 'Reference data integrity opening balances',
      referenceType: 'TEST_DATA_INTEGRITY_BASELINE', referenceId: 'reference-opening-balances',
      createdBy: actor.id, lines,
    });

    const checks = statements.getReconciliation();
    const byKey = new Map(checks.map((check) => [check.key, check]));
    for (const key of ['journal', 'cached', 'customers', 'suppliers', 'inventory']) {
      assert.equal(byKey.get(key)?.status, 'MATCH', `${key} should match the reference ledger: ${JSON.stringify(byKey.get(key))}`);
    }
    assert.equal(byKey.get('customers')?.source, expected.customerBalance);
    assert.equal(byKey.get('suppliers')?.source, expected.supplierBalance);
    assert.equal(byKey.get('inventory')?.source, expected.stockValue);

    manager.run(`UPDATE customers SET current_balance=current_balance+1.11 WHERE id='cust_integrity_ref'`);
    assert.equal(new Map(statements.getReconciliation().map((check) => [check.key, check])).get('customers')?.status,
      'DIFFERENCE', 'customer subledger drift is detected');
    manager.run(`UPDATE suppliers SET current_balance=current_balance+2.22 WHERE id='sup_integrity_ref'`);
    assert.equal(new Map(statements.getReconciliation().map((check) => [check.key, check])).get('suppliers')?.status,
      'DIFFERENCE', 'supplier subledger drift is detected');
    manager.run(`UPDATE warehouse_stock SET quantity_m2=quantity_m2+1 WHERE id='stock_integrity_ref'`);
    assert.equal(new Map(statements.getReconciliation().map((check) => [check.key, check])).get('inventory')?.status,
      'DIFFERENCE', 'physical stock value drift is detected');
  });
});
