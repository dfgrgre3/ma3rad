const fs = require('fs'), path = require('path');
const dir = 'src/database/schema';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.ts'));
const moneyRe = /(amount|price|cost|balance|total|fee|salary|wage|payment|discount|tax|value|premium|fine|deduction|earning|expense|revenue|profit|charge|deposit|refund|installment|commission|due|paid|remaining|subtotal|net|gross|opening|closing|expected|actual|difference|penalty|bonus|overtime|loan|advance|claim|estimate|budget|rent|allowance|variance|unit_cost|total_cost|old_value|new_value|cash_amount|balance_amount|tax_amount|refunded_amount|remaining_to_balance|down_payment|financed_amount|installment_amount|paid_amount|remaining_amount|base_amount|commission_amount|current_balance|opening_balance|credit_limit|total_purchases|delivery_fee|bounce_fee|promised_amount|grand_total|line_total|item_total|net_amount|gross_amount|total_due|amount_due|outstanding|ledger_balance|account_balance|wallet_balance|cash_on_hand|petty_cash| imprest)/i;
const skipRe = /(quantity|percent|ratio|multiplier|hours|_days|m2|boxes|count|progress|latitude|longitude|weight|volume|area|distance|duration|age|year|month|day|score|rating|level|order_index|priority|sequence|version|sort|threshold|tolerance|capacity|limit(?!_amount)|minimum|maximum|_min_|_max_|date|time|status|type|code|name|id$|_id$|percentage|qty|size|grade|unit$|uom|currency|rate_|_rate\b|interest_rate|tax_rate|discount_rate|markup|margin_percent|completion|attendance|late_|early_|break_|shift_|overtime_hours|leave_|accrual|balance_days|points|tokens|credits_count|attempts|failures|login|pin|otp|timeout|interval|frequency|cron|schedule_|recurrence|iteration|batch_no|serial|imei|mac|ip_|port|version|revision|build|revision|schema)/i;
for (const file of files) {
  const src = fs.readFileSync(path.join(dir, file), 'utf8');
  const re = /CREATE TABLE IF NOT EXISTS (\w+)\s*\(([\s\S]*?)\n\);/g;
  let m;
  while ((m = re.exec(src))) {
    const table = m[1], body = m[2];
    const colRe = /^\s*"?([A-Za-z_]\w*)"?\s+REAL\b/gim;
    let c;
    while ((c = colRe.exec(body))) {
      const col = c[1];
      if (moneyRe.test(col) && !skipRe.test(col)) console.log(table + '.' + col + '  (' + file + ')');
    }
  }
}
