const fs = require('fs'), path = require('path');
const files = [];
for (const d of ['src/database/schema', 'src/database/migrations']) {
  for (const f of fs.readdirSync(d)) if (f.endsWith('.ts')) files.push(path.join(d, f));
}
// money-ish column names; exclude obvious non-money
const moneyRe = /(amount|price|cost|balance|total|fee|salary|wage|payment|discount|tax|value|premium|fine|deduction|earning|expense|revenue|profit|charge|deposit|refund|installment|commission|due|paid|remaining|subtotal|grand|net|gross|opening|closing|expected|actual|difference|penalty|bonus|overtime|loan|advance|claim|estimate|budget|rent|allowance|variance|unit_cost|total_cost|old_value|new_value|cash_amount|balance_amount|tax_amount|refunded|down_payment|financed|promised|bounce|delivery_fee|credit_limit|total_purchases|current_balance|opening_balance|base_amount|commission_amount|paid_amount|remaining_amount|installment_amount|estimated|contract|outstanding|sold|purchase_cost|depreciation|salvage|metric_value|max_value|requested_value|allocated|min_subtotal|discount_value|locked|min_order)/i;
const skipRe = /(quantity|percent|ratio|multiplier|hours|_days|m2|boxes|count|progress|latitude|longitude|weight|volume|area|distance|duration|age|year|month|day|score|rating|level|index|priority|sequence|version|sort|threshold|tolerance|capacity|limit(?!_amount)|minimum|maximum|_min_|_max_|date|time|status|type|code|name|_id$|percentage|qty|size|grade|unit$|uom|currency|rate_|_rate\b|interest|tax_rate|discount_rate|markup|margin|completion|attendance|late_|early_|break_|shift_|overtime_hours|leave_|accrual|points|tokens|attempts|failures|login|pin|otp|timeout|interval|frequency|cron|schedule_|iteration|batch_no|serial|imei|mac|ip_|port|revision|build|schema|service_years|service_months|days_count|odometer|capacity_kg|work_hours|depreciation_rate|contingency|tax_percent|overtime_multiplier|payroll_tax_rate|purchase_price|disposition_qty|probability|api_error|cpu_|disk_|memory_|upgrade_fee_percent|quantity$|_quantity|meters_per_box|min_quantity_m2|buy_quantity|get_quantity|delivered_quantity|planned_quantity|area_m2|expected_workdays|absent_days|unpaid_leave|late_minutes|overtime_minutes|unused_annual_leave)/i;
const covered = new Set();
// tables+cols already migrated (from part files specs)
for (const pf of ['part130','part131','part132','part134','part135','part136']) {
  const src = fs.readFileSync('src/database/migrations/' + pf + '.ts', 'utf8');
  const re = /\{ table: '(\w+)', columns: \[([^\]]+)\] \}/g; let m;
  while ((m = re.exec(src))) {
    for (const c of m[2].matchAll(/'(\w+)'/g)) covered.add(m[1] + '.' + c[1]);
  }
}
const out = new Map();
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const re = /CREATE TABLE(?: IF NOT EXISTS)? (\w+)\s*\(([\s\S]*?)\n\s*\)/g;
  let m;
  while ((m = re.exec(src))) {
    const table = m[1];
    const body = m[2];
    const colRe = /^\s*"?([A-Za-z_]\w*)"?\s+REAL\b/gim;
    let c;
    while ((c = colRe.exec(body))) {
      const col = c[1];
      if (!moneyRe.test(col) || skipRe.test(col)) continue;
      if (covered.has(table + '.' + col)) continue;
      const key = table + '.' + col;
      if (!out.has(key)) out.set(key, path.basename(file));
    }
  }
}
for (const [k, f] of [...out.entries()].sort()) console.log(k + '  (' + f + ')');
console.log('TOTAL', out.size);
