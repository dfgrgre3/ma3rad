const fs = require('fs');
const files = [
  'src/services/domains/customers/CustomerService.ts',
  'src/services/domains/customers/PartnerService.ts',
  'src/services/domains/dashboard/DashboardQueryScopeService_part02.ts',
  'src/services/domains/finance/CashierService.ts',
  'src/services/domains/finance/FinanceExtrasService.ts',
  'src/services/domains/finance/InstallmentService.ts',
  'src/services/domains/hr/CommissionService.ts',
  'src/services/domains/hr/EmployeeService.ts',
  'src/services/domains/hr/TrainingService.ts',
  'src/services/domains/licensing/CentralEstablishmentService.ts',
  'src/services/domains/operations/OperationsService.ts',
  'src/services/domains/organization/BranchService.ts',
  'src/services/domains/procurement/ProcurementServicePart06.ts',
  'src/services/domains/purchases/PurchaseReturnService.ts',
  'src/services/domains/purchases/PurchaseService.ts',
  'src/services/domains/reports/FinancialReportsService.ts',
  'src/services/domains/reports/ReportCenterService.ts',
  'src/services/domains/sales/invoiceCreation.ts',
  'src/services/domains/sales/invoiceVoid.ts',
  'src/services/domains/sales/OrderService.ts',
  'src/services/domains/sales/payments.ts',
  'src/services/domains/sales/returns.ts',
  'src/services/domains/sales/SalesFinancialReconciliationService.ts',
  'src/services/domains/suppliers/SupplierService.ts',
];
let total = 0;
for (const f of files) {
  if (!fs.existsSync(f)) { console.log('NOFILE', f); continue; }
  let s = fs.readFileSync(f, 'utf8');
  const orig = s;
  // writes: current_balance = current_balance +/- ?  (any spacing)
  s = s.replace(/current_balance\s*=\s*current_balance\s*\+\s*\?(?!\s*\*\s*100)/g, 'current_balance = current_balance + ROUND(?*100)');
  s = s.replace(/current_balance\s*=\s*current_balance\s*-\s*\?(?!\s*\*\s*100)/g, 'current_balance = current_balance - ROUND(?*100)');
  s = s.replace(/current_balance=current_balance\+\?(?!\s*\*\s*100)/g, 'current_balance=current_balance+ROUND(?*100)');
  s = s.replace(/current_balance=current_balance-\?(?!\s*\*\s*100)/g, 'current_balance=current_balance-ROUND(?*100)');
  // ROUND(current_balance + ? - ?, 2) -> integer piastres
  s = s.replace(/ROUND\(current_balance \+ \? - \?, 2\)/g, 'current_balance + ROUND(?*100) - ROUND(?*100)');
  // reads
  s = s.replace(/current_balance\s+AS\s+currentBalance/g, 'current_balance / 100.0 AS currentBalance');
  s = s.replace(/current_balance\s+AS\s+balance/g, 'current_balance / 100.0 AS balance');
  s = s.replace(/SUM\(cr\.current_balance\)/g, 'SUM(cr.current_balance) / 100.0');
  s = s.replace(/SUM\(current_balance\)/g, 'SUM(current_balance) / 100.0');
  if (s !== orig) { fs.writeFileSync(f, s); console.log('patched', f); total++; }
}
console.log('files patched:', total);
