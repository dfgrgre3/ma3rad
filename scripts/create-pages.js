const fs = require('fs');
const path = require('path');

const pages = [
  { file: 'src/pages/sales/QuotationsPage.tsx', name: 'QuotationsPage', icon: 'FileText', color: 'text-amber-400' },
  { file: 'src/pages/sales/OrdersPage.tsx', name: 'OrdersPage', icon: 'Package2', color: 'text-violet-400' },
  { file: 'src/pages/sales/ReturnsPage.tsx', name: 'ReturnsPage', icon: 'RotateCcw', color: 'text-rose-400' },
  { file: 'src/pages/products/ProductAttributesPage.tsx', name: 'ProductAttributesPage', icon: 'Ruler', color: 'text-teal-400' },
  { file: 'src/pages/products/BarcodesPrintPage.tsx', name: 'BarcodesPrintPage', icon: 'Barcode', color: 'text-sky-400' },
  { file: 'src/pages/pricing/PricingPage.tsx', name: 'PricingPage', icon: 'Percent', color: 'text-emerald-400' },
  { file: 'src/pages/pricing/PromotionsPage.tsx', name: 'PromotionsPage', icon: 'Star', color: 'text-amber-400' },
  { file: 'src/pages/inventory/InventoryCountPage.tsx', name: 'InventoryCountPage', icon: 'ScanLine', color: 'text-violet-400' },
  { file: 'src/pages/inventory/InventoryValuationPage.tsx', name: 'InventoryValuationPage', icon: 'Scale', color: 'text-sky-400' },
  { file: 'src/pages/inventory/InventoryAdjustmentsPage.tsx', name: 'InventoryAdjustmentsPage', icon: 'Wrench', color: 'text-orange-400' },
  { file: 'src/pages/operations/BranchesPage.tsx', name: 'BranchesPage', icon: 'Building2', color: 'text-sky-400' },
  { file: 'src/pages/operations/WarehousesPage.tsx', name: 'WarehousesPage', icon: 'Warehouse', color: 'text-violet-400' },
  { file: 'src/pages/operations/DeliveriesPage.tsx', name: 'DeliveriesPage', icon: 'Truck', color: 'text-teal-400' },
  { file: 'src/pages/operations/DriversPage.tsx', name: 'DriversPage', icon: 'UserRound', color: 'text-amber-400' },
  { file: 'src/pages/operations/VehiclesPage.tsx', name: 'VehiclesPage', icon: 'Car', color: 'text-rose-400' },
  { file: 'src/pages/operations/EmployeesPage.tsx', name: 'EmployeesPage', icon: 'HardHat', color: 'text-orange-400' },
  { file: 'src/pages/crm/LeadsPage.tsx', name: 'LeadsPage', icon: 'UserRound', color: 'text-pink-400' },
  { file: 'src/pages/crm/CrmActivitiesPage.tsx', name: 'CrmActivitiesPage', icon: 'Activity', color: 'text-violet-400' },
  { file: 'src/pages/purchasing/PurchaseRequestsPage.tsx', name: 'PurchaseRequestsPage', icon: 'ClipboardList', color: 'text-orange-400' },
  { file: 'src/pages/finance/DebtsDashboardPage.tsx', name: 'DebtsDashboardPage', icon: 'Banknote', color: 'text-rose-400' },
  { file: 'src/pages/finance/InstallmentsPage.tsx', name: 'InstallmentsPage', icon: 'CalendarDays', color: 'text-amber-400' },
  { file: 'src/pages/finance/ExpensesPage.tsx', name: 'ExpensesPage', icon: 'TrendingDown', color: 'text-rose-400' },
  { file: 'src/pages/projects/ProjectDetailPage.tsx', name: 'ProjectDetailPage', icon: 'Boxes', color: 'text-violet-400' },
  { file: 'src/pages/approvals/ApprovalsPage.tsx', name: 'ApprovalsPage', icon: 'CheckSquare', color: 'text-yellow-400' },
  { file: 'src/pages/settings/BackupPage.tsx', name: 'BackupPage', icon: 'Download', color: 'text-sky-400' },
  { file: 'src/pages/settings/SystemHealthPage.tsx', name: 'SystemHealthPage', icon: 'Cpu', color: 'text-teal-400' },
];

pages.forEach(({ file, name, icon, color }) => {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(file)) {
    const content = [
      "import React from 'react';",
      "import { " + icon + " } from 'lucide-react';",
      "",
      "export const " + name + ": React.FC = () => (",
      "  <div className='h-full flex flex-col items-center justify-center bg-slate-950 gap-4' dir='rtl'>",
      "    <div className='w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center'>",
      "      <" + icon + " className='w-8 h-8 " + color + "' />",
      "    </div>",
      "    <div className='text-center'>",
      "      <h1 className='text-lg font-black text-white mb-1'>" + name + "</h1>",
      "      <p className='text-sm text-slate-400'>This page is under development.</p>",
      "    </div>",
      "    <div className='px-4 py-2 bg-sky-500/10 border border-sky-500/20 rounded-xl text-xs text-sky-400 font-semibold'>",
      "      Under Development",
      "    </div>",
      "  </div>",
      ");",
    ].join('\n');
    fs.writeFileSync(file, content, 'utf8');
    console.log('Created: ' + file);
  } else {
    console.log('Skipped: ' + file);
  }
});
console.log('All done!');
