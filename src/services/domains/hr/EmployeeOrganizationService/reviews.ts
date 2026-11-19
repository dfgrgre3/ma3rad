import { v4 as uuidv4 } from 'uuid';
import { localDateString } from '../../../../utils/shared/date';
import type { User } from '../../../../types/auth/identity';
import type { EmployeeProbationReview, OrgServiceDeps } from './types';
import { audit } from './context';

function mapProbationReview(row: any): EmployeeProbationReview {
  return {
    id: row.id,
    employeeId: row.employeeId,
    reviewDate: row.reviewDate,
    reviewerId: row.reviewerId || null,
    score: Number(row.score) || 0,
    rating: row.rating,
    recommendation: row.recommendation,
    notes: row.notes || null,
    status: row.status,
    createdAt: row.createdAt,
  };
}

export function getProbationReviews(deps: OrgServiceDeps, employeeId: string): EmployeeProbationReview[] {
  const { db } = deps;
  return db.query<any>(`
    SELECT id, employee_id AS employeeId, review_date AS reviewDate, reviewer_id AS reviewerId,
      score, rating, recommendation, notes, status, created_at AS createdAt
    FROM employee_probation_reviews WHERE employee_id = ? ORDER BY review_date DESC
  `, [employeeId]).map(mapProbationReview);
}

export function createProbationReview(
  deps: OrgServiceDeps,
  actor: User,
  input: {
    employeeId: string; reviewDate: string; reviewerId?: string; score: number;
    rating?: string; recommendation?: string; notes?: string; status?: 'DRAFT' | 'SUBMITTED' | 'APPROVED';
  }
): EmployeeProbationReview {
  const { db } = deps;
  const id = `prb_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  db.run(
    `INSERT INTO employee_probation_reviews
       (id, employee_id, review_date, reviewer_id, score, rating, recommendation, notes, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.employeeId, input.reviewDate, input.reviewerId || actor.id,
     Math.max(0, Number(input.score) || 0), input.rating || 'SATISFACTORY',
     input.recommendation || 'CONTINUE', input.notes?.trim() || null, input.status || 'DRAFT']
  );
  db.run(
    `INSERT INTO employee_lifecycle_events (id, employee_id, event_type, event_date, to_value, notes, actor_id)
     VALUES (?, ?, 'PROBATION_REVIEW', ?, ?, ?, ?)`,
    [`ev_${uuidv4().replace(/-/g, '').slice(0, 16)}`, input.employeeId, input.reviewDate,
     input.recommendation || 'CONTINUE', input.notes?.trim() || null, actor.id]
  );
  return getProbationReviews(deps, input.employeeId).find((row) => row.id === id)!;
}

export function submitProbationReview(deps: OrgServiceDeps, actor: User, id: string): void {
  const { db } = deps;
  db.run(`UPDATE employee_probation_reviews SET status = 'SUBMITTED' WHERE id = ?`, [id]);
  audit(deps, actor, 'تقديم تقييم فترة اختبار', id, {});
}

export function getProbationReport(
  deps: OrgServiceDeps
): Array<{ employeeId: string; reviewDate: string; score: number; rating: string; recommendation: string; status: string }> {
  const { db } = deps;
  return db.query<any>(`
    SELECT employee_id AS employeeId, review_date AS reviewDate, score, rating, recommendation, status
    FROM employee_probation_reviews
    ORDER BY review_date DESC
  `).map((row) => ({
    employeeId: row.employeeId,
    reviewDate: row.reviewDate,
    score: Number(row.score) || 0,
    rating: row.rating,
    recommendation: row.recommendation,
    status: row.status,
  }));
}

export function runProbationCycle(
  deps: OrgServiceDeps,
  actor: User,
  today = localDateString()
): string[] {
  const { db } = deps;
  const employees = db.query<{ id: string; probationEndDate: string }>(`
    SELECT id, probation_end_date AS probationEndDate
    FROM employees
    WHERE is_active = 1 AND status IN ('PROBATION', 'ACTIVE')
      AND probation_end_date IS NOT NULL AND probation_end_date <= ?
  `, [today]);
  const created: string[] = [];
  for (const employee of employees) {
    const existing = db.query<{ id: string }>(
      `SELECT id FROM employee_probation_reviews WHERE employee_id = ? AND review_date >= ?`,
      [employee.id, employee.probationEndDate]
    );
    if (existing.length) continue;
    const review = createProbationReview(deps, actor, {
      employeeId: employee.id,
      reviewDate: employee.probationEndDate,
      score: 0,
      rating: 'SATISFACTORY',
      recommendation: 'CONTINUE',
      notes: 'تقييم تلقائي (period probation)',
      status: 'DRAFT',
    });
    created.push(review.id);
  }
  audit(deps, actor, 'تشغيل دورة تقييم فترة الاختبار', 'SYSTEM', { created: created.length, today });
  return created;
}
