#!/usr/bin/env node
/*
 * Read-only branch/company scope audit.
 *
 * Usage:
 *   node scripts/db-scope-audit.cjs <path-to-sqlite-file> [--json] [--all]
 *
 * Answers: which business tables carry financial/operational rows that cannot
 * be attributed to a branch or company. Scope is considered present when the
 * table has a branch_id/company_id-style column directly, OR reaches one
 * through a foreign key to a scoped parent (detail/line tables), OR is a
 * documented indirect path (warehouse_id -> branch_warehouses).
 *
 * Severity:
 *   CRITICAL - business table with no resolvable scope at all
 *   WARNING  - scope column nullable, contains NULLs, or references orphans
 *   OK       - scope resolved (direct or via parent)
 *   INFO     - global master/config/audit table (scope not expected)
 *
 * It never writes to the database. Point it at a copy of the live file.
 */
const fs = require('node:fs');
const path = require('node:path');
const initSqlJs = require('sql.js');

// Column-name fragments that mark a table as carrying business data.
const BUSINESS_PATTERNS = [
  /amount/i, /total/i, /balance/i, /price/i, /cost/i, /debit/i, /credit/i,
  /quantit/i, /qty/i, /paid/i, /remaining/i, /salary/i, /fee/i, /discount/i,
  /tax/i, /value/i, /rate/i, /sum/i, /installment/i, /depreciation/i,
];

// Exact scope column names, in priority order.
const BRANCH_COLUMNS = ['branch_id', 'source_branch_id', 'from_branch_id', 'to_branch_id', 'requested_branch_id'];
const COMPANY_COLUMNS = ['company_id', 'tenant_id', 'parent_company_id'];

// Tables that define scope rather than consume it, plus pure infra tables.
const SCOPE_ROOT_TABLES = new Set(['branches', 'companies', 'branch_warehouses', 'sync_branches']);
const INFRA_TABLES = new Set([
  'schema_migrations', 'sequence_counters', 'system_settings', 'app_settings',
  'sync_cursor', 'sync_applied_events',
]);
// platform_* tables are scoped by tenant on the central server by design.
const isPlatformTable = (name) => name.startsWith('platform_');
const isSyncTable = (name) => name.startsWith('sync_');

// Master/config/reference data that is legitimately global to the tenant.
const MASTER_NAME = new RegExp([
  'settings?', 'config', 'currenc', 'exchange_rate', 'tiers?', 'brackets?',
  'gateways?', 'chart_of_accounts', 'categories', 'brands', 'attribute',
  'field_option', 'module', 'permissions?', 'roles?', 'number_format',
  'templates?', 'feature_flag', 'price_history', 'plans?', 'audit',
  'grades?', 'tones?', 'uoms?', 'units?', 'terminology', 'dictionary',
  'translations?', 'document_types?', 'approval_policies', 'work_centers',
  'bills_of_materials', 'warehouses', 'products', 'price_lists?',
  'tax', 'deduction', 'allowance_types?', 'loan_types?', 'leave_types?',
  'departments?', 'job_titles?', 'positions?', 'cost_centers?',
  'projects?_types?', 'notification', 'backup', 'device', 'api_keys?',
].join('|'), 'i');

function pragmaColumns(db, table) {
  const res = db.exec(`SELECT name, "notnull", dflt_value, pk FROM pragma_table_info('${table.replace(/'/g, "''")}')`)[0];
  if (!res) return [];
  return res.values.map((v) => ({ name: v[0], notNull: v[1] === 1, defaultValue: v[2], pk: v[3] }));
}

function foreignKeys(db, table) {
  const res = db.exec(`SELECT "table" AS parent, "from" AS col FROM pragma_foreign_key_list('${table.replace(/'/g, "''")}')`)[0];
  if (!res) return [];
  return res.values.map((v) => ({ parent: v[0], col: v[1] }));
}

function tableSql(db, table) {
  const res = db.exec(`SELECT sql FROM sqlite_master WHERE type='table' AND name='${table.replace(/'/g, "''")}'`)[0];
  return res ? String(res.values[0][0] || '') : '';
}

function scalar(db, sql, params = []) {
  const res = db.exec(sql, params)[0];
  return res && res.values.length ? res.values[0][0] : undefined;
}

function count(db, sql, params = []) {
  return Number(scalar(db, sql, params) || 0);
}

