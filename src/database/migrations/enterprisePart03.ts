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
  
  // Seed default bank account linked to acc_1102
  const bankCount = Number(db.exec("SELECT COUNT(*) FROM bank_accounts")[0]?.values[0]?.[0] || 0);
  if (bankCount === 0) {
    db.run(`INSERT INTO bank_accounts (id, account_name, bank_name, account_number, iban, swift_code, gl_account_id, current_balance, is_active)
      VALUES ('bank_default', 'البنك الأهلي المصري - الحساب الرئيسي', 'البنك الأهلي المصري', '10002938481', 'EG12000200010002938481001', 'NBEGEGCX', 'acc_1102', 0, 1)`);
  }
  
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
  
  // Seed sample Cost Centers
  const ccCount = Number(db.exec("SELECT COUNT(*) FROM cost_centers")[0]?.values[0]?.[0] || 0);
  if (ccCount === 0) {
    db.run(`INSERT INTO cost_centers (id, code, name, description, is_active) VALUES
      ('cc_hq', 'CC-HQ', 'الإدارة العامة والمصروفات المشتركة', 'المقر الرئيسي والإدارة', 1),
      ('cc_sh1', 'CC-SH1', 'صالة العرض الرئيسية', 'معرض المبيعات الرئيسي', 1),
      ('cc_wh1', 'CC-WH1', 'المستودع المركزي واللوجستيات', 'المخازن المركزية وعمليات الشحن', 1),
      ('cc_proj', 'CC-PROJ', 'إدارة المشاريع والمقاولات', 'المشاريع الكبرى والتوريدات الحكومية والخاصة', 1)
    `);
  }
  
  // Seed sample E-Payment Gateway
  const gwCount = Number(db.exec("SELECT COUNT(*) FROM payment_gateways")[0]?.values[0]?.[0] || 0);
  if (gwCount === 0) {
    db.run(`INSERT INTO payment_gateways (id, name, provider_code, gl_account_id, commission_rate, fixed_fee, settlement_period_days, is_active) VALUES
      ('gw_pos_main', 'ماكينة نقاط البيع POS (فيزا / ماستركارد)', 'POS_TERMINAL', 'acc_1106', 1.5, 2.0, 1, 1),
      ('gw_fawry', 'فوري للدفع الإلكتروني', 'FAWRY', 'acc_1106', 2.0, 1.0, 2, 1)
    `);
  }
}
