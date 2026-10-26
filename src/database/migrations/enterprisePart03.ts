import type { Database } from 'sql.js';
import { addColumn } from '../migrationSupport';

export function runEnterprisePart9(db: Database): void {
  // 9. Seed Standard Enterprise Accounts if not exist
  const enterpriseAccounts: [string, string, string, string, string, number][] = [
    ['acc_1102', '1102', 'حسابات البنوك الجارية', 'ASSET', '11', 0],
    ['acc_1105', '1105', 'شيكات برسم التحصيل (واردة)', 'ASSET', '11', 0],
    ['acc_1106', '1106', 'مدفوعات وبوابات دفع إلكتروني قيد التسوية', 'ASSET', '11', 0],
    ['acc_2105', '2105', 'أوراق دفع وشيكات صادرة', 'LIABILITY', '21', 0],
    ['acc_3102', '3102', 'أرباح وخسائر مرحلة (مدورة)', 'EQUITY', '31', 0],
    ['acc_5206', '5206', 'عمولات بنكية ومصروفات تحصيل شيكات', 'EXPENSE', '52', 0],
    ['acc_5207', '5207', 'عمولات ورسوم بوابات الدفع الإلكتروني', 'EXPENSE', '52', 0],
  ];
  for (const [id, code, name, type, parent, bal] of enterpriseAccounts) {
    db.run('INSERT OR IGNORE INTO chart_of_accounts (id, code, name, type, parent_code, balance, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)',
      [id, code, name, type, parent, bal]);
  }
  
  // Seed default base currency
  db.run(`INSERT OR IGNORE INTO currencies (code, name, symbol, exchange_rate, is_base, is_active) VALUES
    ('EGP', 'جنيه مصري', 'ج.م', 1.0, 1, 1),
    ('SAR', 'ريال سعودي', 'ر.س', 0.125, 0, 1),
    ('USD', 'دولار أمريكي', '$', 0.033, 0, 1),
    ('EUR', 'يورو', '€', 0.031, 0, 1),
    ('AED', 'درهم إماراتي', 'د.إ', 0.122, 0, 1)
  `);
  
  // Seed current fiscal year and 12 periods if none exist
  const currentYear = new Date().getFullYear();
  const fyCount = Number(db.exec("SELECT COUNT(*) FROM fiscal_years")[0]?.values[0]?.[0] || 0);
  if (fyCount === 0) {
    const fyId = 'fy_' + currentYear;
    db.run(`INSERT INTO fiscal_years (id, year_code, name, start_date, end_date, status)
      VALUES (?, ?, ?, ?, ?, 'OPEN')`,
      [fyId, 'FY' + currentYear, 'السنة المالية ' + currentYear, currentYear + '-01-01', currentYear + '-12-31']);
    
    for (let m = 1; m <= 12; m++) {
      const mStr = String(m).padStart(2, '0');
      const lastDay = new Date(currentYear, m, 0).getDate();
      db.run(`INSERT INTO fiscal_periods (id, fiscal_year_id, period_number, name, start_date, end_date, status)
        VALUES (?, ?, ?, ?, ?, ?, 'OPEN')`,
        ['fp_' + currentYear + '_' + mStr, fyId, m, 'فترة ' + mStr + ' / ' + currentYear, currentYear + '-' + mStr + '-01', currentYear + '-' + mStr + '-' + String(lastDay).padStart(2, '0')]);
    }
  }
  
}