async function main() {
  const dbPath = process.argv[2];
  const asJson = process.argv.includes('--json');
  const showAll = process.argv.includes('--all');
  if (!dbPath) {
    console.error('Usage: node scripts/db-scope-audit.cjs <sqlite-file> [--json] [--all]');
    process.exit(2);
  }
  if (!fs.existsSync(dbPath)) {
    console.error(`File not found: ${dbPath}`);
    process.exit(2);
  }

  const SQL = await initSqlJs();
  const bytes = fs.readFileSync(dbPath);
  const db = new SQL.Database(new Uint8Array(bytes));

  const tables = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)[0]
    .values.map((v) => v[0]);
  const tableSet = new Set(tables);
  const hasBranches = tableSet.has('branches');
  const hasCompanies = tableSet.has('companies');
  const hasBranchWarehouses = tableSet.has('branch_warehouses');

  // Pre-compute columns + FKs once per table.
  const meta = new Map();
  for (const table of tables) {
    meta.set(table, {
      columns: pragmaColumns(db, table),
      fks: foreignKeys(db, table),
      sql: tableSql(db, table),
    });
  }
  const colNamesOf = (t) => new Set((meta.get(t)?.columns || []).map((c) => c.name));
  const directScope = (t) => {
    const names = colNamesOf(t);
    return {
      branchColumn: BRANCH_COLUMNS.find((c) => names.has(c)) || null,
      companyColumn: COMPANY_COLUMNS.find((c) => names.has(c)) || null,
    };
  };

  // Resolve scope: direct column, else recurse through FK parents (depth <= 4).
  const scopeCache = new Map();
  function resolveScope(table, depth = 0, seen = new Set()) {
    if (scopeCache.has(table)) return scopeCache.get(table);
    if (depth > 4 || seen.has(table) || SCOPE_ROOT_TABLES.has(table) || INFRA_TABLES.has(table)) {
      const none = { kind: 'NONE' };
      scopeCache.set(table, none);
      return none;
    }
    seen.add(table);
    const direct = directScope(table);
    if (direct.branchColumn || direct.companyColumn) {
      const result = { kind: 'DIRECT', ...direct };
      scopeCache.set(table, result);
      return result;
    }
    for (const fk of meta.get(table)?.fks || []) {
      if (!tableSet.has(fk.parent)) continue;
      const parentScope = resolveScope(fk.parent, depth + 1, new Set(seen));
      if (parentScope.kind !== 'NONE') {
        const result = {
          kind: 'VIA_PARENT',
          via: `${fk.col} -> ${fk.parent}`,
          parent: fk.parent,
          parentBranchColumn: parentScope.branchColumn || null,
          parentCompanyColumn: parentScope.companyColumn || null,
        };
        scopeCache.set(table, result);
        return result;
      }
    }
    const none = { kind: 'NONE' };
    scopeCache.set(table, none);
    return none;
  }

  // Fallback for tables that reference scoped parents WITHOUT declared FK
  // constraints: guess the parent table from <name>_id column names.
  // Weaker than a real FK, so results are reported as IMPLICIT_PARENT.
  const pluralize = (base) => (base.endsWith('s') ? base : base.endsWith('y') ? base.slice(0, -1) + 'ies' : base + 's');
  function resolveImplicitScope(table, seen = new Set()) {
    if (seen.has(table)) return null;
    seen.add(table);
    for (const col of colNamesOf(table)) {
      if (!col.endsWith('_id')) continue;
      const base = col.slice(0, -3);
      for (const candidate of [base, pluralize(base)]) {
        if (!tableSet.has(candidate) || candidate === table) continue;
        const parentScope = resolveScope(candidate);
        if (parentScope.kind !== 'NONE') {
          return {
            kind: 'IMPLICIT_PARENT',
            via: col + ' -> ' + candidate + ' (no FK declared)',
            parent: candidate,
            parentBranchColumn: parentScope.branchColumn || parentScope.parentBranchColumn || null,
            parentCompanyColumn: parentScope.companyColumn || parentScope.parentCompanyColumn || null,
          };
        }
      }
    }
    return null;
  }

  const findings = [];

  for (const table of tables) {
    if (SCOPE_ROOT_TABLES.has(table) || INFRA_TABLES.has(table)) continue;
    const { columns } = meta.get(table);
    const colNames = new Set(columns.map((c) => c.name));

    const businessColumns = columns.filter((c) => BUSINESS_PATTERNS.some((p) => p.test(c.name)));
    if (businessColumns.length === 0 && !showAll) continue;

    let scope = resolveScope(table);
    if (scope.kind === 'NONE') scope = resolveImplicitScope(table) || scope;
    if (scope.kind === 'IMPLICIT_PARENT') scope = { ...scope, hasIssue: true };
    const isMaster = MASTER_NAME.test(table);
    const category = isPlatformTable(table) ? 'PLATFORM' : isSyncTable(table) ? 'SYNC' : isMaster ? 'MASTER' : 'BUSINESS';

    const entry = {
      table,
      category,
      rows: count(db, `SELECT COUNT(*) FROM "${table}"`),
      businessColumns: businessColumns.map((c) => c.name),
      scope: {
        kind: scope.kind,
        via: scope.via || null,
        parent: scope.parent || null,
        branchColumn: scope.branchColumn || null,
        companyColumn: scope.companyColumn || null,
        branchNotNull: scope.branchColumn ? (columns.find((c) => c.name === scope.branchColumn)?.notNull ?? null) : null,
        companyNotNull: scope.companyColumn ? (columns.find((c) => c.name === scope.companyColumn)?.notNull ?? null) : null,
        indirectViaWarehouse: INDIRECT_HINTS(colNames, hasBranchWarehouses),
      },
      issues: [],
    };

    if (scope.kind === 'IMPLICIT_PARENT') entry.issues.push('IMPLICIT_SCOPE_NO_FK');
    if (scope.kind === 'NONE' && !entry.scope.indirectViaWarehouse && category === 'BUSINESS') {
      entry.issues.push('NO_SCOPE_COLUMN');
    }

    // Null/orphan checks only apply to the table's OWN scope columns.
    const ownBranch = scope.kind === 'DIRECT' ? scope.branchColumn : null;
    const ownCompany = scope.kind === 'DIRECT' ? scope.companyColumn : null;
    if (ownBranch) {
      const col = columns.find((c) => c.name === ownBranch);
      if (!col.notNull) entry.issues.push('BRANCH_NULLABLE');
      const nulls = count(db, `SELECT COUNT(*) FROM "${table}" WHERE "${ownBranch}" IS NULL`);
      if (nulls > 0) entry.issues.push(`BRANCH_NULL_ROWS:${nulls}`);
      if (hasBranches && ownBranch === 'branch_id') {
        const orphans = count(db, `SELECT COUNT(*) FROM "${table}" t WHERE t."${ownBranch}" IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM branches b WHERE b.id = t."${ownBranch}")`);
        if (orphans > 0) entry.issues.push(`BRANCH_ORPHANS:${orphans}`);
      }
    }
    if (ownCompany && ownCompany !== 'tenant_id') {
      const col = columns.find((c) => c.name === ownCompany);
      if (!col.notNull) entry.issues.push('COMPANY_NULLABLE');
      const nulls = count(db, `SELECT COUNT(*) FROM "${table}" WHERE "${ownCompany}" IS NULL`);
      if (nulls > 0) entry.issues.push(`COMPANY_NULL_ROWS:${nulls}`);
      if (hasCompanies) {
        const orphans = count(db, `SELECT COUNT(*) FROM "${table}" t WHERE t."${ownCompany}" IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM companies c WHERE c.id = t."${ownCompany}")`);
        if (orphans > 0) entry.issues.push(`COMPANY_ORPHANS:${orphans}`);
      }
    }

    if (category === 'MASTER' || category === 'PLATFORM' || category === 'SYNC') {
      entry.severity = entry.issues.length ? 'WARNING' : 'INFO';
    } else if (scope.kind === 'NONE' && !entry.scope.indirectViaWarehouse) {
      entry.severity = 'CRITICAL';
    } else {
      entry.severity = entry.issues.length ? 'WARNING' : 'OK';
    }
    findings.push(entry);
  }

  const summary = {
    file: path.resolve(dbPath),
    tablesScanned: findings.length,
    bySeverity: findings.reduce((acc, f) => { acc[f.severity] = (acc[f.severity] || 0) + 1; return acc; }, {}),
    referenceTables: {
      branches: hasBranches ? count(db, 'SELECT COUNT(*) FROM branches') : 'MISSING',
      companies: hasCompanies ? count(db, 'SELECT COUNT(*) FROM companies') : 'MISSING',
      branchWarehouses: hasBranchWarehouses ? count(db, 'SELECT COUNT(*) FROM branch_warehouses') : 'MISSING',
    },
  };

  if (asJson) {
    process.stdout.write(`${JSON.stringify({ summary, findings }, null, 2)}\n`);
  } else {
    console.log('Scope audit:', summary.file);
    console.log('Reference tables:', JSON.stringify(summary.referenceTables));
    console.log('Scanned tables:', summary.tablesScanned, '| severity:', JSON.stringify(summary.bySeverity));
    const order = { CRITICAL: 0, WARNING: 1, OK: 2, INFO: 3 };
    for (const f of findings.sort((a, b) => order[a.severity] - order[b.severity] || a.table.localeCompare(b.table))) {
      if ((f.severity === 'OK' || f.severity === 'INFO') && !showAll) continue;
      const scopeText = f.scope.kind === 'DIRECT'
        ? `direct(branch=${f.scope.branchColumn || '-'},company=${f.scope.companyColumn || '-'})`
        : (f.scope.kind === 'VIA_PARENT' || f.scope.kind === 'IMPLICIT_PARENT')
          ? `via ${f.scope.via}`
          : f.scope.indirectViaWarehouse ? 'indirect(warehouse)' : 'NONE';
      console.log(`[${f.severity}] ${f.table} (${f.category}, ${f.rows} rows) scope: ${scopeText}`);
      for (const issue of f.issues) console.log(`    - ${issue}`);
    }
  }
  db.close();
}

function INDIRECT_HINTS(colNames, hasBranchWarehouses) {
  return hasBranchWarehouses && colNames.has('warehouse_id');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
