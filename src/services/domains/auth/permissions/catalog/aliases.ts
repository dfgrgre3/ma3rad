// ─── Employee permission aliases ─────────────────────────────────────────────
// Legacy employee.* codes resolve to the manage umbrella permission so older
// role configurations keep working after the catalog was expanded.
export const EMPLOYEE_PERMISSION_ALIASES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'employees.view': Object.freeze(['employees.manage']),
  'employees.create': Object.freeze(['employees.manage']),
  'employees.update': Object.freeze(['employees.manage']),
  'employees.terminate': Object.freeze(['employees.manage']),
  'employees.export': Object.freeze(['employees.manage']),
  'employees.profile.view': Object.freeze(['employees.manage']),
  'employees.financials.view': Object.freeze(['employees.manage', 'employees.payroll.manage', 'employees.payroll.approve']),
  'employees.payroll.view': Object.freeze(['employees.manage', 'employees.payroll.manage', 'employees.payroll.approve']),
  'employees.payroll.manage': Object.freeze(['employees.manage', 'employees.payroll.approve']),
  'employees.payroll.approve': Object.freeze(['employees.manage', 'employees.payroll.manage']),
  'employees.commissions.view': Object.freeze(['employees.manage', 'employees.payroll.view', 'employees.payroll.manage', 'employees.payroll.approve']),
  'ui.employees.employees.view': Object.freeze(['employees.manage', 'employees.view']),
  'ui.employees.employees.manage': Object.freeze(['employees.manage']),
});
