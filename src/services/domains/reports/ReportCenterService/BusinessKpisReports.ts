import { ReportCenterContext } from './context';
import type { ReportParams, ReportResult } from './types';
import { num, fmtMoney } from './helpers';
import { round2 } from '../../finance/financials';

type Constructor<T = object> = new (...args: any[]) => T;

export function BusinessKpisReports<TBase extends Constructor<ReportCenterContext>>(Base: TBase) {
  return class BusinessKpisReports extends Base {
  public async mfgProductionKpis({ from, to }: ReportParams): Promise<ReportResult> {
    const rows = await this.db.queryAsync<any>(`
      SELECT po.order_number AS orderNumber, COALESCE(p.name, '—') AS productName, po.quantity,
        po.status, po.priority, po.start_date AS startDate, po.due_date AS dueDate,
        po.completed_at AS completedAt, b.name AS branchName,
        CASE WHEN po.due_date IS NOT NULL AND po.completed_at IS NOT NULL
          AND date(po.completed_at) > date(po.due_date) THEN 1 ELSE 0 END AS lateFlag,
        COALESCE((SELECT SUM(q.quantity_accepted) FROM manufacturing_quality_checks q
          WHERE q.production_order_id = po.id), 0) AS acceptedQty,
        COALESCE((SELECT SUM(q.quantity_rejected) FROM manufacturing_quality_checks q
          WHERE q.production_order_id = po.id), 0) AS rejectedQty
      FROM production_orders po
      LEFT JOIN products p ON p.id = po.product_id
      LEFT JOIN branches b ON b.id = po.branch_id
      WHERE date(po.created_at) BETWEEN ? AND ?
      ORDER BY po.created_at DESC
    `, [from, to]);
    const result = rows.map((row) => ({
      ...row,
      quantity: num(row.quantity),
      acceptedQty: num(row.acceptedQty),
      rejectedQty: num(row.rejectedQty),
      lateFlag: Number(row.lateFlag) || 0,
      lateLabel: Number(row.lateFlag) ? 'متأخر' : 'في الموعد',
    }));
    const completed = result.filter((r) => r.status === 'COMPLETED');
    const onTime = completed.filter((r) => !r.lateFlag).length;
    const inspected = result.reduce((t, r) => t + r.acceptedQty + r.rejectedQty, 0);
    const qualityRate = inspected > 0 ? round2((result.reduce((t, r) => t + r.acceptedQty, 0) / inspected) * 100) : 0;
    return {
      kpis: [
        { label: 'أوامر الإنتاج', value: result.length, tone: 'info' },
        { label: 'مكتملة', value: completed.length, tone: 'success' },
        { label: 'التسليم في الموعد', value: completed.length ? round2((onTime / completed.length) * 100) : 0, hint: '٪ من المكتملة', tone: 'warning' },
        { label: 'نسبة الجودة', value: qualityRate, hint: '٪ مقبول من المفحوص', tone: 'info' },
      ],
      columns: [
        { key: 'orderNumber', label: 'أمر الإنتاج' },
        { key: 'productName', label: 'المنتج' },
        { key: 'branchName', label: 'الفرع' },
        { key: 'quantity', label: 'الكمية', type: 'qty' },
        { key: 'acceptedQty', label: 'مقبول', type: 'qty' },
        { key: 'rejectedQty', label: 'مرفوض', type: 'qty' },
        { key: 'status', label: 'الحالة', type: 'badge' },
        { key: 'priority', label: 'الأولوية', type: 'badge' },
        { key: 'dueDate', label: 'الاستحقاق', type: 'date' },
        { key: 'completedAt', label: 'الإكمال', type: 'date' },
        { key: 'lateLabel', label: 'الالتزام', type: 'badge' },
      ],
      rows: result,
    };
  }
  public async salesTargetKpis({ from, to }: ReportParams): Promise<ReportResult> {
    const daysInRange = Math.max(1, Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86400000) + 1);
    const rows = await this.db.queryAsync<any>(`
      SELECT COALESCE(e.name, e.full_name, '—') AS repName, e.monthly_target / 100.0 AS monthlyTarget,
        e.commission_percentage AS commissionPct,
        (SELECT b2.name FROM branches b2 WHERE b2.id = e.branch_id) AS homeBranchName,
        (SELECT GROUP_CONCAT(b3.name, '، ') FROM employee_branch_assignments a3
           JOIN branches b3 ON b3.id = a3.branch_id WHERE a3.employee_id = e.id) AS extraBranchNames,
        COALESCE(SUM(CASE WHEN si.date BETWEEN ? AND ? THEN si.total_amount ELSE 0 END), 0) / 100.0 AS totalSales
      FROM employees e
      LEFT JOIN sales_invoices si ON si.invoice_status != 'VOID'
        AND COALESCE(si.sales_rep_id,
             (SELECT o.sales_rep_id FROM orders o WHERE o.id = si.order_id)) = e.id
      WHERE e.is_sales_rep = 1 AND e.is_active = 1
      GROUP BY e.id
      ORDER BY totalSales DESC
    `, [from, to]);
    const result = rows.map((row) => {
      const monthlyTarget = num(row.monthlyTarget);
      const proratedTarget = round2(monthlyTarget * daysInRange / 30);
      const sales = round2(num(row.totalSales));
      const achievement = proratedTarget > 0 ? round2((sales / proratedTarget) * 100) : null;
      const branchNames = [row.homeBranchName, ...(row.extraBranchNames ? String(row.extraBranchNames).split('، ') : [])]
        .filter(Boolean).join('، ');
      return {
        repName: row.repName,
        branches: branchNames || '—',
        monthlyTarget: round2(monthlyTarget),
        proratedTarget,
        totalSales: sales,
        achievement,
        commissionPct: num(row.commissionPct),
        expectedCommission: round2(sales * num(row.commissionPct) / 100),
        targetBadge: achievement === null ? 'بلا هدف' : achievement >= 100 ? 'محقق' : achievement >= 70 ? 'قريب' : 'متأخر',
      };
    });
    const withTargets = result.filter((r) => r.proratedTarget > 0);
    const totalTarget = round2(withTargets.reduce((t, r) => t + r.proratedTarget, 0));
    const totalSales = round2(result.reduce((t, r) => t + r.totalSales, 0));
    return {
      kpis: [
        { label: 'مندوبون بمستهدفات', value: withTargets.length, hint: `${result.length} مندوب نشط`, tone: 'info' },
        { label: 'إجمالي المستهدف', value: fmtMoney(totalTarget), tone: 'info' },
        { label: 'إجمالي المحقق', value: fmtMoney(totalSales), tone: 'success' },
        { label: 'نسبة الإنجاز', value: totalTarget > 0 ? round2((totalSales / totalTarget) * 100) : 0, hint: '٪ من المستهدف الموزع', tone: totalSales >= totalTarget ? 'success' : 'warning' },
      ],
      columns: [
        { key: 'repName', label: 'المندوب' },
        { key: 'branches', label: 'الفروع' },
        { key: 'monthlyTarget', label: 'المستهدف الشهري', type: 'currency' },
        { key: 'proratedTarget', label: 'المستهدف للفترة', type: 'currency' },
        { key: 'totalSales', label: 'المحقق', type: 'currency' },
        { key: 'achievement', label: 'نسبة الإنجاز', type: 'percent' },
        { key: 'targetBadge', label: 'الحالة', type: 'badge' },
        { key: 'commissionPct', label: 'العمولة', type: 'percent' },
        { key: 'expectedCommission', label: 'عمولة متوقعة', type: 'currency' },
      ],
      rows: result,
      notes: [`المستهدف موزع تناسبيًا على ${daysInRange} يوم من الفترة المحددة.`],
    };
  }
  public async workforceAnalytics({ from, to }: ReportParams): Promise<ReportResult> {
    const actor = this.actor();
    const branchScope = this.branchAccess.sqlScope('e.branch_id', undefined, actor);
    const companyScope = this.branchAccess.companyScope('e.company_id', actor);
    const headcountByBranch = await this.db.queryAsync<any>(`
      SELECT b.id AS branchId, b.name AS branchName,
             COUNT(e.id) AS headcount,
             COALESCE(SUM(e.base_salary), 0) AS totalSalaryCost
      FROM employees e
      JOIN branches b ON b.id = e.branch_id
      WHERE e.is_active = 1 AND ${branchScope.clause} AND ${companyScope.clause}
      GROUP BY b.id, b.name
      ORDER BY headcount DESC
    `, [...branchScope.params, ...companyScope.params]);
    const totalHeadcount = headcountByBranch.reduce((sum, r) => sum + Number(r.headcount), 0);
    const totalSalaryCost = headcountByBranch.reduce((sum, r) => sum + Number(r.totalSalaryCost), 0);
    return {
      kpis: [
        { label: 'إجمالي القوى العاملة', value: totalHeadcount, tone: 'info' },
        { label: 'إجمالي تكلفة الرواتب', value: fmtMoney(totalSalaryCost), tone: 'warning' },
      ],
      columns: [
        { key: 'branchName', label: 'الفرع' },
        { key: 'headcount', label: 'عدد القوى العاملة', type: 'number' },
        { key: 'totalSalaryCost', label: 'تكلفة الرواتب', type: 'currency' },
      ],
      rows: headcountByBranch,
    };
  }
  public async assetAnalytics({ from, to }: ReportParams): Promise<ReportResult> {
    const actor = this.actor();
    const branchScope = this.branchAccess.sqlScope('fa.branch_id', undefined, actor);
    const assetsByStatus = await this.db.queryAsync<any>(`
      SELECT fa.status, COUNT(*) AS count
      FROM facility_assets fa
      WHERE ${branchScope.clause}
      GROUP BY fa.status
    `, [...branchScope.params]);
    const totalAssets = assetsByStatus.reduce((sum, r) => sum + Number(r.count), 0);
    return {
      kpis: [
        { label: 'إجمالي الأصول', value: totalAssets, tone: 'info' },
        { label: 'الأصول النشطة', value: Number(assetsByStatus.find((r: any) => r.status === 'ACTIVE')?.count || 0), tone: 'success' },
      ],
      columns: [
        { key: 'status', label: 'حالة الأصل' },
        { key: 'count', label: 'العدد', type: 'number' },
      ],
      rows: assetsByStatus,
    };
  }
  public async facilityAnalytics({ from, to }: ReportParams): Promise<ReportResult> {
    const actor = this.actor();
    const companyId = this.branchAccess.companyScope('company_id', actor).params[0] || 'cmp_main';
    const utilityConsumption = await this.db.queryAsync<any>(`
      SELECT um.utility_type AS type,
             SUM(ur.consumption) AS totalConsumption,
             SUM(ur.cost) / 100.0 AS totalCost
      FROM facility_utility_readings ur
      JOIN facility_utility_meters um ON um.id = ur.meter_id
      WHERE um.company_id = ? AND ur.reading_date >= ? AND ur.reading_date <= ?
      GROUP BY um.utility_type
      ORDER BY totalCost DESC
    `, [companyId, from, to]);
    const totalUtilityCost = utilityConsumption.reduce((sum, r) => sum + Number(r.totalCost), 0);
    return {
      kpis: [
        { label: 'إجمالي تكلفة المرافق', value: fmtMoney(totalUtilityCost), tone: 'warning' },
      ],
      columns: [
        { key: 'type', label: 'نوع المرفق' },
        { key: 'totalConsumption', label: 'الاستهلاك', type: 'number' },
        { key: 'totalCost', label: 'التكلفة', type: 'currency' },
      ],
      rows: utilityConsumption,
    };
  }
  };
}
