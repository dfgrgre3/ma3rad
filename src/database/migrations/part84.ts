import type { Migration } from './support';
import { tableExists } from './support';

/**
 * تقارير مالية حساسة (قوائم مالية/أرباح وخسائر/ضريبة) كانت تُشتق تلقائياً من
 * reports.view عبر backfill. نفصلها الآن: تبقى فقط للأدوار التي تملك صلاحية
 * مالية فعلية (finance.view / finance.approve / finance.close) أو أدوار
 * إدارية. الصلاحيات المطلوبة في الواجهة والخدمة هي reports.financial.view /
 * reports.profit_loss.view / reports.tax.view ومرادفاتها الدقيقة ui.reports.*.
 */
export const MIGRATION_PART_84: Migration = {
  id: '200_restrict_sensitive_report_permissions',
  description: 'Revoke sensitive financial report permissions from non-finance roles.',
  up: (db) => {
    if (!tableExists(db, 'role_permissions')) return;
    const sensitiveCodes = [
      'reports.financial.view',
      'reports.profit_loss.view',
      'reports.tax.view',
      'ui.reports.financial.view',
      'ui.reports.profit_loss.view',
      'ui.reports.tax.view',
    ];
    const sensitiveLike = [
      'ui.reports.financial.%',
      'ui.reports.profit_loss.%',
      'ui.reports.tax.%',
    ];

    const execRows = (sql: string, params: string[] = []): string[][] => {
      const stmt = db.prepare(sql);
      stmt.bind(params);
      const out: string[][] = [];
      while (stmt.step()) out.push(Object.values(stmt.getAsObject()) as string[]);
      stmt.free();
      return out;
    };

    const financeRoles = new Set(
      execRows(
        `SELECT DISTINCT role_code FROM role_permissions
         WHERE permission_code IN ('finance.view', 'finance.approve', 'finance.close', 'finance.journal.view')`
      ).map((row) => row[0])
    );

    const keep = new Set([...financeRoles, 'ADMIN', 'SUPER_ADMIN', 'MANAGER']);

    const placeholders = sensitiveCodes.map(() => '?').join(',');
    const likeClauses = sensitiveLike.map(() => 'permission_code LIKE ?').join(' OR ');
    const rows = execRows(
      `SELECT role_code, permission_code FROM role_permissions
       WHERE permission_code IN (${placeholders}) OR ${likeClauses}`,
      [...sensitiveCodes, ...sensitiveLike]
    );

    const seen = new Set<string>();
    let revoked = 0;
    for (const [roleCode, permissionCode] of rows) {
      const key = `${roleCode}${permissionCode}`;
      if (seen.has(key) || keep.has(roleCode)) continue;
      seen.add(key);
      db.run(
        'DELETE FROM role_permissions WHERE role_code = ? AND permission_code = ?',
        [roleCode, permissionCode]
      );
      revoked += 1;
    }

    if (revoked > 0) {
      console.log(`🔒 Revoked ${revoked} sensitive report permission grant(s) from non-finance roles.`);
    }
  },
};
