/**
 * Post-migration money-storage audit.
 *
 * Usage:
 *   node --import ./test/register-hook.mjs scripts/audit-money-storage.mjs <path-to-sqlite>
 *
 * Works on any plain SQLite image (fresh export, decrypted backup, or test DB).
 * Verifies that every monetary column is INTEGER piastres and that core
 * accounting identities still hold after the minor-units migration.
 */
import initSqlJs from 'sql.js';
import fs from 'node:fs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const snapshotIdx = args.indexOf('--snapshot');
const compareIdx = args.indexOf('--compare');
if (!file || !fs.existsSync(file)) {
  console.error('Usage: node scripts/audit-money-storage.mjs <sqlite-file> [--snapshot out.json] [--compare before.json]');
  process.exit(2);
}

const SQL = await initSqlJs();
const db = new SQL.Database(fs.readFileSync(file));

const q = (sql, params = []) => db.exec(sql, params)[0]?.values ?? [];
const one = (sql, params = []) => q(sql, params)[0]?.[0];
const tableExists = (name) => q(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`, [name]).length > 0;

const MONEY_NAME = /price|amount|balance|total|subtotal|discount|tax|cost|salary|fee|value|paid|due|limit|budget|proceed|deposit|refund|expense|income|revenue|capital|installment|premium|fine|penalty|earning|allowance|bracket|threshold/i;
const NON_MONEY_NAME = /percent|rate|quantity|qty|count|days|hours|score|weight|probability|reading|level|ratio|multiplier|months|years|capacity|area|meter|km|width|height|thickness|usage|threshold_value|metric|_m2|m2$/i;

// Columns intentionally left REAL: mixed/ambiguous semantics documented during the
// minor-units sweep. Reported as warnings, not failures.
const KNOWN_DEFERRED = new Set([
  'approval_requests.requested_value',
  'approval_requests.current_value',
  'performance_goals.target_value',
  'performance_goals.actual_value',
  'promotions.value',
  'promotions.min_amount',
  'facility_condition_activations.measured_value',
  'facility_utility_readings.previous_value',
  'facility_utility_readings.current_value',
  'facility_cleaning_supplies.minimum_threshold',
  'platform_coupons.discount_value',
  'analytics_snapshots.metric_value',
  'cash_registers.current_balance_legacy_note', // placeholder guard
]);

const issues = [];
const warnings = [];
const report = { file, tables: 0, moneyColumns: 0, realMoneyColumns: [], fractionalValues: [], identities: {} };

// ── 1. Schema scan: money-named REAL columns must not exist ──────────────
const tables = q(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).map((r) => String(r[0]));
report.tables = tables.length;
for (const t of tables) {
  const cols = q(`PRAGMA table_info("${t}")`);
  for (const c of cols) {
    const name = String(c[1]);
    const type = String(c[2]).toUpperCase();
    if (!MONEY_NAME.test(name) || NON_MONEY_NAME.test(name)) continue;
    report.moneyColumns++;
    if (type === 'REAL') {
      report.realMoneyColumns.push(`${t}.${name}`);
      const key = `${t}.${name}`;
      if (KNOWN_DEFERRED.has(key)) warnings.push(`Deferred REAL column (documented semantics): ${key}`);
      else issues.push(`REAL money column remains: ${key}`);
    }
  }
}

// ── 2. Fractional values inside INTEGER money columns ────────────────────
for (const t of tables) {
  const cols = q(`PRAGMA table_info("${t}")`);
  const moneyInts = cols.filter((c) => {
    const name = String(c[1]);
    return /INTEGER/i.test(String(c[2])) && MONEY_NAME.test(name) && !NON_MONEY_NAME.test(name);
  }).map((c) => String(c[1]));
  for (const col of moneyInts.slice(0, 40)) {
    try {
      const bad = one(
        `SELECT COUNT(*) FROM "${t}" WHERE typeof("${col}") = 'real' AND "${col}" <> CAST("${col}" AS INTEGER) LIMIT 1`
      );
      const frac = one(`SELECT COUNT(*) FROM "${t}" WHERE typeof("${col}") = 'real'`);
      if (frac > 0) {
        report.fractionalValues.push(`${t}.${col}: ${frac} REAL-typed value(s)`);
        warnings.push(`${t}.${col} holds ${frac} REAL value(s) — expected INTEGER piastres`);
      }
    } catch { /* column may be generated/virtual */ }
  }
}

// ── 3. Accounting identities ─────────────────────────────────────────────
if (tableExists('journal_entry_lines')) {
  const postedFilter = tableExists('journal_entries')
    ? `WHERE entry_id IN (SELECT id FROM journal_entries WHERE is_posted = 1)` : '';
  const [debit, credit] = [
    Number(one(`SELECT COALESCE(SUM(debit),0) FROM journal_entry_lines ${postedFilter}`) ?? 0),
    Number(one(`SELECT COALESCE(SUM(credit),0) FROM journal_entry_lines ${postedFilter}`) ?? 0),
  ];
  report.identities.journalDebitsPiastres = debit;
  report.identities.journalCreditsPiastres = credit;
  report.identities.trialBalanceDiffPiastres = debit - credit;
  if (debit !== credit) issues.push(`Trial balance mismatch: debit ${debit} != credit ${credit} piastres`);
}

if (tableExists('journal_entries')) {
  const n = Number(one(`SELECT COUNT(*) FROM journal_entries WHERE is_posted = 1`) ?? 0);
  report.identities.postedEntries = n;
}

// ── 4. Key aggregate balances (eyeball before/after comparison) ─────────
const aggregates = [
  ['customers.current_balance', `SELECT COALESCE(SUM(current_balance),0)/100.0 FROM customers`, 'customers'],
  ['suppliers.current_balance', `SELECT COALESCE(SUM(current_balance),0)/100.0 FROM suppliers`, 'suppliers'],
  ['cash_registers.current_balance', `SELECT COALESCE(SUM(current_balance),0)/100.0 FROM cash_registers`, 'cash_registers'],
  ['bank_accounts.current_balance', `SELECT COALESCE(SUM(current_balance),0)/100.0 FROM bank_accounts`, 'bank_accounts'],
  ['sales_invoices.total', `SELECT COALESCE(SUM(total_amount),0)/100.0 FROM sales_invoices`, 'sales_invoices'],
  ['purchase_invoices.total', `SELECT COALESCE(SUM(total_amount),0)/100.0 FROM purchase_invoices`, 'purchase_invoices'],
  ['quotations.total_amount', `SELECT COALESCE(SUM(total_amount),0)/100.0 FROM quotations`, 'quotations'],
  ['platform_invoices.total', `SELECT COALESCE(SUM(total),0)/100.0 FROM platform_invoices`, 'platform_invoices'],
];
report.aggregates = {};
for (const [label, sql, table] of aggregates) {
  if (tableExists(table)) {
    try { report.aggregates[label] = Number(one(sql) ?? 0); } catch { /* skip */ }
  }
}

// ── 5. Schema migration coverage ─────────────────────────────────────────
if (tableExists('schema_migrations')) {
  report.migrationsApplied = Number(one('SELECT COUNT(*) FROM schema_migrations') ?? 0);
  const moneyMigrations = q(`SELECT id FROM schema_migrations WHERE id LIKE '%money%' OR id LIKE '%minor%' ORDER BY id`).map((r) => String(r[0]));
  report.moneyMigrations = moneyMigrations;
  const required = ['213_money_minor_units', '215_sales_money_minor_units', '216_purchase_money_minor_units',
    '217_parties_money_minor_units', '218_product_inventory_money_minor_units', '219_cash_sales_pipeline_money_minor_units',
    '220_purchase_pipeline_money_minor_units', '221_hr_payroll_money_minor_units', '222_projects_contracts_money_minor_units',
    '223_assets_facilities_ops_money_minor_units', '224_finance_extras_money_minor_units',
    '225_platform_billing_money_minor_units', '226_misc_money_minor_units', '227_cash_register_quotation_money_minor_units'];
  const missing = required.filter((id) => !moneyMigrations.includes(id));
  if (missing.length) warnings.push(`Money migrations not applied: ${missing.join(', ')}`);
}

// ── Output ───────────────────────────────────────────────────────────────
console.log(JSON.stringify(report, null, 2));
if (warnings.length) { console.log('\nWARNINGS:'); warnings.forEach((w) => console.log(' -', w)); }
if (issues.length) { console.log('\nISSUES:'); issues.forEach((i) => console.log(' -', i)); process.exitCode = 1; }
else console.log('\nOK: no money-storage issues detected.');

// ── Snapshot / compare mode ──────────────────────────────────────────────
// --snapshot out.json : save aggregates + identities for a later --compare
// --compare before.json : diff aggregates/identities against a saved snapshot
const snapshot = {
  takenAt: new Date().toISOString(),
  aggregates: report.aggregates,
  identities: report.identities,
  rowCounts: {},
};
for (const t of ['journal_entries', 'journal_entry_lines', 'sales_invoices', 'purchase_invoices',
  'customers', 'suppliers', 'cash_registers', 'quotations', 'payments', 'expenses']) {
  if (tableExists(t)) snapshot.rowCounts[t] = Number(one(`SELECT COUNT(*) FROM "${t}"`) ?? 0);
}

if (snapshotIdx !== -1) {
  const out = args[snapshotIdx + 1];
  fs.writeFileSync(out, JSON.stringify(snapshot, null, 2));
  console.log(`\nSnapshot written to ${out}`);
}
if (compareIdx !== -1) {
  const before = JSON.parse(fs.readFileSync(args[compareIdx + 1], 'utf8'));
  console.log('\n=== BEFORE → AFTER COMPARISON ===');
  let drift = false;
  for (const [label, afterVal] of Object.entries(snapshot.aggregates)) {
    const beforeVal = before.aggregates?.[label];
    if (beforeVal === undefined) continue;
    const diff = Number(afterVal) - Number(beforeVal);
    const flag = Math.abs(diff) > 0.004 ? '  <-- DRIFT' : '';
    if (Math.abs(diff) > 0.004) drift = true;
    console.log(`${label.padEnd(38)} ${Number(beforeVal).toFixed(2)} → ${Number(afterVal).toFixed(2)}  (Δ ${diff.toFixed(2)})${flag}`);
  }
  for (const [label, afterVal] of Object.entries(snapshot.identities)) {
    const beforeVal = before.identities?.[label];
    if (beforeVal === undefined || typeof afterVal !== 'number') continue;
    const diff = Number(afterVal) - Number(beforeVal);
    const flag = Math.abs(diff) > 0.004 ? '  <-- DRIFT' : '';
    if (Math.abs(diff) > 0.004) drift = true;
    console.log(`${label.padEnd(38)} ${beforeVal} → ${afterVal}  (Δ ${diff})${flag}`);
  }
  for (const [t, afterCount] of Object.entries(snapshot.rowCounts)) {
    const beforeCount = before.rowCounts?.[t];
    if (beforeCount !== undefined && beforeCount !== afterCount)
      console.log(`rowCount ${t.padEnd(34)} ${beforeCount} → ${afterCount}  <-- CHANGED`);
  }
  if (!drift) console.log('No monetary drift detected.');
  else { console.log('Drift found — investigate before trusting the migration.'); process.exitCode = 1; }
}
db.close();
