import { ReportCenterContext } from './context';
import type { ReportParams, ReportResult } from './types';
import { num } from './helpers';
import { round2 } from '../../finance/financials';

type Constructor<T = object> = new (...args: any[]) => T;

const REPORT_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'مسودة',
  SUBMITTED: 'مقدم',
  APPROVED: 'معتمد',
};

const CERT_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'مسودة',
  SUBMITTED: 'مقدم للمراجعة',
  APPROVED: 'معتمد',
  RETURNED: 'معاد',
  PAID: 'مدفوع',
};

/**
 * Construction/contracting reports: payment certificates (progress claims)
 * and per-project cost variance. Scoped through projects.branch_id like every
 * other report; money columns are stored in piastres.
 */
export function ConstructionReports<TBase extends Constructor<ReportCenterContext>>(Base: TBase) {
  return class ConstructionReports extends Base {
    /** Progress-payment certificates across projects, filtered by certificate date. */
    public async projectCertificates({ from, to, dimension }: ReportParams): Promise<ReportResult> {
      this.actor();
      const scope = this.tableScope('p.branch_id', undefined);
      const clauses = [`c.certificate_date >= ?`, `c.certificate_date <= ?`, scope.clause];
      const params: unknown[] = [from, to, ...scope.params];
      const status = dimension && dimension !== 'all' ? dimension : undefined;
      if (status) { clauses.push('c.status = ?'); params.push(status); }
      const rows = await this.db.queryAsync<any>(`
        SELECT p.name AS project, p.code AS projectCode,
               c.certificate_number AS certificateNumber, c.certificate_date AS date,
               c.period_start AS periodStart, c.period_end AS periodEnd,
               c.progress_percent AS progressPercent, c.description,
               c.requested_amount / 100.0 AS requested,
               COALESCE(c.approved_amount, 0) / 100.0 AS approved,
               c.paid_amount / 100.0 AS paid,
               c.status, c.payment_reference AS paymentReference
        FROM project_payment_certificates c
        JOIN projects p ON p.id = c.project_id
        WHERE ${clauses.join(' AND ')}
        ORDER BY c.certificate_date DESC`, params);

      const requested = rows.reduce((s, r) => s + num(r.requested), 0);
      const approved = rows.reduce((s, r) => s + num(r.approved), 0);
      const paid = rows.reduce((s, r) => s + num(r.paid), 0);
      const approvedRows = rows.filter((r) => ['APPROVED', 'PAID'].includes(r.status));

      return {
        kpis: [
          { label: 'عدد المستخلصات', value: rows.length, tone: 'neutral' },
          { label: 'إجمالي المطلوب', value: requested, tone: 'info' },
          { label: 'إجمالي المعتمد', value: approved, tone: 'success' },
          { label: 'إجمالي المدفوع', value: paid, tone: approved > 0 && paid >= approved ? 'success' : 'warning' },
          { label: 'نسبة التحصيل', value: approved > 0 ? round2((paid / approved) * 100) : 0, hint: '% من المعتمد', tone: 'info' },
        ],
        columns: [
          { key: 'project', label: 'المشروع' },
          { key: 'certificateNumber', label: 'رقم المستخلص' },
          { key: 'date', label: 'التاريخ', type: 'date' },
          { key: 'periodStart', label: 'من', type: 'date' },
          { key: 'periodEnd', label: 'إلى', type: 'date' },
          { key: 'progressPercent', label: 'الإنجاز %', type: 'percent' },
          { key: 'requested', label: 'المطلوب', type: 'currency' },
          { key: 'approved', label: 'المعتمد', type: 'currency' },
          { key: 'paid', label: 'المدفوع', type: 'currency' },
          { key: 'status', label: 'الحالة', type: 'badge' },
        ],
        rows: rows.map((r) => ({
          ...r,
          status: CERT_STATUS_LABEL[r.status] ?? r.status,
          collectionRate: num(r.approved) > 0 ? round2((num(r.paid) / num(r.approved)) * 100) : 0,
        })),
        notes: [`عدد المستخلصات المعتمدة/المدفوعة: ${approvedRows.length}`],
      };
    }

    /** Planned vs actual cost per project with variance, within the date range. */
    public async projectCostVariance({ from, to }: ReportParams): Promise<ReportResult> {
      this.actor();
      const scope = this.tableScope('p.branch_id', undefined);
      const rows = await this.db.queryAsync<any>(`
        SELECT p.name AS project, p.code AS projectCode, p.status,
               COALESCE((SELECT SUM(b.planned_amount) / 100.0 FROM project_budget_lines b WHERE b.project_id = p.id), 0) AS plannedCost,
               COALESCE((SELECT SUM(e.amount) / 100.0 FROM project_actual_cost_entries e
                          WHERE e.project_id = p.id AND e.cost_date >= ? AND e.cost_date <= ?), 0) AS actualCost,
               (SELECT COALESCE(SUM(ct.approved_amount), 0) / 100.0 FROM project_payment_certificates ct
                 WHERE ct.project_id = p.id AND ct.status IN ('APPROVED','PAID')) AS certified,
               (SELECT COALESCE(SUM(ct.paid_amount), 0) / 100.0 FROM project_payment_certificates ct
                 WHERE ct.project_id = p.id) AS paid
        FROM projects p
        WHERE ${scope.clause}
        ORDER BY p.name`, [from, to, ...scope.params]);

      const planned = rows.reduce((s, r) => s + num(r.plannedCost), 0);
      const actual = rows.reduce((s, r) => s + num(r.actualCost), 0);
      const certified = rows.reduce((s, r) => s + num(r.certified), 0);
      const paid = rows.reduce((s, r) => s + num(r.paid), 0);

      return {
        kpis: [
          { label: 'عدد المشاريع', value: rows.length, tone: 'neutral' },
          { label: 'التكلفة المخططة', value: planned, tone: 'info' },
          { label: 'التكلفة الفعلية', value: actual, tone: actual > planned ? 'danger' : 'success' },
          { label: 'انحراف التكلفة', value: round2(planned - actual), hint: planned > 0 ? `${round2(((planned - actual) / planned) * 100)}%` : undefined, tone: planned - actual < 0 ? 'danger' : 'success' },
          { label: 'فجوة التحصيل', value: round2(certified - paid), tone: certified - paid > 0 ? 'warning' : 'success' },
        ],
        columns: [
          { key: 'project', label: 'المشروع' },
          { key: 'projectCode', label: 'الكود' },
          { key: 'status', label: 'الحالة', type: 'badge' },
          { key: 'plannedCost', label: 'المخطط', type: 'currency' },
          { key: 'actualCost', label: 'الفعلي', type: 'currency' },
          { key: 'variance', label: 'الانحراف', type: 'currency' },
          { key: 'variancePct', label: 'الانحراف %', type: 'percent' },
          { key: 'certified', label: 'المعتمد', type: 'currency' },
          { key: 'paid', label: 'المدفوع', type: 'currency' },
          { key: 'collectionGap', label: 'فجوة التحصيل', type: 'currency' },
        ],
        rows: rows.map((r) => {
          const variance = num(r.plannedCost) - num(r.actualCost);
          return {
            ...r,
            variance: round2(variance),
            variancePct: num(r.plannedCost) > 0 ? round2((variance / num(r.plannedCost)) * 100) : 0,
            collectionGap: round2(num(r.certified) - num(r.paid)),
          };
        }),
      };
    }

    /** Daily site reports across projects: manpower, weather, items cost and status. */
    public async siteDailyReports({ from, to, dimension }: ReportParams): Promise<ReportResult> {
      this.actor();
      const scope = this.tableScope('p.branch_id', undefined);
      const clauses = [`r.report_date >= ?`, `r.report_date <= ?`, scope.clause];
      const params: unknown[] = [from, to, ...scope.params];
      const status = dimension && dimension !== 'all' ? dimension : undefined;
      if (status) { clauses.push('r.status = ?'); params.push(status); }
      const rows = await this.db.queryAsync<any>(`
        SELECT p.name AS project, p.code AS projectCode,
               r.report_date AS date, r.weather, r.workers_count AS workers,
               r.supervisor_name AS supervisor, r.summary, r.status,
               (SELECT COUNT(*) FROM project_site_report_items i WHERE i.report_id = r.id) AS itemsCount,
               (SELECT COALESCE(SUM(i.amount), 0) / 100.0 FROM project_site_report_items i WHERE i.report_id = r.id) AS itemsTotal
        FROM project_site_daily_reports r
        JOIN projects p ON p.id = r.project_id
        WHERE ${clauses.join(' AND ')}
        ORDER BY r.report_date DESC, p.name`, params);

      const itemsTotal = rows.reduce((s, r) => s + num(r.itemsTotal), 0);
      const totalWorkers = rows.reduce((s, r) => s + num(r.workers), 0);
      const approved = rows.filter((r) => r.status === 'APPROVED').length;

      return {
        kpis: [
          { label: 'عدد التقارير', value: rows.length, tone: 'neutral' },
          { label: 'إجمالي بنود التقارير', value: itemsTotal, tone: 'info' },
          { label: 'إجمالي العمالة الميدانية', value: totalWorkers, hint: 'عامل/يوم', tone: 'neutral' },
          { label: 'تقارير معتمدة', value: approved, tone: approved === rows.length && rows.length ? 'success' : 'warning' },
        ],
        columns: [
          { key: 'project', label: 'المشروع' },
          { key: 'date', label: 'التاريخ', type: 'date' },
          { key: 'weather', label: 'الطقس' },
          { key: 'workers', label: 'عدد العمال', type: 'number' },
          { key: 'supervisor', label: 'المشرف' },
          { key: 'itemsCount', label: 'البنود', type: 'number' },
          { key: 'itemsTotal', label: 'إجمالي البنود', type: 'currency' },
          { key: 'status', label: 'الحالة', type: 'badge' },
          { key: 'summary', label: 'الملخص' },
        ],
        rows: rows.map((r) => ({ ...r, status: REPORT_STATUS_LABEL[r.status] ?? r.status })),
      };
    }
  };
}
