import { ReportCenterContext } from './context';
import type { ReportParams, ReportResult } from './types';
import { num, sum, fmtMoney } from './helpers';
import { round2 } from '../../finance/financials';

type Constructor<T = object> = new (...args: any[]) => T;

export function HrPerformanceReports<TBase extends Constructor<ReportCenterContext>>(Base: TBase) {
  return class HrPerformanceReports extends Base {
  public async hrPerformanceEvaluations({ from, to }: ReportParams): Promise<ReportResult> {
    const rows = await this.db.queryAsync<any>(`
      SELECT COALESCE(e.name, e.full_name, '—') AS employeeName, COALESCE(pc.name, '—') AS cycleName,
        pe.evaluator_type AS evaluatorType, pe.score, pe.rating, pe.status,
        pe.submitted_at AS submittedAt, COALESCE(pe.notes, '—') AS notes,
        (SELECT COUNT(*) FROM performance_evaluation_items i WHERE i.evaluation_id = pe.id) AS itemsCount
      FROM performance_evaluations pe
      LEFT JOIN employees e ON e.id = pe.employee_id
      LEFT JOIN performance_cycles pc ON pc.id = pe.cycle_id
      WHERE date(COALESCE(pe.submitted_at, pe.created_at)) BETWEEN ? AND ?
      ORDER BY pe.score DESC, e.name
    `, [from, to]);
    const result = rows.map((row) => ({ ...row, score: num(row.score), itemsCount: num(row.itemsCount) }));
    const scored = result.filter((r) => r.status !== 'DRAFT');
    const avgScore = scored.length ? round2(scored.reduce((t, r) => t + r.score, 0) / scored.length) : 0;
    return {
      kpis: [
        { label: 'تقييمات', value: result.length, tone: 'info' },
        { label: 'مقدم/معتمد', value: result.filter((r) => r.status !== 'DRAFT').length, tone: 'success' },
        { label: 'متوسط الدرجة', value: avgScore, hint: scored.length ? `${scored.length} تقييم مكتمل` : '—', tone: 'info' },
        { label: 'متميزون (4.5+)', value: scored.filter((r) => r.score >= 4.5).length, tone: 'success' },
      ],
      columns: [
        { key: 'employeeName', label: 'الموظف' },
        { key: 'cycleName', label: 'دورة التقييم' },
        { key: 'evaluatorType', label: 'نوع المقيّم', type: 'badge' },
        { key: 'score', label: 'الدرجة', type: 'number' },
        { key: 'rating', label: 'التقدير', type: 'badge' },
        { key: 'itemsCount', label: 'عدد البنود', type: 'number' },
        { key: 'status', label: 'الحالة', type: 'badge' },
        { key: 'submittedAt', label: 'تاريخ التقديم', type: 'date' },
      ],
      rows: result,
    };
  }
  public async hrPerformanceGoals({ from, to }: ReportParams): Promise<ReportResult> {
    const rows = await this.db.queryAsync<any>(`
      SELECT COALESCE(e.name, e.full_name, '—') AS employeeName, g.title, g.weight,
        g.target_value AS targetValue, g.actual_value AS actualValue, g.status,
        CASE WHEN g.target_value IS NOT NULL AND g.target_value > 0
          THEN round(COALESCE(g.actual_value, 0) * 100.0 / g.target_value, 1) ELSE NULL END AS progress
      FROM performance_goals g
      LEFT JOIN employees e ON e.id = g.employee_id
      WHERE date(g.created_at) BETWEEN ? AND ?
      ORDER BY progress DESC, e.name
    `, [from, to]);
    const result = rows.map((row) => ({
      ...row,
      weight: num(row.weight),
      targetValue: row.targetValue === null ? null : num(row.targetValue),
      actualValue: row.actualValue === null ? null : num(row.actualValue),
      progress: row.progress === null ? null : num(row.progress),
    }));
    const withProgress = result.filter((r) => r.progress !== null);
    const avgProgress = withProgress.length ? round2(withProgress.reduce((t, r) => t + (r.progress || 0), 0) / withProgress.length) : 0;
    return {
      kpis: [
        { label: 'أهداف', value: result.length, tone: 'info' },
        { label: 'مكتملة', value: result.filter((r) => r.status === 'COMPLETED').length, tone: 'success' },
        { label: 'متجاوزة للمستهدف', value: withProgress.filter((r) => (r.progress || 0) >= 100).length, tone: 'success' },
        { label: 'متوسط الإنجاز', value: avgProgress, hint: '٪ من المستهدف', tone: 'warning' },
      ],
      columns: [
        { key: 'employeeName', label: 'الموظف' },
        { key: 'title', label: 'الهدف' },
        { key: 'weight', label: 'الوزن', type: 'number' },
        { key: 'targetValue', label: 'المستهدف', type: 'number' },
        { key: 'actualValue', label: 'المحقق', type: 'number' },
        { key: 'progress', label: 'نسبة الإنجاز', type: 'percent' },
        { key: 'status', label: 'الحالة', type: 'badge' },
      ],
      rows: result,
    };
  }
  public async hrPerformancePips({ from, to }: ReportParams): Promise<ReportResult> {
    const rows = await this.db.queryAsync<any>(`
      SELECT COALESCE(e.name, e.full_name, '—') AS employeeName, p.start_date AS startDate,
        p.end_date AS endDate, p.reason, COALESCE(p.goals, '—') AS goals,
        p.status, COALESCE(p.outcome, '—') AS outcome, p.review_date AS reviewDate
      FROM performance_pips p
      LEFT JOIN employees e ON e.id = p.employee_id
      WHERE date(p.start_date) BETWEEN ? AND ?
      ORDER BY p.end_date, e.name
    `, [from, to]);
    return {
      kpis: [
        { label: 'خطط تحسين', value: rows.length, tone: 'info' },
        { label: 'نشطة', value: rows.filter((r) => r.status === 'ACTIVE').length, tone: 'warning' },
        { label: 'مكتملة', value: rows.filter((r) => r.status === 'COMPLETED').length, tone: 'success' },
        { label: 'ملغاة', value: rows.filter((r) => r.status === 'CANCELLED').length, tone: 'danger' },
      ],
      columns: [
        { key: 'employeeName', label: 'الموظف' },
        { key: 'startDate', label: 'البداية', type: 'date' },
        { key: 'endDate', label: 'النهاية', type: 'date' },
        { key: 'reviewDate', label: 'مراجعة', type: 'date' },
        { key: 'reason', label: 'السبب' },
        { key: 'goals', label: 'الأهداف' },
        { key: 'status', label: 'الحالة', type: 'badge' },
        { key: 'outcome', label: 'النتيجة' },
      ],
      rows,
    };
  }
  public async hrTrainingExpenses({ from, to }: ReportParams): Promise<ReportResult> {
    const rows = await this.db.queryAsync<any>(`
      SELECT COALESCE(c.name, '—') AS courseName, COALESCE(e.name, e.full_name, '—') AS employeeName,
        te.amount, te.expense_date AS expenseDate, te.payment_method AS paymentMethod,
        COALESCE(te.description, '—') AS description
      FROM training_expenses te
      LEFT JOIN training_courses c ON c.id = te.course_id
      LEFT JOIN employees e ON e.id = te.employee_id
      WHERE date(te.expense_date) BETWEEN ? AND ?
      ORDER BY te.expense_date DESC, te.created_at DESC
    `, [from, to]);
    const result = rows.map((row) => ({ ...row, amount: num(row.amount) }));
    const total = sum(result, 'amount');
    const topCourse = Object.entries(
      result.reduce<Record<string, number>>((acc, r) => { acc[r.courseName] = (acc[r.courseName] || 0) + r.amount; return acc; }, {})
    ).sort((a, b) => b[1] - a[1])[0];
    return {
      kpis: [
        { label: 'مصروفات تدريب', value: result.length, tone: 'info' },
        { label: 'إجمالي المصروف', value: fmtMoney(total), tone: 'warning' },
        { label: 'متوسط المصروف', value: result.length ? fmtMoney(total / result.length) : fmtMoney(0), tone: 'info' },
        { label: 'أعلى دورة تكلفة', value: topCourse ? topCourse[0] : '—', hint: topCourse ? fmtMoney(topCourse[1]) : undefined, tone: 'neutral' },
      ],
      columns: [
        { key: 'courseName', label: 'الدورة' },
        { key: 'employeeName', label: 'الموظف' },
        { key: 'amount', label: 'المبلغ', type: 'currency' },
        { key: 'expenseDate', label: 'التاريخ', type: 'date' },
        { key: 'paymentMethod', label: 'طريقة الدفع', type: 'badge' },
        { key: 'description', label: 'الوصف' },
      ],
      rows: result,
    };
  }
  };
}
