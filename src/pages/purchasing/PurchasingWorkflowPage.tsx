import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ClipboardList, FileSpreadsheet, ClipboardCheck, PackageCheck, Receipt, RotateCcw, Users, Clock3 } from 'lucide-react';
import { DatabaseManager } from '../../database/db';
import { AuthService } from '../../services/AuthService';
import { BranchAccessService } from '../../services/BranchAccessService';

const stages = [
  { label: 'طلبات الشراء', path: '/purchases/requests', icon: ClipboardList, next: 'تحويل الطلب المعتمد إلى طلب عروض أو أمر شراء' },
  { label: 'عروض الأسعار', path: '/purchases/quotations', icon: FileSpreadsheet, next: 'مقارنة عروض الموردين واختيار العرض' },
  { label: 'أوامر الشراء', path: '/purchases/orders', icon: ClipboardCheck, next: 'متابعة التأكيد والتوريد المتوقع' },
  { label: 'استلام البضائع', path: '/purchases/receipts', icon: PackageCheck, next: 'تسجيل الكميات المستلمة وفحصها' },
  { label: 'فواتير المشتريات', path: '/purchases', icon: Receipt, next: 'مطابقة الفاتورة مع الاستلام' },
  { label: 'المرتجعات والمطالبات', path: '/purchases/returns', icon: RotateCcw, next: 'تسجيل المرتجع أو مطالبة المورد' },
  { label: 'كشف حساب المورد', path: '/purchases/statement', icon: Users, next: 'مراجعة الرصيد والمدفوعات' },
];

export const PurchasingWorkflowPage: React.FC = () => {
  const [summary, setSummary] = useState({ openOrders: 0, overdueOrders: 0 });
  useEffect(() => {
    try {
      const scope = new BranchAccessService().warehouseBranchScope('w', undefined, AuthService.requireAuth());
      const row = DatabaseManager.getInstance().query<{ openOrders: number; overdueOrders: number }>(
        `SELECT COUNT(*) AS openOrders, SUM(CASE WHEN po.expected_date IS NOT NULL AND po.expected_date < date('now','localtime') THEN 1 ELSE 0 END) AS overdueOrders FROM purchase_orders po JOIN warehouses w ON w.id=po.warehouse_id WHERE po.status IN ('SENT','CONFIRMED','PARTIAL') AND ${scope.clause}`,
        scope.params,
      )[0];
      setSummary({ openOrders: Number(row?.openOrders) || 0, overdueOrders: Number(row?.overdueOrders) || 0 });
    } catch (error) { console.error('Could not load purchasing workflow summary', error); }
  }, []);

  return <div className="h-full overflow-y-auto bg-slate-50 p-5 lg:p-7" dir="rtl"><div className="mx-auto max-w-6xl space-y-5">
    <header><h1 className="text-xl font-black">مركز المشتريات</h1><p className="mt-1 text-sm text-slate-500">تابع مراحل التوريد وانتقل إلى سجل كل معاملة لإكمالها.</p></header>
    <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border bg-white p-4"><span className="text-xs text-slate-500">أوامر بانتظار التوريد</span><strong className="mt-1 block text-2xl">{summary.openOrders}</strong></div><div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><span className="inline-flex items-center gap-1 text-xs text-amber-800"><Clock3 className="h-3.5 w-3.5" /> أوامر تجاوزت موعد التوريد</span><strong className="mt-1 block text-2xl text-amber-900">{summary.overdueOrders}</strong></div></div>
    <ol className="grid gap-3 lg:grid-cols-2">{stages.map((stage, index) => { const Icon = stage.icon; return <li key={stage.path}><Link to={stage.path} className="flex h-full items-center gap-4 rounded-2xl border bg-white p-4 transition hover:border-orange-300 hover:shadow-sm"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-700"><Icon className="h-5 w-5" /></span><span className="min-w-0 flex-1"><small className="text-xs text-slate-400">مرحلة {index + 1}</small><b className="block">{stage.label}</b><small className="text-slate-500">التالي: {stage.next}</small></span><ArrowLeft className="h-4 w-4 shrink-0 text-slate-400" /></Link></li>; })}</ol>
  </div></div>;
};

export default PurchasingWorkflowPage;
